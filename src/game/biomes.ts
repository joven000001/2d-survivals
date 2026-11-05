import { TileType } from './types';

export type BiomeType =
  | 'PLAINS' | 'FOREST' | 'BIRCH_FOREST' | 'DESERT' | 'SNOWY_PLAINS' | 'MOUNTAINS' | 'JUNGLE'
  | 'OCEAN' | 'BEACH' | 'SWAMP' | 'SNOWY_TAIGA' | 'ICE_MOUNTAINS' | 'BADLANDS' | 'AUTUMN_FOREST'
  | 'MUSHROOM_FOREST' | 'VOLCANIC' | 'CRYSTAL_CAVERNS'
  | 'SAVANNA' | 'TROPICAL_ISLAND' | 'REDWOOD_FOREST' | 'BAMBOO_FOREST' | 'FLOWER_MEADOW'
  | 'CHERRY_BLOSSOM_FOREST' | 'DARK_FOREST' | 'MANGROVE_SWAMP' | 'GIANT_MUSHROOM_FIELDS'
  | 'CORAL_COAST' | 'DEEP_OCEAN' | 'FROZEN_OCEAN' | 'GLACIER' | 'TUNDRA' | 'ROCKY_HIGHLANDS'
  | 'CANYON' | 'SALT_FLATS' | 'OASIS_DESERT' | 'RAINFOREST' | 'MISTY_FOREST' | 'ENCHANTED_FOREST'
  | 'ANCIENT_FOREST' | 'CRYSTAL_FOREST' | 'ASHLANDS' | 'LAVA_FIELDS' | 'VOLCANIC_MOUNTAINS'
  | 'UNDERGROUND_JUNGLE' | 'DEEP_CAVERNS' | 'GLOW_CAVERNS' | 'MUSHROOM_CAVERNS' | 'ICE_CAVERNS';
export type TreeType = 'oak' | 'birch' | 'jungle' | 'acacia' | 'redwood' | 'cherry' | 'mangrove' | 'mushroom' | 'dark' | 'ancient' | 'palm' | 'celestial' | 'none';
export type BiomeCategory = 'SURFACE' | 'COLD' | 'SPECIAL' | 'UNDERGROUND' | 'VOLCANIC';
export interface BiomeDefinition {
  id: BiomeType; name: string; category: BiomeCategory; underground: boolean;
  surfaceBlock: TileType; undergroundBlock: TileType; deepBlock: TileType;
  terrainHeightModifier: number; terrainStyle: 'rolling' | 'flat' | 'mountain' | 'coastal' | 'canyon' | 'cavern';
  treeType: TreeType; treeDensity: number; vegetationDensity: number; mapColor: string; waterLevel?: number;
}

const surface = (id: BiomeType, name: string, category: BiomeCategory, s: TileType, u: TileType, d: TileType, h: number, tree: TreeType, td: number, vd: number, color: string, style: BiomeDefinition['terrainStyle'] = 'rolling', waterLevel?: number): BiomeDefinition => ({ id, name, category, underground: false, surfaceBlock:s, undergroundBlock:u, deepBlock:d, terrainHeightModifier:h, treeType:tree, treeDensity:td, vegetationDensity:vd, mapColor:color, terrainStyle:style, waterLevel });
const cave = (id: BiomeType, name: string, s: TileType, u: TileType, d: TileType, color: string): BiomeDefinition => ({ id,name,category:'UNDERGROUND',underground:true,surfaceBlock:s,undergroundBlock:u,deepBlock:d,terrainHeightModifier:1,terrainStyle:'cavern',treeType:'none',treeDensity:0,vegetationDensity:0.12,mapColor:color });
export const BIOMES: Record<BiomeType, BiomeDefinition> = {
 PLAINS:surface('PLAINS','Plains','SURFACE',TileType.GRASS,TileType.DIRT,TileType.STONE,1,'oak',.08,.18,'#84cc16'),
 FOREST:surface('FOREST','Forest','SURFACE',TileType.GRASS,TileType.DIRT,TileType.STONE,1.35,'oak',.94,.7,'#15803d'),
 BIRCH_FOREST:surface('BIRCH_FOREST','Birch Forest','SURFACE',TileType.GRASS,TileType.DIRT,TileType.STONE,1.3,'birch',.92,.62,'#65a30d'),
 DESERT:surface('DESERT','Desert','SURFACE',TileType.SAND,TileType.SANDSTONE,TileType.STONE,.7,'none',0,.015,'#eabf62','flat'),
 SNOWY_PLAINS:surface('SNOWY_PLAINS','Snowy Plains','COLD',TileType.SNOW,TileType.SNOWY_DIRT,TileType.STONE,1.2,'oak',.035,.02,'#dbeafe'),
 MOUNTAINS:surface('MOUNTAINS','Mountains','SURFACE',TileType.GRASS,TileType.DIRT,TileType.STONE,2.8,'oak',.04,.12,'#64748b','mountain'),
 JUNGLE:surface('JUNGLE','Jungle','SURFACE',TileType.GRASS,TileType.DIRT,TileType.STONE,1.55,'jungle',.98,.94,'#166534'),
 OCEAN:surface('OCEAN','Ocean','SURFACE',TileType.SAND,TileType.SANDSTONE,TileType.STONE,.42,'none',0,.02,'#168aad','coastal',68),
 BEACH:surface('BEACH','Beach','SURFACE',TileType.SAND,TileType.SAND,TileType.STONE,.25,'none',0,.025,'#f4d58d','coastal',68),
 SWAMP:surface('SWAMP','Swamp','SURFACE',TileType.MUD,TileType.MUD,TileType.STONE,.32,'mangrove',.18,.42,'#557c55','flat',69),
 SNOWY_TAIGA:surface('SNOWY_TAIGA','Snowy Taiga','COLD',TileType.SNOW,TileType.SNOWY_DIRT,TileType.STONE,1.25,'redwood',.84,.2,'#9ab7a6'),
 ICE_MOUNTAINS:surface('ICE_MOUNTAINS','Ice Mountains','COLD',TileType.PACKED_ICE,TileType.SNOWY_DIRT,TileType.STONE,2.7,'none',0,.01,'#9adcf5','mountain'),
 BADLANDS:surface('BADLANDS','Badlands / Mesa','SURFACE',TileType.RED_SAND,TileType.SANDSTONE,TileType.STONE,1.7,'none',0,.025,'#c65d3a','canyon'),
 AUTUMN_FOREST:surface('AUTUMN_FOREST','Autumn Forest','SPECIAL',TileType.FLOWER_GRASS,TileType.DIRT,TileType.STONE,1.4,'cherry',.76,.4,'#d97732'),
 MUSHROOM_FOREST:surface('MUSHROOM_FOREST','Mushroom Forest','SPECIAL',TileType.MUSHROOM_GRASS,TileType.MUD,TileType.STONE,1.15,'mushroom',.24,.5,'#a855a0'),
 VOLCANIC:surface('VOLCANIC','Volcanic','VOLCANIC',TileType.BASALT,TileType.BASALT,TileType.STONE,2.2,'none',0,.04,'#6b3940','mountain'),
 CRYSTAL_CAVERNS:cave('CRYSTAL_CAVERNS','Crystal Caverns',TileType.STONE,TileType.STONE,TileType.STONE,'#a78bfa'),
 SAVANNA:surface('SAVANNA','Savanna','SURFACE',TileType.DRY_GRASS,TileType.DIRT,TileType.STONE,.85,'acacia',.16,.08,'#c5a548','flat'),
 TROPICAL_ISLAND:surface('TROPICAL_ISLAND','Tropical Island','SURFACE',TileType.SAND,TileType.DIRT,TileType.STONE,.42,'jungle',.2,.2,'#38bda5','coastal',68),
 REDWOOD_FOREST:surface('REDWOOD_FOREST','Redwood Forest','SURFACE',TileType.GRASS,TileType.DIRT,TileType.STONE,1.75,'redwood',.82,.4,'#356b4b'),
 BAMBOO_FOREST:surface('BAMBOO_FOREST','Bamboo Forest','SURFACE',TileType.GRASS,TileType.MUD,TileType.STONE,1.25,'jungle',.72,.82,'#5b9e45'),
 FLOWER_MEADOW:surface('FLOWER_MEADOW','Flower Meadow','SPECIAL',TileType.FLOWER_GRASS,TileType.DIRT,TileType.STONE,.78,'none',0,.8,'#e879a9','rolling'),
 CHERRY_BLOSSOM_FOREST:surface('CHERRY_BLOSSOM_FOREST','Cherry Blossom Forest','SPECIAL',TileType.GRASS,TileType.DIRT,TileType.STONE,1.08,'cherry',.78,.48,'#f0a6ca'),
 DARK_FOREST:surface('DARK_FOREST','Dark Forest','SPECIAL',TileType.GRASS,TileType.MUD,TileType.STONE,1.4,'dark',.9,.55,'#344b42'),
 MANGROVE_SWAMP:surface('MANGROVE_SWAMP','Mangrove Swamp','SURFACE',TileType.MUD,TileType.MUD,TileType.STONE,.3,'mangrove',.4,.48,'#557762','flat',69),
 GIANT_MUSHROOM_FIELDS:surface('GIANT_MUSHROOM_FIELDS','Giant Mushroom Fields','SPECIAL',TileType.MUSHROOM_GRASS,TileType.MUD,TileType.STONE,.68,'mushroom',.28,.48,'#bd5da7','flat'),
 CORAL_COAST:surface('CORAL_COAST','Coral Coast','SURFACE',TileType.SAND,TileType.SANDSTONE,TileType.STONE,.25,'none',0,.12,'#41b8b0','coastal',68),
 DEEP_OCEAN:surface('DEEP_OCEAN','Deep Ocean','SURFACE',TileType.SAND,TileType.STONE,TileType.STONE,1.25,'none',0,.05,'#145781','coastal',75),
 FROZEN_OCEAN:surface('FROZEN_OCEAN','Frozen Ocean','COLD',TileType.PACKED_ICE,TileType.SNOW,TileType.STONE,.3,'none',0,.01,'#a5d9e8','coastal',68),
 GLACIER:surface('GLACIER','Glacier','COLD',TileType.ICE,TileType.PACKED_ICE,TileType.STONE,1.9,'none',0,.015,'#bae6fd','mountain'),
 TUNDRA:surface('TUNDRA','Tundra','COLD',TileType.SNOW,TileType.SNOWY_DIRT,TileType.STONE,.76,'none',0,.03,'#cbd5c2','flat'),
 ROCKY_HIGHLANDS:surface('ROCKY_HIGHLANDS','Rocky Highlands','SURFACE',TileType.STONE,TileType.STONE,TileType.STONE,2.1,'none',0,.035,'#898b80','mountain'),
 CANYON:surface('CANYON','Canyon','SURFACE',TileType.RED_SAND,TileType.SANDSTONE,TileType.STONE,2.2,'none',0,.02,'#b4533c','canyon'),
 SALT_FLATS:surface('SALT_FLATS','Salt Flats','SURFACE',TileType.SALT,TileType.SALT,TileType.STONE,.18,'none',0,.005,'#ddd8c9','flat'),
 OASIS_DESERT:surface('OASIS_DESERT','Oasis Desert','SURFACE',TileType.SAND,TileType.SANDSTONE,TileType.STONE,.7,'palm',.08,.04,'#c8ad60','flat',68),
 RAINFOREST:surface('RAINFOREST','Rainforest','SURFACE',TileType.MUD,TileType.MUD,TileType.STONE,1.65,'jungle',.98,.92,'#1d694b'),
 MISTY_FOREST:surface('MISTY_FOREST','Misty Forest','SPECIAL',TileType.GRASS,TileType.MUD,TileType.STONE,1.45,'redwood',.76,.4,'#62877b'),
 ENCHANTED_FOREST:surface('ENCHANTED_FOREST','Enchanted Forest','SPECIAL',TileType.FLOWER_GRASS,TileType.DIRT,TileType.STONE,1.1,'cherry',.72,.52,'#7455b7'),
 ANCIENT_FOREST:surface('ANCIENT_FOREST','Ancient Forest','SPECIAL',TileType.GRASS,TileType.DIRT,TileType.STONE,1.7,'ancient',.34,.32,'#466445'),
 CRYSTAL_FOREST:surface('CRYSTAL_FOREST','Crystal Forest','SPECIAL',TileType.GRASS,TileType.STONE,TileType.STONE,1.2,'none',0,.14,'#54c5d0'),
 ASHLANDS:surface('ASHLANDS','Ashlands','VOLCANIC',TileType.ASH,TileType.ASH,TileType.BASALT,1.1,'none',0,.01,'#55545b','flat'),
 LAVA_FIELDS:surface('LAVA_FIELDS','Lava Fields','VOLCANIC',TileType.BASALT,TileType.BASALT,TileType.STONE,1.25,'none',0,.01,'#9d3b2e','rolling'),
 VOLCANIC_MOUNTAINS:surface('VOLCANIC_MOUNTAINS','Volcanic Mountains','VOLCANIC',TileType.BASALT,TileType.BASALT,TileType.STONE,3,'none',0,.015,'#713d3a','mountain'),
 UNDERGROUND_JUNGLE:cave('UNDERGROUND_JUNGLE','Underground Jungle',TileType.MUD,TileType.MUD,TileType.STONE,'#26734d'),
 DEEP_CAVERNS:cave('DEEP_CAVERNS','Deep Caverns',TileType.STONE,TileType.STONE,TileType.STONE,'#596273'),
 GLOW_CAVERNS:cave('GLOW_CAVERNS','Glow Caverns',TileType.GLOWING_CRYSTAL,TileType.STONE,TileType.STONE,'#39c9c4'),
 MUSHROOM_CAVERNS:cave('MUSHROOM_CAVERNS','Mushroom Caverns',TileType.GLOWING_MUSHROOM,TileType.MUD,TileType.STONE,'#b35ca8'),
 ICE_CAVERNS:cave('ICE_CAVERNS','Ice Caverns',TileType.ICE,TileType.PACKED_ICE,TileType.STONE,'#80c9ed'),
};

export const BIOME_LIST = Object.values(BIOMES);
export const BIOME_CATEGORIES: BiomeCategory[] = ['SURFACE','COLD','SPECIAL','UNDERGROUND','VOLCANIC'];
export type BiomeRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'VERY_RARE';
const rarityGroups: Record<BiomeRarity, BiomeType[]> = {
 COMMON:['PLAINS','FOREST','DESERT','SAVANNA','SNOWY_PLAINS','JUNGLE','MOUNTAINS','SNOWY_TAIGA'],
 UNCOMMON:['OCEAN','BIRCH_FOREST','AUTUMN_FOREST','REDWOOD_FOREST','BAMBOO_FOREST','SWAMP','MANGROVE_SWAMP','BADLANDS','TUNDRA','GLACIER','ICE_MOUNTAINS','BEACH','FROZEN_OCEAN','FLOWER_MEADOW','CHERRY_BLOSSOM_FOREST','DARK_FOREST','MISTY_FOREST','ANCIENT_FOREST','OASIS_DESERT','CANYON','SALT_FLATS','ROCKY_HIGHLANDS','TROPICAL_ISLAND','CORAL_COAST','RAINFOREST'],
 RARE:['MUSHROOM_FOREST','GIANT_MUSHROOM_FIELDS','ENCHANTED_FOREST','CRYSTAL_FOREST','CRYSTAL_CAVERNS','UNDERGROUND_JUNGLE','MUSHROOM_CAVERNS','GLOW_CAVERNS'],
 VERY_RARE:['VOLCANIC','VOLCANIC_MOUNTAINS','LAVA_FIELDS','ASHLANDS','DEEP_OCEAN','ICE_CAVERNS','DEEP_CAVERNS'],
};
export const BIOME_RARITY: Record<BiomeType, BiomeRarity> = Object.fromEntries(Object.entries(rarityGroups).flatMap(([rarity,ids])=>ids.map(id=>[id,rarity]))) as Record<BiomeType,BiomeRarity>;
