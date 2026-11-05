/**
 * Synthesizer sound generator using Web Audio API
 * No external audio files or copyright risks.
 * Provides distinct audio profiles for footsteps, swimming, mining hits,
 * block destruction, and block placement across all block materials.
 */

import { TileType } from './types';

export type AudioMaterial =
  | 'dirt'
  | 'sand'
  | 'grass'
  | 'leaves'
  | 'stone'
  | 'wood'
  | 'snow'
  | 'ice'
  | 'mud'
  | 'ash'
  | 'crystal'
  | 'bone'
  | 'water';

export function getAudioMaterial(tile?: TileType | null): AudioMaterial {
  if (tile === undefined || tile === null || tile === TileType.AIR) {
    return 'dirt';
  }
  switch (tile) {
    case TileType.SAND:
    case TileType.RED_SAND:
    case TileType.SALT:
      return 'sand';

    case TileType.GRASS:
    case TileType.FLOWER_GRASS:
    case TileType.OASIS_GRASS:
    case TileType.MUSHROOM_GRASS:
    case TileType.SKY_GRASS:
      return 'grass';

    case TileType.LEAVES:
    case TileType.BIRCH_LEAVES:
    case TileType.ACACIA_LEAVES:
    case TileType.CHERRY_LEAVES:
    case TileType.PALM_LEAVES:
    case TileType.CELESTIAL_LEAVES:
    case TileType.FLOWER:
    case TileType.TALL_GRASS:
    case TileType.DRY_GRASS:
    case TileType.VINE:
    case TileType.SKY_VINE:
    case TileType.STAR_FLOWER:
    case TileType.BERRY_BUSH:
    case TileType.BAMBOO:
    case TileType.CACTUS:
      return 'leaves';

    case TileType.STONE:
    case TileType.SKY_STONE:
    case TileType.SANDSTONE:
    case TileType.BASALT:
    case TileType.BEDROCK:
    case TileType.OBSIDIAN:
    case TileType.FURNACE:
    case TileType.COAL_ORE:
    case TileType.COPPER_ORE:
    case TileType.IRON_ORE:
    case TileType.GOLD_ORE:
      return 'stone';

    case TileType.WOOD:
    case TileType.BIRCH_WOOD:
    case TileType.ACACIA_WOOD:
    case TileType.CHERRY_WOOD:
    case TileType.PALM_WOOD:
    case TileType.CELESTIAL_WOOD:
    case TileType.PLANKS:
    case TileType.CRAFTING_TABLE:
    case TileType.CHEST:
    case TileType.DOOR:
    case TileType.DOOR_OPEN:
    case TileType.TRAPDOOR:
    case TileType.TRAPDOOR_OPEN:
    case TileType.GATE:
    case TileType.GATE_OPEN:
    case TileType.LADDER:
    case TileType.BRIDGE:
    case TileType.PLATFORM:
    case TileType.SIGN:
    case TileType.BED:
    case TileType.LEVER:
    case TileType.LEVER_ON:
    case TileType.PRESSURE_PLATE:
    case TileType.PRESSURE_PLATE_PRESSED:
      return 'wood';

    case TileType.SNOW:
      return 'snow';

    case TileType.ICE:
    case TileType.PACKED_ICE:
    case TileType.BLUE_ICE:
      return 'ice';

    case TileType.MUD:
      return 'mud';

    case TileType.ASH:
      return 'ash';

    case TileType.GLOWING_CRYSTAL:
    case TileType.CRYSTAL_ORE:
    case TileType.DIAMOND_ORE:
    case TileType.ASTRAL_ORE:
    case TileType.CELESTIAL_ORE:
      return 'crystal';

    case TileType.BEAR_SKULL:
    case TileType.WOLF_SKULL:
    case TileType.MAMMOTH_SKULL:
    case TileType.LION_SKULL:
    case TileType.CROCODILE_SKULL:
    case TileType.ANIMAL_SKELETON:
    case TileType.PROTECTOR:
      return 'bone';

    case TileType.WATER:
      return 'water';

    case TileType.DIRT:
    case TileType.SNOWY_DIRT:
    case TileType.SKY_DIRT:
    case TileType.TILLED_SOIL:
    default:
      return 'dirt';
  }
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private noiseBuffer: AudioBuffer | null = null;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private getNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.8);
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    }
    return this.noiseBuffer;
  }

  pauseAudioContext() {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => {});
    }
  }

  resumeAudioContext() {
    if (this.ctx && this.ctx.state === 'suspended' && !this.isMuted) {
      void this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  playJump() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Audio error ignored safely
    }
  }

  playLand(tile?: TileType) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const mat = getAudioMaterial(tile);
      const jitter = (Math.random() - 0.5) * 0.1;

      switch (mat) {
        case 'stone': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(150 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(50, now + 0.085);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.085);
          break;
        }

        case 'wood': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(190 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(60, now + 0.09);
          gain.gain.setValueAtTime(0.085, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case 'sand': {
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400 * (1 + jitter), now);
            filter.frequency.exponentialRampToValueAtTime(600, now + 0.1);
            filter.Q.setValueAtTime(1.5, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.07, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.1);
          }
          break;
        }

        case 'snow': {
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1900 * (1 + jitter), now);
            filter.frequency.exponentialRampToValueAtTime(800, now + 0.09);
            filter.Q.setValueAtTime(2.2, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.065, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.09);
          }
          break;
        }

        case 'leaves':
        case 'grass': {
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(1700 * (1 + jitter), now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.065, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.08);
          }
          break;
        }

        case 'water': {
          this.playSplash(0.85);
          break;
        }

        case 'dirt':
        default: {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(100 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
          gain.gain.setValueAtTime(0.075, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        }
      }
    } catch {
      // Audio error ignored
    }
  }

  playSplash(intensity: number = 1.0) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const buffer = this.getNoiseBuffer();
      if (!buffer) return;

      const duration = 0.14;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(700, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + duration);

      const gain = this.ctx.createGain();
      const peak = Math.max(0.04, Math.min(0.18, 0.12 * intensity));
      gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now, Math.random() * 0.4, duration);

      // Droplet plink
      const drop = this.ctx.createOscillator();
      const dropGain = this.ctx.createGain();
      drop.type = 'sine';
      drop.frequency.setValueAtTime(480, now + 0.02);
      drop.frequency.exponentialRampToValueAtTime(820, now + 0.07);
      dropGain.gain.setValueAtTime(0.035 * intensity, now + 0.02);
      dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      drop.connect(dropGain);
      dropGain.connect(this.ctx.destination);
      drop.start(now + 0.02);
      drop.stop(now + 0.07);
    } catch {
      // Audio error ignored
    }
  }

  playSwim(submerged: boolean = false) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const jitter = (Math.random() - 0.5) * 0.1;

      if (submerged) {
        // Deep underwater water stroke with bubble displacement
        const buffer = this.getNoiseBuffer();
        if (buffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(340 * (1 + jitter), now);
          filter.frequency.exponentialRampToValueAtTime(160, now + 0.13);
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          noise.start(now, Math.random() * 0.4, 0.13);
        }

        // Submerged fluid bubble
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(170 * (1 + jitter), now);
        osc.frequency.exponentialRampToValueAtTime(360, now + 0.08);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else {
        // Surface paddling stroke / splash
        const buffer = this.getNoiseBuffer();
        if (buffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(900 * (1 + jitter), now);
          filter.frequency.exponentialRampToValueAtTime(280, now + 0.12);
          filter.Q.setValueAtTime(1.3, now);
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.055, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          noise.start(now, Math.random() * 0.4, 0.12);
        }

        // Water droplet ripple
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260 * (1 + jitter), now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.08);
        gain.gain.setValueAtTime(0.045, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch {
      // Audio error ignored
    }
  }

  playFootstep(tile?: TileType) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const mat = getAudioMaterial(tile);
      const jitter = (Math.random() - 0.5) * 0.15;

      switch (mat) {
        case 'sand': {
          // Crunchy gritty sand friction
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1750 * (1 + jitter), now);
            filter.Q.setValueAtTime(1.9, now);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.048, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.065);
          }

          // Subtle soft underfoot grit
          const osc = this.ctx.createOscillator();
          const oscGain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(75 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(30, now + 0.04);
          oscGain.gain.setValueAtTime(0.02, now);
          oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.connect(oscGain);
          oscGain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.04);
          break;
        }

        case 'stone': {
          // Hard, crisp rock strike: transient click + resonant body
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(480 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(180, now + 0.038);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.038);

          // Click transient
          const click = this.ctx.createOscillator();
          const clickGain = this.ctx.createGain();
          click.type = 'square';
          click.frequency.setValueAtTime(860 * (1 + jitter), now);
          clickGain.gain.setValueAtTime(0.025, now);
          clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
          click.connect(clickGain);
          clickGain.connect(this.ctx.destination);
          click.start(now);
          click.stop(now + 0.012);
          break;
        }

        case 'wood': {
          // Hollow wooden plank step
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(230 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.055);

          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(440, now);
          filter.Q.setValueAtTime(2.2, now);

          gain.gain.setValueAtTime(0.065, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.055);
          break;
        }

        case 'grass': {
          // Crisp blade brush + soft earth thud
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(2100 * (1 + jitter), now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.035, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.045);
          }
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(80 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(35, now + 0.035);
          gain.gain.setValueAtTime(0.02, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.035);
          break;
        }

        case 'leaves': {
          // Rustling twigs and dry leaves
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2800 * (1 + jitter), now);
            filter.Q.setValueAtTime(1.4, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.05);
          }
          break;
        }

        case 'snow': {
          // Squeaky crunch of powdery packed snow
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2200 * (1 + jitter), now);
            filter.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
            filter.Q.setValueAtTime(3.2, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.045, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.06);
          }
          break;
        }

        case 'ice': {
          // Sharp icy glassy click and slide
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(920 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);
          gain.gain.setValueAtTime(0.03, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.03);
          break;
        }

        case 'mud': {
          // Wet squelch suction
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(190 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);
          gain.gain.setValueAtTime(0.045, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.06);
          break;
        }

        case 'ash': {
          // Soft whispery dust puff
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(340, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.025, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.045);
          }
          break;
        }

        case 'crystal': {
          // Delicate crystal ting
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1180 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(750, now + 0.05);
          gain.gain.setValueAtTime(0.035, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }

        case 'bone': {
          // Dry skeletal bone clack
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(540 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(220, now + 0.035);
          gain.gain.setValueAtTime(0.045, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.035);
          break;
        }

        case 'water': {
          // Shallow water wade
          this.playSwim(false);
          break;
        }

        case 'dirt':
        default: {
          // Earthy low thud
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime((75 + Math.random() * 15) * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(32, now + 0.042);
          gain.gain.setValueAtTime(0.032, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.042);
          break;
        }
      }
    } catch {
      // Audio error ignored
    }
  }

  playBlockMineHit(tile: TileType, _progress: number = 0) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const mat = getAudioMaterial(tile);
      const jitter = (Math.random() - 0.5) * 0.12;

      switch (mat) {
        case 'stone': {
          // Metallic pick strike + rock chip crackle
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1450 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(420, now + 0.05);
          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.05);

          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600 * (1 + jitter), now);
            filter.Q.setValueAtTime(2.2, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.055, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.055);
          }
          break;
        }

        case 'wood': {
          // Solid axe chop thwack
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(280 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(80, now + 0.065);
          gain.gain.setValueAtTime(0.075, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.065);

          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(1800, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.045, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.04);
          }
          break;
        }

        case 'sand': {
          // Shovel scraping gritty sand
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1500 * (1 + jitter), now);
            filter.Q.setValueAtTime(1.6, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.07);
          }
          break;
        }

        case 'ice': {
          // Sharp ice chisel strike
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(2100 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.045);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.045);
          break;
        }

        case 'crystal': {
          // Pure resonant crystal strike
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1350 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(680, now + 0.08);
          gain.gain.setValueAtTime(0.065, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        }

        case 'leaves':
        case 'grass': {
          // Tearing foliage chop
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(2200 * (1 + jitter), now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.055, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.045);
          }
          break;
        }

        case 'dirt':
        default: {
          // Shovel digging into earth: low thump + dirt scrape
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(120 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(45, now + 0.06);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.06);

          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(650, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.04, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.05);
          }
          break;
        }
      }
    } catch {
      // Audio error ignored
    }
  }

  playBlockBreak(tile: TileType) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const mat = getAudioMaterial(tile);
      const jitter = (Math.random() - 0.5) * 0.1;

      switch (mat) {
        case 'stone': {
          // Heavy stone fracture & gravel crumble cascade
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(180 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(40, now + 0.14);
          gain.gain.setValueAtTime(0.09, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.14);

          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1300, now);
            filter.frequency.exponentialRampToValueAtTime(500, now + 0.15);
            filter.Q.setValueAtTime(1.8, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.08, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.15);
          }
          break;
        }

        case 'wood': {
          // Loud splintering timber snap
          const snap = this.ctx.createOscillator();
          const snapGain = this.ctx.createGain();
          snap.type = 'sawtooth';
          snap.frequency.setValueAtTime(380 * (1 + jitter), now);
          snap.frequency.exponentialRampToValueAtTime(90, now + 0.12);
          snapGain.gain.setValueAtTime(0.08, now);
          snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          snap.connect(snapGain);
          snapGain.connect(this.ctx.destination);
          snap.start(now);
          snap.stop(now + 0.12);

          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(1200, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.065, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.13);
          }
          break;
        }

        case 'sand': {
          // Soft sand collapse cascade
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600, now);
            filter.frequency.exponentialRampToValueAtTime(800, now + 0.14);
            filter.Q.setValueAtTime(1.5, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.07, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.14);
          }
          break;
        }

        case 'ice':
        case 'crystal': {
          // Shimmering crystalline shatter
          [1100, 1650, 2400].forEach((freq, i) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + i * 0.02;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * (1 + jitter), t);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.14);
            gain.gain.setValueAtTime(0.045, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.14);
          });
          break;
        }

        case 'leaves':
        case 'grass': {
          // Rustling burst of loose foliage
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(1600, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.07, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.11);
          }
          break;
        }

        case 'dirt':
        default: {
          // Earthy clump collapse
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(110 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(30, now + 0.11);
          gain.gain.setValueAtTime(0.075, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.11);

          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(550, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.05, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.1);
          }
          break;
        }
      }
    } catch {
      // Audio error ignored
    }
  }

  playBlockPlace(tile: TileType) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const mat = getAudioMaterial(tile);
      const jitter = (Math.random() - 0.5) * 0.08;

      switch (mat) {
        case 'wood': {
          // Snappy carpentry wood knock
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(260 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(120, now + 0.045);
          gain.gain.setValueAtTime(0.07, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.045);
          break;
        }

        case 'stone': {
          // Solid rock place clack
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(420 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(160, now + 0.035);
          gain.gain.setValueAtTime(0.045, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.035);
          break;
        }

        case 'sand': {
          // Granular deposit
          const buffer = this.getNoiseBuffer();
          if (buffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1300 * (1 + jitter), now);
            filter.Q.setValueAtTime(1.8, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now, Math.random() * 0.4, 0.05);
          }
          break;
        }

        case 'ice':
        case 'crystal': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1350 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(700, now + 0.04);
          gain.gain.setValueAtTime(0.055, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.04);
          break;
        }

        case 'dirt':
        default: {
          // Earthy placement pat
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(130 * (1 + jitter), now);
          osc.frequency.exponentialRampToValueAtTime(50, now + 0.04);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.04);
          break;
        }
      }
    } catch {
      // Audio error ignored
    }
  }

  playItemPickup() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio error ignored
    }
  }

  playStartGame() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [261.63, 329.63, 392.0, 523.25]; // C, E, G, C chord

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const t = now + idx * 0.08;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 0.25);
      });
    } catch {
      // Audio error ignored
    }
  }

  playSwordSwing() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Audio error ignored
    }
  }

  playEnemyHit() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Audio error ignored
    }
  }

  playPlayerHurt() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      // Audio error ignored
    }
  }

  playPlayerDeath() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [220, 196, 174.61, 130.81]; // Descending A, G, F, C

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const t = now + idx * 0.12;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch {
      // Audio error ignored
    }
  }

  playCraft() {
    if (this.isMuted) return;
    this.playItemPickup();
  }

  playEat() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Bite crunch
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(320, now);
      osc1.frequency.exponentialRampToValueAtTime(140, now + 0.08);
      gain1.gain.setValueAtTime(0.08, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Swallow note
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(240, now + 0.09);
      osc2.frequency.exponentialRampToValueAtTime(360, now + 0.19);
      gain2.gain.setValueAtTime(0.09, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.19);
    } catch {
      // Audio error ignored
    }
  }

  playChapterIntro() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Deep 8-bit sub-bass impact drum hit
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(110, now);
      subOsc.frequency.exponentialRampToValueAtTime(36.71, now + 0.65);
      subGain.gain.setValueAtTime(0.22, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.75);

      // 2. Retro chiptune dramatic survival fanfare (D minor -> fifth resolve)
      const chordNotes = [
        { freq: 146.83, delay: 0.0, duration: 1.6, type: 'square' as OscillatorType, vol: 0.075 }, // D3
        { freq: 220.0, delay: 0.11, duration: 1.5, type: 'square' as OscillatorType, vol: 0.07 },   // A3
        { freq: 293.66, delay: 0.22, duration: 1.5, type: 'square' as OscillatorType, vol: 0.08 },  // D4
        { freq: 349.23, delay: 0.34, duration: 1.4, type: 'triangle' as OscillatorType, vol: 0.09 },// F4
        { freq: 440.0, delay: 0.48, duration: 1.8, type: 'square' as OscillatorType, vol: 0.095 },  // A4
        { freq: 587.33, delay: 0.64, duration: 2.1, type: 'triangle' as OscillatorType, vol: 0.11 },// D5
      ];

      for (const note of chordNotes) {
        if (!this.ctx) break;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startT = now + note.delay;
        osc.type = note.type;
        osc.frequency.setValueAtTime(note.freq * 0.985, startT);
        osc.frequency.setValueAtTime(note.freq, startT + 0.045);

        gain.gain.setValueAtTime(0.001, startT);
        gain.gain.linearRampToValueAtTime(note.vol, startT + 0.03);
        gain.gain.setValueAtTime(note.vol * 0.85, startT + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.0008, startT + note.duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(startT);
        osc.stop(startT + note.duration);
      }
    } catch {
      // Audio error ignored
    }
  }

  playWeatherAmbience(weather: 'rain' | 'snow' | 'wind', intensity = 0.7) {
    if (this.isMuted || intensity <= 0.08) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const clampedIntensity = Math.max(0.1, Math.min(1.0, intensity));

      if (weather === 'rain') {
        const duration = 0.28;
        const buffer = this.getNoiseBuffer();
        if (buffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(1600 + Math.random() * 600, now);
          filter.Q.setValueAtTime(1.1, now);

          const gain = this.ctx.createGain();
          const peak = 0.018 * clampedIntensity;
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(peak, now + 0.06);
          gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          noise.start(now, Math.random() * 0.4, duration);
        }

        if (Math.random() < 0.55) {
          const dropOsc = this.ctx.createOscillator();
          const dropGain = this.ctx.createGain();
          dropOsc.type = 'sine';
          const baseFreq = 950 + Math.random() * 520;
          dropOsc.frequency.setValueAtTime(baseFreq, now + 0.03);
          dropOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.28, now + 0.085);
          dropGain.gain.setValueAtTime(0.011 * clampedIntensity, now + 0.03);
          dropGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.09);
          dropOsc.connect(dropGain);
          dropGain.connect(this.ctx.destination);
          dropOsc.start(now + 0.03);
          dropOsc.stop(now + 0.095);
        }
      } else {
        const duration = weather === 'wind' ? 0.55 : 0.42;
        const buffer = this.getNoiseBuffer();
        if (buffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          const startFreq = weather === 'wind' ? 340 + Math.random() * 180 : 260 + Math.random() * 120;
          filter.frequency.setValueAtTime(startFreq, now);
          filter.frequency.exponentialRampToValueAtTime(startFreq * 1.55, now + duration * 0.55);
          filter.frequency.exponentialRampToValueAtTime(startFreq * 0.85, now + duration);
          filter.Q.setValueAtTime(weather === 'wind' ? 2.4 : 1.8, now);

          const gain = this.ctx.createGain();
          const peak = (weather === 'wind' ? 0.022 : 0.012) * clampedIntensity;
          gain.gain.setValueAtTime(0.0008, now);
          gain.gain.linearRampToValueAtTime(peak, now + duration * 0.45);
          gain.gain.exponentialRampToValueAtTime(0.0006, now + duration);

          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          noise.start(now, Math.random() * 0.4, duration);
        }
      }
    } catch {
      // Audio error ignored
    }
  }
}

export const sound = new SoundEngine();
