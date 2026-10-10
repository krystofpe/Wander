// Clouds on the cloud layer: separate cumulus heaps (a few round lobes on a flat base, lit on top, shaded beneath, a
// rim that catches the sunset) and, under heavy skies, a flat deck behind them (research: Procgen §22, Pixel craft
// §27). Each pixel also stores how much sky must be covered before it shows, so one painted field serves every
// weather: a clear sky shows a couple of clouds, an overcast one all of them and the deck.
import { BIOME_IDS } from '../biomes.ts';
import { columnDistance } from '../layers.ts';
import type { LayerDef } from '../layers.ts';
import { fbm1, rng } from '../noise.ts';
import { role } from '../palette.ts';
import { biomeAt } from '../world.ts';
import { Chunk } from './chunk.ts';

const C = [role('cloud', 0), role('cloud', 1), role('cloud', 2), role('cloud', 3)];

/**
 * The cover (of 127, as the resolve shader compares it) at which the deck's top row shows, and its foot: it starts
 * coming down from above the screen at about 75% and closes the sky at about 92%, an overcast sky. How much its edge
 * waves, in cover.
 */
const DECK = { from: 92, to: 117, ragged: 1.2 } as const;

/** One cloud cell every CELL layer px; a cloud is up to MAX px wide. */
const CELL = 150;
const MAX = 150;

type Cloud = { x: number; w: number; base: number; lobes: { cx: number; r: number }[]; need: number };

function cloudAt(seed: number, k: number): Cloud {
  const random = rng((seed ^ Math.imul(k, 0x2545f491)) >>> 0);
  const w = 40 + Math.floor(random() * (MAX - 40));
  const x = k * CELL + Math.floor(random() * (CELL - 20));
  const base = 58 + Math.floor(random() * 60);
  const n = Math.max(3, Math.round(w / 11)) + Math.floor(random() * 3);
  const lobes: { cx: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    // Bigger lobes toward the middle, each different, so the top is lumpy and never flat.
    const r = 4 + (w / n) * (0.35 + 0.9 * Math.sin(t * Math.PI)) * (0.6 + 0.8 * random());
    lobes.push({ cx: x + t * w + (random() - 0.5) * (w / n) * 0.6, r });
  }
  // A clear sky shows only the clouds that need little cover.
  return { x, w, base, lobes, need: Math.floor(random() * 100) };
}

/** Is the pixel (u, row of the view) inside the cloud, and how far below its top? */
function inside(c: Cloud, u: number, row: number): number {
  if (row > c.base || u < c.x - 4 || u > c.x + c.w + 4) return -1;
  let top = Infinity;
  for (const l of c.lobes) {
    const dx = u - l.cx;
    if (Math.abs(dx) > l.r) continue;
    top = Math.min(top, c.base - Math.sqrt(l.r * l.r - dx * dx) - l.r * 0.15);
  }
  if (top === Infinity || row < top) return -1;
  return row - top;
}

/** Paints a chunk of the cloud layer. Rows are in the view (0 at its top); the texture adds the layer's top margin. */
export function paintClouds(c: Chunk, seed: number, layer: LayerDef, u0: number): void {
  c.clear(u0);
  const clouds: Cloud[] = [];
  for (let k = Math.floor((u0 - MAX - CELL) / CELL); k * CELL < u0 + c.w + CELL; k++) clouds.push(cloudAt(seed, k));
  for (let x = 0; x < c.w; x++) {
    const u = u0 + x;
    const blend = biomeAt(seed, columnDistance(u, layer.z));
    c.setColumnBiome(u, BIOME_IDS.indexOf(blend.a), BIOME_IDS.indexOf(blend.b), blend.k);
    // The deck under heavy skies: as the sky closes it comes down from above the top of the screen, its edge ragged
    // and level across the sky (each row needs a little more cover than the one above it, never a column more than
    // its neighbour), until at full cover it reaches a ragged foot over the light of the horizon. Darker overhead,
    // dithered into the lighter body.
    const deckTop = -44;
    const deckFoot = 128 + Math.round(fbm1(u / 25, seed ^ 0xdee, 2, 0.5) * 10);
    const ragged = fbm1(u / 34, seed ^ 0xdef, 2, 0.5) * DECK.ragged;
    for (let row = deckTop; row < deckFoot; row++) {
      const dark = row < 14 || (row < 34 && ((u + row) & 1) === 0 && row < 14 + ((u * 7 + row * 3) % 20));
      const r = row >= deckFoot - 10 ? C[0] : dark ? C[0] : C[1];
      const need = DECK.from + ((DECK.to - DECK.from) * (row - deckTop)) / (deckFoot - deckTop) + ragged;
      c.set(u, layer.top + row, r, Math.max(0, Math.min(127, Math.round(need))));
    }
    for (const cl of clouds) {
      for (let row = cl.base - 40; row <= cl.base; row++) {
        const below = inside(cl, u, row);
        if (below < 0) continue;
        const depth = cl.base - row;
        // Lit on top (the rim catches the sunset), the body, a shaded belly, the darkest base.
        const r = below < 2 ? C[3] : depth < 2 ? C[0] : depth < 6 ? C[1] : C[2];
        c.set(u, layer.top + row, r, Math.min(95, cl.need));
      }
    }
  }
}
