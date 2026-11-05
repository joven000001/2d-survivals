import { ChunkManager } from './chunkManager';
import { TILE_DEFS, TILE_SIZE } from './constants';
import { Camera, DayNightCycle, Player, TileType } from './types';
import { ItemDropManager } from './itemDrop';
import { sound } from './audio';

export interface Enemy {
  id: number;
  type: 'slime';
  x: number; // World pixel X
  y: number; // World pixel Y
  vx: number;
  vy: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  damage: number;
  isGrounded: boolean;
  facingRight: boolean;
  state: 'idle' | 'chase' | 'attack';
  attackCooldown: number;
  damageFlashTimer: number;
  jumpCooldown: number;
  animTimer: number;
}

export interface DamageNumber {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export const MAX_ENEMIES = 3;
export const ENEMY_ATTACK_COOLDOWN = 1.0; // 1 second cooldown
export const SLIME_CHASE_DISTANCE = 12 * TILE_SIZE; // 12 blocks = 192px
export const SLIME_ATTACK_DISTANCE = 1.25 * TILE_SIZE; // ~20px
export const SLIME_DESPAWN_DISTANCE = 45 * TILE_SIZE; // 720px

export class EnemyManager {
  public enemies: Enemy[] = [];
  public damageNumbers: DamageNumber[] = [];
  private nextEnemyId: number = 1;
  private nextDamageId: number = 1;
  private spawnCheckTimer: number = 0;

  public clear() {
    this.enemies = [];
    this.damageNumbers = [];
  }

  public spawnSlime(worldPixelX: number, worldPixelY: number, force = false): Enemy | null {
    if (!force && this.enemies.length >= MAX_ENEMIES) return null;

    const slime: Enemy = {
      id: this.nextEnemyId++,
      type: 'slime',
      x: worldPixelX,
      y: worldPixelY,
      vx: 0,
      vy: 0,
      width: 14,
      height: 12,
      health: 30,
      maxHealth: 30,
      damage: 10,
      isGrounded: false,
      facingRight: false,
      state: 'idle',
      attackCooldown: 0.5,
      damageFlashTimer: 0,
      jumpCooldown: 0.5,
      animTimer: Math.random() * Math.PI * 2,
    };

    this.enemies.push(slime);
    return slime;
  }

  public addDamageNumber(worldPixelX: number, worldPixelY: number, text: string, color: string = '#fef08a') {
    this.damageNumbers.push({
      id: this.nextDamageId++,
      x: worldPixelX + (Math.random() - 0.5) * 6,
      y: worldPixelY,
      text,
      color,
      life: 0,
      maxLife: 0.65,
    });
  }

  public update(
    dt: number,
    player: Player,
    chunkManager: ChunkManager,
    cycle: DayNightCycle,
    itemDropManager: ItemDropManager,
    onPlayerDamage: (damage: number, sourceX: number, sourceY: number) => void,
    allowSpawning: boolean = true
  ) {
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const playerTileX = Math.floor(player.x / TILE_SIZE);
    const surfaceY = chunkManager.terrainGen.getSurfaceHeight(playerTileX);
    const isUnderground = Math.floor(player.y / TILE_SIZE) > surfaceY + 6;
    const isNight = cycle.ambientLight < 0.55;

    // 1. Spawning system (reduced spawn rate for jellies so animals and wildlife flourish)
    this.spawnCheckTimer += dt;
    if (allowSpawning && this.spawnCheckTimer >= 6.5 && this.enemies.length < MAX_ENEMIES) {
      this.spawnCheckTimer = 0;

      // Decide if spawn condition is met (much rarer during daytime and overall reduced)
      const shouldSpawn =
        (isNight && Math.random() < 0.16) ||
        (isUnderground && Math.random() < 0.20) ||
        Math.random() < 0.015;

      if (shouldSpawn) {
        // Choose spawn offset 12 to 26 blocks left or right
        const side = Math.random() > 0.5 ? 1 : -1;
        const blockDistance = 12 + Math.floor(Math.random() * 14);
        const spawnBlockX = playerTileX + side * blockDistance;

        // Determine ground elevation at target X
        let spawnBlockY = chunkManager.terrainGen.getSurfaceHeight(spawnBlockX);
        if (isUnderground) {
          spawnBlockY = Math.floor(player.y / TILE_SIZE) + Math.floor((Math.random() - 0.5) * 6);
        }

        // Search down for a solid block with air above
        let valid = false;
        for (let checkY = spawnBlockY - 2; checkY <= spawnBlockY + 6; checkY++) {
          const tileBelow = chunkManager.getTile(spawnBlockX, checkY + 1);
          const tileHere = chunkManager.getTile(spawnBlockX, checkY);
          const tileAbove = chunkManager.getTile(spawnBlockX, checkY - 1);

          if (TILE_DEFS[tileBelow]?.isSolid && tileHere === TileType.AIR && tileAbove === TileType.AIR) {
            this.spawnSlime(spawnBlockX * TILE_SIZE + 1, checkY * TILE_SIZE + 4);
            valid = true;
            break;
          }
        }
      }
    }

    // 2. Update existing enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.animTimer += dt * 4;

      if (enemy.damageFlashTimer > 0) {
        enemy.damageFlashTimer = Math.max(0, enemy.damageFlashTimer - dt);
      }
      if (enemy.attackCooldown > 0) {
        enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      }
      if (enemy.jumpCooldown > 0) {
        enemy.jumpCooldown = Math.max(0, enemy.jumpCooldown - dt);
      }

      const enemyCenterX = enemy.x + enemy.width / 2;
      const enemyCenterY = enemy.y + enemy.height / 2;
      const distX = playerCenterX - enemyCenterX;
      const distY = playerCenterY - enemyCenterY;
      const dist = Math.hypot(distX, distY);

      // Despawn if far from player
      if (dist > SLIME_DESPAWN_DISTANCE) {
        this.enemies.splice(i, 1);
        continue;
      }

      enemy.facingRight = distX > 0;

      // Simple AI state machine
      if (dist <= SLIME_ATTACK_DISTANCE) {
        enemy.state = 'attack';
        // Attack player if cooldown expired
        if (enemy.attackCooldown <= 0) {
          enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN;
          onPlayerDamage(enemy.damage, enemyCenterX, enemyCenterY);
        }
      } else if (dist <= SLIME_CHASE_DISTANCE) {
        enemy.state = 'chase';
        // Move towards player
        const speed = 48; // Slower than player (player runs at 180)
        enemy.vx = distX > 0 ? speed : -speed;

        // If blocked by obstacle while grounded, hop up
        const checkTileX = Math.floor((enemy.x + (enemy.facingRight ? enemy.width + 2 : -2)) / TILE_SIZE);
        const checkTileY = Math.floor((enemy.y + enemy.height - 2) / TILE_SIZE);
        const obstacleTile = chunkManager.getTile(checkTileX, checkTileY);

        if (TILE_DEFS[obstacleTile]?.isSolid && enemy.isGrounded && enemy.jumpCooldown <= 0) {
          enemy.vy = -260; // hop
          enemy.isGrounded = false;
          enemy.jumpCooldown = 0.55;
        }
      } else {
        enemy.state = 'idle';
        // Slow idle drift / friction
        enemy.vx *= Math.pow(0.05, dt);
        if (Math.abs(enemy.vx) < 4) enemy.vx = 0;
      }

      // Physics: Gravity
      enemy.vy = Math.min(420, enemy.vy + 750 * dt);

      // Horizontal tile collision
      enemy.x += enemy.vx * dt;
      const tileLeft = Math.floor(enemy.x / TILE_SIZE);
      const tileRight = Math.floor((enemy.x + enemy.width) / TILE_SIZE);
      const tileTop = Math.floor(enemy.y / TILE_SIZE);
      const tileBottom = Math.floor((enemy.y + enemy.height) / TILE_SIZE);

      if (enemy.vx > 0) {
        for (let ty = tileTop; ty <= tileBottom; ty++) {
          if (TILE_DEFS[chunkManager.getTile(tileRight, ty)]?.isSolid) {
            enemy.x = tileRight * TILE_SIZE - enemy.width - 0.05;
            enemy.vx = 0;
            break;
          }
        }
      } else if (enemy.vx < 0) {
        for (let ty = tileTop; ty <= tileBottom; ty++) {
          if (TILE_DEFS[chunkManager.getTile(tileLeft, ty)]?.isSolid) {
            enemy.x = (tileLeft + 1) * TILE_SIZE + 0.05;
            enemy.vx = 0;
            break;
          }
        }
      }

      // Vertical tile collision
      enemy.y += enemy.vy * dt;
      const vTileLeft = Math.floor(enemy.x / TILE_SIZE);
      const vTileRight = Math.floor((enemy.x + enemy.width) / TILE_SIZE);
      const vTileTop = Math.floor(enemy.y / TILE_SIZE);
      const vTileBottom = Math.floor((enemy.y + enemy.height) / TILE_SIZE);

      enemy.isGrounded = false;

      if (enemy.vy > 0) {
        for (let tx = vTileLeft; tx <= vTileRight; tx++) {
          if (TILE_DEFS[chunkManager.getTile(tx, vTileBottom)]?.isSolid) {
            enemy.y = vTileBottom * TILE_SIZE - enemy.height;
            enemy.vy = 0;
            enemy.isGrounded = true;
            break;
          }
        }
      } else if (enemy.vy < 0) {
        for (let tx = vTileLeft; tx <= vTileRight; tx++) {
          if (TILE_DEFS[chunkManager.getTile(tx, vTileTop)]?.isSolid) {
            enemy.y = (vTileTop + 1) * TILE_SIZE;
            enemy.vy = 0;
            break;
          }
        }
      }
    }

    // 3. Update floating damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life += dt;
      dn.y -= 26 * dt; // drift upward
      if (dn.life >= dn.maxLife) {
        this.damageNumbers.splice(i, 1);
      }
    }
  }

  // Handle sword attack hitbox against all active enemies
  public handleSwordAttack(
    swordHitbox: { x: number; y: number; width: number; height: number },
    damage: number,
    itemDropManager: ItemDropManager
  ): boolean {
    let hitAny = false;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // AABB overlap check
      const overlaps =
        swordHitbox.x < enemy.x + enemy.width &&
        swordHitbox.x + swordHitbox.width > enemy.x &&
        swordHitbox.y < enemy.y + enemy.height &&
        swordHitbox.y + swordHitbox.height > enemy.y;

      if (overlaps) {
        hitAny = true;
        enemy.health -= damage;
        enemy.damageFlashTimer = 0.18;

        // Knockback away from attack
        const hitFromLeft = swordHitbox.x < enemy.x;
        enemy.vx = hitFromLeft ? 240 : -240;
        enemy.vy = -180;
        enemy.isGrounded = false;

        // Floating damage indicator
        this.addDamageNumber(enemy.x + enemy.width / 2, enemy.y - 4, `${damage}`, '#fde047');
        sound.playEnemyHit();

        // Check death
        if (enemy.health <= 0) {
          // Spawn physical Gel drop
          itemDropManager.spawnDrop('gel', enemy.x + 3, enemy.y + 2, 1);
          this.enemies.splice(i, 1);
        }
      }
    }

    return hitAny;
  }

  // Render slimes & damage numbers directly on Canvas in camera world space
  public render(ctx: CanvasRenderingContext2D, camera: Camera) {
    const viewLeft = camera.x;
    const viewRight = camera.x + camera.width;
    const viewTop = camera.y;
    const viewBottom = camera.y + camera.height;

    // 1. Render Slimes
    for (const enemy of this.enemies) {
      // Viewport culling
      if (
        enemy.x + enemy.width < viewLeft ||
        enemy.x > viewRight ||
        enemy.y + enemy.height < viewTop ||
        enemy.y > viewBottom
      ) {
        continue;
      }

      const drawX = Math.floor(enemy.x);
      const drawY = Math.floor(enemy.y);

      // Subtle squash and stretch
      const bounce = Math.sin(enemy.animTimer) * 1.5;
      const isDamaged = enemy.damageFlashTimer > 0;

      ctx.save();

      // Pixel shadow and a dark outer rim keep the blob readable on grass, water,
      // and cave floors without changing its collision box.
      ctx.fillStyle = 'rgba(8,20,24,.38)';
      ctx.fillRect(drawX + 2, Math.floor(enemy.y + enemy.height - 1), enemy.width - 4, 3);
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(drawX + 1, drawY + 2, enemy.width - 2, enemy.height - 3);
      ctx.fillRect(drawX + 3, drawY + 1, enemy.width - 6, 2);

      // Slime Body (Original cute emerald pixel blob)
      if (isDamaged) {
        ctx.fillStyle = '#ef4444'; // Red damage flash
      } else {
        ctx.fillStyle = '#10b981'; // Vibrant emerald slime
      }

      // Main rounded blob shape
      const w = enemy.width;
      const h = enemy.height + (enemy.isGrounded ? -bounce : bounce);
      ctx.fillRect(drawX + 2, drawY + 1, w - 4, h - 1);
      ctx.fillRect(drawX + 1, drawY + 3, w - 2, h - 4);
      ctx.fillRect(drawX, drawY + 5, w, h - 7);

      // Glossy highlight
      if (!isDamaged) {
        ctx.fillStyle = '#6ee7b7';
        ctx.fillRect(drawX + 3, drawY + 2, 3, 2);
        ctx.fillRect(drawX + 2, drawY + 4, 2, 2);
        ctx.fillStyle = '#a7f3d0';
        ctx.fillRect(drawX + 5, drawY + 2, 2, 1);

        // Core translucency shade
        ctx.fillStyle = '#047857';
        ctx.fillRect(drawX + 3, drawY + h - 4, w - 6, 2);

        // Cute dark eyes facing player
        ctx.fillStyle = '#064e3b';
        const eyeOffset = enemy.facingRight ? 3 : -1;
        ctx.fillRect(drawX + 5 + eyeOffset, drawY + 5, 2, 3);
        ctx.fillRect(drawX + 9 + eyeOffset, drawY + 5, 2, 3);

        // White eye sparkles
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(drawX + 5 + eyeOffset, drawY + 5, 1, 1);
        ctx.fillRect(drawX + 9 + eyeOffset, drawY + 5, 1, 1);
      }

      // Health bar above slime if damaged
      if (enemy.health < enemy.maxHealth) {
        const barWidth = 14;
        const barHeight = 2;
        const barX = drawX;
        const barY = drawY - 5;
        const healthPercent = Math.max(0, enemy.health / enemy.maxHealth);

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
      }

      ctx.restore();
    }

    // 2. Render Floating Damage Numbers
    if (this.damageNumbers.length > 0) {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';

      for (const dn of this.damageNumbers) {
        const alpha = Math.max(0, 1 - dn.life / dn.maxLife);
        ctx.globalAlpha = alpha;

        // Shadow
        ctx.fillStyle = '#000000';
        ctx.fillText(dn.text, Math.floor(dn.x) + 1, Math.floor(dn.y) + 1);

        // Text
        ctx.fillStyle = dn.color;
        ctx.fillText(dn.text, Math.floor(dn.x), Math.floor(dn.y));
      }

      ctx.restore();
    }
  }
}
