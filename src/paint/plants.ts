// Plants and rocks as pixel-art stamps, made from a seed and cached: tiered conifers, space-colonisation crowns
// for broadleaf trees and birches, L-system dead trees, cacti, bushes, grass tufts, reeds and faceted rocks.
// Silhouette first, then flat bands of light from above, detail at the edges, no orphan pixels (research:
// Pixel craft §9–14, §27–28; Procgen §16–20).
import { rng } from '../noise.ts';
import { role } from '../palette.ts';
import { FLAG, at, newStamp, put } from './chunk.ts';
import type { Stamp } from './chunk.ts';

const cache = new Map<string, Stamp>();

/** A stamp from the cache, made once per key. The cache is bounded: the oldest half goes when it fills. */
export function cached(key: string, make: () => Stamp): Stamp {
  let s = cache.get(key);
  if (s === undefined) {
    s = make();
    if (cache.size >= 1200) {
      let n = 0;
      for (const k of cache.keys()) {
        cache.delete(k);
        if (++n >= 600) break;
      }
    }
    cache.set(key, s);
  }
  return s;
}

/** Removes orphan pixels: any pixel whose four neighbours are all a different role takes the most common one. */
export function cleanup(s: Stamp, keep: (r: number) => boolean = () => false): void {
  const copy = s.roles.slice();
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const r = copy[y * s.w + x];
      if (r === 0 || keep(r)) continue;
      const n = [x > 0 ? copy[y * s.w + x - 1] : 0, x < s.w - 1 ? copy[y * s.w + x + 1] : 0, y > 0 ? copy[(y - 1) * s.w + x] : 0, y < s.h - 1 ? copy[(y + 1) * s.w + x] : 0];
      if (n.includes(r)) continue;
      const solid = n.filter((v) => v !== 0);
      if (solid.length < 3) continue; // an edge pixel: leave the silhouette alone
      const counts = new Map<number, number>();
      for (const v of solid) counts.set(v, (counts.get(v) ?? 0) + 1);
      let best = solid[0];
      for (const [v, c] of counts) if (c > (counts.get(best) ?? 0)) best = v;
      s.roles[y * s.w + x] = best;
    }
}

/** A Bresenham line of one role. */
function line(s: Stamp, x0: number, y0: number, x1: number, y1: number, r: number, flags = 0): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(s, x0, y0, r, flags);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Sway weight (0..7) for a row of a plant of height h, rising toward the top. */
const sway = (y: number, h: number, max = 7): number => Math.max(0, Math.min(max, Math.round(max * Math.pow(1 - y / h, 1.6))));

// ── Conifers ───────────────────────────────────────────────────────────────

/**
 * A conifer: 4–8 tiers, each a drooping triangle; lit on its top rows, darkest along its bottom row; a trunk
 * showing between tiers and at the foot; optional snow on the tier tops. `narrow` makes a spruce.
 */
export function conifer(seed: number, height: number, narrow: boolean, snowy: boolean, family = 'needle'): Stamp {
  return cached(`con:${seed}:${height}:${narrow}:${snowy}:${family}`, () => {
    const r = rng(seed);
    const h = Math.max(8, Math.round(height));
    const w = Math.max(5, Math.round(h * (narrow ? 0.3 + 0.06 * r() : 0.42 + 0.12 * r())) | 1);
    const s = newStamp(w + 2, h, (w + 2) >> 1);
    const cx = s.ax;
    const tiers = Math.max(3, Math.min(8, Math.round(h / (narrow ? 9 : 12)) + (r() < 0.5 ? 0 : 1)));
    const stub = Math.max(2, Math.round(h * (0.06 + 0.05 * r())));
    const crown = h - stub;
    const N = [role(family, 0), role(family, 1), role(family, 2), role(family, 3)];
    const bark = [role('bark', 0), role('bark', 1)];
    const snow = [role('snow', 2), role('snow', 3)];
    // The trunk first, behind everything.
    const tw = h > 44 ? 2 : 1;
    for (let y = Math.round(crown * 0.15); y < h; y++) for (let t = 0; t < tw; t++) put(s, cx - (tw >> 1) + t, y, t === 0 ? bark[0] : bark[1]);
    for (let j = 0; j < tiers; j++) {
      const yb = Math.round(((j + 1) / tiers) * crown);
      const th = Math.max(3, Math.round((crown / tiers) * (1.55 + 0.2 * r())));
      const yt = Math.max(0, yb - th);
      const W = Math.max(1, Math.round((w / 2) * Math.pow((j + 1) / tiers, 0.85) + (r() - 0.5) * 2));
      for (let y = yt; y <= yb; y++) {
        const f = (y - yt) / Math.max(1, yb - yt);
        const hw = Math.round(W * Math.pow(f, 1.15));
        const band = f < 0.28 ? 3 : f < 0.72 ? 2 : y === yb ? 0 : 1;
        for (let x = -hw; x <= hw; x++) {
          // The lit side of a row reaches a little further on the left (light from the upper left).
          const edge = Math.abs(x) === hw && hw > 1;
          let b = band;
          if (edge && x < 0 && band >= 1) b = Math.min(3, band + 1);
          if (edge && x > 0 && band >= 2) b = band - 1;
          put(s, cx + x, y, N[b], FLAG.RIM | sway(y, h, 3));
        }
        // Drooping tips at the tier's bottom corners.
        if (y === yb && hw >= 2) {
          put(s, cx - hw, y + 1, N[0], FLAG.RIM);
          put(s, cx + hw, y + 1, N[0], FLAG.RIM);
        }
        if (snowy && f < 0.35) {
          for (let x = -hw; x <= hw; x++) if (at(s, cx + x, y - 1) === 0 || f < 0.12) put(s, cx + x, y, snow[f < 0.15 ? 1 : 0], FLAG.RIM);
        }
      }
    }
    // A pointed top.
    put(s, cx, 0, N[3], FLAG.RIM | 3);
    cleanup(s);
    return s;
  });
}

// ── Space colonisation crowns ──────────────────────────────────────────────

type Node = { x: number; y: number; parent: number; weight: number };

/**
 * Grows a branching skeleton toward attraction points inside an ellipse (Runions et al. 2007): N points,
 * step D, kill distance dk, influence radius di. Returns nodes; node 0 is the trunk's top.
 */
function colonise(random: () => number, cx: number, cy: number, rx: number, ry: number, trunkTop: [number, number], n: number, D: number, dk: number, di: number, lift: number): Node[] {
  const pts: [number, number][] = [];
  while (pts.length < n) {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random());
    pts.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d]);
  }
  const nodes: Node[] = [{ x: trunkTop[0], y: trunkTop[1], parent: -1, weight: 0 }];
  const dir = new Map<number, [number, number, number]>();
  for (let iter = 0; iter < 80 && pts.length > 0; iter++) {
    dir.clear();
    for (const p of pts) {
      let best = -1;
      let bd = di * di;
      for (let i = 0; i < nodes.length; i++) {
        const dd = (nodes[i].x - p[0]) ** 2 + (nodes[i].y - p[1]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      if (best < 0) continue;
      const l = Math.sqrt(bd) || 1;
      const v = dir.get(best) ?? [0, 0, 0];
      v[0] += (p[0] - nodes[best].x) / l;
      v[1] += (p[1] - nodes[best].y) / l;
      v[2]++;
      dir.set(best, v);
    }
    if (dir.size === 0) {
      // Nothing in reach: grow straight up toward the crown.
      const last = nodes[nodes.length - 1];
      nodes.push({ x: last.x, y: last.y - D, parent: nodes.length - 1, weight: 0 });
      continue;
    }
    for (const [i, v] of dir) {
      let vx = v[0];
      let vy = v[1] - lift;
      const l = Math.hypot(vx, vy) || 1;
      vx /= l;
      vy /= l;
      nodes.push({ x: nodes[i].x + vx * D, y: nodes[i].y + vy * D, parent: i, weight: 0 });
    }
    for (let k = pts.length - 1; k >= 0; k--) {
      for (let i = 0; i < nodes.length; i++) {
        if ((nodes[i].x - pts[k][0]) ** 2 + (nodes[i].y - pts[k][1]) ** 2 < dk * dk) {
          pts.splice(k, 1);
          break;
        }
      }
    }
  }
  // Pipe model: each node's weight is the number of tips above it.
  const kids = new Array<number>(nodes.length).fill(0);
  for (const nd of nodes) if (nd.parent >= 0) kids[nd.parent]++;
  for (let i = nodes.length - 1; i > 0; i--) {
    if (kids[i] === 0) nodes[i].weight += 1;
    nodes[nodes[i].parent].weight += nodes[i].weight;
  }
  return nodes;
}

/** A leaf clump: a disc banded into light from the upper left, its rim ragged by chance. */
function clump(s: Stamp, random: () => number, cx: number, cy: number, rad: number, roles: readonly number[], darker: number, h: number): void {
  const R = Math.ceil(rad);
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y * 1.15);
      if (d > rad) continue;
      if (d > rad - 1 && random() < 0.3) continue;
      // Light from the upper left: dot((p − c)/r, L).
      const l = (-x * 0.55 - y * 0.83) / rad;
      let b = l > 0.35 ? 3 : l > -0.15 ? 2 : l > -0.6 ? 1 : 0;
      if (d > rad - 1.2 && b >= 2 && y < 0) b = Math.min(4, b + 1);
      b = Math.max(0, b - darker);
      put(s, Math.round(cx + x), Math.round(cy + y), roles[Math.min(roles.length - 1, b)], FLAG.RIM | sway(cy + y, h, 2));
    }
}

/** A broadleaf tree (oak, maple, a lone meadow tree): a forked trunk and a crown of leaf clumps. */
export function broadleaf(seed: number, height: number, family = 'leaf', bare = 0): Stamp {
  return cached(`broad:${seed}:${height}:${family}:${bare}`, () => {
    const random = rng(seed);
    const h = Math.max(14, Math.round(height));
    const cw = Math.round(h * (0.75 + 0.3 * random()));
    const w = cw + 6;
    const s = newStamp(w, h, w >> 1);
    const cx = s.ax;
    const trunkH = Math.round(h * (0.32 + 0.1 * random()));
    const crownCy = Math.round((h - trunkH) * 0.5);
    const rx = cw / 2 - 2;
    const ry = (h - trunkH) / 2 + 1;
    const nodes = colonise(random, cx, crownCy, rx, ry, [cx, h - trunkH], Math.round(40 + h * 1.2), 2, 3.5, Math.max(10, h * 0.35), 0.15);
    const bark = [role('bark', 0), role('bark', 1), role('bark', 2), role('bark', 3)];
    // Trunk, a little wider at the foot.
    const tw = Math.max(1, Math.round(h / 22));
    for (let y = h - trunkH; y < h; y++) {
      const wide = y > h - 3 ? 1 : 0;
      for (let x = -tw - wide; x <= tw - 1 + wide; x++) put(s, cx + x, y, x < 0 ? bark[2] : x === tw - 1 + wide ? bark[0] : bark[1]);
    }
    // Branches, thicker where more tips lean on them.
    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i];
      const p = nodes[n.parent];
      const th = Math.pow(n.weight, 1 / 2.5) * 0.5;
      line(s, p.x, p.y, n.x, n.y, th > 0.9 ? bark[1] : bark[0]);
      if (th > 1.4) line(s, p.x + 1, p.y, n.x + 1, n.y, bark[0]);
    }
    // Clumps at the tips, back ones darker; a bare tree (late autumn, winter) keeps only a few.
    const L = [role(family, 0), role(family, 1), role(family, 2), role(family, 3), role(family, 4)];
    const tips = nodes.filter((n, i) => i > 0 && !nodes.some((m) => m.parent === i));
    const order = tips.map((t, i) => ({ t, back: random() < 0.4, i })).sort((a, b) => Number(b.back) - Number(a.back));
    for (const { t, back } of order) {
      if (random() < bare) continue;
      clump(s, random, t.x, t.y, 2.5 + random() * Math.max(1.5, h * 0.07), L, back ? 1 : 0, h);
    }
    cleanup(s);
    return s;
  });
}

/** A birch: a pale trunk with dark dashes and notches, sparse small clumps of light leaves. */
export function birch(seed: number, height: number, bare = 0): Stamp {
  return cached(`birch:${seed}:${height}:${bare}`, () => {
    const random = rng(seed);
    const h = Math.max(16, Math.round(height));
    const cw = Math.round(h * (0.45 + 0.15 * random()));
    const w = cw + 6;
    const s = newStamp(w, h, w >> 1);
    const cx = s.ax;
    const trunkH = Math.round(h * 0.45);
    const nodes = colonise(random, cx, Math.round((h - trunkH) * 0.55), cw / 2 - 2, (h - trunkH) / 2 + 2, [cx, h - trunkH + 4], Math.round(25 + h * 0.6), 2, 3, Math.max(8, h * 0.3), -0.1);
    const B = [role('birch', 0), role('birch', 1), role('birch', 2), role('birch', 3)];
    const tw = h > 50 ? 2 : 1;
    for (let y = Math.round(h * 0.12); y < h; y++) {
      for (let x = 0; x <= tw; x++) put(s, cx + x - (tw >> 1), y, x === 0 ? B[3] : x === tw ? B[1] : B[2]);
      // Dark dashes on alternating sides.
      if (random() < 0.22) put(s, cx + (random() < 0.5 ? -(tw >> 1) : tw - (tw >> 1)), y, B[0]);
    }
    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i];
      const p = nodes[n.parent];
      line(s, p.x, p.y, n.x, n.y, n.weight > 3 ? B[2] : B[0]);
    }
    const L = [role('leaf', 1), role('leaf', 2), role('leaf', 3), role('leaf', 4), role('leaf', 4)];
    for (let i = 1; i < nodes.length; i++) {
      if (nodes.some((m) => m.parent === i)) continue;
      if (random() < bare) continue;
      clump(s, random, nodes[i].x, nodes[i].y, 1.8 + random() * 2.2, L, random() < 0.35 ? 1 : 0, h);
    }
    cleanup(s, (r) => r === B[0]);
    return s;
  });
}

// ── L-system dead trees and shrubs ─────────────────────────────────────────

/** A dead tree from a stochastic L-system (ABOP 1.24): F→F[+F]F[−F]F | F[+F]F | F[−F]F. */
export function deadTree(seed: number, height: number, family = 'bark'): Stamp {
  return cached(`dead:${seed}:${height}:${family}`, () => {
    const random = rng(seed);
    const h = Math.max(10, Math.round(height));
    let str = 'F';
    const n = h > 40 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      let next = '';
      for (const ch of str) {
        if (ch !== 'F') {
          next += ch;
          continue;
        }
        const r = random();
        next += r < 0.33 ? 'F[+F]F[-F]F' : r < 0.66 ? 'F[+F]F' : 'F[-F]F';
      }
      str = next;
    }
    // Walk the string once to find its extent, then draw it scaled to the height.
    const delta = (22 + random() * 8) * (Math.PI / 180);
    const segs: [number, number, number, number, number][] = [];
    const stack: [number, number, number, number][] = [];
    let x = 0;
    let y = 0;
    let a = -Math.PI / 2;
    let depth = 0;
    for (const ch of str) {
      if (ch === 'F') {
        const nx = x + Math.cos(a);
        const ny = y + Math.sin(a);
        segs.push([x, y, nx, ny, depth]);
        x = nx;
        y = ny;
      } else if (ch === '+') a += delta + (random() - 0.5) * 0.17;
      else if (ch === '-') a -= delta + (random() - 0.5) * 0.17;
      else if (ch === '[') {
        stack.push([x, y, a, depth]);
        depth++;
      } else if (ch === ']') [x, y, a, depth] = stack.pop() ?? [0, 0, -Math.PI / 2, 0];
    }
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    for (const sg of segs) {
      minX = Math.min(minX, sg[0], sg[2]);
      maxX = Math.max(maxX, sg[0], sg[2]);
      minY = Math.min(minY, sg[1], sg[3]);
    }
    const k = (h - 1) / -minY;
    const w = Math.ceil((maxX - minX) * k) + 3;
    const s = newStamp(w, h, Math.round(-minX * k) + 1);
    const R = [role(family, 0), role(family, 1), role(family, 2)];
    for (const [x0, y0, x1, y1, dd] of segs) line(s, s.ax + x0 * k, h - 1 + y0 * k, s.ax + x1 * k, h - 1 + y1 * k, dd === 0 ? R[2] : dd === 1 ? R[1] : R[0], FLAG.RIM);
    // The trunk gets a second column.
    for (let yy = Math.round(h * 0.5); yy < h; yy++) put(s, s.ax + 1, yy, R[0]);
    return s;
  });
}

/** A low bush or shrub: a mound of clumps. `dry` makes it a bare desert shrub. */
export function bush(seed: number, width: number, family = 'leaf', dry = false): Stamp {
  return cached(`bush:${seed}:${width}:${family}:${dry}`, () => {
    const random = rng(seed);
    const w = Math.max(5, Math.round(width));
    const h = Math.max(4, Math.round(w * (0.45 + 0.2 * random())));
    const s = newStamp(w + 2, h + 1, (w + 2) >> 1);
    if (dry) {
      const R = [role(family, 0), role(family, 1), role(family, 2)];
      const stems = 4 + Math.floor(random() * 4);
      for (let i = 0; i < stems; i++) {
        const tx = s.ax + (random() - 0.5) * w;
        line(s, s.ax, h, tx, random() * h * 0.5, R[Math.floor(random() * 3)]);
      }
      return s;
    }
    const L = [role(family, 0), role(family, 1), role(family, 2), role(family, 3), role(family, 4)];
    const n = 2 + Math.floor(w / 4);
    for (let i = 0; i < n; i++) {
      const cx = 1 + (w * (i + 0.5)) / n + (random() - 0.5) * 2;
      const rad = Math.min(h - 1, 1.8 + random() * (h * 0.45));
      clump(s, random, cx, h - rad + 0.5, rad, L, i % 2, h);
    }
    cleanup(s);
    return s;
  });
}

/** A grass tuft: 3–7 one-pixel blades, 3–8 px, leaning, lighter at the tips. */
export function tuft(seed: number, height: number, family = 'grass'): Stamp {
  return cached(`tuft:${seed}:${height}:${family}`, () => {
    const random = rng(seed);
    const h = Math.max(2, Math.round(height));
    const blades = 3 + Math.floor(random() * 5);
    const w = blades + 3;
    const s = newStamp(w, h, w >> 1);
    const G = [role(family, 1), role(family, 2), role(family, 3), role(family, 4)];
    for (let i = 0; i < blades; i++) {
      const bx = 1 + i + Math.round((random() - 0.5) * 1.5);
      const bh = Math.max(2, Math.round(h * (0.5 + 0.5 * random())));
      const lean = (random() - 0.5) * 2;
      for (let y = 0; y < bh; y++) {
        const t = y / bh;
        put(s, Math.round(bx + lean * t * t), h - 1 - y, G[Math.min(3, Math.floor(t * 3.2) + (i % 2))], sway(h - 1 - y, h, 7));
      }
    }
    return s;
  });
}

/** Reeds or marram grass: tall thin stalks, some with a dark head. */
export function reeds(seed: number, height: number, family = 'dry'): Stamp {
  return cached(`reed:${seed}:${height}:${family}`, () => {
    const random = rng(seed);
    const h = Math.max(6, Math.round(height));
    const stalks = 3 + Math.floor(random() * 4);
    const w = stalks * 2 + 2;
    const s = newStamp(w, h, w >> 1);
    const R = [role(family, 0), role(family, 1), role(family, 2), role(family, 3)];
    for (let i = 0; i < stalks; i++) {
      const bx = 1 + i * 2 + (random() < 0.5 ? 0 : 1);
      const bh = Math.round(h * (0.55 + 0.45 * random()));
      const lean = (random() - 0.5) * 3;
      for (let y = 0; y < bh; y++) {
        const t = y / bh;
        put(s, Math.round(bx + lean * t * t), h - 1 - y, R[Math.min(3, 1 + Math.floor(t * 2.5))], sway(h - 1 - y, h, 7));
      }
      if (random() < 0.45) {
        const tx = Math.round(bx + lean);
        for (let y = 0; y < 3; y++) put(s, tx, h - bh + y, role('bark', 1), sway(h - bh + y, h, 7));
      }
    }
    return s;
  });
}

/** A saguaro-like cactus: a column with one or two raised arms, ribbed by a lit and a shaded side. */
export function cactus(seed: number, height: number): Stamp {
  return cached(`cactus:${seed}:${height}`, () => {
    const random = rng(seed);
    const h = Math.max(10, Math.round(height));
    const w = Math.round(h * 0.6) | 1;
    const s = newStamp(w, h, w >> 1);
    const L = [role('leaf', 0), role('leaf', 1), role('leaf', 2), role('leaf', 3)];
    const cw = Math.max(3, Math.round(h * 0.12));
    const body = (x0: number, y0: number, y1: number, ww: number): void => {
      for (let y = y0; y <= y1; y++)
        for (let x = 0; x < ww; x++) put(s, x0 + x, y, L[x === 0 ? 2 : x === ww - 1 ? 0 : x === 1 ? 3 : 1], FLAG.RIM);
    };
    body(s.ax - (cw >> 1), 1, h - 1, cw);
    put(s, s.ax, 0, L[2], FLAG.RIM);
    const arms = 1 + (random() < 0.6 ? 1 : 0);
    for (let i = 0; i < arms; i++) {
      const side = i === 0 ? (random() < 0.5 ? -1 : 1) : 0;
      const dir = side === 0 ? (random() < 0.5 ? -1 : 1) : side;
      const ay = Math.round(h * (0.35 + 0.3 * random()));
      const reach = Math.round(h * (0.15 + 0.1 * random()));
      const aw = Math.max(2, cw - 1);
      const ax0 = dir < 0 ? s.ax - (cw >> 1) - reach : s.ax + (cw >> 1) + 1;
      for (let x = 0; x < reach; x++) for (let k = 0; k < aw; k++) put(s, ax0 + x, ay + k, L[k === 0 ? 2 : 1], FLAG.RIM);
      const ux = dir < 0 ? ax0 : ax0 + reach - aw;
      body(ux, ay - Math.round(h * 0.2), ay + aw - 1, aw);
    }
    return s;
  });
}

// ── Rocks ──────────────────────────────────────────────────────────────────

/** A rock: a wide faceted lump cut flat at its foot; planes turned left and right, a lit cap, cracks in shade. */
export function rock(seed: number, width: number, family = 'rock'): Stamp {
  return cached(`rock:${seed}:${width}:${family}`, () => {
    const random = rng(seed);
    const w = Math.max(4, Math.round(width));
    const h = Math.max(3, Math.round(w * (0.38 + 0.3 * random())));
    const s = newStamp(w, h, w >> 1);
    const R = [role(family, 0), role(family, 1), role(family, 2), role(family, 3), role(family, 4)];
    // A polygon of 5–9 vertices over the upper half-ellipse.
    const n = 5 + Math.floor(random() * 5);
    const peak = 0.3 + 0.4 * random();
    const tops: number[] = [];
    for (let x = 0; x < w; x++) {
      const t = (x + 0.5) / w;
      const k = Math.floor(t * n);
      const f = t * n - k;
      const a = 0.65 + 0.35 * Math.sin(((k + 0.0) / n) * Math.PI) + (rng(seed + k)() - 0.5) * 0.25;
      const b = 0.65 + 0.35 * Math.sin(((k + 1.0) / n) * Math.PI) + (rng(seed + k + 1)() - 0.5) * 0.25;
      tops.push(Math.round(h * (1 - Math.min(1, a + (b - a) * f))));
    }
    for (let x = 0; x < w; x++) {
      const slope = (tops[Math.min(w - 1, x + 1)] - tops[Math.max(0, x - 1)]) / 2;
      const ridgeX = Math.round(peak * w);
      for (let y = tops[x]; y < h; y++) {
        let b: number;
        if (y === tops[x]) b = 4;
        else if (y > h - 2) b = 0;
        else b = x < ridgeX ? (slope < 0.5 ? 2 : 1) : slope > -0.5 ? 3 : 1;
        put(s, x, y, R[b], FLAG.RIM);
      }
    }
    // A crack or two, only in the shaded plane.
    if (w > 8) {
      const cx = Math.round(w * (0.55 + 0.3 * random()));
      for (let y = tops[cx] + 2; y < h - 1 && y < tops[cx] + 2 + Math.round(h * 0.5); y++) put(s, cx + (y % 3 === 0 ? 1 : 0), y, R[0]);
    }
    return s;
  });
}
