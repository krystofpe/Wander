// Builds a frame: terrain, moving water and weather, light, you, and the status bar.
import {
  ASPECT,
  BIOMES,
  Biome,
  CHUNK_SIZE,
  COLOR_BITS,
  COLORS,
  LANTERN_GAIN,
  LANTERN_RGB,
  MIN_COLS,
  MIN_ROWS,
  WEATHER,
  Water,
} from './config.ts';
import { dropAt, lanternLight, weatherName, windArrow } from './ambient.ts';
import type { Ambient, Atmosphere } from './ambient.ts';
import type { Frame } from './frame.ts';
import type { Projection } from './geo.ts';
import type { Player } from './player.ts';
import type { ChunkSource } from './world.ts';

/** A real place for the status bar: where you are, what is loading. */
export type PlaceHud = { readonly name: string; readonly projection: Projection; readonly loading: number; readonly offline: boolean };
/** What the status bar shows besides the world; null hides the bar. */
export type Hud = { readonly fps: number; readonly place?: PlaceHud | null } | null;

const code = (ch: string): number => ch.codePointAt(0) ?? 32;
const AT = code('@');
const WAVE = code('~');
const BIG_WAVE = code('≈');
const TROUGH = code('-');
const SPARKLE = code('·');
const SPACE = 32;
const FOG = code('·');

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
  place: PlaceHud | null = null,
): string {
  const hh = Math.floor(amb.hour);
  const mm = Math.floor((amb.hour - hh) * 60);
  const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const wind = windArrow(amb.windX, amb.windY);
  let where = ` x ${Math.round(player.x)}  y ${Math.round(player.y)}`;
  let tail = `seed ${seed}`;
  if (place !== null) {
    const { lat, lon } = place.projection.toLatLon(player.x, player.y);
    where = ` ${lat.toFixed(4)},${lon.toFixed(4)}`;
    tail = `${place.name} · © OpenStreetMap${place.loading > 0 ? ' · loading' : ''}${place.offline ? ' · offline' : ''}`;
  }
  return `${where} │ ${biomeName} │ ${clock} ${amb.phase} │ ${weather}, wind ${wind} │ ${fps} fps │ ${tail}`;
}

export class Renderer {
  private clouds = new Float32Array(0);
  private gusts = new Float32Array(0);

  /** Fills every cell of `frame`. */
  render(frame: Frame, world: ChunkSource, atm: Atmosphere, amb: Ambient, player: Player, hud: Hud): void {
    if (frame.width < MIN_COLS || frame.height < MIN_ROWS) {
      drawTooSmall(frame);
      return;
    }
    const cols = frame.width;
    const mapRows = hud === null ? frame.height : frame.height - 1;
    const { left, top } = viewOrigin(player, cols, mapRows);

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
        if (!chunk.ready) {
          frame.set(c, r, FOG, COLORS.fogFg, COLORS.fogBg);
          continue;
        }
        const o = rowStart + (mx - cx * CHUNK_SIZE);
        const biome = chunk.biome[o];
        const def = BIOMES[biome];
        const variant = chunk.variant[o];
        const wx = mx + 0.5;
        const gx = mx / GRID_X - gx0;
        let glyph = def.glyphs[variant % def.glyphs.length];
        let fg = def.fg;
        let bg = def.bg;
        let bright = chunk.shade[o];

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
              bg = mix(bg, COLORS.foam, foam * 0.45);
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
        } else if (def.sways) {
          const g = sample(this.gusts, gw, gx, gy);
          if (g > 0.5) {
            glyph = def.glyphs[(variant + 1) % def.glyphs.length];
            bright *= 1 + 0.15 * g;
          }
        }

        const sun = 1 - sample(this.clouds, gw, gx, gy) * WEATHER.cloudShadow;
        const lamp = lanternLight(wx - player.x, wy - player.y, amb) * LANTERN_GAIN;
        const lr = amb.lightR * sun + lamp * LANTERN_RGB[0];
        const lg = amb.lightG * sun + lamp * LANTERN_RGB[1];
        const lb = amb.lightB * sun + lamp * LANTERN_RGB[2];
        let outFg = lit(fg, bright, lr, lg, lb);
        const outBg = lit(bg, bright, lr, lg, lb);
        if (amb.front > 0) {
          const cold = chunk.temperature[o] < WEATHER.snowBelow;
          const drop = dropAt(mx, my, amb, cold, world.seed);
          if (drop !== 0) {
            glyph = drop;
            outFg = lit(cold ? COLORS.snow : COLORS.rain, 1, lr, lg, lb);
          }
        }
        frame.set(c, r, glyph, outFg, outBg);
      }
    }

    // You, on the terrain's background.
    const pc = cols >> 1;
    const pr = mapRows >> 1;
    frame.set(pc, pr, AT, COLORS.player, frame.bg[pr * cols + pc]);

    if (hud !== null) {
      const pmx = Math.floor(player.x);
      const pmy = Math.floor(player.y / ASPECT);
      const cold = world.temperatureAt(pmx, pmy) < WEATHER.snowBelow;
      const name = BIOMES[world.biomeAt(pmx, pmy)].name;
      const text = statusText(player, name, amb, weatherName(amb, cold), hud.fps, world.seed, hud.place ?? null);
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
