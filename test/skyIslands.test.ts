import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/game/terrainGen';
import { ChunkManager } from '../src/game/chunkManager';
import { TileType } from '../src/game/types';
import { TILE_DEFS, SURFACE_BASE_Y, CHUNK_WIDTH, CHUNK_HEIGHT } from '../src/game/constants';
import { BLOCK_CONFIGS, ITEM_TO_TILE, TILE_TO_ITEM } from '../src/game/blocks';
import { CRAFTING_RECIPES, FURNACE_SMELT_RECIPES } from '../src/game/recipes';

test('Sky Islands: exist at high altitude (~70 blocks above surface) with unique terrain, ores, and plants', () => {
  const seed = 1337;
  const terrain = new TerrainGenerator(seed);

  // Surface is around SURFACE_BASE_Y = 64. 70 blocks above surface is Y around -6 to -80.
  let foundSkyGrass = false;
  let foundSkyDirt = false;
  let foundSkyStone = false;
  let foundAstralOre = false;
  let foundCelestialOre = false;
  let foundStarFlower = false;
  let foundSkyVine = false;
  let foundCelestialWood = false;
  let foundCelestialLeaves = false;

  // Scan sky altitude band across a 300-block horizontal range
  for (let x = 0; x < 300; x++) {
    for (let y = 0; y >= -150; y--) {
      const tile = terrain.getSkyTile(x, y);
      if (tile === TileType.SKY_GRASS) foundSkyGrass = true;
      if (tile === TileType.SKY_DIRT) foundSkyDirt = true;
      if (tile === TileType.SKY_STONE) foundSkyStone = true;
      if (tile === TileType.ASTRAL_ORE) foundAstralOre = true;
      if (tile === TileType.CELESTIAL_ORE) foundCelestialOre = true;
      if (tile === TileType.STAR_FLOWER) foundStarFlower = true;
      if (tile === TileType.SKY_VINE) foundSkyVine = true;
      if (tile === TileType.CELESTIAL_WOOD) foundCelestialWood = true;
      if (tile === TileType.CELESTIAL_LEAVES) foundCelestialLeaves = true;
    }
  }

  assert.ok(foundSkyGrass, 'Must generate Sky Grass on sky islands');
  assert.ok(foundSkyDirt, 'Must generate Sky Dirt layer under sky grass');
  assert.ok(foundSkyStone, 'Must generate Sky Stone core in sky islands');
  assert.ok(foundAstralOre, 'Must generate Astral Ore veins in sky islands');
  assert.ok(foundCelestialOre, 'Must generate Celestial Ore veins in sky islands');
  assert.ok(foundStarFlower, 'Must generate Star Flower flora on sky islands');
  assert.ok(foundSkyVine, 'Must generate Sky Vines hanging below sky islands');
  assert.ok(foundCelestialWood, 'Must generate Celestial Wood trees on sky islands');
  assert.ok(foundCelestialLeaves, 'Must generate Celestial Leaves canopy on sky islands');
});

test('Sky Islands: getBaseTile falls back to sky tiles above surface', () => {
  const seed = 42;
  const terrain = new TerrainGenerator(seed);

  let detectedSkyTile = false;
  for (let x = 50; x < 180; x++) {
    for (let y = -5; y >= -90; y--) {
      const tile = terrain.getBaseTile(x, y);
      if (
        tile === TileType.SKY_GRASS ||
        tile === TileType.SKY_STONE ||
        tile === TileType.ASTRAL_ORE ||
        tile === TileType.CELESTIAL_ORE
      ) {
        detectedSkyTile = true;
        break;
      }
    }
    if (detectedSkyTile) break;
  }

  assert.ok(detectedSkyTile, 'getBaseTile must seamlessly resolve sky island blocks for physics queries');
});

test('Sky Islands: ChunkManager populates sky islands and tiles in sky chunks', () => {
  const seed = 999;
  const chunkManager = new ChunkManager(seed, false);

  // Generate chunks at sky island height (y coordinates around -6 to -64 => cy = -1, -2)
  const skyChunk = chunkManager.generateChunk(1, -1);
  assert.ok(skyChunk, 'Sky chunk must be generated');

  // Verify chunk manager getTile returns sky blocks
  let foundSkyBlockInChunk = false;
  const worldX = 1 * CHUNK_WIDTH;
  const worldY = -1 * CHUNK_HEIGHT;

  for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
    for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
      const t = chunkManager.getTile(worldX + lx, worldY + ly);
      if (
        t === TileType.SKY_GRASS ||
        t === TileType.SKY_DIRT ||
        t === TileType.SKY_STONE ||
        t === TileType.ASTRAL_ORE ||
        t === TileType.CELESTIAL_ORE ||
        t === TileType.STAR_FLOWER ||
        t === TileType.SKY_VINE ||
        t === TileType.CELESTIAL_WOOD ||
        t === TileType.CELESTIAL_LEAVES
      ) {
        foundSkyBlockInChunk = true;
        break;
      }
    }
    if (foundSkyBlockInChunk) break;
  }

  // Scan next vertical chunk if needed
  if (!foundSkyBlockInChunk) {
    const skyChunk2 = chunkManager.generateChunk(1, -2);
    for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
      for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
        const t = chunkManager.getTile(worldX + lx, -2 * CHUNK_HEIGHT + ly);
        if (t === TileType.SKY_GRASS || t === TileType.SKY_STONE || t === TileType.ASTRAL_ORE) {
          foundSkyBlockInChunk = true;
          break;
        }
      }
    }
  }

  assert.ok(foundSkyBlockInChunk, 'ChunkManager must populate sky island tiles in sky chunks');
});

test('Sky Islands: block configs and item mappings exist for all sky island elements', () => {
  const requiredTiles = [
    TileType.SKY_GRASS,
    TileType.SKY_DIRT,
    TileType.SKY_STONE,
    TileType.ASTRAL_ORE,
    TileType.CELESTIAL_ORE,
    TileType.STAR_FLOWER,
    TileType.SKY_VINE,
    TileType.CELESTIAL_WOOD,
    TileType.CELESTIAL_LEAVES,
  ];

  for (const tile of requiredTiles) {
    assert.ok(TILE_DEFS[tile], `Tile definition must exist for tile ${tile}`);
    assert.ok(BLOCK_CONFIGS[tile], `Block config must exist for tile ${tile}`);
    assert.ok(TILE_TO_ITEM[tile], `Tile to item mapping must exist for tile ${tile}`);
    const item = TILE_TO_ITEM[tile]!;
    assert.ok(ITEM_TO_TILE[item], `Item to tile mapping must exist for item ${item}`);
  }
});

test('Sky Islands: Astral and Celestial smelting and crafting recipes exist', () => {
  const astralSmelt = FURNACE_SMELT_RECIPES.find((r) => r.output === 'astral_ingot');
  assert.ok(astralSmelt, 'Astral Ingot furnace recipe must exist');
  assert.equal(astralSmelt?.ingredients[0].item, 'astral_ore');

  const celestialSmelt = FURNACE_SMELT_RECIPES.find((r) => r.output === 'celestial_ingot');
  assert.ok(celestialSmelt, 'Celestial Ingot furnace recipe must exist');
  assert.equal(celestialSmelt?.ingredients[0].item, 'celestial_ore');

  const celestialPlanks = CRAFTING_RECIPES.find((r) => r.output === 'celestial_planks');
  assert.ok(celestialPlanks, 'Celestial Planks recipe must exist');

  const astralPickaxe = CRAFTING_RECIPES.find((r) => r.output === 'astral_pickaxe');
  assert.ok(astralPickaxe, 'Astral Pickaxe recipe must exist');

  const celestialSword = CRAFTING_RECIPES.find((r) => r.output === 'celestial_sword');
  assert.ok(celestialSword, 'Celestial Sword recipe must exist');
});
