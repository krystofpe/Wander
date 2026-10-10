// What grows in the deep beyond the hollow, as pixel-art stamps made from a seed and cached (as plants.ts makes
// trees): giant mushrooms like jellyfish, their dark domed caps glowing underneath and trailing threads of light;
// stalagmites, a glowing drip on the odd tip; clusters of crystal; small glowing mushrooms in the moss. After
// Blackreach measured (docs/research/blackreach-research.md). Pure.
import { rng } from '../noise.ts';
import { role } from '../palette.ts';
import { FLAG, newStamp, put } from './chunk.ts';
import type { Stamp } from './chunk.ts';
import { cached, cleanup } from './plants.ts';

const CAP = [role('leaf', 0), role('leaf', 1), role('leaf', 2), role('leaf', 3), role('leaf', 4)];
const STEM = [role('birch', 0), role('birch', 1), role('birch', 2), role('birch', 3)];
const GLOW = [role('shroom', 0), role('shroom', 1), role('shroom', 2)];
const ROCK = [role('rock', 0), role('rock', 1), role('rock', 2), role('rock', 3), role('rock', 4)];
const CRYSTAL = [role('water', 1), role('water', 2), role('water', 3)];

/** How far a pixel `below` rows under where it hangs from sways, as FLAG.SWAY bits (0..7). */
const swayOf = (below: number, length: number): number => Math.min(7, Math.round((below / Math.max(1, length)) * 7));

/**
 * A giant mushroom like a jellyfish, `height` px from the ground to the top of its cap: a pale stem leaning a little,
 * a dark dome lit on its crown with a few glowing spores, the underside's rim glowing, gills in a dim row, and threads
 * of light hanging from the rim, swaying, fading as they fall.
 */
export function bigCap(seed: number, height: number): Stamp {
  return cached(`bigcap:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(14, Math.round(height));
    const r = Math.max(5, Math.round(h * (0.26 + 0.12 * random())));
    const capH = Math.max(4, Math.round(r * (0.55 + 0.2 * random())));
    const w = 2 * r + 5;
    const s = newStamp(w, h + 1, w >> 1);
    const cx = s.ax + Math.round((random() - 0.5) * 2);
    const lean = (random() - 0.5) * r * 0.5;
    // The stem: from the ground to under the cap, leaning, a dark side and a lit side.
    const sw = Math.max(2, Math.round(h * 0.035 + random()));
    const stemTop = capH;
    for (let y = stemTop; y <= h; y++) {
      const t = (y - stemTop) / Math.max(1, h - stemTop);
      const x0 = Math.round(cx - sw / 2 + lean * (1 - t) * (1 - t));
      const flare = y > h - 3 ? 1 : 0;
      for (let x = x0 - flare; x < x0 + sw + flare; x++) put(s, x, y, x === x0 - flare ? STEM[0] : x === x0 + sw - 1 + flare ? STEM[1] : STEM[2], FLAG.RIM);
    }
    // The cap: a dome, its rim drooping a little at the edges.
    const capX = Math.round(cx + lean);
    const tops: number[] = [];
    const bottoms: number[] = [];
    for (let dx = -r; dx <= r; dx++) {
      const t = Math.abs(dx) / r;
      const top = Math.round(capH * (1 - Math.sqrt(Math.max(0, 1 - t * t))) * 0.95);
      const bottom = capH + Math.round(t * t * 2);
      tops.push(top);
      bottoms.push(bottom);
      for (let y = top; y <= bottom; y++) {
        const down = (y - top) / Math.max(1, bottom - top);
        // Lit from above and from its left a little: bands, darker toward the rim.
        let b = down < 0.25 ? (dx < r * 0.2 ? 3 : 2) : down < 0.6 ? 2 : 1;
        if (y === top && Math.abs(dx) < r * 0.55) b = 4;
        if (y === bottom) b = 0;
        put(s, capX + dx, y, CAP[b], FLAG.RIM);
      }
    }
    // The glowing underside: the rim line, and the gills in a dotted row just inside it.
    for (let dx = -r; dx <= r; dx++) {
      const y = bottoms[dx + r];
      put(s, capX + dx, y, Math.abs(dx) > r - 2 ? GLOW[2] : GLOW[1]);
      if (Math.abs(dx) < r - 1 && (dx & 1) === 0) put(s, capX + dx, y + 1, GLOW[0]);
    }
    // Spores on its crown, a few.
    const spores = 1 + Math.floor(random() * (r / 2));
    for (let i = 0; i < spores; i++) {
      const dx = Math.round((random() - 0.5) * r * 1.2);
      put(s, capX + dx, tops[dx + r] + 1 + Math.floor(random() * 2), GLOW[2]);
    }
    // Threads of light hanging from the rim, longest toward the middle, fading as they fall.
    for (let dx = -r + 1; dx <= r - 1; dx += 3 + Math.floor(random() * 3)) {
      if (Math.abs(capX + dx - cx) <= sw && random() < 0.6) continue;
      const y0 = bottoms[dx + r] + 1;
      const room = h - y0 - 2;
      const length = Math.round(room * (0.12 + 0.45 * random()) * (1 - (Math.abs(dx) / r) * 0.4));
      let x = capX + dx;
      for (let k = 0; k < length; k++) {
        if (k > 3 && random() < 0.08) x += random() < 0.5 ? -1 : 1;
        const fade = k / Math.max(1, length);
        if (fade > 0.55 && (k & 1) === 1) continue;
        put(s, x, y0 + k, fade < 0.2 ? GLOW[1] : GLOW[0], swayOf(k, length));
      }
    }
    return s;
  });
}

/** A stalagmite `height` px tall: a tapered spike of rock, lit on one side, a glowing drip on the odd tip. */
export function stalagmite(seed: number, height: number): Stamp {
  return cached(`stalag:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(6, Math.round(height));
    const base = Math.max(3, Math.round(h * (0.22 + 0.14 * random())));
    const w = base + 2;
    const s = newStamp(w, h, w >> 1);
    const cx = (w - 1) / 2 + (random() - 0.5);
    const bend = (random() - 0.5) * base * 0.6;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      const half = (base / 2) * Math.pow(t, 0.8);
      const mid = cx + bend * (1 - t);
      const x0 = Math.round(mid - half);
      const x1 = Math.round(mid + half);
      for (let x = x0; x <= x1; x++) {
        const lit = x <= mid - half * 0.2;
        let b = y === h - 1 ? 0 : lit ? 3 : x >= x1 - 1 ? 1 : 2;
        if (y < h * 0.15 && lit) b = 4;
        put(s, x, y, ROCK[b], FLAG.RIM);
      }
      // A groove or two down its face.
      if (y > h * 0.3 && (y + seed) % 4 === 0 && x1 - x0 > 3) put(s, Math.round(mid + half * 0.3), y, ROCK[1], FLAG.RIM);
    }
    if (random() < 0.3) put(s, Math.round(cx + bend), 0, GLOW[2]);
    return s;
  });
}

/** A cluster of crystal, `width` px across: two to four shards, dark at the root, a glowing edge on each. */
export function crystals(seed: number, width: number): Stamp {
  return cached(`crystal:${seed}:${width}`, () => {
    const random = rng(seed);
    const w = Math.max(4, Math.round(width));
    const h = Math.max(4, Math.round(w * (0.9 + 0.5 * random())));
    const s = newStamp(w + 2, h, (w + 2) >> 1);
    const n = 2 + Math.floor(random() * 3);
    for (let i = 0; i < n; i++) {
      const bx = 1 + Math.round(((i + 0.5) / n) * w + (random() - 0.5) * 2);
      const sh = Math.round(h * (0.45 + 0.55 * random()));
      const tilt = (random() - 0.5) * 1.2;
      const half = 1 + Math.floor(random() * 2);
      for (let k = 0; k < sh; k++) {
        const y = h - 1 - k;
        const t = k / sh;
        const x = Math.round(bx + tilt * k);
        const wd = t > 0.75 ? 0 : half;
        for (let dx = -wd; dx <= wd; dx++) put(s, x + dx, y, dx === -wd ? GLOW[1] : t > 0.6 ? CRYSTAL[2] : dx > 0 ? CRYSTAL[0] : CRYSTAL[1]);
        if (t > 0.85) put(s, x, y, GLOW[2]);
      }
    }
    return s;
  });
}

/** Small glowing mushrooms in the moss, a cluster `height` px tall: pale stems, dark caps rimmed in light. */
export function glowCaps(seed: number, height: number): Stamp {
  return cached(`glowcap:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(3, Math.round(height));
    const n = 2 + Math.floor(random() * 4);
    const w = n * 3 + 3;
    const s = newStamp(w, h, w >> 1);
    for (let i = 0; i < n; i++) {
      const x = 1 + i * 3 + Math.floor(random() * 2);
      const sh = Math.max(2, Math.round(h * (0.4 + 0.6 * random())));
      for (let y = h - sh + 1; y < h; y++) put(s, x, y, STEM[2]);
      const top = h - sh;
      put(s, x - 1, top, GLOW[1]);
      put(s, x, top, CAP[1]);
      put(s, x + 1, top, GLOW[1]);
      if (sh > 3) {
        put(s, x, top - 1, CAP[2]);
        put(s, x, top, GLOW[2]);
      }
    }
    cleanup(s, (r) => GLOW.includes(r) || STEM.includes(r));
    return s;
  });
}
