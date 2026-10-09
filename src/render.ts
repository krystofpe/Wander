// Builds a frame: sky, ridge, ground, props and the creature by depth, weather, light, bubble, status bar, journal.
import type { BiomeName } from './config.ts';
import { AMBIENT_HZ, BIOMES, BLINK_EVERY_SEC, BLINK_SEC, COLORS, EYE_GLOW, LANTERN_GAIN, LANTERN_RADIUS, LANTERN_RGB, MIN_COLS, MIN_ROWS, WEATHER } from './config.ts';
import type { Canvas } from './art.ts';
import type { Body } from './brain.ts';
import { lit, mix, ramp, scale } from './color.ts';
import { Backdrop } from './backdrop.ts';
import type { Life } from './creature.ts';
import { FACE_ROW, FIGURE_ROWS, FIGURE_W, LANTERN_ON_GROUND, LANTERN_POSES, closed, figure, frameName, withEyes } from './figure.ts';
import { dither, drawColors, drawColorsAt } from './kit.ts';
import type { ColorSprite } from './kit.ts';
import { INK, aerial, art as art2, cycleStep, extent, grounded, mirrored, paintPixels, pixels } from './sprites.ts';
import { visitAt } from './visitor.ts';
import type { Inks, Pixels } from './sprites.ts';
import { SWAYS, TRUNKS, cairnArt, critterArt, foregroundArt, hasSign, inDoorway, itemArt, propArt, shelterEmbers, signArt, toyArt } from './scenery.ts';
import type { Look } from './scenery.ts';
import { surroundArt, surroundPerch } from './surround.ts';
import { nightOf, toPalette } from './palette.ts';
import { Frame } from './frame.ts';
import { hash2, makeNoise } from './noise.ts';
import type { Noise2D } from './noise.ts';
import { Geometry, forestFocus, frameCrop } from './scene.ts';
import type { Prop, Scene } from './scene.ts';
import { moonPosition, snows, sunPosition } from './sky.ts';
import type { Season, Sky } from './sky.ts';

export type Segment = { readonly text: string; readonly color: number };

/** Everything the renderer needs for one frame. */
export type View = {
  readonly geo: Geometry;
  /** Terminal pixels to a pixel of the art, each way: the scene is drawn at `geo`'s size and enlarged. */
  readonly scale?: number;
  readonly sky: Sky;
  readonly scene: Scene;
  readonly life: Life;
  readonly body: Body;
  /** The three face cells. */
  readonly eyes: string;
  readonly eyeGlow: number;
  /** Real seconds, for animation. */
  readonly time: number;
  /** The world's clock, in milliseconds: what comes and goes by it (the visitor). */
  readonly world?: number;
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
  /** Pixels (two to a cell) that keep their own colours, off the biome's palette: the creature's. */
  readonly own: Uint8Array;
  /** While true, what is painted is marked as the creature's own. */
  owning = false;

  constructor(frame: Frame, height: number) {
    this.frame = frame;
    this.width = frame.width;
    this.height = height;
    this.glowFg = new Uint8Array(frame.width * frame.height);
    this.glowBg = new Uint8Array(frame.width * frame.height);
    this.own = new Uint8Array(frame.width * frame.height * 2);
  }

  /** Maps every pixel of the scene onto the biome's palette, except the creature's own; `night` turns it towards its night colours. */
  toPalette(biome: BiomeName, night = 0): void {
    const f = this.frame;
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const i = row * this.width + col;
        const g = f.glyph[i];
        if (g !== SPACE && g !== UPPER) {
          // A glyph: only what is behind it.
          f.bg[i] = toPalette(biome, f.bg[i], this.glowBg[i] === 1, night);
          continue;
        }
        const t = g === UPPER ? f.fg[i] : f.bg[i];
        const b = f.bg[i];
        const gt = (g === UPPER ? this.glowFg[i] : this.glowBg[i]) === 1;
        const nt = this.own[i * 2] === 1 ? t : toPalette(biome, t, gt && glowsWarm(t), night);
        const nb = this.own[i * 2 + 1] === 1 ? b : toPalette(biome, b, this.glowBg[i] === 1 && glowsWarm(b), night);
        f.glyph[i] = nt === nb ? SPACE : UPPER;
        f.fg[i] = nt;
        f.bg[i] = nb;
      }
    }
  }

  put(col: number, row: number, glyph: number, fg: number | null, bg: number | null, glow: boolean): void {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return;
    const i = row * this.width + col;
    const f = this.frame;
    f.glyph[i] = glyph;
    if (fg !== null) f.fg[i] = fg;
    this.glowFg[i] = glow ? 1 : 0;
    if (bg !== null) {
      f.bg[i] = bg;
      this.glowBg[i] = glow ? 1 : 0;
    }
  }

  halves(col: number, row: number, top: number | null, bottom: number | null, glowTop: boolean, glowBottom: boolean): void {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return;
    const i = row * this.width + col;
    const f = this.frame;
    // What each half shows now: a half block's foreground fills its half; anything else shows the background.
    const g = f.glyph[i];
    const topIsFg = g === UPPER || g === FULL;
    const bottomIsFg = g === LOWER || g === FULL;
    const t = top ?? (topIsFg ? f.fg[i] : f.bg[i]);
    const b = bottom ?? (bottomIsFg ? f.fg[i] : f.bg[i]);
    const gt = top !== null ? glowTop : (topIsFg ? this.glowFg[i] : this.glowBg[i]) === 1;
    const gb = bottom !== null ? glowBottom : (bottomIsFg ? this.glowFg[i] : this.glowBg[i]) === 1;
    f.glyph[i] = t === b && gt === gb ? SPACE : UPPER;
    f.fg[i] = t;
    f.bg[i] = b;
    this.glowFg[i] = gt ? 1 : 0;
    this.glowBg[i] = gb ? 1 : 0;
    if (top !== null) this.own[i * 2] = this.owning ? 1 : 0;
    if (bottom !== null) this.own[i * 2 + 1] = this.owning ? 1 : 0;
  }

  /** Blends a cell's two pixels towards `color`, the upper by kTop and the lower by kBottom (0..1). */
  blend(col: number, row: number, color: number, kTop: number, kBottom: number): void {
    if (kTop <= 0 && kBottom <= 0) return;
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return;
    const i = row * this.width + col;
    const f = this.frame;
    const g = f.glyph[i];
    const topIsFg = g === UPPER || g === FULL;
    const bottomIsFg = g === LOWER || g === FULL;
    if (g !== SPACE && !topIsFg && !bottomIsFg) {
      // A glyph: tint what is behind it.
      f.bg[i] = mix(f.bg[i], color, Math.max(kTop, kBottom));
      return;
    }
    const t = topIsFg ? f.fg[i] : f.bg[i];
    const b = bottomIsFg ? f.fg[i] : f.bg[i];
    const gt = (topIsFg ? this.glowFg[i] : this.glowBg[i]) === 1;
    const gb = (bottomIsFg ? this.glowFg[i] : this.glowBg[i]) === 1;
    this.halves(col, row, mix(t, color, kTop), mix(b, color, kBottom), gt, gb);
  }

  /** Paints one pixel: x a column, y a pixel row (two to a cell). */
  dot(x: number, y: number, color: number, glow = false): void {
    if ((y & 1) === 0) this.halves(x, y >> 1, color, null, glow, false);
    else this.halves(x, y >> 1, null, color, false, glow);
  }

  /** Darkens a cell by k (0..1 of its colour kept), as a shadow falling on it; with `lower`, only its lower pixel. */
  shade(col: number, row: number, k: number, lower = false): void {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return;
    const i = row * this.width + col;
    const f = this.frame;
    if (!lower) f.fg[i] = scale(f.fg[i], k);
    else if (f.glyph[i] === SPACE) {
      // A cell of one colour becomes two pixels, so the lower one can darken alone.
      f.glyph[i] = UPPER;
      f.fg[i] = f.bg[i];
      this.glowFg[i] = this.glowBg[i];
    }
    f.bg[i] = scale(f.bg[i], k);
  }
}

const UPPER = code('▀');
const LOWER = code('▄');
const FULL = code('█');

type Light = { col: number; row: number; radius: number; rgb: readonly [number, number, number]; gain: number };

const BUTTERFLY_COLORS = [0xffd84a, 0xff9ad0, 0xffffff, 0xa0d8ff, 0xffa040];
/** The colours of the creatures that walk the ground: in the gloom they show as dark shapes against the growth. */
const WALKER_COLORS: Readonly<Partial<Record<string, number>>> = { frog: 0x6ac04a, hare: 0x1e2c34, deer: 0x24323c };

function lighten(rgb: number, k: number): number {
  return mix(rgb, 0xffffff, k);
}

export class Renderer {
  private readonly backdrop: Backdrop;
  private readonly seed: number;
  private readonly mistNoise: Noise2D;
  private mist: { key: string; field: Float32Array } = { key: '', field: new Float32Array(0) };

  constructor(seed: number) {
    this.seed = seed;
    this.backdrop = new Backdrop(seed);
    this.mistNoise = makeNoise(seed ^ 0x3157);
  }

  /** Fills every cell of `frame`. */
  render(frame: Frame, v: View): void {
    const hudRows = v.hud?.length ?? 0;
    if (frame.width < MIN_COLS || frame.height < MIN_ROWS) {
      drawTooSmall(frame);
      return;
    }
    const geo = v.geo;
    const s = v.scale ?? 1;
    const sceneRows = frame.height - hudRows;
    // On a big window the scene is drawn at its own size into a smaller frame, then enlarged into this one.
    const target = s === 1 ? frame : this.sceneFrame(geo.cols, geo.rows);
    const layer = new Layer(target, geo.rows);
    const home = v.scene.layout.home;
    const door = home.sprite.door;
    const path = door === undefined ? null : { x: geo.leftOf(home) + door.x + (door.w >> 1), y: geo.footRow(home.z) * 2 + 2, w: door.w };
    const visit = v.world === undefined ? null : visitAt(v.world, v.life.seed, v.life.biome, v.sky.daylight);
    this.backdrop.draw(layer, { geo, sky: v.sky, biome: v.life.biome, time: v.time, slow: ambient(v.time), flash: v.flash, path, landmark: landmarkColumn(v), visit, homeLeft: home.x < 0.5 });
    const lights = this.drawThings(layer, v);
    drawLife(layer, v);
    this.drawParticles(layer, v);
    this.drawMist(layer, v);
    // Under the canopy the great mushrooms in the corners stand in front of the trunks' roots.
    const under = BIOMES[v.life.biome].gloom !== undefined;
    if (!under) drawForeground(layer, v);
    drawSurround(layer, v);
    if (under) drawForeground(layer, v);
    drawCrow(layer, v);
    drawOwl(layer, v);
    drawWatchers(layer, v);
    light(layer, v, lights);
    this.drawRays(layer, v);
    layer.toPalette(v.life.biome, nightOf(v.sky.daylight));
    if (s === 1) this.drawWeather(layer, v);
    else {
      enlarge(target, frame, s, sceneRows);
      // Rain and snow fall at the window's own fineness, not in the art's big pixels.
      const fine = new Geometry(frame.width, sceneRows);
      this.drawWeather(new Layer(frame, sceneRows), { ...v, geo: fine });
    }
    if (v.bubble !== null) drawBubble(frame, v, s, sceneRows);
    for (let r = 0; r < hudRows; r++) drawSegments(frame, sceneRows + r, v.hud?.[r] ?? []);
    if (v.journal !== null) drawJournal(frame, v.journal);
  }

  private offscreen: Frame | null = null;

  /** The frame the scene is drawn into before it is enlarged, kept from one frame to the next. */
  private sceneFrame(cols: number, rows: number): Frame {
    if (this.offscreen === null || this.offscreen.width !== cols || this.offscreen.height !== rows) this.offscreen = new Frame(cols, rows);
    return this.offscreen;
  }

  /** Props, cairn, critters on the ground, food, the toy and the creature, back to front. Returns light sources. */
  private drawThings(layer: Layer, v: View): Light[] {
    const { geo, sky, scene, body, life } = v;
    const lights: Light[] = [];
    const night = sky.daylight < 0.35;
    const look = lookOf(v);
    const things: { row: number; draw: () => void }[] = [];
    for (const p of scene.layout.props) {
      things.push({ row: geo.footRow(p.z), draw: () => drawProp(layer, v, p, look) });
      // Glowing mushrooms light the ground and bark round them, a cold light, more at night; each cluster
      // breathes, slowly, in its own time.
      if (p.kind === 'glowshroom') {
        const breath = 0.8 + 0.2 * Math.sin(ambient(v.time) * 0.45 + p.x * 17);
        lights.push({ col: geo.col(p.x), row: geo.footRow(p.z) - 1, radius: 6 + p.sprite.w * 0.35, rgb: [0.3, 1, 0.95], gain: (night ? 0.6 : 0.22) * breath });
      }
    }
    // The great mushrooms in the corners light the roots and the floor at the front.
    if (BIOMES[life.biome].gloom !== undefined) {
      const homeSide = scene.layout.home.x < 0.5 ? -1 : 1;
      for (const side of [-1, 1]) {
        if (side === homeSide) continue;
        const heavy = geo.cols >= 100;
        const breath = 0.8 + 0.2 * Math.sin(ambient(v.time) * 0.4 + side * 2);
        lights.push({ col: side < 0 ? 8 : geo.cols - 9, row: geo.rows - 5, radius: heavy ? 16 : 10, rgb: [0.3, 1, 0.95], gain: (night ? 0.55 : 0.18) * breath });
      }
    }
    if (life.cairn > 0) {
      const foot = geo.footRow(scene.layout.cairn.z);
      const art = cairnArt(life.cairn, look.snowy);
      things.push({ row: foot, draw: () => drawColors(layer, art, geo.col(scene.layout.cairn.x) - (art.w >> 1), foot - art.h + 1) });
    }
    for (const k of scene.critters) {
      if (k.flies) continue;
      const foot = geo.footRow(k.z);
      things.push({
        row: foot,
        draw: () => {
          // Walkers step in bursts: the hare's legs move only as it hops; the deer stands grazing between its steps.
          const moving = k.kind === 'deer' ? Math.sin(k.t * 0.35 + k.phase) > 0.55 : Math.sin(k.t * 1.7 + k.phase) > 0.2;
          const frame = k.kind === 'deer' ? (moving ? 0 : 1) : moving ? Math.floor(k.t * 6) : 0;
          // Dark shapes in the gloom, the light catching along their backs and ears.
          const art = critterArt(k.kind, frame, WALKER_COLORS[k.kind] ?? 0xb0a060, k.kind === 'hare' || k.kind === 'deer' ? 0x7aa8b0 : undefined);
          drawColorsAt(layer, art, geo.col(k.x) - (art.w >> 1), (foot - art.h + 1) * 2, k.vx < 0);
        },
      });
    }
    for (const f of scene.foods) {
      const foot = geo.footRow(f.z);
      const art = itemArt(f.kind.glyph, f.kind.color);
      things.push({ row: foot, draw: () => drawColorsAt(layer, art, geo.col(f.x) - (art.w >> 1), Math.round((foot + 1 - f.h) * 2) - art.h * 2) });
    }
    const toy = scene.toy;
    if (toy !== null) {
      const foot = geo.footRow(toy.z);
      const fade = toy.age > 40 ? (45 - toy.age) / 5 : 1;
      things.push({
        row: foot,
        draw: () => {
          const art = toyArt(mix(0x203040, COLORS.toy, fade));
          const y = Math.round((foot + 1 - toy.h) * 2) - art.h * 2;
          drawColorsAt(layer, art, geo.col(toy.x) - (art.w >> 1), y);
          lights.push({ col: geo.col(toy.x), row: (y >> 1) + 1, radius: 7, rgb: [0.5, 0.9, 1], gain: 0.6 * fade });
        },
      });
    }
    if (body.visible && !body.inside) {
      const foot = geo.footRow(body.z);
      things.push({ row: foot + 0.5, draw: () => lights.push(...drawCreature(layer, v, foot)) });
    }
    // Under the canopy, veils of misty light hang between the depths: whatever stands behind each one is a
    // little hazier, most of all round the glow. Each is drawn just before the things standing at its depth.
    if (BIOMES[life.biome].gloom !== undefined) {
      for (const z of VEILS) things.push({ row: geo.footRow(z) - 0.25, draw: () => drawVeil(layer, v, z) });
    }
    things.sort((a, b) => a.row - b.row);
    for (const t of things) t.draw();

    // Its eyes in the dark doorway, while it is inside.
    if (body.visible && body.inside) {
      const h = scene.layout.home;
      const door = h.sprite.door ?? { col: h.sprite.w >> 1, row: h.sprite.h - 3 };
      const col = geo.leftOf(h) + door.col;
      const row = geo.footRow(h.z) - h.sprite.h + 1 + door.row;
      // Two eyes, two pixels wide: open they are two pixels tall, shut only their lower lids show.
      const open = closed(v.eyes) ? null : v.eyeGlow;
      for (const c of [col - 1, col, col + 2, col + 3]) layer.halves(c, row, open, v.eyeGlow, open !== null, true);
    }
    if (night) {
      // The embers in front of its shelter: a small warm light that will not keep still.
      const h = scene.layout.home;
      const ember = h.sprite.smoke;
      if (ember !== undefined) {
        const slow = ambient(v.time);
        const flicker = 0.85 + 0.15 * Math.sin(slow * 9.1) * Math.sin(slow * 5.3 + 2);
        // The embers themselves, warm: like its own eyes and lantern, the only warmth in the gloom.
        const hx = geo.leftOf(h);
        const hy = (geo.footRow(h.z) - h.sprite.h + 1) * 2;
        layer.owning = true;
        for (const e of shelterEmbers(v.life.biome, h.variant)) {
          const hot = e.hot !== (Math.floor(slow * 3 + e.x) % 4 === 0);
          layer.dot(hx + e.x, hy + e.y, hot ? 0xffc870 : 0xd8643a, true);
        }
        layer.owning = false;
        lights.push({ col: geo.leftOf(h) + ember.x, row: geo.footRow(h.z) - h.sprite.h + 1 + (ember.y >> 1), radius: 9, rgb: LANTERN_RGB, gain: 0.55 * flicker });
      }
    }
    return lights;
  }

  private drawParticles(layer: Layer, v: View): void {
    const { geo, scene, time } = v;
    for (const k of scene.critters) {
      if (!k.flies) continue;
      const y = Math.round(k.y * geo.rows * 2);
      if (y >= geo.rows * 2) continue;
      let color = 0x2a2a30;
      if (k.kind === 'butterfly') color = BUTTERFLY_COLORS[Math.floor(k.phase * 10) % BUTTERFLY_COLORS.length];
      else if (k.kind === 'moth') color = 0xd8d0c0;
      else if (k.kind === 'firefly') {
        if (Math.sin(time * 2.2 + k.phase * 5) <= 0.1) continue;
        // The nearer, the bigger: a pinpoint far off, a spark with arms of light close by.
        const x = geo.col(k.x);
        const near = k.z > 0.7 ? 2 : k.z > 0.45 ? 1 : 0;
        layer.dot(x, y, lighten(COLORS.firefly, near > 0 ? 0.5 : 0), true);
        if (near >= 1) layer.dot(x + 1, y, COLORS.firefly, true);
        if (near >= 2) for (const [dx, dy] of [[-1, 0], [0, -1], [0, 1], [2, 0]]) layer.dot(x + dx, y + dy, mix(COLORS.firefly, 0x2698a5, 0.4), true);
        continue;
      } else if (v.sky.daylight < 0.3) color = 0x101018;
      if (k.kind === 'bat') color = 0x161424;
      const art = critterArt(k.kind, Math.floor(k.t * (k.kind === 'bird' ? 4 : k.kind === 'bat' ? 9 : 6)), color);
      drawColorsAt(layer, art, geo.col(k.x) - (art.w >> 1), y - art.h, k.vx < 0);
    }
    for (const p of scene.particles) {
      const col = Math.round(p.col);
      const y = Math.round(p.row * 2);
      if (y < 0 || y >= geo.rows * 2) continue;
      // Sparks and dirt are pixels; hearts, notes and sleep are pixel signs.
      if (p.glyph === '*') for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) layer.dot(col + dx, y + dy, dx === 0 && dy === 0 ? lighten(p.color, 0.5) : p.color, p.glow);
      else if (hasSign(p.glyph)) {
        const art = signArt(p.glyph, p.color);
        layer.owning = true;
        drawColorsAt(layer, art, col - (art.w >> 1), y - art.h);
        layer.owning = false;
      } else layer.dot(col, y, p.color, p.glow);
    }
  }

  /**
   * Mist: in the morning, always in the swamp, and after rain. It lies along the horizon and round the
   * feet of things, drifting.
   */
  private drawMist(layer: Layer, v: View): void {
    const { geo, sky } = v;
    const k = mistOf(v.life.biome, sky);
    if (k < 0.03) return;
    const W = geo.cols;
    const y0 = Math.max(0, geo.horizon * 2 - 4);
    const y1 = Math.min(geo.rows * 2, geo.horizon * 2 + Math.round((geo.rows - geo.horizon) * 0.8));
    const drift = Math.floor(v.time * 2) / 2;
    const key = `${W}:${y0}:${y1}:${drift}`;
    if (this.mist.key !== key) {
      const field = new Float32Array(W * (y1 - y0));
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < W; x++) field[(y - y0) * W + x] = 0.55 + 0.45 * this.mistNoise(x / 24 - drift * 0.04, y / 4);
      }
      this.mist = { key, field };
    }
    const gloom = BIOMES[v.life.biome].gloom !== undefined;
    const focus = W * forestFocus(v.scene.layout.home.x < 0.5);
    const color = gloom ? mix(0x9ad8d4, sky.horizon, 0.45) : mix(0xe4eaf0, sky.horizon, 0.35);
    const mid = geo.horizon * 2 + 2;
    for (let r = y0 >> 1; r < (y1 + 1) >> 1; r++) {
      const amount = (y: number, x: number): number => {
        if (y < y0 || y >= y1) return 0;
        // Thickest just below the horizon, thinning above and towards the front.
        const band = y < mid ? (y - y0) / Math.max(1, mid - y0) : 1 - (y - mid) / Math.max(1, y1 - mid);
        // Under the canopy the mist gathers towards the glow in the middle.
        const centre = gloom ? 0.5 + 0.7 * Math.max(0, 1 - Math.abs(x + 0.5 - focus) / (W * 0.45)) : 1;
        // In smooth steps of a tenth: mist has no edges, so no dither either.
        return Math.round(k * band * band * centre * this.mist.field[(y - y0) * W + x] * 10) / 10;
      };
      for (let c = 0; c < W; c++) layer.blend(c, r, color, amount(2 * r, c), amount(2 * r + 1, c));
    }
  }

  /** Beams of light from a low sun, fanning across the scene. */
  private drawRays(layer: Layer, v: View): void {
    const { geo, sky } = v;
    const sun = sunPosition(sky.hour);
    if (sun === null || sun.y > 0.45 || sky.weather.precip > 0.15 || sky.weather.cloud > 0.75 || BIOMES[v.life.biome].gloom !== undefined) return;
    const strength = (1 - sun.y / 0.45) * (1 - sky.weather.cloud) * 0.5;
    const W = geo.cols;
    const H = geo.horizon * 2;
    const cx = sun.x * (W - 1);
    const cy = (1 - sun.y) * Math.max(4, H - 10) + 5;
    const warm = mix(COLORS.sun, 0xff9040, 0.5);
    for (let r = 0; r < geo.rows; r++) {
      const amount = (y: number, x: number): number => {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const beam = Math.sin(Math.atan2(dy, dx) * 15 + (this.seed % 7));
        if (beam < 0.6) return 0;
        const a = strength * Math.exp(-Math.sqrt(dx * dx + dy * dy) / 70) * (beam > 0.85 ? 0.3 : 0.16);
        return Math.floor(a * 6 + dither(x, y)) / 6;
      };
      for (let c = 0; c < W; c++) layer.blend(c, r, warm, amount(2 * r, c), amount(2 * r + 1, c));
    }
  }

  private drawWeather(layer: Layer, v: View): void {
    const { geo, sky, time } = v;
    const w = sky.weather;
    if (w.kind === 'none') return;
    const snow = w.kind === 'snow';
    const speed = snow ? WEATHER.snowSpeed : WEATHER.rainSpeed;
    const span = geo.rows + 4;
    // Drops catch what light there is, but never fade to nothing.
    const floor = (k: number): number => Math.max(0.55, k);
    // Under the canopy the leaves catch most of it: fewer drops get through, dimmer, tinted by the glow.
    const under = BIOMES[v.life.biome].gloom !== undefined;
    const bright = lit(snow ? COLORS.snow : COLORS.rain, floor(sky.lightR), floor(sky.lightG), floor(sky.lightB));
    const dropColor = under ? mix(bright, 0x2698a5, 0.45) : bright;
    const trail = mix(dropColor, 0x000000, under ? 0.55 : 0.35);
    for (let c = 0; c < geo.cols; c++) {
      const count = w.precip * WEATHER.dropDensity * (span / 6) * (under ? 0.4 : 1);
      const whole = Math.floor(count) + ((hash2(c, 99, this.seed) % 1000) / 1000 < count % 1 ? 1 : 0);
      for (let k = 0; k < whole; k++) {
        const hs = hash2(c, k, this.seed ^ 0xd209);
        const y = ((time * speed * (0.8 + (hs % 40) / 100) + (hs % 997)) % span) - 2;
        const row = Math.floor(y);
        if (row < 0 || row >= geo.rows) continue;
        const col = (Math.round(c + (snow ? Math.sin(time * 0.8 + (hs % 50)) * 1.2 : sky.wind * y * 0.4)) % geo.cols + geo.cols) % geo.cols;
        // A raindrop is one cell: a dim tail over its bright head. A snowflake is one pixel, or two side by side.
        if (!snow) layer.halves(col, row, trail, dropColor, false, false);
        else {
          layer.dot(col, row * 2 + (hs & 1), dropColor);
          if ((hs & 6) === 0) layer.dot(col + 1, row * 2 + (hs & 1), dropColor);
        }
      }
    }
  }
}

/** How props look now: snowy, frozen, lit windows and the water's shimmer. */
function lookOf(v: View): Look {
  const snowy = snows(v.life.biome, v.sky.season);
  return { biome: v.life.biome, season: v.sky.season, snowy, frozen: snowy, night: v.sky.daylight < 0.35, frame: Math.floor(ambient(v.time) * 2), sky: lit(v.sky.horizon, 1, 1, 1), sway: 0, cycle: cycleStep(v.time) };
}

/** The light the water shows: the low sun's warm glow, the moon's peach one, or by day a white glint. */
function skyLight(v: View): { x: number; color: number } | null {
  const { sky, geo } = v;
  const sun = sunPosition(sky.hour);
  if (sun !== null && sky.weather.precip < 0.2) return { x: sun.x * (geo.cols - 1), color: mix(0xfff6e0, 0xffa060, 1 - Math.min(1, sun.y * 2.2)) };
  const moon = moonPosition(sky.hour);
  if (moon !== null && sky.daylight < 0.6 && sky.weather.cloud < 0.8) return { x: moon.x * (geo.cols - 1), color: 0xf6d2b0 };
  return null;
}

/** Where along the horizon the landmark stands: the stretch that the home and the tall props hide least. */
function landmarkColumn(v: View): number {
  const { geo } = v;
  const spans = v.scene.layout.props
    .filter((p) => p.kind === 'home' || p.sprite.h >= 12)
    .map((p) => ({ from: geo.left(p.x, p.sprite.w), to: geo.left(p.x, p.sprite.w) + p.sprite.w, weight: p.kind === 'home' ? 4 : 1 }));
  let best = Math.round(geo.cols / 2);
  let least = Infinity;
  for (const share of [0.2, 0.32, 0.44, 0.56, 0.68, 0.8]) {
    const c = Math.round(geo.cols * share);
    const hidden = spans.reduce((sum, s) => sum + s.weight * Math.max(0, Math.min(c + 12, s.to) - Math.max(c - 12, s.from)), 0);
    if (hidden < least) {
      least = hidden;
      best = c;
    }
  }
  return best;
}

/** Smoke from its embers, leaves falling in autumn, rings on the pond, dust drifting in the still air. */
function drawLife(layer: Layer, v: View): void {
  const { geo, sky, time } = v;
  const layout = v.scene.layout;
  const W = geo.cols;
  const wind = sky.wind;
  const disc = (cx: number, cy: number, r: number, color: number, k: number): void => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
        if ((y & 1) === 0) layer.blend(x, y >> 1, color, k, 0);
        else layer.blend(x, y >> 1, color, 0, k);
      }
    }
  };

  // Smoke from the embers: in the morning and evening, at night and in the cold; it rises thin, grows and fades.
  const home = layout.home;
  const ember = home.sprite.smoke;
  if (ember !== undefined && (sky.hour < 9.5 || sky.hour > 16.5 || snows(v.life.biome, sky.season))) {
    const x0 = geo.leftOf(home) + ember.x + 1;
    const y0 = (geo.footRow(home.z) - home.sprite.h + 1) * 2 + ember.y;
    const smoke = mix(0xdcdfe4, sky.horizon, 0.25);
    for (let k = 0; k < 7; k++) {
      const age = (time * 0.16 + k / 7) % 1;
      const x = x0 + age * (3 + wind * 12) + Math.sin(age * 7 + k) * 1.5;
      disc(x, y0 - age * 30, 1 + age * 3.2, smoke, Math.round((1 - age) * 0.7 * 10) / 10);
    }
  }

  // Leaves falling from the trees in autumn, drifting with the wind.
  if (sky.season === 'autumn' && (v.life.biome === 'meadow' || v.life.biome === 'forest')) {
    for (const p of layout.props) {
      if (p.kind !== 'tree') continue;
      const left = geo.left(p.x, p.sprite.w);
      const top = (geo.footRow(p.z) - p.sprite.h + 1) * 2;
      const foot = geo.footRow(p.z) * 2 + 1;
      for (let k = 0; k < 3; k++) {
        const hs = hash2(Math.round(p.x * 1000), k, 77);
        const age = (time / (5 + (hs % 4)) + (hs % 100) / 100) % 1;
        const x = left + 4 + (hs % Math.max(1, p.sprite.w - 8)) + Math.sin(age * 9 + k) * 2 + wind * age * 8;
        const y = top + 6 + age * (foot - top - 6);
        layer.dot(Math.round(x), Math.round(y), [0xe0962e, 0xc8501e, 0xe8c040][k]);
      }
    }
  }

  // The light on the water: short shimmering streaks, thickest under the sun or the moon, in its colour.
  const pond = layout.water;
  if (pond !== null && !snows(v.life.biome, sky.season)) {
    const glow = skyLight(v);
    const left = geo.left(pond.x, pond.sprite.w);
    const top = (geo.footRow(pond.z) - pond.sprite.h + 1) * 2;
    const w = pond.sprite.w;
    const h = pond.sprite.h * 2;
    const step = Math.floor(time * 2.5);
    for (let y = 3; y < h - 2; y++) {
      for (let x = 3; x < w - 3; x++) {
        // Inside the water's oval.
        if (((x + 0.5 - w / 2) / (w / 2 - 2.5)) ** 2 + ((y + 0.5 - h / 2) / (h / 2 - 1.8)) ** 2 > 1) continue;
        const near = glow === null ? 0.3 : Math.max(0.15, 1 - Math.abs(left + x - glow.x) / (w * 0.6));
        const hs = hash2(Math.floor((x + step * (y % 2 === 0 ? 1 : -1)) / 3), y, 41);
        if (hs % 100 >= near * 38) continue;
        const color = glow === null ? 0xe8f0ff : glow.color;
        const py = top + y;
        if ((py & 1) === 0) layer.blend(left + x, py >> 1, color, glow === null ? 0.35 : 0.6, 0);
        else layer.blend(left + x, py >> 1, color, 0, glow === null ? 0.35 : 0.6);
      }
    }
  }

  // A ring spreading on the pond now and then, as if something touched it.
  const water = layout.water;
  if (water !== null && !snows(v.life.biome, sky.season)) {
    const cycle = Math.floor(time / 3.2);
    const age = time / 3.2 - cycle;
    const hs = hash2(cycle, 5, 31);
    const left = geo.left(water.x, water.sprite.w);
    const cy = (geo.footRow(water.z) - water.sprite.h + 1) * 2 + 4 + (hs % 3);
    const cx = left + 8 + (hs % Math.max(1, water.sprite.w - 16));
    const rx = 1 + age * 5;
    const k = Math.round((1 - age) * 0.5 * 10) / 10;
    for (let a = 0; a < 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      const y = Math.round(cy + Math.sin(t) * rx * 0.35);
      const x = Math.round(cx + Math.cos(t) * rx);
      if ((y & 1) === 0) layer.blend(x, y >> 1, 0xffffff, k, 0);
      else layer.blend(x, y >> 1, 0xffffff, 0, k);
    }
  }

  // Sparks from the embers at night, rising and going out.
  if (ember !== undefined && sky.daylight < 0.35) {
    const x0 = geo.leftOf(home) + ember.x + 1;
    const y0 = (geo.footRow(home.z) - home.sprite.h + 1) * 2 + ember.y;
    for (let k = 0; k < 3; k++) {
      const cycle = Math.floor(time * 0.45 + k * 0.37);
      if (hash2(cycle, k, 61) % 3 !== 0) continue;
      const age = (time * 0.45 + k * 0.37) % 1;
      const x = Math.round(x0 + Math.sin(age * 6 + k) * 1.5 + wind * age * 4);
      const y = Math.round(y0 - 1 - age * 13);
      layer.dot(x, y, age < 0.6 ? 0xffb060 : 0x8a4a30, age < 0.6);
    }
  }

  // Its breath, in the cold: a small puff before its face that drifts and thins.
  const body = v.body;
  if (snows(v.life.biome, sky.season) && body.visible && !body.inside && body.doorway === 0 && body.pose !== 'sleep') {
    const age = (time / 4.5) % 1;
    if (age < 0.45) {
      const col = geo.col(body.x);
      const top = (geo.footRow(body.z) - FIGURE_ROWS + 1 - Math.round(body.lift)) * 2;
      const face = body.facing < 0 ? -1 : 1;
      const x = col + face * (FIGURE_W / 2 - 1) + face * age * 10;
      const y = top + FACE_ROW * 2 + 2 - age * 5;
      // Grey-blue, so it shows on snow as well as on the dark.
      const k = Math.round((1 - age / 0.45) * 0.6 * 10) / 10;
      const size = age < 0.15 ? 0 : 1;
      for (let dy = -size; dy <= size; dy++) {
        for (let dx = -size; dx <= size; dx++) {
          if (size === 1 && Math.abs(dx) === 1 && Math.abs(dy) === 1) continue;
          const px = Math.round(x + dx);
          const py = Math.round(y + dy);
          if ((py & 1) === 0) layer.blend(px, py >> 1, 0x9aa8b4, k, 0);
          else layer.blend(px, py >> 1, 0x9aa8b4, 0, k);
        }
      }
    }
  }

  // After rain, drops fall from the branches above and splash on the ground.
  if (sky.wet > 0.1 && sky.weather.precip < 0.05) {
    const H = geo.rows * 2;
    const ground = geo.horizon * 2 + 4;
    for (let k = 0; k < 7; k++) {
      const hs = hash2(k, 1, 311);
      const period = 1.6 + (hs % 7) * 0.45;
      const phase = (hs % 100) / 100;
      const n = Math.floor(time / period + phase);
      if (hash2(k, n, 313) % 1000 >= sky.wet * 700) continue;
      const age = (time / period + phase) % 1;
      const x = Math.round(((hs >>> 8) % 40) / 40 < 0.5 ? ((hs >>> 16) % Math.round(W * 0.22)) : W - 1 - ((hs >>> 16) % Math.round(W * 0.22)));
      const y0 = 2 + ((hs >>> 4) % Math.max(1, Math.round(geo.horizon * 0.5)));
      const yEnd = ground + ((hs >>> 20) % Math.max(1, H - ground - 2));
      const y = Math.round(y0 + age * age * (yEnd - y0));
      if (age < 0.94) layer.dot(x, y, 0xb8c8d8);
      else for (const dx of [-1, 1]) layer.dot(x + dx, yEnd - 1, 0xd0dce4);
    }
  }

  // Motes of dust or ash, drifting slowly in the still air.
  if (sky.daylight > 0.3 && sky.weather.precip < 0.1) {
    const H = geo.rows * 2;
    const h0 = geo.horizon * 2;
    for (let k = 0; k < 6; k++) {
      const hs = hash2(k, 3, 911);
      const x = ((hs % W) + time * (0.6 + wind * 3) + Math.sin(time * 0.4 + k) * 3 + W * 10) % W;
      const y = h0 - 10 + ((hs >>> 8) % Math.max(1, H - h0)) + Math.sin(time * 0.5 + k * 2) * 4;
      if (Math.sin(time * 1.2 + k) > -0.2) layer.dot(Math.round(x), Math.round(y), 0xb8bcc0);
    }
  }
}

/** What the frame is drawn with just now: the big trunk away from the home, a sway in the wind. */
function surroundArgs(v: View): [BiomeName, Season, boolean, number, number, number, number, number, -1 | 1] {
  const { geo, sky } = v;
  // The big trunk stands away from its home, so the home stays in view; under the canopy it lives in the
  // great tree, so the big trunk is on its side.
  const homeLeft = v.scene.layout.home.x < 0.5;
  const side: -1 | 1 = BIOMES[v.life.biome].gloom !== undefined ? (homeLeft ? -1 : 1) : homeLeft ? 1 : -1;
  const sway = Math.abs(sky.wind) > 0.2 ? Math.floor(ambient(v.time) * (0.6 + Math.abs(sky.wind))) % 2 : 0;
  return [v.life.biome, sky.season, snows(v.life.biome, sky.season), geo.cols, geo.rows * 2, geo.horizon * 2, v.life.seed, sway, side];
}

/** Bare branches, trunks, boughs or moss framing the scene from just in front of the glass. */
function drawSurround(layer: Layer, v: View): void {
  drawColors(layer, surroundArt(...surroundArgs(v)), 0, 0);
}

/**
 * An owl on the great bough of its tree, by night (art/owl.aseprite): there most of the night, now and then
 * away; it blinks, and turns its head to look at something below.
 */
function drawOwl(layer: Layer, v: View): void {
  const { geo, sky, time } = v;
  if (BIOMES[v.life.biome].gloom === undefined || sky.daylight > 0.3) return;
  if (hash2(Math.floor(time / 600), 3, v.life.seed ^ 0x0e1) % 3 === 0) return;
  const blink = time % 4.3 < 0.18;
  const turned = time % 23 > 17;
  const art = art2('owl', blink ? 'blink' : turned ? 'turn' : 'owl');
  const homeLeft = v.scene.layout.home.x < 0.5;
  // On the top of the great bough of the canopy piece (art/forest-frame canopy-big), above column 47.
  const crop = frameCrop(geo.cols, true);
  const x0 = homeLeft ? 46 - crop : geo.cols - 1 + crop - 46 - (art.w - 1);
  drawColorsAt(layer, art, x0, 11, !homeLeft);
}

/** Eyes in the dark of the canopy: a violet pair opens now and then, watches a while, blinks, and is gone. */
function drawWatchers(layer: Layer, v: View): void {
  const { geo, time } = v;
  if (BIOMES[v.life.biome].gloom === undefined) return;
  const W = geo.cols;
  for (let k = 0; k < 2; k++) {
    const period = 41 + k * 17;
    const t = (time + k * 23) / period;
    const cycle = Math.floor(t);
    const hs = hash2(cycle, k, v.life.seed ^ 0x4e5);
    if (hs % 3 === 0) continue;
    const age = t - cycle;
    if (age < 0.1 || age > 0.42) continue;
    const blink = age > 0.25 && age < 0.27;
    // Somewhere in the dark of the canopy, in one of the upper corners.
    const x = ((hs >>> 8) % Math.round(W * 0.28)) + (hs & 1 ? Math.round(W * 0.7) : 2);
    const y = 3 + ((hs >>> 16) % Math.max(1, Math.round(geo.horizon * 2 * 0.3)));
    if (blink) continue;
    for (const dx of [0, 1, 4, 5]) layer.dot(x + dx, y, 0xa860f0, true);
  }
}

/** A crow that comes to sit on the end of the frame's topmost branch for a while by day, then flies off. */
function drawCrow(layer: Layer, v: View): void {
  const { sky, time, geo } = v;
  if (sky.daylight <= 0.25 || sky.weather.precip >= 0.3) return;
  const t = time % 240;
  if (t >= 53) return;
  const args = surroundArgs(v);
  const perch = surroundPerch(...args);
  if (perch === null) return;
  const side = args[8];
  const x0 = perch.x - (side < 0 ? 2 : 1);
  const y0 = perch.y - 4;
  if (t < 50) {
    // Hunched, a flick of the tail now and then; a grey sheen along its back.
    const tail = Math.floor(time * 1.5) % 5 === 0 ? 1 : 0;
    const rows = side < 0 ? ['.bb.', 'aaa.', '.a.a', '..a.'] : ['.bb.', '.aaa', 'a.a.', '.a..'];
    rows.forEach((row, r) => Array.from(row).forEach((ch, c) => ch !== '.' && layer.dot(x0 + c, y0 + r - (r === 2 ? tail : 0), ch === 'b' ? 0x4a5058 : 0x1c2026)));
  } else {
    const k = (t - 50) / 3;
    const art = critterArt('bird', Math.floor(time * 5), 0x1c2026);
    drawColorsAt(layer, art, Math.round(x0 + side * k * geo.cols * 0.3), Math.round(y0 - k * 14), side > 0);
  }
}

/** Grass, ferns, reeds or rocks in the bottom corners, right in front of the glass. */
function drawForeground(layer: Layer, v: View): void {
  const { geo, sky } = v;
  const frame = Math.floor(ambient(v.time) * (0.8 + Math.abs(sky.wind) * 1.5));
  const snowy = snows(v.life.biome, sky.season);
  const homeSide: -1 | 1 = v.scene.layout.home.x < 0.5 ? -1 : 1;
  const under = BIOMES[v.life.biome].gloom !== undefined;
  // Under the canopy, the nearest growth: dark fronds right in front of the glass along the bottom, between
  // its hollow and the far corner (art/forest-near.aseprite). They stand in front of everything, even it.
  if (under) {
    for (const [share, frame] of [[0.3, 'fronds-a'], [0.74, 'fronds-b']] as const) {
      const art = art2('forest-near', frame, {}, '', homeSide > 0, true);
      const x = homeSide < 0 ? share : 1 - share;
      drawColorsAt(layer, art, Math.round(x * (geo.cols - 1)) - (art.w >> 1), geo.rows * 2 - art.h * 2, false);
    }
  }
  for (const side of [-1, 1] as const) {
    // Under the canopy its home is in the corner on its side: the great mushrooms grow only in the other.
    if (under && side === homeSide) continue;
    // The heavy growth is on the side away from its shelter, so the shelter stays in view.
    // On a narrow window both corners are light and stand partly outside it, so the scene still shows.
    const narrow = Math.max(0, Math.round((100 - geo.cols) / 3));
    // Each corner glints a step apart from the other.
    const art = foregroundArt(v.life.biome, side, sky.season, snowy, frame + (side > 0 ? 1 : 0), side !== homeSide && narrow === 0, (cycleStep(v.time) + (side > 0 ? 2 : 0)) % 4);
    const col = side < 0 ? -2 - narrow : geo.cols - art.w + 2 + narrow;
    drawColorsAt(layer, art, col, (geo.rows - art.h) * 2, side > 0);
  }
}


/** How thick the mist is: always a little, more in the early morning, in the swamp and after rain; wind thins it. */
function mistOf(biome: BiomeName, sky: Sky): number {
  const h = sky.hour;
  const morning = h > 4 && h < 10 ? Math.sin(((h - 4) / 6) * Math.PI) * 0.55 : 0;
  const swamp = biome === 'swamp' ? 0.4 + (1 - sky.daylight) * 0.2 : 0;
  const wet = sky.weather.precip * 0.25;
  // A thin mist always lingers; it gathers in the morning, in the swamp and after rain, and never lifts under the canopy.
  const base = BIOMES[biome].gloom?.mist ?? 0.22;
  return Math.min(0.85, (base + morning + swamp + wet) * (1 - Math.abs(sky.wind) * 0.4));
}

/** How many columns a shadow at `col` falls away from the sun: further the lower the sun; none at night. */
function shadowLean(v: View, col: number): number {
  const sun = sunPosition(v.sky.hour);
  if (sun === null || v.sky.weather.cloud > 0.7) return 0;
  const away = col - sun.x * (v.geo.cols - 1);
  return Math.round(Math.max(-6, Math.min(6, away * 0.12 * (1.2 - sun.y))));
}

/** Props that stand up off the ground cast a shadow at their foot. */
const FLAT: ReadonlySet<string> = new Set(['pond', 'snowdrift']);

/** The depths at which veils of mist hang between the things in the forest. */
const VEILS: readonly number[] = [0.18, 0.4, 0.62];

/** How thick each veil is, cell by cell, for a window: worked out once for its size and its glow. */
const veils = new Map<string, Float32Array>();

/**
 * A veil of the glow's misty light over everything drawn so far that stands behind depth `z`: in the glow's
 * own colour, thicker round it and low down where the mist lies, thinning towards the dark sides and up
 * into the canopy, and fading out just above the ground at its depth so it has no edge.
 */
function drawVeil(layer: Layer, v: View, z: number): void {
  const { geo } = v;
  const W = geo.cols;
  const foot = geo.footRow(z);
  const homeLeft = v.scene.layout.home.x < 0.5;
  const id = `${W}:${geo.rows}:${z}:${homeLeft}`;
  let k = veils.get(id);
  if (k === undefined) {
    k = new Float32Array((foot + 1) * W);
    const focus = W * forestFocus(homeLeft);
    for (let r = 0; r <= foot; r++) {
      const up = Math.max(0, Math.min(1, 1 - (foot - r) / Math.max(1, geo.horizon * 1.4)));
      const low = Math.min(1, (foot - r + 0.5) / 2.5);
      for (let c = 0; c < W; c++) {
        const near = Math.exp(-(((c + 0.5 - focus) / (W * 0.32)) ** 2));
        k[r * W + c] = Math.round(0.18 * (0.25 + 0.75 * near) * (0.35 + 0.65 * up) * low * 20) / 20;
      }
    }
    if (veils.size > 16) veils.clear();
    veils.set(id, k);
  }
  const haze = 0x2698a5;
  for (let r = 0; r <= foot; r++) {
    for (let c = 0; c < W; c++) {
      const a = k[r * W + c];
      if (a > 0) layer.blend(c, r, haze, a, a);
    }
  }
}

/**
 * A trunk standing at its depth and rising out of sight into the canopy (art/forest-trunk.aseprite): its
 * roots on the ground, its bark repeated up from them to the top of the window. Thin and pale in the haze
 * far off, wide and dark near; lit on the side that faces the glow.
 */
const trunks = new Map<string, ColorSprite>();

function trunkArt(v: View, p: Prop, footPx: number): { art: ColorSprite; dx: number } {
  const cls = TRUNKS[p.variant % 3];
  // Six steps of haze from the back to the front: the farthest all but dissolve into the light.
  const shade = p.z < 0.12 ? 4 : p.z < 0.24 ? 3 : p.z < 0.38 ? 2 : p.z < 0.52 ? 1 : p.z < 0.7 ? 0 : -1;
  const turned = p.x > forestFocus(v.scene.layout.home.x < 0.5);
  const roots = grounded(pixels('forest-trunk', `${cls}-roots`));
  const bark = pixels('forest-trunk', `${cls}-bark`);
  const bw = extent(bark).w;
  // Where the trunk stands in its roots piece: the roots spread the same either side of it.
  const dx = (roots.w - bw) >> 1;
  const id = `${cls}:${shade}:${turned}:${footPx}`;
  let art = trunks.get(id);
  if (art === undefined) {
    const h = footPx + 1;
    const px = new Uint8Array(roots.w * h);
    // Bark from the roots up, a tile at a time, so it lines up with them.
    for (let y = h - roots.h - 1; y >= 0; y--) {
      const ty = ((((h - roots.h - 1 - y) % 8) + 8) % 8);
      for (let x = 0; x < bw; x++) px[y * roots.w + dx + x] = bark.px[(7 - ty) * bark.w + x];
    }
    for (let y = 0; y < roots.h; y++) for (let x = 0; x < roots.w; x++) if (roots.px[y * roots.w + x] !== 0) px[(h - roots.h + y) * roots.w + x] = roots.px[y * roots.w + x];
    let whole: Pixels = { w: roots.w, h, px };
    whole = aerial(turned ? mirrored(whole) : whole, shade);
    art = paintPixels(whole);
    if (trunks.size > 64) trunks.clear();
    trunks.set(id, art);
  }
  return { art, dx };
}

function drawProp(layer: Layer, v: View, p: Prop, look: Look): void {
  const { geo } = v;
  const foot = geo.footRow(p.z);
  const left = geo.leftOf(p);
  if (p.kind === 'trunk' && BIOMES[v.life.biome].gloom !== undefined) {
    const { art } = trunkArt(v, p, foot * 2 + 1);
    drawColorsAt(layer, art, left, 0);
    return;
  }
  // What stands against the window's edge is part of the great trees there: it casts no shadow of its own.
  if (!FLAT.has(p.kind) && p.edge === undefined) {
    const mid = left + (p.sprite.w >> 1);
    const lean = shadowLean(v, mid);
    const half = Math.max(2, Math.round(p.sprite.w * (p.kind === 'home' ? 0.48 : 0.32) + Math.abs(lean) * 0.5));
    for (let c = -half; c < half; c++) layer.shade(mid + lean + c, foot, c === -half || c === half - 1 ? 0.8 : 0.6, true);
  }
  const sway = SWAYS.has(p.kind) ? swayOf(v, p.x) : 0;
  drawColors(layer, propArt(p.kind, p.variant, sway === 0 ? look : { ...look, sway }, p.z), left, foot - p.sprite.h + 1);
}

/** How far a tree at x leans in the wind just now: each at its own rhythm, more in a gale. */
function swayOf(v: View, x: number): number {
  const wind = Math.abs(v.sky.wind) + (v.sky.weather.storm ? 0.5 : 0);
  if (wind < 0.15) return 0;
  const amp = wind > 0.6 ? 2 : 1;
  const lean = Math.sin(ambient(v.time) * (1.1 + wind) + x * 37);
  return Math.round(lean * amp * 0.7 + Math.sign(v.sky.wind) * amp * 0.5);
}

/** Whether its eyes are shut for a blink at time `t`: now and then, for a moment. */
function blinking(t: number, seed: number): boolean {
  const beat = Math.floor(t / BLINK_EVERY_SEC);
  return t - beat * BLINK_EVERY_SEC < BLINK_SEC && hash2(beat, 7, seed) % 3 !== 0;
}

/** The creature's inks: its cloak's ramp, leather boots and mittens, the dark face and its glowing eyes. */
function creatureInks(v: View): Inks {
  const cloak = ramp(v.life.cloak);
  const boot = ramp(COLORS.boot);
  const metal = ramp(COLORS.lanternMetal);
  const glowing = (rgb: number): { rgb: number; glow: true } => ({ rgb, glow: true });
  const tones = (first: number, colors: readonly number[]): Inks => Object.fromEntries(colors.map((rgb, i) => [first + i, { rgb }]));
  return {
    ...tones(INK.cloak, [cloak.outline, cloak.dark, cloak.shadow, cloak.base, cloak.light, cloak.gleam]),
    ...tones(INK.boot, [boot.outline, boot.dark, boot.shadow, boot.base, boot.light]),
    ...tones(INK.metal, [metal.outline, metal.dark, metal.base, metal.light]),
    [INK.clasp]: { rgb: COLORS.clasp },
    [INK.face]: glowing(COLORS.face),
    [INK.eye]: glowing(v.eyeGlow),
    [INK.glint]: glowing(0xffffff),
    [INK.tear]: glowing(EYE_GLOW.sad),
    [INK.glass]: glowing(COLORS.lantern),
    [INK.flame]: glowing(lighten(COLORS.lantern, 0.6)),
  };
}

/** The colour of a doorway's dark, which it fades into as it steps inside. */
const DOORWAY_DARK = 0x100c0a;

/**
 * A canvas that lets pixels through only where `inside(column, pixel row)`, faded by k towards the dark of
 * a doorway. What glows (its eyes) stays bright.
 */
function throughDoor(layer: Layer, inside: (x: number, y: number) => boolean, k: number): Canvas {
  const fade = (c: number | null, x: number, y: number, glow: boolean): number | null => (c === null || !inside(x, y) ? null : glow ? c : mix(c, DOORWAY_DARK, k));
  return {
    width: layer.width,
    height: layer.height,
    put: () => {},
    halves: (col, row, top, bottom, glowTop, glowBottom) => {
      const t = fade(top, col, row * 2, glowTop);
      const b = fade(bottom, col, row * 2 + 1, glowBottom);
      if (t !== null || b !== null) layer.halves(col, row, t, b, glowTop, glowBottom);
    },
  };
}

/** The creature, its shadow, its lantern, what it holds and its sign. Returns the lantern's light. */
function drawCreature(layer: Layer, v: View, foot: number): Light[] {
  const { geo, body, time, life, sky } = v;
  const col = geo.col(body.x);
  const left = col - FIGURE_W / 2;
  const top = foot - FIGURE_ROWS + 1 - Math.round(body.lift);
  const front = body.facing < 0 ? -1 : 1;
  const night = sky.daylight < 0.35 && body.pose !== 'sleep';
  const carries = night && LANTERN_POSES.has(body.pose);

  // Stepping through its doorway, it shows only within the doorway, fading into the dark inside.
  if (body.doorway > 0) {
    const home = v.scene.layout.home;
    const door = home.sprite.door;
    if (door === undefined) return [];
    const hx = geo.leftOf(home);
    const hy = (geo.footRow(home.z) - home.sprite.h + 1) * 2;
    const frame = figure(frameName('stand', time, 0), front, false);
    drawColors(throughDoor(layer, (x, y) => inDoorway(door, x - hx, y - hy), body.doorway), paintPixels(withEyes(frame, v.eyes), creatureInks(v)), left, top);
    return [];
  }

  // A shadow on the ground, smaller the higher it hops.
  const lean = shadowLean(v, col);
  const half = 6 - Math.min(4, Math.round(body.lift)) + Math.round(Math.abs(lean) * 0.4);
  for (let c = -half; c < half; c++) layer.shade(col + lean + c, foot, c === -half || c === half - 1 ? 0.8 : 0.62);

  // The stride counts the columns and rows it has walked, so its feet keep pace with the ground.
  const frame = figure(frameName(body.pose, time, Math.floor(col / 2) + foot), front, carries);
  const eyes = !closed(v.eyes) && blinking(time, life.seed) ? '- -' : v.eyes;
  const inks = creatureInks(v);
  layer.owning = true;
  drawColors(layer, paintPixels(withEyes(frame, eyes), inks), left, top);
  layer.owning = false;

  const lights: Light[] = [];
  if (night) {
    let lamp: { col: number; row: number };
    if (frame.lamp !== null) lamp = { col: left + frame.lamp.x, row: top + (frame.lamp.y >> 1) };
    else {
      // Sitting, digging or eating, it sets the lantern down in front of it.
      const lantern = paintPixels(LANTERN_ON_GROUND.pixels, inks);
      const at = front > 0 ? left + FIGURE_W - 1 : left - lantern.w + 1;
      drawColors(layer, lantern, at, foot - lantern.h + 1);
      lamp = { col: at + 2, row: foot - 2 };
    }
    const slow = ambient(time);
    const flicker = 1 + 0.06 * Math.sin(slow * 13) * Math.sin(slow * 7.3 + 1);
    lights.push({ ...lamp, radius: LANTERN_RADIUS, rgb: LANTERN_RGB, gain: LANTERN_GAIN * flicker * (1 - sky.daylight) });
  }
  if (body.holding !== null) {
    // In its back hand, or up at its face while it eats.
    const sitting = body.pose === 'sit' || body.pose === 'dig' || body.pose === 'sleep';
    const [hc, hr] = body.pose === 'eat' ? [col + front * 4, top + 6] : [col - front * 7, top + (sitting ? 9 : 7)];
    const art = itemArt(body.holding.glyph, body.holding.color);
    drawColorsAt(layer, art, hc - (art.w >> 1), hr * 2 - (art.h - 1) * 2);
  }
  if (body.icon !== null) {
    const art = signArt(body.icon, COLORS.hudAccent);
    layer.owning = true;
    drawColorsAt(layer, art, col - (art.w >> 1), (top - art.h) * 2 + 1);
    layer.owning = false;
  }
  return lights;
}

/**
 * Whether a glowing pixel keeps its warmth: lamps, windows, stars and the moon do; the sky, which glows only
 * so the night does not dim it twice, does not.
 */
function glowsWarm(c: number): boolean {
  const r = c >> 16;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return r + g + b > 420 || (r > b + 40 && r + g > 260);
}

/** How much the corners of the scene darken. */
const VIGNETTE = 0.34;

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
      // The edges of the window fall a little into shade, so the eye goes to the middle.
      const ex = (c / Math.max(1, w - 1)) * 2 - 1;
      const ey = (r / Math.max(1, layer.height - 1)) * 2 - 1;
      const edge = 1 - VIGNETTE * Math.max(0, Math.sqrt(ex * ex * 0.8 + ey * ey * 0.6) - 0.55) / 0.55;
      let lr = (sky.lightR + flash) * edge;
      let lg = (sky.lightG + flash) * edge;
      let lb = (sky.lightB + flash) * edge;
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

/**
 * Enlarges a frame of the scene into the window, each of its pixels `s` terminal pixels each way. A cell
 * holding a letter (a particle's) puts it in the top-left cell of its block.
 */
function enlarge(src: Frame, dst: Frame, s: number, rows: number): void {
  const pixel = (x: number, y: number): number => {
    const i = (y >> 1) * src.width + x;
    const g = src.glyph[i];
    if (g === UPPER) return (y & 1) === 0 ? src.fg[i] : src.bg[i];
    if (g === LOWER) return (y & 1) === 0 ? src.bg[i] : src.fg[i];
    if (g === FULL) return src.fg[i];
    return src.bg[i];
  };
  const maxY = src.height * 2 - 1;
  for (let r = 0; r < Math.min(rows, dst.height); r++) {
    const yt = Math.min(maxY, Math.floor((2 * r) / s));
    const yb = Math.min(maxY, Math.floor((2 * r + 1) / s));
    for (let c = 0; c < dst.width; c++) {
      const x = Math.min(src.width - 1, Math.floor(c / s));
      const si = (yt >> 1) * src.width + x;
      const g = src.glyph[si];
      const i = r * dst.width + c;
      if (g !== SPACE && g !== UPPER && g !== LOWER && g !== FULL) {
        const corner = c % s === 0 && r % s === 0;
        dst.glyph[i] = corner ? g : SPACE;
        dst.fg[i] = src.fg[si];
        dst.bg[i] = src.bg[si];
        continue;
      }
      const top = pixel(x, yt);
      const bottom = pixel(x, yb);
      dst.glyph[i] = top === bottom ? SPACE : UPPER;
      dst.fg[i] = top;
      dst.bg[i] = bottom;
    }
  }
}

/** A speech bubble above its head (or its doorway), with a tail; a thought bubble while it waits for words. */
function drawBubble(f: Frame, v: View, s: number, rows: number): void {
  const { geo, body, bubble } = v;
  if (bubble === null || !body.visible) return;
  // Where it points, in the scene's cells, then in the window's (the scene may be enlarged `s` times).
  let anchorCol: number;
  let anchorRow: number;
  if (body.inside) {
    const h = v.scene.layout.home;
    anchorCol = geo.col(geo.door(h).x);
    anchorRow = geo.footRow(h.z) - h.sprite.h;
  } else {
    anchorCol = geo.col(body.x);
    anchorRow = geo.footRow(body.z) - FIGURE_ROWS - 1 - Math.round(body.lift);
  }
  anchorCol = anchorCol * s + (s >> 1);
  anchorRow = (anchorRow + 1) * s - 1;
  const think = bubble.kind === 'think';
  const lines = think ? ['…'] : wrap(bubble.text, Math.max(8, Math.min(34, f.width - 6)));
  const inner = Math.max(...lines.map((l) => Array.from(l).length));
  const width = inner + 4;
  const height = lines.length + 2;
  let left = anchorCol - (width >> 1) + (body.facing > 0 ? 2 : -2) * s;
  left = Math.max(0, Math.min(f.width - width, left));
  let top = anchorRow - height + 1;
  if (top < 0) top = 0;
  const fg = think ? COLORS.thinkFg : COLORS.bubbleFg;
  const edge = COLORS.bubbleEdge;
  const bg = COLORS.bubbleBg;
  const put = (c: number, r: number, ch: string, color: number): void => {
    if (c < 0 || c >= f.width || r < 0 || r >= rows) return;
    const i = r * f.width + c;
    f.glyph[i] = code(ch);
    f.fg[i] = color;
    f.bg[i] = bg;
  };
  const putOn = (c: number, r: number, ch: string, color: number): void => {
    if (c < 0 || c >= f.width || r < 0 || r >= rows) return;
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
