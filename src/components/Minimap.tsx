import React, { useEffect, useRef } from 'react';
import { ChunkManager } from '../game/chunkManager';
import { CHUNK_HEIGHT, CHUNK_WIDTH } from '../game/constants';
import { TileType } from '../game/types';
import { BIOMES, BiomeType } from '../game/biomes';

interface MinimapProps {
  chunkManager: ChunkManager | null;
  playerX: number;
  playerY: number;
  chunkX: number;
  chunkY: number;
  seed: number;
}

export const Minimap: React.FC<MinimapProps> = React.memo(({
  chunkManager,
  playerX,
  playerY,
  chunkX,
  chunkY,
  seed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastRenderPos = useRef<{ x: number; y: number }>({ x: 999999, y: 999999 });

  useEffect(() => {
    if (!chunkManager || !canvasRef.current) return;

    // Only redraw minimap if player moved by at least 4 blocks
    const dx = Math.abs(playerX - lastRenderPos.current.x);
    const dy = Math.abs(playerY - lastRenderPos.current.y);
    if (dx < 4 && dy < 4) return;

    lastRenderPos.current = { x: playerX, y: playerY };

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Dark radar background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);

    // Local radar window: 60 blocks horizontally, 30 blocks vertically
    const rangeX = 30; // -30 to +30 blocks
    const rangeY = 15; // -15 to +15 blocks

    const startX = playerX - rangeX;
    const endX = playerX + rangeX;
    const startY = playerY - rangeY;
    const endY = playerY + rangeY;

    const pxPerBlockX = w / (rangeX * 2);
    const pxPerBlockY = h / (rangeY * 2);

    // Fast read only from ALREADY LOADED chunks (never triggers procedural noise)
    for (let by = startY; by <= endY; by += 2) {
      const cy = Math.floor(by / CHUNK_HEIGHT);
      const ly = ((by % CHUNK_HEIGHT) + CHUNK_HEIGHT) % CHUNK_HEIGHT;
      const my = Math.floor((by - startY) * pxPerBlockY);

      for (let bx = startX; bx <= endX; bx += 2) {
        const cx = Math.floor(bx / CHUNK_WIDTH);
        const key = ChunkManager.getChunkKey(cx, cy);
        const chunk = chunkManager.loadedChunks.get(key);

        if (!chunk || chunk.isAllAir) continue;

        const lx = ((bx % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
        const tile = chunk.tiles[ly * CHUNK_WIDTH + lx] as TileType;

        if (tile === TileType.AIR) continue;

        const mx = Math.floor((bx - startX) * pxPerBlockX);

        const biomeId = chunk.biomes[lx] as BiomeType;
        const biome = BIOMES[biomeId];
        if (biome?.category === 'UNDERGROUND' && tile !== TileType.WATER) {
          ctx.fillStyle = biome.mapColor;
          ctx.fillRect(mx, my, 2, 2);
          continue;
        }

        if ([TileType.GRASS, TileType.SAND, TileType.SNOW, TileType.DRY_GRASS, TileType.FLOWER_GRASS, TileType.MUD, TileType.OASIS_GRASS, TileType.MUSHROOM_GRASS, TileType.BASALT, TileType.ASH, TileType.RED_SAND, TileType.SALT, TileType.ICE, TileType.PACKED_ICE].includes(tile)) {
          ctx.fillStyle = BIOMES[biomeId]?.mapColor || '#84cc16';
          ctx.fillRect(mx, my, 2, 2);
          continue;
        }

        if (tile === TileType.WATER) {
          ctx.fillStyle = '#2787bd';
          ctx.fillRect(mx, my, 2, 2);
          continue;
        }

        if (tile === TileType.DIRT || tile === TileType.SNOWY_DIRT) {
          ctx.fillStyle = '#854d0e';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.STONE || tile === TileType.BASALT || tile === TileType.OBSIDIAN || tile === TileType.ASH) {
          ctx.fillStyle = '#475569';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.LEAVES || tile === TileType.BIRCH_LEAVES) {
          ctx.fillStyle = '#15803d';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.WOOD || tile === TileType.BIRCH_WOOD) {
          ctx.fillStyle = '#78350f';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.SKY_GRASS) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.SKY_DIRT) {
          ctx.fillStyle = '#4338ca';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.SKY_STONE) {
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.ASTRAL_ORE) {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.CELESTIAL_ORE) {
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.CELESTIAL_LEAVES) {
          ctx.fillStyle = '#818cf8';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.CELESTIAL_WOOD) {
          ctx.fillStyle = '#c084fc';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.STAR_FLOWER) {
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(mx, my, 2, 2);
        } else if (tile === TileType.SKY_VINE) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(mx, my, 2, 2);
        }
      }
    }

    // Player blip in radar center
    const centerScreenX = Math.floor(w / 2);
    const centerScreenY = Math.floor(h / 2);

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(centerScreenX - 2, centerScreenY - 2, 5, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(centerScreenX - 1, centerScreenY - 1, 3, 3);
  }, [chunkManager, playerX, playerY]);

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-lg p-2.5 shadow-2xl backdrop-blur-md min-w-[180px]">
      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 font-mono uppercase tracking-wider">
        <span className="text-emerald-400 font-bold">WORLD: INFINITE</span>
        <span className="text-slate-400 font-mono text-[9px]">SEED: {seed}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={150}
        height={65}
        className="rounded border border-slate-800 bg-slate-950 block mx-auto"
      />
      <div className="flex items-center justify-between text-[9px] text-slate-300 mt-1.5 font-mono">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse"></span>
          X: {playerX} Y: {playerY}
        </span>
        <span className="text-slate-400">Chunk [{chunkX},{chunkY}]</span>
      </div>
    </div>
  );
});
