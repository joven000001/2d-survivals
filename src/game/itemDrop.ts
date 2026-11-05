import { ItemType } from './blocks';
import { TILE_DEFS, TILE_SIZE } from './constants';
import { Camera, Player, TileType } from './types';
import { ChunkManager } from './chunkManager';
import { Inventory } from './inventory';
import { sound } from './audio';
import { getBlockSprite, getItemTileType } from './blockArt';

export interface DroppedItem {
  id: number;
  type: ItemType;
  x: number; // World pixel X
  y: number; // World pixel Y
  vx: number;
  vy: number;
  count: number;
  width: number;
  height: number;
  isGrounded: boolean;
  lifetime: number; // seconds
  pickupDelay: number; // seconds before item can be picked up
  bobTimer: number;
}

export const MAX_ACTIVE_DROPS = 100;
export const PICKUP_RADIUS_PIXELS = 22; // ~1.37 blocks
export const MAGNET_RADIUS_PIXELS = 56; // ~3.5 blocks
export const MERGE_RADIUS_PIXELS = 18;

export class ItemDropManager {
  public drops: DroppedItem[] = [];
  public onPickup?: (dropId: number, type: ItemType, count: number) => void;
  public onLocalPickup?: (type: ItemType, count: number) => void;
  public onDropSpawned?: (drop: DroppedItem) => void;
  public pendingPickups = new Set<number>();
  private nextId: number = 1;

  public removeDropById(dropId: number) {
    this.pendingPickups.delete(dropId);
    const index = this.drops.findIndex((d) => d.id === dropId);
    if (index >= 0) {
      sound.playItemPickup();
      this.drops.splice(index, 1);
    }
  }

  public addSynchronizedDrop(
    id: number,
    type: ItemType,
    x: number,
    y: number,
    count: number = 1,
    pickupDelay: number = 0.1,
  ) {
    if (this.drops.some((d) => d.id === id)) return;
    this.drops.push({
      id,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      count,
      width: 12,
      height: 12,
      isGrounded: false,
      lifetime: 0,
      pickupDelay: Math.max(0, pickupDelay),
      bobTimer: 0,
    });
  }

  public spawnDrop(type: ItemType, worldPixelX: number, worldPixelY: number, count: number = 1) {
    if (this.onDropSpawned) {
      this.onDropSpawned({
        id: 0,
        type,
        x: worldPixelX,
        y: worldPixelY,
        vx: 0,
        vy: 0,
        count,
        width: 12,
        height: 12,
        isGrounded: false,
        lifetime: 0,
        pickupDelay: 0.35,
        bobTimer: 0,
      });
      return;
    }
    // If approaching max drop limit, try to merge immediately into nearby identical drop
    if (this.drops.length >= MAX_ACTIVE_DROPS) {
      for (const existing of this.drops) {
        if (existing.type === type && Math.hypot(existing.x - worldPixelX, existing.y - worldPixelY) < 32) {
          existing.count += count;
          return;
        }
      }
      // If still at limit, remove the oldest drop
      if (this.drops.length >= MAX_ACTIVE_DROPS) {
        this.drops.shift();
      }
    }

    // Small random outward burst
    const vx = (Math.random() - 0.5) * 70;
    const vy = -110 - Math.random() * 60;

    this.drops.push({
      id: this.nextId++,
      type,
      x: worldPixelX,
      y: worldPixelY,
      vx,
      vy,
      count,
      width: 12,
      height: 12,
      isGrounded: false,
      lifetime: 0,
      pickupDelay: 0.35, // 0.35s delay before pickup allowed
      bobTimer: Math.random() * Math.PI * 2,
    });
  }

  public update(
    dt: number,
    player: Player,
    chunkManager: ChunkManager,
    inventory: Inventory
  ) {
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.lifetime += dt;
      drop.bobTimer += dt * 3;
      if (drop.pickupDelay > 0) {
        drop.pickupDelay = Math.max(0, drop.pickupDelay - dt);
      }

      // 1. Distance check to player
      const dropCenterX = drop.x + drop.width / 2;
      const dropCenterY = drop.y + drop.height / 2;
      const distToPlayer = Math.hypot(playerCenterX - dropCenterX, playerCenterY - dropCenterY);

      // 2. Collection
      if (distToPlayer <= PICKUP_RADIUS_PIXELS && drop.pickupDelay <= 0) {
        if (this.onPickup) {
          if (!this.pendingPickups.has(drop.id)) {
            this.pendingPickups.add(drop.id);
            this.onPickup(drop.id, drop.type, drop.count);
          }
        } else if (inventory.addItem(drop.type, drop.count)) {
          sound.playItemPickup();
          this.onLocalPickup?.(drop.type, drop.count);
          this.drops.splice(i, 1);
          continue;
        }
      }

      // 3. Gentle magnetic attraction toward player when close
      if (distToPlayer <= MAGNET_RADIUS_PIXELS && drop.pickupDelay <= 0) {
        const pullSpeed = 160 + (1 - distToPlayer / MAGNET_RADIUS_PIXELS) * 120;
        const dirX = (playerCenterX - dropCenterX) / distToPlayer;
        const dirY = (playerCenterY - dropCenterY) / distToPlayer;

        drop.vx += dirX * pullSpeed * dt * 4;
        drop.vy += dirY * pullSpeed * dt * 4;
      } else {
        // Normal Gravity
        drop.vy = Math.min(380, drop.vy + 650 * dt);
      }

      // 4. Horizontal Movement & Solid Collision
      drop.x += drop.vx * dt;
      const tileLeft = Math.floor(drop.x / TILE_SIZE);
      const tileRight = Math.floor((drop.x + drop.width) / TILE_SIZE);
      const tileTop = Math.floor(drop.y / TILE_SIZE);
      const tileBottom = Math.floor((drop.y + drop.height) / TILE_SIZE);

      if (drop.vx > 0) {
        for (let ty = tileTop; ty <= tileBottom; ty++) {
          const tile = chunkManager.getTile(tileRight, ty);
          if (TILE_DEFS[tile]?.isSolid) {
            drop.x = tileRight * TILE_SIZE - drop.width - 0.1;
            drop.vx = -drop.vx * 0.35;
            break;
          }
        }
      } else if (drop.vx < 0) {
        for (let ty = tileTop; ty <= tileBottom; ty++) {
          const tile = chunkManager.getTile(tileLeft, ty);
          if (TILE_DEFS[tile]?.isSolid) {
            drop.x = (tileLeft + 1) * TILE_SIZE + 0.1;
            drop.vx = -drop.vx * 0.35;
            break;
          }
        }
      }

      // 5. Vertical Movement & Solid Collision
      drop.y += drop.vy * dt;
      const vTileLeft = Math.floor(drop.x / TILE_SIZE);
      const vTileRight = Math.floor((drop.x + drop.width) / TILE_SIZE);
      const vTileTop = Math.floor(drop.y / TILE_SIZE);
      const vTileBottom = Math.floor((drop.y + drop.height) / TILE_SIZE);

      drop.isGrounded = false;

      if (drop.vy > 0) {
        for (let tx = vTileLeft; tx <= vTileRight; tx++) {
          const tile = chunkManager.getTile(tx, vTileBottom);
          if (TILE_DEFS[tile]?.isSolid) {
            drop.y = vTileBottom * TILE_SIZE - drop.height;
            drop.vy = -drop.vy * 0.3; // bounce
            if (Math.abs(drop.vy) < 25) {
              drop.vy = 0;
              drop.isGrounded = true;
            }
            break;
          }
        }
      } else if (drop.vy < 0) {
        for (let tx = vTileLeft; tx <= vTileRight; tx++) {
          const tile = chunkManager.getTile(tx, vTileTop);
          if (TILE_DEFS[tile]?.isSolid) {
            drop.y = (vTileTop + 1) * TILE_SIZE;
            drop.vy = 0;
            break;
          }
        }
      }

      // Ground friction
      if (drop.isGrounded) {
        drop.vx *= Math.pow(0.01, dt);
        if (Math.abs(drop.vx) < 5) drop.vx = 0;
      }

      // 6. Cleanup if far outside active chunk bounds
      const distFromPlayerX = Math.abs(drop.x - player.x);
      const distFromPlayerY = Math.abs(drop.y - player.y);
      if (distFromPlayerX > 3200 || distFromPlayerY > 2000 || drop.lifetime > 300) {
        this.drops.splice(i, 1);
        continue;
      }
    }

    // 7. Stacking / Merging identical drops nearby
    this.mergeNearbyDrops();
  }

  // Merge nearby identical drops to conserve physics objects and FPS
  private mergeNearbyDrops() {
    for (let i = 0; i < this.drops.length; i++) {
      const a = this.drops[i];
      if (!a.isGrounded) continue;

      for (let j = this.drops.length - 1; j > i; j--) {
        const b = this.drops[j];
        if (!b.isGrounded || a.type !== b.type) continue;

        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist <= MERGE_RADIUS_PIXELS) {
          a.count += b.count;
          this.drops.splice(j, 1);
        }
      }
    }
  }

  // Render drops in camera space with pixel-art visuals and quantity badge
  public render(ctx: CanvasRenderingContext2D, camera: Camera) {
    if (this.drops.length === 0) return;

    const viewLeft = camera.x;
    const viewRight = camera.x + camera.width;
    const viewTop = camera.y;
    const viewBottom = camera.y + camera.height;

    let fontConfigured = false;

    for (const drop of this.drops) {
      // Viewport culling
      if (
        drop.x + drop.width < viewLeft ||
        drop.x > viewRight ||
        drop.y + drop.height < viewTop ||
        drop.y > viewBottom
      ) {
        continue;
      }

      const drawX = Math.floor(drop.x);
      // Gentle floating bob when resting on ground
      const bob = drop.isGrounded ? Math.sin(drop.bobTimer) * 1.5 : 0;
      const drawY = Math.floor(drop.y + bob);

      // Consistent inked edge and shadow make every pickup read clearly at 12x12 size
      ctx.fillStyle = 'rgba(5,12,15,.42)';
      ctx.fillRect(drawX - 1, drawY + 11, 14, 3);
      ctx.fillStyle = '#1b2528';
      ctx.fillRect(drawX - 1, drawY - 1, 14, 14);

      const tileForItem = getItemTileType(drop.type);
      const blockSprite = tileForItem !== null ? getBlockSprite(tileForItem, 0) : null;
      if (blockSprite) {
        ctx.drawImage(blockSprite, drawX, drawY, 12, 12);
      } else {
      // Drop item pixel representation
      switch (drop.type) {
        case 'dirt':
          ctx.fillStyle = '#854d0e';
          ctx.fillRect(drawX, drawY, 8, 8);
          ctx.fillStyle = '#a16207';
          ctx.fillRect(drawX + 1, drawY + 1, 3, 2);
          ctx.fillStyle = '#713f12';
          ctx.fillRect(drawX + 4, drawY + 5, 3, 2);
          break;

        case 'stone':
          ctx.fillStyle = '#64748b';
          ctx.fillRect(drawX, drawY, 8, 8);
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(drawX + 1, drawY + 1, 3, 2);
          ctx.fillStyle = '#475569';
          ctx.fillRect(drawX + 3, drawY + 4, 4, 1);
          break;

        case 'wood':
          ctx.fillStyle = '#78350f';
          ctx.fillRect(drawX, drawY, 8, 8);
          ctx.fillStyle = '#92400e';
          ctx.fillRect(drawX + 2, drawY + 1, 2, 6);
          ctx.fillStyle = '#451a03';
          ctx.fillRect(drawX + 5, drawY + 2, 2, 4);
          break;

        case 'leaves':
          ctx.fillStyle = '#15803d';
          ctx.fillRect(drawX, drawY, 8, 8);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(drawX + 1, drawY + 1, 3, 3);
          ctx.fillStyle = '#166534';
          ctx.fillRect(drawX + 4, drawY + 4, 3, 3);
          break;

        case 'sand': case 'sandstone': case 'snow': case 'snowy_dirt': case 'birch_wood': case 'birch_leaves': case 'cactus': {
          const colors: Record<string, [string, string, string]> = {
            sand: ['#e7c873', '#f5e3a2', '#c4a24e'], sandstone: ['#c2a56b', '#dfc68f', '#967b4b'],
            snow: ['#f8fafc', '#ffffff', '#cbd5e1'], snowy_dirt: ['#8b8d83', '#b8baae', '#62675f'],
            birch_wood: ['#d6d3c1', '#f5f5e8', '#78716c'], birch_leaves: ['#65a30d', '#a3e635', '#3f6212'],
            cactus: ['#15803d', '#4ade80', '#14532d'],
          };
          const [base, light, dark] = colors[drop.type];
          ctx.fillStyle = base; ctx.fillRect(drawX, drawY, 8, 8);
          ctx.fillStyle = light; ctx.fillRect(drawX + 1, drawY + 1, 3, 2);
          ctx.fillStyle = dark; ctx.fillRect(drawX + 4, drawY + 5, 3, 2);
          break;
        }

        case 'gel':
          ctx.fillStyle = '#10b981';
          ctx.fillRect(drawX + 1, drawY, 6, 8);
          ctx.fillRect(drawX, drawY + 1, 8, 6);
          ctx.fillStyle = '#6ee7b7';
          ctx.fillRect(drawX + 2, drawY + 1, 2, 2);
          ctx.fillStyle = '#047857';
          ctx.fillRect(drawX + 2, drawY + 5, 4, 2);
          break;

        case 'coal': case 'copper': case 'iron': case 'gold': case 'crystal': case 'diamond': {
          const colors: Record<string, [string, string, string]> = {
            coal: ['#343a40', '#777f84', '#171b20'], copper: ['#a65f3e', '#e2a06e', '#613e34'],
            iron: ['#9b8977', '#ded0b9', '#5b6267'], gold: ['#c69b38', '#ffe18a', '#745a28'],
            crystal: ['#8069bd', '#d7c8ff', '#493d70'], diamond: ['#53a6a1', '#c3fff4', '#315e65'],
          };
          const [base, light, dark] = colors[drop.type];
          ctx.fillStyle = dark; ctx.fillRect(drawX, drawY, 8, 8);
          ctx.fillStyle = base; ctx.fillRect(drawX + 1, drawY + 1, 6, 6);
          ctx.fillStyle = light; ctx.fillRect(drawX + 2, drawY + 2, 3, 2);
          ctx.fillRect(drawX + 5, drawY + 5, 2, 2);
          break;
        }

        case 'copper_bar': case 'iron_bar': case 'gold_bar': {
          const barColors: Record<string, [string, string, string]> = {
            copper_bar: ['#ea580c', '#fdba74', '#7c2d12'],
            iron_bar: ['#cbd5e1', '#ffffff', '#475569'],
            gold_bar: ['#eab308', '#fef08a', '#713f12'],
          };
          const [mid, shine, dark] = barColors[drop.type];
          ctx.fillStyle = dark;
          ctx.fillRect(drawX, drawY + 2, 12, 7);
          ctx.fillStyle = mid;
          ctx.fillRect(drawX + 1, drawY + 3, 10, 5);
          ctx.fillStyle = shine;
          ctx.fillRect(drawX + 2, drawY + 3, 8, 2);
          break;
        }

        case 'venison':
          ctx.fillStyle = '#881337'; ctx.fillRect(drawX + 2, drawY + 1, 5, 6);
          ctx.fillStyle = '#be123c'; ctx.fillRect(drawX + 3, drawY + 2, 3, 2);
          ctx.fillStyle = '#f8fafc'; ctx.fillRect(drawX, drawY + 5, 2, 2);
          break;

        case 'rabbit_meat':
          ctx.fillStyle = '#e11d48'; ctx.fillRect(drawX + 2, drawY + 2, 4, 5);
          ctx.fillStyle = '#fb7185'; ctx.fillRect(drawX + 3, drawY + 3, 2, 2);
          ctx.fillStyle = '#f8fafc'; ctx.fillRect(drawX + 1, drawY + 5, 2, 2);
          break;

        case 'boar_meat':
          ctx.fillStyle = '#fef08a'; ctx.fillRect(drawX + 1, drawY + 1, 6, 6);
          ctx.fillStyle = '#991b1b'; ctx.fillRect(drawX + 2, drawY + 2, 4, 4);
          ctx.fillStyle = '#dc2626'; ctx.fillRect(drawX + 3, drawY + 2, 2, 2);
          break;

        case 'fox_meat':
          ctx.fillStyle = '#ea580c'; ctx.fillRect(drawX + 1, drawY + 2, 6, 5);
          ctx.fillStyle = '#f97316'; ctx.fillRect(drawX + 2, drawY + 3, 3, 2);
          break;

        case 'bird_meat':
          ctx.fillStyle = '#ea580c'; ctx.fillRect(drawX + 2, drawY + 1, 5, 5);
          ctx.fillStyle = '#fb923c'; ctx.fillRect(drawX + 3, drawY + 2, 3, 3);
          ctx.fillStyle = '#f8fafc'; ctx.fillRect(drawX, drawY + 4, 2, 2);
          break;

        case 'fish':
          ctx.fillStyle = '#06b6d4'; ctx.fillRect(drawX + 2, drawY + 3, 7, 5);
          ctx.fillStyle = '#0891b2'; ctx.fillRect(drawX, drawY + 3, 2, 5);
          ctx.fillStyle = '#67e8f9'; ctx.fillRect(drawX + 4, drawY + 4, 4, 2);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(drawX + 8, drawY + 3, 1, 1);
          break;

        default: {
          // Tools, swords, sticks, seeds, and crafted items
          ctx.fillStyle = '#334155';
          ctx.fillRect(drawX, drawY, 12, 12);
          ctx.fillStyle = '#92400e';
          ctx.fillRect(drawX + 2, drawY + 7, 4, 3);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(drawX + 5, drawY + 2, 5, 5);
          ctx.fillStyle = '#fef9c3';
          ctx.fillRect(drawX + 6, drawY + 3, 3, 2);
          break;
        }
      }
      }

      // Quantity number label if stack > 1
      if (drop.count > 1) {
        if (!fontConfigured) {
          ctx.font = '8px monospace';
          fontConfigured = true;
        }
        ctx.fillStyle = '#000000';
        ctx.fillText(`${drop.count}`, drawX + 7, drawY - 1);
        ctx.fillStyle = '#fef08a';
        ctx.fillText(`${drop.count}`, drawX + 6, drawY - 2);
      }
    }
  }
}
