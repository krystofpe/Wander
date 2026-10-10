// What grows and stands in the deep beyond the hollow, as pixel-art stamps made from a seed and cached (as plants.ts
// makes trees). After Blackreach (giant mushrooms like jellyfish, their dark caps glowing underneath and trailing
// threads of light; stalagmites; crystal) and the Underdark (tall pale-stemmed caps, torch-caps glowing amber, coral
// shelves stacked up a stalk, glowing bulbs, tube fungi, violet crystal, purple coral, the broken pillars and urns of
// a people who are gone; docs/research/blackreach-research.md). Pure.
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
const AMBER = [role('amber', 0), role('amber', 1), role('amber', 2)];
const CORAL = [role('coral', 0), role('coral', 1), role('coral', 2), role('coral', 3)];
const EMBER = [role('ember', 0), role('ember', 1), role('ember', 2)];
const PALE = [role('toy', 0), role('toy', 1)];
const VIOLET = [role('amethyst', 0), role('amethyst', 1), role('amethyst', 2)];
const PURPLE = [role('flower', 0), role('flower', 1), role('flower', 2)];
const STONE = [role('stone', 0), role('stone', 1), role('stone', 2), role('stone', 3)];

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

/**
 * A cluster of crystal, `width` px across: two to four shards, dark at the root, a glowing edge on each; violet
 * (amethyst) or the cold blue of the water.
 */
export function crystals(seed: number, width: number, violet = false): Stamp {
  return cached(`crystal:${seed}:${width}:${violet}`, () => {
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
        const body = violet ? [VIOLET[0], VIOLET[0], PURPLE[2]] : CRYSTAL;
        const edge = violet ? VIOLET : GLOW;
        for (let dx = -wd; dx <= wd; dx++) put(s, x + dx, y, dx === -wd ? edge[1] : t > 0.6 ? body[2] : dx > 0 ? body[0] : body[1]);
        if (t > 0.85) put(s, x, y, edge[2]);
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

/** A tall cap on a pale glowing stem, `height` px: the stem lit from inside, the cap dark with a rim of light. */
export function paleCap(seed: number, height: number): Stamp {
  return cached(`palecap:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(12, Math.round(height));
    const r = Math.max(4, Math.round(h * (0.16 + 0.08 * random())));
    const capH = Math.max(3, Math.round(r * 0.7));
    const w = 2 * r + 5;
    const s = newStamp(w, h + 1, w >> 1);
    const cx = s.ax;
    const bend = (random() - 0.5) * r * 0.5;
    for (let y = capH; y <= h; y++) {
      const t = (y - capH) / Math.max(1, h - capH);
      const x = Math.round(cx + bend * Math.sin(t * Math.PI));
      // Lit from inside, softly: a dim glow, brighter here and there.
      put(s, x, y, (y * 7 + seed) % 11 === 0 ? PALE[1] : PALE[0]);
      if (y > h - 2) put(s, x + 1, y, STEM[1]);
    }
    const capX = Math.round(cx + bend * Math.sin(0));
    for (let dx = -r; dx <= r; dx++) {
      const t = Math.abs(dx) / r;
      // A bell, its rim flaring a little.
      const top = Math.round(capH * (1 - Math.sqrt(Math.max(0, 1 - t * t))));
      const bottom = capH + (t > 0.7 ? 1 : 0);
      for (let y = top; y <= bottom; y++) put(s, capX + dx, y, y === bottom ? GLOW[1] : y === top && t < 0.5 ? CAP[3] : y - top < 2 ? CAP[2] : CAP[1], FLAG.RIM);
    }
    return s;
  });
}

/** A torch-cap, `height` px: a slender pale stem and a round cap glowing amber, like a lamp left burning. */
export function torchCap(seed: number, height: number): Stamp {
  return cached(`torch:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(8, Math.round(height));
    const r = Math.max(2, Math.round(h * (0.12 + 0.05 * random())));
    const w = 2 * r + 3;
    const s = newStamp(w, h + 1, w >> 1);
    const lean = (random() - 0.5) * 3;
    for (let y = r; y <= h; y++) {
      const t = (y - r) / Math.max(1, h - r);
      put(s, Math.round(s.ax + lean * (1 - t)), y, t > 0.85 ? STEM[1] : STEM[2]);
    }
    const capX = Math.round(s.ax + lean);
    for (let dy = 0; dy <= r + 1; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + (dy - r * 0.6) * (dy - r * 0.6) * 1.6);
        if (d > r + 0.3 || dy > r) continue;
        // Mostly the dull ember of it; a few pixels burning brighter.
        put(s, capX + dx, dy, d > r - 1.2 ? AMBER[0] : dx === -1 && dy === Math.round(r * 0.4) ? AMBER[2] : AMBER[1]);
      }
    return s;
  });
}

/** Coral shelves stacked up a stalk, `height` px: flat red caps, lit on top, dark under, smaller toward the top. */
export function shelves(seed: number, height: number): Stamp {
  return cached(`shelf:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(8, Math.round(height));
    const n = 2 + Math.floor(random() * 3);
    const w0 = Math.max(6, Math.round(h * (0.7 + 0.3 * random())));
    const s = newStamp(w0 + 2, h + 1, (w0 + 2) >> 1);
    for (let y = 2; y <= h; y++) put(s, s.ax, y, CORAL[1]);
    for (let i = 0; i < n; i++) {
      const k = i / Math.max(1, n - 1);
      const y = Math.round(h - 2 - k * (h - 4));
      const half = Math.max(2, Math.round((w0 / 2) * (1 - 0.45 * k)));
      const off = Math.round((random() - 0.5) * 2);
      for (let dx = -half; dx <= half; dx++) {
        const edge = Math.abs(dx) === half;
        put(s, s.ax + off + dx, y - 1, edge ? 0 : Math.abs(dx) < half * 0.5 ? CORAL[3] : CORAL[2], FLAG.RIM);
        put(s, s.ax + off + dx, y, edge ? CORAL[1] : CORAL[0], FLAG.RIM);
      }
      // A glowing gill or two at the rim.
      if (random() < 0.5) put(s, s.ax + off + half - 1, y, EMBER[1]);
    }
    return s;
  });
}

/** Glowing bulbs on thin stalks, a cluster `height` px tall, burning red-orange in the dark. */
export function bulbs(seed: number, height: number): Stamp {
  return cached(`bulbs:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(4, Math.round(height));
    const n = 3 + Math.floor(random() * 4);
    const w = n * 2 + 3;
    const s = newStamp(w, h + 1, w >> 1);
    for (let i = 0; i < n; i++) {
      const x = 1 + i * 2 + (random() < 0.5 ? 1 : 0);
      const sh = Math.max(2, Math.round(h * (0.35 + 0.65 * random())));
      for (let y = h - sh + 2; y <= h; y++) put(s, x, y, CORAL[1]);
      put(s, x, h - sh, EMBER[2]);
      put(s, x, h - sh + 1, EMBER[1]);
      if (random() < 0.5) put(s, x + 1, h - sh + 1, EMBER[0]);
    }
    return s;
  });
}

/** Tube fungi, a cluster `height` px tall: hollow columns flaring at their mouths, glowing blue from inside. */
export function tubes(seed: number, height: number): Stamp {
  return cached(`tubes:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(6, Math.round(height));
    const n = 2 + Math.floor(random() * 3);
    const w = n * 4 + 2;
    const s = newStamp(w, h + 1, w >> 1);
    for (let i = 0; i < n; i++) {
      const x = 1 + i * 4 + Math.floor(random() * 2);
      const th = Math.max(4, Math.round(h * (0.45 + 0.55 * random())));
      const top = h - th;
      for (let y = top; y <= h; y++) {
        const flare = y < top + 2 ? 1 : 0;
        for (let dx = -flare; dx <= 1 + flare; dx++) put(s, x + dx, y, y === top ? GLOW[2] : dx === 0 && y < top + 4 ? GLOW[1] : GLOW[0]);
      }
    }
    return s;
  });
}

/** Purple coral, a branching frond `height` px tall, swaying a little. */
export function coralFrond(seed: number, height: number): Stamp {
  return cached(`coral:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(5, Math.round(height));
    const w = Math.round(h * 0.9) + 3;
    const s = newStamp(w, h + 1, w >> 1);
    const branch = (x: number, y: number, len: number, lean: number, depth: number): void => {
      let px = x;
      for (let k = 0; k < len && y - k > 0; k++) {
        px += lean * (random() < 0.6 ? 1 : 0) * 0.5;
        put(s, Math.round(px), y - k, PURPLE[Math.min(2, depth + (k > len * 0.6 ? 1 : 0))], Math.min(7, Math.round(((h - (y - k)) / h) * 6)));
        if (depth < 2 && k > 1 && random() < 0.22) branch(px, y - k, Math.round(len * 0.55), random() < 0.5 ? -1 : 1, depth + 1);
      }
      put(s, Math.round(px), y - len, VIOLET[1]);
    };
    branch(s.ax, h, h - 1, (random() - 0.5) * 0.6, 0);
    return s;
  });
}

/** A broken pillar of the people who are gone, `height` px: fluted, lit down one side, its top snapped off. */
export function pillar(seed: number, height: number): Stamp {
  return cached(`pillar:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(10, Math.round(height));
    const pw = Math.max(5, Math.round(h * (0.16 + 0.06 * random())));
    const w = pw + 4;
    const s = newStamp(w, h, w >> 1);
    const x0 = 2;
    const tops: number[] = [];
    for (let x = 0; x < pw; x++) tops.push(Math.round((random() * 0.18 + (x / pw) * 0.12 * (random() < 0.5 ? 1 : -1) + 0.04) * h));
    for (let x = 0; x < pw; x++)
      for (let y = tops[x]; y < h - 2; y++) put(s, x0 + x, y, x === 0 ? STONE[3] : x === pw - 1 ? STONE[0] : (x + 1) % 3 === 0 ? STONE[1] : STONE[2], FLAG.RIM);
    // Its plinth.
    for (let x = -2; x < pw + 2; x++) for (let y = h - 2; y < h; y++) put(s, x0 + x, y, y === h - 2 ? STONE[2] : STONE[1], FLAG.RIM);
    // Now and then a mark on it still faintly glows.
    if (random() < 0.4) put(s, x0 + Math.floor(pw / 2), Math.round(h * 0.55), VIOLET[1]);
    return s;
  });
}

/** An urn left standing, `size` px tall: round-bellied, a narrow neck, a coral band. */
export function urn(seed: number, size: number): Stamp {
  return cached(`urn:${seed}:${size}`, () => {
    const random = rng(seed);
    const h = Math.max(6, Math.round(size));
    const r = Math.max(2, Math.round(h * 0.32));
    const w = 2 * r + 3;
    const s = newStamp(w, h, w >> 1);
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
      const half = t < 0.18 ? Math.max(1, Math.round(r * 0.45)) : Math.round(r * Math.sin(Math.min(1, (t - 0.12) / 0.88) * Math.PI) + 0.6);
      for (let dx = -half; dx <= half; dx++) put(s, s.ax + dx, y, Math.abs(y - h * 0.45) < 1 ? CORAL[1] : dx < -half / 2 ? STONE[3] : dx > half / 2 ? STONE[0] : STONE[1], FLAG.RIM);
    }
    void random;
    return s;
  });
}

const MOSS = [role('grass', 1), role('grass', 2), role('grass', 3), role('grass', 4)];
const BLOOMS: readonly (readonly number[])[] = [
  [role('heart', 0), role('amethyst', 2)],
  [role('amethyst', 1), role('amethyst', 2)],
  [role('toy', 0), role('toy', 1)],
];

/** A fern of the deep, `size` px across: soft green fronds curling out, their tips glowing faintly, swaying. */
export function glowFern(seed: number, size: number): Stamp {
  return cached(`glowfern:${seed}:${size}`, () => {
    const random = rng(seed);
    const h = Math.max(4, Math.round(size * 0.75));
    const w = Math.max(6, Math.round(size * 1.3));
    const s = newStamp(w, h, w >> 1);
    const fronds = 4 + Math.floor(random() * 3);
    for (let i = 0; i < fronds; i++) {
      const dir = (i / (fronds - 1)) * 2 - 1;
      let last: [number, number] = [s.ax, h - 1];
      for (let t = 0; t < 1; t += 0.07) {
        const x = Math.round(s.ax + dir * t * (w / 2));
        const y = Math.round(h - 1 - Math.sin(t * Math.PI * 0.85) * h * (0.65 + 0.35 * (1 - Math.abs(dir))));
        put(s, x, y, MOSS[Math.min(3, Math.floor(t * 4))], Math.min(7, Math.round(t * 6)));
        if (t > 0.25 && random() < 0.45) put(s, x, y + 1, MOSS[0], 3);
        last = [x, y];
      }
      if (random() < 0.6) put(s, last[0], last[1], GLOW[1], 6);
    }
    return s;
  });
}

/** Glowing flowers, a clump `height` px tall: thin stems, blossoms of pink, violet or blue light, nodding. */
export function blooms(seed: number, height: number): Stamp {
  return cached(`bloom:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(4, Math.round(height));
    const n = 2 + Math.floor(random() * 4);
    const w = n * 3 + 3;
    const s = newStamp(w, h + 1, w >> 1);
    const colour = BLOOMS[seed % BLOOMS.length];
    for (let i = 0; i < n; i++) {
      const x = 2 + i * 3 + Math.floor(random() * 2) - 1;
      const sh = Math.max(3, Math.round(h * (0.45 + 0.55 * random())));
      const lean = random() < 0.5 ? -1 : 1;
      for (let y = h; y > h - sh; y--) put(s, x + (y < h - sh * 0.6 ? lean : 0), y, MOSS[1], Math.min(7, Math.round(((h - y) / sh) * 5)));
      const bx = x + lean;
      const by = h - sh;
      // A small star of light.
      put(s, bx, by, colour[1], 6);
      put(s, bx - 1, by, colour[0], 6);
      put(s, bx + 1, by, colour[0], 6);
      put(s, bx, by - 1, colour[0], 6);
    }
    return s;
  });
}
