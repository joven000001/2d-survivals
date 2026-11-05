import test from 'node:test';
import assert from 'node:assert/strict';
import { getAudioMaterial, sound, AudioMaterial } from '../src/game/audio';
import { TileType } from '../src/game/types';

test('getAudioMaterial correctly classifies distinct block materials', () => {
  // Dirt family
  assert.equal(getAudioMaterial(TileType.DIRT), 'dirt');
  assert.equal(getAudioMaterial(TileType.SNOWY_DIRT), 'dirt');
  assert.equal(getAudioMaterial(TileType.SKY_DIRT), 'dirt');
  assert.equal(getAudioMaterial(TileType.TILLED_SOIL), 'dirt');

  // Sand family
  assert.equal(getAudioMaterial(TileType.SAND), 'sand');
  assert.equal(getAudioMaterial(TileType.RED_SAND), 'sand');
  assert.equal(getAudioMaterial(TileType.SALT), 'sand');

  // Grass & Foliage
  assert.equal(getAudioMaterial(TileType.GRASS), 'grass');
  assert.equal(getAudioMaterial(TileType.FLOWER_GRASS), 'grass');
  assert.equal(getAudioMaterial(TileType.SKY_GRASS), 'grass');
  assert.equal(getAudioMaterial(TileType.LEAVES), 'leaves');
  assert.equal(getAudioMaterial(TileType.BIRCH_LEAVES), 'leaves');
  assert.equal(getAudioMaterial(TileType.BAMBOO), 'leaves');

  // Stone & Ores
  assert.equal(getAudioMaterial(TileType.STONE), 'stone');
  assert.equal(getAudioMaterial(TileType.COAL_ORE), 'stone');
  assert.equal(getAudioMaterial(TileType.IRON_ORE), 'stone');
  assert.equal(getAudioMaterial(TileType.OBSIDIAN), 'stone');

  // Wood & Furniture
  assert.equal(getAudioMaterial(TileType.WOOD), 'wood');
  assert.equal(getAudioMaterial(TileType.PLANKS), 'wood');
  assert.equal(getAudioMaterial(TileType.CHEST), 'wood');
  assert.equal(getAudioMaterial(TileType.CRAFTING_TABLE), 'wood');
  assert.equal(getAudioMaterial(TileType.DOOR), 'wood');

  // Snow & Ice
  assert.equal(getAudioMaterial(TileType.SNOW), 'snow');
  assert.equal(getAudioMaterial(TileType.ICE), 'ice');
  assert.equal(getAudioMaterial(TileType.BLUE_ICE), 'ice');

  // Crystals & Ores
  assert.equal(getAudioMaterial(TileType.GLOWING_CRYSTAL), 'crystal');
  assert.equal(getAudioMaterial(TileType.CRYSTAL_ORE), 'crystal');
  assert.equal(getAudioMaterial(TileType.DIAMOND_ORE), 'crystal');

  // Water & Liquids
  assert.equal(getAudioMaterial(TileType.WATER), 'water');

  // Fallbacks
  assert.equal(getAudioMaterial(TileType.AIR), 'dirt');
  assert.equal(getAudioMaterial(null), 'dirt');
  assert.equal(getAudioMaterial(undefined), 'dirt');
});

test('SoundEngine methods can be safely invoked without crashing', () => {
  // Test in headless/node context
  sound.playFootstep(TileType.DIRT);
  sound.playFootstep(TileType.SAND);
  sound.playFootstep(TileType.STONE);
  sound.playFootstep(TileType.WOOD);
  sound.playFootstep(TileType.SNOW);

  sound.playBlockMineHit(TileType.STONE, 0.2);
  sound.playBlockMineHit(TileType.WOOD, 0.5);
  sound.playBlockMineHit(TileType.DIRT, 0.8);
  sound.playBlockMineHit(TileType.SAND, 0.1);

  sound.playBlockBreak(TileType.STONE);
  sound.playBlockBreak(TileType.WOOD);
  sound.playBlockBreak(TileType.DIRT);
  sound.playBlockBreak(TileType.SAND);

  sound.playBlockPlace(TileType.WOOD);
  sound.playBlockPlace(TileType.STONE);
  sound.playBlockPlace(TileType.DIRT);

  sound.playSwim(false);
  sound.playSwim(true);
  sound.playSplash(1.0);
  sound.playLand(TileType.STONE);
  sound.playLand(TileType.SAND);

  // Mute toggling
  const initial = sound.getMuted();
  sound.setMuted(!initial);
  assert.equal(sound.getMuted(), !initial);
  sound.toggleMute();
  assert.equal(sound.getMuted(), initial);
});
