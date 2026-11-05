import { EXTRA_BLOCKS, ITEM_TO_TILE, ItemType } from './blocks';
import { TILE_DEFS, TILE_SIZE } from './constants';
import { TileType } from './types';

const spriteCache = new Map<string, HTMLCanvasElement>();
const extraItemTiles = new Map<string, TileType>(EXTRA_BLOCKS.map(([tile, item]) => [item, tile] as const));

type Palette = (typeof TILE_DEFS)[TileType];

function rect(context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

function flecks(context: CanvasRenderingContext2D, dark: string, light: string, variation: number) {
  const shift = variation * 2;
  rect(context, dark, 2 + shift % 5, 3, 3, 2);
  rect(context, light, 9 - shift % 4, 2 + variation % 2, 3, 1);
  rect(context, dark, 10, 10 - shift % 3, 4, 2);
  rect(context, light, 3, 12 - variation % 3, 2, 1);
}

function drawRock(context: CanvasRenderingContext2D, palette: Palette, variation: number) {
  rect(context, palette.color, 0, 0, TILE_SIZE, TILE_SIZE);
  rect(context, palette.lightColor, 1, 1 + variation % 2, 5, 1);
  rect(context, palette.lightColor, 2, 2 + variation % 2, 1, 3);
  rect(context, palette.darkColor, 0, 7 + variation % 2, 6, 1);
  rect(context, palette.darkColor, 5, 8 + variation % 2, 1, 3);
  rect(context, palette.darkColor, 10, 12 - variation % 2, 5, 1);
  rect(context, palette.lightColor, 8, 6, 3, 1);
  rect(context, palette.lightColor, 12, 3 + variation % 3, 2, 1);
}

function drawSoil(context: CanvasRenderingContext2D, palette: Palette, variation: number) {
  rect(context, palette.color, 0, 0, TILE_SIZE, TILE_SIZE);
  flecks(context, palette.darkColor, palette.lightColor, variation);
  rect(context, palette.darkColor, 5 + variation % 4, 7, 2, 1);
  rect(context, palette.lightColor, 7, 5 + variation % 5, 1, 1);
}

function drawGrassBlock(context: CanvasRenderingContext2D, palette: Palette, topColor: string, variation: number) {
  rect(context, '#854d0e', 0, 3, TILE_SIZE, TILE_SIZE - 3);
  rect(context, '#713f12', 0, 5, TILE_SIZE, 2);
  flecks(context, '#713f12', '#a16207', variation);
  rect(context, palette.darkColor, 0, 2, TILE_SIZE, 2);
  rect(context, topColor, 0, 1, TILE_SIZE, 2);
  rect(context, topColor, variation * 3 % 8, 0, 5, 3);
  rect(context, topColor, 10 + variation % 4, 0, 4, 3);
  rect(context, palette.lightColor, 1, 0, 4, 1);
  rect(context, palette.lightColor, 8, 1, 3, 1);
}

function drawLog(context: CanvasRenderingContext2D, palette: Palette, variation: number, tile: TileType = TileType.WOOD) {
  const v = variation & 3;
  // Full 16px vertical cylindrical trunk with bark crevices, sunlit ridge, and organic knots
  rect(context, palette.darkColor, 2, 0, 12, 16);
  rect(context, palette.color, 3, 0, 10, 16);
  // Warm sunlit left-center bark strip
  rect(context, palette.lightColor, 4, 0, 3, 16);
  // Shaded right-side bark strip
  rect(context, palette.darkColor, 11, 0, 2, 16);

  if (tile === TileType.BIRCH_WOOD) {
    // Creamy birch bark with dark charcoal lenticel eyes & horizontal peel marks
    rect(context, '#f5f5e8', 4, 0, 4, 16);
    rect(context, '#e7e5d5', 8, 0, 3, 16);
    rect(context, '#44403c', 3, 2 + v, 4, 1);
    rect(context, '#78716c', 4, 3 + v, 2, 1);
    rect(context, '#292524', 9, 7 + (v % 3), 4, 1);
    rect(context, '#57534e', 10, 6 + (v % 3), 2, 3);
    rect(context, '#44403c', 5, 12 - (v % 2), 3, 1);
  } else if (tile === TileType.PALM_WOOD) {
    // Ringed fibrous tropical palm segments
    for (let ry = 3; ry < 16; ry += 5) {
      rect(context, palette.darkColor, 2, ry, 12, 1);
      rect(context, palette.lightColor, 3, ry + 1, 8, 1);
    }
    rect(context, palette.darkColor, 8 + (v % 2), 1, 1, 14);
  } else if (tile === TileType.CHERRY_WOOD) {
    // Rich dark sakura mahogany bark with horizontal copper-rose lenticels
    rect(context, '#3b2322', 2, 0, 2, 16);
    rect(context, '#3b2322', 12, 0, 2, 16);
    rect(context, '#9e625c', 4, 2 + v * 2, 4, 1);
    rect(context, '#9e625c', 8, 9 - v, 4, 1);
    rect(context, '#c98a82', 5, 13 - v, 3, 1);
    rect(context, palette.darkColor, 7 + (v % 2), 0, 1, 16);
  } else if (tile === TileType.CELESTIAL_WOOD) {
    // Pale ethereal celestial bark with starlight grain and luminous amethyst runes
    rect(context, '#581c87', 2, 0, 1, 16);
    rect(context, '#581c87', 13, 0, 1, 16);
    rect(context, '#e9d5ff', 4, 0, 4, 16);
    rect(context, '#c084fc', 8, 0, 3, 16);
    rect(context, '#38bdf8', 4, 2 + v * 2, 3, 1);
    rect(context, '#ffffff', 5, 2 + v * 2, 1, 1);
    rect(context, '#a855f7', 9, 8 - v, 3, 2);
    rect(context, '#67e8f9', 10, 9 - v, 1, 1);
  } else {
    // Rugged Oak / Woodland / Acacia bark with vertical fissures, wood grain, and a bark knot
    rect(context, '#2e1102', 2, 0, 1, 16);
    rect(context, '#2e1102', 13, 0, 1, 16);
    // Staggered vertical bark fissures
    rect(context, palette.darkColor, 6 + (v & 1), 0, 1, 7 + v);
    rect(context, palette.darkColor, 8 - (v & 1), 6 + v, 1, 10 - v);
    rect(context, palette.darkColor, 4, 9 + (v % 3), 1, 5);
    // Warm sunlit bark plates
    rect(context, '#b45d26', 4, 1 + v * 2, 2, 5);
    rect(context, '#b45d26', 5, 9 - v, 2, 4);
    // Organic wood knot swirl on half the variations
    if ((v & 1) === 0) {
      const ky = 4 + v * 2;
      rect(context, '#2e1102', 8, ky, 3, 3);
      rect(context, palette.lightColor, 9, ky + 1, 1, 1);
    }
  }
}

function drawLeaves(context: CanvasRenderingContext2D, palette: Palette, variation: number, tile: TileType = TileType.LEAVES) {
  const v = variation & 3;
  // Deep interior foliage base filling the tile so canopies have zero grid gaps
  rect(context, palette.darkColor, 0, 0, 16, 16);

  // Three overlapping rounded leaf bushels inside the 16x16 cell
  const s1 = v % 2;
  const s2 = (v >> 1) & 1;
  rect(context, palette.color, 1, 1, 9, 8);
  rect(context, palette.color, 6, 2 + s1, 9, 8);
  rect(context, palette.color, 2 + s2, 7, 11, 7);

  // Deep crevice shadows under each leaf cluster for 3D bushel volume
  rect(context, '#0c3b1c', 2, 8, 6, 2);
  rect(context, '#0c3b1c', 8, 9 + s1, 6, 2);
  rect(context, '#0c3b1c', 3, 14, 10, 2);

  // Sun-dappled upper leaf tips on each bushel
  rect(context, palette.lightColor, 2, 1 + s1, 5, 3);
  rect(context, palette.lightColor, 3, 4 + s1, 3, 1);
  rect(context, palette.lightColor, 8 + s2, 2, 5, 3);
  rect(context, palette.lightColor, 9 + s2, 5, 3, 1);
  rect(context, palette.lightColor, 4, 8 + s2, 5, 2);

  if (tile === TileType.CHERRY_LEAVES) {
    // Sakura flower rosettes
    rect(context, '#fff1f2', 3 + s1, 2, 2, 2);
    rect(context, '#e11d48', 4 + s1, 3, 1, 1);
    rect(context, '#fff1f2', 10, 7 + s2, 2, 2);
    rect(context, '#e11d48', 10, 8 + s2, 1, 1);
  } else if (tile === TileType.BIRCH_LEAVES) {
    // Crisp golden-lime diamond leaf tips
    rect(context, '#d9f99d', 3, 2 + s1, 2, 2);
    rect(context, '#d9f99d', 10, 3 + s2, 2, 2);
  } else if (tile === TileType.CELESTIAL_LEAVES) {
    // Shimmering celestial starlight clusters
    rect(context, '#ffffff', 3 + s1, 2, 2, 2);
    rect(context, '#c7d2fe', 4 + s1, 3, 1, 1);
    rect(context, '#38bdf8', 10, 6 + s2, 2, 2);
    rect(context, '#ffffff', 11, 7 + s2, 1, 1);
    rect(context, '#e0e7ff', 5, 11 - s1, 2, 1);
  } else if (tile === TileType.LEAVES) {
    // Lush Oak leaf highlights & occasional tiny golden acorn
    rect(context, '#86efac', 3 + s1, 2, 2, 1);
    rect(context, '#86efac', 9, 3 + s2, 2, 1);
    if (v === 1) {
      rect(context, '#451a03', 11, 10, 2, 1);
      rect(context, '#b45309', 11, 11, 2, 2);
    }
  }
}

function drawSand(context: CanvasRenderingContext2D, palette: Palette, variation: number) {
  rect(context, palette.color, 0, 0, TILE_SIZE, TILE_SIZE);
  flecks(context, palette.darkColor, palette.lightColor, variation);
  rect(context, palette.lightColor, 1 + variation % 5, 6, 2, 1);
  rect(context, palette.darkColor, 8, 4 + variation % 4, 1, 1);
  rect(context, palette.lightColor, 12, 13 - variation % 3, 2, 1);
}

function drawSnow(context: CanvasRenderingContext2D, palette: Palette, variation: number, dirtBase = false) {
  if (dirtBase) rect(context, '#77766c', 0, 0, 16, 16);
  else rect(context, palette.color, 0, 0, 16, 16);
  rect(context, palette.lightColor, 0, 0, 16, 3 + variation % 2);
  rect(context, palette.lightColor, variation * 3 % 7, 2, 6, 2);
  rect(context, palette.darkColor, 1, 12, 5, 1);
  rect(context, palette.darkColor, 10, 9 + variation % 3, 4, 1);
  rect(context, '#e2f4fa', 3, 6, 2, 1);
  rect(context, '#e2f4fa', 8, 4 + variation % 4, 3, 1);
}

function drawOre(context: CanvasRenderingContext2D, tile: TileType, palette: Palette, variation: number) {
  const isSkyOre = tile === TileType.ASTRAL_ORE || tile === TileType.CELESTIAL_ORE;
  if (isSkyOre) {
    drawRock(context, { ...palette, color: '#94a3b8', darkColor: '#64748b', lightColor: '#cbd5e1' }, variation);
  } else {
    drawRock(context, { ...palette, color: '#687177', darkColor: '#41494d', lightColor: '#969c9e' }, variation);
  }
  const deposits: Record<number, { main: string; shade: string; shine: string }> = {
    [TileType.COAL_ORE]: { main: '#202427', shade: '#111416', shine: '#7d8588' },
    [TileType.COPPER_ORE]: { main: '#c66b3d', shade: '#85452f', shine: '#f3a06b' },
    [TileType.IRON_ORE]: { main: '#b9a18a', shade: '#78695e', shine: '#eee0c9' },
    [TileType.GOLD_ORE]: { main: '#e7b82f', shade: '#9f6d19', shine: '#fff09a' },
    [TileType.CRYSTAL_ORE]: { main: '#a986d8', shade: '#574674', shine: '#ead8ff' },
    [TileType.DIAMOND_ORE]: { main: '#51c9c6', shade: '#247a83', shine: '#d1ffff' },
    [TileType.ASTRAL_ORE]: { main: '#f59e0b', shade: '#b45309', shine: '#fef08a' },
    [TileType.CELESTIAL_ORE]: { main: '#a855f7', shade: '#6b21a8', shine: '#67e8f9' },
  };
  const ore = deposits[tile] || { main: '#f59e0b', shade: '#b45309', shine: '#ffffff' };
  const shift = variation % 3;
  rect(context, ore.shade, 2, 4 + shift, 5, 4);
  rect(context, ore.main, 3, 4 + shift, 4, 3);
  rect(context, ore.shine, 4, 5 + shift, 2, 1);
  rect(context, ore.shade, 9, 9 - shift, 5, 4);
  rect(context, ore.main, 10, 9 - shift, 4, 3);
  rect(context, ore.shine, 11, 10 - shift, 2, 1);
  if (tile === TileType.CRYSTAL_ORE || tile === TileType.DIAMOND_ORE || isSkyOre) {
    rect(context, ore.main, 6, 1, 2, 3);
    rect(context, ore.shine, 6, 1, 1, 2);
  }
}

function drawCrystal(context: CanvasRenderingContext2D, palette: Palette, variation: number, glow: boolean) {
  if (glow) rect(context, 'rgba(80,235,220,0.18)', 1, 1, 14, 14);
  rect(context, palette.darkColor, 3, 8, 10, 7);
  rect(context, palette.color, 4, 5, 3, 9);
  rect(context, palette.color, 6, 2 + variation % 2, 3, 12);
  rect(context, palette.color, 10, 6, 3, 8);
  rect(context, palette.lightColor, 5, 5, 1, 6);
  rect(context, palette.lightColor, 7, 3 + variation % 2, 1, 8);
  rect(context, palette.lightColor, 11, 7, 1, 4);
}

function drawPlanks(context: CanvasRenderingContext2D, palette: Palette, variation: number) {
  rect(context, palette.color, 0, 0, 16, 16);
  rect(context, palette.darkColor, 0, 5, 16, 1);
  rect(context, palette.darkColor, 0, 11, 16, 1);
  rect(context, palette.lightColor, 1, 1, 14, 1);
  rect(context, palette.lightColor, 2, 7, 13, 1);
  rect(context, palette.lightColor, 1, 13, 14, 1);
  rect(context, palette.darkColor, 5 + variation % 3, 0, 1, 5);
  rect(context, palette.darkColor, 11 - variation % 3, 6, 1, 5);
  rect(context, palette.darkColor, 4 + variation % 4, 12, 1, 4);
}

function drawArt(context: CanvasRenderingContext2D, tile: TileType, variation: number) {
  const palette = TILE_DEFS[tile];
  switch (tile) {
    case TileType.AIR:
      return;
    case TileType.GRASS:
      drawGrassBlock(context, palette, '#4ade80', variation);
      return;
    case TileType.DIRT:
      drawSoil(context, palette, variation);
      return;
    case TileType.STONE:
    case TileType.ASH:
    case TileType.BASALT:
    case TileType.OBSIDIAN:
      drawRock(context, palette, variation);
      if (tile === TileType.BASALT || tile === TileType.OBSIDIAN) {
        rect(context, palette.lightColor, 2, 3 + variation % 4, 1, 5);
        rect(context, palette.darkColor, 11, 2, 2, 1);
      }
      return;
    case TileType.BEDROCK:
      rect(context, '#0d0b10', 0, 0, 16, 16);
      rect(context, '#1e1b24', 1, 1, 6, 5);
      rect(context, '#272330', 8, 1, 7, 4);
      rect(context, '#1e1b24', 2, 8, 5, 6);
      rect(context, '#272330', 9, 7, 6, 7);
      rect(context, '#3f3a4d', 2 + (variation & 1), 2, 3, 2);
      rect(context, '#3f3a4d', 10, 8 + (variation & 1), 3, 2);
      rect(context, '#524b63', 5, 11, 2, 2);
      rect(context, '#050407', 0, 6, 16, 2);
      rect(context, '#050407', 7, 0, 2, 16);
      return;
    case TileType.WOOD:
    case TileType.ACACIA_WOOD:
    case TileType.CHERRY_WOOD:
    case TileType.PALM_WOOD:
    case TileType.BIRCH_WOOD:
      drawLog(context, palette, variation, tile);
      return;
    case TileType.LEAVES:
    case TileType.BIRCH_LEAVES:
    case TileType.ACACIA_LEAVES:
    case TileType.CHERRY_LEAVES:
    case TileType.PALM_LEAVES:
      drawLeaves(context, palette, variation, tile);
      return;
    case TileType.FLOWER:
      rect(context, '#14532d', 7, 8, 2, 8);
      rect(context, '#16a34a', 4, 12, 4, 2);
      rect(context, palette.darkColor, 4, 3, 8, 6);
      rect(context, palette.color, 5, 2, 6, 5);
      rect(context, palette.lightColor, 6, 3, 2, 2);
      rect(context, '#fef08a', 8, 4, 2, 2);
      return;
    case TileType.TALL_GRASS:
    case TileType.DRY_GRASS:
      rect(context, palette.darkColor, 3, 8, 2, 8);
      rect(context, palette.color, 4, 6, 2, 10);
      rect(context, palette.lightColor, 4, 6, 1, 3);
      rect(context, palette.darkColor, 8, 4, 2, 12);
      rect(context, palette.color, 9, 3, 2, 13);
      rect(context, palette.lightColor, 9, 3, 1, 4);
      rect(context, palette.darkColor, 12, 9, 2, 7);
      rect(context, palette.color, 13, 7, 2, 9);
      return;
    case TileType.SAND:
    case TileType.RED_SAND:
    case TileType.SALT:
      drawSand(context, palette, variation);
      return;
    case TileType.SANDSTONE:
      rect(context, palette.color, 0, 0, 16, 16);
      rect(context, palette.darkColor, 0, 5, 16, 1);
      rect(context, palette.darkColor, 0, 11, 16, 1);
      rect(context, palette.lightColor, 1, 2, 7, 1);
      rect(context, palette.lightColor, 9, 8, 6, 1);
      rect(context, palette.darkColor, 4 + variation % 5, 6, 1, 4);
      return;
    case TileType.SNOW:
      drawSnow(context, palette, variation);
      return;
    case TileType.SNOWY_DIRT:
      drawSnow(context, palette, variation, true);
      rect(context, '#62675f', 2, 8, 4, 2);
      rect(context, '#b8baae', 10, 12, 3, 1);
      return;
    case TileType.CACTUS:
      rect(context, '#10472e', 4, 1, 8, 15);
      rect(context, '#10472e', 1, 5, 5, 3);
      rect(context, '#10472e', 1, 5, 3, 6);
      rect(context, '#10472e', 10, 8, 5, 3);
      rect(context, '#10472e', 12, 5, 3, 6);
      rect(context, palette.color, 5, 2, 6, 13);
      rect(context, palette.lightColor, 6, 3, 1, 8);
      rect(context, '#d9f99d', 2, 6, 1, 1);
      return;
    case TileType.BAMBOO:
      rect(context, '#557126', 6, 0, 5, 16);
      rect(context, palette.color, 7, 0, 3, 16);
      rect(context, palette.lightColor, 7, 1, 1, 14);
      rect(context, palette.darkColor, 5, 4, 7, 1);
      rect(context, palette.darkColor, 5, 11, 7, 1);
      rect(context, palette.lightColor, 9, 5, 1, 2);
      return;
    case TileType.FLOWER_GRASS:
    case TileType.OASIS_GRASS:
    case TileType.MUSHROOM_GRASS:
      drawGrassBlock(context, palette, palette.color, variation);
      rect(context, palette.lightColor, 3 + variation % 5, 1, 2, 1);
      rect(context, palette.lightColor, 11, 2 + variation % 2, 2, 1);
      if (tile === TileType.FLOWER_GRASS) {
        rect(context, '#f7a9cc', 5, 5, 2, 2);
        rect(context, '#ffe0ed', 5, 5, 1, 1);
        rect(context, '#f7a9cc', 12, 9, 2, 2);
      }
      if (tile === TileType.MUSHROOM_GRASS) {
        rect(context, '#d38bda', 3, 7, 3, 2);
        rect(context, '#d38bda', 10, 4, 2, 3);
      }
      return;
    case TileType.CORAL:
      rect(context, palette.darkColor, 7, 6, 2, 10);
      rect(context, palette.color, 6, 8, 4, 8);
      rect(context, palette.color, 3, 5, 3, 5);
      rect(context, palette.color, 10, 3, 3, 7);
      rect(context, palette.lightColor, 4, 5, 2, 2);
      rect(context, palette.lightColor, 11, 3, 1, 3);
      return;
    case TileType.CORAL_BLOCK:
      drawSoil(context, palette, variation);
      rect(context, palette.darkColor, 2, 2, 4, 2);
      rect(context, palette.lightColor, 9, 5, 5, 2);
      rect(context, palette.darkColor, 5, 11, 4, 2);
      return;
    case TileType.ICE:
    case TileType.PACKED_ICE:
    case TileType.BLUE_ICE:
      rect(context, palette.color, 0, 0, 16, 16);
      rect(context, palette.lightColor, 1, 1, 8, 2);
      rect(context, palette.lightColor, 2, 3, 2, 5);
      rect(context, palette.darkColor, 8 + variation % 3, 5, 1, 7);
      rect(context, palette.lightColor, 9 + variation % 3, 5, 4, 1);
      rect(context, palette.darkColor, 4, 12, 6, 1);
      rect(context, 'rgba(255,255,255,0.42)', 11, 10, 3, 2);
      return;
    case TileType.MUD:
      drawSoil(context, palette, variation);
      rect(context, palette.darkColor, 1, 6, 6, 1);
      rect(context, palette.lightColor, 9, 4, 4, 1);
      rect(context, palette.darkColor, 7, 13, 5, 1);
      return;
    case TileType.MAGMA:
      rect(context, '#612d2a', 0, 0, 16, 16);
      rect(context, palette.darkColor, 1, 2, 6, 5);
      rect(context, palette.color, 2, 3, 4, 3);
      rect(context, palette.lightColor, 3, 3, 2, 1);
      rect(context, palette.color, 9, 1 + variation % 3, 6, 3);
      rect(context, palette.lightColor, 10, 2 + variation % 3, 3, 1);
      rect(context, palette.darkColor, 8, 7, 7, 5);
      rect(context, palette.color, 9, 8, 5, 3);
      rect(context, palette.lightColor, 10, 8, 3, 1);
      rect(context, palette.color, 2, 11, 5, 4);
      rect(context, palette.lightColor, 3, 12, 3, 1);
      return;
    case TileType.GLOWING_CRYSTAL:
      drawCrystal(context, palette, variation, true);
      return;
    case TileType.GLOWING_MUSHROOM:
      rect(context, 'rgba(210,110,240,0.18)', 1, 2, 14, 13);
      rect(context, palette.darkColor, 7, 8, 3, 7);
      rect(context, palette.lightColor, 7, 9, 1, 5);
      rect(context, palette.darkColor, 3, 5, 10, 5);
      rect(context, palette.color, 4, 3, 8, 6);
      rect(context, palette.lightColor, 5, 4, 2, 2);
      rect(context, '#fff4ff', 9, 6, 1, 1);
      return;
    case TileType.VINE:
      rect(context, palette.darkColor, 4, 0, 2, 16);
      rect(context, palette.color, 5, 0, 2, 16);
      rect(context, palette.color, 6, 4, 5, 2);
      rect(context, palette.lightColor, 7, 4, 3, 1);
      rect(context, palette.color, 5, 10, 6, 2);
      rect(context, palette.lightColor, 6, 10, 3, 1);
      return;
    case TileType.WATER:
      rect(context, 'rgba(35,127,157,0.78)', 0, 0, 16, 16);
      rect(context, 'rgba(112,207,224,0.85)', 0, 1, 16, 2);
      rect(context, 'rgba(18,81,119,0.8)', 0, 13, 16, 3);
      rect(context, 'rgba(205,250,249,0.82)', 2 + variation % 4, 2, 5, 1);
      rect(context, 'rgba(135,225,232,0.7)', 9, 7 + variation % 3, 4, 1);
      return;
    case TileType.COAL_ORE:
    case TileType.COPPER_ORE:
    case TileType.IRON_ORE:
    case TileType.GOLD_ORE:
    case TileType.CRYSTAL_ORE:
    case TileType.DIAMOND_ORE:
      drawOre(context, tile, palette, variation);
      return;
    case TileType.CRAFTING_TABLE:
      rect(context, '#451a03', 0, 1, 16, 15);
      rect(context, '#92400e', 1, 5, 14, 11);
      rect(context, '#b45309', 2, 6, 4, 9);
      rect(context, '#b45309', 10, 6, 4, 9);
      rect(context, '#d97706', 0, 1, 16, 4);
      rect(context, '#fbbf24', 1, 1, 14, 2);
      rect(context, '#78350f', 4, 2, 2, 2);
      rect(context, '#78350f', 10, 2, 2, 2);
      rect(context, '#94a3b8', 6, 7, 4, 5);
      rect(context, '#e2e8f0', 7, 8, 2, 3);
      return;
    case TileType.PLANKS:
    case TileType.PLATFORM:
    case TileType.BRIDGE:
      drawPlanks(context, palette, variation);
      if (tile === TileType.PLATFORM) {
        rect(context, '#451a03', 0, 0, 16, 7);
        rect(context, palette.color, 1, 1, 14, 4);
        rect(context, palette.lightColor, 1, 1, 14, 2);
        rect(context, palette.darkColor, 2, 7, 3, 6);
        rect(context, palette.darkColor, 11, 7, 3, 6);
      } else if (tile === TileType.BRIDGE) {
        rect(context, '#451a03', 0, 0, 3, 16);
        rect(context, '#451a03', 13, 0, 3, 16);
        rect(context, '#d97706', 1, 1, 1, 14);
        rect(context, '#d97706', 14, 1, 1, 14);
        rect(context, '#fde68a', 3, 3, 10, 2);
      }
      return;
    case TileType.FURNACE:
      drawRock(context, palette, variation);
      rect(context, '#1e293b', 1, 1, 14, 14);
      rect(context, '#475569', 2, 2, 12, 12);
      rect(context, '#0f172a', 3, 5, 10, 9);
      rect(context, '#ea580c', 4, 7, 8, 6);
      rect(context, '#facc15', 5, 8, 6, 4);
      rect(context, '#fef9c3', 6, 9, 4, 2);
      rect(context, '#94a3b8', 3, 3, 10, 1);
      return;
    case TileType.TORCH:
      rect(context, '#475569', 5, 11, 6, 3);
      rect(context, '#78350f', 6, 6, 4, 10);
      rect(context, '#b45309', 7, 7, 2, 8);
      rect(context, '#ea580c', 4, 1, 8, 7);
      rect(context, '#fbbf24', 5, 0, 6, 6);
      rect(context, '#fef9c3', 6, 1, 4, 4);
      return;
    case TileType.CHEST:
      rect(context, '#451a03', 0, 2, 16, 14);
      rect(context, '#92400e', 1, 3, 14, 12);
      rect(context, '#b45309', 2, 3, 12, 5);
      rect(context, '#f59e0b', 3, 4, 10, 2);
      rect(context, '#1e293b', 0, 7, 16, 2);
      rect(context, '#facc15', 6, 6, 4, 5);
      rect(context, '#fef08a', 7, 7, 2, 3);
      return;
    case TileType.DOOR:
    case TileType.DOOR_OPEN:
      rect(context, '#3b1d0a', 1, 0, 14, 16);
      rect(context, '#92400e', tile === TileType.DOOR ? 2 : 9, 1, tile === TileType.DOOR ? 12 : 5, 14);
      rect(context, '#d97706', tile === TileType.DOOR ? 3 : 10, 2, tile === TileType.DOOR ? 10 : 3, 5);
      rect(context, '#7dd3fc', tile === TileType.DOOR ? 4 : 10, 3, tile === TileType.DOOR ? 8 : 2, 3);
      rect(context, '#b45309', tile === TileType.DOOR ? 3 : 10, 9, tile === TileType.DOOR ? 10 : 3, 5);
      rect(context, '#facc15', tile === TileType.DOOR ? 11 : 9, 8, 2, 2);
      return;
    case TileType.LADDER:
      rect(context, '#451a03', 1, 0, 3, 16);
      rect(context, '#451a03', 12, 0, 3, 16);
      rect(context, '#b45309', 2, 0, 2, 16);
      rect(context, '#b45309', 12, 0, 2, 16);
      for (const ry of [2, 7, 12]) {
        rect(context, '#78350f', 1, ry, 14, 3);
        rect(context, '#f59e0b', 2, ry, 12, 2);
        rect(context, '#fde68a', 3, ry, 10, 1);
      }
      return;
    case TileType.BED:
      rect(context, '#451a03', 0, 4, 3, 12);
      rect(context, '#451a03', 13, 7, 3, 9);
      rect(context, '#78350f', 0, 10, 16, 4);
      rect(context, '#e11d48', 2, 6, 12, 5);
      rect(context, '#fda4af', 7, 6, 6, 2);
      rect(context, '#f8fafc', 2, 5, 5, 4);
      return;
    case TileType.CAMPFIRE:
    case TileType.CAMPFIRE_OFF:
      rect(context, '#475569', 1, 12, 14, 4);
      rect(context, '#78350f', 2, 9, 12, 4);
      rect(context, '#b45309', 3, 10, 10, 2);
      if (tile === TileType.CAMPFIRE) {
        rect(context, '#ea580c', 3, 3, 10, 7);
        rect(context, '#fbbf24', 5, 1, 6, 8);
        rect(context, '#fef9c3', 6, 3, 4, 5);
      } else {
        rect(context, '#9ca3af', 5, 6, 6, 3);
      }
      return;
    case TileType.LEVER:
    case TileType.LEVER_ON:
      rect(context, '#334155', 1, 10, 14, 6);
      rect(context, '#94a3b8', 3, 11, 10, 3);
      rect(context, '#cbd5e1', 7, 4, 2, 7);
      rect(
        context,
        tile === TileType.LEVER_ON ? '#22c55e' : '#ef4444',
        tile === TileType.LEVER_ON ? 9 : 3,
        1,
        5,
        5
      );
      rect(context, '#ffffff', tile === TileType.LEVER_ON ? 10 : 4, 2, 2, 2);
      return;
    case TileType.SIGN:
      rect(context, '#451a03', 6, 8, 4, 8);
      rect(context, '#593718', 0, 1, 16, 9);
      rect(context, '#d97706', 1, 2, 14, 7);
      rect(context, '#fde68a', 2, 3, 12, 5);
      rect(context, '#78350f', 3, 4, 10, 1);
      rect(context, '#78350f', 3, 6, 7, 1);
      return;
    case TileType.PRESSURE_PLATE:
    case TileType.PRESSURE_PLATE_PRESSED:
      rect(context, '#1e293b', 0, 11, 16, 5);
      rect(
        context,
        tile === TileType.PRESSURE_PLATE_PRESSED ? '#f59e0b' : '#cbd5e1',
        1,
        tile === TileType.PRESSURE_PLATE_PRESSED ? 12 : 9,
        14,
        4
      );
      rect(context, '#ffffff', 3, tile === TileType.PRESSURE_PLATE_PRESSED ? 12 : 9, 8, 1);
      return;
    case TileType.TRAPDOOR:
    case TileType.TRAPDOOR_OPEN:
      rect(context, '#451a03', 0, tile === TileType.TRAPDOOR ? 1 : 0, tile === TileType.TRAPDOOR ? 16 : 6, tile === TileType.TRAPDOOR ? 14 : 16);
      rect(context, '#b45309', 1, tile === TileType.TRAPDOOR ? 2 : 1, tile === TileType.TRAPDOOR ? 14 : 4, tile === TileType.TRAPDOOR ? 12 : 14);
      rect(context, '#facc15', tile === TileType.TRAPDOOR ? 11 : 2, 6, 3, 3);
      return;
    case TileType.GATE:
    case TileType.GATE_OPEN:
      rect(context, '#451a03', 0, 0, 4, 16);
      rect(context, '#451a03', 12, 0, 4, 16);
      rect(context, '#b45309', 1, 1, 2, 14);
      rect(context, '#b45309', 13, 1, 2, 14);
      rect(context, '#d97706', 4, 2, tile === TileType.GATE ? 8 : 3, 3);
      rect(context, '#d97706', 4, 7, tile === TileType.GATE ? 8 : 3, 3);
      rect(context, '#d97706', 4, 12, tile === TileType.GATE ? 8 : 3, 3);
      rect(context, '#facc15', 7, 7, 2, 3);
      return;
    case TileType.ROPE:
      rect(context, '#451a03', 5, 0, 6, 16);
      rect(context, '#d97706', 6, 0, 4, 16);
      rect(context, '#fde68a', 6, 1, 3, 2);
      rect(context, '#78350f', 4, 4, 8, 2);
      rect(context, '#fde68a', 5, 4, 6, 1);
      rect(context, '#fde68a', 6, 8, 3, 2);
      rect(context, '#78350f', 4, 12, 8, 2);
      rect(context, '#fde68a', 5, 12, 6, 1);
      return;
    case TileType.TILLED_SOIL:
      rect(context, '#704526', 0, 0, 16, 16);
      for (let row = 0; row < 3; row++) {
        const furrowY = 2 + row * 5;
        rect(context, '#402719', 1, furrowY, 14, 2);
        rect(context, '#a66b3d', 2 + variation % 3, furrowY + 2, 11, 1);
      }
      rect(context, '#d19a61', 3, 4, 2, 1);
      rect(context, '#d19a61', 10, 10, 3, 1);
      return;
    case TileType.BERRY_BUSH:
      rect(context, '#694324', 7, 8, 3, 8);
      drawLeaves(context, { ...palette, color: '#3f7d32', darkColor: '#24552a', lightColor: '#79b84b' }, variation);
      rect(context, '#d83b63', 4, 8, 2, 2);
      rect(context, '#f58aa0', 4, 8, 1, 1);
      rect(context, '#d83b63', 10, 6, 2, 2);
      rect(context, '#f58aa0', 10, 6, 1, 1);
      rect(context, '#d83b63', 8, 11, 2, 2);
      return;
    case TileType.BEAR_SKULL:
      // Wood base mount
      rect(context, '#593718', 3, 13, 10, 2);
      rect(context, '#78350f', 4, 12, 8, 1);
      // Heavy bear cranium
      rect(context, '#e2d9cc', 3, 4, 10, 7);
      rect(context, '#fff8ed', 4, 3, 8, 2);
      rect(context, '#8a7d6b', 3, 9, 10, 2);
      // Deep eye sockets
      rect(context, '#1e1914', 4, 6, 2, 2);
      rect(context, '#1e1914', 9, 6, 2, 2);
      // Broad nasal cavity
      rect(context, '#2c221a', 7, 8, 2, 2);
      // Heavy fangs
      rect(context, '#ffffff', 4, 11, 2, 2);
      rect(context, '#ffffff', 9, 11, 2, 2);
      rect(context, '#fff8ed', 6, 11, 3, 1);
      return;
    case TileType.WOLF_SKULL:
      // Stone/wood pedestal
      rect(context, '#475569', 4, 13, 8, 2);
      // Sleek wolf skull & elongated snout
      rect(context, '#e8e2d5', 4, 3, 8, 5);
      rect(context, '#e8e2d5', 6, 8, 5, 4);
      rect(context, '#faf6ee', 5, 2, 6, 2);
      rect(context, '#968c7c', 4, 7, 8, 1);
      // Eye sockets
      rect(context, '#1e1b18', 5, 5, 2, 2);
      rect(context, '#1e1b18', 8, 5, 2, 2);
      // Nasal cavity
      rect(context, '#2a241f', 7, 9, 2, 2);
      // Sharp predatory canines
      rect(context, '#ffffff', 6, 11, 1, 2);
      rect(context, '#ffffff', 9, 11, 1, 2);
      return;
    case TileType.MAMMOTH_SKULL:
      // Mounting plate
      rect(context, '#3b1d0a', 4, 13, 8, 2);
      // Giant cranium dome
      rect(context, '#f3ede2', 4, 2, 8, 8);
      rect(context, '#ffffff', 5, 1, 6, 2);
      rect(context, '#a89d89', 5, 8, 6, 2);
      // Massive curved ivory tusks sweeping upward
      // Left tusk
      rect(context, '#ffffff', 3, 8, 2, 2);
      rect(context, '#faf3e6', 1, 8, 2, 3);
      rect(context, '#ffffff', 0, 5, 2, 4);
      rect(context, '#fef08a', 1, 2, 2, 3);
      rect(context, '#ffffff', 2, 1, 1, 2);
      // Right tusk
      rect(context, '#ffffff', 11, 8, 2, 2);
      rect(context, '#faf3e6', 13, 8, 2, 3);
      rect(context, '#ffffff', 14, 5, 2, 4);
      rect(context, '#fef08a', 13, 2, 2, 3);
      rect(context, '#ffffff', 13, 1, 1, 2);
      // Eye sockets & trunk socket
      rect(context, '#1f1b16', 5, 5, 2, 2);
      rect(context, '#1f1b16', 9, 5, 2, 2);
      rect(context, '#181410', 7, 7, 2, 3);
      return;
    case TileType.LION_SKULL:
      // Trophy wood plaque
      rect(context, '#593718', 2, 13, 12, 2);
      // Broad feline skull with prominent cheekbones
      rect(context, '#ede0cb', 3, 3, 10, 6);
      rect(context, '#ede0cb', 2, 6, 12, 3);
      rect(context, '#ede0cb', 5, 8, 6, 3);
      rect(context, '#fff5e0', 4, 2, 8, 2);
      rect(context, '#9c8d73', 4, 8, 8, 1);
      // Forward-facing predator eye cavities
      rect(context, '#1e1810', 4, 5, 2, 2);
      rect(context, '#1e1810', 9, 5, 2, 2);
      // Nose cavity
      rect(context, '#2c2217', 7, 8, 2, 2);
      // Lethal feline canines
      rect(context, '#ffffff', 4, 11, 2, 2);
      rect(context, '#ffffff', 10, 11, 2, 2);
      return;
    case TileType.CROCODILE_SKULL:
      // Stone shelf
      rect(context, '#334155', 1, 13, 14, 2);
      // Low, elongated reptilian skull
      rect(context, '#d5ded0', 1, 6, 14, 5);
      rect(context, '#edf7e8', 2, 5, 12, 2);
      rect(context, '#788772', 1, 10, 14, 2);
      // Raised eye ridges
      rect(context, '#1a241b', 4, 4, 2, 2);
      rect(context, '#1a241b', 9, 4, 2, 2);
      // Nostrils
      rect(context, '#162016', 13, 6, 1, 1);
      rect(context, '#162016', 13, 8, 1, 1);
      // Interlocking sharp teeth
      rect(context, '#ffffff', 2, 11, 1, 2);
      rect(context, '#ffffff', 4, 11, 1, 2);
      rect(context, '#ffffff', 6, 11, 1, 2);
      rect(context, '#ffffff', 8, 11, 1, 2);
      rect(context, '#ffffff', 10, 11, 1, 2);
      rect(context, '#ffffff', 12, 11, 1, 2);
      return;
    case TileType.ANIMAL_SKELETON:
      // Wood support mount
      rect(context, '#593718', 2, 14, 12, 2);
      rect(context, '#451a03', 7, 10, 2, 5);
      // Horizontal spine
      rect(context, '#e5ded5', 2, 4, 12, 2);
      rect(context, '#faf3eb', 3, 3, 10, 1);
      // Vertebrae details
      rect(context, '#887d72', 4, 5, 8, 1);
      // Rib cage arches
      rect(context, '#e5ded5', 3, 6, 1, 4);
      rect(context, '#e5ded5', 5, 6, 1, 5);
      rect(context, '#e5ded5', 7, 6, 1, 5);
      rect(context, '#e5ded5', 9, 6, 1, 4);
      rect(context, '#e5ded5', 11, 6, 1, 3);
      // Skull on front
      rect(context, '#faf3eb', 12, 3, 3, 3);
      rect(context, '#181410', 13, 4, 1, 1);
      return;
    case TileType.PROTECTOR:
      // Dark obsidian and deep slate base
      rect(context, '#0f172a', 1, 13, 14, 3);
      rect(context, '#1e293b', 2, 10, 12, 3);
      rect(context, '#334155', 3, 11, 10, 1);
      // Outer protective pylons / rune brackets
      rect(context, '#083344', 2, 3, 2, 8);
      rect(context, '#083344', 12, 3, 2, 8);
      rect(context, '#0891b2', 2, 4, 1, 6);
      rect(context, '#0891b2', 13, 4, 1, 6);
      // Top beacon crown
      rect(context, '#1e293b', 4, 1, 8, 2);
      rect(context, '#06b6d4', 6, 0, 4, 1);
      // Glowing cyan diamond power core
      rect(context, '#0891b2', 5, 4, 6, 6);
      rect(context, '#06b6d4', 6, 3, 4, 8);
      rect(context, '#22d3ee', 6, 5, 4, 4);
      rect(context, '#a5f3fc', 7, 6, 2, 2);
      rect(context, '#ffffff', 7, 5, 1, 1);
      // Base glowing power conduits
      rect(context, '#67e8f9', 4, 12, 8, 1);
      return;
    case TileType.SKY_GRASS:
      // Azure celestial grass over deep cosmic indigo soil
      rect(context, '#4338ca', 0, 3, TILE_SIZE, TILE_SIZE - 3);
      rect(context, '#312e81', 0, 5, TILE_SIZE, 2);
      flecks(context, '#312e81', '#6366f1', variation);
      rect(context, palette.darkColor, 0, 2, TILE_SIZE, 2);
      rect(context, palette.color, 0, 1, TILE_SIZE, 2);
      rect(context, palette.lightColor, (variation * 3) % 8, 0, 5, 3);
      rect(context, '#e0f2fe', 10 + (variation % 4), 0, 4, 2);
      rect(context, '#ffffff', 2, 0, 2, 1);
      rect(context, '#bae6fd', 9, 1, 2, 1);
      return;
    case TileType.SKY_DIRT:
      drawSoil(context, palette, variation);
      rect(context, '#818cf8', 3 + (variation % 5), 4, 2, 1);
      rect(context, '#c7d2fe', 10 - (variation % 4), 9, 1, 1);
      return;
    case TileType.SKY_STONE:
      drawRock(context, palette, variation);
      rect(context, '#c084fc', 4 + (variation % 4), 6, 2, 1);
      rect(context, '#38bdf8', 11 - (variation % 3), 10, 1, 1);
      return;
    case TileType.ASTRAL_ORE:
    case TileType.CELESTIAL_ORE:
      drawOre(context, tile, palette, variation);
      return;
    case TileType.STAR_FLOWER:
      // Glowing 5-pointed celestial starlight blossom
      rect(context, '#0284c7', 7, 9, 2, 7);
      rect(context, '#38bdf8', 6, 12, 1, 2);
      rect(context, '#38bdf8', 9, 11, 1, 2);
      // Soft star blossom aura glow
      rect(context, 'rgba(254,240,138,0.25)', 2, 0, 12, 12);
      // Star petals
      rect(context, '#fef08a', 7, 1, 2, 8);
      rect(context, '#fef08a', 3, 4, 10, 2);
      rect(context, '#ffffff', 6, 3, 4, 4);
      rect(context, '#fef9c3', 7, 4, 2, 2);
      rect(context, '#f59e0b', 7, 7, 2, 1);
      return;
    case TileType.SKY_VINE:
      // Glowing ethereal azure tendrils with starlight nodes
      rect(context, palette.darkColor, 5, 0, 2, 16);
      rect(context, palette.color, 6, 0, 2, 16);
      rect(context, palette.lightColor, 7, 3 + (variation % 3), 3, 2);
      rect(context, '#ffffff', 8, 4 + (variation % 3), 1, 1);
      rect(context, palette.lightColor, 4, 9 + (variation % 4), 3, 2);
      rect(context, '#ffffff', 4, 10 + (variation % 4), 1, 1);
      return;
    case TileType.CELESTIAL_WOOD:
      drawLog(context, palette, variation, tile);
      return;
    case TileType.CELESTIAL_LEAVES:
      drawLeaves(context, palette, variation, tile);
      return;
    default: {
      const unhandledTile: never = tile;
      return unhandledTile;
    }
  }
}

export interface CraftableWorldSpriteInfo {
  canvas: HTMLCanvasElement;
  /** Offset in pixels relative to the anchor tile's top-left (px, py) */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export const CRAFTABLE_STRUCTURE_TILES = new Set<TileType>([
  TileType.CRAFTING_TABLE,
  TileType.FURNACE,
  TileType.CHEST,
  TileType.BED,
  TileType.DOOR,
  TileType.DOOR_OPEN,
  TileType.TRAPDOOR,
  TileType.TRAPDOOR_OPEN,
  TileType.GATE,
  TileType.GATE_OPEN,
  TileType.CAMPFIRE,
  TileType.CAMPFIRE_OFF,
  TileType.TORCH,
  TileType.SIGN,
  TileType.LEVER,
  TileType.LEVER_ON,
  TileType.PRESSURE_PLATE,
  TileType.PRESSURE_PLATE_PRESSED,
  TileType.BRIDGE,
  TileType.PLATFORM,
]);

const craftableWorldSpriteCache = new Map<TileType, CraftableWorldSpriteInfo>();

/**
 * Pre-renders and caches character-proportioned world sprites for craftable furniture,
 * doors, gates, beds, workstations, and mechanisms so they stand tall next to the 14x26 player.
 */
export function getCraftableWorldSprite(tile: TileType): CraftableWorldSpriteInfo | null {
  if (!CRAFTABLE_STRUCTURE_TILES.has(tile) || typeof document === 'undefined') return null;
  const cached = craftableWorldSpriteCache.get(tile);
  if (cached) return cached;

  const createInfo = (
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void
  ): CraftableWorldSpriteInfo | null => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    const info: CraftableWorldSpriteInfo = { canvas, offsetX, offsetY, width, height };
    craftableWorldSpriteCache.set(tile, info);
    return info;
  };

  switch (tile) {
    case TileType.DOOR:
      // Full 2-block-tall (22x32px) Heavy Oak & Iron Door — taller than the 26px player!
      return createInfo(-3, -16, 22, 32, (c) => {
        // Carved top lintel & bottom stone threshold
        rect(c, '#291507', 0, 0, 22, 3);
        rect(c, '#78350f', 1, 1, 20, 2);
        rect(c, '#334155', 0, 29, 22, 3);
        rect(c, '#64748b', 2, 29, 18, 2);
        // Heavy timber outer frame
        rect(c, '#3b1d0a', 1, 3, 20, 26);
        rect(c, '#593718', 2, 3, 2, 26);
        rect(c, '#593718', 18, 3, 2, 26);
        // Thick oak door slab
        rect(c, '#92400e', 4, 4, 14, 25);
        rect(c, '#b45309', 5, 5, 12, 23);
        // Vertical plank seams
        rect(c, '#78350f', 9, 5, 1, 23);
        rect(c, '#78350f', 13, 5, 1, 23);
        // Upper mullioned glass window with warm interior reflection
        rect(c, '#451a03', 6, 6, 10, 8);
        rect(c, '#38bdf8', 7, 7, 8, 6);
        rect(c, '#bae6fd', 7, 7, 3, 2);
        rect(c, '#bae6fd', 12, 7, 3, 2);
        rect(c, '#451a03', 10, 7, 2, 6);
        rect(c, '#451a03', 7, 9, 8, 2);
        // Lower recessed oak panel
        rect(c, '#78350f', 6, 17, 10, 9);
        rect(c, '#d97706', 7, 18, 8, 7);
        rect(c, '#f59e0b', 7, 18, 8, 2);
        // Forged black-iron strap hinges (left)
        rect(c, '#1e293b', 3, 7, 5, 2);
        rect(c, '#1e293b', 3, 15, 4, 2);
        rect(c, '#1e293b', 3, 24, 5, 2);
        // Gleaming brass lockplate & ring handle (right)
        rect(c, '#451a03', 14, 14, 4, 5);
        rect(c, '#facc15', 15, 15, 3, 3);
        rect(c, '#fef9c3', 15, 15, 2, 1);
      });

    case TileType.DOOR_OPEN:
      // Full 2-block-tall (22x32px) Open Doorway Arch with leaf swung open to the right
      return createInfo(-3, -16, 22, 32, (c) => {
        // Lintel & threshold
        rect(c, '#291507', 0, 0, 22, 3);
        rect(c, '#78350f', 1, 1, 20, 2);
        rect(c, '#334155', 0, 29, 22, 3);
        rect(c, '#64748b', 2, 29, 18, 2);
        // Left & right timber doorjamb posts (center passage is clear!)
        rect(c, '#3b1d0a', 1, 3, 3, 26);
        rect(c, '#593718', 2, 3, 2, 26);
        // Swung-open oak door leaf in perspective on the right
        rect(c, '#451a03', 13, 3, 8, 26);
        rect(c, '#b45309', 14, 4, 6, 24);
        rect(c, '#f59e0b', 15, 5, 2, 22);
        rect(c, '#7dd3fc', 16, 6, 3, 6);
        rect(c, '#facc15', 12, 15, 2, 3);
        rect(c, '#facc15', 20, 15, 2, 3);
      });

    case TileType.GATE:
      // 26px wide x 28px tall Double Timber Stockade Gate
      return createInfo(-5, -12, 26, 28, (c) => {
        // Left & Right heavy timber posts with pyramid finials
        rect(c, '#291507', 0, 2, 5, 26);
        rect(c, '#291507', 21, 2, 5, 26);
        rect(c, '#78350f', 1, 0, 3, 2);
        rect(c, '#78350f', 22, 0, 3, 2);
        rect(c, '#92400e', 1, 3, 3, 24);
        rect(c, '#92400e', 22, 3, 3, 24);
        rect(c, '#d97706', 1, 3, 1, 24);
        rect(c, '#d97706', 22, 3, 1, 24);
        // Iron post collars
        rect(c, '#334155', 0, 5, 5, 2);
        rect(c, '#334155', 21, 5, 5, 2);
        rect(c, '#334155', 0, 23, 5, 2);
        rect(c, '#334155', 21, 23, 5, 2);
        // Vertical palisade pickets across the center
        for (const px of [6, 9, 14, 17]) {
          rect(c, '#451a03', px, 4, 3, 22);
          rect(c, '#b45309', px, 5, 2, 20);
          rect(c, '#f59e0b', px, 4, 2, 2);
        }
        // Horizontal crossbeams
        rect(c, '#451a03', 5, 8, 16, 4);
        rect(c, '#d97706', 5, 9, 16, 2);
        rect(c, '#451a03', 5, 19, 16, 4);
        rect(c, '#d97706', 5, 20, 16, 2);
        // Center gap & heavy iron slide latch
        rect(c, '#291507', 12, 4, 2, 22);
        rect(c, '#1e293b', 9, 13, 8, 4);
        rect(c, '#facc15', 11, 14, 4, 2);
      });

    case TileType.GATE_OPEN:
      // 26px wide x 28px tall Open Stockade Gate with leaves swung outward
      return createInfo(-5, -12, 26, 28, (c) => {
        // Left & Right heavy timber posts
        rect(c, '#291507', 0, 2, 5, 26);
        rect(c, '#291507', 21, 2, 5, 26);
        rect(c, '#78350f', 1, 0, 3, 2);
        rect(c, '#78350f', 22, 0, 3, 2);
        rect(c, '#92400e', 1, 3, 3, 24);
        rect(c, '#92400e', 22, 3, 3, 24);
        // Swung-open gate leaves on each side
        rect(c, '#451a03', 5, 5, 4, 20);
        rect(c, '#d97706', 5, 6, 3, 18);
        rect(c, '#451a03', 17, 5, 4, 20);
        rect(c, '#d97706', 18, 6, 3, 18);
        rect(c, '#facc15', 7, 14, 2, 2);
        rect(c, '#facc15', 17, 14, 2, 2);
      });

    case TileType.BED:
      // 32px wide (2 full blocks!) x 22px tall Cozy Character-Sized Bed
      return createInfo(-8, -6, 32, 22, (c) => {
        // Tall carved headboard (left) & footboard (right)
        rect(c, '#291507', 0, 0, 5, 22);
        rect(c, '#92400e', 1, 2, 3, 20);
        rect(c, '#facc15', 1, 0, 3, 2); // Brass headboard finial
        rect(c, '#291507', 27, 6, 5, 16);
        rect(c, '#92400e', 28, 7, 3, 15);
        rect(c, '#facc15', 28, 5, 3, 2);
        // Plump feather pillow
        rect(c, '#475569', 5, 6, 9, 6);
        rect(c, '#f8fafc', 5, 7, 8, 5);
        rect(c, '#ffffff', 6, 7, 6, 2);
        // Quilted crimson & rose blanket with folded sheet cuff
        rect(c, '#4c0519', 12, 7, 16, 8);
        rect(c, '#e11d48', 13, 8, 14, 6);
        rect(c, '#fda4af', 13, 8, 14, 2);
        rect(c, '#f8fafc', 12, 8, 3, 6); // Sheet fold
        rect(c, '#facc15', 16, 12, 10, 1); // Gold trim
        // Heavy oak side rail & bed frame
        rect(c, '#3b1d0a', 3, 13, 26, 5);
        rect(c, '#b45309', 4, 14, 24, 3);
        rect(c, '#d97706', 5, 14, 22, 1);
      });

    case TileType.CRAFTING_TABLE:
      // 26px wide x 22px tall Carpenter's Workbench with tools & vise
      return createInfo(-5, -6, 26, 22, (c) => {
        // Resting hammer & blueprint on top of the bench
        rect(c, '#38bdf8', 5, 2, 7, 2);
        rect(c, '#e0f2fe', 6, 2, 5, 1);
        rect(c, '#78350f', 16, 2, 5, 2);
        rect(c, '#cbd5e1', 19, 0, 3, 4);
        // Overhanging thick butcher-block tabletop
        rect(c, '#291507', 0, 4, 26, 6);
        rect(c, '#d97706', 1, 5, 24, 4);
        rect(c, '#fbbf24', 2, 5, 22, 2);
        // Crafting grid inlay marks on tabletop
        rect(c, '#78350f', 7, 6, 2, 2);
        rect(c, '#78350f', 12, 6, 2, 2);
        rect(c, '#78350f', 17, 6, 2, 2);
        // Side carpenter's iron vise (left)
        rect(c, '#334155', 0, 6, 3, 5);
        rect(c, '#94a3b8', 0, 7, 2, 3);
        // Heavy braced timber legs & lower tool shelf
        rect(c, '#3b1d0a', 2, 10, 22, 12);
        rect(c, '#92400e', 3, 10, 4, 12);
        rect(c, '#92400e', 19, 10, 4, 12);
        rect(c, '#78350f', 7, 16, 12, 3);
        rect(c, '#b45309', 7, 16, 12, 1);
        // Hanging steel handsaw in center
        rect(c, '#cbd5e1', 9, 11, 8, 4);
        rect(c, '#f8fafc', 10, 12, 6, 2);
        rect(c, '#ea580c', 8, 11, 2, 3);
      });

    case TileType.FURNACE:
      // 24px wide x 28px tall Stone Smelting Forge & Chimney Kiln
      return createInfo(-4, -12, 24, 28, (c) => {
        // Top stone chimney stack with warm ember glow
        rect(c, '#1e293b', 6, 0, 12, 7);
        rect(c, '#475569', 7, 1, 10, 6);
        rect(c, '#64748b', 5, 0, 14, 2);
        rect(c, '#fb923c', 9, 0, 6, 1);
        // Domed stone smelter body
        rect(c, '#0f172a', 1, 6, 22, 22);
        rect(c, '#475569', 2, 7, 20, 20);
        rect(c, '#64748b', 3, 8, 18, 4);
        // Cobblestone masonry seams
        rect(c, '#334155', 2, 13, 20, 1);
        rect(c, '#334155', 8, 8, 1, 5);
        rect(c, '#334155', 15, 8, 1, 5);
        // Heavy iron reinforcement band
        rect(c, '#1e293b', 0, 12, 24, 3);
        rect(c, '#94a3b8', 2, 13, 2, 1);
        rect(c, '#94a3b8', 20, 13, 2, 1);
        // Arched firebox opening & roaring smelt fire
        rect(c, '#090d16', 5, 15, 14, 11);
        rect(c, '#dc2626', 6, 17, 12, 8);
        rect(c, '#f97316', 7, 18, 10, 7);
        rect(c, '#facc15', 8, 19, 8, 5);
        rect(c, '#fef9c3', 10, 20, 4, 3);
        // Iron firebox grate bars
        rect(c, '#1e293b', 8, 16, 1, 9);
        rect(c, '#1e293b', 11, 16, 2, 9);
        rect(c, '#1e293b', 15, 16, 1, 9);
        // Stone hearth base
        rect(c, '#334155', 0, 25, 24, 3);
        rect(c, '#94a3b8', 2, 26, 20, 1);
      });

    case TileType.CHEST:
      // 24px wide x 20px tall Heavy Iron-Bound Treasure Trunk
      return createInfo(-4, -4, 24, 20, (c) => {
        // Outer dark timber & iron silhouette
        rect(c, '#291507', 0, 1, 24, 19);
        rect(c, '#3b1d0a', 1, 0, 22, 2);
        // Domed oak lid
        rect(c, '#b45309', 2, 1, 20, 7);
        rect(c, '#d97706', 3, 2, 18, 4);
        rect(c, '#fbbf24', 4, 2, 16, 2);
        // Lower oak trunk box
        rect(c, '#78350f', 2, 9, 20, 10);
        rect(c, '#92400e', 3, 10, 18, 7);
        rect(c, '#b45309', 4, 11, 16, 3);
        // Forged iron seam & vertical straps
        rect(c, '#1e293b', 0, 7, 24, 3);
        rect(c, '#1e293b', 3, 1, 3, 18);
        rect(c, '#1e293b', 18, 1, 3, 18);
        rect(c, '#475569', 4, 2, 1, 16);
        rect(c, '#475569', 19, 2, 1, 16);
        // Prominent golden lockplate & keyhole
        rect(c, '#92400e', 9, 5, 6, 7);
        rect(c, '#facc15', 10, 6, 4, 5);
        rect(c, '#fef9c3', 10, 6, 3, 2);
        rect(c, '#1e293b', 11, 8, 2, 2);
      });

    case TileType.CAMPFIRE:
    case TileType.CAMPFIRE_OFF:
      // 26px wide x 24px tall Outdoor Firepit with Boulders, Split Logs & Tripod
      return createInfo(-5, -8, 26, 24, (c) => {
        // Tripod wooden frame & hanging hook
        rect(c, '#451a03', 3, 4, 2, 16);
        rect(c, '#451a03', 21, 4, 2, 16);
        rect(c, '#593718', 5, 1, 2, 5);
        rect(c, '#593718', 19, 1, 2, 5);
        rect(c, '#291507', 6, 1, 14, 2);
        rect(c, '#94a3b8', 12, 3, 2, 4);
        // Crossed split firewood logs
        rect(c, '#3b1d0a', 3, 15, 20, 5);
        rect(c, '#78350f', 4, 16, 18, 3);
        rect(c, '#b45309', 6, 14, 14, 3);
        if (tile === TileType.CAMPFIRE) {
          // Base roaring flame & glowing coals (animated flames layer on top in renderer)
          rect(c, '#dc2626', 6, 9, 14, 8);
          rect(c, '#f97316', 8, 6, 10, 10);
          rect(c, '#facc15', 9, 4, 8, 11);
          rect(c, '#fef9c3', 11, 7, 4, 7);
        } else {
          rect(c, '#64748b', 8, 14, 10, 3);
        }
        // Ring of river boulders at the base
        rect(c, '#1e293b', 0, 19, 26, 5);
        for (const sx of [1, 6, 11, 16, 21]) {
          rect(c, '#475569', sx, 19, 4, 4);
          rect(c, '#94a3b8', sx + 1, 19, 2, 2);
        }
      });

    case TileType.TORCH:
      // 12px wide x 22px tall Iron-Bracketed Wall/Floor Sconce Torch
      return createInfo(2, -6, 12, 22, (c) => {
        // Forged iron sconce ring & base
        rect(c, '#1e293b', 2, 14, 8, 4);
        rect(c, '#64748b', 3, 15, 6, 2);
        // Thick timber torch shaft
        rect(c, '#3b1d0a', 4, 7, 4, 15);
        rect(c, '#92400e', 5, 8, 2, 13);
        // Pitch-soaked iron brazier basket
        rect(c, '#1e293b', 3, 6, 6, 3);
        rect(c, '#475569', 4, 7, 4, 1);
        // Glowing ember core (animated flame dances above in renderer)
        rect(c, '#ea580c', 3, 1, 6, 6);
        rect(c, '#fbbf24', 4, 0, 4, 6);
        rect(c, '#fef9c3', 5, 2, 2, 3);
      });

    case TileType.SIGN:
      // 24px wide x 24px tall Framed Roadside Signpost
      return createInfo(-4, -8, 24, 24, (c) => {
        // Sturdy central post & base stones
        rect(c, '#334155', 7, 21, 10, 3);
        rect(c, '#3b1d0a', 9, 12, 6, 12);
        rect(c, '#92400e', 10, 12, 4, 11);
        // Wide framed notice board
        rect(c, '#291507', 0, 0, 24, 14);
        rect(c, '#78350f', 1, 1, 22, 12);
        rect(c, '#d97706', 2, 2, 20, 10);
        rect(c, '#fde68a', 3, 3, 18, 8);
        // Iron corner brackets
        rect(c, '#334155', 1, 1, 3, 3);
        rect(c, '#334155', 20, 1, 3, 3);
        rect(c, '#334155', 1, 10, 3, 3);
        rect(c, '#334155', 20, 10, 3, 3);
        // Crisp pixel lettering lines
        rect(c, '#451a03', 5, 4, 14, 2);
        rect(c, '#78350f', 5, 7, 11, 1);
        rect(c, '#78350f', 5, 9, 8, 1);
      });

    case TileType.LEVER:
    case TileType.LEVER_ON: {
      // 20px wide x 22px tall Heavy Industrial Switch Mechanism
      const isOn = tile === TileType.LEVER_ON;
      return createInfo(-2, -6, 20, 22, (c) => {
        // Riveted stone & iron base housing
        rect(c, '#0f172a', 1, 14, 18, 8);
        rect(c, '#475569', 2, 15, 16, 6);
        rect(c, '#94a3b8', 3, 16, 14, 2);
        rect(c, isOn ? '#22c55e' : '#ef4444', 8, 18, 4, 2);
        // Angled steel throw-arm
        if (isOn) {
          rect(c, '#475569', 9, 10, 3, 5);
          rect(c, '#cbd5e1', 11, 6, 3, 5);
          rect(c, '#e2e8f0', 13, 3, 3, 4);
          // Large glowing emerald handle orb
          rect(c, '#14532d', 12, 0, 7, 6);
          rect(c, '#22c55e', 13, 1, 5, 4);
          rect(c, '#bbf7d0', 14, 1, 2, 2);
        } else {
          rect(c, '#475569', 8, 10, 3, 5);
          rect(c, '#cbd5e1', 6, 6, 3, 5);
          rect(c, '#e2e8f0', 4, 3, 3, 4);
          // Large glowing crimson handle orb
          rect(c, '#7f1d1d', 1, 0, 7, 6);
          rect(c, '#ef4444', 2, 1, 5, 4);
          rect(c, '#fecaca', 3, 1, 2, 2);
        }
      });
    }

    case TileType.TRAPDOOR:
      // 22px wide x 8px thick Heavy Iron-Hinged Floor Hatch
      return createInfo(-3, 0, 22, 8, (c) => {
        rect(c, '#291507', 0, 0, 22, 8);
        rect(c, '#92400e', 1, 1, 20, 6);
        rect(c, '#d97706', 2, 1, 18, 3);
        rect(c, '#1e293b', 2, 0, 4, 8);
        rect(c, '#1e293b', 16, 0, 4, 8);
        rect(c, '#facc15', 10, 2, 4, 4);
        rect(c, '#291507', 11, 3, 2, 2);
      });

    case TileType.TRAPDOOR_OPEN:
      // 8px wide x 24px tall Swung-Open Vertical Hatch
      return createInfo(0, -8, 8, 24, (c) => {
        rect(c, '#291507', 0, 0, 8, 24);
        rect(c, '#92400e', 1, 1, 6, 22);
        rect(c, '#d97706', 2, 2, 3, 20);
        rect(c, '#1e293b', 0, 3, 8, 3);
        rect(c, '#1e293b', 0, 18, 8, 3);
        rect(c, '#facc15', 2, 9, 4, 4);
      });

    case TileType.PRESSURE_PLATE:
    case TileType.PRESSURE_PLATE_PRESSED: {
      const pressed = tile === TileType.PRESSURE_PLATE_PRESSED;
      return createInfo(-2, 9, 20, 7, (c) => {
        const topY = pressed ? 3 : 0;
        rect(c, '#0f172a', 0, topY + 2, 20, 5 - (pressed ? 1 : 0));
        rect(c, pressed ? '#d97706' : '#64748b', 1, topY, 18, 4);
        rect(c, pressed ? '#fde047' : '#cbd5e1', 2, topY, 16, 2);
        rect(c, pressed ? '#fef9c3' : '#f8fafc', 4, topY, 12, 1);
      });
    }

    case TileType.PLATFORM:
      // 18px wide x 12px tall Braced Timber Platform Deck
      return createInfo(-1, 0, 18, 12, (c) => {
        rect(c, '#291507', 0, 0, 18, 6);
        rect(c, '#b45309', 1, 1, 16, 4);
        rect(c, '#fbbf24', 1, 1, 16, 2);
        // Support struts
        rect(c, '#3b1d0a', 2, 6, 3, 6);
        rect(c, '#3b1d0a', 13, 6, 3, 6);
        rect(c, '#78350f', 3, 6, 2, 5);
        rect(c, '#78350f', 13, 6, 2, 5);
      });

    case TileType.BRIDGE:
      // 18px wide x 22px tall Rope-Railed Timber Suspension Bridge
      return createInfo(-1, -6, 18, 22, (c) => {
        // Vertical handrail stanchions
        rect(c, '#3b1d0a', 1, 0, 3, 14);
        rect(c, '#3b1d0a', 14, 0, 3, 14);
        rect(c, '#92400e', 2, 1, 1, 12);
        rect(c, '#92400e', 15, 1, 1, 12);
        // Braided hemp safety rope handrail
        rect(c, '#78350f', 0, 1, 18, 3);
        rect(c, '#fde68a', 0, 1, 18, 2);
        rect(c, '#b45309', 0, 7, 18, 2);
        // Thick timber bridge deck & under-truss
        rect(c, '#291507', 0, 12, 18, 10);
        rect(c, '#92400e', 1, 13, 16, 5);
        rect(c, '#f59e0b', 1, 13, 16, 2);
        rect(c, '#451a03', 3, 18, 3, 4);
        rect(c, '#451a03', 12, 18, 3, 4);
      });

    default:
      return null;
  }
}


export function getBlockSprite(tile: TileType, variation = 0): HTMLCanvasElement | null {
  if (tile === TileType.AIR || typeof document === 'undefined') return null;
  const spriteVariation = ((variation % 4) + 4) % 4;
  const key = `${tile}:${spriteVariation}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const sprite = document.createElement('canvas');
  sprite.width = TILE_SIZE;
  sprite.height = TILE_SIZE;
  const context = sprite.getContext('2d', { alpha: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  drawArt(context, tile, spriteVariation);
  spriteCache.set(key, sprite);
  return sprite;
}

export function getBlockVisualVariant(seed: number, worldX: number, worldY: number): number {
  let hash = Math.imul(seed ^ worldX, 0x45d9f3b);
  hash = Math.imul(hash ^ worldY, 0x45d9f3b);
  hash ^= hash >>> 16;
  return hash & 3;
}

export function getItemTileType(item: string): TileType | null {
  return ITEM_TO_TILE[item as ItemType] ?? extraItemTiles.get(item) ?? null;
}