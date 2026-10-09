// The far land: ridges, mountains, mesas, dunes, hills and the sea on the land layers, as silhouettes shaded in a
// few flat planes, crowned by tree lines, stones or ruins drawn as part of the silhouette (research: Pixel craft
// §8, §12, §27; Depth §10). Pure: the same seed, layer and chunk paint the same bytes.
import { BIOME_IDS } from '../biomes.ts';
import type { BiomeId } from '../biomes.ts';
import { columnDistance, WALK_Y, baseline } from '../layers.ts';
import type { LayerDef } from '../layers.ts';
import { fbm1, noise1, unit } from '../noise.ts';
import { role } from '../palette.ts';
import { biomeAt, blended } from '../world.ts';
import { Chunk, FLAG } from './chunk.ts';

const R = {
  deep: role('land', 0),
  shade: role('land', 1),
  faceL: role('land', 2),
  faceR: role('land', 3),
  rim: role('land', 4),
  snowShade: role('snow', 1),
  snowFace: role('snow', 2),
  snowLit: role('snow', 3),
  water0: role('water', 0),
  water1: role('water', 1),
  water2: role('water', 2),
  water3: role('water', 3),
};

/** The horizon's row on screen: lower under big skies (plateau, salt flat, coast), higher in closed country. */
export const HORIZON: Readonly<Record<BiomeId, number>> = {
  pine: 176,
  birch: 180,
  meadow: 190,
  autumn: 182,
  plateau: 206,
  pass: 184,
  coast: 206,
  desert: 196,
  tundra: 198,
  swamp: 200,
  saltflat: 222,
  stones: 190,
  ruins: 186,
  rail: 192,
};

type Style = 'round' | 'ridged' | 'mesa' | 'dune' | 'sea';
type Cover = 'none' | 'conifer' | 'broad' | 'birch' | 'dead' | 'stones' | 'ruins' | 'poles' | 'reeds';
/** One land layer of one biome: amplitude (px at that layer), feature width (layer px), style and what crowns it. */
type Form = readonly [number, number, Style, Cover];

/** Per biome, the five land layers from the farthest (mountains, z 22) to the nearest (hills, z 3). */
const FORMS: Readonly<Record<BiomeId, readonly [Form, Form, Form, Form, Form]>> = {
  pine: [[95, 210, 'ridged', 'none'], [62, 150, 'round', 'conifer'], [46, 120, 'round', 'conifer'], [38, 95, 'round', 'conifer'], [34, 80, 'round', 'conifer']],
  birch: [[55, 260, 'round', 'none'], [40, 190, 'round', 'broad'], [32, 150, 'round', 'birch'], [27, 110, 'round', 'birch'], [24, 90, 'round', 'birch']],
  meadow: [[42, 300, 'round', 'none'], [30, 240, 'round', 'none'], [26, 190, 'round', 'broad'], [20, 150, 'round', 'none'], [16, 130, 'round', 'broad']],
  autumn: [[52, 260, 'round', 'none'], [44, 200, 'round', 'broad'], [38, 150, 'round', 'broad'], [32, 115, 'round', 'broad'], [28, 95, 'round', 'broad']],
  plateau: [[72, 300, 'mesa', 'none'], [46, 260, 'mesa', 'none'], [16, 220, 'round', 'none'], [10, 170, 'round', 'none'], [8, 130, 'round', 'none']],
  pass: [[140, 170, 'ridged', 'none'], [108, 140, 'ridged', 'none'], [70, 115, 'ridged', 'none'], [36, 95, 'round', 'conifer'], [20, 80, 'round', 'stones']],
  coast: [[38, 300, 'round', 'none'], [0, 200, 'sea', 'none'], [0, 160, 'sea', 'none'], [0, 120, 'sea', 'none'], [7, 90, 'dune', 'reeds']],
  desert: [[48, 260, 'mesa', 'none'], [82, 220, 'mesa', 'none'], [56, 180, 'mesa', 'none'], [18, 150, 'dune', 'none'], [14, 110, 'dune', 'none']],
  tundra: [[62, 240, 'ridged', 'none'], [40, 200, 'round', 'none'], [24, 160, 'round', 'conifer'], [16, 130, 'round', 'none'], [12, 100, 'round', 'none']],
  swamp: [[0, 300, 'round', 'none'], [12, 220, 'round', 'dead'], [9, 170, 'round', 'conifer'], [11, 130, 'round', 'dead'], [9, 100, 'round', 'reeds']],
  saltflat: [[46, 300, 'mesa', 'none'], [24, 260, 'mesa', 'none'], [0, 200, 'round', 'none'], [0, 160, 'round', 'poles'], [0, 120, 'round', 'none']],
  stones: [[46, 260, 'round', 'none'], [36, 200, 'round', 'none'], [28, 150, 'round', 'stones'], [22, 120, 'round', 'none'], [18, 100, 'round', 'stones']],
  ruins: [[40, 260, 'round', 'none'], [30, 200, 'round', 'ruins'], [26, 150, 'round', 'ruins'], [22, 110, 'round', 'broad'], [18, 90, 'round', 'ruins']],
  rail: [[46, 260, 'round', 'none'], [32, 200, 'round', 'none'], [26, 150, 'round', 'broad'], [20, 120, 'round', 'poles'], [16, 100, 'round', 'none']],
};

/** Which of the five land layers a layer is (by depth), or −1. */
function landIndex(z: number): number {
  return z >= 20 ? 0 : z >= 12 ? 1 : z >= 7 ? 2 : z >= 4 ? 3 : z >= 2.5 ? 4 : -1;
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** One biome's silhouette height (px above the layer's baseline) at layer column u. */
function shapeHeight(seed: number, form: Form, salt: number, u: number): number {
  const [amp, wave, style] = form;
  if (amp <= 0 || style === 'sea') return 0;
  const s = seed ^ salt;
  const x = u / wave;
  let n: number;
  switch (style) {
    case 'ridged': {
      // Sharp crests: 1 − |noise|, sharpened, over a broad swell.
      const r = 1 - Math.abs(fbm1(x, s ^ 0x55, 4, 0.5) * 1.7);
      n = 0.35 * fbm1(x * 0.4, s, 2, 0.5) + 0.75 * Math.pow(Math.max(0, r), 1.6) - 0.15;
      break;
    }
    case 'mesa': {
      // Flat tops and cliff steps (terraces), with long level plains between them.
      const base = fbm1(x * 0.7, s, 3, 0.45);
      const t = Math.max(0, base + 0.15) * 3.2;
      const f = t - Math.floor(t);
      n = (Math.floor(t) + smooth(0.78, 0.94, f)) / 3.2 - 0.05;
      break;
    }
    case 'dune':
      n = fbm1(x, s, 2, 0.35) * 0.8 + 0.2 * Math.abs(noise1(x * 2.1, s ^ 9));
      break;
    default:
      n = fbm1(x, s, 3, 0.42);
  }
  return Math.max(0, (0.5 + 0.6 * n) * amp);
}

/** Height of the silhouette at a column, blended across biomes (heights blended, never frequencies). */
export function landHeight(seed: number, layer: LayerDef, li: number, u: number): number {
  const k = landIndex(layer.z);
  if (k < 0) return 0;
  const d = columnDistance(u, layer.z);
  const blend = biomeAt(seed, d, 90);
  const salt = 0x4a1d + li * 7919;
  return blended(blend, (id) => shapeHeight(seed, FORMS[id][k], salt, u));
}

/** The layer's baseline row in its texture at a column. */
export function landBase(seed: number, layer: LayerDef, u: number): number {
  const d = columnDistance(u, layer.z);
  const yh = blended(biomeAt(seed, d), (id) => HORIZON[id]);
  return layer.top + Math.round(baseline(layer.z, yh, WALK_Y));
}

/** How much of the layer at this column is open sea (the coast's far layers). */
function seaShare(seed: number, layer: LayerDef, u: number): number {
  const k = landIndex(layer.z);
  const b = biomeAt(seed, columnDistance(u, layer.z), 90);
  const sea = (id: BiomeId): number => (FORMS[id][k][2] === 'sea' ? 1 : 0);
  return blended(b, sea);
}

/** What crowns the silhouette at this column: the dominant biome's cover. */
function coverAt(seed: number, layer: LayerDef, u: number): Cover {
  const k = landIndex(layer.z);
  const b = biomeAt(seed, columnDistance(u, layer.z), 60);
  return FORMS[b.k < 0.5 ? b.a : b.b][k][3];
}

/**
 * The crown's extra height at a column: tree tips, rounded crowns, spikes, stones, broken walls, poles. Drawn as
 * part of the silhouette, as a far tree line is: one flat shape with a lit rim (research: Procgen §19).
 */
function crown(seed: number, cover: Cover, z: number, u: number, salt: number): number {
  if (cover === 'none') return 0;
  const scale = Math.min(1.6, 4 / z + 0.25);
  const cell = Math.max(2, Math.round((cover === 'conifer' ? 3 : cover === 'birch' ? 3 : cover === 'broad' ? 6 : cover === 'reeds' ? 2 : 9) * scale));
  const k = Math.floor(u / cell);
  let h = 0;
  // A thing per cell, maybe; neighbours overlap.
  for (let j = k - 2; j <= k + 2; j++) {
    const r = unit(j, seed ^ salt);
    const grove = fbm1(j * cell / 140, seed ^ salt ^ 0x31, 2, 0.5);
    const present = cover === 'conifer' || cover === 'broad' || cover === 'birch' ? r < 0.75 + grove * 0.6 : cover === 'reeds' ? r < 0.6 : r < 0.18;
    if (!present) continue;
    const cx = j * cell + Math.floor(unit(j * 7 + 3, seed ^ salt) * cell);
    const size = (0.6 + 0.8 * unit(j * 13 + 5, seed ^ salt)) * scale;
    const dx = Math.abs(u - cx);
    let t = 0;
    switch (cover) {
      case 'conifer': {
        const th = 10 * size;
        t = th - dx * 2.6;
        break;
      }
      case 'birch': {
        const th = 9 * size;
        t = dx <= 1 ? th : th - dx * 2.2 - 2;
        break;
      }
      case 'broad': {
        const rad = 4 * size + 1;
        t = dx < rad ? Math.sqrt(rad * rad - dx * dx) + 2 * size : 0;
        break;
      }
      case 'dead':
        t = dx === 0 ? 9 * size : dx === 1 && unit(j * 5, seed) < 0.5 ? 4 * size : 0;
        break;
      case 'reeds':
        t = dx === 0 ? 3 * size : 0;
        break;
      case 'stones':
        t = dx <= Math.round(size) ? 5 * size : 0;
        break;
      case 'ruins': {
        const w = Math.round(4 * size + 3);
        t = dx <= w ? (6 + 7 * unit(j * 3, seed)) * size - (u % 3 === 0 && dx > 1 ? 2 : 0) : 0;
        break;
      }
      case 'poles':
        t = dx === 0 ? 14 * size : 0;
        break;
    }
    h = Math.max(h, t);
  }
  return Math.max(0, h);
}

/** Paints a chunk of a land layer: silhouette and crown, faces toward each side of the sky, a rim on top, snow. */
export function paintLand(c: Chunk, seed: number, layer: LayerDef, li: number, u0: number): void {
  c.clear(u0);
  const H = c.h;
  const pad = 4;
  const n = c.w + 2 * pad;
  const ground = new Float32Array(n);
  const tops = new Float32Array(n);
  const salt = 0x6c3 + li * 811;
  for (let i = 0; i < n; i++) {
    const u = u0 + i - pad;
    ground[i] = landHeight(seed, layer, li, u);
    tops[i] = ground[i] + crown(seed, coverAt(seed, layer, u), layer.z, u, salt);
  }
  for (let x = 0; x < c.w; x++) {
    const u = u0 + x;
    const d = columnDistance(u, layer.z);
    const blend = biomeAt(seed, d);
    c.setColumnBiome(u, BIOME_IDS.indexOf(blend.a), BIOME_IDS.indexOf(blend.b), blend.k);
    const base = landBase(seed, layer, u);
    const i = x + pad;
    const top = Math.round(base - tops[i]);
    const landTop = Math.round(base - ground[i]);
    // Faces: smoothed slope of the bare land (not the crown) says which way it looks.
    const slope = (ground[i + 2] - ground[i - 2]) / 4;
    const cold = blended(blend, (id) => (id === 'pass' || id === 'tundra' ? 1 : 0));
    const k = landIndex(layer.z);
    const amp = blended(blend, (id) => FORMS[id][k][0]);
    const snowy = cold > 0.5 && ground[i] > amp * (k <= 1 ? 0.55 : 0.75) && layer.z >= 5;
    const faceDepth = 2 + Math.round(3 * unit(Math.floor(u / 4), seed ^ li)) + Math.round(ground[i] * 0.08);
    const shadeDepth = faceDepth + 5 + Math.round(ground[i] * 0.3);
    for (let y = top; y < H; y++) {
      let r: number;
      if (y < landTop) {
        // The crown (tree line, stones, walls): one flat shape in the shade colour, as distant woods read.
        r = R.shade;
      } else {
        const below = y - landTop;
        // The rim catches only crests and steep faces; flat land has none, or the plains would stack in stripes.
        const crest = ground[i] > amp * 0.55 && ground[i] >= ground[i - 2] && ground[i] >= ground[i + 2];
        const rimmed = crest || Math.abs(slope) > 0.35;
        if (below === 0 && top === landTop && (rimmed || snowy)) r = snowy ? R.snowLit : R.rim;
        else if (below === 0 && top === landTop) r = slope > 0.1 ? R.faceL : slope < -0.1 ? R.faceR : R.shade;
        else if (below <= faceDepth) {
          const face = slope > 0.15 ? R.faceL : slope < -0.15 ? R.faceR : R.shade;
          r = snowy ? (face === R.shade ? R.snowShade : R.snowFace) : face;
        } else {
          // The body below is the land's face turned to us, lit by the sky: one shade, never a black void, with a
          // few strata drawn across it so a big face reads as drawn.
          r = R.shade;
          const cell = Math.floor((u + (below >> 1) * 7) / 5);
          const rocky = blended(blend, (id) => (FORMS[id][k][2] === 'mesa' || FORMS[id][k][2] === 'ridged' ? 1 : 0));
          const strata = Math.floor((u + below * 11) / 9);
          if (rocky > 0.5 && below > faceDepth + 3 && below % 5 === 0 && unit(strata * 31 + below, seed ^ (li * 977)) < 0.18) r = R.deep;
          void cell;
        }
        void shadeDepth;
      }
      c.set(u, y, r, FLAG.RIM);
    }
    // Scattered growth on the slopes below the crest: tiny dark conifers, crowns, birches or boulders, thinning
    // toward the foot, so a hill's body reads as a wooded or stony slope instead of a flat colour.
    const cover = coverAt(seed, layer, u);
    if (cover !== 'none' && cover !== 'reeds' && cover !== 'poles' && cover !== 'ruins') {
      const scale = Math.min(1.4, 4 / layer.z + 0.3);
      const cell = Math.max(3, Math.round(5 * scale));
      for (let row = 0; row < 7; row++) {
        const cy = Math.floor(row * 9 * scale) + 6;
        const j = Math.floor((u + row * 17) / cell);
        const r0 = unit(j * 8 + row, seed ^ (salt + 0x51));
        if (r0 > (cover === 'stones' ? 0.18 : 0.62) * (1 - row * 0.11)) continue;
        const cx = j * cell - row * 17 + Math.floor(unit(j * 8 + row + 3, seed ^ salt) * cell);
        const dx = Math.abs(u - cx);
        const hgt = Math.round((3 + 4 * unit(j * 8 + row + 5, seed ^ salt)) * scale);
        const tipY = landTop + cy - hgt;
        let span = -1;
        if (cover === 'conifer') span = Math.floor((hgt - 1) / 2.6) - dx >= 0 ? 0 : -1;
        else if (cover === 'stones') span = dx <= Math.round(scale) ? 0 : -1;
        else span = dx <= Math.round(hgt * 0.45) ? 0 : -1;
        if (span < 0) continue;
        const from = cover === 'conifer' ? tipY + Math.round(dx * 2.6) : tipY + (cover === 'stones' ? Math.round(hgt * 0.5) : Math.round((dx * dx) / Math.max(1, hgt * 0.5)));
        for (let y = Math.max(from, landTop + 1); y <= landTop + cy && y < H; y++) c.set(u, y, y === from && cover !== 'conifer' ? R.shade : R.deep, FLAG.RIM);
      }
    }
    // The sea: painted on the ridge layer only (the layers either side leave it alone, or their haze would step it
    // into bands), from a bright horizon line down: lighter far off, darker near, short glints travelling by colour
    // cycling.
    if (seaShare(seed, layer, u) > 0.5) {
      const own = k === 2;
      for (let y = top; y < H; y++) {
        if (!own) {
          c.set(u, y, 0, 0);
          continue;
        }
        const kk = y - top;
        const row = Math.floor(kk / 2);
        const dash = unit(Math.floor((u + row * 13) / (3 + (row % 3))) * 64 + row, seed ^ 0x5ea) < 0.16 - Math.min(0.1, kk * 0.002);
        const r = kk === 0 ? R.water3 : dash ? (kk < 12 ? R.water3 : R.water2) : kk < 6 ? R.water2 : kk < 30 ? R.water1 : R.water0;
        c.set(u, y, r, FLAG.WATER);
      }
    }
  }
}
