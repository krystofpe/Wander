// Builds a frame: sky, ridge, ground, props and the creature by depth, weather, light, bubble, status bar, journal.
import { AMBIENT_HZ, BIOMES, COLORS, LANTERN_GAIN, LANTERN_RADIUS, LANTERN_RGB, LEAVES, MIN_COLS, MIN_ROWS, WEATHER, WINTER_GROUND } from './config.ts';
import type { BiomeName } from './config.ts';
import { CRITTERS, creatureSprite, doorOf, drawSprite } from './art.ts';
import type { Canvas, Palette } from './art.ts';
import type { Body } from './brain.ts';
import { lit, mix } from './color.ts';
import type { Life } from './creature.ts';
import type { Frame } from './frame.ts';
import { hash2, makeNoise } from './noise.ts';
import type { Noise2D } from './noise.ts';
import type { Geometry, Prop, Scene } from './scene.ts';
import { moonGlyph, moonPosition, smoothstep, snows, sunPosition } from './sky.ts';
import type { Sky } from './sky.ts';

export type Segment = { readonly text: string; readonly color: number };

/** Everything the renderer needs for one frame. */
export type View = {
  readonly geo: Geometry;
  readonly sky: Sky;
  readonly scene: Scene;
  readonly life: Life;
  readonly body: Body;
  /** The three face cells. */
  readonly eyes: string;
  readonly eyeGlow: number;
  /** Real seconds, for animation. */
  readonly time: number;
  readonly flash: boolean;
  readonly bubble: { readonly text: string; readonly kind: 'say' | 'think' } | null;
  /** Rows under the scene: the status bar and the hints. Null hides them. */
  readonly hud: readonly (readonly Segment[])[] | null;
  readonly journal: readonly string[] | null;
};

const SPACE = 32;
const code = (ch: string): number => ch.codePointAt(0) ?? SPACE;
/** Time stepped at AMBIENT_HZ, for the scenery's own motion: fewer cells change per frame. */
const ambient = (time: number): number => Math.floor(time * AMBIENT_HZ) / AMBIENT_HZ;

/** Code point ranges that take two terminal columns (East Asian wide and fullwidth, emoji). */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
];
const HIDDEN = /[\p{Cc}\p{Cf}\p{M}\p{Zl}\p{Zp}]/u;

/** Text that draws one character per column: composed, without hidden characters; wide ones become '?'. */
export function displayText(text: string): string {
  return Array.from(text.normalize('NFC'))
    .filter((ch) => !HIDDEN.test(ch))
    .map((ch) => {
      const cp = ch.codePointAt(0) ?? 32;
      return WIDE.some(([from, to]) => cp >= from && cp <= to) ? '?' : ch;
    })
    .join('');
}

/** Splits text into lines of at most `width` columns, breaking at spaces where it can. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line: string[] = [];
  for (const word of displayText(text).split(/\s+/).filter((w) => w !== '')) {
    let chars = Array.from(word);
    while (chars.length > width) {
      if (line.length > 0) {
        lines.push(line.join(''));
        line = [];
      }
      lines.push(chars.slice(0, width).join(''));
      chars = chars.slice(width);
    }
    const extra = line.length === 0 ? chars.length : chars.length + 1;
    if (line.length + extra > width) {
      lines.push(line.join(''));
      line = [];
    }
    if (line.length > 0) line.push(' ');
    line.push(...chars);
  }
  if (line.length > 0) lines.push(line.join(''));
  return lines;
}

/**
 * Writes a frame and remembers which colours glow, for the lighting pass: a glowing glyph keeps its colour
 * in the dark, and so does a background painted by something that glows.
 */
class Layer implements Canvas {
  readonly width: number;
  readonly height: number;
  readonly frame: Frame;
  readonly glowFg: Uint8Array;
  readonly glowBg: Uint8Array;

  constructor(frame: Frame, height: number) {
    this.frame = frame;
    this.width = frame.width;
    this.height = height;
    this.glowFg = new Uint8Array(frame.width * frame.height);
    this.glowBg = new Uint8Array(frame.width * frame.height);
  }

  put(col: number, row: number, glyph: number, fg: number | null, bg: number | null, glow: boolean, tint?: number): void {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return;
    const i = row * this.width + col;
    const f = this.frame;
    f.glyph[i] = glyph;
    if (fg !== null) f.fg[i] = fg;
    this.glowFg[i] = glow ? 1 : 0;
    if (bg !== null) {
      f.bg[i] = tint === undefined ? bg : mix(f.bg[i], bg, tint);
      if (tint === undefined || tint > 0.5) this.glowBg[i] = glow ? 1 : 0;
    }
  }
}

type Light = { col: number; row: number; radius: number; rgb: readonly [number, number, number]; gain: number };

const WATER = { fg: 0x9fd0f0, bg: 0x2a6a9c } as const;
const ICE = { fg: 0xdff0ff, bg: 0x9cc4dc } as const;
const BUTTERFLY_COLORS = [0xffd84a, 0xff9ad0, 0xffffff, 0xa0d8ff, 0xffa040];

function homePaints(biome: BiomeName, night: boolean): Palette {
  const window = night ? { fg: 0xffd27a, bg: 0x7a5a1a, glow: true } : { fg: 0x9ab8c8, bg: 0x3a4a58 };
  const common = { D: { fg: COLORS.face, bg: 0x0a0a0e }, G: window };
  switch (biome) {
    case 'meadow':
      return { ...common, H: { fg: 0x5a4030, bg: 0xb08a5a }, h: { fg: 0x8a6a2a, bg: 0xd0b060 }, x: { fg: 0x9a7a28, bg: 0xd0b060 } };
    case 'forest':
      return { ...common, H: { fg: 0x9a8a70, bg: 0xe8dcc0 }, h: { fg: 0xf4ece0, bg: 0xb8402e }, x: { fg: 0xfaf4ea, bg: 0xb8402e } };
    case 'shore':
      return { ...common, h: { fg: 0xb8a078, bg: 0xe6d6b4 }, Z: { fg: 0x8a6a4a } };
    case 'tundra':
      return { ...common, S: { fg: 0x9fb0c4, bg: 0xe8eef6 }, s: { fg: 0xc8d4e0 } };
    case 'desert':
      return { ...common, H: { fg: 0x9a6a3a, bg: 0xd8a868 }, h: { fg: 0x7a5030, bg: 0xb88850 } };
    case 'swamp':
      return { ...common, H: { fg: 0x4a3a28, bg: 0x6a5238 }, T: { fg: 0x5a4a38 } };
  }
}

function propPaints(biome: BiomeName, sky: Sky): Palette {
  const snowy = BIOMES[biome].cold || sky.season === 'winter';
  const [leafLight, leafDark] = LEAVES[biome === 'swamp' && sky.season !== 'winter' ? 'summer' : sky.season];
  const frozen = snowy && biome !== 'shore' && biome !== 'desert';
  return {
    L: { fg: leafLight, bg: leafDark },
    l: { fg: biome === 'shore' ? 0x5fae4e : leafLight },
    T: { fg: biome === 'swamp' ? 0x6a5a48 : 0x7a5434 },
    P: snowy ? { fg: 0xeef4fa, bg: 0x2a5a3a } : { fg: 0x4f9a5a, bg: 0x1f4a2a },
    p: { fg: snowy ? 0xdde6ee : 0x2f7a3a },
    B: sky.season === 'winter' ? { fg: leafLight, bg: leafDark } : { fg: 0xe0404e, bg: leafDark },
    R: { fg: 0x8a867e, bg: snowy ? 0xb8c0c8 : 0x6a665e },
    r: { fg: 0x9a968e },
    W: frozen ? ICE : WATER,
    w: { fg: 0x6a5a3a },
    C: { fg: 0x2f6a2f, bg: 0x4f9a4a },
    M: { fg: 0xf4ece0, bg: 0xc0392b },
    m: { fg: 0xe8e0c8 },
    n: { fg: 0xb07a4a },
    K: { fg: biome === 'swamp' ? 0x8a9a4a : 0x9aaa5a },
    k: { fg: 0x7a4a2a },
    S: { fg: 0x9fb0c4, bg: 0xe8eef6 },
    s: { fg: 0xc8d4e0 },
    Z: { fg: 0xa08060 },
    Y: { fg: 0x8a6a40, bg: 0xc8a070 },
  };
}

function lighten(rgb: number, k: number): number {
  return mix(rgb, 0xffffff, k);
}

export class Renderer {
  private readonly ridgeNoise: Noise2D;
  private readonly cloudNoise: Noise2D;
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.ridgeNoise = makeNoise(seed ^ 0x41d9e);
    this.cloudNoise = makeNoise(seed ^ 0xc10d);
  }

  /** Fills every cell of `frame`. */
  render(frame: Frame, v: View): void {
    const hudRows = v.hud?.length ?? 0;
    if (frame.width < MIN_COLS || frame.height < MIN_ROWS) {
      drawTooSmall(frame);
      return;
    }
    const geo = v.geo;
    const layer = new Layer(frame, geo.rows);
    this.drawSky(layer, v);
    this.drawRidge(layer, v);
    this.drawGround(layer, v);
    const lights = this.drawThings(layer, v);
    this.drawParticles(layer, v);
    light(layer, v, lights);
    this.drawWeather(layer, v);
    if (v.bubble !== null) drawBubble(layer, v);
    for (let r = 0; r < hudRows; r++) drawSegments(frame, geo.rows + r, v.hud?.[r] ?? []);
    if (v.journal !== null) drawJournal(frame, v.journal);
  }

  private drawSky(layer: Layer, v: View): void {
    const { geo, sky } = v;
    const time = ambient(v.time);
    const h = geo.horizon;
    const night = 1 - sky.daylight;
    const cover = sky.weather.cloud;
    const edge = 0.7 - 1.15 * cover;
    const wet = sky.weather.precip;
    const grey = Math.min(1, wet * 1.4 + (sky.weather.storm ? 0.5 : 0));
    const cloudColor = mix(0x1c2234, mix(COLORS.cloud, COLORS.stormCloud, grey), sky.daylight);
    const starry = Math.max(0, 1 - wet * 3);
    // Clouds drift less than a cell a second, so they move in half-second steps.
    const drift = (Math.floor(v.time * 2) / 2) * (0.02 + 0.05 * sky.wind);
    const aurora = v.life.biome === 'tundra' && night > 0.7 && hash2(Math.floor(v.time / 600), 3, this.seed) % 3 !== 0;
    for (let r = 0; r < h; r++) {
      const t = h <= 1 ? 1 : Math.pow(r / (h - 1), 1.3);
      const base = mix(sky.zenith, sky.horizon, t);
      for (let c = 0; c < geo.cols; c++) {
        const x = c / geo.cols;
        const n = this.cloudNoise(x * 7 - drift, r / 4.5) * 0.7 + this.cloudNoise(x * 17 - drift * 1.7, r / 2.2 + 9) * 0.3;
        // Four levels of cloud: a drifting edge changes few cells.
        const d = cover <= 0.02 ? 0 : Math.round(smoothstep(edge - 0.15, edge + 0.2, n) * 4) / 4;
        let bg = d > 0 ? mix(base, cloudColor, d * 0.85) : base;
        let glyph = SPACE;
        let fg = base;
        if (aurora && r < h * 0.7) {
          const a = Math.max(0, Math.sin(c / 7 + time * 0.25 + 2 * this.ridgeNoise(c / 30, time * 0.05))) * (1 - r / (h * 0.7));
          bg = mix(bg, mix(COLORS.aurora, 0x9a60f0, (Math.sin(c / 23 + time * 0.1) + 1) / 2), a * 0.45);
        }
        if (night > 0.45 && d < 0.6 && starry > 0) {
          const hs = hash2(c, r, this.seed ^ 0x57a2);
          if (hs % 1000 < 28) {
            const twinkle = 0.65 + 0.35 * Math.sin(time * (1 + (hs % 7) * 0.4) + (hs % 100));
            const k = Math.min(1, (night - 0.45) * 2) * (1 - d) * twinkle * starry;
            glyph = code(['.', '·', '*', '+', '·'][hs % 5]);
            fg = mix(bg, COLORS.star, k);
          }
        }
        if (v.flash) bg = mix(bg, 0xe8eeff, 0.75);
        layer.put(c, r, glyph, fg, bg, true);
      }
    }
    // The sun: rays that shimmer, or the moon in today's phase.
    const sun = sunPosition(sky.hour);
    if (sun !== null && wet < 0.2) {
      const col = Math.round(sun.x * (geo.cols - 1));
      const row = Math.round((1 - sun.y) * Math.max(1, h - 3)) + 1;
      const color = mix(COLORS.sun, 0xff9040, 1 - Math.min(1, sun.y * 2.5));
      const veiled = Math.max(0, Math.min(0.85, (cover - 0.35) * 1.6));
      const fg = mix(color, layer.frame.bg[Math.min(layer.frame.bg.length - 1, row * geo.cols + col)], veiled);
      const rays = Math.floor(time * 1.5) % 2 === 0;
      const art = rays ? ['\\ | /', '-(O)-', '/ | \\'] : [' \\|/ ', '-(O)-', ' /|\\ '];
      art.forEach((line, i) => {
        Array.from(line).forEach((ch, j) => {
          if (ch !== ' ' && row - 1 + i < h) layer.put(col - 2 + j, row - 1 + i, code(ch), fg, null, true);
        });
      });
    }
    const moon = moonPosition(sky.hour);
    if (moon !== null && sky.daylight < 0.6 && wet < 0.3) {
      const col = Math.round(moon.x * (geo.cols - 1));
      const row = Math.round((1 - moon.y) * Math.max(1, h - 2));
      const k = cover > 0.75 ? 0.35 : 1;
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const i = (row + dr) * geo.cols + col + dc;
        if (row + dr >= 0 && row + dr < h && col + dc >= 0 && col + dc < geo.cols) layer.frame.bg[i] = mix(layer.frame.bg[i], 0x3a4060, 0.18 * k);
      }
      layer.put(col, row, code(moonGlyph(sky.moon)), mix(layer.frame.bg[row * geo.cols + col], COLORS.moon, k), null, true);
    }
  }

  private drawRidge(layer: Layer, v: View): void {
    const { geo, sky } = v;
    const time = ambient(v.time);
    const def = BIOMES[v.life.biome];
    const h = geo.horizon;
    const glyphs = Array.from(def.ridge.glyphs);
    const snowy = def.cold || (sky.season === 'winter' && v.life.biome !== 'desert' && v.life.biome !== 'shore');
    const layers: [number, number, number, number][] = def.sea
      ? [[def.ridge.far, def.ridge.height, 0, 0]]
      : [
          [mix(def.ridge.far, sky.horizon, 0.35), def.ridge.height, 3.1, 0.55],
          [def.ridge.near, def.ridge.height * 0.6, 7.7, 0.3],
        ];
    for (const [color, height, offset, rough] of layers) {
      for (let c = 0; c < geo.cols; c++) {
        const x = c / geo.cols;
        let top: number;
        let half = false;
        if (def.sea) top = h - Math.max(1, Math.round(height * h));
        else {
          const freq = def.ridge.smooth ? 2.5 : 6;
          const n = this.ridgeNoise(x * freq + offset, offset) * 0.6 + this.ridgeNoise(x * freq * 4 + offset, 5 + offset) * rough * 0.5;
          // In half rows, so smooth hills can use half blocks.
          const halves = Math.max(2, Math.round(height * h * 2 * (0.55 + 0.45 * n)));
          top = h - Math.ceil(halves / 2);
          half = def.ridge.smooth && halves % 2 === 1;
        }
        for (let r = Math.max(0, top); r < h; r++) {
          let glyph = SPACE;
          let fg = color;
          let bg = color;
          if (def.sea) {
            const wave = Math.sin(c * 0.55 + time * 1.2 + r * 1.7 + this.ridgeNoise(c / 9, r + time * 0.2) * 3);
            glyph = code(wave > 0.55 ? '≈' : wave > -0.2 ? '~' : ' ');
            bg = mix(def.ridge.far, def.ridge.near, (r - top) / Math.max(1, h - top));
            fg = lighten(bg, 0.35);
          } else if (r === top && def.ridge.smooth) {
            if (half) {
              glyph = code('▄');
              bg = layer.frame.bg[r * geo.cols + c];
              fg = color;
            }
          } else if (r === top) {
            glyph = code(glyphs[hash2(c, 1, this.seed) % glyphs.length]);
            bg = mix(layer.frame.bg[r * geo.cols + c], color, 0.5);
            fg = snowy ? 0xe8eef4 : lighten(color, 0.15);
          } else if (!def.ridge.smooth && rough < 0.4 && hash2(c, r, this.seed ^ 0x1d) % 11 === 0) {
            glyph = code(glyphs[hash2(c, r, this.seed) % glyphs.length]);
            fg = lighten(color, 0.08);
          }
          layer.put(c, r, glyph, fg, bg, false);
        }
      }
    }
  }

  private drawGround(layer: Layer, v: View): void {
    const { geo, sky } = v;
    const time = ambient(v.time);
    const biome = v.life.biome;
    const def = BIOMES[biome];
    const winter = sky.season === 'winter' && snows(biome, sky.season) && !def.cold;
    const ground = winter ? WINTER_GROUND : def.ground;
    const glyphs = Array.from(winter ? `.'·` : def.ground.glyphs).map(code);
    const swaying = biome === 'forest' || biome === 'meadow' || biome === 'swamp';
    const haze = mix(def.ridge.far, sky.horizon, 0.5);
    for (let r = geo.horizon; r < geo.rows; r++) {
      const depth = geo.depthOf(r);
      const bg = mix(ground.bg, haze, (1 - depth) * 0.18);
      for (let c = 0; c < geo.cols; c++) {
        const hs = hash2(c, r, this.seed ^ 0x9e0);
        let glyph = SPACE;
        let fg = ground.fg;
        if ((hs % 1000) / 1000 < def.ground.density) {
          let k = (hs >>> 10) % glyphs.length;
          if (swaying && Math.sin(c * 0.3 - time * (1.5 + Math.abs(sky.wind) * 2) + r) > 0.75 - Math.abs(sky.wind) * 0.4) k = (k + 1) % glyphs.length;
          glyph = glyphs[k];
        }
        // Flowers in spring and summer, fallen leaves in autumn.
        const special = (hs >>> 20) % 1000;
        if (!winter && (biome === 'meadow' || biome === 'forest')) {
          if (sky.season === 'autumn' && special < 25) {
            glyph = code(special % 2 === 0 ? ',' : '`');
            fg = special % 3 === 0 ? 0xc8501e : 0xe0962e;
          } else if ((sky.season === 'spring' || sky.season === 'summer') && biome === 'meadow' && special < 20) {
            glyph = code('*');
            fg = [0xff9ad0, 0xffe066, 0xffffff, 0xb0a0ff][special % 4];
          }
        }
        if (def.sea && r === geo.horizon) {
          // Surf: the sea's edge pulses up the sand.
          const s = Math.sin(time * 1.3 + c * 0.13);
          if (s > 0.2) {
            glyph = code('~');
            fg = 0xf0f6ff;
          }
          layer.put(c, r, glyph, fg, mix(bg, 0x8ab8c8, 0.35 + 0.25 * s), false);
          continue;
        }
        layer.put(c, r, glyph, fg, bg, false);
      }
    }
  }

  /** Props, cairn, critters on the ground, food, the toy and the creature, back to front. Returns light sources. */
  private drawThings(layer: Layer, v: View): Light[] {
    const { geo, sky, scene, body, life } = v;
    const lights: Light[] = [];
    const night = sky.daylight < 0.35;
    const props = propPaints(life.biome, sky);
    const home = homePaints(life.biome, night);
    const things: { row: number; draw: () => void }[] = [];
    for (const p of scene.layout.props) {
      things.push({ row: geo.footRow(p.z), draw: () => drawProp(layer, v, p, p.kind === 'home' ? { ...props, ...home } : props) });
    }
    if (life.cairn > 0) {
      const foot = geo.footRow(scene.layout.cairn.z);
      things.push({ row: foot, draw: () => drawCairn(layer, geo.col(scene.layout.cairn.x), foot, life.cairn) });
    }
    for (const k of scene.critters) {
      if (k.flies) continue;
      const foot = geo.footRow(k.z);
      things.push({
        row: foot,
        draw: () => {
          const frames = CRITTERS[k.kind];
          let art = frames[Math.floor(k.t * 3) % frames.length];
          if (k.vx < 0) art = Array.from(art).reverse().join('');
          const color = k.kind === 'crab' ? 0xe0603a : k.kind === 'frog' ? 0x6ac04a : 0xb0a060;
          Array.from(art).forEach((ch, i) => layer.put(geo.col(k.x) + i - 1, foot, code(ch), color, null, false));
        },
      });
    }
    for (const f of scene.foods) {
      const foot = geo.footRow(f.z);
      things.push({ row: foot, draw: () => layer.put(geo.col(f.x), foot - Math.round(f.h), code(f.kind.glyph), f.kind.color, null, false) });
    }
    const toy = scene.toy;
    if (toy !== null) {
      const foot = geo.footRow(toy.z);
      const fade = toy.age > 40 ? (45 - toy.age) / 5 : 1;
      things.push({
        row: foot,
        draw: () => {
          const row = foot - Math.round(toy.h);
          layer.put(geo.col(toy.x), row, code('●'), mix(0x203040, COLORS.toy, fade), null, true);
          lights.push({ col: geo.col(toy.x), row, radius: 5, rgb: [0.5, 0.9, 1], gain: 0.6 * fade });
        },
      });
    }
    if (body.visible && !body.inside) {
      const foot = geo.footRow(body.z);
      things.push({ row: foot + 0.5, draw: () => lights.push(...drawCreature(layer, v, foot)) });
    }
    things.sort((a, b) => a.row - b.row);
    for (const t of things) t.draw();

    // Its eyes in the dark doorway, while it is inside.
    if (body.visible && body.inside) {
      const h = scene.layout.home;
      const [dc, dr] = doorOf(h.sprite);
      const left = geo.left(h.x, h.sprite.w) + dc;
      const top = geo.footRow(h.z) - h.sprite.h + 1 + dr;
      const eyes = Array.from(v.eyes);
      layer.put(left, top, code(eyes[0] ?? '•'), v.eyeGlow, null, true);
      layer.put(left + 1, top, code(eyes[2] ?? eyes[0] ?? '•'), v.eyeGlow, null, true);
    }
    if (night) {
      const h = scene.layout.home;
      lights.push({ col: geo.col(h.x), row: geo.footRow(h.z) - 2, radius: 7, rgb: LANTERN_RGB, gain: 0.35 });
    }
    return lights;
  }

  private drawParticles(layer: Layer, v: View): void {
    const { geo, scene, time } = v;
    for (const k of scene.critters) {
      if (!k.flies) continue;
      const col = geo.col(k.x);
      const row = Math.round(k.y * geo.rows);
      if (row >= geo.rows) continue;
      const frames = CRITTERS[k.kind];
      const art = frames[Math.floor(k.t * (k.kind === 'bird' || k.kind === 'gull' ? 4 : 6)) % frames.length];
      let color = 0x2a2a30;
      let glow = false;
      if (k.kind === 'butterfly') color = BUTTERFLY_COLORS[Math.floor(k.phase * 10) % BUTTERFLY_COLORS.length];
      else if (k.kind === 'moth') color = 0xd8d0c0;
      else if (k.kind === 'gull') color = 0xf0f0f0;
      else if (k.kind === 'firefly') {
        const on = Math.sin(time * 2.2 + k.phase * 5) > 0.1;
        if (!on) continue;
        color = COLORS.firefly;
        glow = true;
      } else if (v.sky.daylight < 0.3) color = 0x101018;
      Array.from(art).forEach((ch, i) => layer.put(col + i - (art.length >> 1), row, code(ch), color, null, glow));
    }
    for (const p of scene.particles) {
      const col = Math.round(p.col);
      const row = Math.round(p.row);
      if (row < 0 || row >= geo.rows) continue;
      layer.put(col, row, code(p.glyph), p.color, null, p.glow);
    }
  }

  private drawWeather(layer: Layer, v: View): void {
    const { geo, sky, time } = v;
    const w = sky.weather;
    if (w.kind === 'none') return;
    const snow = w.kind === 'snow';
    const speed = snow ? WEATHER.snowSpeed : WEATHER.rainSpeed;
    const span = geo.rows + 4;
    const glyph = snow ? 0 : code(sky.wind > 0.3 ? '\\' : sky.wind < -0.3 ? '/' : '|');
    // Drops catch what light there is, but never fade to nothing.
    const floor = (k: number): number => Math.max(0.55, k);
    const dropColor = lit(snow ? COLORS.snow : COLORS.rain, floor(sky.lightR), floor(sky.lightG), floor(sky.lightB));
    for (let c = 0; c < geo.cols; c++) {
      const count = w.precip * WEATHER.dropDensity * (span / 6);
      const whole = Math.floor(count) + ((hash2(c, 99, this.seed) % 1000) / 1000 < count % 1 ? 1 : 0);
      for (let k = 0; k < whole; k++) {
        const hs = hash2(c, k, this.seed ^ 0xd209);
        const y = ((time * speed * (0.8 + (hs % 40) / 100) + (hs % 997)) % span) - 2;
        const row = Math.floor(y);
        if (row < 0 || row >= geo.rows) continue;
        const col = Math.round(c + (snow ? Math.sin(time * 0.8 + (hs % 50)) * 1.2 : sky.wind * y * 0.4)) % geo.cols;
        const g = snow ? code((hs & 1) === 0 ? '*' : '·') : glyph;
        const i = row * geo.cols + (col < 0 ? col + geo.cols : col);
        layer.frame.glyph[i] = g;
        layer.frame.fg[i] = dropColor;
      }
    }
  }
}

function drawProp(layer: Layer, v: View, p: Prop, pal: Palette): void {
  const { geo } = v;
  const time = ambient(v.time);
  const foot = geo.footRow(p.z);
  const left = geo.left(p.x, p.sprite.w);
  const top = foot - p.sprite.h + 1;
  const frozen = (BIOMES[v.life.biome].cold || v.sky.season === 'winter') && v.life.biome !== 'shore' && v.life.biome !== 'desert';
  drawSprite(layer, p.sprite, left, top, pal, {
    flip: p.variant % 2 === 1 && p.kind !== 'home',
    animate: {
      W: (c, r) => (frozen ? code(c % 3 === 0 ? '-' : ' ') : code(Math.sin(c * 0.9 + r * 2 + time * 2.2) > 0.35 ? '≈' : '~')),
    },
  });
}

function drawCairn(layer: Layer, col: number, foot: number, stones: number): void {
  const levels = [3, 2, 2, 1, 1];
  let left = stones;
  for (let level = 0; level < levels.length && left > 0; level++) {
    const n = Math.min(levels[level], left);
    left -= n;
    for (let i = 0; i < n; i++) {
      const c = col - (n >> 1) + i;
      layer.put(c, foot - level, code(level === 0 ? 'O' : 'o'), 0xb0aca4, level === 0 ? 0x6a665e : null, false);
    }
  }
}

/** The creature, its lantern, what it holds and its sign. Returns the lantern's light. */
function drawCreature(layer: Layer, v: View, foot: number): Light[] {
  const { geo, body, time, life, sky } = v;
  const s = creatureSprite(body.pose, time);
  const col = geo.col(body.x);
  const top = foot - s.h + 1 - Math.round(body.lift);
  const cloak = life.cloak;
  const pal: Palette = {
    c: { fg: lighten(cloak, 0.45), bg: cloak, tint: 0.5 },
    C: { fg: lighten(cloak, 0.2), bg: cloak },
    f: { fg: v.eyeGlow, bg: COLORS.face },
  };
  drawSprite(layer, s, col - 3, top, pal, { flip: body.facing < 0, eyes: v.eyes, eyePaint: { fg: v.eyeGlow, bg: COLORS.face, glow: true } });
  const lights: Light[] = [];
  const front = body.facing;
  const handRow = body.pose === 'sit' || body.pose === 'eat' || body.pose === 'dig' || body.pose === 'sleep' ? top + 3 : top + 2;
  if (sky.daylight < 0.35 && body.pose !== 'sleep') {
    const lc = col + front * 3;
    const slow = ambient(time);
    const flicker = 1 + 0.06 * Math.sin(slow * 13) * Math.sin(slow * 7.3 + 1);
    layer.put(lc, handRow, code('¤'), COLORS.lantern, null, true);
    lights.push({ col: lc, row: handRow, radius: LANTERN_RADIUS, rgb: LANTERN_RGB, gain: LANTERN_GAIN * flicker * (1 - sky.daylight) });
  }
  if (body.holding !== null) {
    const hc = body.pose === 'eat' ? col + front * 2 : col - front * 3;
    layer.put(hc, body.pose === 'eat' ? top + 2 : handRow, code(body.holding.glyph), body.holding.color, null, body.holding.glyph === '*');
  }
  if (body.icon !== null) layer.put(col, top - 1, code(body.icon), COLORS.hudAccent, null, true);
  return lights;
}

/** Multiplies every non-glowing cell by the sunlight, plus warm light from lanterns and windows. */
function light(layer: Layer, v: View, lights: readonly Light[]): void {
  const { sky } = v;
  const f = layer.frame;
  const w = f.width;
  const flash = v.flash ? 1.4 : 0;
  for (let r = 0; r < layer.height; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      const glowFg = layer.glowFg[i] === 1;
      const glowBg = layer.glowBg[i] === 1;
      if (glowFg && glowBg) continue;
      let lr = sky.lightR + flash;
      let lg = sky.lightG + flash;
      let lb = sky.lightB + flash;
      for (const l of lights) {
        const dx = c - l.col;
        const dy = (r - l.row) * 2;
        const d = Math.sqrt(dx * dx + dy * dy) / l.radius;
        if (d >= 1) continue;
        const k = (1 - d) * (1 - d) * l.gain;
        lr += k * l.rgb[0];
        lg += k * l.rgb[1];
        lb += k * l.rgb[2];
      }
      if (!glowFg) f.fg[i] = lit(f.fg[i], lr, lg, lb);
      if (!glowBg) f.bg[i] = lit(f.bg[i], lr, lg, lb);
    }
  }
}

/** A speech bubble above its head (or its doorway), with a tail; a thought bubble while it waits for words. */
function drawBubble(layer: Layer, v: View): void {
  const { geo, body, bubble } = v;
  if (bubble === null || !body.visible) return;
  const f = layer.frame;
  let anchorCol: number;
  let anchorRow: number;
  if (body.inside) {
    const h = v.scene.layout.home;
    anchorCol = geo.col(h.x);
    anchorRow = geo.footRow(h.z) - h.sprite.h;
  } else {
    anchorCol = geo.col(body.x);
    anchorRow = geo.footRow(body.z) - 5 - Math.round(body.lift);
  }
  const think = bubble.kind === 'think';
  const lines = think ? ['…'] : wrap(bubble.text, Math.max(8, Math.min(34, geo.cols - 6)));
  const inner = Math.max(...lines.map((l) => Array.from(l).length));
  const width = inner + 4;
  const height = lines.length + 2;
  let left = anchorCol - (width >> 1) + (body.facing > 0 ? 2 : -2);
  left = Math.max(0, Math.min(geo.cols - width, left));
  let top = anchorRow - height + 1;
  if (top < 0) top = 0;
  const fg = think ? COLORS.thinkFg : COLORS.bubbleFg;
  const edge = COLORS.bubbleEdge;
  const bg = COLORS.bubbleBg;
  const put = (c: number, r: number, ch: string, color: number): void => {
    if (c < 0 || c >= f.width || r < 0 || r >= geo.rows) return;
    const i = r * f.width + c;
    f.glyph[i] = code(ch);
    f.fg[i] = color;
    f.bg[i] = bg;
  };
  const putOn = (c: number, r: number, ch: string, color: number): void => {
    if (c < 0 || c >= f.width || r < 0 || r >= geo.rows) return;
    const i = r * f.width + c;
    f.glyph[i] = code(ch);
    f.fg[i] = color;
  };
  const [tl, tr, bl, br, hz, vt] = think ? ['(', ')', '(', ')', ' ', ' '] : ['╭', '╮', '╰', '╯', '─', '│'];
  put(left, top, tl, edge);
  put(left + width - 1, top, tr, edge);
  put(left, top + height - 1, bl, edge);
  put(left + width - 1, top + height - 1, br, edge);
  for (let c = 1; c < width - 1; c++) {
    put(left + c, top, hz, edge);
    put(left + c, top + height - 1, hz, edge);
  }
  lines.forEach((line, i) => {
    const r = top + 1 + i;
    put(left, r, vt, edge);
    put(left + width - 1, r, vt, edge);
    put(left + 1, r, ' ', fg);
    const chars = Array.from(line);
    for (let c = 0; c < inner + 1; c++) put(left + 2 + c, r, chars[c] ?? ' ', fg);
  });
  // The tail points down at its head.
  const tailCol = Math.max(left + 1, Math.min(left + width - 2, anchorCol));
  if (think) {
    putOn(tailCol, top + height, 'o', COLORS.bubbleBg);
  } else {
    put(tailCol, top + height - 1, '┬', edge);
    putOn(tailCol, top + height, '╵', COLORS.bubbleBg);
  }
}

function drawSegments(frame: Frame, row: number, segments: readonly Segment[]): void {
  if (row < 0 || row >= frame.height) return;
  for (let c = 0; c < frame.width; c++) frame.set(c, row, SPACE, COLORS.hudFg, COLORS.hudBg);
  let col = 0;
  for (const s of segments) {
    const text = displayText(s.text);
    frame.text(col, row, text, s.color, COLORS.hudBg);
    col += Array.from(text).length;
  }
}

function drawJournal(frame: Frame, lines: readonly string[]): void {
  const width = Math.min(frame.width - 4, 76);
  const inner = width - 4;
  const wrapped = lines.flatMap((l) => (l === '' ? [''] : wrap(l, inner).map((x, i) => (i > 0 && l.startsWith('  ') ? `    ${x}` : x))));
  const height = Math.min(frame.height - 2, wrapped.length + 2);
  const left = (frame.width - width) >> 1;
  const top = Math.max(0, (frame.height - height) >> 1);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const edge = r === 0 || r === height - 1 || c === 0 || c === width - 1;
      let ch = ' ';
      if (edge) {
        if (r === 0) ch = c === 0 ? '╭' : c === width - 1 ? '╮' : '─';
        else if (r === height - 1) ch = c === 0 ? '╰' : c === width - 1 ? '╯' : '─';
        else ch = '│';
      }
      frame.set(left + c, top + r, code(ch), edge ? COLORS.hudDim : COLORS.hudFg, COLORS.hudBg);
    }
  }
  const visible = wrapped.slice(0, height - 2);
  visible.forEach((line, i) => {
    const heading = i === 0 || (line !== '' && !line.startsWith(' ') && wrapped[i - 1] === '');
    frame.text(left + 2, top + 1 + i, line, heading ? COLORS.hudAccent : COLORS.hudFg, COLORS.hudBg);
  });
}

function drawTooSmall(frame: Frame): void {
  for (let r = 0; r < frame.height; r++) {
    for (let c = 0; c < frame.width; c++) frame.set(c, r, SPACE, COLORS.hudFg, COLORS.hudBg);
  }
  const text = 'Make the window bigger'.slice(0, frame.width);
  frame.text((frame.width - text.length) >> 1, frame.height >> 1, text, COLORS.hudFg, COLORS.hudBg);
}
