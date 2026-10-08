# Wander Dark Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle Wander to black backgrounds with coloured glyphs, grass blades that lean with the wind and bend around you, a lit radius that fades to black at the screen edges, and a small named figure instead of the `@`.

**Architecture:** A new pure module `src/grass.ts` holds the blade glyph rule, the wind lean and a `Trail` of your recent positions. `src/ambient.ts` gains a `vignette` function next to the lantern. `src/render.ts` draws on black, calls the grass functions for blade biomes, multiplies the vignette into the light, and draws the figure and name. `src/game.ts` owns the trail and your name; `src/main.ts` fills the default name. Everything else (world, sky, input, terminal, screen diff, loop) is untouched.

**Tech Stack:** Node ≥ 25 running `.ts` directly, `node:test` with `node:assert/strict`, no dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-wander-dark-look-design.md`, which builds on `docs/superpowers/specs/2026-10-08-wander-design.md`. Read both alongside this plan.

**Working directory:** every command below runs from `/Users/krystofpe/Projects/wander`, on branch `feat/first-version` (the plan continues that branch; no new branch).

## Global Constraints

- Node ≥ 25. `node src/main.ts` runs the game, `node --test` finds `test/*.test.ts` without arguments.
- No dependencies. No type-checker; the tests are the safety net.
- Only TypeScript syntax Node can strip: no `enum`, no `namespace`, no constructor parameter properties; type-only imports use `import type`; relative imports end in `.ts`.
- `ASPECT = 2`: map cell `(mx, my)` covers world point `(mx, 2·my)`; positions are world units; cell centre is `(mx + 0.5, (my + 0.5)·ASPECT)`.
- Every map cell's background is black: `COLORS.ground = 0x000000`. The status bar keeps `COLORS.hudBg`.
- Blades: grassland and swamp only (`blades: true`). Lean vector `leanX = windLean + bendX`, `leanY = bendY`. Glyphs `| / \ ,` for tall blades, `' .` for short ones (`(variant & 3) === 0`).
- Lit radius: full inside `VIGNETTE.inner = 0.45` of the view's half extents, fading with `smoothstep` to `VIGNETTE.edge = 0.06` at the edge. It multiplies sunlight and cloud light; the lantern is added afterwards.
- Figure: three rows, centred on your cell (the torso). Spaces are transparent. Legs alternate every `FIGURE.stepTime = 0.15` s of real time while speed > 1 world unit/s.
- Name: `--name`, default the login name, fallback `you`; trimmed, control characters removed, cut to 16 characters; drawn one row above the head, centred, clipped at the edges.
- Bench targets (`--bench`, scripted walk at 10:00 in rain) stay: 200×60 mean ≤ 5 ms, p95 ≤ 8 ms, output mean ≤ 120 KB; 320×90 mean ≤ 10 ms, p95 ≤ 14 ms.
- Commits end with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

These are failure modes the spec implies but its own test list doesn't exercise. Each one has a test in the task named in its last column:

| # | Situation | Expected behaviour | Test in |
|---|---|---|---|
| 1 | `--name` contains control characters, such as an escape sequence | They are stripped and never reach the terminal stream | Task 4, "your name is cleaned…" |
| 2 | The smallest allowed window (40×12) with the longest name | The name and figure fit, nothing throws, rows above the map are skipped | Task 4, "a long name fits in the smallest window" |
| 3 | Standing still on grass | The blades under you stay flat as long as you stand there | Task 1, "standing still keeps the blades under you flat" |
| 4 | Running at 24 units/s, so trail samples are 1.2 units apart | The parted grass has no gaps between samples | Task 1, "running leaves no gaps in the trail" |
| 5 | Just spawned, with an empty trail | Blade cells still draw blade glyphs from the wind lean; `bendAt` is never called on a null box | Task 3, "blades still show with an empty trail" |

## Refinements to the spec

| Spec says | This plan does | Why |
|---|---|---|
| Names are trimmed and cut to 16 characters | Control characters (below 0x20, and 0x7f) are also removed | A name holding an escape sequence would otherwise be written raw into the terminal stream. |
| `Trail` has `push`, `bendAt`, `bounds` | It also has a `size` getter | So the sample cap can be tested without reaching into private state. |

## File map

| File | Change | Task |
|---|---|---|
| `src/config.ts` | `blades` on `BiomeDef`; `GRASS`, `BLADES` | 1 |
| `src/grass.ts` | New: `Trail`, `windLean`, `bladeGlyph` | 1 |
| `src/config.ts` | `VIGNETTE` | 2 |
| `src/ambient.ts` | `vignette()` | 2 |
| `src/config.ts` | Biome table without `bg`, new foreground colours; `COLORS.ground`, `COLORS.tip` | 3 |
| `src/render.ts` | Black backgrounds, land speckle, blades, vignette, `render(…, trail, hud)` | 3 |
| `src/game.ts` | `Game.trail`, fed each update, passed to render | 3 |
| `src/config.ts` | `FIGURE`, `COLORS.name` | 4 |
| `src/render.ts` | `new Renderer(name)`, figure and name drawing | 4 |
| `src/game.ts` | `Options.name`, `--name`, `cleanName`, `GameOptions.name`, `Game.name` | 4 |
| `src/main.ts` | Default name from the login name | 4 |
| `README.md` | `--name`, a line about the look | 4 |
| `test/grass.test.ts` | New | 1 |
| `test/ambient.test.ts` | Vignette test | 2 |
| `test/render.test.ts` | Rewritten for black backgrounds, blades, edges | 3, 4 |
| `test/game.test.ts` | Trail, name, options | 3, 4 |

---

### Task 1: Grass module: blade glyphs, wind lean, trail

**Files:**
- Modify: `src/config.ts` (`BiomeDef`, `BIOMES`, new `GRASS` and `BLADES` after `WEATHER`)
- Create: `src/grass.ts`
- Test: `test/grass.test.ts`

**Interfaces:**
- Consumes: `Ambient` type from `src/ambient.ts` (fields `windX`, `windStrength`); config
- Produces from `config.ts`:
  - `BiomeDef.blades: boolean` (true for Grassland and Swamp; `sways` is now true only for Forest)
  - `GRASS = { leanThreshold, flatThreshold, windLean, bendRadius, bendTime, trailAge, sampleEvery, maxSamples }`
  - `BLADES = { upright, right, left, flat, short, shortFlat }`, code points
- Produces from `grass.ts`:
  - `class Trail`: `push(x, y, t): void`, `bendAt(x, y, t): [number, number]`, `bounds(t): [minX, minY, maxX, maxY] | null`, `get size(): number`
  - `windLean(amb: Ambient, gust: number): number`
  - `bladeGlyph(leanX: number, leanY: number, variant: number): number`

- [ ] **Step 1: Add the grass config**

In `src/config.ts`, replace the `BiomeDef` type with:

```ts
export type BiomeDef = {
  readonly name: string;
  /** Code points; a cell's variant picks one. */
  readonly glyphs: readonly number[];
  /** Daylight colours, 0xRRGGBB. */
  readonly fg: number;
  readonly bg: number;
  /** Multiplies walking speed. */
  readonly speed: number;
  readonly water: WaterKind;
  /** Trees switch glyph when a gust passes. */
  readonly sways: boolean;
  /** Drawn as blades that lean with the wind and bend around you. */
  readonly blades: boolean;
};
```

Replace the `BIOMES` table with:

```ts
/** One entry per Biome id, in id order. All glyphs are single-width. */
export const BIOMES: readonly BiomeDef[] = [
  { name: 'Deep ocean', glyphs: glyphs('≈~'), fg: 0x3b64a8, bg: 0x0c2148, speed: 0.45, water: Water.Sea, sways: false, blades: false },
  { name: 'Ocean', glyphs: glyphs('~≈'), fg: 0x5b8fd6, bg: 0x163b78, speed: 0.45, water: Water.Sea, sways: false, blades: false },
  { name: 'Shallows', glyphs: glyphs('~·'), fg: 0x9ee0e0, bg: 0x2b7f91, speed: 0.55, water: Water.Sea, sways: false, blades: false },
  { name: 'River', glyphs: glyphs('~≈'), fg: 0xa8d8ff, bg: 0x2f6fb5, speed: 0.55, water: Water.River, sways: false, blades: false },
  { name: 'Lake', glyphs: glyphs('~≈'), fg: 0x96cdf5, bg: 0x2a5d9c, speed: 0.55, water: Water.Lake, sways: false, blades: false },
  { name: 'Beach', glyphs: glyphs('.:·'), fg: 0xb39a5f, bg: 0xdfca92, speed: 0.9, water: Water.None, sways: false, blades: false },
  { name: 'Grassland', glyphs: glyphs(',.\'"'), fg: 0xa6dc72, bg: 0x4a8a34, speed: 1.0, water: Water.None, sways: false, blades: true },
  { name: 'Forest', glyphs: glyphs('♣♠'), fg: 0x5fae4e, bg: 0x1c4a22, speed: 0.6, water: Water.None, sways: true, blades: false },
  { name: 'Swamp', glyphs: glyphs('",~'), fg: 0x8fa05c, bg: 0x3a4628, speed: 0.5, water: Water.None, sways: false, blades: true },
  { name: 'Desert', glyphs: glyphs('.·:'), fg: 0xb98f4c, bg: 0xe0bd78, speed: 0.8, water: Water.None, sways: false, blades: false },
  { name: 'Tundra', glyphs: glyphs(".'·"), fg: 0xd2dbd2, bg: 0x8d9c8f, speed: 0.85, water: Water.None, sways: false, blades: false },
  { name: 'Hills', glyphs: glyphs('∩n'), fg: 0x9a8650, bg: 0x667438, speed: 0.65, water: Water.None, sways: false, blades: false },
  { name: 'Mountains', glyphs: glyphs('▲^'), fg: 0xc4c0bc, bg: 0x6c6862, speed: 0.45, water: Water.None, sways: false, blades: false },
  { name: 'Snowy peaks', glyphs: glyphs('▲^'), fg: 0xffffff, bg: 0xd4dbe6, speed: 0.4, water: Water.None, sways: false, blades: false },
];
```

After the `WEATHER` table (before the `// ── Screen` section), add:

```ts
// ── Grass ──────────────────────────────────────────────────────────────────
/** Blades: how they lean with the wind and bend around you. Distances in world units, times in seconds. */
export const GRASS = {
  /** Lean below which a blade stands upright; jittered per blade by −30%…+30%. */
  leanThreshold: 0.3,
  /** Lean from which a blade lies flat. */
  flatThreshold: 0.8,
  /** Horizontal lean at full wind; below flatThreshold, so wind alone never flattens. */
  windLean: 0.6,
  /** How far around you blades bend. */
  bendRadius: 3,
  /** Time constant for blades to spring back after you pass. */
  bendTime: 0.6,
  /** Trail samples older than this are dropped. */
  trailAge: 1.5,
  /** Least time between two trail samples. */
  sampleEvery: 0.05,
  maxSamples: 32,
} as const;
const codePoint = (ch: string): number => ch.codePointAt(0) ?? 32;
/** Blade glyphs as code points: tall blades stand, lean or lie flat; short blades stand or lie flat. */
export const BLADES = {
  upright: codePoint('|'),
  right: codePoint('/'),
  left: codePoint('\\'),
  flat: codePoint(','),
  short: codePoint("'"),
  shortFlat: codePoint('.'),
} as const;
```

- [ ] **Step 2: Write the failing test**

`test/grass.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLADES, GRASS } from '../src/config.ts';
import { Trail, bladeGlyph, windLean } from '../src/grass.ts';
import type { Ambient } from '../src/ambient.ts';

const amb = (windX: number, windStrength: number): Ambient => ({
  gameTime: 0,
  realTime: 0,
  hour: 12,
  phase: 'afternoon',
  lightR: 1,
  lightG: 1,
  lightB: 1,
  daylight: 1,
  windX,
  windY: 0,
  windStrength,
  front: 0,
  cloudCover: 0.3,
});

const TALL = 1; // (1 & 3) !== 0
const SHORT = 4; // (4 & 3) === 0

test('a tall blade stands, leans with the lean, and lies flat when pushed hard', () => {
  assert.equal(bladeGlyph(0, 0, TALL), BLADES.upright);
  assert.equal(bladeGlyph(0.1, 0, TALL), BLADES.upright);
  assert.equal(bladeGlyph(0.5, 0, TALL), BLADES.right);
  assert.equal(bladeGlyph(-0.5, 0, TALL), BLADES.left);
  assert.equal(bladeGlyph(0, 0.9, TALL), BLADES.flat);
  assert.equal(bladeGlyph(0.6, 0.6, TALL), BLADES.flat);
});

test('blades do not all flip at once', () => {
  assert.equal(bladeGlyph(0.25, 0, 1), BLADES.right);
  assert.equal(bladeGlyph(0.25, 0, 255), BLADES.upright);
});

test('short blades only stand or lie flat', () => {
  assert.equal(bladeGlyph(0.5, 0, SHORT), BLADES.short);
  assert.equal(bladeGlyph(0, 0.9, SHORT), BLADES.shortFlat);
});

test('wind lean follows the wind, grows with gusts, and never flattens on its own', () => {
  assert.ok(windLean(amb(1, 1), 1) > 0);
  assert.ok(windLean(amb(-1, 1), 1) < 0);
  assert.equal(windLean(amb(1, 0), 1), 0);
  assert.ok(windLean(amb(1, 1), 1) > windLean(amb(1, 1), 0));
  assert.ok(Math.abs(windLean(amb(1, 1), 1)) < GRASS.flatThreshold);
});

test('a fresh trail sample pushes nearby blades away, and the push fades with age', () => {
  const trail = new Trail();
  trail.push(10, 10, 0);
  const [bx, by] = trail.bendAt(11, 10, 0);
  assert.ok(bx > 0 && Math.abs(by) < 1e-9, `east of you: ${bx}, ${by}`);
  assert.ok(trail.bendAt(9, 10, 0)[0] < 0, 'west of you blades are pushed west');
  assert.ok(trail.bendAt(10, 10, 0)[1] > 0, 'right under you blades are pushed south');
  const later = trail.bendAt(11, 10, 0.6)[0];
  assert.ok(later > 0 && later < bx, `fades: ${later} vs ${bx}`);
  assert.deepEqual(trail.bendAt(11, 10, 2), [0, 0]);
  assert.deepEqual(trail.bendAt(10 + GRASS.bendRadius, 10, 0), [0, 0]);
});

test('the trail keeps recent samples only, at most one per 50 ms', () => {
  const trail = new Trail();
  assert.equal(trail.bounds(0), null);
  trail.push(0, 0, 0);
  trail.push(1, 0, 0.01); // too soon after the last sample: ignored
  assert.deepEqual(trail.bounds(0.01), [-GRASS.bendRadius, -GRASS.bendRadius, GRASS.bendRadius, GRASS.bendRadius]);
  for (let i = 1; i <= 200; i++) trail.push(i, 0, i * 0.05);
  assert.ok(trail.size >= 30 && trail.size <= GRASS.maxSamples, `size ${trail.size}`);
  assert.deepEqual(trail.bendAt(0, 0, 10), [0, 0], 'the start of the walk is forgotten');
});

test('standing still keeps the blades under you flat', () => {
  const trail = new Trail();
  for (let t = 0; t <= 3; t += 1 / 60) trail.push(5, 5, t);
  const [, south] = trail.bendAt(5, 5, 3);
  assert.ok(south >= 1, `still pushed down after 3 s: ${south}`);
});

test('running leaves no gaps in the trail', () => {
  const trail = new Trail();
  for (let i = 0; i < 10; i++) trail.push(i * 1.2, 0, i * 0.05); // 24 units/s sampled every 50 ms
  for (let x = 0.6; x < 10.8; x += 1.2) {
    const [bx, by] = trail.bendAt(x, 0.5, 0.45);
    assert.ok(Math.hypot(bx, by) > 0.1, `no bend at ${x}`);
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/grass.test.ts`
Expected: FAIL with `Cannot find module '…/src/grass.ts'`

- [ ] **Step 4: Write the implementation**

`src/grass.ts`:

```ts
// Grass: blades that lean with the wind and bend away from where you have just walked.
import { BLADES, GRASS } from './config.ts';
import type { Ambient } from './ambient.ts';

type Sample = { readonly x: number; readonly y: number; readonly t: number };

/** Where you have been lately (world units, real time), so blades can part around you and spring back. */
export class Trail {
  private readonly samples: Sample[] = [];

  get size(): number {
    return this.samples.length;
  }

  /** Records your position at real time t, at most once per GRASS.sampleEvery seconds. */
  push(x: number, y: number, t: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last !== undefined && t - last.t < GRASS.sampleEvery) return;
    this.samples.push({ x, y, t });
    let drop = 0;
    while (drop < this.samples.length && t - this.samples[drop].t > GRASS.trailAge) drop++;
    if (this.samples.length - drop > GRASS.maxSamples) drop = this.samples.length - GRASS.maxSamples;
    if (drop > 0) this.samples.splice(0, drop);
  }

  /** Bend vector at world point (x, y) at real time t: the sum of pushes away from each recent sample. */
  bendAt(x: number, y: number, t: number): [number, number] {
    let bx = 0;
    let by = 0;
    for (const s of this.samples) {
      const age = t - s.t;
      if (age > GRASS.trailAge) continue;
      const dx = x - s.x;
      const dy = y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= GRASS.bendRadius) continue;
      const w = (1 - d / GRASS.bendRadius) ** 2 * Math.exp(-age / GRASS.bendTime);
      if (d < 0.001) {
        by += w; // right under you: pushed south
      } else {
        bx += (w * dx) / d;
        by += (w * dy) / d;
      }
    }
    return [bx, by];
  }

  /** The area where blades can be bent, [minX, minY, maxX, maxY] grown by the bend radius, or null with no samples. */
  bounds(t: number): [number, number, number, number] | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of this.samples) {
      if (t - s.t > GRASS.trailAge) continue;
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
    if (minX === Infinity) return null;
    const r = GRASS.bendRadius;
    return [minX - r, minY - r, maxX + r, maxY + r];
  }
}

/** Horizontal lean from the wind at a cell with gust strength 0..1. Positive leans east. */
export function windLean(amb: Ambient, gust: number): number {
  return GRASS.windLean * amb.windX * amb.windStrength * (0.5 + 0.5 * gust);
}

/** Code point for a blade with lean (leanX east, leanY south); `variant` is the cell's 0..255 hash. Pure. */
export function bladeGlyph(leanX: number, leanY: number, variant: number): number {
  const m = Math.sqrt(leanX * leanX + leanY * leanY);
  if ((variant & 3) === 0) return m >= GRASS.flatThreshold ? BLADES.shortFlat : BLADES.short;
  if (m >= GRASS.flatThreshold) return BLADES.flat;
  // A per-blade threshold, so a gust crossing the field flips blades one by one.
  const t = GRASS.leanThreshold * (0.7 + (0.6 * variant) / 255);
  if (leanX > t) return BLADES.right;
  if (leanX < -t) return BLADES.left;
  return BLADES.upright;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/grass.test.ts`
Expected: PASS, `tests 8`, `fail 0`

- [ ] **Step 6: Run the whole suite**

Run: `node --test`
Expected: PASS, `tests 94`, `fail 0` (the biome-table test still holds; nothing else reads `blades` yet)

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/grass.ts test/grass.test.ts
git commit -m "feat: grass module with blade glyphs, wind lean and a trail" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Lit radius

**Files:**
- Modify: `src/config.ts` (new `VIGNETTE` after `BLADES`)
- Modify: `src/ambient.ts` (import, new function after `lanternLight`)
- Test: `test/ambient.test.ts` (import, append)

**Interfaces:**
- Consumes: `smoothstep` from `ambient.ts`
- Produces:
  - `VIGNETTE = { inner: 0.45, edge: 0.06 }`
  - `vignette(dx: number, dy: number, halfWidth: number, halfHeight: number): number`, pure, 1 near you down to `VIGNETTE.edge`

- [ ] **Step 1: Add the config**

In `src/config.ts`, after the `BLADES` table, add:

```ts
/** The lit radius: full light inside `inner` of the view's half extents, fading to `edge` at the screen edge. */
export const VIGNETTE = { inner: 0.45, edge: 0.06 } as const;
```

- [ ] **Step 2: Write the failing test**

In `test/ambient.test.ts`, replace the config import line with:

```ts
import { DAY_LENGTH, LANTERN_RADIUS, VIGNETTE } from '../src/config.ts';
```

and add `vignette,` to the import list from `../src/ambient.ts` (after `sunlight,`). Then append:

```ts
test('the lit radius is full near you and fades to the edge level, never brightening outward', () => {
  assert.equal(vignette(0, 0, 100, 60), 1);
  assert.equal(vignette(40, 0, 100, 60), 1);
  assert.equal(vignette(0, 24, 100, 60), 1);
  assert.ok(Math.abs(vignette(100, 0, 100, 60) - VIGNETTE.edge) < 1e-9);
  assert.ok(Math.abs(vignette(0, 90, 100, 60) - VIGNETTE.edge) < 1e-9, 'beyond the edge stays at the edge level');
  let previous = 1;
  for (let x = 0; x <= 100; x++) {
    const v = vignette(x, 0, 100, 60);
    assert.ok(v <= previous + 1e-12, `brighter at ${x}`);
    previous = v;
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/ambient.test.ts`
Expected: FAIL with `does not provide an export named 'vignette'`

- [ ] **Step 4: Write the implementation**

In `src/ambient.ts`, replace the config import line with:

```ts
import { DAY_LENGTH, DAY_START_HOUR, LANTERN_RADIUS, LIGHT_KEYS, VIGNETTE, WEATHER } from './config.ts';
```

After the `lanternLight` function, add:

```ts
/**
 * Light multiplier for the lit radius: 1 near you, fading to VIGNETTE.edge at the screen edge and beyond.
 * `dx`, `dy` are world units from your exact position; `halfWidth`, `halfHeight` are the view's half extents in world units.
 */
export function vignette(dx: number, dy: number, halfWidth: number, halfHeight: number): number {
  const ex = dx / halfWidth;
  const ey = dy / halfHeight;
  const e = Math.sqrt(ex * ex + ey * ey);
  return 1 - (1 - VIGNETTE.edge) * smoothstep(VIGNETTE.inner, 1, e);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/ambient.test.ts`
Expected: PASS, `tests 15`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/ambient.ts test/ambient.test.ts
git commit -m "feat: lit radius vignette" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Dark terrain: black backgrounds, speckle, blades, lit radius

**Files:**
- Modify: `src/config.ts` (`BiomeDef` loses `bg`; new `BIOMES`; `COLORS` gains `ground` and `tip`)
- Modify: `src/render.ts` (replace the whole file)
- Modify: `src/game.ts` (import, `trail` field, `update`, `draw`)
- Test: `test/render.test.ts` (replace the whole file), `test/game.test.ts` (append)

**Interfaces:**
- Consumes: `Trail`, `windLean`, `bladeGlyph` (Task 1); `vignette` (Task 2); `COLORS`, `BIOMES`
- Produces:
  - `COLORS.ground = 0x000000`, `COLORS.tip = 0xeaffe0`; `BiomeDef` without `bg`
  - `Renderer.render(frame, world, atm, amb, player, trail: Trail, hud): void`
  - `Game.trail: Trail`, fed in `update`, passed in `draw`

- [ ] **Step 1: Write the failing tests**

Replace `test/render.test.ts` with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Atmosphere } from '../src/ambient.ts';
import type { Ambient } from '../src/ambient.ts';
import { ASPECT, BLADES, Biome, COLORS, COLOR_BITS } from '../src/config.ts';
import { Frame } from '../src/frame.ts';
import { Trail } from '../src/grass.ts';
import { Renderer, quantize, viewOrigin } from '../src/render.ts';
import { World, cellOffset, findSpot } from '../src/world.ts';

function scene(startHour: number) {
  return {
    world: new World(1),
    atm: new Atmosphere(1, { startHour, forceFront: 0 }),
    player: { x: 40.5, y: 80.5, vx: 0, vy: 0 },
    trail: new Trail(),
  };
}

function averageForeground(frame: Frame, from = 0, to = frame.fg.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const c = frame.fg[i];
    sum += (c >> 16) + ((c >> 8) & 255) + (c & 255);
  }
  return sum / (to - from);
}

const BLADE_GLYPHS = new Set<number>(Object.values(BLADES));

/** A grassland cell with grassland two columns either side, whose eastern neighbour is a tall blade. */
function grassRun(world: World): { mx: number; my: number } {
  const near = findSpot(world, 0, 0, (b) => b === Biome.Grassland);
  for (let my = near.my - 32; my < near.my + 32; my++) {
    for (let mx = near.mx - 32; mx < near.mx + 32; mx++) {
      const grass = [-2, -1, 0, 1, 2].every((d) => world.biomeAt(mx + d, my) === Biome.Grassland);
      const tall = (world.chunkAt(mx + 1, my).variant[cellOffset(mx + 1, my)] & 3) !== 0;
      if (grass && tall) return { mx, my };
    }
  }
  throw new Error('no grassland run near the origin');
}

/** You on a grass run at noon, with the given wind. */
function onGrass(windX: number, windStrength: number) {
  const world = new World(1);
  const atm = new Atmosphere(1, { startHour: 12, forceFront: 0 });
  const spot = grassRun(world);
  const player = { x: spot.mx + 0.5, y: (spot.my + 0.5) * ASPECT, vx: 0, vy: 0 };
  const amb: Ambient = { ...atm.snapshot(), realTime: 0.1, windX, windY: 0, windStrength };
  return { world, atm, player, amb };
}

test('quantize keeps the ends and rounds to 2^COLOR_BITS levels', () => {
  assert.equal(quantize(0), 0);
  assert.equal(quantize(255), 255);
  assert.equal(quantize(-4), 0);
  assert.equal(quantize(300), 255);
  const levels = new Set<number>();
  for (let c = 0; c < 256; c++) levels.add(quantize(c));
  assert.equal(levels.size, 1 << COLOR_BITS);
});

test('the view is centred on you', () => {
  assert.deepEqual(viewOrigin({ x: 100.7, y: 41, vx: 0, vy: 0 }, 60, 19), { left: 70, top: 11 });
});

test('you are drawn at the centre of the map, and every cell is filled', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, trail, { fps: 60 });
  assert.equal(frame.glyph[(19 >> 1) * 60 + 30], '@'.codePointAt(0));
  assert.ok(frame.glyph.every((g) => g !== 0));
});

test('every map cell has a black background', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, trail, { fps: 60 });
  for (let i = 0; i < 19 * 60; i++) assert.equal(frame.bg[i], COLORS.ground, `cell ${i}`);
  assert.equal(frame.bg[19 * 60], COLORS.hudBg);
});

test('the status bar shows position, time, fps and seed, and can be hidden', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(120, 20);
  const renderer = new Renderer();
  renderer.render(frame, world, atm, atm.snapshot(), player, trail, { fps: 57 });
  const bar = frame.rowText(19);
  assert.match(bar, /x 41 {2}y 81 │/);
  assert.match(bar, /12:00 afternoon/);
  assert.match(bar, /57 fps │ seed 1/);
  renderer.render(frame, world, atm, atm.snapshot(), player, trail, null);
  assert.ok(!frame.rowText(19).includes('fps'));
});

test('a window below 40×12 asks to be made bigger', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(30, 10);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, trail, { fps: 60 });
  assert.ok(frame.rowText(5).includes('Make the window bigger'));
});

test('night is darker than noon, and the lantern lights your surroundings', () => {
  const noon = scene(12);
  const night = scene(23);
  const a = new Frame(80, 24);
  const b = new Frame(80, 24);
  new Renderer().render(a, noon.world, noon.atm, noon.atm.snapshot(), noon.player, noon.trail, null);
  new Renderer().render(b, night.world, night.atm, night.atm.snapshot(), night.player, night.trail, null);
  assert.ok(averageForeground(b) < averageForeground(a) * 0.6);
  // Same world and spot in both scenes, so the night/noon ratio isolates the light.
  const ratio = (from: number, to: number): number => averageForeground(b, from, to) / averageForeground(a, from, to);
  const nearYou = ratio(12 * 80 + 36, 12 * 80 + 44);
  const farAway = ratio(0, 8);
  assert.ok(nearYou > farAway, `near ${nearYou} vs far ${farAway}`);
});

test('the screen edges are darker than the centre at noon', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(80, 24);
  new Renderer().render(frame, world, atm, atm.snapshot(), player, trail, null);
  const corner = averageForeground(frame, 0, 8);
  const centre = averageForeground(frame, 12 * 80 + 36, 12 * 80 + 44);
  assert.ok(corner < centre * 0.5, `corner ${corner} vs centre ${centre}`);
});

test('blades bend away from your trail and stand farther off', () => {
  const { world, atm, player, amb } = onGrass(0, 0);
  const trail = new Trail();
  trail.push(player.x - 1, player.y, 0); // one step ago, one column west
  trail.push(player.x, player.y, 0.1);
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, amb, player, trail, null);
  const row = 20 >> 1;
  const at = (col: number): number => frame.glyph[row * 60 + col];
  assert.ok(at(29) === BLADES.flat || at(29) === BLADES.shortFlat, 'the blade you just stepped off lies flat');
  assert.equal(at(31), BLADES.right, 'the blade ahead of you leans away');
  assert.ok(at(32) === BLADES.upright || at(32) === BLADES.short, 'two columns on, blades stand');
});

test('blades still show with an empty trail, without asking it to bend', () => {
  const { world, atm, player, amb } = onGrass(1, 1);
  class EmptyTrail extends Trail {
    bendAt(): [number, number] {
      throw new Error('bendAt must not be called with an empty trail');
    }
  }
  const frame = new Frame(60, 20);
  new Renderer().render(frame, world, atm, amb, player, new EmptyTrail(), null);
  const row = 20 >> 1;
  const at = (col: number): number => frame.glyph[row * 60 + col];
  assert.ok(at(31) === BLADES.upright || at(31) === BLADES.right, 'a tall blade stands or leans with the east wind');
  for (const col of [28, 29, 32]) assert.ok(BLADE_GLYPHS.has(at(col)), `column ${col}`);
});
```

Append to `test/game.test.ts`:

```ts
test('each update records your position in the trail', () => {
  const game = new Game(3, 80, 24);
  assert.equal(game.trail.bounds(0), null);
  for (let i = 0; i < 12; i++) game.update({ ...idle, dx: 1 }, 1 / 60);
  assert.notEqual(game.trail.bounds(game.atm.realTime), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/render.test.ts test/game.test.ts`
Expected: FAIL. In `render.test.ts`, "every map cell has a black background" fails on a biome background; the status-bar test fails because the old `render` has no trail parameter, so the hud argument lands in the wrong place; both blade tests fail at column 31, where the old grassland glyphs `, . ' "` are drawn instead of a blade. In `game.test.ts`, the trail test fails with `Cannot read properties of undefined (reading 'bounds')`.

- [ ] **Step 3: Update the config**

In `src/config.ts`, replace the `BiomeDef` type with:

```ts
export type BiomeDef = {
  readonly name: string;
  /** Code points; a cell's variant picks one. */
  readonly glyphs: readonly number[];
  /** Daylight foreground colour on black, 0xRRGGBB. */
  readonly fg: number;
  /** Multiplies walking speed. */
  readonly speed: number;
  readonly water: WaterKind;
  /** Trees switch glyph when a gust passes. */
  readonly sways: boolean;
  /** Drawn as blades that lean with the wind and bend around you. */
  readonly blades: boolean;
};
```

Replace the `BIOMES` table with:

```ts
/** One entry per Biome id, in id order. All glyphs are single-width; colours are tuned for a black background. */
export const BIOMES: readonly BiomeDef[] = [
  { name: 'Deep ocean', glyphs: glyphs('≈~'), fg: 0x2f5aa8, speed: 0.45, water: Water.Sea, sways: false, blades: false },
  { name: 'Ocean', glyphs: glyphs('~≈'), fg: 0x4a8be0, speed: 0.45, water: Water.Sea, sways: false, blades: false },
  { name: 'Shallows', glyphs: glyphs('~·'), fg: 0x8fe3e3, speed: 0.55, water: Water.Sea, sways: false, blades: false },
  { name: 'River', glyphs: glyphs('~≈'), fg: 0x9fd4ff, speed: 0.55, water: Water.River, sways: false, blades: false },
  { name: 'Lake', glyphs: glyphs('~≈'), fg: 0x8cc8f0, speed: 0.55, water: Water.Lake, sways: false, blades: false },
  { name: 'Beach', glyphs: glyphs('.:·'), fg: 0xe3cf93, speed: 0.9, water: Water.None, sways: false, blades: false },
  { name: 'Grassland', glyphs: glyphs(',.\'"'), fg: 0x62d45e, speed: 1.0, water: Water.None, sways: false, blades: true },
  { name: 'Forest', glyphs: glyphs('♣♠'), fg: 0x4db35a, speed: 0.6, water: Water.None, sways: true, blades: false },
  { name: 'Swamp', glyphs: glyphs('",~'), fg: 0x9cb064, speed: 0.5, water: Water.None, sways: false, blades: true },
  { name: 'Desert', glyphs: glyphs('.·:'), fg: 0xe6c070, speed: 0.8, water: Water.None, sways: false, blades: false },
  { name: 'Tundra', glyphs: glyphs(".'·"), fg: 0xcfd9cf, speed: 0.85, water: Water.None, sways: false, blades: false },
  { name: 'Hills', glyphs: glyphs('∩n'), fg: 0xb49a5a, speed: 0.65, water: Water.None, sways: false, blades: false },
  { name: 'Mountains', glyphs: glyphs('▲^'), fg: 0xc8c4bf, speed: 0.45, water: Water.None, sways: false, blades: false },
  { name: 'Snowy peaks', glyphs: glyphs('▲^'), fg: 0xffffff, speed: 0.4, water: Water.None, sways: false, blades: false },
];
```

Replace the `COLORS` table with:

```ts
export const COLORS = {
  /** Every map cell's background. */
  ground: 0x000000,
  player: 0xfff2c8,
  /** Bright blade tips. */
  tip: 0xeaffe0,
  hudFg: 0xd6d9de,
  hudBg: 0x12161c,
  rain: 0xa9c4e8,
  snow: 0xf4f8ff,
  foam: 0xf0f6ff,
} as const;
```

- [ ] **Step 4: Write the renderer**

Replace `src/render.ts` with:

```ts
// Builds a frame: terrain on black, blades, moving water and weather, light, you, and the status bar.
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
const AT = code('@');
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
  private clouds = new Float32Array(0);
  private gusts = new Float32Array(0);

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

    // You, on black.
    const pc = cols >> 1;
    const pr = mapRows >> 1;
    frame.set(pc, pr, AT, COLORS.player, COLORS.ground);

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
```

- [ ] **Step 5: Wire the trail into the game**

In `src/game.ts`, after the line `import { Frame } from './frame.ts';` add:

```ts
import { Trail } from './grass.ts';
```

In the `Game` class, after `fps = 0;` add:

```ts
  /** Where you have walked lately, for the grass. */
  readonly trail = new Trail();
```

Replace the `update` method with:

```ts
  /** One fixed simulation step. */
  update(intent: Intent, dt: number): void {
    this.atm.step(dt, intent.fastTime ? TIME_LAPSE : 1);
    const here = this.world.biomeAt(Math.floor(this.player.x), Math.floor(this.player.y / ASPECT));
    this.player = stepPlayer(this.player, intent, BIOMES[here].speed, dt);
    this.trail.push(this.player.x, this.player.y, this.atm.realTime);
  }
```

In `draw`, replace the `this.renderer.render(...)` line with:

```ts
    this.renderer.render(next, this.world, this.atm, this.atm.snapshot(), this.player, this.trail, hud);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/render.test.ts test/game.test.ts`
Expected: PASS, `tests 19`, `fail 0` (10 render, 9 game)

- [ ] **Step 7: Run the whole suite**

Run: `node --test`
Expected: PASS, `tests 100`, `fail 0`

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/render.ts src/game.ts test/render.test.ts test/game.test.ts
git commit -m "feat: dark terrain with black backgrounds, blades and a lit radius" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The figure and your name

**Files:**
- Modify: `src/config.ts` (`FIGURE` after `VIGNETTE`; `COLORS.name`)
- Modify: `src/render.ts` (imports, `Renderer` constructor, the "You, on black" block)
- Modify: `src/game.ts` (`Options`, `parseOptions`, `cleanName`, `GameOptions`, `Game`)
- Modify: `src/main.ts` (default name)
- Modify: `README.md`
- Test: `test/render.test.ts` (imports, replace one test, append one), `test/game.test.ts` (imports, two tests changed, one appended)

**Interfaces:**
- Consumes: `Renderer`, `Game`, `parseOptions` as left by Task 3
- Produces:
  - `FIGURE = { stand, walk, stepTime }`, `COLORS.name`
  - `new Renderer(name: string)`
  - `cleanName(text: string): string`
  - `Options.name: string | null`; `--name`
  - `GameOptions.name?: string`; `Game.name: string`

- [ ] **Step 1: Add the config**

In `src/config.ts`, after the `VIGNETTE` line, add:

```ts
/** You: three rows, centred on your cell (the middle row). Spaces are transparent. */
export const FIGURE = {
  stand: [' o ', '/|\\', '/ \\'],
  walk: [' o ', '/|\\', '| |'],
  /** Seconds per leg frame while moving. */
  stepTime: 0.15,
} as const;
```

In the `COLORS` table, after `player: 0xfff2c8,` add:

```ts
  /** Your name above the figure. */
  name: 0xffffff,
```

- [ ] **Step 2: Write the failing tests**

In `test/render.test.ts`, replace every `new Renderer()` with `new Renderer('you')` (eight calls in seven tests: black background, status bar, too small, night with two, edges, blades bend, blades empty trail). Then replace the test `'you are drawn at the centre of the map, and every cell is filled'` with:

```ts
test('you are a figure with your name above, it walks, and every cell is filled', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(60, 20);
  const pr = 19 >> 1;
  const at = (col: number, row: number): string => String.fromCodePoint(frame.glyph[row * 60 + col]);
  new Renderer('Elowen').render(frame, world, atm, atm.snapshot(), player, trail, { fps: 60 });
  assert.equal(at(30, pr - 1), 'o');
  assert.equal(at(29, pr) + at(30, pr) + at(31, pr), '/|\\');
  assert.equal(at(29, pr + 1) + at(31, pr + 1), '/\\');
  assert.equal(frame.rowText(pr - 2).slice(27, 33), 'Elowen');
  assert.ok(frame.glyph.every((g) => g !== 0));
  const moving = { ...player, vx: 12 };
  new Renderer('Elowen').render(frame, world, atm, { ...atm.snapshot(), realTime: 0.2 }, moving, trail, { fps: 60 });
  assert.equal(at(29, pr + 1) + at(31, pr + 1), '||', 'the legs take a step');
  new Renderer('Elowen').render(frame, world, atm, { ...atm.snapshot(), realTime: 0.35 }, moving, trail, { fps: 60 });
  assert.equal(at(29, pr + 1) + at(31, pr + 1), '/\\', 'and step back');
});
```

Append to `test/render.test.ts`:

```ts
test('a long name fits in the smallest window', () => {
  const { world, atm, player, trail } = scene(12);
  const frame = new Frame(40, 12);
  new Renderer('abcdefghijklmnop').render(frame, world, atm, atm.snapshot(), player, trail, { fps: 60 });
  const pr = 11 >> 1;
  assert.ok(frame.rowText(pr - 2).includes('abcdefghijklmnop'));
  assert.equal(String.fromCodePoint(frame.glyph[(pr - 1) * 40 + 20]), 'o');
  assert.ok(frame.rowText(11).includes('fps'));
});
```

In `test/game.test.ts`, replace the import from `../src/game.ts` with:

```ts
import { Game, benchIntent, cleanName, parseOptions, seedFrom } from '../src/game.ts';
```

Replace the test `'parseOptions reads seed, bench, size and frames'` with:

```ts
test('parseOptions reads seed, bench, size, frames and name', () => {
  assert.deepEqual(parseOptions(['--seed', '42', '--bench', '--size', '80x24', '--frames', '30', '--name', 'Senje']), {
    seed: 42,
    bench: true,
    cols: 80,
    rows: 24,
    frames: 30,
    name: 'Senje',
  });
});
```

In the test `'parseOptions has defaults and rejects bad input'`, replace the first assertion with:

```ts
  assert.deepEqual(parseOptions([]), { seed: null, bench: false, cols: 200, rows: 60, frames: 600, name: null });
```

Append to `test/game.test.ts`:

```ts
test('your name is cleaned: trimmed, control characters removed, cut to 16, never empty', () => {
  assert.equal(cleanName('  Elowen  '), 'Elowen');
  assert.equal(cleanName('a\x1bb\x07c\x7fd'), 'abcd');
  assert.equal(cleanName('abcdefghijklmnopqrstuvwxyz'), 'abcdefghijklmnop');
  assert.equal(cleanName('   '), 'you');
  assert.equal(cleanName('\x1b[31m'), '[31m');
  assert.equal(new Game(3, 80, 24, { name: ' Senje ' }).name, 'Senje');
  assert.equal(new Game(3, 80, 24).name, 'you');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/render.test.ts test/game.test.ts`
Expected: FAIL. `game.test.ts` fails with `does not provide an export named 'cleanName'`; in `render.test.ts` the figure test fails on `'o'` (the centre row above is terrain) and the long-name test fails on the name.

- [ ] **Step 4: Draw the figure and name**

In `src/render.ts`, add `FIGURE,` to the config import list (after `COLORS,`), and delete the line `const AT = code('@');`.

Replace the `export class Renderer {` line and its two fields with:

```ts
export class Renderer {
  private readonly name: string;
  private clouds = new Float32Array(0);
  private gusts = new Float32Array(0);

  /** `name` is drawn above your figure. */
  constructor(name: string) {
    this.name = name;
  }
```

Replace the block from `// You, on black.` through `frame.set(pc, pr, AT, COLORS.player, COLORS.ground);` with:

```ts
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
    if (nameRow >= 0) frame.text(pc - (this.name.length >> 1), nameRow, this.name, COLORS.name, COLORS.ground);
```

- [ ] **Step 5: Add the name option**

In `src/game.ts`, replace the `Options` type with:

```ts
export type Options = {
  /** null when no --seed was given. */
  readonly seed: number | null;
  readonly bench: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly frames: number;
  /** null when no --name was given. */
  readonly name: string | null;
};
```

In `parseOptions`, add to the `options` object after `frames: { type: 'string', default: '600' },`:

```ts
      name: { type: 'string' },
```

and to the returned object after `frames,`:

```ts
    name: values.name ?? null,
```

After the `randomSeed` function, add:

```ts
/** Trims, drops control characters, and cuts to 16 characters; an empty name becomes `you`. */
export function cleanName(text: string): string {
  const kept = Array.from(text.trim())
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp >= 0x20 && cp !== 0x7f;
    })
    .slice(0, 16)
    .join('')
    .trim();
  return kept.length > 0 ? kept : 'you';
}
```

Replace the `GameOptions` type with:

```ts
export type GameOptions = AtmosphereOptions & { readonly spawn?: 'land' | 'coast'; readonly name?: string };
```

In the `Game` class, replace `private readonly renderer = new Renderer();` with:

```ts
  /** Shown above your figure. */
  readonly name: string;
  private readonly renderer: Renderer;
```

and at the start of the constructor body (before `this.world = new World(seed);`) add:

```ts
    this.name = cleanName(options.name ?? 'you');
    this.renderer = new Renderer(this.name);
```

- [ ] **Step 6: Default the name from the login name**

In `src/main.ts`, after the first comment line add:

```ts
import { userInfo } from 'node:os';
```

Before `async function play(`, add:

```ts
/** Your login name, or `you` when the system cannot say. */
function defaultName(): string {
  try {
    return userInfo().username;
  } catch {
    return 'you';
  }
}
```

Replace the `const game = new Game(...)` line with:

```ts
  const game = new Game(options.seed ?? randomSeed(), term.cols, term.rows, { name: options.name ?? defaultName() });
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test test/render.test.ts test/game.test.ts`
Expected: PASS, `tests 21`, `fail 0` (11 render, 10 game)

- [ ] **Step 8: Update the README**

In `README.md`, replace the paragraph starting with `` `--seed 42` `` with:

```markdown
`--seed 42` (or any word) brings the same world back; the seed is shown in the status bar. `--name Elowen` sets the name above your figure; without it, your login name is used.

The map is drawn as coloured glyphs on black. Grass is blades that lean with the wind and part around you as you walk; the view is lit around you and fades to black at the edges.
```

- [ ] **Step 9: Run the whole suite**

Run: `node --test`
Expected: PASS, `tests 102`, `fail 0`

- [ ] **Step 10: Commit**

```bash
git add src/config.ts src/render.ts src/game.ts src/main.ts README.md test/render.test.ts test/game.test.ts
git commit -m "feat: a named figure instead of the @, with --name" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Verify: suite, bench, pseudo-terminal smoke test, Ghostty playtest

**Files:**
- Modify (only if a bench target is missed): `src/config.ts` (`COLOR_BITS`)

**Interfaces:**
- Consumes: the finished program
- Produces: measured numbers and a smoke-test result for the user, then the user's playtest verdict

- [ ] **Step 1: Run the whole suite**

Run: `node --test`
Expected: `fail 0` (102 tests)

- [ ] **Step 2: Bench at both sizes**

```bash
node src/main.ts --bench --seed 1 --size 200x60
```

```bash
node src/main.ts --bench --seed 1 --size 320x90
```

Expected:
- **200×60:** build mean ≤ 5 ms, p95 ≤ 8 ms, output mean ≤ 120 KB. Output should be well below the previous 47 KB mean, since backgrounds never change.
- **320×90:** build mean ≤ 10 ms, p95 ≤ 14 ms; output is only reported.

Copy both outputs into the task report.

- [ ] **Step 3: Only if a target is missed, pull the one documented lever**

**Output over target:** set `export const COLOR_BITS = 4;` in `src/config.ts`, rerun Steps 1 and 2.

**Build time over target:** profile with `node --cpu-prof --cpu-prof-dir=prof src/main.ts --bench --seed 1`, report the three heaviest functions, and stop there. The likely suspect is `Trail.bendAt`; the lever is `GRASS.bendRadius` (smaller box) or `GRASS.maxSamples`. Don't restructure the renderer without the user.

- [ ] **Step 4: Smoke-test the real game loop in a pseudo-terminal**

```bash
SMOKE="$(mktemp -d)/smoke.out"
(sleep 3; printf q; sleep 1) | script -q "$SMOKE" sh -c 'stty cols 120 rows 40; exec node src/main.ts --seed 7 --name Smoke' > /dev/null
printf 'entered full screen: %s\n' "$(grep -aoF $'\x1b[?1049h' "$SMOKE" | wc -l | tr -d ' ')"
printf 'frames written:      %s\n' "$(grep -aoF $'\x1b[?2026h' "$SMOKE" | wc -l | tr -d ' ')"
printf 'name drawn:          %s\n' "$(grep -acF 'Smoke' "$SMOKE")"
printf 'restored at the end: %s\n' "$(tail -c 200 "$SMOKE" | grep -acF $'\x1b[?1049l')"
```

Expected:
- entered full screen: `1`
- frames written: ≥ `100`
- name drawn: ≥ `1`
- restored at the end: `1`

- [ ] **Step 5: Commit any tuning**

Only if Step 3 changed anything:

```bash
git add src/config.ts
git commit -m "perf: coarser colour rounding to meet the output budget" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand over for the Ghostty playtest**

Report Steps 1–4 to the user, then ask them to run this in a full-size Ghostty window:

```bash
cd ~/Projects/wander && node src/main.ts
```

Ask them to check:

- The map is black with coloured glyphs; beach, desert and tundra are still readable.
- Grassland and swamp are blades that ripple as gusts pass, part around the figure as it walks, and close again behind it within about a second. Standing still keeps the blades under you flat.
- The view is bright around the figure and fades to black at the edges; at night the lantern still glows around you.
- The figure walks, and the name above it is right (their login name, or `--name`).
- The status bar still holds about 60 fps while walking and running through grass.
- Every character takes exactly one column, with no ragged rows.

Tuning colours, blade thresholds and the lit radius by eye is the user's call; all of them are in `src/config.ts`. After their verdict, use superpowers:finishing-a-development-branch for `feat/first-version`.
