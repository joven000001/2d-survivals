/**
 * Deterministic Perlin & Simplex-style Noise generator for procedural terrain
 */

export class SimplexNoise {
  private p: Uint8Array = new Uint8Array(512);

  constructor(seed: number = 1337) {
    this.init(seed);
  }

  private init(seed: number) {
    const permutation = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      permutation[i] = i;
    }

    // Seeded Fisher-Yates shuffle
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;

    const nextRandom = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(nextRandom() * (i + 1));
      const temp = permutation[i];
      permutation[i] = permutation[j];
      permutation[j] = temp;
    }

    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad1D(hash: number, x: number): number {
    return (hash & 1) === 0 ? x : -x;
  }

  private grad2D(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // 1D Perlin Noise (-1 to 1)
  noise1D(x: number): number {
    const X = Math.floor(x) & 255;
    const xf = x - Math.floor(x);
    const u = this.fade(xf);

    return this.lerp(
      u,
      this.grad1D(this.p[X], xf),
      this.grad1D(this.p[X + 1], xf - 1)
    ) * 2;
  }

  // 2D Perlin Noise (-1 to 1)
  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.p[this.p[X] + Y];
    const ab = this.p[this.p[X] + Y + 1];
    const ba = this.p[this.p[X + 1] + Y];
    const bb = this.p[this.p[X + 1] + Y + 1];

    const x1 = this.lerp(u, this.grad2D(aa, xf, yf), this.grad2D(ba, xf - 1, yf));
    const x2 = this.lerp(u, this.grad2D(ab, xf, yf - 1), this.grad2D(bb, xf - 1, yf - 1));

    return this.lerp(v, x1, x2);
  }

  // Fractal Brownian Motion (octaves) for rich natural variation
  fbm1D(x: number, octaves: number = 4, persistence: number = 0.5, lacunarity: number = 2.0): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise1D(x * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }

  fbm2D(x: number, y: number, octaves: number = 3, persistence: number = 0.5, lacunarity: number = 2.0): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }
}
