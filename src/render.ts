// Builds a frame: terrain on black, blades, moving water and weather, light, you, and the status bar.
import {
  ASPECT,
  BIOMES,
  Biome,
  CHUNK_SIZE,
  COLOR_BITS,
  COLORS,
  FIGURE,
  LANTERN_GAIN,
  LANTERN_RGB,
  MIN_COLS,
  MIN_ROWS,
  WEATHER,
  Water,
} from './config.ts';
import { dropAt, lanternLight, vignette, weatherName, windArrow } from './ambient.ts';
import type { Ambient, Atmosphere } from './ambient.ts';
import type { Frame } from './frame.ts';
import { bladeGlyph, windLean } from './grass.ts';
import type { Trail } from './grass.ts';
import type { Player } from './player.ts';
import type { World } from './world.ts';

/** What the status bar shows besides the world; null hides the bar. */
export type Hud = { readonly fps: number } | null;

const code = (ch: string): number => ch.codePointAt(0) ?? 32;
const WAVE = code('~');
const BIG_WAVE = code('≈');
const TROUGH = code('-');
const SPARKLE = code('·');
const SPACE = 32;

/** Spacing, in map cells, of the coarse grid for slowly varying fields (clouds, gusts). */
const GRID_X = 4;
const GRID_Y = 2;

const LEVELS = (1 << COLOR_BITS) - 1;
const ROUNDED = Uint8Array.from({ length: 256 }, (_, c) => Math.round((Math.round((c * LEVELS) / 255) * 255) / LEVELS));

/** Rounds a colour channel to 2^COLOR_BITS levels spread over 0..255. */
export function quantize(c: number): number {
  return ROUNDED[c <= 0 ? 0 : c >= 255 ? 255 : c | 0];
}

/** A colour scaled by brightness `k` and per-channel light, then rounded. */
function lit(rgb: number, k: number, lr: number, lg: number, lb: number): number {
  return (
    (quantize(((rgb >> 16) & 255) * k * lr) << 16) |
    (quantize(((rgb >> 8) & 255) * k * lg) << 8) |
    quantize((rgb & 255) * k * lb)
  );
}

/** Blend from colour a towards colour b by t (0..1). */
function mix(a: number, b: number, t: number): number {
  const channel = (shift: number): number => {
    const x = (a >> shift) & 255;
    return Math.round(x + (((b >> shift) & 255) - x) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Bilinear sample of a coarse grid `width` points wide, at fractional grid position (fx, fy). */
function sample(grid: Float32Array, width: number, fx: number, fy: number): number {
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const k = iy * width + ix;
  const upper = grid[k] + (grid[k + 1] - grid[k]) * tx;
  const lower = grid[k + width] + (grid[k + width + 1] - grid[k + width]) * tx;
  return upper + (lower - upper) * (fy - iy);
}

/** Top-left map cell of the view, so that you sit at (cols >> 1, mapRows >> 1). */
export function viewOrigin(player: Player, cols: number, mapRows: number): { left: number; top: number } {
  return { left: Math.floor(player.x) - (cols >> 1), top: Math.floor(player.y / ASPECT) - (mapRows >> 1) };
}

export function statusText(
  player: Player,
  biomeName: string,
  amb: Ambient,
  weather: string,
  fps: number,
  seed: number,
): string {
  const hh = Math.floor(amb.hour);
  const mm = Math.floor((amb.hour - hh) * 60);
  const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const wind = windArrow(amb.windX, amb.windY);
  return ` x ${Math.round(player.x)}  y ${Math.round(player.y)} │ ${biomeName} │ ${clock} ${amb.phase} │ ${weather}, wind ${wind} │ ${fps} fps │ seed ${seed}`;
}

export class Renderer {
  private readonly name: string;
  /** Columns the name takes: one per character. */
  private readonly nameWidth: number;
  private clouds = new Float32Array(0);
  private gusts = new Float32Array(0);

  /** `name` is drawn above your figure. */
  constructor(name: string) {
    this.name = name;
    this.nameWidth = Array.from(name).length;
  }

  /** Fills every cell of `frame`. `trail` is where you have walked lately, for the grass. */
  render(frame: Frame, world: World, atm: Atmosphere, amb: Ambient, player: Player, trail: Trail, hud: Hud): void {
    if (frame.width < MIN_COLS || frame.height < MIN_ROWS) {
      drawTooSmall(frame);
      return;
    }
    const cols = frame.width;
    const mapRows = hud === null ? frame.height : frame.height - 1;
    const { left, top } = viewOrigin(player, cols, mapRows);
    const halfWidth = cols / 2;
    const halfHeight = (mapRows * ASPECT) / 2;
    const bendBox = trail.bounds(amb.realTime);

    // Clouds and gusts on a coarse grid aligned to the map, so the grid doesn't swim as you move.
    const gx0 = Math.floor(left / GRID_X);
    const gy0 = Math.floor(top / GRID_Y);
    const gw = Math.floor((left + cols - 1) / GRID_X) - gx0 + 2;
    const gh = Math.floor((top + mapRows - 1) / GRID_Y) - gy0 + 2;
    if (this.clouds.length < gw * gh) {
      this.clouds = new Float32Array(gw * gh);
      this.gusts = new Float32Array(gw * gh);
    }
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const x = (gx0 + i) * GRID_X;
        const y = (gy0 + j) * GRID_Y * ASPECT;
        this.clouds[j * gw + i] = atm.cloud(x, y, amb.cloudCover);
        this.gusts[j * gw + i] = atm.gust(x, y);
      }
    }

    for (let r = 0; r < mapRows; r++) {
      const my = top + r;
      const cy = Math.floor(my / CHUNK_SIZE);
      const rowStart = (my - cy * CHUNK_SIZE) * CHUNK_SIZE;
      const gy = my / GRID_Y - gy0;
      const wy = (my + 0.5) * ASPECT;
      let chunk = world.chunk(Math.floor(left / CHUNK_SIZE), cy);
      for (let c = 0; c < cols; c++) {
        const mx = left + c;
        const cx = Math.floor(mx / CHUNK_SIZE);
        if (cx !== chunk.cx) chunk = world.chunk(cx, cy);
        const o = rowStart + (mx - cx * CHUNK_SIZE);
        const biome = chunk.biome[o];
        const def = BIOMES[biome];
        const variant = chunk.variant[o];
        const wx = mx + 0.5;
        const gx = mx / GRID_X - gx0;
        let glyph = def.glyphs[variant % def.glyphs.length];
        let fg = def.fg;
        // Land gets its slope shade and a per-cell speckle; water and blades set their own brightness below.
        let bright = chunk.shade[o] * (0.85 + (0.3 * (variant >> 2)) / 63);

        if (def.water === Water.Sea) {
          const v = atm.seaWave(wx, wy);
          if (biome === Biome.Shallows) glyph = v > 0.4 ? WAVE : SPARKLE;
          else glyph = v > 0.5 ? BIG_WAVE : v > -0.25 ? WAVE : TROUGH;
          bright = 1 + 0.12 * v;
          if (chunk.shore[o] === 1) {
            // Surf: slow white pulses along the shore.
            const s = Math.sin(amb.realTime * 1.7 + variant * 0.005 + (wx + wy) * 0.04);
            const foam = s > 0 ? s * s * s * s : 0;
            if (foam > 0.05) {
              fg = mix(fg, COLORS.foam, foam * 0.8);
              glyph = WAVE;
            }
          }
        } else if (def.water === Water.River) {
          // Bands of light drift downstream.
          const s = Math.sin((wx * chunk.flowX[o] + wy * chunk.flowY[o]) / 3 - amb.realTime * 3 + variant * 0.025);
          glyph = s > 0.3 ? BIG_WAVE : WAVE;
          bright = 1 + 0.15 * s;
        } else if (def.water === Water.Lake) {
          const v = atm.lakeRipple(wx, wy);
          glyph = v > 0.45 ? BIG_WAVE : WAVE;
          bright = 1 + 0.06 * v;
        } else if (def.blades) {
          // Blades lean with the wind and gusts, and bend away from where you have just walked.
          const g = sample(this.gusts, gw, gx, gy);
          let leanX = windLean(amb, g);
          let leanY = 0;
          if (bendBox !== null && wx >= bendBox[0] && wx <= bendBox[2] && wy >= bendBox[1] && wy <= bendBox[3]) {
            const [bx, by] = trail.bendAt(wx, wy, amb.realTime);
            leanX += bx;
            leanY += by;
          }
          glyph = bladeGlyph(leanX, leanY, variant);
          const m = Math.min(1, Math.sqrt(leanX * leanX + leanY * leanY));
          bright = (0.8 + (0.35 * ((variant >> 2) & 63)) / 63) * (1 + 0.15 * g) * (1 + 0.25 * m);
          if (variant >= 248) {
            // A few bright tips that twinkle.
            fg = COLORS.tip;
            bright *= 0.7 + 0.3 * Math.sin(5 * amb.realTime + variant);
          }
        } else if (def.sways) {
          const g = sample(this.gusts, gw, gx, gy);
          if (g > 0.5) {
            glyph = def.glyphs[(variant + 1) % def.glyphs.length];
            bright *= 1 + 0.15 * g;
          }
        }

        const dx = wx - player.x;
        const dy = wy - player.y;
        const sun = (1 - sample(this.clouds, gw, gx, gy) * WEATHER.cloudShadow) * vignette(dx, dy, halfWidth, halfHeight);
        const lamp = lanternLight(dx, dy, amb) * LANTERN_GAIN;
        const lr = amb.lightR * sun + lamp * LANTERN_RGB[0];
        const lg = amb.lightG * sun + lamp * LANTERN_RGB[1];
        const lb = amb.lightB * sun + lamp * LANTERN_RGB[2];
        let outFg = lit(fg, bright, lr, lg, lb);
        if (amb.front > 0) {
          const cold = chunk.temperature[o] < WEATHER.snowBelow;
          const drop = dropAt(mx, my, amb, cold, world.seed);
          if (drop !== 0) {
            glyph = drop;
            outFg = lit(cold ? COLORS.snow : COLORS.rain, 1, lr, lg, lb);
          }
        }
        frame.set(c, r, glyph, outFg, COLORS.ground);
      }
    }

    // You: a small figure whose legs alternate while you move, with your name above it.
    const pc = cols >> 1;
    const pr = mapRows >> 1;
    const moving = Math.hypot(player.vx, player.vy) > 1;
    const rows = moving && Math.floor(amb.realTime / FIGURE.stepTime) % 2 === 1 ? FIGURE.walk : FIGURE.stand;
    for (let i = 0; i < rows.length; i++) {
      const row = pr - 1 + i;
      if (row < 0 || row >= mapRows) continue;
      let c = pc - 1;
      for (const ch of rows[i]) {
        if (ch !== ' ' && c >= 0 && c < cols) frame.set(c, row, code(ch), COLORS.player, COLORS.ground);
        c++;
      }
    }
    const nameRow = pr - 2;
    if (nameRow >= 0) frame.text(pc - (this.nameWidth >> 1), nameRow, this.name, COLORS.name, COLORS.ground);

    if (hud !== null) {
      const pmx = Math.floor(player.x);
      const pmy = Math.floor(player.y / ASPECT);
      const cold = world.temperatureAt(pmx, pmy) < WEATHER.snowBelow;
      const name = BIOMES[world.biomeAt(pmx, pmy)].name;
      const text = statusText(player, name, amb, weatherName(amb, cold), hud.fps, world.seed);
      const row = frame.height - 1;
      for (let c = 0; c < cols; c++) frame.set(c, row, SPACE, COLORS.hudFg, COLORS.hudBg);
      frame.text(0, row, text, COLORS.hudFg, COLORS.hudBg);
    }
  }
}

function drawTooSmall(frame: Frame): void {
  for (let r = 0; r < frame.height; r++) {
    for (let c = 0; c < frame.width; c++) frame.set(c, r, SPACE, COLORS.hudFg, COLORS.hudBg);
  }
  const text = 'Make the window bigger'.slice(0, frame.width);
  frame.text((frame.width - text.length) >> 1, frame.height >> 1, text, COLORS.hudFg, COLORS.hudBg);
}
