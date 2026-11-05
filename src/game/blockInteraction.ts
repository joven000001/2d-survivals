import { BLOCK_CONFIGS, INTERACTION_RANGE_BLOCKS, ITEM_TO_TILE, ItemType, ToolTier } from './blocks';
import { TILE_SIZE } from './constants';
import { Camera, Player, TileType } from './types';
import { ChunkManager } from './chunkManager';
import { Inventory } from './inventory';
import { sound } from './audio';
import { getMiningToolProfile } from './toolMining';

export interface TargetInfo {
  blockX: number;
  blockY: number;
  tile: TileType;
  inRange: boolean;
  distanceBlocks: number;
}

function isTillableTile(tile: TileType): boolean {
  return tile === TileType.DIRT || tile === TileType.GRASS || tile === TileType.SKY_DIRT || tile === TileType.SKY_GRASS;
}

export class BlockInteraction {
  public mouseScreenX: number = 0;
  public mouseScreenY: number = 0;
  public isLeftDown: boolean = false;
  public isRightDown: boolean = false;
  public isCreative: boolean = false;

  // Mining state
  public currentTargetX: number = 0;
  public currentTargetY: number = 0;
  public miningProgress: number = 0; // 0.0 to 1.0
  public isMining: boolean = false;
  public swingTimer = 0;
  public swingKind: 'pickaxe' | 'axe' | 'sword' | 'hoe' | null = null;
  public swingTier: ToolTier | null = null;
  public swingTargetX = 0;
  public swingTargetY = 0;
  private swingCooldown = 0;
  private miningHitTimer = 0;
  private lastToolRequirementKey: string = '';
  private lastTillTargetKey: string = '';

  public onBlockMined?: (blockX: number, blockY: number, dropItem: ItemType | null) => void;
  public onBlockPlaced?: (blockX: number, blockY: number, tile: TileType) => void;
  public onTillDirt?: (blockX: number, blockY: number) => void;
  public onToolRequirement?: (message: string) => void;

  public updateMousePosition(screenX: number, screenY: number) {
    this.mouseScreenX = screenX;
    this.mouseScreenY = screenY;
  }

  public useSelectedHoe(player: Player, camera: Camera, chunkManager: ChunkManager, inventory: Inventory, dpr: number = 1): boolean {
    if (inventory.getSelectedSlot()?.toolKind !== 'hoe') return false;
    const target = this.getTargetInfo(player, camera, chunkManager, dpr);
    this.isMining = false;
    this.miningProgress = 0;
    if (!target.inRange || !isTillableTile(target.tile)) return true;

    this.triggerSwing('hoe', target.blockX * TILE_SIZE + TILE_SIZE / 2, target.blockY * TILE_SIZE + TILE_SIZE / 2);
    this.onTillDirt?.(target.blockX, target.blockY);
    return true;
  }

  // Calculate targeted block in world coordinates (taking camera.zoom into account)
  public getTargetInfo(player: Player, camera: Camera, chunkManager: ChunkManager, _dpr: number = 1): TargetInfo {
    const zoom = camera.zoom || 1;
    const worldPixelX = camera.x + this.mouseScreenX / zoom;
    const worldPixelY = camera.y + this.mouseScreenY / zoom;

    let blockX = Math.floor(worldPixelX / TILE_SIZE);
    let blockY = Math.floor(worldPixelY / TILE_SIZE);

    let tile = chunkManager.getTile(blockX, blockY);
    if (tile === TileType.AIR) {
      const belowTile = chunkManager.getTile(blockX, blockY + 1);
      if (
        belowTile === TileType.DOOR ||
        belowTile === TileType.DOOR_OPEN ||
        belowTile === TileType.GATE ||
        belowTile === TileType.GATE_OPEN
      ) {
        blockY += 1;
        tile = belowTile;
      }
    }

    // Distance from player center to block center
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const blockCenterX = blockX * TILE_SIZE + TILE_SIZE / 2;
    const blockCenterY = blockY * TILE_SIZE + TILE_SIZE / 2;

    const distPixels = Math.hypot(blockCenterX - playerCenterX, blockCenterY - playerCenterY);
    const distanceBlocks = distPixels / TILE_SIZE;
    const inRange = distanceBlocks <= INTERACTION_RANGE_BLOCKS;

    return {
      blockX,
      blockY,
      tile,
      inRange,
      distanceBlocks,
    };
  }

  public update(
    dt: number,
    player: Player,
    camera: Camera,
    chunkManager: ChunkManager,
    dpr: number,
    inventory?: Inventory
  ) {
    this.swingTimer = Math.max(0, this.swingTimer - dt);
    this.swingCooldown = Math.max(0, this.swingCooldown - dt);
    const target = this.getTargetInfo(player, camera, chunkManager, dpr);
    const config = BLOCK_CONFIGS[target.tile];
    const selected = inventory?.getSelectedSlot() ?? null;

    if (!this.isLeftDown) this.lastTillTargetKey = '';
    if (this.isLeftDown && selected?.toolKind === 'hoe') {
      this.isMining = false;
      this.miningProgress = 0;
      if (!target.inRange || !isTillableTile(target.tile)) {
        this.lastTillTargetKey = '';
        return;
      }
      const targetKey = `${target.blockX},${target.blockY}`;
      if (targetKey !== this.lastTillTargetKey) {
        this.lastTillTargetKey = targetKey;
        this.triggerSwing('hoe', target.blockX * TILE_SIZE + TILE_SIZE / 2, target.blockY * TILE_SIZE + TILE_SIZE / 2);
        this.onTillDirt?.(target.blockX, target.blockY);
      }
      return;
    }

    // Left click mining
    if (this.isLeftDown && target.inRange && target.tile !== TileType.AIR) {
      if (this.isCreative) {
        this.isMining = false;
        this.miningProgress = 0;
        this.currentTargetX = target.blockX;
        this.currentTargetY = target.blockY;
        sound.playBlockBreak(target.tile);
        this.onBlockMined?.(target.blockX, target.blockY, config?.dropItem ?? null);
        return;
      }
      if (target.tile === TileType.BEDROCK) {
        this.isMining = false;
        this.miningProgress = 0;
        const key = `${target.blockX},${target.blockY}:bedrock`;
        if (key !== this.lastToolRequirementKey) {
          this.onToolRequirement?.('Bedrock cannot be mined');
          this.lastToolRequirementKey = key;
        }
        return;
      }
    }
    if (this.isLeftDown && target.inRange && config && config.isMineable && target.tile !== TileType.AIR) {
      const profile = getMiningToolProfile(target.tile, selected, inventory);
      if (!profile.allowed) {
        this.currentTargetX = target.blockX;
        this.currentTargetY = target.blockY;
        this.isMining = false;
        this.miningProgress = 0;
        const key = `${target.blockX},${target.blockY}:${profile.requiredToolName}`;
        if (key !== this.lastToolRequirementKey && profile.requiredToolName) {
          this.onToolRequirement?.(`Requires ${profile.requiredToolName}`);
          this.lastToolRequirementKey = key;
        }
        return;
      }
      this.lastToolRequirementKey = '';
      const activeToolKind = profile.effectiveToolKind ?? (selected?.toolKind && selected.toolKind !== 'sword' ? selected.toolKind : undefined);
      const activeToolTier = profile.effectiveToolTier ?? selected?.toolTier ?? null;
      if (activeToolKind && this.swingCooldown <= 0 &&
          (activeToolKind === 'pickaxe' || (activeToolKind === 'axe' && isWoodTile(target.tile)))) {
        this.triggerSwing(activeToolKind, target.blockX * TILE_SIZE + TILE_SIZE / 2, target.blockY * TILE_SIZE + TILE_SIZE / 2, activeToolTier);
      }
      if (this.currentTargetX === target.blockX && this.currentTargetY === target.blockY) {
        // Continue mining current block
        this.isMining = true;
        const titanMultiplier = player.activeBuffs?.some((b) => b.id === 'titan') ? 2.0 : 1.0;
        const speed = (config.miningTime > 0 ? 1 / config.miningTime : 10) * profile.speedMultiplier * titanMultiplier;
        this.miningProgress += dt * speed;
        this.miningHitTimer -= dt;

        if (this.miningHitTimer <= 0) {
          this.miningHitTimer = 0.28;
          sound.playBlockMineHit(target.tile, this.miningProgress);
        }

        if (this.miningProgress >= 1.0) {
          // Block breaks!
          this.miningProgress = 0;
          this.isMining = false;
          this.miningHitTimer = 0;
          sound.playBlockBreak(target.tile); // Distinct material shatter/crumble sound
          this.onBlockMined?.(target.blockX, target.blockY, config.dropItem);
        }
      } else {
        // Switched target block: reset progress
        this.currentTargetX = target.blockX;
        this.currentTargetY = target.blockY;
        this.miningProgress = 0;
        this.isMining = true;
        this.miningHitTimer = 0.28;
        sound.playBlockMineHit(target.tile, 0);
      }
    } else {
      // Not holding left or out of range or on air
      this.isMining = false;
      this.miningProgress = 0;
      this.miningHitTimer = 0;
      this.lastToolRequirementKey = '';
    }
  }

  public triggerSwing(kind: 'pickaxe'|'axe'|'sword'|'hoe', targetX: number, targetY: number, tier: ToolTier | null = null) {
    this.swingKind = kind;
    this.swingTier = tier;
    this.swingTimer = 0.2;
    this.swingCooldown = kind === 'sword' ? 0 : 0.34;
    this.swingTargetX = targetX;
    this.swingTargetY = targetY;
  }

  // Handle right-click block placement
  public handleRightClick(
    player: Player,
    camera: Camera,
    chunkManager: ChunkManager,
    inventory: Inventory,
    dpr: number
  ): boolean {
    const target = this.getTargetInfo(player, camera, chunkManager, dpr);
    if (!target.inRange) return false;

    const selectedSlot = inventory.getSelectedSlot();
    if (!selectedSlot || selectedSlot.count <= 0) return false;

    let placeX = target.blockX;
    let placeY = target.blockY;

    // If right clicked on solid block, find adjacent air position closest to click point
    if (target.tile !== TileType.AIR) {
      const zoom = camera.zoom || 1;
      const clickWorldX = camera.x + this.mouseScreenX / zoom;
      const clickWorldY = camera.y + this.mouseScreenY / zoom;
      const relX = (clickWorldX - target.blockX * TILE_SIZE) / TILE_SIZE; // 0 to 1
      const relY = (clickWorldY - target.blockY * TILE_SIZE) / TILE_SIZE;

      // Determine closest adjacent block face
      const dLeft = relX;
      const dRight = 1 - relX;
      const dTop = relY;
      const dBottom = 1 - relY;
      const minD = Math.min(dLeft, dRight, dTop, dBottom);

      if (minD === dLeft) placeX -= 1;
      else if (minD === dRight) placeX += 1;
      else if (minD === dTop) placeY -= 1;
      else if (minD === dBottom) placeY += 1;
    }

    // Target place location must be AIR
    const currentPlaceTile = chunkManager.getTile(placeX, placeY);
    if (currentPlaceTile !== TileType.AIR) return false;

    // Check player body intersection
    const blockLeft = placeX * TILE_SIZE;
    const blockRight = blockLeft + TILE_SIZE;
    const blockTop = placeY * TILE_SIZE;
    const blockBottom = blockTop + TILE_SIZE;

    const playerLeft = player.x;
    const playerRight = player.x + player.width;
    const playerTop = player.y;
    const playerBottom = player.y + player.height;

    const overlapsPlayer =
      playerLeft < blockRight &&
      playerRight > blockLeft &&
      playerTop < blockBottom &&
      playerBottom > blockTop;

    if (overlapsPlayer) return false;

    // Convert item to tile and place
    if (!selectedSlot.type) return false;
    const tileToPlace = ITEM_TO_TILE[selectedSlot.type];
    if (tileToPlace === undefined) return false;

    if (this.isCreative) {
      sound.playBlockPlace(tileToPlace);
      this.onBlockPlaced?.(placeX, placeY, tileToPlace);
      return true;
    }

    if (inventory.consumeItem(selectedSlot.type, 1)) {
      sound.playBlockPlace(tileToPlace); // Material-specific placement sound
      this.onBlockPlaced?.(placeX, placeY, tileToPlace);
      return true;
    }

    return false;
  }
}

function isWoodTile(tile: TileType): boolean {
  return tile === TileType.WOOD || tile === TileType.BIRCH_WOOD || tile === TileType.ACACIA_WOOD ||
    tile === TileType.CHERRY_WOOD || tile === TileType.PALM_WOOD || tile === TileType.CELESTIAL_WOOD;
}
