import { TileType } from './types';
import { ChunkManager } from './chunkManager';

export interface LiquidMoveEvent {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  tile: TileType;
}

export interface LiquidSolidifyEvent {
  x: number;
  y: number;
  resultTile: TileType;
}

/**
 * High-performance cellular liquid simulation for dynamic water flow in 2D voxel terrain.
 * Supports gravity flow, horizontal spreading/leveling, slope cascades, and water-magma interactions.
 */
export class LiquidSimulation {
  private activeCoords: Set<string> = new Set();
  private pendingCoords: Set<string> = new Set();
  private chunkManager: ChunkManager;
  private tickTimer = 0;
  private readonly TICK_INTERVAL = 0.08; // ~12.5 updates/sec for smooth fluid motion
  private readonly MAX_UPDATES_PER_TICK = 96;

  public onLiquidMove?: (event: LiquidMoveEvent) => void;
  public onLiquidSolidify?: (event: LiquidSolidifyEvent) => void;

  constructor(chunkManager: ChunkManager) {
    this.chunkManager = chunkManager;
  }

  /**
   * Register a block change to wake up surrounding liquid cells.
   */
  public onBlockChanged(x: number, y: number, newTile: TileType) {
    if (newTile === TileType.WATER) {
      this.activeCoords.add(`${x},${y}`);
    }
    // Wake up adjacent liquid cells
    this.wakeNeighbors(x, y);
  }

  public wakeNeighbors(x: number, y: number) {
    const neighbors = [
      [x, y - 1], // Above
      [x - 1, y], // Left
      [x + 1, y], // Right
      [x, y + 1], // Below
    ];
    for (const [nx, ny] of neighbors) {
      if (this.chunkManager.getTile(nx, ny) === TileType.WATER) {
        this.activeCoords.add(`${nx},${ny}`);
      }
    }
  }

  /**
   * Scans a newly loaded or active chunk for boundary water cells that need simulation.
   */
  public scanArea(minX: number, minY: number, maxX: number, maxY: number) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.chunkManager.getTile(x, y) === TileType.WATER) {
          const below = this.chunkManager.getTile(x, y + 1);
          const left = this.chunkManager.getTile(x - 1, y);
          const right = this.chunkManager.getTile(x + 1, y);
          if (below === TileType.AIR || left === TileType.AIR || right === TileType.AIR || below === TileType.MAGMA) {
            this.activeCoords.add(`${x},${y}`);
          }
        }
      }
    }
  }

  /**
   * Step the liquid simulation loop.
   */
  public update(dt: number) {
    this.tickTimer += dt;
    if (this.tickTimer < this.TICK_INTERVAL) return;
    this.tickTimer = 0;

    if (this.activeCoords.size === 0) return;

    const currentCoords = Array.from(this.activeCoords);
    this.activeCoords.clear();

    let updatesProcessed = 0;

    for (const key of currentCoords) {
      if (updatesProcessed >= this.MAX_UPDATES_PER_TICK) {
        this.activeCoords.add(key);
        continue;
      }

      const commaIdx = key.indexOf(',');
      const x = parseInt(key.substring(0, commaIdx), 10);
      const y = parseInt(key.substring(commaIdx + 1), 10);

      const currentTile = this.chunkManager.getTile(x, y);
      if (currentTile !== TileType.WATER) {
        continue;
      }

      updatesProcessed++;

      // 1. GRAVITY: Can water fall down?
      const belowTile = this.chunkManager.getTile(x, y + 1);

      // Water + Magma interaction below
      if (belowTile === TileType.MAGMA) {
        // Solidify magma into obsidian!
        this.chunkManager.setBlock(x, y + 1, TileType.OBSIDIAN);
        this.onLiquidSolidify?.({ x, y: y + 1, resultTile: TileType.OBSIDIAN });
        this.wakeNeighbors(x, y + 1);
        continue;
      }

      if (this.isLiquidPassable(belowTile)) {
        // Fall down!
        this.moveWater(x, y, x, y + 1);
        continue;
      }

      // Check adjacent for magma interaction
      const leftTile = this.chunkManager.getTile(x - 1, y);
      const rightTile = this.chunkManager.getTile(x + 1, y);

      if (leftTile === TileType.MAGMA) {
        this.chunkManager.setBlock(x - 1, y, TileType.OBSIDIAN);
        this.onLiquidSolidify?.({ x: x - 1, y, resultTile: TileType.OBSIDIAN });
        this.wakeNeighbors(x - 1, y);
      }
      if (rightTile === TileType.MAGMA) {
        this.chunkManager.setBlock(x + 1, y, TileType.OBSIDIAN);
        this.onLiquidSolidify?.({ x: x + 1, y, resultTile: TileType.OBSIDIAN });
        this.wakeNeighbors(x + 1, y);
      }

      // 2. HORIZONTAL SPREAD & SLOPE FLOW
      // If water cannot fall directly down, check if it can flow sideways onto a lower step or flat ground
      const leftBelow = this.chunkManager.getTile(x - 1, y + 1);
      const rightBelow = this.chunkManager.getTile(x + 1, y + 1);

      const canLeft = this.isLiquidPassable(leftTile);
      const canRight = this.isLiquidPassable(rightTile);

      // Slope prioritization: if one side has a drop down, prefer flowing in that direction
      const leftHasDrop = canLeft && this.isLiquidPassable(leftBelow);
      const rightHasDrop = canRight && this.isLiquidPassable(rightBelow);

      if (leftHasDrop && !rightHasDrop) {
        this.moveWater(x, y, x - 1, y);
        continue;
      } else if (rightHasDrop && !leftHasDrop) {
        this.moveWater(x, y, x + 1, y);
        continue;
      } else if (leftHasDrop && rightHasDrop) {
        // Both sides drop down: choose randomly or alternate
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.moveWater(x, y, x + dir, y);
        continue;
      }

      // 3. EQUALIZING SPREAD:
      // If there is water above pushing down OR this water has room to spread sideways
      const aboveTile = this.chunkManager.getTile(x, y - 1);
      const hasHeadPressure = aboveTile === TileType.WATER;

      if (canLeft && canRight) {
        // If has head pressure or spread condition:
        if (hasHeadPressure || Math.random() < 0.35) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          this.moveWater(x, y, x + dir, y);
        }
      } else if (canLeft && (hasHeadPressure || Math.random() < 0.35)) {
        this.moveWater(x, y, x - 1, y);
      } else if (canRight && (hasHeadPressure || Math.random() < 0.35)) {
        this.moveWater(x, y, x + 1, y);
      }
    }
  }

  private isLiquidPassable(tile: TileType): boolean {
    if (tile === TileType.AIR) return true;
    // Fragile non-solid plants that water washes through
    if (
      tile === TileType.TALL_GRASS ||
      tile === TileType.DRY_GRASS ||
      tile === TileType.FLOWER ||
      tile === TileType.TORCH
    ) {
      return true;
    }
    return false;
  }

  private moveWater(fromX: number, fromY: number, toX: number, toY: number) {
    this.chunkManager.setBlock(fromX, fromY, TileType.AIR);
    this.chunkManager.setBlock(toX, toY, TileType.WATER);

    this.onLiquidMove?.({
      fromX,
      fromY,
      toX,
      toY,
      tile: TileType.WATER,
    });

    // Keep destination and neighbors active
    this.activeCoords.add(`${toX},${toY}`);
    this.wakeNeighbors(fromX, fromY);
    this.wakeNeighbors(toX, toY);
  }
}
