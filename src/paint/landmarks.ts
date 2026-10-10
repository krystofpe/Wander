// The landmarks, drawn: a lone house with one lit window, a chapel, a lighthouse, a radio mast, a rusted car, a
// bridge over a river, the embankment a distant train runs on, a stone circle, a roadside shrine, a huge skeleton
// half in the ground, someone else's abandoned camp. Each stands on the layer that suits its size, drawn at that
// layer's scale; the stage adds what moves (smoke, lamps, the train). Pure.
import type { LandmarkKind } from '../biomes.ts';
import { PX_PER_M } from '../layers.ts';
import type { LayerDef } from '../layers.ts';
import { rng } from '../noise.ts';
import { role } from '../palette.ts';
import { landmarksBetween } from '../world.ts';
import type { Landmark } from '../world.ts';
import { FLAG, newStamp, put } from './chunk.ts';
import type { Stamp } from './chunk.ts';
import { cached } from './plants.ts';

/** The layer each landmark stands on. */
export const MARK_ON: Readonly<Record<LandmarkKind, string>> = {
  house: 'mid',
  chapel: 'mid',
  circle: 'mid',
  lighthouse: 'hills',
  skeleton: 'hills',
  mast: 'farhills',
  train: 'farhills',
  car: 'ground',
  shrine: 'ground',
  camp: 'ground',
  bridge: 'ground',
};

/** The bridge: half the gorge's width (metres), and the river's depth below the deck (native px). */
export const BRIDGE = { half: 6, deep: 28, bank: 34 } as const;

/** The train's embankment on its far layer: half its length, metres of road. */
export const TRAIN_LINE = { half: 420 } as const;

/** A landmark on a layer: its column, its stamp (null for the bridge and the train, painted in place) and reach. */
export type Placed = { readonly mark: Landmark; readonly u: number; readonly stamp: Stamp | null; readonly half: number };

/** Landmarks standing on this layer near columns [u0, u1). */
export function marksOn(seed: number, layer: LayerDef, u0: number, u1: number): Placed[] {
  const out: Placed[] = [];
  const z = layer.z;
  const reach = layer.name === 'farhills' ? TRAIN_LINE.half * 1.2 : 120;
  for (const m of landmarksBetween(seed, ((u0 - 400) * z) / PX_PER_M - reach, ((u1 + 400) * z) / PX_PER_M + reach)) {
    if (MARK_ON[m.kind] !== layer.name) continue;
    const u = Math.round((m.at * PX_PER_M) / z);
    const s = markStamp(m, z);
    const half = m.kind === 'bridge' ? Math.round(((BRIDGE.half + 1.5) * PX_PER_M) / z) : m.kind === 'train' ? Math.round((TRAIN_LINE.half * PX_PER_M) / z) : Math.ceil((s?.w ?? 0) / 2);
    if (u + half + 40 < u0 || u - half - 40 >= u1) continue;
    out.push({ mark: m, u, stamp: s, half });
  }
  return out;
}

/**
 * How much the ground is levelled for a landmark at column `u` (1 under it, easing to 0 a little beyond), so it
 * stands on a flat plot instead of hanging off a slope.
 */
export function levelling(p: Placed, u: number): number {
  const d = Math.abs(u - p.u) - p.half;
  if (d <= 2) return 1;
  const ease = p.mark.kind === 'train' ? 60 : 26;
  if (d >= ease) return 0;
  const t = 1 - d / ease;
  return t * t * (3 - 2 * t);
}

/** Points on a landmark's stamp the stage uses (chimney top, lamps), from its root column and bottom row. */
export const MARK_POINTS: Readonly<Partial<Record<LandmarkKind, Readonly<Record<string, readonly [number, number]>>>>> = {
  house: { chimney: [9, -51] },
  lighthouse: { lamp: [0, -101] },
  mast: { lamp: [0, -109] },
};

export function markStamp(m: Landmark, z: number): Stamp | null {
  const seed = m.cell;
  switch (m.kind) {
    case 'house':
      return house(seed % 4);
    case 'chapel':
      return chapel(seed % 4);
    case 'circle':
      return circle(seed % 8);
    case 'lighthouse':
      return lighthouse();
    case 'skeleton':
      return skeleton(seed % 4);
    case 'mast':
      return mast();
    case 'car':
      return car(seed % 4);
    case 'shrine':
      return shrine(seed % 4);
    case 'camp':
      return camp(seed % 4);
    default:
      void z;
      return null;
  }
}

// ── Drawing helpers ────────────────────────────────────────────────────────

const R = FLAG.RIM;

function fill(s: Stamp, x0: number, y0: number, x1: number, y1: number, r: number, f: number = R): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(s, x, y, r, f);
}

function line(s: Stamp, x0: number, y0: number, x1: number, y1: number, r: number, f: number = R): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    put(s, x, y, r, f);
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

// ── The mid layer (9 px a metre) ───────────────────────────────────────────

/**
 * A lone house, gable end on: plank walls on a stone footing, a slate roof with a chimney, a door, one window lit
 * at night and one dark in the gable, a lean-to shed. The root is the middle of the house; the chimney's top is a
 * named point (its smoke is the stage's).
 */
function house(v: number): Stamp {
  return cached(`mark:house:${v}`, () => {
    const random = rng(0x40e5 + v);
    const W = 64;
    const H = 54;
    const s = newStamp(W, H, 32);
    const wall = [role('wood', 0), role('wood', 1), role('wood', 2), role('wood', 3)];
    const roof = [role('roof', 0), role('roof', 1), role('roof', 2)];
    const stone = [role('stone', 0), role('stone', 1), role('stone', 2)];
    const x0 = 10;
    const x1 = 54;
    const eave = H - 26;
    // Walls: vertical planks, the left edge a shade lighter, a stone footing two rows high.
    for (let y = eave; y < H; y++)
      for (let x = x0; x <= x1; x++) {
        let r = (x - x0) % 4 === 3 ? wall[1] : x <= x0 + 1 ? wall[3] : wall[2];
        if (y >= H - 2) r = (x + y) % 5 === 0 ? stone[0] : stone[1];
        put(s, x, y, r);
      }
    // The roof: a triangle with an overhang, its upper edge lit, its underside dark.
    const apex = H - 50;
    for (let y = apex; y <= eave; y++) {
      const t = (y - apex) / (eave - apex);
      const half = Math.round(2 + t * ((x1 - x0) / 2 + 3));
      for (let x = 32 - half; x <= 32 + half; x++) {
        const edge = x === 32 - half || x === 32 + half || y === apex;
        put(s, x, y, y === eave ? roof[0] : edge ? roof[2] : (x + y) % 6 === 0 ? roof[0] : roof[1]);
      }
    }
    // The chimney, through the roof on the right, brick, a dark mouth.
    for (let y = H - 51; y < H - 36; y++) for (let x = 40; x <= 43; x++) put(s, x, y, y === H - 51 ? role('brick', 0) : x === 40 ? role('brick', 2) : role('brick', 1));
    // The gable window, dark.
    fill(s, 30, H - 40, 34, H - 35, role('wood', 0));
    fill(s, 31, H - 39, 33, H - 36, role('glass', 0), 0);
    // The door: dark boards in a frame.
    fill(s, 35, H - 20, 43, H - 1, role('wood', 3));
    fill(s, 36, H - 19, 42, H - 2, role('wood', 0), 0);
    put(s, 41, H - 10, role('metal', 3), 0);
    // The one lit window: four panes behind a cross of glazing bars.
    const wx = 16;
    const wy = H - 19;
    fill(s, wx - 1, wy - 1, wx + 7, wy + 9, role('wood', 3));
    fill(s, wx, wy, wx + 6, wy + 8, role('glass', 1), FLAG.LIGHT);
    fill(s, wx + 3, wy, wx + 3, wy + 8, role('wood', 0), 0);
    fill(s, wx, wy + 4, wx + 6, wy + 4, role('wood', 0), 0);
    // A lean-to shed on the left, lower, its roof sloping away.
    for (let x = 1; x < x0; x++) {
      const top = H - 18 + Math.round((x0 - x) * 0.4);
      put(s, x, top, roof[2]);
      for (let y = top + 1; y < H; y++) put(s, x, y, (x % 3 === 0 ? wall[0] : wall[1]));
    }
    // A water butt by the door.
    if (random() < 0.7) fill(s, 46, H - 7, 50, H - 1, role('wood', 1));
    return s;
  });
}

/** A small stone chapel seen from the side: a nave with tall narrow windows, a bell tower with a spire. */
function chapel(v: number): Stamp {
  return cached(`mark:chapel:${v}`, () => {
    const W = 64;
    const H = 76;
    const s = newStamp(W, H, 26);
    const st = [role('stone', 0), role('stone', 1), role('stone', 2), role('stone', 3)];
    const roof = [role('roof', 0), role('roof', 1), role('roof', 2)];
    const course = (x: number, y: number): number => ((y % 4 === 3 || (x + Math.floor(y / 4) * 3) % 8 === 0) ? st[0] : st[1]);
    // The nave.
    const eave = H - 22;
    for (let y = eave; y < H; y++) for (let x = 2; x <= 45; x++) put(s, x, y, x === 2 ? st[2] : course(x, y));
    // Its roof, seen from the side: a band from the eaves up to the ridge.
    for (let y = eave - 12; y < eave; y++) {
      const t = (eave - y) / 12;
      for (let x = Math.round(0 + t * 3); x <= Math.round(47 - t * 3); x++) put(s, x, y, y === eave - 12 ? roof[2] : y === eave - 1 ? roof[0] : roof[1]);
    }
    // Three tall windows with round heads, dark; the middle one holds a candle's glow.
    for (const [i, wx] of [8, 20, 32].entries()) {
      for (let y = H - 17; y <= H - 6; y++) for (let x = wx; x <= wx + 3; x++) {
        const head = y === H - 17 && (x === wx || x === wx + 3);
        if (!head) put(s, x, y, i === 1 && y > H - 13 ? role('glass', 1) : role('glass', 0), 0);
      }
    }
    // The tower at the west end, taller, with a louvred bell opening and a spire.
    const tx0 = 46;
    const tx1 = 59;
    const towerTop = H - 52;
    for (let y = towerTop; y < H; y++) for (let x = tx0; x <= tx1; x++) put(s, x, y, x === tx0 ? st[2] : x === tx1 ? st[0] : course(x, y));
    fill(s, 51, towerTop + 4, 54, towerTop + 10, role('glass', 0), 0);
    for (let y = towerTop + 5; y <= towerTop + 10; y += 2) fill(s, 51, y, 54, y, role('wood', 1), 0);
    fill(s, 49, H - 12, 56, H - 1, role('wood', 0), 0);
    fill(s, 49, H - 12, 56, H - 12, st[3]);
    const spire = 22;
    for (let y = 0; y < spire; y++) {
      const half = Math.round((y / spire) * 8);
      for (let x = 53 - half; x <= 53 + half; x++) put(s, x, towerTop - spire + y, x === 53 - half ? roof[2] : roof[1]);
    }
    // A small cross on the spire.
    fill(s, 53, towerTop - spire - 5, 53, towerTop - spire - 1, role('metal', 1));
    fill(s, 52, towerTop - spire - 4, 54, towerTop - spire - 4, role('metal', 1));
    void v;
    return s;
  });
}

/** A stone circle: uprights of different heights and leans, a trilithon with its lintel, one stone fallen. */
function circle(v: number): Stamp {
  return cached(`mark:circle:${v}`, () => {
    const random = rng(0xc1c1e + v);
    const W = 200;
    const H = 46;
    const s = newStamp(W, H, 100);
    const st = [role('stone', 0), role('stone', 1), role('stone', 2), role('stone', 3)];
    const upright = (cx: number, h: number, w: number, lean: number): void => {
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const round = t < 0.12 ? Math.round((0.12 - t) * w * 3) : 0;
        const xl = cx - (w >> 1) + Math.round(lean * (h - y)) + (round >> 1);
        const xr = xl + w - 1 - round;
        for (let x = xl; x <= xr; x++) put(s, x, H - 1 - (h - 1 - y), x === xl ? st[2] : x === xr ? st[0] : y === 0 ? st[3] : (x * 7 + y * 3) % 11 === 0 ? st[0] : st[1]);
      }
    };
    const xs = [14, 38, 62, 140, 162, 186];
    for (const x of xs) upright(x + Math.round((random() - 0.5) * 8), 16 + Math.round(random() * 20), 6 + Math.floor(random() * 4), (random() - 0.5) * 0.12);
    // The trilithon in the middle: two uprights and a lintel.
    upright(88, 36, 8, 0);
    upright(110, 37, 8, 0);
    fill(s, 82, H - 41, 116, H - 37, st[1]);
    fill(s, 82, H - 41, 116, H - 41, st[3]);
    fill(s, 82, H - 37, 116, H - 37, st[0]);
    // A fallen stone, lying.
    fill(s, 120, H - 5, 134, H - 1, st[1]);
    fill(s, 120, H - 5, 134, H - 5, st[3]);
    return s;
  });
}

// ── The hills (6 px a metre) ───────────────────────────────────────────────

/** A lighthouse: a tapering tower in white and red bands, a gallery, the lantern room, a keeper's hut. */
function lighthouse(): Stamp {
  return cached('mark:lighthouse', () => {
    const W = 56;
    const H = 110;
    const s = newStamp(W, H, 24);
    const white = [role('salt', 0), role('salt', 1), role('salt', 2)];
    const red = [role('brick', 0), role('brick', 1), role('brick', 2)];
    const top = H - 94;
    for (let y = top; y < H; y++) {
      const t = (y - top) / (H - top);
      const half = Math.round(6 + t * 7);
      const band = Math.floor((H - y) / 14) % 2 === 1;
      for (let x = 24 - half; x <= 24 + half; x++) {
        const c = band ? red : white;
        put(s, x, y, x <= 24 - half + 1 ? c[2] : x >= 24 + half - 1 ? c[0] : c[1]);
      }
    }
    // A door and two small windows up the tower.
    fill(s, 22, H - 9, 26, H - 1, role('wood', 0), 0);
    fill(s, 23, H - 40, 25, H - 37, role('glass', 1), 0);
    fill(s, 23, H - 66, 25, H - 63, role('glass', 0), 0);
    // The gallery and its rail.
    fill(s, 15, top - 1, 33, top, role('metal', 0));
    for (let x = 15; x <= 33; x += 3) fill(s, x, top - 4, x, top - 2, role('metal', 0));
    fill(s, 15, top - 4, 33, top - 4, role('metal', 0));
    // The lantern room: glass that is lit at night, a dark cap.
    fill(s, 19, top - 10, 29, top - 2, role('glass', 1), FLAG.LIGHT);
    for (let x = 19; x <= 29; x += 5) fill(s, x, top - 10, x, top - 2, role('metal', 0));
    for (let y = 0; y < 5; y++) fill(s, 19 + y, top - 11 - y, 29 - y, top - 11 - y, role('roof', y === 0 ? 0 : 1));
    fill(s, 24, top - 17, 24, top - 16, role('metal', 1));
    // The keeper's hut at the foot, to the right.
    for (let y = H - 14; y < H; y++) for (let x = 38; x <= 54; x++) put(s, x, y, (x - 38) % 4 === 3 ? white[0] : white[1]);
    for (let y = 0; y < 6; y++) fill(s, 37 + y, H - 15 - y, 55 - y, H - 15 - y, role('roof', y === 5 ? 2 : 1));
    fill(s, 44, H - 10, 47, H - 6, role('glass', 1), 0);
    return s;
  });
}

/** Something enormous, long dead, half in the ground: an arched spine, ribs curving down into the earth, a skull. */
function skeleton(v: number): Stamp {
  return cached(`mark:skeleton:${v}`, () => {
    const W = 190;
    const H = 58;
    const s = newStamp(W, H, 95);
    const bone = [role('bone', 0), role('bone', 1), role('bone', 2)];
    // The spine, an arch from the buried tail up toward the neck and down again to the skull.
    const spineY = (x: number): number => H - 2 - Math.round(50 * Math.sin(Math.PI * Math.min(1, Math.max(0, (x - 6) / 160))) ** 0.8);
    for (let x = 6; x <= 160; x++) {
      const y = spineY(x);
      put(s, x, y, bone[2]);
      put(s, x, y + 1, bone[1]);
      if (x % 5 === 0) put(s, x, y - 1, bone[1]);
    }
    // Ribs: from the spine, curving out and down to the ground, the near ones fuller.
    for (let x = 40; x <= 132; x += 9) {
      const y0 = spineY(x) + 2;
      const len = H - y0;
      for (let k = 0; k < len; k++) {
        const t = k / len;
        const rx = Math.round(x + 14 * Math.sin(t * Math.PI * 0.9) - 4 * t);
        put(s, rx, y0 + k, t < 0.5 ? bone[1] : bone[0]);
        if (t < 0.6) put(s, rx + 1, y0 + k, bone[0]);
      }
    }
    // The skull, lying at the end: a long jaw, an eye socket, a few teeth.
    for (let y = H - 16; y < H; y++)
      for (let x = 160; x <= 186; x++) {
        const dy = (y - (H - 9)) / 8;
        const dx = (x - 170) / 17;
        if (dx * dx + dy * dy > 1.05 && !(x > 176 && y > H - 9)) continue;
        put(s, x, y, y < H - 13 ? bone[2] : bone[1]);
      }
    fill(s, 167, H - 12, 170, H - 9, role('soil', 0), 0);
    for (let x = 175; x <= 185; x += 2) put(s, x, H - 6, bone[2], 0);
    fill(s, 175, H - 5, 186, H - 5, role('soil', 0), 0);
    return s;
  });
}

// ── The far hills (3.6 px a metre) ─────────────────────────────────────────

/** A radio mast: a narrow lattice with cross-bracing and guy wires; its red lamp blinks (the stage's). */
function mast(): Stamp {
  return cached('mark:mast', () => {
    const W = 80;
    const H = 112;
    const s = newStamp(W, H, 40);
    const m = role('metal', 0);
    const top = H - 108;
    for (let y = top; y < H; y++) {
      const half = y > H - 40 ? 2 : 1;
      put(s, 40 - half, y, m);
      put(s, 40 + half, y, m);
      // Cross-bracing: a zigzag between the legs.
      const k = (y - top) % 6;
      put(s, 40 - half + Math.min(2 * half, Math.round((k / 6) * 2 * half)), y, m);
    }
    // Guy wires from two heights to anchors on the ground either side.
    for (const [hy, reach] of [
      [H - 36, 26],
      [H - 76, 38],
    ] as const) {
      line(s, 40, hy, 40 - reach, H - 1, role('wire', 0), 0);
      line(s, 40, hy, 40 + reach, H - 1, role('wire', 0), 0);
    }
    // A small hut at the foot.
    fill(s, 44, H - 6, 52, H - 1, role('stone', 1));
    fill(s, 43, H - 7, 53, H - 7, role('roof', 1));
    put(s, 40, top - 1, role('metal', 1));
    return s;
  });
}

// ── The playfield (18 px a metre) ──────────────────────────────────────────

/** A rusted car, long abandoned: rounded body, broken dark windows, flat tyres, weeds through it. */
function car(v: number): Stamp {
  return cached(`mark:car:${v}`, () => {
    const random = rng(0xca7 + v);
    const W = 80;
    const H = 28;
    const s = newStamp(W, H, 40);
    const m = [role('metal', 0), role('metal', 1), role('metal', 2), role('metal', 3)];
    const ground = H - 1;
    // Profile: the top of the body at each column (roof, windscreen, hood, trunk).
    const topAt = (x: number): number => {
      if (x < 4) return 14 + (4 - x);
      if (x < 22) return 11 + (x < 8 ? 1 : 0);
      if (x < 29) return 11 - Math.round(((x - 22) / 7) * 8);
      if (x < 47) return 3;
      if (x < 56) return 3 + Math.round(((x - 47) / 9) * 8);
      if (x < 76) return 11 + Math.round(((x - 56) / 20) * 2);
      return 13 + (x - 76);
    };
    for (let x = 1; x < 79; x++) {
      const t = topAt(x);
      for (let y = t; y <= ground - 4; y++) {
        let r = y === t ? m[3] : y < 12 ? m[2] : y < 19 ? m[2] : m[1];
        if (y === ground - 4) r = m[0];
        if (y === 15 && x > 3 && x < 77) r = m[0];
        put(s, x, y, r);
      }
    }
    // Windows in the cabin, dark; one broken out.
    for (let x = 24; x < 54; x++) {
      const t = topAt(x) + 2;
      for (let y = t; y <= 10; y++) {
        if (x === 37 || x === 38) continue;
        const broken = x > 25 && x < 36 && y > t && random() < 0.85;
        put(s, x, y, broken ? 0 : role('glass', 0), 0);
      }
    }
    // Rust holes and a door seam.
    for (let i = 0; i < 9; i++) put(s, 6 + Math.floor(random() * 68), 13 + Math.floor(random() * 8), m[0]);
    fill(s, 37, 11, 37, ground - 5, m[0]);
    // Flat tyres sunk into the ground.
    for (const cx of [15, 63]) {
      for (let y = ground - 9; y <= ground; y++)
        for (let x = cx - 6; x <= cx + 6; x++) {
          const dx = x - cx;
          const dy = y - (ground - 3);
          if (dx * dx + dy * dy * 1.3 > 40) continue;
          put(s, x, y, dx * dx + dy * dy < 4 ? role('rail', 1) : role('rail', 0));
        }
    }
    // Bumpers.
    fill(s, 0, ground - 7, 2, ground - 6, role('rail', 1));
    fill(s, 77, ground - 7, 79, ground - 6, role('rail', 1));
    // Weeds growing round and through it.
    for (let x = 2; x < 78; x += 2 + Math.floor(random() * 4)) {
      const h = 2 + Math.floor(random() * 6);
      for (let y = 0; y < h; y++) put(s, x, ground - y, role('grass', y === h - 1 ? 3 : 1), Math.min(7, y + 1));
    }
    return s;
  });
}

/** A roadside shrine: a post, a little roofed box, a candle that burns day and night, flowers at its foot. */
function shrine(v: number): Stamp {
  return cached(`mark:shrine:${v}`, () => {
    const W = 16;
    const H = 34;
    const s = newStamp(W, H, 8);
    fill(s, 7, 14, 8, H - 1, role('wood', 1));
    fill(s, 7, 14, 7, H - 1, role('wood', 2));
    // The box, open at the front, dark inside.
    fill(s, 3, 6, 12, 14, role('wood', 2));
    fill(s, 4, 8, 11, 13, role('wood', 0), 0);
    // Its roof.
    for (let y = 0; y < 4; y++) fill(s, 2 + y, 5 - y, 13 - y, 5 - y, role('roof', y === 3 ? 2 : 1));
    // The candle and its flame.
    fill(s, 7, 11, 7, 13, role('bone', 2), 0);
    put(s, 7, 10, role('fire', 4), FLAG.LIGHT);
    put(s, 7, 9, role('fire', 3), FLAG.LIGHT);
    // Flowers and a stone at the foot.
    for (const [x, c] of [
      [4, 1],
      [11, 2],
      [12, 1],
    ] as const) {
      fill(s, x, H - 4, x, H - 1, role('grass', 2), 3);
      put(s, x, H - 5, role('flower', c), 4);
    }
    fill(s, 9, H - 2, 11, H - 1, role('stone', 2));
    void v;
    return s;
  });
}

/** Someone else's camp, abandoned: a sagging tent with a torn flap, a cold fire ring, a pot on a tripod. */
function camp(v: number): Stamp {
  return cached(`mark:camp:${v}`, () => {
    const random = rng(0xca39 + v);
    const W = 76;
    const H = 26;
    const s = newStamp(W, H, 38);
    const canvas = [role('dry', 0), role('dry', 1), role('dry', 2), role('dry', 3)];
    // The tent: an A-frame from the side, the ridge sagging, the near flap torn open.
    for (let x = 2; x <= 44; x++) {
      const sag = Math.round(2 * Math.sin(((x - 2) / 42) * Math.PI));
      const t = Math.abs(x - 23) / 21;
      const top = Math.round(4 + t * 18) + (t < 0.9 ? sag : 0);
      for (let y = top; y < H; y++) {
        const torn = x > 26 && x < 34 && y > top + 3 && y < H - 2 && random() < 0.8;
        put(s, x, y, torn ? 0 : y === top ? canvas[3] : x < 23 ? canvas[2] : canvas[1]);
      }
    }
    fill(s, 23, 2, 23, H - 1, role('wood', 1));
    // Guy lines to pegs.
    line(s, 2, H - 6, 0, H - 1, role('wire', 0), 0);
    line(s, 44, H - 6, 47, H - 1, role('wire', 0), 0);
    // The fire ring, cold: stones round grey ash.
    for (let x = 54; x <= 68; x++) put(s, x, H - 1, (x - 54) % 3 === 0 ? role('stone', 2) : role('soil', 1));
    for (const x of [54, 57, 60, 63, 66]) fill(s, x, H - 3, x + 1, H - 2, role('stone', 1));
    put(s, 60, H - 2, role('smoke', 0));
    put(s, 61, H - 2, role('smoke', 1));
    // A tripod and a pot hanging over it.
    line(s, 56, H - 3, 61, H - 18, role('wood', 1), 0);
    line(s, 66, H - 3, 61, H - 18, role('wood', 1), 0);
    fill(s, 61, H - 16, 61, H - 13, role('wire', 0), 0);
    fill(s, 59, H - 12, 63, H - 8, role('metal', 0));
    fill(s, 59, H - 12, 63, H - 12, role('metal', 2));
    return s;
  });
}
