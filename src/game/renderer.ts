import {
  CHUNK_PIXEL_HEIGHT,
  CHUNK_PIXEL_WIDTH,
  SURFACE_BASE_Y,
  TILE_SIZE,
} from './constants';
import { ChunkManager } from './chunkManager';
import { ActiveFoodBuff, Camera, Cloud, DayNightCycle, Particle, Player, RemotePlayerState, TileType, WeatherType } from './types';
import { BlockInteraction } from './blockInteraction';
import { ItemDropManager } from './itemDrop';
import { EnemyManager } from './enemy';
import { WildlifeManager } from './wildlife';
import type { HotbarSlot } from './inventory';
import { getCropGrowthProgress, getCropGrowthStage, type InteractiveObjectState } from './worldObjects';
import { getCraftableWorldSprite } from './blockArt';

export interface MoonPhaseInfo {
  index: number;
  name: string;
  shortName: string;
  icon: string;
  illumination: number;
}

export const MOON_DAYS_PER_PHASE = 2;

export const MOON_PHASES: readonly MoonPhaseInfo[] = [
  { index: 0, name: 'Full Moon', shortName: 'Full Moon', icon: '🌕', illumination: 1.0 },
  { index: 1, name: 'Half Moon', shortName: 'Half Moon', icon: '🌗', illumination: 0.55 },
  { index: 2, name: 'Crescent Moon', shortName: 'Crescent Moon', icon: '🌒', illumination: 0.28 },
  { index: 3, name: 'New Moon', shortName: 'New Moon', icon: '🌑', illumination: 0.08 },
];

export function getMoonPhaseIndex(day: number): number {
  const safeDay = Math.max(1, Math.floor(Number.isFinite(day) ? day : 1));
  return Math.floor((safeDay - 1) / MOON_DAYS_PER_PHASE) % MOON_PHASES.length;
}

export function getMoonPhaseInfo(day: number, moonPhaseIndex?: number): MoonPhaseInfo {
  const index =
    typeof moonPhaseIndex === 'number' && Number.isFinite(moonPhaseIndex)
      ? ((Math.floor(moonPhaseIndex) % MOON_PHASES.length) + MOON_PHASES.length) % MOON_PHASES.length
      : getMoonPhaseIndex(day);
  return MOON_PHASES[index];
}

export function isAuroraNight(
  day: number,
  seed: number = 1337,
  biomeName: string = ''
): boolean {
  const lowerBiome = biomeName.toLowerCase();
  if (
    lowerBiome.includes('snow') ||
    lowerBiome.includes('ice') ||
    lowerBiome.includes('glacier') ||
    lowerBiome.includes('crystal')
  ) {
    return true;
  }
  const safeDay = Math.max(1, Math.floor(Number.isFinite(day) ? day : 1));
  const phaseIndex = getMoonPhaseIndex(safeDay);
  // Naturally occurring Aurora Borealis on specific nights:
  // Dark New Moon nights and every 3rd night (plus deterministic seed variation)
  if (safeDay === 1 || phaseIndex === 3) {
    return true;
  }
  const hash = Math.imul(safeDay ^ (seed & 0xffff), 0x9e3779b1) >>> 0;
  return hash % 3 === 0;
}

export function getSkyPeriodLabel(time: number): string {
  const t = ((time % 1) + 1) % 1;
  if (t >= 0.94 || t < 0.09) return 'Dawn';
  if (t >= 0.09 && t < 0.42) return 'Day';
  if (t >= 0.42 && t < 0.56) return 'Sunset';
  if (t >= 0.56 && t < 0.64) return 'Twilight';
  return 'Night';
}

export interface WeatherInfo {
  type: WeatherType;
  intensity: number;
  label: string;
  icon: string;
}

export function getWorldWeather(
  day: number,
  time: number,
  seed: number = 1337,
  biomeName: string = ''
): WeatherInfo {
  const safeDay = Math.max(1, Math.floor(Number.isFinite(day) ? day : 1));
  const normTime = ((time % 1) + 1) % 1;
  // 6 weather windows per game day (~30 real seconds each)
  const windowsPerDay = 6;
  const scaled = normTime * windowsPerDay;
  const windowIdx = Math.floor(scaled);
  const windowProgress = scaled - windowIdx;
  const globalSlot = (safeDay - 1) * windowsPerDay + windowIdx;

  // Deterministic 32-bit hash of (seed, globalSlot) so all players in a server see the same weather
  let h = Math.imul((globalSlot + 1) ^ (seed & 0x7fffffff), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const roll = (h % 1000) / 1000;

  let rawType: WeatherType = 'clear';
  // Natural weather occurrence (~38% of weather windows experience events)
  if (roll < 0.38) {
    if (roll < 0.20) {
      rawType = 'rain';
    } else if (roll < 0.32) {
      rawType = 'snow';
    } else {
      rawType = 'wind';
    }
  }

  const lowerBiome = biomeName.toLowerCase();
  const isColdBiome =
    lowerBiome.includes('snow') ||
    lowerBiome.includes('ice') ||
    lowerBiome.includes('glacier') ||
    lowerBiome.includes('frost') ||
    lowerBiome.includes('tundra') ||
    lowerBiome.includes('boreal') ||
    lowerBiome.includes('taiga') ||
    lowerBiome.includes('mountain');
  const isAridBiome =
    lowerBiome.includes('desert') ||
    lowerBiome.includes('dune') ||
    lowerBiome.includes('volcan') ||
    lowerBiome.includes('magma');

  if (isColdBiome) {
    // In cold biomes, all precipitation falls as snow!
    if (rawType === 'rain' || rawType === 'snow') {
      rawType = 'snow';
    }
  } else if (isAridBiome) {
    if (rawType === 'rain' || rawType === 'snow') {
      rawType = 'wind';
    }
  } else {
    // In temperate & lush biomes, precipitation is primarily rain
    // but late chilly night/dawn slots have a chance of a winter snow flurry
    if (rawType === 'snow' && roll > 0.24) {
      rawType = 'rain';
    }
  }

  if (rawType === 'clear') {
    return { type: 'clear', intensity: 0, label: 'Clear', icon: '☀️' };
  }

  // Smooth fade-in (first 18%) and fade-out (last 18%) within the weather window
  let envelope = 1.0;
  if (windowProgress < 0.18) {
    envelope = windowProgress / 0.18;
  } else if (windowProgress > 0.82) {
    envelope = (1.0 - windowProgress) / 0.18;
  }
  const smoothIntensity = Math.max(0.12, Math.min(1.0, envelope * envelope * (3 - 2 * envelope)));

  switch (rawType) {
    case 'rain':
      return { type: 'rain', intensity: smoothIntensity, label: 'Rain', icon: '🌧️' };
    case 'snow':
      return { type: 'snow', intensity: smoothIntensity, label: 'Snowfall', icon: '❄️' };
    case 'wind':
      return { type: 'wind', intensity: smoothIntensity, label: 'Windy', icon: '💨' };
    default:
      return { type: 'clear', intensity: 0, label: 'Clear', icon: '☀️' };
  }
}

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  length: number;
  alpha: number;
  phase: number;
  color: string;
  kind: 'rain' | 'snow' | 'streak' | 'leaf';
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkleOffset: number;
  twinkleSpeed: number;
  color: string;
  parallax: number;
  isBeacon: boolean;
}

interface SkyKeyframe {
  t: number;
  zenith: [number, number, number];
  upperMid: [number, number, number];
  lowerMid: [number, number, number];
  horizon: [number, number, number];
  deepHorizon: [number, number, number];
  sunAlpha: number;
  moonAlpha: number;
  starAlpha: number;
  sunsetIntensity: number;
  nightIntensity: number;
}

const SKY_KEYFRAMES: readonly SkyKeyframe[] = [
  // 0.00 - Sunrise / Dawn (06:00 AM)
  {
    t: 0.0,
    zenith: [26, 24, 75],
    upperMid: [67, 56, 202],
    lowerMid: [219, 39, 119],
    horizon: [251, 146, 60],
    deepHorizon: [253, 224, 71],
    sunAlpha: 0.9,
    moonAlpha: 0.15,
    starAlpha: 0.25,
    sunsetIntensity: 0.78,
    nightIntensity: 0.12,
  },
  // 0.09 - Golden Morning (08:10 AM)
  {
    t: 0.09,
    zenith: [29, 78, 216],
    upperMid: [37, 99, 235],
    lowerMid: [96, 165, 250],
    horizon: [147, 197, 253],
    deepHorizon: [254, 240, 138],
    sunAlpha: 1.0,
    moonAlpha: 0.0,
    starAlpha: 0.0,
    sunsetIntensity: 0.15,
    nightIntensity: 0.0,
  },
  // 0.25 - High Noon (12:00 PM)
  {
    t: 0.25,
    zenith: [2, 132, 199],
    upperMid: [37, 99, 235],
    lowerMid: [56, 189, 248],
    horizon: [125, 211, 252],
    deepHorizon: [186, 230, 253],
    sunAlpha: 1.0,
    moonAlpha: 0.0,
    starAlpha: 0.0,
    sunsetIntensity: 0.0,
    nightIntensity: 0.0,
  },
  // 0.40 - Late Afternoon (03:36 PM)
  {
    t: 0.40,
    zenith: [30, 58, 138],
    upperMid: [59, 130, 246],
    lowerMid: [96, 165, 250],
    horizon: [253, 186, 116],
    deepHorizon: [254, 215, 170],
    sunAlpha: 1.0,
    moonAlpha: 0.0,
    starAlpha: 0.0,
    sunsetIntensity: 0.28,
    nightIntensity: 0.0,
  },
  // 0.47 - Golden Hour Sunset (05:16 PM)
  {
    t: 0.47,
    zenith: [23, 21, 59],
    upperMid: [88, 28, 135],
    lowerMid: [225, 29, 72],
    horizon: [249, 115, 22],
    deepHorizon: [253, 224, 71],
    sunAlpha: 1.0,
    moonAlpha: 0.18,
    starAlpha: 0.22,
    sunsetIntensity: 0.96,
    nightIntensity: 0.12,
  },
  // 0.53 - Blazing Crimson Sunset / Dusk (06:43 PM)
  {
    t: 0.53,
    zenith: [10, 12, 42],
    upperMid: [59, 7, 100],
    lowerMid: [190, 24, 93],
    horizon: [234, 88, 12],
    deepHorizon: [251, 191, 36],
    sunAlpha: 0.88,
    moonAlpha: 0.58,
    starAlpha: 0.58,
    sunsetIntensity: 1.0,
    nightIntensity: 0.38,
  },
  // 0.60 - Deep Violet Twilight Afterglow (08:24 PM)
  {
    t: 0.60,
    zenith: [4, 7, 23],
    upperMid: [23, 21, 59],
    lowerMid: [76, 29, 149],
    horizon: [157, 23, 77],
    deepHorizon: [249, 115, 22],
    sunAlpha: 0.22,
    moonAlpha: 0.9,
    starAlpha: 0.88,
    sunsetIntensity: 0.58,
    nightIntensity: 0.78,
  },
  // 0.67 - Starlit Night (10:04 PM)
  {
    t: 0.67,
    zenith: [2, 4, 14],
    upperMid: [6, 11, 33],
    lowerMid: [13, 22, 54],
    horizon: [22, 36, 71],
    deepHorizon: [30, 41, 59],
    sunAlpha: 0.0,
    moonAlpha: 1.0,
    starAlpha: 1.0,
    sunsetIntensity: 0.0,
    nightIntensity: 1.0,
  },
  // 0.80 - Deep Midnight (01:12 AM)
  {
    t: 0.80,
    zenith: [1, 3, 10],
    upperMid: [5, 9, 26],
    lowerMid: [11, 19, 43],
    horizon: [17, 29, 58],
    deepHorizon: [25, 39, 70],
    sunAlpha: 0.0,
    moonAlpha: 1.0,
    starAlpha: 1.0,
    sunsetIntensity: 0.0,
    nightIntensity: 1.0,
  },
  // 0.92 - Pre-Dawn Indigo (04:04 AM)
  {
    t: 0.92,
    zenith: [5, 8, 24],
    upperMid: [15, 23, 42],
    lowerMid: [30, 27, 75],
    horizon: [76, 29, 149],
    deepHorizon: [157, 23, 77],
    sunAlpha: 0.18,
    moonAlpha: 0.75,
    starAlpha: 0.78,
    sunsetIntensity: 0.35,
    nightIntensity: 0.72,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r}, ${g}, ${b})`;
}

interface AuroraPalette {
  name: string;
  lowR: number;
  lowG: number;
  lowB: number;
  midR: number;
  midG: number;
  midB: number;
  highR: number;
  highG: number;
  highB: number;
}

const AURORA_PALETTES: readonly AuroraPalette[] = [
  // Boreal Emerald -> Electric Teal -> Amethyst Crown
  {
    name: 'Boreal Emerald',
    lowR: 52, lowG: 211, lowB: 153,
    midR: 34, midG: 211, midB: 238,
    highR: 168, highG: 85, highB: 247,
  },
  // Celestial Aquamarine -> Royal Indigo -> Rose Magenta
  {
    name: 'Celestial Cyan',
    lowR: 45, lowG: 212, lowB: 191,
    midR: 129, midG: 140, midB: 248,
    highR: 244, highG: 114, highB: 182,
  },
  // Solar Jade -> Violet -> Crimson Gold
  {
    name: 'Aurora Australis',
    lowR: 74, lowG: 222, lowB: 128,
    midR: 192, midG: 132, midB: 252,
    highR: 251, highG: 113, highB: 133,
  },
];

export class WorldRenderer {
  private clouds: Cloud[] = [];
  private stars: Star[] = [];
  private particles: Particle[] = [];
  private weatherParticles: WeatherParticle[] = [];
  private activeWeatherType: WeatherType = 'clear';
  public visibleChunksCount: number = 0;
  private lightMask: HTMLCanvasElement | null = null;
  private lightMaskKey = '';
  private lightOverlay: HTMLCanvasElement | null = null;
  private foliageSwaySpriteCache = new Map<number, HTMLCanvasElement>();
  private remotePlayerVisuals = new Map<string, RemotePlayerState>();

  constructor() {
    this.initClouds();
    this.initStars();
  }

  private initClouds() {
    for (let i = 0; i < 14; i++) {
      this.clouds.push({
        x: Math.random() * 3200,
        y: 36 + Math.random() * (SURFACE_BASE_Y * TILE_SIZE * 0.68),
        width: 72 + Math.random() * 116,
        speed: 7 + Math.random() * 13,
        opacity: 0.38 + Math.random() * 0.44,
      });
    }
  }

  private initStars() {
    const starColors = [
      '#ffffff',
      '#ffffff',
      '#dbeafe', // Ice blue
      '#bfdbfe', // Deep sky blue
      '#fef08a', // Warm stellar gold
      '#fbcfe8', // Soft rose
      '#e9d5ff', // Lavender starlight
    ];
    for (let i = 0; i < 96; i++) {
      // Deterministic pseudo-random distribution so starfield looks rich and balanced
      const r1 = ((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1 + 1) % 1;
      const r2 = ((Math.sin(i * 93.9898 + 19.133) * 29183.1234) % 1 + 1) % 1;
      const r3 = ((Math.sin(i * 41.1234 + 53.789) * 17531.8642) % 1 + 1) % 1;
      const isBeacon = i % 10 === 0;
      this.stars.push({
        x: r1,
        y: Math.pow(r2, 1.15) * 0.68,
        size: isBeacon ? 2 : r3 > 0.76 ? 2 : 1,
        twinkleOffset: r1 * Math.PI * 20,
        twinkleSpeed: 1.6 + r3 * 2.8,
        color: starColors[i % starColors.length],
        parallax: isBeacon ? 0.032 : r3 > 0.5 ? 0.022 : 0.012,
        isBeacon,
      });
    }
  }

  addDustParticles(x: number, y: number, count: number = 2, color: string = '#854d0e') {
    if (this.particles.length > 25) return;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y,
        vx: (Math.random() - 0.5) * 35,
        vy: -15 - Math.random() * 25,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.2,
        size: 1.5 + Math.random() * 1.5,
        color,
      });
    }
  }

  updateParticles(
    dt: number,
    camera?: Camera,
    chunkManager?: ChunkManager,
    weather: WeatherType = 'clear',
    weatherIntensity: number = 0,
    timeSec: number = 0
  ) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    const cloudSpeedMult =
      weather === 'wind'
        ? 1 + weatherIntensity * 2.6
        : weather === 'rain'
          ? 1 + weatherIntensity * 1.15
          : weather === 'snow'
            ? 1 + weatherIntensity * 0.45
            : 1;

    for (const c of this.clouds) {
      c.x += c.speed * cloudSpeedMult * dt;
      if (c.x > 3500) {
        c.x = -200;
      }
    }

    if (!camera || !chunkManager) return;

    if (weather === 'clear' || weatherIntensity <= 0.04) {
      if (this.weatherParticles.length > 0) {
        this.weatherParticles.length = 0;
      }
      this.activeWeatherType = 'clear';
      return;
    }

    if (this.activeWeatherType !== weather) {
      this.weatherParticles.length = 0;
      this.activeWeatherType = weather;
    }

    const targetCount =
      weather === 'rain'
        ? Math.floor(95 * weatherIntensity)
        : weather === 'snow'
          ? Math.floor(85 * weatherIntensity)
          : Math.floor(42 * weatherIntensity);

    const viewLeft = camera.x - 90;
    const viewRight = camera.x + camera.width + 140;
    const viewTop = camera.y - 40;
    const viewBottom = camera.y + camera.height + 40;

    while (this.weatherParticles.length < targetCount) {
      this.weatherParticles.push(
        this.createWeatherParticle(weather, viewLeft, viewRight, viewTop, viewBottom, true)
      );
    }
    if (this.weatherParticles.length > targetCount) {
      this.weatherParticles.length = targetCount;
    }

    const leafColors = ['#4ade80', '#22c55e', '#a3e635', '#fbbf24', '#d97706'];

    for (let i = 0; i < this.weatherParticles.length; i++) {
      const wp = this.weatherParticles[i];

      if (wp.kind === 'rain') {
        wp.x += wp.vx * dt;
        wp.y += wp.vy * dt;
      } else if (wp.kind === 'snow') {
        const sway = Math.sin(timeSec * 2.1 + wp.phase) * 22;
        wp.x += (wp.vx + sway) * dt;
        wp.y += wp.vy * dt;
      } else if (wp.kind === 'streak') {
        wp.x += wp.vx * dt;
        wp.y += (wp.vy + Math.sin(timeSec * 3.2 + wp.phase) * 14) * dt;
      } else {
        // Windblown leaf
        wp.x += wp.vx * dt;
        wp.y += (wp.vy + Math.sin(timeSec * 5.4 + wp.phase) * 34) * dt;
      }

      const tileX = Math.floor(wp.x / TILE_SIZE);
      const tileY = Math.floor(wp.y / TILE_SIZE);
      const surfaceY = chunkManager.terrainGen.getSurfaceHeight(tileX);

      // Check collision with blocks/roofs/ground/water for rain & snow
      let hitBlock = false;
      if (wp.kind === 'rain' || wp.kind === 'snow') {
        const tile = chunkManager.getTile(tileX, tileY);
        if (tile !== TileType.AIR) {
          hitBlock = true;
          if (
            wp.x >= camera.x &&
            wp.x <= camera.x + camera.width &&
            wp.y >= camera.y &&
            wp.y <= camera.y + camera.height
          ) {
            if (wp.kind === 'rain' && Math.random() < 0.38) {
              this.addDustParticles(wp.x, tileY * TILE_SIZE - 1, 2, '#bae6fd');
            } else if (wp.kind === 'snow' && Math.random() < 0.22) {
              this.addDustParticles(wp.x, tileY * TILE_SIZE - 1, 1, '#f8fafc');
            }
          }
        }
      } else {
        // Keep wind streaks and leaves above underground caves
        if (tileY > surfaceY + 3 || chunkManager.getTile(tileX, tileY) !== TileType.AIR) {
          hitBlock = true;
        }
      }

      const outOfBounds =
        wp.y > viewBottom ||
        wp.y < viewTop - 80 ||
        wp.x < viewLeft - 100 ||
        wp.x > viewRight + 100;

      if (hitBlock || outOfBounds) {
        const next = this.createWeatherParticle(weather, viewLeft, viewRight, viewTop, viewBottom, false);
        if (next.kind === 'leaf') {
          next.color = leafColors[i % leafColors.length];
        }
        this.weatherParticles[i] = next;
      }
    }
  }

  private createWeatherParticle(
    weather: WeatherType,
    viewLeft: number,
    viewRight: number,
    viewTop: number,
    viewBottom: number,
    initialSpread: boolean
  ): WeatherParticle {
    const spanX = Math.max(200, viewRight - viewLeft);
    const spanY = Math.max(160, viewBottom - viewTop);
    const phase = Math.random() * Math.PI * 2;

    if (weather === 'rain') {
      const rainColors = ['#93c5fd', '#60a5fa', '#bfdbfe', '#7dd3fc'];
      return {
        x: viewLeft + Math.random() * spanX,
        y: initialSpread ? viewTop + Math.random() * spanY : viewTop - Math.random() * 35,
        vx: -58 - Math.random() * 24,
        vy: 380 + Math.random() * 110,
        size: 1,
        length: 8 + Math.floor(Math.random() * 6),
        alpha: 0.48 + Math.random() * 0.36,
        phase,
        color: rainColors[Math.floor(Math.random() * rainColors.length)],
        kind: 'rain',
      };
    }

    if (weather === 'snow') {
      const snowColors = ['#ffffff', '#f8fafc', '#e0f2fe', '#dbeafe'];
      return {
        x: viewLeft + Math.random() * spanX,
        y: initialSpread ? viewTop + Math.random() * spanY : viewTop - Math.random() * 28,
        vx: -14 + Math.random() * 28,
        vy: 38 + Math.random() * 34,
        size: Math.random() > 0.72 ? 3 : Math.random() > 0.35 ? 2 : 1,
        length: 2,
        alpha: 0.65 + Math.random() * 0.35,
        phase,
        color: snowColors[Math.floor(Math.random() * snowColors.length)],
        kind: 'snow',
      };
    }

    // Wind: mix of sweeping air streaks and windblown pixel leaves
    const isStreak = Math.random() < 0.58;
    if (isStreak) {
      return {
        x: initialSpread ? viewLeft + Math.random() * spanX : viewLeft - Math.random() * 60,
        y: viewTop + Math.random() * (spanY * 0.85),
        vx: 230 + Math.random() * 130,
        vy: -6 + Math.random() * 14,
        size: 1,
        length: 24 + Math.floor(Math.random() * 28),
        alpha: 0.22 + Math.random() * 0.26,
        phase,
        color: '#e2e8f0',
        kind: 'streak',
      };
    }

    return {
      x: initialSpread ? viewLeft + Math.random() * spanX : viewLeft - Math.random() * 40,
      y: viewTop + Math.random() * (spanY * 0.88),
      vx: 135 + Math.random() * 85,
      vy: 14 + Math.random() * 22,
      size: 2,
      length: 3,
      alpha: 0.75 + Math.random() * 0.25,
      phase,
      color: '#4ade80',
      kind: 'leaf',
    };
  }

  getSkyColors(time: number): {
    top: string;
    upperMid: string;
    lowerMid: string;
    horizon: string;
    bot: string;
    sunAlpha: number;
    moonAlpha: number;
    starAlpha: number;
    sunsetIntensity: number;
    nightIntensity: number;
  } {
    const normTime = ((time % 1) + 1) % 1;
    let k0 = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1];
    let k1 = SKY_KEYFRAMES[0];
    let span = (1 - k0.t) + k1.t;
    let localT = normTime >= k0.t ? (normTime - k0.t) / span : (normTime + (1 - k0.t)) / span;

    for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
      const curr = SKY_KEYFRAMES[i];
      const next = SKY_KEYFRAMES[i + 1];
      if (normTime >= curr.t && normTime <= next.t) {
        k0 = curr;
        k1 = next;
        span = Math.max(0.0001, next.t - curr.t);
        localT = (normTime - curr.t) / span;
        break;
      }
    }

    // Smoothstep easing for buttery atmospheric transitions
    const s = localT * localT * (3 - 2 * localT);
    const top = lerpRgb(k0.zenith, k1.zenith, s);
    const upperMid = lerpRgb(k0.upperMid, k1.upperMid, s);
    const lowerMid = lerpRgb(k0.lowerMid, k1.lowerMid, s);
    const horizon = lerpRgb(k0.horizon, k1.horizon, s);
    const bot = lerpRgb(k0.deepHorizon, k1.deepHorizon, s);

    return {
      top,
      upperMid,
      lowerMid,
      horizon,
      bot,
      sunAlpha: lerp(k0.sunAlpha, k1.sunAlpha, s),
      moonAlpha: lerp(k0.moonAlpha, k1.moonAlpha, s),
      starAlpha: lerp(k0.starAlpha, k1.starAlpha, s),
      sunsetIntensity: lerp(k0.sunsetIntensity, k1.sunsetIntensity, s),
      nightIntensity: lerp(k0.nightIntensity, k1.nightIntensity, s),
    };
  }

  render(
    ctx: CanvasRenderingContext2D,
    chunkManager: ChunkManager,
    player: Player,
    camera: Camera,
    cycle: DayNightCycle,
    timeSec: number,
    interaction?: BlockInteraction,
    itemDropManager?: ItemDropManager,
    enemyManager?: EnemyManager,
    wildlifeManager?: WildlifeManager,
    dpr: number = 1,
    selectedSlot?: HotbarSlot,
    swingState?: BlockInteraction,
    remotePlayers: ReadonlyMap<string, RemotePlayerState> = new Map(),
    worldObjects?: Iterable<InteractiveObjectState>
  ) {
    const zoom = camera.zoom || 1;
    const screenWidth = camera.width * zoom;
    const screenHeight = camera.height * zoom;

    ctx.imageSmoothingEnabled = false;

    const sky = this.getSkyColors(cycle.time);
    const moonPhase = getMoonPhaseInfo(cycle.day, cycle.moonPhaseIndex);
    const playerBlockX = Math.floor(player.x / TILE_SIZE);
    const currentBiomeName = chunkManager.terrainGen.getColumnBiome(playerBlockX).name;
    const auroraActive = isAuroraNight(cycle.day, chunkManager.seed, currentBiomeName);
    const weatherInfo = getWorldWeather(cycle.day, cycle.time, chunkManager.seed, currentBiomeName);
    const activeWeather = cycle.weather ?? weatherInfo.type;
    const weatherIntensity =
      typeof cycle.weatherIntensity === 'number' ? cycle.weatherIntensity : weatherInfo.intensity;

    // 1. Multi-Stop Sky Gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, screenHeight);
    skyGradient.addColorStop(0.0, sky.top);
    skyGradient.addColorStop(0.32, sky.upperMid);
    skyGradient.addColorStop(0.62, sky.lowerMid);
    skyGradient.addColorStop(0.84, sky.horizon);
    skyGradient.addColorStop(1.0, sky.bot);
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // Subtle overcast sky mood veil during Rain or Snowfall
    if (activeWeather === 'rain' && weatherIntensity > 0.05) {
      ctx.fillStyle = `rgba(30, 41, 59, ${(0.28 * weatherIntensity).toFixed(3)})`;
      ctx.fillRect(0, 0, screenWidth, screenHeight);
    } else if (activeWeather === 'snow' && weatherIntensity > 0.05) {
      ctx.fillStyle = `rgba(148, 163, 184, ${(0.16 * weatherIntensity).toFixed(3)})`;
      ctx.fillRect(0, 0, screenWidth, screenHeight);
    }

    // Compute Sun & Moon orbital coordinates
    // cycle.time = 0.00 -> sunrise (left/east horizon)
    // cycle.time = 0.25 -> high noon (zenith)
    // cycle.time = 0.50 -> sunset (right/west horizon)
    // cycle.time = 0.75 -> midnight (moon at zenith)
    const sunOrbitAngle = (cycle.time - 0.25) * Math.PI * 2;
    const moonOrbitAngle = sunOrbitAngle + Math.PI;
    const skyCenterX = screenWidth / 2;
    const skyCenterY = screenHeight * 0.78;
    const orbitRadiusX = screenWidth * 0.43;
    const orbitRadiusY = screenHeight * 0.58;

    const sunX = skyCenterX + Math.sin(sunOrbitAngle) * orbitRadiusX;
    const sunY = skyCenterY - Math.cos(sunOrbitAngle) * orbitRadiusY;
    const moonX = skyCenterX + Math.sin(moonOrbitAngle) * orbitRadiusX;
    const moonY = skyCenterY - Math.cos(moonOrbitAngle) * orbitRadiusY;

    // 2. Sunset / Sunrise Atmospheric Glow, God-Rays & Horizon Bands
    if (sky.sunsetIntensity > 0.04) {
      this.renderSunsetAtmosphere(ctx, sunX, sunY, screenWidth, screenHeight, sky.sunsetIntensity, timeSec);
    }

    // 3. Multi-layered Starfield, Milky Way Dust & Shooting Stars
    if (sky.starAlpha > 0.04) {
      this.renderStars(ctx, camera, screenWidth, screenHeight, sky.starAlpha, timeSec, zoom);
    }

    // 4. Aurora Borealis on Specific Nights
    if (auroraActive && sky.nightIntensity > 0.08) {
      this.renderAuroraBorealis(
        ctx,
        camera,
        screenWidth,
        screenHeight,
        sky.nightIntensity,
        timeSec,
        cycle.day,
        chunkManager.seed
      );
    }

    // 5. Sun & 8-Phase Moon
    if (sky.sunAlpha > 0.04 && sunY < screenHeight + 80) {
      this.renderSun(ctx, sunX, sunY, sky.sunAlpha, sky.sunsetIntensity, timeSec);
    }

    if (sky.moonAlpha > 0.04 && moonY < screenHeight + 60) {
      this.renderMoonWithPhase(ctx, moonX, moonY, sky.moonAlpha, moonPhase, timeSec);
    }

    // 6. Parallax Mountains (Time-of-day & Aurora tinted)
    this.renderParallaxHills(
      ctx,
      camera,
      screenWidth,
      screenHeight,
      sky.sunsetIntensity,
      sky.nightIntensity,
      auroraActive,
      cycle.day,
      chunkManager.seed
    );

    // 7. Parallax Clouds (Tinted by Sunset crimson/gold, Night moonlight, or Stormy weather)
    this.renderClouds(ctx, camera, sky.sunsetIntensity, sky.nightIntensity, auroraActive, activeWeather, weatherIntensity);

    // 8. World-Space Rendering (Scaled by Camera Zoom)
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    this.renderVisibleChunks(
      ctx,
      chunkManager,
      camera,
      timeSec,
      sky.sunsetIntensity,
      sky.nightIntensity,
      auroraActive,
      player,
      remotePlayers,
      activeWeather,
      weatherIntensity
    );
    this.renderFarmCrops(ctx, worldObjects, timeSec, activeWeather, weatherIntensity);
    this.renderAmbientNatureDetails(
      ctx,
      chunkManager,
      camera,
      timeSec,
      sky.nightIntensity,
      activeWeather,
      weatherIntensity
    );

    if (itemDropManager) {
      itemDropManager.render(ctx, camera);
    }

    if (enemyManager) {
      enemyManager.render(ctx, camera);
    }

    if (wildlifeManager) {
      wildlifeManager.render(ctx, camera);
    }

    if (interaction) {
      this.renderBlockInteraction(ctx, interaction, player, camera, chunkManager, dpr);
    }

    this.renderParticles(ctx);
    this.renderWeather(ctx, activeWeather, weatherIntensity, timeSec);

    this.renderPlayer(ctx, player, selectedSlot, swingState, timeSec, activeWeather, weatherIntensity);
    this.renderRemotePlayers(ctx, remotePlayers);

    ctx.restore();

    // 9. Ambient Darkness (Surface Night & Caves — preserves clear sky above horizon!)
    this.renderAmbientLighting(
      ctx,
      chunkManager,
      player,
      camera,
      cycle,
      screenWidth,
      screenHeight,
      moonPhase,
      auroraActive
    );

    // 10. Weather Atmospheric Canvas Tint & Screen Moisture / Frost Vignette
    const playerBlockY = Math.floor(player.y / TILE_SIZE);
    const surfaceTileY = chunkManager.terrainGen.getSurfaceHeight(playerBlockX);
    const caveDepth = Math.max(0, playerBlockY - surfaceTileY);
    const undergroundFactor = Math.min(1.0, caveDepth / 16);

    this.renderWeatherCanvasTint(
      ctx,
      activeWeather,
      weatherIntensity,
      screenWidth,
      screenHeight,
      timeSec,
      undergroundFactor
    );
  }

  /**
   * Visually tints the game canvas during rain and snow events.
   * Renders atmospheric moody slate-blue overlay, rain streaks, and camera condensation for Rain;
   * and crisp icy-cyan tint, freezing frost vignette, and crystalline corners for Snow.
   */
  private renderWeatherCanvasTint(
    ctx: CanvasRenderingContext2D,
    weather: WeatherType,
    intensity: number,
    screenWidth: number,
    screenHeight: number,
    timeSec: number,
    undergroundFactor: number
  ) {
    if (weather === 'clear' || intensity <= 0.04) return;

    // Smoothly attenuate canvas tint if player is deep in subterranean caverns
    const effectiveIntensity = intensity * (1 - undergroundFactor * 0.75);
    if (effectiveIntensity <= 0.02) return;

    ctx.save();

    if (weather === 'rain') {
      // 1. Full-screen atmospheric stormy slate-blue tint
      const rainAlpha = Math.min(0.32, 0.22 * effectiveIntensity);
      ctx.fillStyle = `rgba(18, 34, 56, ${rainAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, screenWidth, screenHeight);

      // 2. Stormy perimeter vignette (darkens outer edges of the viewport)
      const cx = screenWidth / 2;
      const cy = screenHeight / 2;
      const maxRadius = Math.max(screenWidth, screenHeight) * 0.72;
      const innerRadius = Math.min(screenWidth, screenHeight) * 0.28;
      const vignette = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, maxRadius);
      vignette.addColorStop(0, 'rgba(10, 20, 35, 0)');
      vignette.addColorStop(0.65, `rgba(10, 22, 38, ${(0.18 * effectiveIntensity).toFixed(3)})`);
      vignette.addColorStop(1.0, `rgba(5, 12, 22, ${(0.42 * effectiveIntensity).toFixed(3)})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, screenWidth, screenHeight);

      // 3. Subtle translucent rain streaks across screen in screen-space
      ctx.fillStyle = `rgba(186, 230, 253, ${(0.10 * effectiveIntensity).toFixed(3)})`;
      const streakSpacing = 36;
      const streakOffset = (timeSec * 450) % streakSpacing;
      for (let sx = -40; sx < screenWidth + 40; sx += streakSpacing) {
        const sy = (Math.sin(sx * 17.3 + timeSec * 3) * 60 + streakOffset * 4) % screenHeight;
        ctx.fillRect(sx, sy, 1, 14);
      }

      // 4. Subtle camera moisture / rain droplets on the viewport glass
      const dropletCount = Math.floor(12 * effectiveIntensity);
      for (let d = 0; d < dropletCount; d++) {
        const hash = Math.sin(d * 93.7 + 12.3) * 10000;
        const normX = Math.abs(hash - Math.floor(hash));
        const hashY = Math.cos(d * 47.1 + 8.9) * 10000;
        const normY = (Math.abs(hashY - Math.floor(hashY)) + (timeSec * 0.04 * (1 + (d % 3) * 0.5))) % 1.0;
        const dx = normX * screenWidth;
        const dy = normY * screenHeight;
        const r = 1.5 + (d % 3);

        ctx.fillStyle = `rgba(147, 197, 253, ${(0.32 * effectiveIntensity).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255, 255, 255, ${(0.55 * effectiveIntensity).toFixed(3)})`;
        ctx.fillRect(dx - 0.5, dy - 0.5, 1, 1);
      }
    } else if (weather === 'snow') {
      // 1. Full-screen atmospheric frosty icy-cyan wash
      const snowAlpha = Math.min(0.24, 0.16 * effectiveIntensity);
      ctx.fillStyle = `rgba(195, 230, 255, ${snowAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, screenWidth, screenHeight);

      // 2. Frost vignette around screen borders & corners (freezing cold ice vignette)
      const cx = screenWidth / 2;
      const cy = screenHeight / 2;
      const maxRadius = Math.max(screenWidth, screenHeight) * 0.72;
      const innerRadius = Math.min(screenWidth, screenHeight) * 0.25;
      const frostVignette = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, maxRadius);
      frostVignette.addColorStop(0, 'rgba(215, 240, 255, 0)');
      frostVignette.addColorStop(0.55, `rgba(210, 235, 255, ${(0.14 * effectiveIntensity).toFixed(3)})`);
      frostVignette.addColorStop(1.0, `rgba(224, 242, 254, ${(0.45 * effectiveIntensity).toFixed(3)})`);
      ctx.fillStyle = frostVignette;
      ctx.fillRect(0, 0, screenWidth, screenHeight);

      // 3. Crystalline frost border corners
      const cornerSize = Math.min(screenWidth, screenHeight) * 0.18;
      const frostGradTL = ctx.createLinearGradient(0, 0, cornerSize, cornerSize);
      frostGradTL.addColorStop(0, `rgba(255, 255, 255, ${(0.38 * effectiveIntensity).toFixed(3)})`);
      frostGradTL.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = frostGradTL;
      ctx.fillRect(0, 0, cornerSize, cornerSize);

      const frostGradTR = ctx.createLinearGradient(screenWidth, 0, screenWidth - cornerSize, cornerSize);
      frostGradTR.addColorStop(0, `rgba(255, 255, 255, ${(0.38 * effectiveIntensity).toFixed(3)})`);
      frostGradTR.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = frostGradTR;
      ctx.fillRect(screenWidth - cornerSize, 0, cornerSize, cornerSize);
    }

    ctx.restore();
  }

  private renderSunsetAtmosphere(
    ctx: CanvasRenderingContext2D,
    sunX: number,
    sunY: number,
    screenWidth: number,
    screenHeight: number,
    intensity: number,
    timeSec: number
  ) {
    ctx.save();
    const clampedSunX = Math.max(screenWidth * 0.08, Math.min(screenWidth * 0.92, sunX));
    const glowCenterY = Math.max(screenHeight * 0.35, Math.min(screenHeight * 0.82, sunY));

    // Large atmospheric radial bloom around the setting/rising sun
    const outerRadius = Math.max(screenWidth, screenHeight) * 0.65;
    const bloom = ctx.createRadialGradient(clampedSunX, glowCenterY, 8, clampedSunX, glowCenterY, outerRadius);
    bloom.addColorStop(0.0, `rgba(255, 243, 176, ${(0.52 * intensity).toFixed(3)})`);
    bloom.addColorStop(0.22, `rgba(251, 146, 60, ${(0.38 * intensity).toFixed(3)})`);
    bloom.addColorStop(0.48, `rgba(225, 29, 72, ${(0.24 * intensity).toFixed(3)})`);
    bloom.addColorStop(0.75, `rgba(126, 34, 206, ${(0.12 * intensity).toFixed(3)})`);
    bloom.addColorStop(1.0, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // Crepuscular Sunbeams (God-rays fanning upward from the setting sun)
    const rayCount = 7;
    for (let i = 0; i < rayCount; i++) {
      const baseAngle = -Math.PI + (i / (rayCount - 1)) * Math.PI;
      const sway = Math.sin(timeSec * 0.35 + i * 1.4) * 0.04;
      const angle = baseAngle + sway;
      const spread = 0.055 + (i % 2) * 0.02;
      const rayLength = Math.max(screenWidth, screenHeight) * 0.78;
      const rayAlpha = intensity * (0.07 + 0.04 * Math.sin(timeSec * 0.6 + i * 2.1));

      ctx.beginPath();
      ctx.moveTo(clampedSunX, glowCenterY);
      ctx.lineTo(
        clampedSunX + Math.cos(angle - spread) * rayLength,
        glowCenterY + Math.sin(angle - spread) * rayLength
      );
      ctx.lineTo(
        clampedSunX + Math.cos(angle + spread) * rayLength,
        glowCenterY + Math.sin(angle + spread) * rayLength
      );
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0
        ? `rgba(253, 224, 71, ${rayAlpha.toFixed(3)})`
        : `rgba(251, 113, 133, ${rayAlpha.toFixed(3)})`;
      ctx.fill();
    }

    // Crisp pixel-art horizontal sunset shimmer bands along the horizon
    const horizonBaseY = screenHeight * 0.66;
    const bandColors = [
      `rgba(253, 224, 71, ${(0.22 * intensity).toFixed(3)})`,
      `rgba(251, 146, 60, ${(0.20 * intensity).toFixed(3)})`,
      `rgba(244, 63, 94, ${(0.18 * intensity).toFixed(3)})`,
      `rgba(192, 38, 211, ${(0.14 * intensity).toFixed(3)})`,
    ];
    for (let b = 0; b < bandColors.length; b++) {
      const by = Math.floor(horizonBaseY - b * 18 + Math.sin(timeSec * 0.8 + b) * 2);
      const bw = Math.floor(screenWidth * (0.55 - b * 0.09));
      const bx = Math.floor(clampedSunX - bw / 2);
      ctx.fillStyle = bandColors[b];
      ctx.fillRect(bx, by, bw, 4);
    }

    ctx.restore();
  }

  private renderStars(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    screenWidth: number,
    screenHeight: number,
    starAlpha: number,
    timeSec: number,
    zoom: number
  ) {
    ctx.save();

    // Subtle Milky Way / Celestial Nebula diagonal glow band at night
    if (starAlpha > 0.35) {
      const nebulaAlpha = (starAlpha - 0.35) * 0.16;
      const nebulaGrad = ctx.createLinearGradient(
        screenWidth * 0.15,
        0,
        screenWidth * 0.85,
        screenHeight * 0.58
      );
      nebulaGrad.addColorStop(0.0, 'rgba(99, 102, 241, 0)');
      nebulaGrad.addColorStop(0.35, `rgba(99, 102, 241, ${nebulaAlpha.toFixed(3)})`);
      nebulaGrad.addColorStop(0.65, `rgba(168, 85, 247, ${(nebulaAlpha * 1.15).toFixed(3)})`);
      nebulaGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = nebulaGrad;
      ctx.fillRect(0, 0, screenWidth, screenHeight * 0.65);
    }

    // Multi-layered twinkling stars & 4-point pixel beacons
    for (let idx = 0; idx < this.stars.length; idx++) {
      const star = this.stars[idx];
      const sx = ((star.x * screenWidth - camera.x * star.parallax * zoom) % screenWidth + screenWidth) % screenWidth;
      const sy = star.y * screenHeight;

      const combinedWave =
        Math.sin(timeSec * star.twinkleSpeed + star.twinkleOffset) * 0.72 +
        Math.cos(timeSec * (star.twinkleSpeed * 1.73) - star.twinkleOffset * 0.67) * 0.28;
      const normalizedTwinkle = (combinedWave + 1) * 0.5;
      const twinkleFactor = 0.16 + normalizedTwinkle * normalizedTwinkle * 0.84;
      const alpha = Math.max(0, Math.min(1, starAlpha * twinkleFactor));
      if (alpha <= 0.04) continue;

      const px = Math.floor(sx);
      const py = Math.floor(sy);
      const isFlaring = combinedWave > 0.52;
      const drawSize = star.size === 1 && isFlaring && (idx & 3) === 0 ? 2 : star.size;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = isFlaring ? '#ffffff' : star.color;
      ctx.fillRect(px, py, drawSize, drawSize);

      if (star.isBeacon && alpha > 0.36) {
        ctx.globalAlpha = Math.min(1, alpha * (0.3 + normalizedTwinkle * 0.55));
        ctx.fillStyle = star.color;
        ctx.fillRect(px - 2, py, 2, 1);
        ctx.fillRect(px + drawSize, py, 2, 1);
        ctx.fillRect(px, py - 2, 1, 2);
        ctx.fillRect(px, py + drawSize, 1, 2);
      }
    }

    // Periodic Shooting Stars (Meteors) streaking across the night sky
    if (starAlpha > 0.55) {
      const meteorPeriod = 6.5;
      const meteorCycle = Math.floor(timeSec / meteorPeriod);
      const meteorPhase = (timeSec % meteorPeriod) / 0.85; // active for 0.85s every 6.5s
      if (meteorPhase >= 0 && meteorPhase <= 1.0) {
        const seedX = ((Math.sin(meteorCycle * 78.233 + 11.7) * 43758.5453) % 1 + 1) % 1;
        const seedY = ((Math.sin(meteorCycle * 31.17 + 47.3) * 19283.412) % 1 + 1) % 1;
        const dir = meteorCycle % 2 === 0 ? 1 : -1;
        const startX = (0.18 + seedX * 0.64) * screenWidth;
        const startY = (0.05 + seedY * 0.24) * screenHeight;
        const travelX = dir * screenWidth * 0.26;
        const travelY = screenHeight * 0.16;

        const curX = startX + travelX * meteorPhase;
        const curY = startY + travelY * meteorPhase;
        const envAlpha = Math.sin(meteorPhase * Math.PI) * starAlpha;

        // Draw segmented pixel meteor trail
        const segments = 10;
        for (let s = 0; s < segments; s++) {
          const tailFrac = s / segments;
          const tx = Math.floor(curX - (travelX * 0.16) * tailFrac);
          const ty = Math.floor(curY - (travelY * 0.16) * tailFrac);
          ctx.globalAlpha = Math.max(0, envAlpha * (1 - tailFrac) * 0.85);
          ctx.fillStyle = s === 0 ? '#ffffff' : s < 4 ? '#bae6fd' : '#818cf8';
          const sz = s === 0 ? 3 : s < 4 ? 2 : 1;
          ctx.fillRect(tx, ty, sz, sz);
        }
      }
    }

    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  private renderAuroraBorealis(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    screenWidth: number,
    screenHeight: number,
    nightIntensity: number,
    timeSec: number,
    day: number,
    seed: number
  ) {
    ctx.save();
    const basePaletteIdx = (Math.max(1, day) + Math.abs(seed)) % AURORA_PALETTES.length;
    const nextPaletteIdx = (basePaletteIdx + 1) % AURORA_PALETTES.length;
    const palA = AURORA_PALETTES[basePaletteIdx];
    const palB = AURORA_PALETTES[nextPaletteIdx];

    // Slow global color cycle + geomagnetic surge breathing
    const globalColorMix = (Math.sin(timeSec * 0.22 + day) + 1) * 0.5;
    const globalFlicker =
      0.86 +
      0.10 * Math.sin(timeSec * 1.35) +
      0.04 * Math.sin(timeSec * 4.7 + 1.1);
    const masterAlpha = Math.min(1, nightIntensity * 0.94 * globalFlicker);

    const clampChannel = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const skyLowR = clampChannel(lerp(palA.lowR, palB.lowR, globalColorMix));
    const skyLowG = clampChannel(lerp(palA.lowG, palB.lowG, globalColorMix));
    const skyLowB = clampChannel(lerp(palA.lowB, palB.lowB, globalColorMix));
    const skyMidR = clampChannel(lerp(palA.midR, palB.midR, globalColorMix));
    const skyMidG = clampChannel(lerp(palA.midG, palB.midG, globalColorMix));
    const skyMidB = clampChannel(lerp(palA.midB, palB.midB, globalColorMix));
    const skyHighR = clampChannel(lerp(palA.highR, palB.highR, globalColorMix));
    const skyHighG = clampChannel(lerp(palA.highG, palB.highG, globalColorMix));
    const skyHighB = clampChannel(lerp(palA.highB, palB.highB, globalColorMix));

    // 1. Soft upper-sky geomagnetic ambient glow with dynamic color shifting
    const skyGlow = ctx.createLinearGradient(0, 0, 0, screenHeight * 0.62);
    skyGlow.addColorStop(0.0, `rgba(${skyHighR}, ${skyHighG}, ${skyHighB}, ${(0.15 * masterAlpha).toFixed(3)})`);
    skyGlow.addColorStop(0.45, `rgba(${skyMidR}, ${skyMidG}, ${skyMidB}, ${(0.19 * masterAlpha).toFixed(3)})`);
    skyGlow.addColorStop(0.8, `rgba(${skyLowR}, ${skyLowG}, ${skyLowB}, ${(0.11 * masterAlpha).toFixed(3)})`);
    skyGlow.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 0, screenWidth, screenHeight * 0.62);

    // 2. Two undulating pixel-art Aurora Borealis curtains with color shifting & flickering pillars
    const stripWidth = Math.max(12, Math.floor(screenWidth / 44));
    const cameraShift = camera.x * 0.014;

    for (let band = 0; band < 2; band++) {
      const bandBaseY = screenHeight * (0.14 + band * 0.085);
      const bandSpeed = (0.42 + band * 0.19) * (band % 2 === 0 ? 1 : -1);
      const bandPhase = band * 2.15 + (seed & 0xff) * 0.1;
      const bandHeightScale = 1 - band * 0.14;

      for (let sx = 0; sx < screenWidth + stripWidth; sx += stripWidth) {
        const wx = sx + cameraShift * (1 + band * 0.35);

        // Layered harmonic wave for organic folding ribbon shape
        const waveY =
          Math.sin(wx * 0.0055 + timeSec * bandSpeed + bandPhase) * (screenHeight * 0.048) +
          Math.cos(wx * 0.013 - timeSec * bandSpeed * 0.7 + bandPhase * 1.7) * (screenHeight * 0.024) +
          Math.sin(wx * 0.027 + timeSec * 0.9 + band) * 6;

        // Vertical ray intensity pulsation + rapid geomagnetic pillar flickering
        const slowPillar =
          (Math.sin(wx * 0.032 + timeSec * 1.15 + band * 1.9) *
            Math.cos(wx * 0.019 - timeSec * 0.8 + bandPhase) +
            1) *
          0.5;
        const fastFlicker =
          0.82 +
          0.18 *
            Math.sin(wx * 0.068 - timeSec * 5.2 + band * 2.7) *
            Math.cos(timeSec * 7.6 + wx * 0.041);
        const rayPulse = (0.32 + 0.68 * Math.pow(slowPillar, 1.35)) * fastFlicker;

        // Horizontal envelope so curtains taper naturally in and out
        const envelope =
          0.45 + 0.55 * Math.sin(wx * 0.0024 + timeSec * 0.15 + band * 2.4);
        if (envelope <= 0.12) continue;

        const colAlpha = masterAlpha * rayPulse * envelope * (band === 0 ? 0.48 : band === 1 ? 0.39 : 0.31);
        if (colAlpha <= 0.025) continue;

        // Spatial + temporal color shifting along the curtain ribbon
        const localMix =
          (Math.sin(wx * 0.0042 - timeSec * 0.48 + band * 1.3) + 1) * 0.5;
        const shimmerShift = Math.sin(wx * 0.016 + timeSec * 1.85 + band) * 26;
        const rosePulse = Math.max(0, Math.sin(wx * 0.009 - timeSec * 0.95 + band * 2.1)) * 34;

        const lowR = clampChannel(lerp(palA.lowR, palB.lowR, localMix) + shimmerShift * 0.5);
        const lowG = clampChannel(lerp(palA.lowG, palB.lowG, localMix) + shimmerShift * 0.8);
        const lowB = clampChannel(lerp(palA.lowB, palB.lowB, localMix) - shimmerShift * 0.7);

        const midR = clampChannel(lerp(palA.midR, palB.midR, localMix) + rosePulse * 0.6);
        const midG = clampChannel(lerp(palA.midG, palB.midG, localMix) - shimmerShift * 0.5);
        const midB = clampChannel(lerp(palA.midB, palB.midB, localMix) + shimmerShift * 0.6);

        const highR = clampChannel(lerp(palA.highR, palB.highR, localMix) + rosePulse);
        const highG = clampChannel(lerp(palA.highG, palB.highG, localMix) - rosePulse * 0.4);
        const highB = clampChannel(lerp(palA.highB, palB.highB, localMix) + shimmerShift * 0.4);

        const bottomY = Math.floor(bandBaseY + waveY + screenHeight * 0.11 * bandHeightScale);
        const totalRayHeight = Math.floor((screenHeight * 0.13 + rayPulse * screenHeight * 0.095) * bandHeightScale);
        const seg1H = Math.max(4, Math.floor(totalRayHeight * 0.14)); // Brightest lower fringe
        const seg2H = Math.max(6, Math.floor(totalRayHeight * 0.28)); // Lower-mid emerald/cyan
        const seg3H = Math.max(8, Math.floor(totalRayHeight * 0.32)); // Upper-mid teal/indigo
        const seg4H = Math.max(8, totalRayHeight - seg1H - seg2H - seg3H); // High violet/rose crown

        const x0 = Math.floor(sx);

        // Segment 0: Ionized white-mint core flash on high-energy flickering pillars
        if (rayPulse > 0.74) {
          const coreAlpha = Math.min(0.92, colAlpha * 1.65 * (rayPulse - 0.5));
          ctx.fillStyle = `rgba(${clampChannel(lowR + 95)}, 255, ${clampChannel(lowB + 85)}, ${coreAlpha.toFixed(3)})`;
          ctx.fillRect(x0, bottomY - 3, stripWidth, 3);
        }

        // Segment 1: Intense glowing lower curtain edge
        ctx.fillStyle = `rgba(${lowR}, ${lowG}, ${lowB}, ${Math.min(0.88, colAlpha * 1.48).toFixed(3)})`;
        ctx.fillRect(x0, bottomY - seg1H, stripWidth, seg1H);

        // Segment 2: Luminous main curtain body
        ctx.fillStyle = `rgba(${lowR}, ${lowG}, ${lowB}, ${colAlpha.toFixed(3)})`;
        ctx.fillRect(x0, bottomY - seg1H - seg2H, stripWidth, seg2H);

        // Segment 3: Transition to mid-altitude cyan/indigo
        ctx.fillStyle = `rgba(${midR}, ${midG}, ${midB}, ${(colAlpha * 0.80).toFixed(3)})`;
        ctx.fillRect(x0, bottomY - seg1H - seg2H - seg3H, stripWidth, seg3H);

        // Segment 4: Ethereal high-altitude violet/magenta crown
        ctx.fillStyle = `rgba(${highR}, ${highG}, ${highB}, ${(colAlpha * 0.46).toFixed(3)})`;
        ctx.fillRect(x0, bottomY - totalRayHeight, stripWidth, seg4H);
      }
    }

    ctx.restore();
  }

  private renderSun(
    ctx: CanvasRenderingContext2D,
    sunX: number,
    sunY: number,
    sunAlpha: number,
    sunsetIntensity: number,
    timeSec: number
  ) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, sunAlpha));

    // Sun expands slightly near sunset for a dramatic horizon presence
    const scale = 1 + sunsetIntensity * 0.38;
    const pulse = 1 + Math.sin(timeSec * 2.2) * 0.04;

    // Outer Corona Halo
    const haloRadius = 34 * scale * pulse;
    const haloGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, haloRadius);
    if (sunsetIntensity > 0.35) {
      haloGrad.addColorStop(0.0, 'rgba(254, 240, 138, 0.65)');
      haloGrad.addColorStop(0.45, 'rgba(249, 115, 22, 0.38)');
      haloGrad.addColorStop(0.8, 'rgba(225, 29, 72, 0.18)');
      haloGrad.addColorStop(1.0, 'rgba(225, 29, 72, 0)');
    } else {
      haloGrad.addColorStop(0.0, 'rgba(254, 249, 195, 0.55)');
      haloGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.25)');
      haloGrad.addColorStop(1.0, 'rgba(251, 191, 36, 0)');
    }
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // Crisp Pixel-Art Sun Disc (Stratified sunset bands when setting)
    const halfOuter = Math.round(13 * scale);
    const halfMid = Math.round(10 * scale);
    const halfCore = Math.round(7 * scale);
    const sx = Math.floor(sunX);
    const sy = Math.floor(sunY);

    ctx.fillStyle = sunsetIntensity > 0.4 ? '#e11d48' : '#d97706';
    ctx.fillRect(sx - halfOuter, sy - halfOuter, halfOuter * 2, halfOuter * 2);

    ctx.fillStyle = sunsetIntensity > 0.4 ? '#f97316' : '#f59e0b';
    ctx.fillRect(sx - halfMid, sy - halfMid, halfMid * 2, halfMid * 2);

    ctx.fillStyle = sunsetIntensity > 0.4 ? '#fde047' : '#fef08a';
    ctx.fillRect(sx - halfCore, sy - halfCore, halfCore * 2, halfCore * 2);

    // Stratified sunset scanlines across lower half of the setting sun
    if (sunsetIntensity > 0.35) {
      ctx.fillStyle = 'rgba(190, 18, 60, 0.55)';
      ctx.fillRect(sx - halfOuter, sy + 2, halfOuter * 2, 2);
      ctx.fillRect(sx - halfOuter, sy + 6, halfOuter * 2, 2);
      ctx.fillRect(sx - halfMid, sy + 10, halfMid * 2, 2);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - halfCore + 2, sy - halfCore + 2, Math.max(4, Math.round(5 * scale)), Math.max(3, Math.round(3 * scale)));

    ctx.restore();
  }

  private renderMoonWithPhase(
    ctx: CanvasRenderingContext2D,
    moonX: number,
    moonY: number,
    moonAlpha: number,
    phase: MoonPhaseInfo,
    timeSec: number
  ) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, moonAlpha));

    const cx = Math.floor(moonX);
    const cy = Math.floor(moonY);
    const pulse = 1 + Math.sin(timeSec * 1.5) * 0.03;

    // 1. Multi-ring Lunar Halo (scales with moon phase illumination)
    const haloRadius = (24 + phase.illumination * 26) * pulse;
    const haloGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, haloRadius);
    const glowAlpha = 0.14 + phase.illumination * 0.28;
    haloGrad.addColorStop(0.0, `rgba(226, 232, 240, ${glowAlpha.toFixed(3)})`);
    haloGrad.addColorStop(0.45, `rgba(148, 163, 184, ${(glowAlpha * 0.48).toFixed(3)})`);
    haloGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Render 16x16 Pixel-Art Moon Sphere (2px per texel = 32x32px) with 4 Distinct Lunar Phases
    const texelSize = 2;
    const gridRadius = 8; // -8..7
    const phaseIndex = ((phase.index % 4) + 4) % 4;

    // Deterministic lunar crater map in moon-local coordinates
    const isCrater = (gx: number, gy: number): boolean => {
      if ((gx === -3 && gy === -2) || (gx === -2 && gy === -2) || (gx === -3 && gy === -1)) return true;
      if ((gx === 2 && gy === 1) || (gx === 3 && gy === 1) || (gx === 2 && gy === 2)) return true;
      if ((gx === -1 && gy === 3) || (gx === 0 && gy === 3)) return true;
      if (gx === 1 && gy === -4) return true;
      return false;
    };

    for (let gy = -gridRadius; gy < gridRadius; gy++) {
      for (let gx = -gridRadius; gx < gridRadius; gx++) {
        const nx = (gx + 0.5) / gridRadius;
        const ny = (gy + 0.5) / gridRadius;
        const distSq = nx * nx + ny * ny;
        if (distSq > 1.0) continue;

        const isRim = distSq >= 0.76;

        // Distinct visual phases based on moonPhaseIndex (0: Full, 1: Half, 2: Crescent, 3: New)
        let isLit = true;
        let isTerminator = false;
        switch (phaseIndex) {
          case 0: // Full Moon: 100% illuminated lunar disc
            isLit = true;
            break;
          case 1: // Half Moon: clean 50% vertical split with soft terminator shading
            isLit = nx >= 0.0;
            isTerminator = nx >= 0.0 && nx < 0.14;
            break;
          case 2: { // Crescent Moon: curved sickle carved by an offset shadow circle
            const shadowDx = nx + 0.36;
            const shadowDy = ny - 0.04;
            const shadowDistSq = shadowDx * shadowDx + shadowDy * shadowDy;
            isLit = shadowDistSq >= 0.72;
            isTerminator = isLit && shadowDistSq < 0.84;
            break;
          }
          case 3: // New Moon: dark silhouetted lunar disc with faint silver earthshine rim
          default:
            isLit = false;
            break;
        }

        const px = cx + gx * texelSize;
        const py = cy + gy * texelSize;

        if (isLit) {
          if (isRim) {
            ctx.fillStyle = '#ffffff';
          } else if (isTerminator || isCrater(gx, gy)) {
            ctx.fillStyle = '#cbd5e1';
          } else if (nx + ny > 0.45) {
            ctx.fillStyle = '#e2e8f0';
          } else {
            ctx.fillStyle = '#fefce8';
          }
          ctx.fillRect(px, py, texelSize, texelSize);
        } else {
          // Unlit shadow side: deep midnight earthshine sphere with faint silver rim
          const rimAlpha = phaseIndex === 3 ? 0.52 : 0.28;
          ctx.fillStyle = isRim
            ? `rgba(148, 163, 184, ${rimAlpha})`
            : isCrater(gx, gy)
              ? 'rgba(30, 41, 59, 0.86)'
              : 'rgba(10, 15, 30, 0.90)';
          ctx.fillRect(px, py, texelSize, texelSize);
        }
      }
    }

    ctx.restore();
  }

  private renderFarmCrops(
    ctx: CanvasRenderingContext2D,
    worldObjects?: Iterable<InteractiveObjectState>,
    timeSec: number = 0,
    weather: WeatherType = 'clear',
    weatherIntensity: number = 0
  ) {
    if (!worldObjects) return;
    const windSpeed = weather === 'wind' ? 4.2 : weather === 'rain' ? 3.1 : 2.0;
    const windScale = weather === 'wind' ? 1.8 + weatherIntensity * 1.4 : weather === 'rain' ? 1.3 + weatherIntensity * 0.7 : 1.0;

    for (const crop of worldObjects) {
      if (crop.type !== 'crop' || !crop.cropType) continue;
      const stage = getCropGrowthStage(crop);
      const progress = getCropGrowthProgress(crop);
      const height = Math.max(3, Math.round(3 + progress * 11));
      const centerX = crop.x * TILE_SIZE + 8;
      const soilY = crop.y * TILE_SIZE;
      const topY = soilY - height;
      const swayRaw = Math.sin(timeSec * windSpeed + crop.x * 0.65 + crop.y * 0.25) * windScale * progress;
      const swayTip = Math.round(swayRaw * 1.6);
      const swayMid = Math.round(swayRaw * 0.8);

      if (progress < 0.08) {
        ctx.fillStyle = '#6b4428';
        ctx.fillRect(centerX - 2, soilY - 2, 4, 2);
      }
      const lowerH = Math.max(1, Math.floor((height - 2) * 0.5));
      const upperH = Math.max(1, height - 2 - lowerH);
      ctx.fillStyle = '#3f772f';
      ctx.fillRect(centerX - 1, soilY - lowerH, 2, lowerH);
      ctx.fillRect(centerX - 1 + swayMid, topY + 2, 2, upperH);
      if (progress >= 0.2) {
        const leafSize = Math.max(2, Math.round(progress * 4));
        ctx.fillStyle = '#65a843';
        ctx.fillRect(centerX - leafSize - 1 + swayMid, topY + 5, leafSize, 2);
        ctx.fillRect(centerX + 1 + swayTip, topY + 2, leafSize, 2);
        if (progress >= 0.45) {
          ctx.fillRect(centerX - leafSize + swayMid, topY + 4, 2, 1);
          ctx.fillRect(centerX + leafSize - 1 + swayTip, topY + 1, 2, 1);
        }
      } else {
        ctx.fillStyle = '#79b84b';
        ctx.fillRect(centerX - 3 + swayTip, topY, 3, 2);
        ctx.fillRect(centerX + 1 + swayTip, topY + 1, 3, 2);
      }

      if (stage === 2) {
        if (crop.cropType === 'wheat') {
          ctx.fillStyle = '#e9c85f';
          ctx.fillRect(centerX - 3 + swayTip, topY - 2, 2, 4);
          ctx.fillRect(centerX + 2 + swayTip, topY - 1, 2, 4);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(centerX - 3 + swayTip, topY - 2, 1, 2);
          ctx.fillRect(centerX + 2 + swayTip, topY - 1, 1, 2);
        } else {
          ctx.fillStyle = crop.cropType === 'carrot' ? '#f4772b' : '#d83b63';
          ctx.fillRect(centerX - 5 + swayMid, soilY - 5, 3, 3);
          ctx.fillRect(centerX + 3 + swayTip, soilY - 7, 3, 3);
          ctx.fillStyle = '#f6d66b';
          ctx.fillRect(centerX - 4 + swayMid, soilY - 5, 1, 1);
          ctx.fillRect(centerX + 4 + swayTip, soilY - 7, 1, 1);
        }
      }
    }
  }

  private renderRemotePlayers(ctx: CanvasRenderingContext2D, remotePlayers: ReadonlyMap<string, RemotePlayerState>) {
    for (const playerId of this.remotePlayerVisuals.keys()) {
      if (!remotePlayers.has(playerId)) this.remotePlayerVisuals.delete(playerId);
    }

    for (const [playerId, target] of remotePlayers) {
      let visual = this.remotePlayerVisuals.get(playerId);
      if (!visual) {
        visual = { ...target };
        this.remotePlayerVisuals.set(playerId, visual);
      }
      visual.x += (target.x - visual.x) * 0.24;
      visual.y += (target.y - visual.y) * 0.24;
      visual.facingRight = target.facingRight;
      visual.health = target.health;
      visual.maxHealth = target.maxHealth;
      visual.isAlive = target.isAlive;
      visual.isAttacking = target.isAttacking;
      visual.attackTimer = target.attackTimer;

      const px = Math.floor(visual.x);
      const py = Math.floor(visual.y);
      const isAlive = target.isAlive && target.health > 0;

      ctx.save();
      if (!isAlive) {
        ctx.globalAlpha = 0.45;
      }
      if (!visual.facingRight) {
        ctx.translate(px + 7, 0);
        ctx.scale(-1, 1);
        ctx.translate(-(px + 7), 0);
      }
      ctx.fillStyle = 'rgba(10,22,24,.34)';
      ctx.fillRect(px - 1, py + 24, 16, 3);
      ctx.fillStyle = '#172554';
      ctx.fillRect(px + 1, py, 12, 9);
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(px + 2, py + 2, 10, 7);
      ctx.fillStyle = '#1e40af';
      ctx.fillRect(px, py + 8, 14, 9);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(px + 2, py + 9, 10, 6);
      ctx.fillStyle = '#172554';
      ctx.fillRect(px + 1, py + 16, 5, 7);
      ctx.fillRect(px + 8, py + 16, 5, 7);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px + 1, py + 22, 5, 3);
      ctx.fillRect(px + 8, py + 22, 5, 3);

      if (isAlive) {
        if (visual.isAttacking && visual.attackTimer !== undefined && visual.attackTimer > 0) {
          const progress = 1 - (visual.attackTimer / 0.22);
          const swordBaseX = px + 14;
          const swordBaseY = py + 12;

          ctx.save();
          ctx.translate(swordBaseX, swordBaseY);
          const angle = (-Math.PI / 4) + progress * (Math.PI * 0.65);
          ctx.rotate(angle);
          ctx.scale(1.35, 1.35);

          ctx.fillStyle = '#78350f';
          ctx.fillRect(0, -1.5, 4, 3);
          ctx.fillStyle = '#451a03';
          ctx.fillRect(4, -4, 2, 8);
          ctx.fillStyle = '#b45309';
          ctx.fillRect(6, -2.5, 15, 5);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(7, -1, 13, 2);
          ctx.restore();

          ctx.strokeStyle = `rgba(254, 240, 138, ${(Math.max(0, 1 - progress)).toFixed(2)})`;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(swordBaseX, swordBaseY, 24, -Math.PI / 3, Math.PI / 4);
          ctx.stroke();
        } else {
          ctx.save();
          ctx.translate(px + 13, py + 13);
          ctx.rotate(-Math.PI / 3);
          ctx.scale(1.35, 1.35);
          ctx.fillStyle = '#713f12'; ctx.fillRect(1, -1, 6, 3);
          ctx.fillStyle = '#422006'; ctx.fillRect(6, -4, 2, 9);
          ctx.fillStyle = '#263238'; ctx.fillRect(8, -2, 14, 5);
          ctx.fillStyle = '#facc15'; ctx.fillRect(9, -1, 11, 3);
          ctx.fillStyle = '#fff1c2'; ctx.fillRect(10, -1, 8, 1);
          ctx.restore();
        }
      }

      ctx.restore();

      ctx.save();
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';

      if (isAlive) {
        const barW = 24;
        const barH = 4;
        const barX = px + 7 - barW / 2;
        const barY = py - 18;
        const maxHp = target.maxHealth || 100;
        const currentHp = Math.max(0, Math.min(maxHp, target.health));
        const hpRatio = currentHp / maxHp;
        const fillW = Math.round(hpRatio * (barW - 2));

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX - 0.5, barY - 0.5, barW + 1, barH + 1);

        if (fillW > 0) {
          ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.2 ? '#f59e0b' : '#ef4444';
          ctx.fillRect(barX + 1, barY + 1, fillW, barH - 2);
        }
      }

      const displayName = target.displayName || playerId;
      const nameText = isAlive ? displayName : `${displayName} (Dead)`;
      const textWidth = ctx.measureText(nameText).width;
      ctx.fillStyle = 'rgba(15,23,42,.85)';
      ctx.fillRect(px + 7 - textWidth / 2 - 3, py - 12, textWidth + 6, 9);
      ctx.fillStyle = isAlive ? '#bfdbfe' : '#f87171';
      ctx.fillText(nameText, px + 7, py - 5);
      ctx.restore();

      if (isAlive && target.activeBuffs && target.activeBuffs.length > 0) {
        this.renderPlayerBuffBadges(ctx, px + 7, py - 20, target.activeBuffs, 0);
      }
    }
  }

  private renderBlockInteraction(
    ctx: CanvasRenderingContext2D,
    interaction: BlockInteraction,
    player: Player,
    camera: Camera,
    chunkManager: ChunkManager,
    dpr: number
  ) {
    const target = interaction.getTargetInfo(player, camera, chunkManager, dpr);
    if (!target.inRange) return;

    const bx = target.blockX * TILE_SIZE;
    const by = target.blockY * TILE_SIZE;
    const craftBounds = target.tile !== TileType.AIR ? getCraftableWorldSprite(target.tile) : null;
    const boxX = craftBounds ? bx + craftBounds.offsetX : bx;
    const boxY = craftBounds ? by + craftBounds.offsetY : by;
    const boxW = craftBounds ? craftBounds.width : TILE_SIZE;
    const boxH = craftBounds ? craftBounds.height : TILE_SIZE;

    ctx.save();
    if (target.tile !== TileType.AIR) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.5)';
      ctx.strokeRect(bx + 0.5, by + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }

    if (interaction.isMining && interaction.miningProgress > 0 && target.tile !== TileType.AIR) {
      const p = Math.min(1.0, interaction.miningProgress);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 1;
      if (p > 0.2) {
        ctx.beginPath();
        ctx.moveTo(bx + 3, by + 3);
        ctx.lineTo(bx + 8, by + 8);
        ctx.stroke();
      }
      if (p > 0.45) {
        ctx.beginPath();
        ctx.moveTo(bx + 8, by + 8);
        ctx.lineTo(bx + 13, by + 4);
        ctx.lineTo(bx + 10, by + 12);
        ctx.stroke();
      }
      if (p > 0.7) {
        ctx.beginPath();
        ctx.moveTo(bx + 4, by + 12);
        ctx.lineTo(bx + 8, by + 8);
        ctx.lineTo(bx + 14, by + 13);
        ctx.stroke();
      }

      const centerX = boxX + boxW / 2;
      const centerY = boxY + boxH / 2;
      const radius = 5;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderParallaxHills(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    width: number,
    height: number,
    sunsetIntensity: number,
    nightIntensity: number,
    auroraActive: boolean,
    day: number,
    seed: number
  ) {
    // Distant mountain range
    const distPeriod = 600;
    const distOffset = ((camera.x * 0.08) % distPeriod + distPeriod) % distPeriod;

    let distColor = 'rgba(83, 135, 111, 0.34)';
    let midColor = 'rgba(35, 83, 69, 0.38)';
    if (sunsetIntensity > 0.25) {
      distColor = `rgba(88, 28, 135, ${(0.36 + sunsetIntensity * 0.16).toFixed(2)})`;
      midColor = `rgba(76, 5, 25, ${(0.42 + sunsetIntensity * 0.15).toFixed(2)})`;
    } else if (nightIntensity > 0.3) {
      distColor = 'rgba(15, 23, 42, 0.58)';
      midColor = 'rgba(9, 20, 38, 0.68)';
    }

    ctx.fillStyle = distColor;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = -60; x <= width + 60; x += 60) {
      const worldX = x + distOffset;
      const h = Math.sin(worldX * 0.006) * 70 + Math.cos(worldX * 0.015) * 35;
      const y = height * 0.55 - h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Subtle sunset golden mist or aurora reflection between mountain ranges
    if (sunsetIntensity > 0.15) {
      const mistGrad = ctx.createLinearGradient(0, height * 0.45, 0, height * 0.78);
      mistGrad.addColorStop(0, 'rgba(251, 146, 60, 0)');
      mistGrad.addColorStop(0.6, `rgba(251, 146, 60, ${(sunsetIntensity * 0.18).toFixed(3)})`);
      mistGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, height * 0.45, width, height * 0.33);
    } else if (auroraActive && nightIntensity > 0.3) {
      const palette = AURORA_PALETTES[((Math.max(1, day) + Math.abs(seed)) % AURORA_PALETTES.length)];
      const mistGrad = ctx.createLinearGradient(0, height * 0.44, 0, height * 0.76);
      mistGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      mistGrad.addColorStop(0.6, `rgba(${palette.lowR}, ${palette.lowG}, ${palette.lowB}, ${(nightIntensity * 0.09).toFixed(3)})`);
      mistGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, height * 0.44, width, height * 0.32);
    }

    // Midground ridge
    const midPeriod = 400;
    const midOffset = ((camera.x * 0.22) % midPeriod + midPeriod) % midPeriod;
    ctx.fillStyle = midColor;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = -40; x <= width + 40; x += 40) {
      const worldX = x + midOffset;
      const h = Math.sin(worldX * 0.01) * 45 + Math.sin(worldX * 0.025) * 20;
      const y = height * 0.68 - h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  private renderClouds(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    sunsetIntensity: number,
    nightIntensity: number,
    auroraActive: boolean,
    weather: WeatherType = 'clear',
    weatherIntensity: number = 0
  ) {
    let shadowColor = 'rgba(74, 112, 145, 0.35)';
    let bodyColor = '#fff9e9';
    let rimColor = 'rgba(255, 255, 255, 0.7)';

    if (weather === 'rain' && weatherIntensity > 0.25 && nightIntensity <= 0.35) {
      shadowColor = 'rgba(30, 41, 59, 0.62)';
      bodyColor = '#64748b';
      rimColor = '#94a3b8';
    } else if (weather === 'snow' && weatherIntensity > 0.25 && nightIntensity <= 0.35) {
      shadowColor = 'rgba(100, 116, 139, 0.48)';
      bodyColor = '#cbd5e1';
      rimColor = '#f8fafc';
    } else if (sunsetIntensity > 0.22) {
      shadowColor = 'rgba(131, 24, 67, 0.52)';
      bodyColor = '#fed7aa';
      rimColor = '#fef08a';
    } else if (nightIntensity > 0.35) {
      shadowColor = 'rgba(9, 14, 32, 0.55)';
      bodyColor = '#1e293b';
      rimColor = auroraActive ? 'rgba(94, 234, 212, 0.38)' : 'rgba(148, 163, 184, 0.35)';
    }

    for (const c of this.clouds) {
      const screenX = ((c.x - camera.x * 0.35) % 3500 + 3500) % 3500 - 200;
      const screenY = c.y - camera.y * 0.15;

      const w = c.width;
      ctx.globalAlpha = c.opacity * (nightIntensity > 0.4 ? 0.65 : 1.0);
      ctx.fillStyle = shadowColor;
      ctx.fillRect(Math.floor(screenX + 6), Math.floor(screenY + 3), Math.floor(w * 0.78), 11);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(Math.floor(screenX), Math.floor(screenY - 1), Math.floor(w), 12);
      ctx.fillRect(Math.floor(screenX + 12), Math.floor(screenY - 8), Math.floor(w * 0.62), 10);
      ctx.fillRect(Math.floor(screenX + 31), Math.floor(screenY - 14), Math.floor(w * 0.32), 8);
      ctx.fillStyle = rimColor;
      ctx.fillRect(Math.floor(screenX + 8), Math.floor(screenY - 1), Math.floor(w * 0.48), 2);
      if (sunsetIntensity > 0.3) {
        // Warm crimson-orange underlighting on sunset clouds
        ctx.fillStyle = 'rgba(244, 63, 94, 0.55)';
        ctx.fillRect(Math.floor(screenX + 4), Math.floor(screenY + 9), Math.floor(w * 0.85), 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  private renderVisibleChunks(
    ctx: CanvasRenderingContext2D,
    chunkManager: ChunkManager,
    camera: Camera,
    timeSec: number,
    sunsetIntensity: number = 0,
    nightIntensity: number = 0,
    auroraActive: boolean = false,
    player?: Player,
    remotePlayers?: ReadonlyMap<string, RemotePlayerState>,
    weather: WeatherType = 'clear',
    weatherIntensity: number = 0
  ) {
    const startCX = Math.floor(camera.x / CHUNK_PIXEL_WIDTH);
    const endCX = Math.floor((camera.x + camera.width) / CHUNK_PIXEL_WIDTH);
    const startCY = Math.floor(camera.y / CHUNK_PIXEL_HEIGHT);
    const endCY = Math.floor((camera.y + camera.height) / CHUNK_PIXEL_HEIGHT);

    let count = 0;

    // Pass 1: Draw cached terrain canvases so overhanging craftable structures never get clipped across chunk seams
    for (let cy = startCY; cy <= endCY; cy++) {
      for (let cx = startCX; cx <= endCX; cx++) {
        const key = ChunkManager.getChunkKey(cx, cy);
        const chunk = chunkManager.loadedChunks.get(key);

        if (chunk) {
          count++;
          if (chunk.canvas && !chunk.isAllAir) {
            ctx.drawImage(
              chunk.canvas,
              chunk.worldX * TILE_SIZE,
              chunk.worldY * TILE_SIZE
            );
          }
        }
      }
    }

    // Pass 2: Draw full-sized craftable structures, swaying foliage, lights, and water surfaces
    for (let cy = startCY; cy <= endCY; cy++) {
      for (let cx = startCX; cx <= endCX; cx++) {
        const key = ChunkManager.getChunkKey(cx, cy);
        const chunk = chunkManager.loadedChunks.get(key);

        if (chunk && chunk.canvas && !chunk.isAllAir) {
          this.renderCraftableStructures(ctx, chunk, chunkManager, camera);
          this.renderAnimatedFoliage(ctx, chunk, camera, timeSec, player, remotePlayers, weather, weatherIntensity);
          this.renderAnimatedLightsAndCanopy(ctx, chunk, camera, timeSec, weather, weatherIntensity);
          this.renderWaterSurface(ctx, chunk, timeSec, sunsetIntensity, nightIntensity, auroraActive);
          this.renderWaterfall(ctx, chunk, timeSec);
        }
      }
    }

    this.visibleChunksCount = count;
  }

  /** Renders full-scale, character-proportioned craftable structures (2-block-tall doors/gates, 2-block-wide beds, large benches, furnaces, chests, etc.). */
  private renderCraftableStructures(
    ctx: CanvasRenderingContext2D,
    chunk: import('./types').Chunk,
    chunkManager: ChunkManager,
    camera: Camera
  ) {
    const structureTiles = chunk.craftableStructureTiles;
    if (!structureTiles || structureTiles.length === 0) return;

    const camLeft = camera.x - TILE_SIZE * 2;
    const camRight = camera.x + camera.width + TILE_SIZE * 2;
    const camTop = camera.y - TILE_SIZE * 2;
    const camBottom = camera.y + camera.height + TILE_SIZE * 2;

    for (let k = 0; k < structureTiles.length; k++) {
      const index = structureTiles[k];
      const tile = chunk.tiles[index] as TileType;
      if (tile === TileType.AIR) continue;

      const lx = index & 31;
      const ly = index >> 5;
      const tileWorldX = chunk.worldX + lx;
      const tileWorldY = chunk.worldY + ly;
      const px = tileWorldX * TILE_SIZE;
      const py = tileWorldY * TILE_SIZE;
      if (px < camLeft || px > camRight || py < camTop || py > camBottom) continue;

      // If two doors or gates are stacked vertically, the lower tile already draws the full 2-block-tall structure
      if (tile === TileType.DOOR || tile === TileType.DOOR_OPEN) {
        const below = chunkManager.getTile(tileWorldX, tileWorldY + 1);
        if (below === TileType.DOOR || below === TileType.DOOR_OPEN) continue;
      } else if (tile === TileType.GATE || tile === TileType.GATE_OPEN) {
        const below = chunkManager.getTile(tileWorldX, tileWorldY + 1);
        if (below === TileType.GATE || below === TileType.GATE_OPEN) continue;
      }

      const spriteInfo = getCraftableWorldSprite(tile);
      if (spriteInfo) {
        ctx.drawImage(spriteInfo.canvas, px + spriteInfo.offsetX, py + spriteInfo.offsetY);
      }
    }
  }

  /** Pre-renders and caches a 20x20 swaying foliage sprite for a given (tile, variant, swayStep) so each plant draws in 1 drawImage call. */
  private getFoliageSwaySprite(tile: TileType, variant: number, swayStep: number): HTMLCanvasElement | null {
    const clampedSway = Math.max(-3, Math.min(3, swayStep));
    const key = ((tile & 0xff) << 8) | ((variant & 7) << 4) | ((clampedSway + 4) & 0x0f);
    const cached = this.foliageSwaySpriteCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 22;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Origin inside the 20x22 sprite: tile top-left is at (2, 4)
    const px = 2;
    const py = 4;
    const totalSway = clampedSway / 1.5;

    if (tile === TileType.GRASS || tile === TileType.FLOWER_GRASS || tile === TileType.OASIS_GRASS) {
      const tuftTip = clampedSway;
      const isOasis = tile === TileType.OASIS_GRASS;
      const isFlowerGrass = tile === TileType.FLOWER_GRASS;
      const mainBlade = isOasis ? '#34d399' : '#22c55e';
      const tipBlade = isOasis ? '#a7f3d0' : '#86efac';

      const b1X = px + 2 + (variant & 1);
      const b2X = px + 7 + ((variant >> 1) & 1);
      const b3X = px + 12 + (variant & 1);

      ctx.fillStyle = mainBlade;
      ctx.fillRect(b1X, py - 1, 2, 2);
      ctx.fillRect(b2X, py - 2, 2, 3);
      ctx.fillRect(b3X, py - 1, 2, 2);

      ctx.fillStyle = tipBlade;
      ctx.fillRect(b1X + tuftTip, py - 2, 1, 1);
      ctx.fillRect(b2X + tuftTip, py - 3, 2, 1);
      ctx.fillRect(b3X + tuftTip, py - 2, 1, 1);

      if (isFlowerGrass && (variant & 1) === 0) {
        ctx.fillStyle = (variant & 2) === 0 ? '#f472b6' : '#facc15';
        ctx.fillRect(b2X + tuftTip, py - 4, 2, 2);
      }
    } else if (tile === TileType.TALL_GRASS || tile === TileType.DRY_GRASS) {
      const isDry = tile === TileType.DRY_GRASS;
      const darkCol = isDry ? '#854d0e' : '#14532d';
      const midCol = isDry ? '#ca8a04' : '#16a34a';
      const lightCol = isDry ? '#fde047' : '#4ade80';
      const tipCol = isDry ? '#fef9c3' : '#bbf7d0';

      const swayMid = Math.round(totalSway * 0.85);
      const swayTip = clampedSway;

      const bladeOffsets = [2, 6, 10, 13];
      const bladeHeights = [9, 13, 11, 8];

      for (let b = 0; b < 4; b++) {
        const bx = px + bladeOffsets[b];
        const bh = bladeHeights[(b + variant) & 3];
        const rootH = Math.max(2, Math.floor(bh * 0.36));
        const midH = Math.max(2, Math.floor(bh * 0.34));
        const topH = Math.max(2, bh - rootH - midH);

        const rootY = py + TILE_SIZE - rootH;
        const midY = rootY - midH;
        const topY = midY - topH;

        ctx.fillStyle = darkCol;
        ctx.fillRect(bx, rootY, 2, rootH);
        ctx.fillStyle = midCol;
        ctx.fillRect(bx + swayMid, midY, 2, midH);
        ctx.fillStyle = lightCol;
        ctx.fillRect(bx + swayTip, topY, 2, topH);
        ctx.fillStyle = tipCol;
        ctx.fillRect(bx + swayTip, topY, 1, 2);
      }
    } else if (tile === TileType.FLOWER) {
      const flowerPalettes = [
        { dark: '#be123c', main: '#f43f5e', light: '#fda4af', center: '#fef08a' },
        { dark: '#b45309', main: '#facc15', light: '#fef9c3', center: '#78350f' },
        { dark: '#1d4ed8', main: '#38bdf8', light: '#bae6fd', center: '#fef08a' },
        { dark: '#7e22ce', main: '#c084fc', light: '#f3e8ff', center: '#fde047' },
        { dark: '#be185d', main: '#f472b6', light: '#fbcfe8', center: '#fef08a' },
      ];
      const swayMid = Math.round(totalSway * 0.8);
      const swayTip = clampedSway;
      const bobY = Math.abs(swayTip) >= 2 ? 1 : 0;
      const pal = flowerPalettes[variant % flowerPalettes.length];

      ctx.fillStyle = '#14532d';
      ctx.fillRect(px + 7, py + 11, 2, 5);
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(px + 7 + swayMid, py + 7, 2, 4);

      ctx.fillStyle = '#22c55e';
      ctx.fillRect(px + 4 + swayMid, py + 11, 3, 2);
      ctx.fillRect(px + 9 + swayMid, py + 9, 3, 2);

      const fx = px + 8 + swayTip;
      const fy = py + 5 + bobY;
      ctx.fillStyle = pal.dark;
      ctx.fillRect(fx - 3, fy - 2, 6, 5);
      ctx.fillStyle = pal.main;
      ctx.fillRect(fx - 4, fy - 1, 8, 3);
      ctx.fillRect(fx - 2, fy - 3, 4, 6);
      ctx.fillStyle = pal.light;
      ctx.fillRect(fx - 2, fy - 2, 2, 2);
      ctx.fillStyle = pal.center;
      ctx.fillRect(fx - 1, fy - 1, 2, 2);
    } else if (tile === TileType.VINE) {
      const swayTop = Math.round(totalSway * 0.5);
      const swayMid = Math.round(totalSway * 1.1);
      const swayBot = clampedSway;

      ctx.fillStyle = '#14532d';
      ctx.fillRect(px + 6 + swayTop, py, 2, 5);
      ctx.fillRect(px + 6 + swayMid, py + 5, 2, 6);
      ctx.fillRect(px + 6 + swayBot, py + 11, 2, 5);

      ctx.fillStyle = '#22c55e';
      ctx.fillRect(px + 7 + swayTop, py, 1, 5);
      ctx.fillRect(px + 8 + swayMid, py + 4, 3, 2);
      ctx.fillRect(px + 4 + swayBot, py + 10, 3, 2);
      ctx.fillStyle = '#86efac';
      ctx.fillRect(px + 8 + swayMid, py + 4, 2, 1);
    } else if (tile === TileType.BERRY_BUSH) {
      const swayLeaf = Math.round(totalSway * 0.9);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(px + 4 + swayLeaf, py + 2, 3, 2);
      ctx.fillRect(px + 9 + swayLeaf, py + 3, 3, 2);
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(px + 4 + swayLeaf, py + 8, 2, 2);
      ctx.fillRect(px + 10 + swayLeaf, py + 6, 2, 2);
    }

    this.foliageSwaySpriteCache.set(key, canvas);
    return canvas;
  }

  /** Renders waving tall grass, wildflowers, hanging vines, berry bushes, and surface grass blades using cached sway sprites. */
  private renderAnimatedFoliage(
    ctx: CanvasRenderingContext2D,
    chunk: import('./types').Chunk,
    camera: Camera,
    timeSec: number,
    player?: Player,
    remotePlayers?: ReadonlyMap<string, RemotePlayerState>,
    weather: WeatherType = 'clear',
    weatherIntensity: number = 0
  ) {
    const foliageTiles = chunk.animatedFoliageTiles;
    if (!foliageTiles || foliageTiles.length === 0) return;

    const camLeft = camera.x - TILE_SIZE;
    const camRight = camera.x + camera.width + TILE_SIZE;
    const camTop = camera.y - TILE_SIZE;
    const camBottom = camera.y + camera.height + TILE_SIZE;

    const windSpeed = weather === 'wind' ? 4.4 : weather === 'rain' ? 3.3 : 2.15;
    const windAmp =
      weather === 'wind'
        ? 1.85 + weatherIntensity * 1.45
        : weather === 'rain'
          ? 1.35 + weatherIntensity * 0.85
          : 1.0;
    const windBias = weather === 'wind' ? 0.85 * weatherIntensity : weather === 'rain' ? -0.55 * weatherIntensity : 0;

    const playerCenterX = player ? player.x + player.width * 0.5 : -999999;
    const playerCenterY = player ? player.y + player.height * 0.65 : -999999;
    const hasRemotePlayers = !!remotePlayers && remotePlayers.size > 0;

    for (let k = 0; k < foliageTiles.length; k++) {
      const index = foliageTiles[k];
      const tile = chunk.tiles[index] as TileType;
      if (tile === TileType.AIR) continue;

      const lx = index & 31;
      const ly = index >> 5;
      const tileWorldX = chunk.worldX + lx;
      const tileWorldY = chunk.worldY + ly;
      const px = tileWorldX * TILE_SIZE;
      const py = tileWorldY * TILE_SIZE;

      if (px < camLeft || px > camRight || py < camTop || py > camBottom) continue;

      const wavePhase = tileWorldX * 0.42 + tileWorldY * 0.19;
      const baseWave = Math.sin(timeSec * windSpeed + wavePhase) * 0.85 + windBias;

      let entityPush = 0;
      const dxP = px + 8 - playerCenterX;
      const dyP = py + 8 - playerCenterY;
      if (Math.abs(dxP) < 16 && Math.abs(dyP) < 20) {
        const pushStrength = (1 - Math.abs(dxP) / 16) * 2.2;
        entityPush = dxP >= 0 ? pushStrength : -pushStrength;
      } else if (hasRemotePlayers) {
        for (const rp of remotePlayers!.values()) {
          const rdx = px + 8 - (rp.x + 7);
          const rdy = py + 8 - (rp.y + 14);
          if (Math.abs(rdx) < 15 && Math.abs(rdy) < 20) {
            const pushStrength = (1 - Math.abs(rdx) / 15) * 2.0;
            entityPush = rdx >= 0 ? pushStrength : -pushStrength;
            break;
          }
        }
      }

      const totalSway = baseWave * windAmp + entityPush;
      const swayStep = Math.max(-3, Math.min(3, Math.round(totalSway * 1.5)));
      const variant =
        tile === TileType.FLOWER
          ? ((tileWorldX * 7 + tileWorldY * 3) & 0x7fffffff) % 5
          : Math.abs(tileWorldX) & 3;

      const sprite = this.getFoliageSwaySprite(tile, variant, swayStep);
      if (sprite) {
        ctx.drawImage(sprite, px - 2, py - 4);
      }
    }
  }

  /** Renders flickering torches, campfires, crystal glints, glowing mushroom spores, and rustling tree canopy leaves. */
  private renderAnimatedLightsAndCanopy(
    ctx: CanvasRenderingContext2D,
    chunk: import('./types').Chunk,
    camera: Camera,
    timeSec: number,
    weather: WeatherType = 'clear',
    weatherIntensity: number = 0
  ) {
    const camLeft = camera.x - TILE_SIZE;
    const camRight = camera.x + camera.width + TILE_SIZE;
    const camTop = camera.y - TILE_SIZE;
    const camBottom = camera.y + camera.height + TILE_SIZE;

    const lightTiles = chunk.animatedLightTiles;
    const windLean = weather === 'wind' ? Math.round(1.5 * weatherIntensity) : weather === 'rain' ? -1 : 0;

    if (lightTiles && lightTiles.length > 0) {
      for (let k = 0; k < lightTiles.length; k++) {
        const index = lightTiles[k];
        const tile = chunk.tiles[index] as TileType;
        if (tile === TileType.AIR) continue;

        const lx = index & 31;
        const ly = index >> 5;
        const tileWorldX = chunk.worldX + lx;
        const tileWorldY = chunk.worldY + ly;
        const px = tileWorldX * TILE_SIZE;
        const py = tileWorldY * TILE_SIZE;
        if (px < camLeft || px > camRight || py < camTop || py > camBottom) continue;

        const phase = tileWorldX * 1.37 + tileWorldY * 2.91;

        if (tile === TileType.TORCH) {
          const flicker = Math.sin(timeSec * 11.5 + phase) * 0.5 + Math.cos(timeSec * 17.3 - phase) * 0.5;
          const flameShift = Math.round(flicker * 1.4) + windLean;
          const flameStretch = flicker > 0.15 ? 2 : 0;

          ctx.fillStyle = 'rgba(251, 191, 36, 0.20)';
          ctx.fillRect(px, py - 9, 16, 16);

          ctx.fillStyle = '#ea580c';
          ctx.fillRect(px + 4 + flameShift, py - 5 - flameStretch, 8, 6 + flameStretch);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(px + 5 + flameShift, py - 7 - flameStretch, 6, 6 + flameStretch);
          ctx.fillStyle = '#fef9c3';
          ctx.fillRect(px + 6 + flameShift, py - 5 - flameStretch, 4, 4);
        } else if (tile === TileType.CAMPFIRE) {
          const f1 = Math.sin(timeSec * 10.2 + phase);
          const f2 = Math.cos(timeSec * 13.8 - phase);
          const shift = Math.round(f1 * 1.3) + windLean;

          ctx.fillStyle = 'rgba(249, 115, 22, 0.22)';
          ctx.fillRect(px - 4, py - 8, 24, 20);

          ctx.fillStyle = '#ea580c';
          ctx.fillRect(px + 2 + shift, py - 1, 12, 8);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(px + 4 + shift, py - 4 - (f2 > 0 ? 2 : 0), 8, 9);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px + 6 + shift, py - 1, 4, 5);
        } else if (tile === TileType.FURNACE) {
          const f1 = Math.sin(timeSec * 9.5 + phase);
          const shift = Math.round(f1);
          ctx.fillStyle = 'rgba(249, 115, 22, 0.18)';
          ctx.fillRect(px - 2, py, 20, 16);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(px + 5 + shift, py + 6, 6, 5);
          ctx.fillStyle = '#fef9c3';
          ctx.fillRect(px + 6 + shift, py + 7, 4, 3);
        } else if (
          tile === TileType.GLOWING_CRYSTAL ||
          tile === TileType.CRYSTAL_ORE ||
          tile === TileType.DIAMOND_ORE
        ) {
          const twinkle = Math.sin(timeSec * 3.8 + phase * 2.1);
          if (twinkle > 0.55) {
            const gx = px + 5 + ((tileWorldX * 5) % 6);
            const gy = py + 4 + ((tileWorldY * 3) % 6);
            ctx.fillStyle = tile === TileType.DIAMOND_ORE ? '#ecfeff' : '#fdf4ff';
            ctx.fillRect(gx - 1, gy, 3, 1);
            ctx.fillRect(gx, gy - 1, 1, 3);
          }
        } else if (tile === TileType.GLOWING_MUSHROOM) {
          const pulse = (Math.sin(timeSec * 2.6 + phase) + 1) * 0.5;
          const sporeY = py + 3 - Math.round(pulse * 4);
          const sporeX = px + 5 + Math.round(Math.cos(timeSec * 1.9 + phase) * 3);
          ctx.fillStyle = '#e879f9';
          ctx.fillRect(sporeX, sporeY, 1, 1);
        } else if (tile === TileType.MAGMA) {
          const pulse = (Math.sin(timeSec * 3.2 + phase) + 1) * 0.5;
          if (pulse > 0.6) {
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(px + 3 + ((tileWorldX * 3) & 7), py + 3 + ((tileWorldY * 5) & 7), 2, 1);
          }
        }
      }
    }

    // Subtle wind-rustling leaf bushels on outer tree canopy blocks
    const canopyTiles = chunk.canopyEdgeTiles;
    if (canopyTiles && canopyTiles.length > 0) {
      const rustleSpeed = weather === 'wind' ? 4.8 : 2.2;
      const rustleScale = weather === 'wind' ? 2.2 : 1.1;
      for (let k = 0; k < canopyTiles.length; k += 2) {
        const index = canopyTiles[k];
        const tile = chunk.tiles[index] as TileType;
        if (tile === TileType.AIR) continue;

        const lx = index & 31;
        const ly = index >> 5;
        const tileWorldX = chunk.worldX + lx;
        const tileWorldY = chunk.worldY + ly;
        const px = tileWorldX * TILE_SIZE;
        const py = tileWorldY * TILE_SIZE;
        if (px < camLeft || px > camRight || py < camTop || py > camBottom) continue;

        const wave = Math.sin(timeSec * rustleSpeed + tileWorldX * 0.55 + tileWorldY * 0.35);
        const shiftX = Math.round(wave * rustleScale);
        if (shiftX === 0 && (k & 7) !== 0) continue;

        const highlightColor =
          tile === TileType.CHERRY_LEAVES
            ? '#ffe4e6'
            : tile === TileType.BIRCH_LEAVES
              ? '#d9f99d'
              : tile === TileType.ACACIA_LEAVES
                ? '#bef264'
                : '#86efac';
        const midColor =
          tile === TileType.CHERRY_LEAVES
            ? '#f472b6'
            : tile === TileType.BIRCH_LEAVES
              ? '#84cc16'
              : tile === TileType.ACACIA_LEAVES
                ? '#65a30d'
                : '#22c55e';

        ctx.fillStyle = midColor;
        ctx.fillRect(px + 3 + shiftX, py + 2, 5, 3);
        ctx.fillStyle = highlightColor;
        ctx.fillRect(px + 4 + shiftX, py + 2, 3, 2);

        if ((k & 7) === 0) {
          const dropCycle = (timeSec * (weather === 'wind' ? 0.55 : 0.32) + ((tileWorldX * 19 + tileWorldY * 31) & 63) * 0.11) % 1;
          if (dropCycle < 0.7) {
            const p = dropCycle / 0.7;
            const leafX =
              px +
              8 +
              Math.round(Math.sin(p * Math.PI * 3 + tileWorldX) * 7 + (weather === 'wind' ? p * 18 : p * 5));
            const leafY = py + 14 + Math.round(p * 26);
            ctx.fillStyle = tile === TileType.CHERRY_LEAVES ? '#fbcfe8' : highlightColor;
            ctx.fillRect(leafX, leafY, 2, 1);
          }
        }
      }
    }
  }

  /** Renders ambient daytime butterflies & sunlit pollen motes, plus nighttime glowing fireflies & drifting canopy petals. */
  private renderAmbientNatureDetails(
    ctx: CanvasRenderingContext2D,
    chunkManager: ChunkManager,
    camera: Camera,
    timeSec: number,
    nightIntensity: number,
    weather: WeatherType,
    weatherIntensity: number
  ) {
    if (weather === 'rain' && weatherIntensity > 0.45) return;

    const spanX = Math.max(320, camera.width + 80);
    const baseSectorX = Math.floor(camera.x / spanX) * spanX;
    const butterflyColors = [
      { wing: '#fb923c', tip: '#fef08a' }, // Monarch Orange
      { wing: '#38bdf8', tip: '#e0f2fe' }, // Morpho Blue
      { wing: '#f472b6', tip: '#fce7f3' }, // Sakura Pink
      { wing: '#facc15', tip: '#fef9c3' }, // Swallowtail Gold
    ];

    ctx.save();

    for (let sector = -1; sector <= 1; sector++) {
      const sectorOriginX = baseSectorX + sector * spanX;

      // 1. Nighttime Glowing Fireflies (dusk through night above surface meadows)
      if (nightIntensity > 0.2) {
        const fireflyAlpha = Math.min(1, (nightIntensity - 0.2) / 0.45);
        for (let i = 0; i < 9; i++) {
          const seedHash = ((Math.imul((sectorOriginX >> 4) + i * 73, 0x9e3779b1) >>> 0) % 1000) / 1000;
          const baseX = sectorOriginX + seedHash * spanX;
          const driftX = Math.sin(timeSec * (0.9 + (i % 3) * 0.35) + i * 2.1) * 18;
          const wx = baseX + driftX;
          const tileX = Math.floor(wx / TILE_SIZE);
          const surfaceY = chunkManager.terrainGen.getSurfaceHeight(tileX) * TILE_SIZE;
          const hoverOffset = 14 + ((i * 19) % 44) + Math.cos(timeSec * (1.5 + (i % 4) * 0.3) + i * 1.7) * 10;
          const wy = surfaceY - hoverOffset;

          if (wx < camera.x - 20 || wx > camera.x + camera.width + 20) continue;
          if (wy < camera.y - 20 || wy > camera.y + camera.height + 20) continue;

          const blink = (Math.sin(timeSec * (2.8 + (i % 3) * 0.9) + i * 4.3) + 1) * 0.5;
          if (blink < 0.18) continue;

          const alpha = fireflyAlpha * (0.35 + blink * 0.65);
          const fx = Math.floor(wx);
          const fy = Math.floor(wy);

          // Soft lantern aura
          ctx.fillStyle = `rgba(190, 242, 100, ${(alpha * 0.26).toFixed(3)})`;
          ctx.fillRect(fx - 2, fy - 2, 5, 5);
          // Bright firefly core
          ctx.fillStyle = `rgba(254, 240, 138, ${alpha.toFixed(3)})`;
          ctx.fillRect(fx, fy, 2, 2);
        }
      }

      // 2. Daytime Flapping Pixel Butterflies & Floating Sunlit Pollen/Petals
      if (nightIntensity < 0.45) {
        const dayAlpha = Math.min(1, (0.45 - nightIntensity) / 0.3);

        // Flapping butterflies near surface grass & flowers
        for (let b = 0; b < 5; b++) {
          const seedHash = ((Math.imul((sectorOriginX >> 4) + b * 131 + 17, 0x85ebca6b) >>> 0) % 1000) / 1000;
          const baseX = sectorOriginX + seedHash * spanX;
          const figure8X = Math.sin(timeSec * (1.35 + (b % 3) * 0.25) + b * 3.1) * 26;
          const wx = baseX + figure8X;
          const tileX = Math.floor(wx / TILE_SIZE);
          const surfaceY = chunkManager.terrainGen.getSurfaceHeight(tileX) * TILE_SIZE;
          const flutterY =
            16 +
            ((b * 13) % 32) +
            Math.sin(timeSec * 3.6 + b * 1.9) * 7 +
            Math.cos(timeSec * 1.8 + b) * 5;
          const wy = surfaceY - flutterY;

          if (wx < camera.x - 16 || wx > camera.x + camera.width + 16) continue;
          if (wy < camera.y - 16 || wy > camera.y + camera.height + 16) continue;

          const bx = Math.floor(wx);
          const by = Math.floor(wy);
          const wingsOpen = Math.floor(timeSec * 9.5 + b * 1.7) % 2 === 0;
          const pal = butterflyColors[(b + Math.abs(tileX)) % butterflyColors.length];

          ctx.globalAlpha = dayAlpha;
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(bx, by, 1, 2);
          ctx.fillStyle = pal.wing;
          if (wingsOpen) {
            ctx.fillRect(bx - 2, by - 1, 2, 2);
            ctx.fillRect(bx + 1, by - 1, 2, 2);
            ctx.fillStyle = pal.tip;
            ctx.fillRect(bx - 2, by - 1, 1, 1);
            ctx.fillRect(bx + 2, by - 1, 1, 1);
          } else {
            ctx.fillRect(bx - 1, by - 2, 2, 2);
            ctx.fillStyle = pal.tip;
            ctx.fillRect(bx, by - 2, 1, 1);
          }
        }

        // Drifting sunlit dandelion seeds / tree blossom petals
        for (let m = 0; m < 8; m++) {
          const seedHash = ((Math.imul((sectorOriginX >> 4) + m * 97 + 53, 0xc2b2ae35) >>> 0) % 1000) / 1000;
          const travelX = (timeSec * (8 + (m % 3) * 4) + seedHash * spanX) % spanX;
          const wx = sectorOriginX + travelX;
          const tileX = Math.floor(wx / TILE_SIZE);
          const surfaceY = chunkManager.terrainGen.getSurfaceHeight(tileX) * TILE_SIZE;
          const fallCycle = (timeSec * 0.18 + m * 0.37) % 1;
          const wy = surfaceY - (64 - fallCycle * 56) + Math.sin(timeSec * 2.2 + m) * 4;

          if (wx < camera.x - 10 || wx > camera.x + camera.width + 10) continue;
          if (wy < camera.y - 10 || wy > camera.y + camera.height + 10) continue;

          const fade = Math.sin(fallCycle * Math.PI);
          ctx.globalAlpha = dayAlpha * fade * 0.78;
          ctx.fillStyle = m % 3 === 0 ? '#fbcfe8' : m % 3 === 1 ? '#fef9c3' : '#bbf7d0';
          ctx.fillRect(Math.floor(wx), Math.floor(wy), 2, 1);
        }
      }
    }

    ctx.restore();
  }

  /** One cached-chunk scan draws a continuous animated waterline with sunset & aurora reflections. */
  private renderWaterSurface(
    ctx: CanvasRenderingContext2D,
    chunk: import('./types').Chunk,
    timeSec: number,
    sunsetIntensity: number,
    nightIntensity: number,
    auroraActive: boolean
  ) {
    const surfaces = chunk.waterSurfaceTiles ?? [];
    if (!surfaces.length) return;
    ctx.save();
    if (sunsetIntensity > 0.3) {
      ctx.strokeStyle = 'rgba(253, 186, 116, 0.82)';
    } else if (nightIntensity > 0.4 && auroraActive) {
      ctx.strokeStyle = 'rgba(110, 231, 183, 0.72)';
    } else {
      ctx.strokeStyle = 'rgba(190, 248, 250, 0.76)';
    }
    ctx.lineWidth = 1.35;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let previousX = -2;
    let previousY = -2;
    for (const index of surfaces) {
      const lx = index % 32;
      const ly = Math.floor(index / 32);
      const wx = (chunk.worldX + lx) * TILE_SIZE;
      const wy = (chunk.worldY + ly) * TILE_SIZE;
      const wave = Math.sin(timeSec * 2.1 + (chunk.worldX + lx) * 0.16) * 1.05;
      if (lx !== previousX + 1 || ly !== previousY) ctx.moveTo(wx, wy + wave);
      else ctx.lineTo(wx, wy + wave);
      ctx.lineTo(wx + TILE_SIZE, wy + Math.sin(timeSec * 2.1 + (chunk.worldX + lx + 1) * 0.16) * 1.05);
      previousX = lx;
      previousY = ly;
    }
    ctx.stroke();

    ctx.fillStyle = sunsetIntensity > 0.3
      ? 'rgba(254, 240, 138, 0.75)'
      : nightIntensity > 0.4 && auroraActive
        ? 'rgba(167, 243, 208, 0.68)'
        : 'rgba(221, 255, 255, 0.62)';
    for (let n = 0; n < 3; n++) {
      const surfaceIndex = ((Math.floor(timeSec * 5) + n * 13 + chunk.worldX * 7) >>> 0) % surfaces.length;
      const i = surfaces[surfaceIndex];
      ctx.fillRect((chunk.worldX + i % 32) * TILE_SIZE + 3, (chunk.worldY + Math.floor(i / 32)) * TILE_SIZE + 4, 5, 1);
    }
    ctx.restore();
  }

  private renderWaterfall(ctx: CanvasRenderingContext2D, chunk: import('./types').Chunk, timeSec: number) {
    const tiles = chunk.waterfallTiles ?? [];
    if (!tiles.length) return;

    ctx.save();
    ctx.fillStyle = 'rgba(220,250,255,.58)';
    for (const index of tiles) {
      const lx = index % 32;
      const ly = Math.floor(index / 32);
      const worldY = chunk.worldY + ly;
      const travel = ((timeSec * 26 - worldY * 7 + 16000) % TILE_SIZE + TILE_SIZE) % TILE_SIZE;
      const px = (chunk.worldX + lx) * TILE_SIZE;
      const py = worldY * TILE_SIZE;
      ctx.fillRect(px + 5, py + travel, 2, 5);
      ctx.fillStyle = 'rgba(220,250,255,.3)';
      ctx.fillRect(px + 11, py + (travel + 8) % TILE_SIZE, 1, 3);
      ctx.fillStyle = 'rgba(220,250,255,.58)';
    }
    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1.0;
  }

  private renderWeather(
    ctx: CanvasRenderingContext2D,
    weather: WeatherType,
    weatherIntensity: number,
    timeSec: number
  ) {
    if (weather === 'clear' || weatherIntensity <= 0.04 || this.weatherParticles.length === 0) return;

    ctx.save();
    for (const wp of this.weatherParticles) {
      const px = Math.floor(wp.x);
      const py = Math.floor(wp.y);
      ctx.globalAlpha = Math.max(0, Math.min(1, wp.alpha * weatherIntensity));

      if (wp.kind === 'rain') {
        // Stepped pixel-art angled raindrop streak
        ctx.fillStyle = wp.color;
        const halfLen = Math.max(3, Math.floor(wp.length * 0.5));
        ctx.fillRect(px, py, 1, halfLen);
        ctx.fillRect(px + 1, py - halfLen + 1, 1, halfLen);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(px, py + halfLen - 1, 1, 2);
      } else if (wp.kind === 'snow') {
        // Crisp pixel-art snowflake (1x1, 2x2, or 3x3 cross crystal)
        ctx.fillStyle = wp.color;
        if (wp.size >= 3) {
          ctx.fillRect(px, py - 1, 1, 3);
          ctx.fillRect(px - 1, py, 3, 1);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px, py, 1, 1);
        } else {
          ctx.fillRect(px, py, wp.size, wp.size);
        }
      } else if (wp.kind === 'streak') {
        // Sweeping wind air-current ribbon
        const segLen = Math.max(6, Math.floor(wp.length / 3));
        const wave = Math.round(Math.sin(timeSec * 4.5 + wp.phase) * 1.5);
        ctx.fillStyle = wp.color;
        ctx.fillRect(px, py, segLen, 1);
        ctx.fillRect(px + segLen, py + wave, segLen, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + segLen * 2, py, segLen - 2, 1);
      } else {
        // Tumbling windblown pixel leaf
        const flip = Math.floor(timeSec * 6 + wp.phase) % 2 === 0;
        ctx.fillStyle = wp.color;
        if (flip) {
          ctx.fillRect(px, py, 3, 2);
          ctx.fillRect(px + 1, py - 1, 2, 1);
        } else {
          ctx.fillRect(px, py, 2, 3);
          ctx.fillRect(px - 1, py + 1, 1, 2);
        }
      }
    }
    ctx.restore();
  }

  private renderPlayer(
    ctx: CanvasRenderingContext2D,
    player: Player,
    selectedSlot?: HotbarSlot,
    swingState?: BlockInteraction,
    timeSec: number = 0,
    weather: WeatherType = 'clear',
    weatherIntensity: number = 0
  ) {
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);

    ctx.save();

    if (player.health <= 0) {
      ctx.globalAlpha = 0.45;
    } else if (player.invulnerableTimer > 0) {
      const isVisible = Math.floor(player.invulnerableTimer * 22) % 2 === 0;
      if (!isVisible) {
        ctx.globalAlpha = 0.4;
      }
    }

    if (!player.facingRight) {
      ctx.translate(px + player.width / 2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(px + player.width / 2), 0);
    }

    let bobY = 0;
    let legOffset = 0;

    if (player.state === 'walk') {
      bobY = Math.abs(Math.sin(player.animTimer * 2)) * 1.5;
      legOffset = Math.sin(player.animTimer * 2) * 3;
    } else if (player.state === 'swim') {
      bobY = Math.sin(player.animTimer * 2.5) * 1.5;
      legOffset = Math.sin(player.animTimer * 3.5) * 3;
    } else if (player.state === 'idle') {
      bobY = Math.sin(player.animTimer) * 0.8;
    } else if (player.state === 'jump') {
      bobY = -1;
      legOffset = -2;
    } else if (player.state === 'fall') {
      bobY = 1;
      legOffset = 2;
    }

    const drawY = py + bobY;

    if (!player.isInWater) {
      ctx.fillStyle = 'rgba(10,22,24,.34)';
      ctx.fillRect(px - 1, py + player.height - 1, player.width + 3, 3);
    } else {
      const rippleSpread = 2 + Math.abs(Math.sin(player.animTimer * 2)) * 3;
      ctx.fillStyle = 'rgba(114, 196, 235, 0.45)';
      ctx.fillRect(px - rippleSpread, py + player.height * 0.65, player.width + rippleSpread * 2, 2.5);
    }
    ctx.fillStyle = '#29251f';
    ctx.fillRect(px + 1, drawY - 1, 12, 10);
    ctx.fillRect(px, drawY + 8, 14, 9);
    ctx.fillRect(px - 1, drawY + 9, 4, 7);
    ctx.fillRect(px + 11, drawY + 9, 4, 7);
    ctx.fillRect(px + 1 - legOffset, drawY + 15, 6, 8);
    ctx.fillRect(px + 7 + legOffset, drawY + 15, 7, 8);

    // Backpack
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px - 2, drawY + 8, 4, 10);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(px - 1, drawY + 9, 2, 3);

    // Legs & Boots
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 2 - legOffset, drawY + 16, 4, 6);
    ctx.fillRect(px + 8 + legOffset, drawY + 16, 4, 6);

    ctx.fillStyle = '#451a03';
    ctx.fillRect(px + 1 - legOffset, drawY + 22, 5, 4);
    ctx.fillRect(px + 7 + legOffset, drawY + 22, 6, 4);

    // Torso / Tunic
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(px + 2, drawY + 8, 10, 8);
    ctx.fillStyle = '#5eead4';
    ctx.fillRect(px + 3, drawY + 9, 2, 4);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(px + 2, drawY + 15, 10, 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(px + 6, drawY + 15, 3, 2);

    // Arms & Hands
    ctx.fillStyle = '#14b8a6';
    ctx.fillRect(px + 1 - legOffset * 0.8, drawY + 9, 3, 6);
    ctx.fillStyle = '#fbcfe8';
    ctx.fillRect(px + 1 - legOffset * 0.8, drawY + 14, 3, 2);

    // Head, Face & Wind-Fluttering Bandana
    ctx.fillStyle = '#292524';
    ctx.fillRect(px + 2, drawY, 10, 8);
    ctx.fillStyle = '#fcd34d';
    ctx.fillRect(px + 3, drawY + 2, 8, 6);

    const speedFactor = Math.min(1.5, Math.abs(player.vx) / 90);
    const windFactor = weather === 'wind' ? 1.4 * weatherIntensity : 0.4;
    const tailWave1 = Math.round(Math.sin(timeSec * (6.5 + speedFactor * 4) + px * 0.1) * (1.1 + windFactor * 0.6));
    const tailWave2 = Math.round(Math.cos(timeSec * (7.5 + speedFactor * 4) + px * 0.1) * (1.4 + windFactor * 0.8));

    ctx.fillStyle = '#e11d48';
    ctx.fillRect(px + 1, drawY + 1, 12, 3);
    ctx.fillRect(px - 2, drawY + 2 + tailWave1, 3, 2);
    ctx.fillRect(px - 5, drawY + 3 + tailWave2, 3, 2);
    ctx.fillStyle = '#fb7185';
    ctx.fillRect(px + 2, drawY + 1, 5, 1);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px + 8, drawY + 4, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + 9, drawY + 4, 1, 1);

    const isToolSwinging = !!(swingState && swingState.swingTimer > 0 && swingState.swingKind && swingState.swingKind !== 'sword');
    const toolKind = isToolSwinging ? swingState!.swingKind! : selectedSlot?.toolKind;
    const toolTier = isToolSwinging ? (swingState!.swingTier ?? selectedSlot?.toolTier ?? 'wood') : selectedSlot?.toolTier;
    if (toolKind && toolTier && toolKind !== 'sword') {
      const handX = px + player.width - 1;
      const handY = drawY + 12;
      const swinging = swingState?.swingKind === toolKind && swingState.swingTimer > 0;
      const progress = swinging ? 1 - swingState!.swingTimer / 0.2 : 0;
      const aimedDx = (swingState!.swingTargetX - handX) * (player.facingRight ? 1 : -1);
      const targetAngle = swinging
        ? Math.atan2(swingState!.swingTargetY - handY, aimedDx) - Math.PI / 4
        : -Math.PI / 3;
      const angle = swinging ? targetAngle - (1 - progress) * 1.1 : targetAngle;
      const head = ({wood:'#b77943',stone:'#a8b2bd',copper:'#c87953',iron:'#dbe4ee',gold:'#facc15',diamond:'#38bdf8',astral:'#fbbf24',celestial:'#c084fc'} as const)[toolTier] ?? '#38bdf8';
      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(angle);
      ctx.scale(1.38, 1.38);
      ctx.fillStyle = '#30251c'; ctx.fillRect(2,-2,17,5);
      ctx.fillStyle = '#8b5428'; ctx.fillRect(3,-1,14,3);
      ctx.fillStyle = '#c0844b'; ctx.fillRect(6,-1,6,1);
      if (toolKind === 'pickaxe') {
        ctx.fillStyle = '#273238'; ctx.fillRect(10,-8,12,5); ctx.fillRect(17,-4,6,4);
        ctx.fillStyle = head; ctx.fillRect(11,-7,9,3); ctx.fillRect(18,-4,5,2);
        ctx.fillStyle = '#fff1c2'; ctx.fillRect(12,-7,5,1);
      } else if (toolKind === 'hoe') {
        ctx.fillStyle = '#513f26'; ctx.fillRect(5,-11,8,4); ctx.fillRect(9,-7,7,3); ctx.fillRect(13,-5,6,2);
        ctx.fillStyle = '#d4a373'; ctx.fillRect(10,-9,8,4); ctx.fillStyle = '#fff1c2'; ctx.fillRect(11,-8,5,1);
      } else {
        ctx.fillStyle = '#273238'; ctx.fillRect(7,-10,10,8); ctx.fillRect(13,-7,6,5);
        ctx.fillStyle = head; ctx.fillRect(8,-9,8,6); ctx.fillRect(14,-6,5,3);
        ctx.fillStyle = '#fff1c2'; ctx.fillRect(9,-9,5,1);
      }
      ctx.restore();
      if (swinging) {
        ctx.fillStyle = 'rgba(255,245,190,.55)';
        ctx.fillRect(Math.floor(swingState!.swingTargetX - 2), Math.floor(swingState!.swingTargetY - 2), 4, 4);
      }
    }
    if (toolKind === 'sword' && !player.isAttacking) {
      const tier = toolTier ?? 'gold';
      const blade = ({wood:'#b77943',stone:'#cbd5e1',copper:'#c87953',iron:'#e2e8f0',gold:'#facc15',diamond:'#38bdf8',astral:'#fbbf24',celestial:'#c084fc'} as const)[tier] ?? '#38bdf8';
      ctx.save();
      ctx.translate(px + player.width - 1, drawY + 13);
      ctx.rotate(-Math.PI / 3);
      ctx.scale(1.38, 1.38);
      ctx.fillStyle = '#713f12'; ctx.fillRect(1,-1,6,3);
      ctx.fillStyle = '#422006'; ctx.fillRect(6,-4,2,9);
      ctx.fillStyle = '#263238'; ctx.fillRect(8,-2,14,5);
      ctx.fillStyle = blade; ctx.fillRect(9,-1,11,3);
      ctx.fillStyle = '#fff1c2'; ctx.fillRect(10,-1,8,1);
      ctx.restore();
    }

    if (player.flashTimer > 0) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.fillRect(px - 2, drawY - 1, player.width + 4, player.height + 3);
    }

    if (player.isAttacking && player.attackTimer > 0) {
      const progress = 1 - (player.attackTimer / 0.22);
      const swordBaseX = px + player.width;
      const swordBaseY = drawY + 12;
      const tier = selectedSlot?.toolTier ?? 'gold';
      const bladeColor = ({wood:'#d97706',stone:'#cbd5e1',copper:'#ea580c',iron:'#e2e8f0',gold:'#fde047',diamond:'#38bdf8',astral:'#fbbf24',celestial:'#c084fc'} as const)[tier] ?? '#fde047';

      ctx.save();
      ctx.translate(swordBaseX, swordBaseY);

      const angle = (-Math.PI / 4) + progress * (Math.PI * 0.65);
      ctx.rotate(angle);
      ctx.scale(1.38, 1.38);

      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, -1.5, 4, 3);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(4, -4, 2, 8);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(6, -2.5, 15, 5);
      ctx.fillStyle = bladeColor;
      ctx.fillRect(7, -1.5, 13, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, -1, 10, 1);

      ctx.restore();

      ctx.strokeStyle = `rgba(254, 240, 138, ${(1 - progress).toFixed(2)})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(swordBaseX, swordBaseY, 24, -Math.PI / 3, Math.PI / 4);
      ctx.stroke();
    }

    ctx.restore();

    // Visual indicator system for active status buffs (small badges floating above player character)
    this.renderPlayerBuffBadges(
      ctx,
      Math.floor(player.x + player.width / 2),
      Math.floor(player.y),
      player.activeBuffs,
      timeSec
    );
  }

  private renderPlayerBuffBadges(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    playerHeadY: number,
    buffs?: ActiveFoodBuff[],
    timeSec: number = 0
  ) {
    if (!buffs || buffs.length === 0) return;

    const activeBuffList = buffs.filter((b) => b.remainingSec > 0);
    if (activeBuffList.length === 0) return;

    ctx.save();

    // 1. Aura / particle feedback based on active buffs around player
    for (const buff of activeBuffList) {
      const pulse = 0.5 + 0.5 * Math.sin(timeSec * 6);

      if (buff.id === 'swiftness') {
        // Cyan electric speed streaks trailing at feet
        const trailOffset = Math.sin(timeSec * 9) * 5;
        ctx.fillStyle = `rgba(56, 189, 248, ${(0.45 * pulse).toFixed(2)})`;
        ctx.fillRect(centerX - 8 + trailOffset, playerHeadY + 23, 4, 2);
        ctx.fillRect(centerX + 4 - trailOffset, playerHeadY + 24, 3, 2);
      } else if (buff.id === 'ferocity') {
        // Red attack power embers shimmering near hands/weapon
        const flameOffset = Math.cos(timeSec * 8) * 4;
        ctx.fillStyle = `rgba(239, 68, 68, ${(0.55 * pulse).toFixed(2)})`;
        ctx.fillRect(centerX + flameOffset, playerHeadY + 11, 2, 3);
        ctx.fillRect(centerX - flameOffset, playerHeadY + 7, 2, 2);
      } else if (buff.id === 'fortitude') {
        // Golden shield glint at shoulders
        ctx.fillStyle = `rgba(251, 146, 60, ${(0.42 * pulse).toFixed(2)})`;
        ctx.fillRect(centerX - 9, playerHeadY + 8, 2, 4);
        ctx.fillRect(centerX + 7, playerHeadY + 8, 2, 4);
      } else if (buff.id === 'titan') {
        // Regal purple titan crown sparkles
        ctx.fillStyle = `rgba(192, 132, 252, ${(0.5 * pulse).toFixed(2)})`;
        ctx.fillRect(centerX - 3, playerHeadY - 3, 2, 2);
        ctx.fillRect(centerX + 2, playerHeadY - 3, 2, 2);
      } else if (buff.id === 'amphibious') {
        // Emerald aquatic bubbles
        ctx.fillStyle = `rgba(16, 185, 129, ${(0.45 * pulse).toFixed(2)})`;
        ctx.fillRect(centerX - 6, playerHeadY + 16, 2, 2);
        ctx.fillRect(centerX + 5, playerHeadY + 14, 2, 2);
      }
    }

    // 2. Compact floating badges above the player character's head
    const badgeHeight = 11;
    const badgeSpacing = 3;
    const badgeWidth = activeBuffList.length === 1 ? 26 : 22;
    const totalWidth = activeBuffList.length * badgeWidth + (activeBuffList.length - 1) * badgeSpacing;
    const startX = Math.round(centerX - totalWidth / 2);
    const badgeY = Math.round(playerHeadY - 14);

    for (let i = 0; i < activeBuffList.length; i++) {
      const buff = activeBuffList[i];
      const bx = startX + i * (badgeWidth + badgeSpacing);
      const by = badgeY;

      // Color scheme based on status buff type:
      // Movement Speed: Cyan (#38bdf8 / #06b6d4)
      // Attack Power: Fiery Crimson Red (#ef4444)
      // Defense: Warm Amber (#fb923c / #f59e0b)
      // Amphibious: Emerald Aqua (#10b981)
      // Titan: Royal Purple (#c084fc)
      // Regeneration: Bright Green (#22c55e)
      let primaryColor = buff.color || '#38bdf8';
      let iconSymbol = '⚡';

      switch (buff.id) {
        case 'swiftness':
          primaryColor = '#38bdf8';
          iconSymbol = '⚡';
          break;
        case 'ferocity':
          primaryColor = '#ef4444';
          iconSymbol = '⚔';
          break;
        case 'fortitude':
          primaryColor = '#fb923c';
          iconSymbol = '🛡';
          break;
        case 'amphibious':
          primaryColor = '#10b981';
          iconSymbol = '🌊';
          break;
        case 'titan':
          primaryColor = '#c084fc';
          iconSymbol = '👑';
          break;
        case 'regeneration':
          primaryColor = '#22c55e';
          iconSymbol = '💖';
          break;
        default:
          primaryColor = buff.color || '#facc15';
          iconSymbol = '★';
          break;
      }

      // Dark obsidian pill background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(bx, by, badgeWidth, badgeHeight);

      // Distinct 1px border in the buff's signature color
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, badgeWidth - 1, badgeHeight - 1);

      // Type-specific icon
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = primaryColor;
      ctx.fillText(iconSymbol, bx + 5.5, by + badgeHeight / 2 - 0.5);

      // Remaining duration text (e.g. 45s)
      const secLeft = Math.ceil(buff.remainingSec);
      ctx.font = 'bold 6.5px monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${secLeft}s`, bx + badgeWidth - 1.5, by + badgeHeight / 2 - 0.5);

      // Bottom 1px progress gauge
      const fraction = Math.max(0, Math.min(1, buff.remainingSec / (buff.durationSec || 45)));
      const progWidth = Math.max(1, Math.round((badgeWidth - 2) * fraction));
      ctx.fillStyle = primaryColor;
      ctx.fillRect(bx + 1, by + badgeHeight - 1.5, progWidth, 1);
    }

    ctx.restore();
  }

  private renderAmbientLighting(
    ctx: CanvasRenderingContext2D,
    chunkManager: ChunkManager,
    player: Player,
    camera: Camera,
    cycle: DayNightCycle,
    screenWidth: number,
    screenHeight: number,
    moonPhase: MoonPhaseInfo,
    auroraActive: boolean
  ) {
    const zoom = camera.zoom || 1;
    const playerTileX = Math.floor(player.x / TILE_SIZE);
    const playerTileY = Math.floor(player.y / TILE_SIZE);
    const surfaceTileY = chunkManager.terrainGen.getSurfaceHeight(playerTileX);
    const depthBelowSurface = playerTileY - surfaceTileY;

    // Moon phase & Aurora naturally brighten the surface night landscape
    const moonlightBonus = moonPhase.illumination * 0.14 + (auroraActive ? 0.08 : 0);
    const nightDarkness = Math.max(0, (1.0 - cycle.ambientLight) * Math.max(0.32, 0.68 - moonlightBonus));
    const caveDarkness = Math.max(0, Math.min(0.88, depthBelowSurface * 0.03));
    const totalDarkness = Math.max(nightDarkness, caveDarkness);

    if (totalDarkness <= 0.08) return;

    ctx.save();
    // Render ambient lighting overlay at half resolution (4x fewer pixels to clear/shade/composite)
    const lightScale = 0.5;
    const playerScreenX = (player.x + player.width / 2 - camera.x) * zoom * lightScale;
    const playerScreenY = (player.y + player.height / 2 - camera.y) * zoom * lightScale;

    const lanternRadius = Math.max(85, 175 - depthBelowSurface * 2.5) * zoom * lightScale;
    const isDeepCave = depthBelowSurface > 6;
    const darkAlphaMid = Math.min(1, totalDarkness * 0.45);
    const darkAlphaFull = Math.min(1, totalDarkness);

    const innerRadius = 28 * zoom * lightScale;
    const diameter = Math.max(4, Math.ceil(lanternRadius * 2));
    const maskKey = `${diameter}:${Math.round(innerRadius)}:${Math.round(darkAlphaMid * 50)}:${Math.round(darkAlphaFull * 50)}`;
    if (!this.lightMask || this.lightMaskKey !== maskKey) {
      const mask = this.lightMask ?? document.createElement('canvas');
      mask.width = diameter;
      mask.height = diameter;
      const maskCtx = mask.getContext('2d');
      if (maskCtx) {
        const center = diameter / 2;
        const gradient = maskCtx.createRadialGradient(center, center, innerRadius, center, center, lanternRadius);
        const midRemoval = 1 - darkAlphaMid / Math.max(darkAlphaFull, 0.001);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.5, `rgba(255,255,255,${midRemoval})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        maskCtx.clearRect(0, 0, diameter, diameter);
        maskCtx.fillStyle = gradient;
        maskCtx.fillRect(0, 0, diameter, diameter);
        this.lightMask = mask;
        this.lightMaskKey = maskKey;
      }
    }

    const overlay = this.lightOverlay ?? document.createElement('canvas');
    const overlayWidth = Math.max(1, Math.ceil(screenWidth * lightScale));
    const overlayHeight = Math.max(1, Math.ceil(screenHeight * lightScale));
    if (overlay.width !== overlayWidth || overlay.height !== overlayHeight) {
      overlay.width = overlayWidth;
      overlay.height = overlayHeight;
      this.lightOverlay = overlay;
    }
    const overlayCtx = overlay.getContext('2d');
    if (!overlayCtx) {
      ctx.restore();
      return;
    }
    overlayCtx.globalCompositeOperation = 'source-over';
    overlayCtx.clearRect(0, 0, overlayWidth, overlayHeight);

    if (isDeepCave) {
      overlayCtx.fillStyle = `rgba(5, 5, 10, ${darkAlphaFull.toFixed(3)})`;
      overlayCtx.fillRect(0, 0, overlayWidth, overlayHeight);
    } else {
      // On the surface, keep the upper sky completely clear so Stars, Moon Phases, Sunset & Aurora
      // shine with 100% vibrancy, while softly shading the terrain below the surface horizon.
      const surfaceScreenY = Math.max(0, Math.min(overlayHeight, (surfaceTileY * TILE_SIZE - camera.y) * zoom * lightScale));
      const fadeStartY = Math.max(0, surfaceScreenY - 70 * zoom * lightScale);
      const groundGrad = overlayCtx.createLinearGradient(0, fadeStartY, 0, Math.min(overlayHeight, surfaceScreenY + 120 * zoom * lightScale));
      const tintR = auroraActive ? 6 : 5;
      const tintG = auroraActive ? 16 : 9;
      const tintB = auroraActive ? 30 : 24;
      groundGrad.addColorStop(0.0, `rgba(${tintR}, ${tintG}, ${tintB}, 0)`);
      groundGrad.addColorStop(0.45, `rgba(${tintR}, ${tintG}, ${tintB}, ${(darkAlphaFull * 0.42).toFixed(3)})`);
      groundGrad.addColorStop(1.0, `rgba(${tintR}, ${tintG}, ${tintB}, ${darkAlphaFull.toFixed(3)})`);
      overlayCtx.fillStyle = groundGrad;
      overlayCtx.fillRect(0, fadeStartY, overlayWidth, overlayHeight - fadeStartY);
    }

    if (this.lightMask) {
      overlayCtx.globalCompositeOperation = 'destination-out';
      overlayCtx.drawImage(this.lightMask, playerScreenX - lanternRadius, playerScreenY - lanternRadius);

      // Punch warm light circles around visible placed Torches and Campfires at night / in caves
      const startCX = Math.floor(camera.x / CHUNK_PIXEL_WIDTH);
      const endCX = Math.floor((camera.x + camera.width) / CHUNK_PIXEL_WIDTH);
      const startCY = Math.floor(camera.y / CHUNK_PIXEL_HEIGHT);
      const endCY = Math.floor((camera.y + camera.height) / CHUNK_PIXEL_HEIGHT);
      const torchRadius = 68 * zoom * lightScale;

      for (let cy = startCY; cy <= endCY; cy++) {
        for (let cx = startCX; cx <= endCX; cx++) {
          const chunk = chunkManager.loadedChunks.get(ChunkManager.getChunkKey(cx, cy));
          const lightTiles = chunk?.animatedLightTiles;
          if (!chunk || !lightTiles || lightTiles.length === 0) continue;
          for (let k = 0; k < lightTiles.length; k++) {
            const idx = lightTiles[k];
            const t = chunk.tiles[idx] as TileType;
            if (t !== TileType.TORCH && t !== TileType.CAMPFIRE && t !== TileType.GLOWING_CRYSTAL) continue;
            const lx = idx & 31;
            const ly = idx >> 5;
            const sx = ((chunk.worldX + lx + 0.5) * TILE_SIZE - camera.x) * zoom * lightScale;
            const sy = ((chunk.worldY + ly + 0.5) * TILE_SIZE - camera.y) * zoom * lightScale;
            const r = t === TileType.CAMPFIRE ? torchRadius * 1.35 : t === TileType.TORCH ? torchRadius : torchRadius * 0.65;
            overlayCtx.drawImage(this.lightMask, sx - r, sy - r, r * 2, r * 2);
          }
        }
      }

      overlayCtx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(overlay, 0, 0, overlayWidth, overlayHeight, 0, 0, screenWidth, screenHeight);

    ctx.restore();
  }
}
