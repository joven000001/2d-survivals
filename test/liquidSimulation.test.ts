import test from 'node:test';
import assert from 'node:assert/strict';
import { ChunkManager } from '../src/game/chunkManager';
import { LiquidSimulation } from '../src/game/liquidSimulation';
import { TileType } from '../src/game/types';

test('LiquidSimulation: Water flows downward with gravity into empty air', () => {
  const chunkManager = new ChunkManager(12345, false);
  const liquidSim = new LiquidSimulation(chunkManager);

  // Set up a vertical air shaft
  const x = 50;
  const y = 30;

  // Clear shaft
  chunkManager.setBlock(x, y, TileType.WATER);
  chunkManager.setBlock(x, y + 1, TileType.AIR);
  chunkManager.setBlock(x, y + 2, TileType.STONE);

  liquidSim.onBlockChanged(x, y, TileType.WATER);

  // Step simulation
  liquidSim.update(0.1);

  // Water should have fallen from (x, y) into (x, y + 1)
  assert.equal(chunkManager.getTile(x, y), TileType.AIR, 'Origin cell becomes AIR after water flows down');
  assert.equal(chunkManager.getTile(x, y + 1), TileType.WATER, 'Target cell below becomes WATER');
});

test('LiquidSimulation: Water flows toward a downward slope/drop', () => {
  const chunkManager = new ChunkManager(12345, false);
  const liquidSim = new LiquidSimulation(chunkManager);

  const x = 80;
  const y = 40;

  // Water on floor, left has solid wall, right has drop
  chunkManager.setBlock(x, y, TileType.WATER);
  chunkManager.setBlock(x, y + 1, TileType.STONE); // Floor below
  chunkManager.setBlock(x - 1, y, TileType.STONE); // Left blocked
  chunkManager.setBlock(x + 1, y, TileType.AIR);   // Right open
  chunkManager.setBlock(x + 1, y + 1, TileType.AIR); // Right drops down!

  liquidSim.onBlockChanged(x, y, TileType.WATER);
  liquidSim.update(0.1);

  assert.equal(chunkManager.getTile(x, y), TileType.AIR, 'Water left origin towards the drop');
  assert.equal(chunkManager.getTile(x + 1, y), TileType.WATER, 'Water moved to slope edge');

  // Next step: water falls down the drop
  liquidSim.update(0.1);
  assert.equal(chunkManager.getTile(x + 1, y + 1), TileType.WATER, 'Water fell down the drop');
});

test('LiquidSimulation: Water cools Magma into Obsidian upon contact', () => {
  const chunkManager = new ChunkManager(12345, false);
  const liquidSim = new LiquidSimulation(chunkManager);

  const x = 100;
  const y = 60;

  chunkManager.setBlock(x, y, TileType.WATER);
  chunkManager.setBlock(x, y + 1, TileType.MAGMA);

  let solidifiedResult: TileType | null = null;
  liquidSim.onLiquidSolidify = ({ resultTile }) => {
    solidifiedResult = resultTile;
  };

  liquidSim.onBlockChanged(x, y, TileType.WATER);
  liquidSim.update(0.1);

  assert.equal(chunkManager.getTile(x, y + 1), TileType.OBSIDIAN, 'Magma solidified into Obsidian');
  assert.equal(solidifiedResult, TileType.OBSIDIAN, 'Solidify event dispatched');
});
