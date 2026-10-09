// The backdrop in pixels: the sky with its clouds, sun, moon and stars; the distant ridges; and
// the ground's texture with its grass, flowers, sand and snow. Drawn into a buffer two pixels to a cell,
// then onto the canvas. What never moves is drawn once and kept.
import { BIOMES, COLORS, WINTER_GROUND } from './config.ts';
import type { BiomeName } from './config.ts';
import type { Canvas } from './art.ts';
import { lit, mix } from './color.ts';
import { dither } from './kit.ts';
import { landmarkArt } from './scenery.ts';
import { WHITE, tone } from './palette.ts';
import type { Role } from './palette.ts';
import { hash2, makeNoise } from './noise.ts';
import type { Noise2D } from './noise.ts';
import type { Geometry } from './scene.ts';
import { moonPosition, snows, sunPosition } from './sky.ts';
import type { Sky } from './sky.ts';

export type BackdropView = {
  readonly geo: Geometry;
  readonly sky: Sky;
  readonly biome: BiomeName;
  /** Real seconds, and the same stepped for the scenery's slow motion. */
  readonly time: number;
  readonly slow: number;
  readonly flash: boolean;
  /** Where the path to its door starts: the doorway's middle column, the pixel row under the home, its width. */
  readonly path: { readonly x: number; readonly y: number; readonly w: number } | null;
  /** The column the biome's landmark stands at: where the least of the nearer scenery hides it. */
  readonly landmark: number;
};

/** Bands of colour in the sky's gradient; ragged edges blend neighbouring bands. */
const SKY_BANDS = 7;
/** The least cloud there ever is. */
const OVERCAST = 0.42;
/** How grey the clouds are even on a dry day. */
const GREY = 0.45;

const lighten = (c: number, k: number): number => mix(c, 0xffffff, k);
const darken = (c: number, k: number): number => mix(c, 0x000000, k);

/** A light in the sky: where (pixels), its glow's colour, how strong (0..1), how far it reaches. */
type Light = { readonly x: number; readonly y: number; readonly color: number; readonly strength: number; readonly radius: number };

/** How a layer of distance rises. */
type Profile = 'hills' | 'peaks' | 'firs' | 'crowns';
/** What stands on a layer. */
type Dress = 'pines' | 'snags';
/** A layer of distance: its profile, its height (times the biome's ridge height), how near it is (0 far … 1 near). */
type Layer = { readonly profile: Profile; readonly height: number; readonly depth: number; readonly freq?: number; readonly dress?: Dress };

/** The distance in each biome, far layers first. */
const LAYERS: Readonly<Record<BiomeName, readonly Layer[]>> = {
  meadow: [
    { profile: 'hills', height: 1.25, depth: 0, freq: 0.008 },
    { profile: 'hills', height: 0.8, depth: 0.5, freq: 0.014, dress: 'snags' },
    { profile: 'hills', height: 0.42, depth: 1, freq: 0.024 },
  ],
  forest: [
    { profile: 'hills', height: 1.15, depth: 0, freq: 0.01 },
    { profile: 'firs', height: 0.7, depth: 0.5 },
    { profile: 'firs', height: 0.45, depth: 1 },
  ],
  tundra: [
    { profile: 'peaks', height: 1.0, depth: 0, freq: 0.025 },
    { profile: 'hills', height: 0.5, depth: 0.5, freq: 0.015, dress: 'pines' },
    { profile: 'hills', height: 0.25, depth: 1, freq: 0.03 },
  ],
  swamp: [
    { profile: 'crowns', height: 1.0, depth: 0 },
    { profile: 'crowns', height: 0.65, depth: 0.5, dress: 'snags' },
    { profile: 'crowns', height: 0.38, depth: 1 },
  ],
};

/** Little far-off things. Keys: `b` needles, `t` trunk, `s` snow, `d` dead wood. */
const TINY: Readonly<Record<string, readonly string[]>> = {
  pine: ['.b.', '.b.', 'bbb', 'bbb', '.t.'],
  snowpine: ['.s.', '.b.', 'sbb', 'bbb', '.t.'],
  snag: ['d...d', '.d.d.', '..d..', '..d..'],
};

export class Backdrop {
  private readonly seed: number;
  private readonly ridgeNoise: Noise2D;
  private readonly cloudNoise: Noise2D;
  private px = new Int32Array(0);
  private glow = new Uint8Array(0);
  /** Where the sky's bands break, kept for each size of window. */
  private jitter = new Float32Array(0);
  private clouds: { key: string; tone: Uint8Array } = { key: '', tone: new Uint8Array(0) };
  private ground: { key: string; px: Int32Array; path: Uint8Array } = { key: '', px: new Int32Array(0), path: new Uint8Array(0) };
  private ridge: { key: string; px: Int32Array; glow: Uint8Array; layer: Uint8Array; tops: Int16Array[] } = { key: '', px: new Int32Array(0), glow: new Uint8Array(0), layer: new Uint8Array(0), tops: [] };

  constructor(seed: number) {
    this.seed = seed;
    this.ridgeNoise = makeNoise(seed ^ 0x41d9e);
    this.cloudNoise = makeNoise(seed ^ 0xc10d);
  }

  /** Paints rows 0 … geo.rows - 1 of the canvas. */
  draw(canvas: Canvas, v: BackdropView): void {
    const W = v.geo.cols;
    const H = v.geo.rows * 2;
    if (this.px.length !== W * H) {
      this.px = new Int32Array(W * H);
      this.glow = new Uint8Array(W * H);
    }
    this.drawSky(v);
    if (BIOMES[v.biome].gloom !== undefined) this.drawForestDepth(v);
    else this.drawRidge(v);
    this.drawGround(v);
    for (let r = 0; r < v.geo.rows; r++) {
      for (let c = 0; c < W; c++) {
        const i = 2 * r * W + c;
        canvas.halves(c, r, this.px[i], this.px[i + W], this.glow[i] === 1, this.glow[i + W] === 1);
      }
    }
  }

  // ── Sky ──────────────────────────────────────────────────────────────────

  private drawSky(v: BackdropView): void {
    const { geo, sky } = v;
    const W = geo.cols;
    const H = geo.horizon * 2;
    const px = this.px;
    const night = 1 - sky.daylight;
    // Bands of colour with ragged, broken edges, as a painter lays them; the raggedness is kept.
    if (this.jitter.length !== W * H) {
      this.jitter = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) this.jitter[y * W + x] = 0.5 + this.cloudNoise(x / 9 + 50, y / 4) * 0.4 + (dither(x, y) - 0.5) * 0.3;
      }
    }
    for (let y = 0; y < H; y++) {
      const t = H <= 1 ? 1 : (y / (H - 1)) ** 1.25;
      const s = t * SKY_BANDS;
      const lo = Math.floor(s);
      const fr = s - lo;
      const a = mix(sky.zenith, sky.horizon, lo / SKY_BANDS);
      const b = mix(sky.zenith, sky.horizon, Math.min(1, (lo + 1) / SKY_BANDS));
      for (let x = 0; x < W; x++) {
        px[y * W + x] = fr > this.jitter[y * W + x] ? b : a;
        this.glow[y * W + x] = 1;
      }
    }
    if (BIOMES[v.biome].gloom !== undefined) return;
    const light = this.lightSource(v, W, H);
    if (light !== null) this.drawGlow(light, W, H);
    if (v.biome === 'tundra' && night > 0.7 && hash2(Math.floor(v.time / 600), 3, this.seed) % 3 !== 0) this.drawAurora(v, H);
    const wet = sky.weather.precip;
    // Stars: many single pixels of different strengths, and a few bright ones with a cross of light.
    const starry = Math.max(0, 1 - wet * 3) * Math.min(1, (night - 0.45) * 2);
    if (starry > 0) {
      for (let y = 0; y < H - 2; y++) {
        for (let x = 0; x < W; x++) {
          const hs = hash2(x, y, this.seed ^ 0x57a2);
          if (hs % 1000 >= 14) continue;
          const twinkle = 0.55 + 0.45 * Math.sin(v.slow * (1 + (hs % 7) * 0.4) + (hs % 100));
          const bright = hs % 5 === 0 ? 1 : 0.55;
          const i = y * W + x;
          px[i] = mix(px[i], COLORS.star, starry * twinkle * bright);
          if (hs % 17 === 0) {
            for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0) px[j] = mix(px[j], COLORS.star, starry * twinkle * 0.35);
          }
        }
      }
    }
    if (starry > 0.3) this.drawMilkyWay(v, H, starry);
    this.drawSun(v, H);
    this.drawMoon(v, H);
    this.drawClouds(v, H, light);
    this.drawFlock(v, H);
    if (v.flash) for (let i = 0; i < H * W; i++) px[i] = mix(px[i], 0xe8eeff, 0.75);
  }

  /**
   * What lights the sky: the sun, its afterglow on the horizon at dusk and dawn, or the moon. Where it is
   * (in pixels), the colour of its glow, how strong, how far it reaches.
   */
  private lightSource(v: BackdropView, W: number, H: number): Light | null {
    const { sky } = v;
    const veil = 1 - sky.weather.precip * 0.8 - sky.weather.cloud * 0.35;
    if (veil <= 0.05) return null;
    const sun = sunPosition(sky.hour);
    if (sun !== null) {
      const low = 1 - Math.min(1, sun.y * 2.2);
      const color = mix(0xfff2cc, 0xffa070, low);
      return { x: sun.x * (W - 1), y: (1 - sun.y) * Math.max(4, H - 10) + 5, color, strength: (0.14 + 0.4 * low) * veil, radius: 12 + low * 20 };
    }
    // Just after sunset or before sunrise, the glow lingers on the horizon where the sun went.
    const h = sky.hour;
    const after = h > 19.5 && h < 21 ? 1 - (h - 19.5) / 1.5 : h > 4.5 && h < 6 ? (h - 4.5) / 1.5 : 0;
    if (after > 0) return { x: (h > 12 ? 0.94 : 0.06) * (W - 1), y: H - 2, color: 0xf89068, strength: 0.6 * after * veil, radius: 34 };
    const moon = moonPosition(sky.hour);
    if (moon !== null && sky.daylight < 0.6) {
      const full = 1 - Math.abs(sky.moon - 0.5) * 2;
      return { x: moon.x * (W - 1), y: (1 - moon.y) * Math.max(4, H - 8) + 4, color: 0xf4c8a4, strength: (0.18 + 0.32 * full) * veil, radius: 18 + full * 8 };
    }
    return null;
  }

  /** A soft halo of light round the sun or moon, in stepped rings with ragged edges. */
  private drawGlow(l: Light, W: number, H: number): void {
    for (let y = Math.max(0, Math.floor(l.y - l.radius)); y < Math.min(H, l.y + l.radius); y++) {
      for (let x = Math.max(0, Math.floor(l.x - l.radius * 1.4)); x < Math.min(W, l.x + l.radius * 1.4); x++) {
        // Wider than tall, the way light spreads along the horizon.
        const d = Math.sqrt(((x + 0.5 - l.x) / 1.4) ** 2 + (y + 0.5 - l.y) ** 2) / l.radius;
        if (d >= 1) continue;
        const k = (1 - d) ** 1.6 * l.strength;
        const step = Math.floor(k * 5 + this.jitter[y * W + x] - 0.5) / 5;
        if (step > 0) this.px[y * W + x] = mix(this.px[y * W + x], l.color, Math.min(0.9, step));
      }
    }
  }

  /** The Milky Way on a clear night: a faint slanting band of light, thick with small stars. */
  private drawMilkyWay(v: BackdropView, H: number, starry: number): void {
    const W = v.geo.cols;
    const glow = mix(0x9aa0d0, 0xd8c8e8, 0.4);
    for (let y = 0; y < H - 2; y++) {
      for (let x = 0; x < W; x++) {
        const centre = H * (0.95 - 0.85 * (x / Math.max(1, W - 1)));
        const d = Math.abs(y - centre) / (H * 0.2);
        if (d >= 1) continue;
        const n = 0.6 + 0.4 * this.cloudNoise(x / 11 + 31, y / 5);
        const a = (1 - d * d) * starry * 0.16 * n;
        const i = y * W + x;
        this.px[i] = mix(this.px[i], glow, Math.round(a * 20) / 20);
        const hs = hash2(x, y, this.seed ^ 0x3a1);
        if (hs % 1000 < 30 * (1 - d)) this.px[i] = mix(this.px[i], COLORS.star, starry * 0.35);
      }
    }
  }

  /** Now and then a flock of birds crosses the far sky in a loose V, flapping. */
  private drawFlock(v: BackdropView, H: number): void {
    const { sky } = v;
    if (sky.daylight < 0.45 || sky.weather.precip > 0.2) return;
    const W = v.geo.cols;
    const cycle = Math.floor(v.time / 75);
    const t = (v.time - cycle * 75) / 28;
    if (t >= 1) return;
    const hs = hash2(cycle, 1, this.seed);
    const dir = hs % 2 === 0 ? 1 : -1;
    const lead = dir > 0 ? -12 + t * (W + 24) : W + 12 - t * (W + 24);
    const y0 = 3 + (hs % Math.max(1, Math.floor(H * 0.4)));
    const color = mix(0x2a2a34, sky.horizon, 0.35);
    for (let k = 0; k < 5; k++) {
      const side = k === 0 ? 0 : k % 2 === 0 ? 1 : -1;
      const rank = Math.ceil(k / 2);
      const x = Math.round(lead - dir * rank * 4);
      const y = Math.round(y0 + side * rank * 2 + Math.sin(v.time * 1.3 + k) * 0.6);
      const up = Math.floor(v.time * 5 + k) % 2 === 0;
      const pts = up ? [[-1, -1], [0, 0], [1, -1]] : [[-1, 0], [0, 0], [1, 0]];
      for (const [dx, dy] of pts) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < W && py >= 0 && py < H) this.px[py * W + px] = color;
      }
    }
  }

  private drawAurora(v: BackdropView, H: number): void {
    const W = v.geo.cols;
    const t = v.slow;
    for (let y = 0; y < H * 0.7; y++) {
      for (let x = 0; x < W; x++) {
        const a = Math.max(0, Math.sin(x / 7 + t * 0.25 + 2 * this.ridgeNoise(x / 30, t * 0.05) + y * 0.08)) * (1 - y / (H * 0.7));
        if (a < 0.08) continue;
        const color = mix(COLORS.aurora, 0x9a60f0, (Math.sin(x / 23 + t * 0.1) + 1) / 2);
        const i = y * W + x;
        // Dithered, so the ribbon fades out in pixels rather than in a smear.
        this.px[i] = mix(this.px[i], color, a * 0.5 > dither(x, y) * 0.5 ? a * 0.55 : a * 0.25);
      }
    }
  }

  private drawSun(v: BackdropView, H: number): void {
    const sun = sunPosition(v.sky.hour);
    if (sun === null || v.sky.weather.precip >= 0.2) return;
    const W = v.geo.cols;
    const cx = sun.x * (W - 1);
    const cy = (1 - sun.y) * Math.max(4, H - 10) + 5;
    // A pale disc behind the veil of cloud, warmer only when it sinks.
    const color = mix(mix(COLORS.sun, 0xdcdcd4, 0.45), 0xe08850, 1 - Math.min(1, sun.y * 2.5));
    const r = 3.6;
    const rays = Math.floor(v.slow * 1.5) % 2 === 0;
    for (let y = Math.floor(cy - r - 6); y <= cy + r + 6; y++) {
      for (let x = Math.floor(cx - r - 6); x <= cx + r + 6; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const i = y * W + x;
        if (d <= r) this.px[i] = d < r * 0.5 ? lighten(color, 0.5) : color;
        else if (d <= r + 1.2) this.px[i] = mix(this.px[i], color, 0.55);
        else if (d <= r + 5 && (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.7) && (d < r + 3.5) === rays) {
          this.px[i] = mix(this.px[i], color, 0.45);
        }
      }
    }
  }

  private drawMoon(v: BackdropView, H: number): void {
    const moon = moonPosition(v.sky.hour);
    if (moon === null || v.sky.daylight >= 0.6 || v.sky.weather.precip >= 0.3) return;
    const W = v.geo.cols;
    const cx = moon.x * (W - 1);
    const cy = (1 - moon.y) * Math.max(4, H - 8) + 4;
    const r = 3.5;
    const k = Math.cos(2 * Math.PI * v.sky.moon);
    const waxing = v.sky.moon < 0.5;
    for (let y = Math.floor(cy - r - 3); y <= cy + r + 3; y++) {
      for (let x = Math.floor(cx - r - 3); x <= cx + r + 3; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const u = (x + 0.5 - cx) / r;
        const w = (y + 0.5 - cy) / r;
        const d = Math.sqrt(u * u + w * w);
        const i = y * W + x;
        if (d > 1) {
          if (d < 1.8) this.px[i] = mix(this.px[i], 0x3a4060, 0.25 * (1.8 - d));
          continue;
        }
        const edge = k * Math.sqrt(1 - w * w);
        const lit = waxing ? u > edge : u < -edge;
        const crater = hash2(x - Math.floor(cx), y - Math.floor(cy), 77) % 7 === 0;
        this.px[i] = lit ? (crater ? mix(COLORS.moon, 0x8a8a9a, 0.4) : COLORS.moon) : mix(this.px[i], COLORS.moon, 0.12);
      }
    }
  }

  private drawClouds(v: BackdropView, H: number, light: Light | null): void {
    const { sky } = v;
    // Never quite clear: a grey veil of cloud always hangs over the place.
    const cover = Math.max(OVERCAST, sky.weather.cloud);
    const W = v.geo.cols;
    // Clouds drift less than a pixel a second, so they move in half-second steps and are kept between.
    const drift = (Math.floor(v.time * 2) / 2) * (0.02 + 0.05 * sky.wind);
    const key = `${W}:${H}:${drift.toFixed(3)}:${Math.round(cover * 40)}`;
    if (this.clouds.key !== key) {
      const edge = 0.62 - 1.05 * cover;
      const inside = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          // Broad banks, their edges broken up by a finer noise.
          const n = this.cloudNoise(x / 38 - drift, y / 11) * 0.62 + this.cloudNoise(x / 12 - drift * 1.7, y / 4.5 + 9) * 0.38;
          inside[y * W + x] = n > edge ? 1 : 0;
        }
      }
      // 4 lit from above, 3 the body, 2 its lower half, 1 the shaded underside.
      const tone = new Uint8Array(W * H);
      const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && inside[y * W + x] === 1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!at(x, y)) continue;
          let t = 3;
          if (!at(x, y - 1) || !at(x - 1, y - 1) || !at(x, y - 2)) t = 4;
          else if (!at(x, y + 1) || !at(x + 1, y + 1)) t = 1;
          else if (!at(x, y + 3)) t = 2;
          tone[y * W + x] = t;
        }
      }
      this.clouds = { key, tone };
    }
    const wet = sky.weather.precip;
    const grey = Math.min(1, wet * 1.4 + (sky.weather.storm ? 0.5 : 0));
    const body = mix(mix(0x2a3060, sky.horizon, 0.3), mix(COLORS.cloud, COLORS.stormCloud, Math.max(GREY, grey)), sky.daylight);
    const under = mix(body, mix(sky.zenith, 0x000000, 0.25), 0.35);
    const colors = [0, under, mix(body, under, 0.45), body, lighten(body, 0.28 * sky.daylight + 0.08)];
    const tone = this.clouds.tone;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = tone[y * W + x];
        if (t === 0) continue;
        let c = colors[t];
        // Near the sun or moon, cloud edges catch its colour.
        if (light !== null) {
          const d = Math.sqrt(((x - light.x) / 1.4) ** 2 + (y - light.y) ** 2) / (light.radius * 1.6);
          if (d < 1) c = mix(c, light.color, (1 - d) * (t >= 3 ? 0.55 : 0.3) * Math.min(1, light.strength * 1.6));
        }
        this.px[y * W + x] = c;
      }
    }
  }

  // ── The forest's depth ───────────────────────────────────────────────────

  /**
   * Under the canopy there is no horizon. A pale glow where the path goes, in five flat bands with broken
   * edges, spores drifting in it; standing in it, rows of far trunks, each a plain silhouette of one tone
   * with a forked branch or two, nearer rows darker and thicker; and the dark of the canopy across the top.
   */
  private drawForestDepth(v: BackdropView): void {
    const { geo } = v;
    const W = geo.cols;
    const H = geo.horizon * 2;
    const cx = W / 2;
    const biome = v.biome;
    const key = `${W}:${H}:${biome}`;
    if (this.ridge.key !== key) {
      const px = new Int32Array(W * H).fill(-1);
      const glow = new Uint8Array(W * H);
      const layerOf = new Uint8Array(W * H);
      const tops: Int16Array[] = [];
      // Five bands from the dark to the glow's core; the brightest cyan is kept for spores and spots.
      const steps = [tone(biome, 'sky', 0), tone(biome, 'sky', 1), tone(biome, 'sky', 2), tone(biome, 'water', 3), tone(biome, 'sky', 3)];
      // The glow: a column of light down the middle, widest at mid height, fading into the canopy above and
      // the mist below, its bands breaking up at their edges.
      for (let y = 0; y < H; y++) {
        const v2 = y / H;
        const tall = Math.exp(-(((v2 - 0.58) / 0.5) ** 2));
        for (let x = 0; x < W; x++) {
          const u = (x + 0.5 - cx) / (W * 0.21);
          const wide = Math.exp(-(u * u) / 2);
          const k = Math.max(0, Math.min(4, Math.floor(wide * tall * 5 + (this.jitter[y * W + x] ?? 0.5) * 0.8 - 0.4)));
          px[y * W + x] = steps[k];
        }
      }
      // Rows of trunks, far to near: thin and pale in the glow, then thicker and darker.
      const tiers: [number, number, number, number][] = [
        [tone(biome, 'foliage', 2), 8, 2, 0.02],
        [tone(biome, 'foliage', 1), 13, 3, 0.12],
        [tone(biome, 'foliage', 0), 19, 4, 0.24],
      ];
      tiers.forEach(([color, spacing, width, gap], n) => {
        const layerTops = new Int16Array(W).fill(0);
        tops.push(layerTops);
        for (let i = -1; i * spacing < W + spacing; i++) {
          const hs = hash2(i, n, this.seed ^ 0x7e3);
          const x0 = i * spacing + (hs % spacing);
          // Fewer trunks, and the open middle a little wider on one side than the other, so no two rows match.
          const side = x0 < cx ? 0.85 + ((hs >>> 20) % 30) / 100 : 1.15 - ((hs >>> 20) % 30) / 100;
          if (Math.abs(x0 - cx) < W * gap * side || hs % 3 === 0) continue;
          const w = width + ((hs >>> 8) % 2);
          const top = Math.round(H * (0.12 + n * 0.08)) + ((hs >>> 10) % 5);
          // A slight lean, so no two stand quite alike.
          const lean = ((((hs >>> 14) % 100) / 100) - 0.5) * 0.1;
          const paint = (x: number, y: number): void => {
            if (x < 0 || x >= W || y < 0 || y >= H) return;
            px[y * W + x] = color;
            layerOf[y * W + x] = n + 1;
          };
          for (let y = top; y < H; y++) {
            const xs = Math.round(x0 + lean * (H - y));
            for (let x = xs; x < xs + w; x++) paint(x, y);
          }
          // A branch or two, forking up and outward, thinning to a twig.
          const branches = 1 + ((hs >>> 12) % 2) + (n === 2 ? 1 : 0);
          for (let k = 0; k < branches; k++) {
            const hb = hash2(i * 7 + k, n, this.seed ^ 0x3b1);
            const side = (hb & 1) === 0 ? -1 : 1;
            const y1 = top + 2 + ((hb >>> 4) % Math.max(1, Math.round(H * 0.3)));
            const len = 5 + ((hb >>> 8) % 6);
            for (let t = 0; t < len; t++) {
              const bx = Math.round(x0 + (side < 0 ? 0 : w - 1) + side * t);
              const by = Math.round(y1 - t * 0.7);
              paint(bx, by);
              if (t < len * 0.5 && w > 2) paint(bx, by + 1);
            }
          }
        }
      });
      // The canopy's dark across the top, its lower edge lumpy, with leaf clusters hanging under it.
      const dark = tone(biome, 'foliage', 0);
      const leaf = [tone(biome, 'foliage', 3), tone(biome, 'foliage', 4)];
      for (let x = 0; x < W; x++) {
        const edge = H * 0.03 + Math.abs(this.cloudNoise(x / 9 + 77, 1)) * H * 0.06;
        for (let y = 0; y < edge && y < H; y++) {
          px[y * W + x] = dark;
          layerOf[y * W + x] = 4;
        }
      }
      for (let y = 0; y < H * 0.34; y += 2) {
        for (let x = 0; x < W; x += 2) {
          const hs = hash2(x, y, this.seed ^ 0x9a1);
          const depth = y / (H * 0.34);
          // Dense just under the dark, thinning to nothing lower down.
          if (hs % 1000 >= (1 - depth) ** 2 * 520) continue;
          const c = leaf[(hs >>> 8) % 2];
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            if (x + dx < W && y + dy < H && layerOf[(y + dy) * W + x + dx] === 0) px[(y + dy) * W + x + dx] = c;
          }
        }
      }
      this.ridge = { key, px, glow, layer: layerOf, tops };
    }
    // The whole depth is lit by the glow itself, like a sky: the daylight pass leaves it alone.
    const { px, layer } = this.ridge;
    for (let i = 0; i < W * H; i++) {
      if (px[i] >= 0) {
        this.px[i] = px[i];
        this.glow[i] = 1;
      }
    }
    // Spores drifting up through the glow, pale, a few at a time.
    const spore = tone(biome, 'sky', 4);
    for (let k = 0; k < 16; k++) {
      const hs = hash2(k, 11, this.seed ^ 0x5e2);
      const x = Math.round(cx + (((hs % 1000) / 1000) - 0.5) * W * 0.5 + Math.sin(v.slow * 0.4 + k) * 1.5);
      const y = Math.round(H - ((((hs >>> 10) % 1000) / 1000) * H + v.slow * (1.5 + (hs % 3) * 0.5)) % H);
      if (x >= 0 && x < W && y >= 0 && y < H && layer[y * W + x] === 0 && this.px[y * W + x] !== tone(biome, 'sky', 0)) this.px[y * W + x] = spore;
    }
  }

  // ── Ridge ────────────────────────────────────────────────────────────────

  /** The distance, layer by layer: hazy far away, sharper and darker near, dressed with little far-off things. */
  private drawRidge(v: BackdropView): void {
    const { geo, sky } = v;
    const W = geo.cols;
    const H = geo.horizon * 2;
    const def = BIOMES[v.biome];
    const snowy = def.cold || sky.season === 'winter';
    const night = sky.daylight < 0.35;
    const key = `${W}:${H}:${v.biome}:${snowy}:${night}:${sky.horizon}`;
    if (this.ridge.key !== key) this.ridge = { key, ...this.ridgeLayers(v, W, H, snowy, night) };
    const { px, glow } = this.ridge;
    for (let i = 0; i < W * H; i++) {
      if (px[i] >= 0) {
        this.px[i] = px[i];
        this.glow[i] = glow[i];
      }
    }
    this.drawLandmark(v, W, H, night);
  }

  /** The biome's landmark: it stands on its layer of distance, so nearer hills and woods pass in front of its foot. */
  private drawLandmark(v: BackdropView, W: number, H: number, night: boolean): void {
    const { sky } = v;
    const biome = v.biome;
    const lx = v.landmark;
    const haze = lit(sky.horizon, 1, 1, 1);
    if (biome === 'tundra') {
      // A frozen lake at the foot of the hills, glinting.
      const ice = mix(0x8fb4d4, sky.horizon, 0.2);
      for (let y = H - 4; y < H; y++) {
        for (let x = lx - 20; x <= lx + 20; x++) {
          if (x < 0 || x >= W || ((x + 0.5 - lx) / 20) ** 2 + ((y + 0.5 - (H - 1.5)) / 2.6) ** 2 > 1) continue;
          const glint = hash2(x, y + Math.floor(v.slow * 2), 17) % 23 === 0;
          this.px[y * W + x] = glint ? 0xffffff : y === H - 4 ? lighten(ice, 0.35) : (x + y * 3) % 9 === 0 ? lighten(ice, 0.15) : ice;
          this.glow[y * W + x] = 0;
        }
      }
      return;
    }
    const frame = Math.floor(v.slow * 3);
    const art = landmarkArt(biome, frame, night, haze);
    if (art === null) return;
    // Which layer it stands on: the middle distance, or the far hills for the waterfall.
    const li = biome === 'forest' ? 0 : 1;
    const tops = this.ridge.tops[li] ?? this.ridge.tops[0];
    const sunk = biome === 'forest' ? 14 : 2;
    const ground = tops === undefined ? H : Math.min(H + 6, Math.min(...Array.from({ length: 5 }, (_, i) => tops[Math.max(0, Math.min(W - 1, lx - 2 + i))])) + sunk);
    const x0 = lx - (art.w >> 1);
    const y0 = ground - art.h * 2;
    for (let y = 0; y < art.h * 2; y++) {
      for (let x = 0; x < art.w; x++) {
        const c = art.rgb[y * art.w + x];
        const px = x0 + x;
        const py = y0 + y;
        if (c < 0 || px < 0 || px >= W || py < 0 || py >= H) continue;
        const i = py * W + px;
        if (this.ridge.layer[i] > li + 1) continue;
        this.px[i] = c;
        this.glow[i] = art.glow[y * art.w + x];
      }
    }
  }

  private ridgeLayers(v: BackdropView, W: number, H: number, snowy: boolean, night: boolean): { px: Int32Array; glow: Uint8Array; layer: Uint8Array; tops: Int16Array[] } {
    const { sky } = v;
    const def = BIOMES[v.biome];
    const px = new Int32Array(W * H).fill(-1);
    const glow = new Uint8Array(W * H);
    // Which layer drew each pixel (0 none), and where each layer's land begins in each column.
    const layerOf = new Uint8Array(W * H);
    const tops: Int16Array[] = [];
    const base = H;
    LAYERS[v.biome].forEach((layer, n) => {
      const offset = 3.1 + n * 4.6;
      const heights = new Float64Array(W + 2);
      for (let x = -1; x <= W; x++) heights[x + 1] = this.profile(layer, x, layer.height * def.ridge.height * H, offset);
      const own = mix(def.ridge.far, def.ridge.near, layer.depth);
      const color = mix(own, sky.horizon, (1 - layer.depth) * 0.45 + 0.05);
      const lit = lighten(color, 0.12);
      const shade = darken(color, 0.14);
      const snow = mix(0xe8eef4, sky.horizon, (1 - layer.depth) * 0.4);
      const peak = layer.height * def.ridge.height * H;
      const layerTops = new Int16Array(W).fill(base);
      tops.push(layerTops);
      for (let x = 0; x < W; x++) {
        const h = heights[x + 1];
        if (h < 0.5) continue;
        const top = base - Math.round(h);
        layerTops[x] = Math.max(0, top);
        const slope = heights[x + 2] - heights[x];
        for (let y = Math.max(0, top); y < base; y++) {
          let c = slope > 0.6 ? lit : slope < -0.6 ? shade : color;
          if (snowy && layer.profile !== 'firs' && layer.profile !== 'crowns' && y - top < (h - peak * 0.45) * 0.5) c = slope < -0.6 ? mix(snow, 0x9aaac4, 0.35) : snow;
          if (y === top && layer.depth > 0.6) c = lighten(c, 0.08);
          // Haze thickens towards each layer's foot.
          c = mix(c, sky.horizon, ((y - top) / Math.max(1, base - top)) * 0.18 * (1 - layer.depth));
          px[y * W + x] = c;
          layerOf[y * W + x] = n + 1;
        }
      }
      if (layer.dress !== undefined) this.dress(layer.dress, px, glow, heights, W, base, color, snowy, n);
    });
    return { px, glow, layer: layerOf, tops };
  }

  /** A layer's height in pixels at column x. */
  private profile(layer: Layer, x: number, height: number, offset: number): number {
    const n = (f: number, o: number): number => (this.ridgeNoise(x * f + offset, o + offset) + 1) / 2;
    const f = layer.freq ?? 0.012;
    switch (layer.profile) {
      case 'hills':
        return height * (0.45 + 0.45 * n(f, 0) + 0.1 * n(f * 3.3, 5));
      case 'peaks': {
        const ridged = 1 - Math.abs(this.ridgeNoise(x * f + offset, offset));
        return height * (0.3 + 0.6 * ridged ** 1.5 + 0.1 * n(f * 5, 3));
      }
      case 'firs':
      case 'crowns': {
        // Trees on a low rise: pointed firs, or round crowns.
        const rise = height * (0.35 + 0.25 * n(0.02, 0));
        const spacing = 3 + Math.round(layer.depth * 4);
        const k = Math.floor(x / spacing);
        let crown = 0;
        for (let i = k - 1; i <= k + 1; i++) {
          const hs = hash2(i, 7 + Math.round(layer.depth * 10), this.seed);
          const tx = i * spacing + (hs % spacing);
          const th = 2 + layer.depth * 5 + (hs % 4);
          const dx = Math.abs(x + 0.5 - tx);
          const r = layer.profile === 'firs' ? th - dx * 1.6 : dx < th * 0.6 ? th * Math.sqrt(1 - (dx / (th * 0.6)) ** 2) : 0;
          crown = Math.max(crown, r);
        }
        return rise + crown;
      }
    }
  }

  /** Little far-off things standing on a layer: pines and dead trees. */
  private dress(kind: Dress, px: Int32Array, glow: Uint8Array, heights: Float64Array, W: number, base: number, color: number, snowy: boolean, layer: number): void {
    const spacing = kind === 'snags' ? 13 : 5;
    const colors: Readonly<Record<string, number>> = {
      b: darken(mix(color, 0x2f5a2a, 0.35), 0.1),
      t: darken(color, 0.35),
      s: mix(color, 0xf4f6f8, 0.7),
      c: darken(mix(color, 0x3f7a3a, 0.4), 0.05),
      d: darken(mix(color, 0x4a3a2e, 0.5), 0.2),
    };
    for (let x0 = 2; x0 < W - 6; x0 += spacing) {
      const hs = hash2(x0, layer, this.seed ^ 0x6d2);
      let sprite: readonly string[] | null = null;
      switch (kind) {
        case 'pines':
          sprite = hs % 4 === 0 ? null : snowy ? TINY.snowpine : TINY.pine;
          break;
        case 'snags':
          sprite = hs % 2 === 0 ? TINY.snag : null;
          break;
      }
      if (sprite === null) continue;
      const x = x0 + ((hs >>> 8) % 3);
      const w = sprite[0].length;
      // It stands on the lowest point under it, sunk a pixel into the ground.
      let ground = Infinity;
      for (let i = 0; i < w; i++) ground = Math.min(ground, heights[x + i + 1] ?? 0);
      const bottom = base - Math.round(ground) + 1;
      sprite.forEach((row, r) => {
        Array.from(row).forEach((k, c) => {
          const y = bottom - sprite.length + r;
          if (k === '.' || y < 0 || y >= base || x + c >= W) return;
          px[y * W + x + c] = colors[k];
          glow[y * W + x + c] = 0;
        });
      });
    }
  }

  // ── Ground ───────────────────────────────────────────────────────────────

  private drawGround(v: BackdropView): void {
    const { geo, sky } = v;
    const W = geo.cols;
    const top = geo.horizon * 2;
    const H = geo.rows * 2;
    const biome = v.biome;
    const def = BIOMES[biome];
    const winter = sky.season === 'winter' && snows(biome, sky.season) && !def.cold;
    const key = `${W}:${top}:${H}:${biome}:${sky.season}:${sky.horizon}:${v.path?.x}:${v.path?.y}`;
    if (this.ground.key !== key) this.ground = { key, ...this.groundBase(v, winter) };
    this.px.set(this.ground.px.subarray(0, (H - top) * W), top * W);
    this.glow.fill(0, top * W, H * W);
    const t = v.slow;
    const ground = winter ? WINTER_GROUND : def.ground;
    const path = this.ground.path;
    const put = (x: number, y: number, c: number): void => {
      if (x >= 0 && x < W && y >= top && y < H && path[(y - top) * W + x] === 0) this.px[y * W + x] = c;
    };
    // Grass tufts that sway with the wind, in the green biomes.
    if (!winter && def.gloom === undefined && (biome === 'meadow' || biome === 'forest' || biome === 'swamp')) {
      const blade = ground.fg;
      const root = mix(ground.fg, ground.bg, 0.55);
      const gust = 1.5 + Math.abs(sky.wind) * 2;
      for (let y = top + 3; y < H; y += 2) {
        for (let x = 1; x < W - 1; x++) {
          const hs = hash2(x, y, this.seed ^ 0x7f1);
          // Tufts grow in clumps, where a slow noise allows them, not evenly everywhere.
          const clump = this.cloudNoise(x / 10 + 130, y / 5);
          if (clump < 0.15 || hs % 1000 >= def.ground.density * 70) continue;
          const lean = Math.sin(x * 0.3 - t * gust + y) > 0.75 - Math.abs(sky.wind) * 0.4 ? (sky.wind < 0 ? -1 : 1) : 0;
          put(x - 1, y, root);
          put(x + 1, y, root);
          put(x, y, root);
          put(x - 1, y - 1, blade);
          put(x + 1, y - 1, blade);
          put(x + lean, y - 2, blade);
          if (hs % 3 === 0) put(x + lean, y - 3, lighten(blade, 0.15));
        }
      }
    }
    // Under the canopy: tiny glowing caps along the far path, and violet undergrowth in the mid-distance.
    if (def.gloom !== undefined) {
      const groundRows = H - top;
      for (let k = 0; k < 10; k++) {
        const hs = hash2(k, 3, this.seed ^ 0x61);
        const y = top + 1 + ((hs >>> 8) % Math.max(1, Math.round(groundRows * 0.45)));
        const t = (y - top) / Math.max(1, groundRows);
        const x = Math.round(W / 2 + (hs & 1 ? 1 : -1) * (2 + t * 10 + ((hs >>> 16) % 4)));
        const pulse = 0.6 + 0.4 * Math.sin(v.slow * 0.8 + k);
        const c = mix(tone(biome, 'glow', 2), tone(biome, 'glow', 4), pulse);
        if (x >= 0 && x < W && y >= top && y < H) {
          this.px[y * W + x] = c;
          this.glow[y * W + x] = 1;
        }
      }
      for (let k = 0; k < 8; k++) {
        const hs = hash2(k, 5, this.seed ^ 0x62);
        const y = top + 2 + ((hs >>> 8) % Math.max(1, Math.round(groundRows * 0.35)));
        const x = (hs >>> 16) % W;
        if (Math.abs(x - W / 2) < W * 0.08) continue;
        for (let i = 0; i < 3 + (hs % 3); i++) put(x + i + ((i + y) % 2), y + (i % 2), tone(biome, 'accent', i % 3 === 0 ? 2 : 1));
      }
    }
    // Snow and frost glitter.
    if (winter || def.cold) {
      for (let y = top; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const hs = hash2(x, y, this.seed ^ 0x5a1);
          if (hs % 500 === 0 && Math.sin(t * 2 + (hs % 50)) > 0.6) put(x, y, 0xffffff);
        }
      }
    }
  }

  /**
   * The path from its door to the front: narrow and hazy far away, wide near, winding a little. Dirt in
   * the green biomes, a boardwalk in the swamp, trodden snow in the cold.
   * Returns which pixels it covers, so nothing grows on it.
   */
  private drawPath(v: BackdropView, px: Int32Array, winter: boolean): Uint8Array {
    const { geo } = v;
    const W = geo.cols;
    const top = geo.horizon * 2;
    const H = geo.rows * 2;
    const mask = new Uint8Array((H - top) * W);
    const biome = v.biome;
    // In the forest the path runs from the pale glow at the back straight down to the front.
    const p = BIOMES[biome].gloom !== undefined ? { x: W / 2, y: top, w: 4 } : v.path;
    if (p === null) return mask;
    const boards = biome === 'swamp';
    const snowy = winter || biome === 'tundra';
    // Its colour in the palette's own steps: a step lighter far away, where the haze is, never a blend.
    const gloomy = BIOMES[biome].gloom !== undefined;
    const role: Role = gloomy ? 'ground' : snowy && !boards ? 'stone' : 'earth';
    const near = gloomy ? 3 : snowy && !boards ? 3 : boards ? 2 : 3;
    const y0 = Math.max(top, p.y);
    const x1 = p.x + (W / 2 - p.x) * 0.45 + (BIOMES[biome].gloom !== undefined ? (this.seed % 9) - 4 : 0);
    const wiggle = (this.seed % 628) / 100;
    for (let y = y0; y < H; y++) {
      const t = (y - y0) / Math.max(1, H - 1 - y0);
      const ease = t * t * (3 - 2 * t);
      const cx = p.x + (x1 - p.x) * ease + Math.sin(t * 3.2 + wiggle) * 3 * t;
      const half = (p.w / 2) * 0.75 + t * 8;
      const depth = H - 1 <= top ? 1 : (y - top) / (H - 1 - top);
      const base = tone(biome, role, depth < 0.06 ? near + 1 : near);
      for (let x = Math.floor(cx - half - 1); x <= Math.ceil(cx + half + 1); x++) {
        if (x < 0 || x >= W) continue;
        const d = Math.abs(x + 0.5 - cx);
        const i = (y - top) * W + x;
        if (d > half + 1) continue;
        const hs = hash2(x, y, this.seed ^ 0x9a7);
        let c: number;
        if (d > half) c = mix(px[i], darken(base, 0.25), 0.6);
        else if (boards) c = (y - y0) % 3 === 0 ? darken(base, 0.35) : Math.abs(d - half) < 1 ? darken(base, 0.18) : hs % 11 === 0 ? lighten(base, 0.12) : base;
        else if (snowy) c = Math.abs(x + 0.5 - cx + ((y >> 2) % 2 === 0 ? 1.5 : -1.5)) < 0.8 && (y & 3) !== 0 ? darken(base, 0.16) : lighten(base, 0.06);
        else c = hs % 13 === 0 ? darken(base, 0.18) : hs % 9 === 0 ? lighten(base, 0.12) : dither(x, y) * 0.5 + 0.2 < Math.abs(d / half) * 0.5 ? darken(base, 0.06) : base;
        px[i] = c;
        mask[i] = 1;
      }
    }
    return mask;
  }

  /** The ground's texture that never moves: patches of light and shade, flowers, leaves, pebbles, ripples. */
  private groundBase(v: BackdropView, winter: boolean): { px: Int32Array; path: Uint8Array } {
    const { geo, sky } = v;
    const W = geo.cols;
    const top = geo.horizon * 2;
    const H = geo.rows * 2;
    const biome = v.biome;
    const def = BIOMES[biome];
    const ground = winter ? WINTER_GROUND : def.ground;
    const haze = mix(def.ridge.far, sky.horizon, 0.5);
    const px = new Int32Array((H - top) * W);
    // The ground in the palette's own steps: its base, a lighter and a darker one, and a second hue of
    // about the base's lightness for texture. Far away it steps lighter, into the haze.
    const snow = winter || def.cold;
    const gloom = def.gloom;
    const step = (role: Role, n: number): number => tone(biome, role, n);
    for (let y = top; y < H; y++) {
      const depth = H - 1 <= top ? 1 : (y - top) / (H - 1 - top);
      const far = depth < 0.2 ? 1 : 0;
      const base = snow ? (far ? WHITE : step('stone', 4)) : step('ground', 2 + far);
      const light = snow ? WHITE : step('ground', 3 + far);
      const dark = snow ? step('sky', 3) : step('ground', 1 + far);
      const other = snow ? step('sky', 4) : step('foliage', 2 + far);
      // Patches shrink towards the horizon: the ground recedes.
      const vy = ((H - top) / 5) * Math.log(3 + 5 * depth);
      // Broad, calm patches of light and shade, their edges dithered only where two patches meet; under
      // the canopy, calmer still.
      for (let x = 0; x < W; x++) {
        const p = this.ridgeNoise(x / (12 + 14 * depth) + 40, vy / 1.6);
        const q = this.cloudNoise(x / (9 + 10 * depth) + 90, vy / 1.3);
        const d = dither(x, y) - 0.5;
        const lightAt = gloom !== undefined ? 0.6 : 0.42;
        let c = p > lightAt + d * 0.16 ? light : gloom === undefined && p < -0.46 - d * 0.16 ? dark : gloom === undefined && q > 0.5 + d * 0.1 ? other : base;
        if (gloom !== undefined) {
          // Towards the glow at the back, the ground pales into the mist, in flat bands with ragged edges.
          const k = (1 - depth) ** 1.8 * Math.exp(-(((x + 0.5 - W / 2) / (W * 0.13)) ** 2) / 2);
          const edge = (this.ridgeNoise(x / 5 + 200, y / 3) + 1) * 0.12;
          c = k > 0.55 + edge ? step('sky', 2) : k > 0.28 + edge ? step('sky', 1) : c;
        }
        if (biome === 'swamp' && this.cloudNoise(x / 15 + 70, y / 5) > 0.45) c = (x + y * 3) % 17 === 0 ? lighten(mix(0x2e4a40, sky.horizon, 0.3), 0.3) : mix(0x2e4a40, sky.horizon, 0.3);
        px[(y - top) * W + x] = c;
      }
    }
    const onPath = this.drawPath(v, px, winter);
    const put = (x: number, y: number, c: number): void => {
      if (x >= 0 && x < W && y >= top && y < H && onPath[(y - top) * W + x] === 0) px[(y - top) * W + x] = c;
    };
    for (let y = top + 2; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const hs = hash2(x, y, this.seed ^ 0x3b7);
        const special = hs % 1000;
        if (!winter && (biome === 'meadow' || biome === 'forest') && sky.season === 'autumn' && special < 14) {
          put(x, y, (hs >>> 8) % 3 === 0 ? 0xc8501e : 0xe0962e);
          if ((hs >>> 12) % 2 === 0) put(x + 1, y, 0xb8601e);
        } else if (biome === 'tundra' && special < 3) {
          // A pebble with a lit top.
          const stone = 0x7a8696;
          put(x, y, stone);
          put(x + 1, y, darken(stone, 0.2));
          put(x, y - 1, lighten(stone, 0.25));
        }
      }
    }
    return { px, path: onPath };
  }
}
