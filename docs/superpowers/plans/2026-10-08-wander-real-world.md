# Wander Real World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With `--place` or `--at`, Wander draws a real place from Terrarium elevation tiles and OpenStreetMap land cover at 3 m per column, loading data ahead of you and caching it on disk, while the generated world stays the default.

**Architecture:** Four new pure modules do the thinking: `geo.ts` (flat projection around the start, Web Mercator, tiles), `png.ts` (decoder), `osm.ts` (Overpass query, features, rasterising into cells) and `realworld.ts` (chunks assembled from tiles and regions, with fog while data is missing). `net.ts` is the only module that touches the network and the cache directory, with an injectable fetcher; `place.ts` resolves names through Nominatim. `world.ts` gains a `ChunkSource` type that both worlds satisfy, so the renderer and game don't know which world they draw. The renderer draws fog for unready chunks and a real-world status bar; the game gains the options and the start cell.

**Tech Stack:** Node ≥ 25 running `.ts` directly, `node:test` with `node:assert/strict`, `node:zlib` for PNG inflate, the global `fetch`. No dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-wander-real-world-design.md`, which builds on `docs/superpowers/specs/2026-10-08-wander-design.md`. Read both alongside this plan.

**Working directory:** every command below runs from `/Users/krystofpe/Projects/wander`, on branch `feat/real-world` (cut from `feat/first-version`; no new branch).

## Global Constraints

- Node ≥ 25. `node src/main.ts` runs the game, `node --test` finds `test/*.test.ts` without arguments. The test reporter prints colour codes in this environment; pipe through `sed -E 's/\x1b\[[0-9;]*m//g'` before grepping.
- No dependencies. No type-checker; the tests are the safety net.
- Only TypeScript syntax Node can strip: no `enum`, no `namespace`, no constructor parameter properties; `implements` clauses are fine; type-only imports use `import type`; relative imports end in `.ts`.
- `ASPECT = 2`: map cell `(mx, my)` is centred on world point `(mx + 0.5, (my + 0.5)·ASPECT)`; one world unit is one column, `scale` metres (default `REAL.scale = 3`); y grows south.
- Projection: `lat = lat0 − (y·scale)/111320`, `lon = lon0 + (x·scale)/(111320·cos lat0)`.
- Elevation: Terrarium zoom 13, `R·256 + G + B/256 − 32768` metres, sampled bilinearly, clamped at the tile edge. Regions: zoom-14 tiles, one Overpass query each.
- Cover priority, highest paints over lower: None 0, Grass 1, Field 2, Forest 3, Town 4, Building 5, Railway 6, Road 7, Water 8, Bridge 9.
- Biomes 14–18 are Field, Town, Building, Road, Railway; `GENERATED_BIOMES = 14`.
- Cache under `$XDG_CACHE_HOME/wander` or `~/.cache/wander`; tests use a temporary directory and a fake fetcher and never touch the network.
- Retries after 5 s, 15 s, then every 60 s; at most 4 fetches in flight. Every request sends `User-Agent: wander/0.1 (terminal landscape toy)`.
- Exit codes: 1 no terminal, 2 bad arguments or a place that cannot be resolved.
- Bench targets stay on the generated world: 200×60 mean ≤ 5 ms, p95 ≤ 8 ms, output mean ≤ 120 KB.
- Commits end with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

These are failure modes the spec implies but its own test list doesn't exercise. Each one has a test in the task named in its last column:

| # | Situation | Expected behaviour | Test in |
|---|---|---|---|
| 1 | Overpass returns elements without geometry, or a reply with no `elements` at all | They are ignored; an empty reply yields no features and the chunk still draws from elevation | Task 4, "elements without geometry…" and "an empty reply…" |
| 2 | A relation's outer ring is split across several member ways | The pieces are stitched into one ring before filling | Task 4, "a relation's outer ring split across ways…" |
| 3 | A cached tile is corrupt (truncated) | Decoding fails, the file is forgotten, and the retry fetches a fresh copy | Task 6, "a corrupt cached tile is forgotten…" |
| 4 | A chunk straddles two regions | Both regions are fetched and both halves draw | Task 6, "a chunk on a region border…" |
| 5 | A resolved place name holds characters the status bar cannot draw one per column | The name is cleaned to single-width characters, and the coordinates stand in when nothing is left | Task 7, "place names are cleaned…" |

## Refinements to the spec

| Spec says | This plan does | Why |
|---|---|---|
| A relation contributes one polygon per `outer` member | Outer and inner member ways are first stitched end to end into closed rings | Big rivers and lakes are multipolygons whose rings are split across many ways. |
| The cache is used without any request | A file that fails to decode or parse is deleted (`Net.forget`) before the retry | A corrupt download must not be read back forever. |
| The status bar shows the place name | The name is cleaned to single-width characters (`cleanLabel`); the coordinates stand in when nothing is left | A wide or hidden character would garble the row. |
| — | `test/support/encode-png.ts` holds a PNG encoder used by two test files | The decoder is tested against real PNG filters without a dependency. |

## File map

| File | Change | Task |
|---|---|---|
| `src/geo.ts` | New: `Projection`, Mercator, tiles | 1 |
| `src/png.ts` | New: `decodePng` | 2 |
| `src/config.ts` | Five biomes, `GENERATED_BIOMES`, `REAL`, `COLORS.fogFg/fogBg` | 3 |
| `src/world.ts` | `ChunkSource`, `Chunk.ready` | 3 |
| `src/osm.ts` | New: query, features, raster | 4 |
| `src/net.ts` | New: cache + fetch | 5 |
| `src/place.ts` | New: Nominatim | 5 |
| `src/realworld.ts` | New: `RealWorld` | 6 |
| `src/render.ts` | Fog, real-world status bar, `ChunkSource` | 7 |
| `src/game.ts` | Options, `GameOptions.world/place`, `cleanLabel`, start cell | 7 |
| `src/main.ts` | Resolve place, build the real world | 7 |
| `README.md` | Real places, attribution | 7 |
| `test/geo.test.ts`, `test/png.test.ts`, `test/support/encode-png.ts`, `test/osm.test.ts`, `test/net.test.ts`, `test/place.test.ts`, `test/realworld.test.ts` | New | 1, 2, 4, 5, 6 |
| `test/world.test.ts`, `test/render.test.ts`, `test/game.test.ts` | Modified | 3, 7 |

---

### Task 1: Projection and tile maths

**Files:**
- Create: `src/geo.ts`
- Test: `test/geo.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `TILE = 256`, `METRES_PER_DEGREE = 111320`
  - `type LatLon = { lat, lon }`, `type Bounds = { south, west, north, east }`
  - `class Projection { constructor(lat0, lon0, scale); lat0; lon0; scale; toLatLon(x, y): LatLon; toWorld(lat, lon): { x, y } }`
  - `mercator(lat, lon, z): { px, py }`, `unmercator(px, py, z): LatLon`, `tileOf(lat, lon, z): { tx, ty }`, `tileBounds(z, tx, ty): Bounds`, `tileKey(z, tx, ty): string`

- [ ] **Step 1: Write the failing test**

`test/geo.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRES_PER_DEGREE, Projection, mercator, tileBounds, tileKey, tileOf, unmercator } from '../src/geo.ts';

test('the projection round-trips, one unit east is scale metres, and y grows south', () => {
  const p = new Projection(50.088, 14.414, 3);
  const { lat, lon } = p.toLatLon(123.4, -56.7);
  const back = p.toWorld(lat, lon);
  assert.ok(Math.abs(back.x - 123.4) < 1e-6 && Math.abs(back.y + 56.7) < 1e-6, `${back.x}, ${back.y}`);
  const east = p.toLatLon(1, 0);
  const metres = (east.lon - 14.414) * METRES_PER_DEGREE * Math.cos((50.088 * Math.PI) / 180);
  assert.ok(Math.abs(metres - 3) < 1e-6, `${metres} m`);
  const south = p.toLatLon(0, 1);
  assert.ok(south.lat < 50.088);
  assert.ok(Math.abs((50.088 - south.lat) * METRES_PER_DEGREE - 3) < 1e-6);
});

test('mercator and tile maths match known values', () => {
  assert.deepEqual(tileOf(50.0875, 14.4213, 13), { tx: 4424, ty: 2774 });
  const { px, py } = mercator(0, 0, 0);
  assert.ok(Math.abs(px - 128) < 1e-9 && Math.abs(py - 128) < 1e-9);
  const back = unmercator(px, py, 0);
  assert.ok(Math.abs(back.lat) < 1e-9 && Math.abs(back.lon) < 1e-9);
  const b = tileBounds(13, 4424, 2774);
  assert.ok(b.south < 50.0875 && 50.0875 < b.north && b.west < 14.4213 && 14.4213 < b.east);
  assert.ok(b.north - b.south < 0.03 && b.east - b.west < 0.05, 'a zoom-13 tile spans a few kilometres');
  assert.equal(tileKey(13, 4424, 2774), '13/4424/2774');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/geo.test.ts`
Expected: FAIL with `Cannot find module '…/src/geo.ts'`

- [ ] **Step 3: Write the implementation**

`src/geo.ts`:

```ts
// Geography: a flat projection around the start place, Web Mercator and tile maths. Pure.

/** Pixels per tile side. */
export const TILE = 256;
/** Metres per degree of latitude, and of longitude at the equator. */
export const METRES_PER_DEGREE = 111320;

export type LatLon = { readonly lat: number; readonly lon: number };
export type Bounds = { readonly south: number; readonly west: number; readonly north: number; readonly east: number };

/** Maps world units (x east, y south, `scale` metres each) around an origin to latitude and longitude, and back. */
export class Projection {
  readonly lat0: number;
  readonly lon0: number;
  readonly scale: number;
  private readonly cosLat0: number;

  constructor(lat0: number, lon0: number, scale: number) {
    this.lat0 = lat0;
    this.lon0 = lon0;
    this.scale = scale;
    this.cosLat0 = Math.cos((lat0 * Math.PI) / 180);
  }

  toLatLon(x: number, y: number): LatLon {
    return {
      lat: this.lat0 - (y * this.scale) / METRES_PER_DEGREE,
      lon: this.lon0 + (x * this.scale) / (METRES_PER_DEGREE * this.cosLat0),
    };
  }

  toWorld(lat: number, lon: number): { x: number; y: number } {
    return {
      x: ((lon - this.lon0) * METRES_PER_DEGREE * this.cosLat0) / this.scale,
      y: ((this.lat0 - lat) * METRES_PER_DEGREE) / this.scale,
    };
  }
}

/** Web Mercator pixel coordinates at zoom z, with 256-pixel tiles. */
export function mercator(lat: number, lon: number, z: number): { px: number; py: number } {
  const n = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { px: ((lon + 180) / 360) * n, py: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

export function unmercator(px: number, py: number, z: number): LatLon {
  const n = TILE * 2 ** z;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / n))) * 180) / Math.PI, lon: (px / n) * 360 - 180 };
}

export function tileOf(lat: number, lon: number, z: number): { tx: number; ty: number } {
  const { px, py } = mercator(lat, lon, z);
  return { tx: Math.floor(px / TILE), ty: Math.floor(py / TILE) };
}

export function tileBounds(z: number, tx: number, ty: number): Bounds {
  const nw = unmercator(tx * TILE, ty * TILE, z);
  const se = unmercator((tx + 1) * TILE, (ty + 1) * TILE, z);
  return { south: se.lat, west: nw.lon, north: nw.lat, east: se.lon };
}

export function tileKey(z: number, tx: number, ty: number): string {
  return `${z}/${tx}/${ty}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/geo.test.ts`
Expected: PASS, `tests 2`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/geo.ts test/geo.test.ts
git commit -m "feat: flat projection, web mercator and tile maths" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: PNG decoder

**Files:**
- Create: `src/png.ts`
- Create: `test/support/encode-png.ts` (test helper, also used by Task 6)
- Test: `test/png.test.ts`

**Interfaces:**
- Consumes: `node:zlib`
- Produces:
  - `type Png = { width, height, channels, data: Uint8Array }`
  - `decodePng(bytes: Uint8Array): Png` for 8-bit greyscale (1), greyscale+alpha (2), RGB (3) and RGBA (4), non-interlaced; throws `not a PNG`, `unsupported PNG: …` or `unknown PNG filter N`
  - test helper `encodePng(width, height, channels, pixels): Uint8Array`, which uses filter type `row % 5` on each row

- [ ] **Step 1: Write the test helper and the failing test**

`test/support/encode-png.ts`:

```ts
// A PNG encoder for tests only: 8-bit, every row filtered with type row % 5, valid CRCs.
import { Buffer } from 'node:buffer';
import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(width: number, height: number, channels: number, pixels: Uint8Array, bitDepth = 8): Uint8Array {
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const f = y % 5;
    raw[y * (stride + 1)] = f;
    for (let i = 0; i < stride; i++) {
      const x = pixels[y * stride + i];
      const a = i >= channels ? pixels[y * stride + i - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels] : 0;
      let predicted = 0;
      if (f === 1) predicted = a;
      else if (f === 2) predicted = b;
      else if (f === 3) predicted = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      raw[y * (stride + 1) + 1 + i] = (x - predicted) & 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = channels === 1 ? 0 : channels === 2 ? 4 : channels === 3 ? 2 : 6;
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [signature, chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))];
  return new Uint8Array(Buffer.concat(parts.map((p) => Buffer.from(p))));
}
```

`test/png.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../src/noise.ts';
import { decodePng } from '../src/png.ts';
import { encodePng } from './support/encode-png.ts';

function pixels(count: number): Uint8Array {
  const r = rng(9);
  return Uint8Array.from({ length: count }, () => Math.floor(r() * 256));
}

test('an RGB image through every filter decodes to the original pixels', () => {
  const original = pixels(7 * 10 * 3);
  const png = decodePng(encodePng(7, 10, 3, original));
  assert.equal(png.width, 7);
  assert.equal(png.height, 10);
  assert.equal(png.channels, 3);
  assert.deepEqual(png.data, original);
});

test('RGBA and greyscale images decode too', () => {
  const rgba = pixels(5 * 6 * 4);
  assert.deepEqual(decodePng(encodePng(5, 6, 4, rgba)).data, rgba);
  const grey = pixels(9 * 5);
  const png = decodePng(encodePng(9, 5, 1, grey));
  assert.equal(png.channels, 1);
  assert.deepEqual(png.data, grey);
});

test('anything but 8-bit non-interlaced PNGs is rejected with a clear error', () => {
  assert.throws(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /not a PNG/);
  assert.throws(() => decodePng(encodePng(2, 2, 3, pixels(12), 16)), /unsupported PNG: 16-bit/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/png.test.ts`
Expected: FAIL with `Cannot find module '…/src/png.ts'`

- [ ] **Step 3: Write the implementation**

`src/png.ts`:

```ts
// A small PNG decoder for 8-bit greyscale, RGB and RGBA images: enough for elevation tiles. Pure.
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';

export type Png = { readonly width: number; readonly height: number; readonly channels: number; readonly data: Uint8Array };

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** Channels per colour type: greyscale, RGB, greyscale + alpha, RGBA. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(bytes: Uint8Array): Png {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  let p = 8;
  while (p + 8 <= bytes.length) {
    const length = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    if (type === 'IHDR') {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      bitDepth = bytes[p + 16];
      colorType = bytes[p + 17];
      interlace = bytes[p + 20];
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(bytes.buffer, bytes.byteOffset + p + 8, length));
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + length;
  }
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new Error(`unsupported PNG: ${bitDepth}-bit, colour type ${colorType}, interlace ${interlace}`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(stride * height);
  let q = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[q++];
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[q++];
      const a = i >= channels ? data[row + i - channels] : 0;
      const b = y > 0 ? data[prev + i] : 0;
      const c = y > 0 && i >= channels ? data[prev + i - channels] : 0;
      let v: number;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`unknown PNG filter ${filter}`);
      data[row + i] = v & 255;
    }
  }
  return { width, height, channels, data };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/png.test.ts`
Expected: PASS, `tests 3`, `fail 0`

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS, `tests 91`, `fail 0`. If the helper under `test/support/` is listed as a test file it contributes no tests, so the count is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/png.ts test/png.test.ts test/support/encode-png.ts
git commit -m "feat: PNG decoder for elevation tiles" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Config, the five biomes, and the chunk source

**Files:**
- Modify: `src/config.ts` (`BIOMES`, new constants after the biome table and after `COLORS`)
- Modify: `src/world.ts` (`Chunk.ready`, `generateChunk`, `ChunkSource`)
- Test: `test/world.test.ts` (one test changed)

**Interfaces:**
- Consumes: nothing new
- Produces from `config.ts`:
  - `Biome.Field = 14`, `Biome.Town = 15`, `Biome.Building = 16`, `Biome.Road = 17`, `Biome.Railway = 18` and their `BIOMES` entries; `GENERATED_BIOMES = 14`
  - `REAL = { scale, elevationZoom, regionZoom, lookahead, maxInFlight, retryMs, relief, flowHalo, userAgent, terrariumUrl, overpassUrl, nominatimUrl, roadWidths, seaLevel, shallowsAbove, oceanAbove, snowTemperature, snowAbove, mountainSlope, hillSlope, tundraTemperature }`
  - `COLORS.fogFg = 0x3a3f46`, `COLORS.fogBg = 0x14171b`
- Produces from `world.ts`:
  - `Chunk.ready: boolean` (true for generated chunks)
  - `type ChunkSource = { readonly seed: number; readonly generated: number; chunk(cx, cy): Chunk; chunkAt(mx, my): Chunk; biomeAt(mx, my): BiomeId; temperatureAt(mx, my): number; prefetch(left, top, cols, rows, budgetMs, now?): number }`

- [ ] **Step 1: Change the failing test**

In `test/world.test.ts`, replace the config import line with:

```ts
import { ASPECT, BIOMES, Biome, CHUNK_CACHE_LIMIT, GENERATED_BIOMES, Water } from '../src/config.ts';
```

and replace the test `'every biome appears in a large sample of a fixed seed'` with:

```ts
test('every generated biome appears in a large sample of a fixed seed', () => {
  const terrain = new Terrain(1);
  const r = rng(5);
  const seen = new Set<number>();
  for (let i = 0; i < 40000 && seen.size < GENERATED_BIOMES; i++) {
    seen.add(biomeOf(terrain.fields(r() * 40000 - 20000, r() * 40000 - 20000)));
  }
  const missing = BIOMES.slice(0, GENERATED_BIOMES).filter((_, id) => !seen.has(id)).map((b) => b.name);
  assert.deepEqual(missing, []);
  assert.equal(BIOMES.length, GENERATED_BIOMES + 5, 'five real-world biomes follow the generated ones');
});
```

Append to `test/world.test.ts`:

```ts
test('generated chunks are always ready', () => {
  assert.equal(new World(2).chunk(0, 0).ready, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/world.test.ts`
Expected: FAIL with `does not provide an export named 'GENERATED_BIOMES'`

- [ ] **Step 3: Update the config**

In `src/config.ts`, replace the `Biome` table with:

```ts
export const Biome = {
  DeepOcean: 0,
  Ocean: 1,
  Shallows: 2,
  River: 3,
  Lake: 4,
  Beach: 5,
  Grassland: 6,
  Forest: 7,
  Swamp: 8,
  Desert: 9,
  Tundra: 10,
  Hills: 11,
  Mountains: 12,
  SnowyPeaks: 13,
  Field: 14,
  Town: 15,
  Building: 16,
  Road: 17,
  Railway: 18,
} as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];
/** How many biomes the generated world uses; the rest come only from map data. */
export const GENERATED_BIOMES = 14;
```

In the `BIOMES` table, after the `'Snowy peaks'` entry, add:

```ts
  { name: 'Field', glyphs: glyphs('",'), fg: 0xd2c070, bg: 0x6e6a2a, speed: 0.9, water: Water.None, sways: false },
  { name: 'Town', glyphs: glyphs('.·'), fg: 0x8a8378, bg: 0x55504a, speed: 1.0, water: Water.None, sways: false },
  { name: 'Building', glyphs: glyphs('#▪'), fg: 0x9a9aa0, bg: 0x3a3a40, speed: 0.6, water: Water.None, sways: false },
  { name: 'Road', glyphs: glyphs('·'), fg: 0xc8c8c8, bg: 0x5e5e62, speed: 1.0, water: Water.None, sways: false },
  { name: 'Railway', glyphs: glyphs('+='), fg: 0xb0a890, bg: 0x3c3836, speed: 0.8, water: Water.None, sways: false },
```

After the `// ── Screen` section's `COLORS` table, replace `COLORS` with:

```ts
export const COLORS = {
  player: 0xfff2c8,
  hudFg: 0xd6d9de,
  hudBg: 0x12161c,
  rain: 0xa9c4e8,
  snow: 0xf4f8ff,
  foam: 0xf0f6ff,
  /** Chunks whose map data has not arrived yet. */
  fogFg: 0x3a3f46,
  fogBg: 0x14171b,
} as const;
```

Before the `// ── Screen` section, add:

```ts
// ── Real places ────────────────────────────────────────────────────────────
/** Drawing a real place from elevation tiles and OpenStreetMap. */
export const REAL = {
  /** Metres per column by default; --scale overrides. */
  scale: 3,
  elevationZoom: 13,
  /** One Overpass query per tile of this zoom. */
  regionZoom: 14,
  /** Columns beyond the view and its chunk ring whose data is fetched ahead. */
  lookahead: 100,
  maxInFlight: 4,
  /** Milliseconds before retrying a failed fetch; the last value repeats. */
  retryMs: [5000, 15000, 60000],
  /** Multiplies the dimensionless slope for shading. */
  relief: 3,
  /** Columns either side of a mapped waterway that take its flow direction. */
  flowHalo: 8,
  userAgent: 'wander/0.1 (terminal landscape toy)',
  terrariumUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
  overpassUrl: 'https://overpass-api.de/api/interpreter',
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  /** Road width in columns by highway class. */
  roadWidths: {
    motorway: 5,
    trunk: 5,
    primary: 4,
    secondary: 3,
    tertiary: 2,
    residential: 2,
    living_street: 2,
    pedestrian: 2,
    unclassified: 1,
    service: 1,
  },
  /** Metres: below seaLevel with no map cover is sea, split by depth. */
  seaLevel: -0.5,
  shallowsAbove: -5,
  oceanAbove: -50,
  /** Land with no map cover: snow when colder than this or higher than snowAbove (metres). */
  snowTemperature: 0.15,
  snowAbove: 2500,
  /** Dimensionless slope thresholds. */
  mountainSlope: 0.45,
  hillSlope: 0.2,
  tundraTemperature: 0.25,
} as const;

```

- [ ] **Step 4: Update the world**

In `src/world.ts`, in the `Chunk` type, after `readonly cy: number;` add:

```ts
  /** False while a real place's data is still loading; generated chunks are always ready. */
  readonly ready: boolean;
```

In `generateChunk`, in the `const chunk: Chunk = {` literal, after `cy,` add:

```ts
    ready: true,
```

After the `Chunk` type, add:

```ts
/** What the renderer and game need from a world, generated or real. */
export type ChunkSource = {
  readonly seed: number;
  readonly generated: number;
  chunk(cx: number, cy: number): Chunk;
  chunkAt(mx: number, my: number): Chunk;
  biomeAt(mx: number, my: number): BiomeId;
  temperatureAt(mx: number, my: number): number;
  prefetch(left: number, top: number, cols: number, rows: number, budgetMs: number, now?: () => number): number;
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/world.test.ts`
Expected: PASS, `tests 11`, `fail 0`

- [ ] **Step 6: Run the whole suite**

Run: `node --test`
Expected: PASS, `tests 92`, `fail 0`

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/world.ts test/world.test.ts
git commit -m "feat: real-world biomes, config and the chunk source type" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: OpenStreetMap: query, features, raster

**Files:**
- Create: `src/osm.ts`
- Test: `test/osm.test.ts`

**Interfaces:**
- Consumes: `Projection`, `Bounds`, `LatLon` (Task 1); `ASPECT`, `REAL`, `Water` (Task 3)
- Produces:
  - `Cover = { None: 0, Grass: 1, Field: 2, Forest: 3, Town: 4, Building: 5, Railway: 6, Road: 7, Water: 8, Bridge: 9 }`, `type CoverKind`
  - `type Polygon = { kind: 'polygon'; cover; water: WaterKind; rings: LatLon[][] }` (first ring outer, the rest holes), `type Line = { kind: 'line'; cover; water; width; points: LatLon[] }`, `type Feature = Polygon | Line`
  - `overpassQuery(bounds): string`, `classifyTags(tags): { cover, water, width } | null`, `parseFeatures(json): Feature[]`, `stitchRings(parts: LatLon[][]): LatLon[][]`
  - `type CellRect = { left, top, cols, rows }`, `type CoverRaster = { rect, cover: Uint8Array, water: Uint8Array, flowX: Float32Array, flowY: Float32Array }`
  - `rasterise(features, projection, rect): CoverRaster`

- [ ] **Step 1: Write the failing test**

`test/osm.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, Water } from '../src/config.ts';
import { Projection } from '../src/geo.ts';
import type { LatLon } from '../src/geo.ts';
import { Cover, classifyTags, overpassQuery, parseFeatures, rasterise, stitchRings } from '../src/osm.ts';
import type { Feature } from '../src/osm.ts';

const projection = new Projection(50, 14.4, 3);
/** Lat/lon of a point given in cell coordinates (columns, rows). */
const at = (col: number, row: number): LatLon => projection.toLatLon(col, row * ASPECT);
/** A closed ring around cell columns c0..c1 and rows r0..r1 (inclusive). */
const box = (c0: number, r0: number, c1: number, r1: number): LatLon[] => [at(c0, r0), at(c1 + 1, r0), at(c1 + 1, r1 + 1), at(c0, r1 + 1), at(c0, r0)];
const way = (tags: Record<string, string>, geometry: LatLon[]) => ({ type: 'way', tags, geometry });
const rect = { left: 0, top: 0, cols: 60, rows: 30 };
const coverAt = (raster: { cover: Uint8Array }, col: number, row: number): number => raster.cover[row * 60 + col];

test('the query names every tag family and the bounds', () => {
  const q = overpassQuery({ south: 50, west: 14, north: 50.1, east: 14.1 });
  for (const needle of ['natural"="water', 'waterway', 'landuse', 'leisure', 'building', 'highway', 'railway', 'out geom', '(50,14,50.1,14.1)', 'timeout:180']) {
    assert.ok(q.includes(needle), needle);
  }
});

test('tags classify into covers, water kinds and widths', () => {
  assert.deepEqual(classifyTags({ natural: 'water', water: 'river' }), { cover: Cover.Water, water: Water.River, width: 1 });
  assert.deepEqual(classifyTags({ natural: 'water' }), { cover: Cover.Water, water: Water.Lake, width: 1 });
  assert.deepEqual(classifyTags({ waterway: 'river' }), { cover: Cover.Water, water: Water.River, width: 2 });
  assert.deepEqual(classifyTags({ highway: 'motorway' }), { cover: Cover.Road, water: Water.None, width: 5 });
  assert.deepEqual(classifyTags({ highway: 'residential', bridge: 'yes' }), { cover: Cover.Bridge, water: Water.None, width: 2 });
  assert.equal(classifyTags({ highway: 'footway' }), null);
  assert.equal(classifyTags({ railway: 'tram' })?.cover, Cover.Railway);
  assert.equal(classifyTags({ building: 'yes' })?.cover, Cover.Building);
  assert.equal(classifyTags({ landuse: 'residential' })?.cover, Cover.Town);
  assert.equal(classifyTags({ natural: 'wood' })?.cover, Cover.Forest);
  assert.equal(classifyTags({ landuse: 'farmland' })?.cover, Cover.Field);
  assert.equal(classifyTags({ leisure: 'park' })?.cover, Cover.Grass);
  assert.equal(classifyTags({ amenity: 'cafe' }), null);
});

test('a closed way is a polygon, an open way and a closed road are lines', () => {
  const features = parseFeatures({
    elements: [
      way({ landuse: 'forest' }, box(0, 0, 9, 9)),
      way({ highway: 'residential' }, [at(0, 0), at(10, 0)]),
      way({ highway: 'residential', junction: 'roundabout' }, box(20, 20, 24, 24)),
    ],
  });
  assert.deepEqual(
    features.map((f) => f.kind),
    ['polygon', 'line', 'line'],
  );
});

test('a relation fills its outer ring with a hole for its inner ring', () => {
  const features = parseFeatures({
    elements: [
      {
        type: 'relation',
        tags: { natural: 'water' },
        members: [
          { role: 'outer', geometry: box(0, 0, 19, 19) },
          { role: 'inner', geometry: box(5, 5, 9, 9) },
          { role: 'inner', geometry: box(40, 0, 44, 4) }, // not inside the outer: ignored
        ],
      },
    ],
  });
  assert.equal(features.length, 1);
  assert.equal(features[0].kind, 'polygon');
  assert.equal((features[0] as { rings: unknown[] }).rings.length, 2);
  const raster = rasterise(features, projection, rect);
  assert.equal(coverAt(raster, 2, 2), Cover.Water);
  assert.equal(coverAt(raster, 7, 7), Cover.None, 'the hole is dry');
  assert.equal(coverAt(raster, 42, 2), Cover.None, 'an inner ring outside the outer paints nothing');
  assert.equal(coverAt(raster, 25, 2), Cover.None);
});

test("a relation's outer ring split across ways is stitched before filling", () => {
  const ring = box(0, 0, 19, 19);
  const parts = [ring.slice(0, 2), ring.slice(1, 4).reverse(), ring.slice(3, 5)];
  const stitched = stitchRings(parts);
  assert.equal(stitched.length, 1);
  assert.equal(stitched[0].length, 5);
  const features = parseFeatures({ elements: [{ type: 'relation', tags: { landuse: 'forest' }, members: parts.map((p) => ({ role: 'outer', geometry: p })) }] });
  assert.equal(features.length, 1);
  assert.equal(coverAt(rasterise(features, projection, rect), 10, 10), Cover.Forest);
});

test('higher covers paint over lower ones, and a bridge crosses water', () => {
  const features = parseFeatures({
    elements: [
      way({ leisure: 'park' }, box(0, 0, 59, 29)),
      way({ natural: 'water', water: 'river' }, box(20, 0, 29, 29)),
      way({ highway: 'primary' }, [at(0, 10.5), at(60, 10.5)]),
      way({ highway: 'primary', bridge: 'yes' }, [at(0, 20.5), at(60, 20.5)]),
    ],
  });
  const raster = rasterise(features, projection, rect);
  assert.equal(coverAt(raster, 5, 5), Cover.Grass);
  assert.equal(coverAt(raster, 25, 5), Cover.Water);
  assert.equal(raster.water[5 * 60 + 25], Water.River);
  assert.equal(coverAt(raster, 5, 10), Cover.Road, 'a road paints over grass');
  assert.equal(coverAt(raster, 25, 10), Cover.Water, 'water paints over a plain road');
  assert.equal(coverAt(raster, 25, 20), Cover.Bridge, 'a bridge paints over water');
});

test('road widths follow the class, measured in metres on the ground', () => {
  const across = (highway: string): number => {
    const raster = rasterise(parseFeatures({ elements: [way({ highway }, [at(30.5, 0), at(30.5, 30)])] }), projection, rect);
    let count = 0;
    for (let col = 0; col < 60; col++) if (coverAt(raster, col, 15) === Cover.Road) count++;
    return count;
  };
  assert.equal(across('motorway'), 5);
  assert.equal(across('secondary'), 3);
  assert.equal(across('service'), 1);
  const along = rasterise(parseFeatures({ elements: [way({ highway: 'motorway' }, [at(0, 15.5), at(60, 15.5)])] }), projection, rect);
  let rows = 0;
  for (let row = 0; row < 30; row++) if (coverAt(along, 30, row) === Cover.Road) rows++;
  assert.ok(rows >= 2 && rows <= 3, `a 15 m road is ${rows} rows tall`);
});

test('river cells near a mapped waterway take its flow direction', () => {
  const features = parseFeatures({
    elements: [
      way({ natural: 'water', water: 'river' }, box(10, 0, 40, 29)),
      way({ waterway: 'river' }, [at(0, 15.5), at(60, 15.5)]),
    ],
  });
  const raster = rasterise(features, projection, rect);
  const i = 12 * 60 + 25; // on the river, three rows north of the centreline (6 units: inside the halo)
  assert.ok(Math.abs(raster.flowX[i] - 1) < 1e-9 && Math.abs(raster.flowY[i]) < 1e-9, `flow ${raster.flowX[i]}, ${raster.flowY[i]}`);
  assert.equal(coverAt(raster, 25, 12), Cover.Water);
  const far = 2 * 60 + 25; // 13.5 rows = 27 units north: outside the halo
  assert.equal(raster.flowX[far], 0);
});

test('a building inside residential land is Building, the land around it Town', () => {
  const raster = rasterise(parseFeatures({ elements: [way({ landuse: 'residential' }, box(0, 0, 29, 29)), way({ building: 'yes' }, box(10, 10, 14, 14))] }), projection, rect);
  assert.equal(coverAt(raster, 12, 12), Cover.Building);
  assert.equal(coverAt(raster, 2, 2), Cover.Town);
});

test('elements without geometry or tags, and an empty reply, yield no features', () => {
  assert.deepEqual(parseFeatures({ elements: [{ type: 'way', tags: { building: 'yes' } }, { type: 'node', tags: { amenity: 'cafe' } }, { type: 'way', geometry: box(0, 0, 1, 1) }] }), []);
  assert.deepEqual(parseFeatures({}), []);
  assert.deepEqual(parseFeatures({ elements: [] }), []);
  const empty: Feature[] = [];
  assert.equal(rasterise(empty, projection, rect).cover.every((c) => c === Cover.None), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/osm.test.ts`
Expected: FAIL with `Cannot find module '…/src/osm.ts'`

- [ ] **Step 3: Write the implementation**

`src/osm.ts`:

```ts
// OpenStreetMap: the Overpass query, features from its reply, and rasterising them into cells. Pure.
import { ASPECT, REAL, Water } from './config.ts';
import type { WaterKind } from './config.ts';
import type { Bounds, LatLon, Projection } from './geo.ts';

/** Land cover codes; a higher code paints over a lower one. */
export const Cover = { None: 0, Grass: 1, Field: 2, Forest: 3, Town: 4, Building: 5, Railway: 6, Road: 7, Water: 8, Bridge: 9 } as const;
export type CoverKind = (typeof Cover)[keyof typeof Cover];

export type Polygon = {
  readonly kind: 'polygon';
  readonly cover: CoverKind;
  readonly water: WaterKind;
  /** The first ring is the outside; the rest are holes. */
  readonly rings: readonly (readonly LatLon[])[];
};
export type Line = {
  readonly kind: 'line';
  readonly cover: CoverKind;
  readonly water: WaterKind;
  /** Width in columns. */
  readonly width: number;
  readonly points: readonly LatLon[];
};
export type Feature = Polygon | Line;

export function overpassQuery(b: Bounds): string {
  const box = `(${b.south},${b.west},${b.north},${b.east})`;
  return `[out:json][timeout:180];
(
  way["natural"="water"]${box};
  relation["natural"="water"]${box};
  way["waterway"~"^(river|canal|stream)$"]${box};
  way["landuse"~"^(forest|grass|meadow|farmland|orchard|vineyard|cemetery|allotments|residential|industrial|commercial|retail)$"]${box};
  relation["landuse"~"^(forest|residential|industrial)$"]${box};
  way["natural"~"^(wood|scrub|grassland|heath)$"]${box};
  way["leisure"~"^(park|garden|pitch)$"]${box};
  relation["leisure"="park"]${box};
  way["building"]${box};
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian)$"]${box};
  way["railway"~"^(rail|light_rail|tram)$"]${box};
);
out geom;`;
}

type Tags = Readonly<Record<string, string>>;
type Classified = { readonly cover: CoverKind; readonly water: WaterKind; readonly width: number };

const GRASS_LANDUSE = new Set(['grass', 'meadow', 'cemetery', 'allotments']);
const GRASS_NATURAL = new Set(['grassland', 'scrub', 'heath']);
const GRASS_LEISURE = new Set(['park', 'garden', 'pitch']);
const TOWN_LANDUSE = new Set(['residential', 'industrial', 'commercial', 'retail']);
const FIELD_LANDUSE = new Set(['farmland', 'orchard', 'vineyard']);
const RIVER_WATER = new Set(['river', 'canal', 'stream']);
const RAILS = new Set(['rail', 'light_rail', 'tram']);
const ROAD_WIDTHS = REAL.roadWidths as Readonly<Record<string, number>>;

/** What a feature with these tags covers, or null when the tags mean nothing to the map. */
export function classifyTags(tags: Tags): Classified | null {
  if (tags.natural === 'water') return { cover: Cover.Water, water: RIVER_WATER.has(tags.water ?? '') ? Water.River : Water.Lake, width: 1 };
  if (tags.waterway === 'river' || tags.waterway === 'canal') return { cover: Cover.Water, water: Water.River, width: 2 };
  if (tags.waterway === 'stream') return { cover: Cover.Water, water: Water.River, width: 1 };
  if (tags.highway !== undefined) {
    const width = ROAD_WIDTHS[tags.highway];
    if (width === undefined) return null;
    return { cover: tags.bridge === 'yes' ? Cover.Bridge : Cover.Road, water: Water.None, width };
  }
  if (tags.railway !== undefined && RAILS.has(tags.railway)) return { cover: Cover.Railway, water: Water.None, width: 1 };
  if (tags.building !== undefined) return { cover: Cover.Building, water: Water.None, width: 1 };
  if (tags.landuse !== undefined && TOWN_LANDUSE.has(tags.landuse)) return { cover: Cover.Town, water: Water.None, width: 1 };
  if (tags.landuse === 'forest' || tags.natural === 'wood') return { cover: Cover.Forest, water: Water.None, width: 1 };
  if (tags.landuse !== undefined && FIELD_LANDUSE.has(tags.landuse)) return { cover: Cover.Field, water: Water.None, width: 1 };
  if (
    (tags.landuse !== undefined && GRASS_LANDUSE.has(tags.landuse)) ||
    (tags.natural !== undefined && GRASS_NATURAL.has(tags.natural)) ||
    (tags.leisure !== undefined && GRASS_LEISURE.has(tags.leisure))
  ) {
    return { cover: Cover.Grass, water: Water.None, width: 1 };
  }
  return null;
}

type Member = { readonly role?: string; readonly geometry?: readonly LatLon[] };
type Element = { readonly type?: string; readonly tags?: Tags; readonly geometry?: readonly LatLon[]; readonly members?: readonly Member[] };

const same = (a: LatLon, b: LatLon): boolean => a.lat === b.lat && a.lon === b.lon;
const isClosed = (g: readonly LatLon[]): boolean => g.length >= 4 && same(g[0], g[g.length - 1]);
const isLineTag = (tags: Tags): boolean => tags.highway !== undefined || tags.railway !== undefined || tags.waterway !== undefined;

/** Even-odd point-in-ring test in latitude/longitude. */
function inRing(ring: readonly LatLon[], p: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

/** Joins ways end to end into rings; a leftover that never closes is kept and closed implicitly. */
export function stitchRings(parts: readonly (readonly LatLon[])[]): LatLon[][] {
  const pool = parts.filter((p) => p.length >= 2).map((p) => [...p]);
  const rings: LatLon[][] = [];
  while (pool.length > 0) {
    const ring = pool.shift() as LatLon[];
    let grew = true;
    while (!isClosed(ring) && grew) {
      grew = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < pool.length; i++) {
        const q = pool[i];
        if (same(end, q[0])) {
          ring.push(...q.slice(1));
        } else if (same(end, q[q.length - 1])) {
          ring.push(...q.slice(0, -1).reverse());
        } else {
          continue;
        }
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** Features from an Overpass `out geom` reply. Elements without tags or geometry are ignored. */
export function parseFeatures(json: unknown): Feature[] {
  const elements = ((json as { elements?: readonly Element[] } | null)?.elements ?? []) as readonly Element[];
  const out: Feature[] = [];
  for (const el of elements) {
    if (el.tags === undefined) continue;
    const c = classifyTags(el.tags);
    if (c === null) continue;
    if (el.type === 'way' && el.geometry !== undefined && el.geometry.length >= 2) {
      if (isClosed(el.geometry) && !isLineTag(el.tags)) out.push({ kind: 'polygon', cover: c.cover, water: c.water, rings: [el.geometry] });
      else out.push({ kind: 'line', cover: c.cover, water: c.water, width: c.width, points: el.geometry });
    } else if (el.type === 'relation' && el.members !== undefined) {
      const geometries = (role: string): readonly LatLon[][] =>
        el.members
          ?.filter((m) => m.role === role && m.geometry !== undefined && m.geometry.length >= 2)
          .map((m) => m.geometry as readonly LatLon[]) ?? [];
      const inners = stitchRings(geometries('inner'));
      for (const outer of stitchRings(geometries('outer'))) {
        const holes = inners.filter((inner) => inRing(outer, inner[0]));
        out.push({ kind: 'polygon', cover: c.cover, water: c.water, rings: [outer, ...holes] });
      }
    }
  }
  return out;
}

export type CellRect = { readonly left: number; readonly top: number; readonly cols: number; readonly rows: number };
/** Cover per cell of a rectangle, row by row, plus the water kind and the flow direction of mapped waterways. */
export type CoverRaster = {
  readonly rect: CellRect;
  readonly cover: Uint8Array;
  readonly water: Uint8Array;
  readonly flowX: Float32Array;
  readonly flowY: Float32Array;
};

/** Paints the features into a raster over `rect` (cells). Polygons fill even-odd on cell centres; lines paint within their width. */
export function rasterise(features: readonly Feature[], projection: Projection, rect: CellRect): CoverRaster {
  const n = rect.cols * rect.rows;
  const raster: CoverRaster = { rect, cover: new Uint8Array(n), water: new Uint8Array(n), flowX: new Float32Array(n), flowY: new Float32Array(n) };
  // Cell space: x in columns and y in rows, relative to the rectangle's corner.
  const toCell = (p: LatLon): [number, number] => {
    const w = projection.toWorld(p.lat, p.lon);
    return [w.x - rect.left, w.y / ASPECT - rect.top];
  };
  const paint = (i: number, cover: number, water: number): void => {
    if (cover > raster.cover[i]) {
      raster.cover[i] = cover;
      raster.water[i] = water;
    }
  };
  const crossings: number[] = [];
  for (const f of features) {
    if (f.kind === 'polygon') {
      const rings = f.rings.map((ring) => ring.map(toCell));
      let minY = Infinity;
      let maxY = -Infinity;
      for (const ring of rings) for (const [, y] of ring) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const r0 = Math.max(0, Math.floor(minY));
      const r1 = Math.min(rect.rows - 1, Math.ceil(maxY));
      for (let r = r0; r <= r1; r++) {
        const yc = r + 0.5;
        crossings.length = 0;
        for (const ring of rings) {
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [x0, y0] = ring[j];
            const [x1, y1] = ring[i];
            if (y0 <= yc !== y1 <= yc) crossings.push(x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0));
          }
        }
        crossings.sort((a, b) => a - b);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
          const c0 = Math.max(0, Math.ceil(crossings[k] - 0.5));
          const c1 = Math.min(rect.cols - 1, Math.floor(crossings[k + 1] - 0.5));
          for (let c = c0; c <= c1; c++) paint(r * rect.cols + c, f.cover, f.water);
        }
      }
    } else {
      const points = f.points.map(toCell);
      const half = f.width / 2;
      const halo = f.cover === Cover.Water && f.water === Water.River ? REAL.flowHalo : 0;
      const reach = Math.max(half, halo);
      for (let i = 1; i < points.length; i++) {
        // Distances are measured in world units (columns), with rows ASPECT units apart.
        const [ax, ayRows] = points[i - 1];
        const [bx, byRows] = points[i];
        const ay = ayRows * ASPECT;
        const by = byRows * ASPECT;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const ux = len2 > 0 ? dx / Math.sqrt(len2) : 0;
        const uy = len2 > 0 ? dy / Math.sqrt(len2) : 0;
        const r0 = Math.max(0, Math.floor(Math.min(ayRows, byRows) - reach / ASPECT));
        const r1 = Math.min(rect.rows - 1, Math.ceil(Math.max(ayRows, byRows) + reach / ASPECT));
        const c0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
        const c1 = Math.min(rect.cols - 1, Math.ceil(Math.max(ax, bx) + reach));
        for (let r = r0; r <= r1; r++) {
          const py = (r + 0.5) * ASPECT;
          for (let c = c0; c <= c1; c++) {
            const px = c + 0.5;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
            const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
            const k = r * rect.cols + c;
            if (d <= half) paint(k, f.cover, f.water);
            if (halo > 0 && d <= halo) {
              raster.flowX[k] = ux;
              raster.flowY[k] = uy;
            }
          }
        }
      }
    }
  }
  return raster;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/osm.test.ts`
Expected: PASS, `tests 10`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/osm.ts test/osm.test.ts
git commit -m "feat: OpenStreetMap query, features and cover raster" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Network, cache and place lookup

**Files:**
- Create: `src/net.ts`, `src/place.ts`
- Test: `test/net.test.ts`, `test/place.test.ts`

**Interfaces:**
- Consumes: `REAL.userAgent`, `REAL.nominatimUrl` (Task 3)
- Produces from `net.ts`:
  - `type FetchInit = { method?, body?, headers? }`, `type FetchResponse = { ok, status, bytes(): Promise<Uint8Array> }`, `type Fetcher = (url, init) => Promise<FetchResponse>`
  - `defaultCacheDir(env?): string`
  - `class Net { constructor(cacheDir, fetcher?); cacheDir; inFlight; get(url, cacheFile, init?): Promise<Uint8Array>; forget(cacheFile): void }`
- Produces from `place.ts`:
  - `type Place = { lat, lon, name }`, `resolvePlace(text, net): Promise<Place>`

- [ ] **Step 1: Write the failing tests**

`test/net.test.ts`:

```ts
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REAL } from '../src/config.ts';
import { Net, defaultCacheDir } from '../src/net.ts';
import type { FetchInit, Fetcher } from '../src/net.ts';

const dirs: string[] = [];
const freshDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'wander-net-'));
  dirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

type Call = { url: string; init: FetchInit };
function fetcher(calls: Call[], status = 200, body = 'hello'): Fetcher {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, bytes: async () => new TextEncoder().encode(body) };
  };
}

test('a cached file is returned without fetching', async () => {
  const dir = freshDir();
  mkdirSync(join(dir, 'a'), { recursive: true });
  writeFileSync(join(dir, 'a', 'b.txt'), 'cached');
  const calls: Call[] = [];
  const bytes = await new Net(dir, fetcher(calls)).get('https://example.test/x', 'a/b.txt');
  assert.equal(new TextDecoder().decode(bytes), 'cached');
  assert.equal(calls.length, 0);
});

test('a fetch writes the cache, sends the user agent and passes the request through', async () => {
  const dir = freshDir();
  const calls: Call[] = [];
  const net = new Net(dir, fetcher(calls));
  const bytes = await net.get('https://example.test/x', 'osm/14/1/2.json', { method: 'POST', body: 'data=q' });
  assert.equal(new TextDecoder().decode(bytes), 'hello');
  assert.equal(readFileSync(join(dir, 'osm/14/1/2.json'), 'utf8'), 'hello');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, 'data=q');
  assert.equal(calls[0].init.headers?.['User-Agent'], REAL.userAgent);
  await net.get('https://example.test/x', 'osm/14/1/2.json');
  assert.equal(calls.length, 1, 'the second call is served from the cache');
});

test('a failed response throws, caches nothing, and inFlight returns to zero', async () => {
  const dir = freshDir();
  const net = new Net(dir, fetcher([], 503));
  await assert.rejects(net.get('https://example.test/x', 't.png'), /503 from https:\/\/example\.test\/x/);
  assert.equal(existsSync(join(dir, 't.png')), false);
  assert.equal(net.inFlight, 0);
});

test('inFlight counts running fetches, and forget deletes a cached file', async () => {
  const dir = freshDir();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow: Fetcher = async () => {
    await gate;
    return { ok: true, status: 200, bytes: async () => new Uint8Array([1]) };
  };
  const net = new Net(dir, slow);
  const pending = net.get('https://example.test/x', 'slow.bin');
  assert.equal(net.inFlight, 1);
  release();
  await pending;
  assert.equal(net.inFlight, 0);
  assert.equal(existsSync(join(dir, 'slow.bin')), true);
  net.forget('slow.bin');
  assert.equal(existsSync(join(dir, 'slow.bin')), false);
  net.forget('never-there.bin');
});

test('the default cache directory follows XDG_CACHE_HOME and falls back to ~/.cache', () => {
  assert.equal(defaultCacheDir({ XDG_CACHE_HOME: '/tmp/xdg' }), join('/tmp/xdg', 'wander'));
  assert.ok(defaultCacheDir({}).endsWith(join('.cache', 'wander')));
});
```

`test/place.test.ts`:

```ts
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Net } from '../src/net.ts';
import type { Fetcher } from '../src/net.ts';
import { resolvePlace } from '../src/place.ts';

const dir = mkdtempSync(join(tmpdir(), 'wander-place-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function nominatim(calls: string[], results: unknown[]): Fetcher {
  return async (url) => {
    calls.push(url);
    return { ok: true, status: 200, bytes: async () => new TextEncoder().encode(JSON.stringify(results)) };
  };
}

test('a place resolves to its first result, and the lookup is cached', async () => {
  const calls: string[] = [];
  const net = new Net(dir, nominatim(calls, [{ lat: '50.0874654', lon: '14.4212535', display_name: 'Prague, Czechia' }]));
  const place = await resolvePlace('  Prague ', net);
  assert.deepEqual(place, { lat: 50.0874654, lon: 14.4212535, name: 'Prague' });
  assert.ok(calls[0].includes('q=Prague') && calls[0].includes('format=json'), calls[0]);
  await resolvePlace('prague', net);
  assert.equal(calls.length, 1, 'the same query in another case is served from the cache');
});

test('an unknown place throws and is not cached', async () => {
  const calls: string[] = [];
  const net = new Net(dir, nominatim(calls, []));
  await assert.rejects(resolvePlace('Nowhereville', net), /place not found: Nowhereville/);
  await assert.rejects(resolvePlace('Nowhereville', net), /place not found/);
  assert.equal(calls.length, 2, 'a miss is looked up again next time');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/net.test.ts test/place.test.ts`
Expected: FAIL with `Cannot find module '…/src/net.ts'` and `Cannot find module '…/src/place.ts'`

- [ ] **Step 3: Write the implementation**

`src/net.ts`:

```ts
// The network and the cache: the only module that fetches or touches the cache directory.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { REAL } from './config.ts';

export type FetchInit = {
  readonly method?: string;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
};
export type FetchResponse = { readonly ok: boolean; readonly status: number; bytes(): Promise<Uint8Array> };
/** What `Net` needs from `fetch`; tests pass a fake. */
export type Fetcher = (url: string, init: FetchInit) => Promise<FetchResponse>;

/** `$XDG_CACHE_HOME/wander`, or `~/.cache/wander`. */
export function defaultCacheDir(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const xdg = env.XDG_CACHE_HOME;
  const base = xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.cache');
  return join(base, 'wander');
}

const realFetcher: Fetcher = async (url, init) => {
  const res = await fetch(url, { method: init.method, body: init.body, headers: init.headers });
  return { ok: res.ok, status: res.status, bytes: async () => new Uint8Array(await res.arrayBuffer()) };
};

export class Net {
  readonly cacheDir: string;
  /** Fetches currently running. */
  inFlight = 0;
  private readonly fetcher: Fetcher;

  constructor(cacheDir: string, fetcher: Fetcher = realFetcher) {
    this.cacheDir = cacheDir;
    this.fetcher = fetcher;
  }

  /** The cached file if there is one; otherwise fetches, stores and returns it. Throws on a failed or non-2xx fetch. */
  async get(url: string, cacheFile: string, init: FetchInit = {}): Promise<Uint8Array> {
    const path = join(this.cacheDir, cacheFile);
    if (existsSync(path)) return new Uint8Array(readFileSync(path));
    this.inFlight++;
    try {
      const res = await this.fetcher(url, { ...init, headers: { 'User-Agent': REAL.userAgent, ...(init.headers ?? {}) } });
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      const bytes = await res.bytes();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
      return bytes;
    } finally {
      this.inFlight--;
    }
  }

  /** Deletes a cached file, so the next `get` fetches it again. */
  forget(cacheFile: string): void {
    rmSync(join(this.cacheDir, cacheFile), { force: true });
  }
}
```

`src/place.ts`:

```ts
// Place names to coordinates through Nominatim, cached.
import { createHash } from 'node:crypto';
import { REAL } from './config.ts';
import type { Net } from './net.ts';

export type Place = { readonly lat: number; readonly lon: number; readonly name: string };
type Result = { readonly lat?: string; readonly lon?: string; readonly display_name?: string };

/** Resolves `text` to its first Nominatim result. Throws `place not found: …` when there is none. */
export async function resolvePlace(text: string, net: Net): Promise<Place> {
  const query = text.trim();
  const url = `${REAL.nominatimUrl}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const cacheFile = `places/${createHash('sha1').update(query.toLowerCase()).digest('hex').slice(0, 16)}.json`;
  const bytes = await net.get(url, cacheFile);
  let results: unknown = null;
  try {
    results = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    results = null;
  }
  const first = Array.isArray(results) ? (results[0] as Result | undefined) : undefined;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  if (first === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    net.forget(cacheFile);
    throw new Error(`place not found: ${query}`);
  }
  const name = (first.display_name ?? '').split(',')[0].trim();
  return { lat, lon, name: name.length > 0 ? name : query };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/net.test.ts test/place.test.ts`
Expected: PASS, `tests 7`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/net.ts src/place.ts test/net.test.ts test/place.test.ts
git commit -m "feat: cached fetching and place lookup" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The real world

**Files:**
- Create: `src/realworld.ts`
- Test: `test/realworld.test.ts`

**Interfaces:**
- Consumes: `Projection`, `TILE`, `mercator`, `tileBounds`, `tileKey`, `tileOf` (Task 1); `decodePng`, `Png` (Task 2); `Chunk`, `ChunkSource`, `chunkKey` (Task 3); `Cover`, `overpassQuery`, `parseFeatures`, `rasterise`, `CoverRaster`, `CellRect`, `CoverKind` (Task 4); `Net` (Task 5); `REAL`, `Biome`, `Water`, `CHUNK_SIZE`, `CHUNK_CACHE_LIMIT`, `ASPECT`; `hash2`
- Produces:
  - `classifyCell(cover, water, e, t, s): BiomeId`, `cellTemperature(lat, e): number`, both pure
  - `class RealWorld implements ChunkSource`: `constructor(origin: LatLon, scale, seed, net, now?)`, `projection`, `seed`, `generated`, `status(): { loading, offline }`, `chunk`, `chunkAt`, `biomeAt`, `temperatureAt`, `prefetch`

- [ ] **Step 1: Write the failing test**

`test/realworld.test.ts`:

```ts
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASPECT, Biome, CHUNK_SIZE, REAL, Water } from '../src/config.ts';
import { Projection, TILE, tileBounds, tileOf, unmercator } from '../src/geo.ts';
import type { LatLon } from '../src/geo.ts';
import { Net } from '../src/net.ts';
import type { FetchInit, Fetcher } from '../src/net.ts';
import { Cover } from '../src/osm.ts';
import { RealWorld, cellTemperature, classifyCell } from '../src/realworld.ts';
import { encodePng } from './support/encode-png.ts';

const ORIGIN: LatLon = { lat: 50, lon: 14.4 };
const SCALE = 3;
const projection = new Projection(ORIGIN.lat, ORIGIN.lon, SCALE);
const at = (col: number, row: number): LatLon => projection.toLatLon(col, row * ASPECT);
const box = (c0: number, r0: number, c1: number, r1: number): LatLon[] => [at(c0, r0), at(c1 + 1, r0), at(c1 + 1, r1 + 1), at(c0, r1 + 1), at(c0, r0)];
const way = (tags: Record<string, string>, geometry: LatLon[]) => ({ type: 'way', tags, geometry });

/** Elevation in metres by place: a plane rising gently eastwards, with a dip below sea level at columns 72..108, rows 15..33. */
function elevationModel(lat: number, lon: number): number {
  const { x, y } = projection.toWorld(lat, lon);
  if (x >= 72 && x <= 108 && y >= 30 && y <= 66) return -10;
  return 300 + x * 0.3;
}

function terrariumTile(z: number, tx: number, ty: number): Uint8Array {
  const pixels = new Uint8Array(TILE * TILE * 3);
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const { lat, lon } = unmercator(tx * TILE + px + 0.5, ty * TILE + py + 0.5, z);
      const v = elevationModel(lat, lon) + 32768;
      const whole = Math.floor(v);
      const i = (py * TILE + px) * 3;
      pixels[i] = Math.floor(whole / 256);
      pixels[i + 1] = whole % 256;
      pixels[i + 2] = Math.round((v - whole) * 256) & 255;
    }
  }
  return encodePng(TILE, TILE, 3, pixels);
}

const region = {
  elements: [
    way({ natural: 'water', water: 'river' }, box(10, 0, 20, 40)),
    way({ waterway: 'river' }, [at(15.5, 0), at(15.5, 41)]),
    way({ landuse: 'forest' }, box(30, 0, 50, 40)),
    way({ highway: 'residential' }, [at(0, 10.5), at(60, 10.5)]),
  ],
};

type Mode = 'ok' | 'fail' | 'hang';
function fakeFetcher(log: { url: string; body: string }[], state: { mode: Mode }): Fetcher {
  return async (url: string, init: FetchInit) => {
    log.push({ url, body: init.body ?? '' });
    if (state.mode === 'hang') return new Promise(() => {});
    if (state.mode === 'fail') return { ok: false, status: 503, bytes: async () => new Uint8Array(0) };
    const tile = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
    if (tile !== null) return { ok: true, status: 200, bytes: async () => terrariumTile(Number(tile[1]), Number(tile[2]), Number(tile[3])) };
    if (url === REAL.overpassUrl) return { ok: true, status: 200, bytes: async () => new TextEncoder().encode(JSON.stringify(region)) };
    return { ok: false, status: 404, bytes: async () => new Uint8Array(0) };
  };
}

const dirs: string[] = [];
function setup(mode: Mode = 'ok') {
  const dir = mkdtempSync(join(tmpdir(), 'wander-real-'));
  dirs.push(dir);
  const log: { url: string; body: string }[] = [];
  const state = { mode };
  const net = new Net(dir, fakeFetcher(log, state));
  const clock = { now: 0 };
  const world = new RealWorld(ORIGIN, SCALE, 1, net, () => clock.now);
  return { dir, log, state, net, clock, world };
}
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** Lets every running fetch finish and its data land. */
async function settle(net: Net): Promise<void> {
  for (let i = 0; i < 200 && net.inFlight > 0; i++) await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('cells classify from cover first, then sea depth, snow, slope and cold', () => {
  assert.equal(classifyCell(Cover.Water, Water.River, 100, 0.5, 0), Biome.River);
  assert.equal(classifyCell(Cover.Water, Water.Lake, 100, 0.5, 0), Biome.Lake);
  assert.equal(classifyCell(Cover.Bridge, Water.None, -3, 0.5, 0), Biome.Road);
  assert.equal(classifyCell(Cover.Building, Water.None, 100, 0.5, 0), Biome.Building);
  assert.equal(classifyCell(Cover.Town, Water.None, 100, 0.5, 0), Biome.Town);
  assert.equal(classifyCell(Cover.Railway, Water.None, 100, 0.5, 0), Biome.Railway);
  assert.equal(classifyCell(Cover.Field, Water.None, 100, 0.5, 0), Biome.Field);
  assert.equal(classifyCell(Cover.Forest, Water.None, 100, 0.5, 0), Biome.Forest);
  assert.equal(classifyCell(Cover.Grass, Water.None, 100, 0.5, 0), Biome.Grassland);
  assert.equal(classifyCell(Cover.None, Water.None, -1, 0.5, 0), Biome.Shallows);
  assert.equal(classifyCell(Cover.None, Water.None, -10, 0.5, 0), Biome.Ocean);
  assert.equal(classifyCell(Cover.None, Water.None, -100, 0.5, 0), Biome.DeepOcean);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.1, 0), Biome.SnowyPeaks);
  assert.equal(classifyCell(Cover.None, Water.None, 3000, 0.5, 0), Biome.SnowyPeaks);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.5, 0.5), Biome.Mountains);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.5, 0.3), Biome.Hills);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.2, 0), Biome.Tundra);
  assert.equal(classifyCell(Cover.None, Water.None, 100, 0.5, 0), Biome.Grassland);
  assert.ok(cellTemperature(0, 0) > cellTemperature(50, 0) && cellTemperature(50, 0) > cellTemperature(50, 2000));
  assert.equal(cellTemperature(80, 0), 0);
});

test('the first chunk is fog and starts the fetches; once the data lands it draws the map', async () => {
  const { net, world, log } = setup();
  const first = world.chunk(0, 0);
  assert.equal(first.ready, false);
  assert.equal(first.biome[0], Biome.Grassland, 'fog chunks read as grassland underfoot');
  assert.ok(net.inFlight > 0 && net.inFlight <= REAL.maxInFlight);
  assert.deepEqual(world.status(), { loading: net.inFlight, offline: false });
  await settle(net);
  assert.equal(net.inFlight, 0);
  assert.ok(log.some((l) => l.url.startsWith(REAL.terrariumUrl)) && log.some((l) => l.url === REAL.overpassUrl));
  const chunk = world.chunk(0, 0);
  assert.equal(chunk.ready, true);
  assert.equal(world.generated, 1);
  assert.equal(world.biomeAt(15, 5), Biome.River);
  assert.ok(Math.abs(world.chunkAt(15, 5).flowY[5 * CHUNK_SIZE + 15] - 1) < 1e-6, 'the river flows south along its mapped centreline');
  assert.equal(world.biomeAt(40, 5), Biome.Forest);
  assert.equal(world.biomeAt(5, 10), Biome.Road);
  assert.equal(world.biomeAt(5, 3), Biome.Grassland);
  assert.ok(Math.abs(world.chunkAt(5, 3).height[3 * CHUNK_SIZE + 5] - (300 + 5.5 * 0.3)) < 0.5, 'elevation comes from the tile');
  assert.ok(world.temperatureAt(5, 3) > 0.3 && world.temperatureAt(5, 3) < 0.4);
  const land = world.chunkAt(5, 3).shade[3 * CHUNK_SIZE + 5];
  assert.ok(land !== 1 && land >= 0.55 && land <= 1.35, `land is shaded: ${land}`);
  assert.equal(world.chunkAt(5, 10).shade[10 * CHUNK_SIZE + 5], 1, 'roads are flat');
});

test('below sea level with no cover is sea, with shore flags where it meets land', async () => {
  const { net, world } = setup();
  world.chunk(1, 0);
  await settle(net);
  const chunk = world.chunk(1, 0);
  assert.equal(chunk.ready, true);
  assert.equal(world.biomeAt(90, 24), Biome.Ocean);
  assert.equal(world.biomeAt(66, 24), Biome.Grassland);
  const sea = new Set<number>([Biome.DeepOcean, Biome.Ocean, Biome.Shallows]);
  let shore = 0;
  for (let o = 0; o < CHUNK_SIZE * CHUNK_SIZE; o++) {
    if (chunk.shore[o] === 1) {
      shore++;
      assert.ok(sea.has(chunk.biome[o]), 'only sea cells are shore');
    }
  }
  assert.ok(shore > 0, 'the dip has a shore');
});

test('a failing fetch sets offline and retries after 5 s, 15 s and 60 s, then recovers', async () => {
  const { net, world, log, state, clock } = setup('fail');
  world.chunk(0, 0);
  await settle(net);
  const n = log.length;
  assert.ok(n > 0);
  assert.equal(world.status().offline, true);
  clock.now = 4999;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, n, 'no retry before 5 s');
  clock.now = 5001;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 2 * n, 'every input is retried after 5 s');
  clock.now = 5001 + 14999;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 2 * n, 'no retry before 15 more seconds');
  clock.now = 5001 + 15001;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 3 * n);
  clock.now += 59999;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 3 * n, 'then every 60 s');
  state.mode = 'ok';
  clock.now += 2;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(log.length, 4 * n);
  assert.equal(world.chunk(0, 0).ready, true);
  assert.equal(world.status().offline, false);
});

test('a corrupt cached tile is forgotten and fetched again on the retry', async () => {
  const { dir, net, world, log, clock } = setup();
  const { tx, ty } = tileOf(ORIGIN.lat, ORIGIN.lon, REAL.elevationZoom);
  const file = join(dir, 'terrarium', String(REAL.elevationZoom), String(tx), `${ty}.png`);
  mkdirSync(join(dir, 'terrarium', String(REAL.elevationZoom), String(tx)), { recursive: true });
  writeFileSync(file, new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  world.chunk(0, 0);
  await settle(net);
  assert.equal(world.status().offline, true, 'a tile that cannot be decoded counts as a failed fetch');
  assert.equal(existsSync(file), false, 'the corrupt file is forgotten');
  clock.now = 5001;
  world.chunk(0, 0);
  await settle(net);
  assert.equal(world.chunk(0, 0).ready, true);
  assert.ok(statSync(file).size > 100, 'a fresh tile is cached');
  assert.equal(log.filter((l) => l.url.endsWith(`/${tx}/${ty}.png`)).length, 1);
});

test('prefetch never starts more than four fetches at once', async () => {
  const { net, world, log } = setup('hang');
  world.prefetch(-600, -600, 1200, 1200, Infinity);
  assert.equal(net.inFlight, REAL.maxInFlight);
  assert.equal(log.length, REAL.maxInFlight);
  world.prefetch(-600, -600, 1200, 1200, Infinity);
  assert.equal(log.length, REAL.maxInFlight, 'inputs already loading are not fetched twice');
});

test('a chunk on a region border needs both regions and draws both halves', async () => {
  const { net, world, log } = setup();
  const { tx, ty } = tileOf(ORIGIN.lat, ORIGIN.lon, REAL.regionZoom);
  const edge = projection.toWorld(ORIGIN.lat, tileBounds(REAL.regionZoom, tx, ty).east).x;
  const cx = Math.floor(edge / CHUNK_SIZE);
  world.chunk(cx, 0);
  await settle(net);
  const bodies = new Set(log.filter((l) => l.url === REAL.overpassUrl).map((l) => l.body));
  assert.ok(bodies.size >= 2 && bodies.size <= 4, `${bodies.size} regions were queried: at least the two either side of the edge`);
  const chunk = world.chunk(cx, 0);
  assert.equal(chunk.ready, true);
  assert.ok(chunk.biome.every((b) => b < 19), 'every cell has a biome');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/realworld.test.ts`
Expected: FAIL with `Cannot find module '…/src/realworld.ts'`

- [ ] **Step 3: Write the implementation**

`src/realworld.ts`:

```ts
// A real place: elevation from Terrarium tiles and land cover from OpenStreetMap, assembled into chunks as the data arrives.
import { ASPECT, Biome, CHUNK_CACHE_LIMIT, CHUNK_SIZE, REAL, Water } from './config.ts';
import type { BiomeId, WaterKind } from './config.ts';
import { Projection, TILE, mercator, tileBounds, tileKey, tileOf } from './geo.ts';
import type { Bounds, LatLon } from './geo.ts';
import type { Net } from './net.ts';
import { hash2 } from './noise.ts';
import { Cover, overpassQuery, parseFeatures, rasterise } from './osm.ts';
import type { CellRect, CoverKind, CoverRaster } from './osm.ts';
import { decodePng } from './png.ts';
import type { Png } from './png.ts';
import { cellOffset, chunkKey } from './world.ts';
import type { Chunk, ChunkSource } from './world.ts';

type State = 'missing' | 'loading' | 'ready' | 'failed';
type Loadable = { state: State; value: Png | CoverRaster | null; failures: number; retryAt: number };
type Input = { readonly kind: 'tile' | 'region'; readonly z: number; readonly tx: number; readonly ty: number; readonly key: string };
type Cell = { readonly cover: CoverKind; readonly water: WaterKind; readonly flowX: number; readonly flowY: number };

const NO_COVER: Cell = { cover: Cover.None, water: Water.None, flowX: 0, flowY: 0 };
const SEA = new Set<number>([Biome.DeepOcean, Biome.Ocean, Biome.Shallows]);
/** Biomes drawn without slope shading. */
const FLAT = new Set<number>([...SEA, Biome.River, Biome.Lake, Biome.Road, Biome.Railway]);
// Slope light comes from the north-west, as in the generated world.
const LIGHT_LENGTH = Math.hypot(1, 1, 2.5);
const LX = -1 / LIGHT_LENGTH;
const LY = -1 / LIGHT_LENGTH;
const LZ = 2.5 / LIGHT_LENGTH;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Biome for a cell from its map cover, elevation (m), temperature (0..1) and dimensionless slope. Pure. */
export function classifyCell(cover: CoverKind, water: WaterKind, e: number, t: number, s: number): BiomeId {
  switch (cover) {
    case Cover.Water:
      return water === Water.River ? Biome.River : Biome.Lake;
    case Cover.Bridge:
    case Cover.Road:
      return Biome.Road;
    case Cover.Railway:
      return Biome.Railway;
    case Cover.Building:
      return Biome.Building;
    case Cover.Town:
      return Biome.Town;
    case Cover.Forest:
      return Biome.Forest;
    case Cover.Field:
      return Biome.Field;
    case Cover.Grass:
      return Biome.Grassland;
    default:
      break;
  }
  if (e < REAL.seaLevel) return e > REAL.shallowsAbove ? Biome.Shallows : e > REAL.oceanAbove ? Biome.Ocean : Biome.DeepOcean;
  if (t < REAL.snowTemperature || e > REAL.snowAbove) return Biome.SnowyPeaks;
  if (s > REAL.mountainSlope) return Biome.Mountains;
  if (s > REAL.hillSlope) return Biome.Hills;
  if (t < REAL.tundraTemperature) return Biome.Tundra;
  return Biome.Grassland;
}

/** Temperature 0..1 from latitude and elevation (m): warm at the equator, colder towards the poles and uphill. Pure. */
export function cellTemperature(lat: number, e: number): number {
  return clamp01(clamp01(1.1 - Math.abs(lat) / 75) - e / 4000);
}

export class RealWorld implements ChunkSource {
  readonly projection: Projection;
  readonly seed: number;
  /** Chunks built with their data present; read by tests and the bench. */
  generated = 0;
  private offline = false;
  private readonly net: Net;
  private readonly now: () => number;
  private readonly chunks = new Map<number, Chunk>();
  private readonly inputs = new Map<string, Loadable>();

  constructor(origin: LatLon, scale: number, seed: number, net: Net, now: () => number = () => Date.now()) {
    this.projection = new Projection(origin.lat, origin.lon, scale);
    this.seed = seed;
    this.net = net;
    this.now = now;
  }

  /** Fetches in flight, and whether the latest fetch failed with its retry still pending. */
  status(): { loading: number; offline: boolean } {
    return { loading: this.net.inFlight, offline: this.offline };
  }

  /** The chunk at (cx, cy): fog until its tiles and regions have arrived, rebuilt on the first access after that. */
  chunk(cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy);
    const cached = this.chunks.get(key);
    if (cached !== undefined && (cached.ready || !this.inputsReady(cx, cy))) {
      this.chunks.delete(key);
      this.chunks.set(key, cached);
      return cached;
    }
    const made = this.build(cx, cy);
    if (made.ready) this.generated++;
    this.chunks.delete(key);
    this.chunks.set(key, made);
    if (this.chunks.size > CHUNK_CACHE_LIMIT) {
      const oldest = this.chunks.keys().next().value;
      if (oldest !== undefined) this.chunks.delete(oldest);
    }
    return made;
  }

  chunkAt(mx: number, my: number): Chunk {
    return this.chunk(Math.floor(mx / CHUNK_SIZE), Math.floor(my / CHUNK_SIZE));
  }

  biomeAt(mx: number, my: number): BiomeId {
    return this.chunkAt(mx, my).biome[cellOffset(mx, my)] as BiomeId;
  }

  temperatureAt(mx: number, my: number): number {
    return this.chunkAt(mx, my).temperature[cellOffset(mx, my)];
  }

  /**
   * Starts fetches for everything the view, its chunk ring and the lookahead touch, nearest first, then
   * builds missing or fog chunks of the view and its ring whose data is present, nearest first, within the budget.
   */
  prefetch(
    left: number,
    top: number,
    cols: number,
    rows: number,
    budgetMs: number,
    now: () => number = () => performance.now(),
  ): number {
    const S = CHUNK_SIZE;
    const ahead = REAL.lookahead;
    for (const input of this.inputsIn(left - S - ahead, top - S - ahead / ASPECT, cols + 2 * S + 2 * ahead, rows + 2 * S + (2 * ahead) / ASPECT)) {
      this.want(input);
    }
    const cx0 = Math.floor(left / S) - 1;
    const cy0 = Math.floor(top / S) - 1;
    const cx1 = Math.floor((left + cols - 1) / S) + 1;
    const cy1 = Math.floor((top + rows - 1) / S) + 1;
    const centreX = (left + cols / 2) / S;
    const centreY = (top + rows / 2) / S;
    const missing: { cx: number; cy: number; distance: number }[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cached = this.chunks.get(chunkKey(cx, cy));
        if (cached === undefined || !cached.ready) {
          missing.push({ cx, cy, distance: (cx + 0.5 - centreX) ** 2 + (cy + 0.5 - centreY) ** 2 });
        }
      }
    }
    missing.sort((a, b) => a.distance - b.distance);
    const start = now();
    let made = 0;
    for (const m of missing) {
      if (now() - start >= budgetMs) break;
      if (!this.inputsReady(m.cx, m.cy)) continue;
      this.chunk(m.cx, m.cy);
      made++;
    }
    return made;
  }

  /** The tiles and regions a rectangle of cells touches, nearest its centre first. */
  private inputsIn(left: number, top: number, cols: number, rows: number): Input[] {
    const nw = this.projection.toLatLon(left, top * ASPECT);
    const se = this.projection.toLatLon(left + cols, (top + rows) * ASPECT);
    const centre = { x: left + cols / 2, y: (top + rows / 2) * ASPECT };
    const out: (Input & { distance: number })[] = [];
    for (const [kind, z] of [['tile', REAL.elevationZoom], ['region', REAL.regionZoom]] as const) {
      const a = mercator(nw.lat, nw.lon, z);
      const b = mercator(se.lat, se.lon, z);
      const tx0 = Math.floor(Math.min(a.px, b.px) / TILE);
      const tx1 = Math.floor(Math.max(a.px, b.px) / TILE);
      const ty0 = Math.floor(Math.min(a.py, b.py) / TILE);
      const ty1 = Math.floor(Math.max(a.py, b.py) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const bounds = tileBounds(z, tx, ty);
          const c = this.projection.toWorld((bounds.north + bounds.south) / 2, (bounds.west + bounds.east) / 2);
          out.push({ kind, z, tx, ty, key: `${kind}:${tileKey(z, tx, ty)}`, distance: Math.hypot(c.x - centre.x, c.y - centre.y) });
        }
      }
    }
    out.sort((p, q) => p.distance - q.distance);
    return out;
  }

  /** Whether every input of the chunk (grown by one cell for slopes and shores) is present; starts the missing fetches. */
  private inputsReady(cx: number, cy: number): boolean {
    const S = CHUNK_SIZE;
    let ready = true;
    for (const input of this.inputsIn(cx * S - 1, cy * S - 1, S + 2, S + 2)) if (!this.want(input)) ready = false;
    return ready;
  }

  /** True when the input is present; otherwise starts or retries its fetch when due and allowed. */
  private want(input: Input): boolean {
    let entry = this.inputs.get(input.key);
    if (entry === undefined) {
      entry = { state: 'missing', value: null, failures: 0, retryAt: 0 };
      this.inputs.set(input.key, entry);
    }
    if (entry.state === 'ready') return true;
    const due = entry.state === 'missing' || (entry.state === 'failed' && this.now() >= entry.retryAt);
    if (due && this.net.inFlight < REAL.maxInFlight) void this.load(input, entry);
    return false;
  }

  private async load(input: Input, entry: Loadable): Promise<void> {
    entry.state = 'loading';
    const cacheFile =
      input.kind === 'tile' ? `terrarium/${input.z}/${input.tx}/${input.ty}.png` : `osm/${input.z}/${input.tx}/${input.ty}.json`;
    try {
      if (input.kind === 'tile') {
        const bytes = await this.net.get(`${REAL.terrariumUrl}/${input.z}/${input.tx}/${input.ty}.png`, cacheFile);
        entry.value = decodePng(bytes);
      } else {
        const bounds = tileBounds(input.z, input.tx, input.ty);
        const bytes = await this.net.get(REAL.overpassUrl, cacheFile, {
          method: 'POST',
          body: `data=${encodeURIComponent(overpassQuery(bounds))}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        entry.value = rasterise(parseFeatures(JSON.parse(new TextDecoder().decode(bytes))), this.projection, this.regionRect(bounds));
      }
      entry.state = 'ready';
      this.offline = false;
    } catch {
      // A download that cannot be read must not be read back from the cache on the retry.
      this.net.forget(cacheFile);
      entry.failures++;
      const delays = REAL.retryMs;
      entry.retryAt = this.now() + delays[Math.min(entry.failures - 1, delays.length - 1)];
      entry.state = 'failed';
      this.offline = true;
    }
  }

  /** The cells a region covers, in this world's cell coordinates. */
  private regionRect(b: Bounds): CellRect {
    const nw = this.projection.toWorld(b.north, b.west);
    const se = this.projection.toWorld(b.south, b.east);
    const left = Math.floor(Math.min(nw.x, se.x));
    const top = Math.floor(Math.min(nw.y, se.y) / ASPECT);
    return {
      left,
      top,
      cols: Math.ceil(Math.max(nw.x, se.x)) - left + 1,
      rows: Math.ceil(Math.max(nw.y, se.y) / ASPECT) - top + 1,
    };
  }

  /** Elevation in metres at a point, bilinear between pixel centres of its tile and clamped at the tile edge. */
  private elevation(lat: number, lon: number): number {
    const { px, py } = mercator(lat, lon, REAL.elevationZoom);
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    const png = this.inputs.get(`tile:${tileKey(REAL.elevationZoom, tx, ty)}`)?.value as Png | null | undefined;
    if (png === null || png === undefined) return 0;
    const fx = Math.min(TILE - 1, Math.max(0, px - tx * TILE - 0.5));
    const fy = Math.min(TILE - 1, Math.max(0, py - ty * TILE - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(TILE - 1, x0 + 1);
    const y1 = Math.min(TILE - 1, y0 + 1);
    const sx = fx - x0;
    const sy = fy - y0;
    const at = (x: number, y: number): number => {
      const i = (y * png.width + x) * png.channels;
      return png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
    };
    const upper = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * sx;
    const lower = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * sx;
    return upper + (lower - upper) * sy;
  }

  /** The map cover of a cell from its region's raster, or no cover when the region is missing or the cell lies outside it. */
  private coverAt(mx: number, my: number, lat: number, lon: number): Cell {
    const { tx, ty } = tileOf(lat, lon, REAL.regionZoom);
    const raster = this.inputs.get(`region:${tileKey(REAL.regionZoom, tx, ty)}`)?.value as CoverRaster | null | undefined;
    if (raster === null || raster === undefined) return NO_COVER;
    const c = mx - raster.rect.left;
    const r = my - raster.rect.top;
    if (c < 0 || r < 0 || c >= raster.rect.cols || r >= raster.rect.rows) return NO_COVER;
    const i = r * raster.rect.cols + c;
    return { cover: raster.cover[i] as CoverKind, water: raster.water[i] as WaterKind, flowX: raster.flowX[i], flowY: raster.flowY[i] };
  }

  private build(cx: number, cy: number): Chunk {
    const S = CHUNK_SIZE;
    const n = S * S;
    const biome = new Uint8Array(n).fill(Biome.Grassland);
    const height = new Float32Array(n);
    const temperature = new Float32Array(n).fill(0.5);
    const variant = new Uint8Array(n);
    const shade = new Float32Array(n).fill(1);
    const flowX = new Float32Array(n);
    const flowY = new Float32Array(n);
    const shore = new Uint8Array(n);
    const ready = this.inputsReady(cx, cy);
    if (ready) {
      const B = S + 2; // one extra cell on every side, for slopes and shores
      const mx0 = cx * S - 1;
      const my0 = cy * S - 1;
      const elev = new Float32Array(B * B);
      const temp = new Float32Array(B * B);
      const cells: Cell[] = new Array<Cell>(B * B);
      for (let j = 0; j < B; j++) {
        for (let i = 0; i < B; i++) {
          const k = j * B + i;
          const mx = mx0 + i;
          const my = my0 + j;
          const { lat, lon } = this.projection.toLatLon(mx + 0.5, (my + 0.5) * ASPECT);
          elev[k] = this.elevation(lat, lon);
          temp[k] = cellTemperature(lat, elev[k]);
          cells[k] = this.coverAt(mx, my, lat, lon);
        }
      }
      const grid = new Uint8Array(B * B);
      const scale = this.projection.scale;
      for (let j = 0; j < B; j++) {
        for (let i = 0; i < B; i++) {
          const k = j * B + i;
          // Slope per metre from the neighbours, one-sided at the border of the grid.
          const dx = (i > 0 ? 1 : 0) + (i < B - 1 ? 1 : 0);
          const dy = (j > 0 ? 1 : 0) + (j < B - 1 ? 1 : 0);
          const sx = dx > 0 ? (elev[k + (i < B - 1 ? 1 : 0)] - elev[k - (i > 0 ? 1 : 0)]) / (dx * scale) : 0;
          const sy = dy > 0 ? (elev[k + (j < B - 1 ? B : 0)] - elev[k - (j > 0 ? B : 0)]) / (dy * scale * ASPECT) : 0;
          grid[k] = classifyCell(cells[k].cover, cells[k].water, elev[k], temp[k], Math.hypot(sx, sy));
          if (i === 0 || j === 0 || i === B - 1 || j === B - 1) continue;
          const o = (j - 1) * S + (i - 1);
          biome[o] = grid[k];
          height[o] = elev[k];
          temperature[o] = temp[k];
          variant[o] = hash2(mx0 + i, my0 + j, this.seed) & 0xff;
          if (!FLAT.has(grid[k])) {
            const gx = sx * REAL.relief;
            const gy = sy * REAL.relief;
            const lambert = (-gx * LX - gy * LY + LZ) / Math.hypot(gx, gy, 1);
            shade[o] = Math.min(1.35, Math.max(0.55, lambert / LZ));
          }
          if (grid[k] === Biome.River) {
            flowX[o] = cells[k].flowX;
            flowY[o] = cells[k].flowY;
          }
        }
      }
      for (let j = 1; j <= S; j++) {
        for (let i = 1; i <= S; i++) {
          const k = j * B + i;
          if (SEA.has(grid[k]) && (!SEA.has(grid[k - 1]) || !SEA.has(grid[k + 1]) || !SEA.has(grid[k - B]) || !SEA.has(grid[k + B]))) {
            shore[(j - 1) * S + (i - 1)] = 1;
          }
        }
      }
    }
    return { cx, cy, ready, biome, height, temperature, variant, shade, flowX, flowY, shore };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/realworld.test.ts`
Expected: PASS, `tests 7`, `fail 0`

- [ ] **Step 5: Run the whole suite**

Run: `node --test`
Expected: PASS, `tests 116`, `fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/realworld.ts test/realworld.test.ts
git commit -m "feat: real world from elevation tiles and OpenStreetMap, with fog while loading" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Fog, the real-world status bar, options and the entry point

**Files:**
- Modify: `src/render.ts` (imports, `Hud`, fog, `statusText`)
- Modify: `src/game.ts` (imports, `Options`, `parseOptions`, `cleanLabel`, `GameOptions`, `Game`)
- Modify: `src/main.ts` (real-world start)
- Modify: `README.md`
- Test: `test/render.test.ts` (append), `test/game.test.ts` (import, two tests changed, three appended)

**Interfaces:**
- Consumes: `ChunkSource` (Task 3); `Projection` (Task 1); `Net`, `defaultCacheDir` (Task 5); `resolvePlace` (Task 5); `RealWorld` (Task 6)
- Produces:
  - `type PlaceHud = { name, projection, loading, offline }`; `type Hud = { fps; place?: PlaceHud | null } | null`
  - `Renderer.render(frame, world: ChunkSource, …)`; `statusText(…, seed, place?)`
  - `Options.place: string | null`, `Options.at: { lat, lon } | null`, `Options.scale: number`; `--place`, `--at`, `--scale`
  - `cleanLabel(text): string`
  - `type GamePlace = { name; projection; status(): { loading, offline } }`; `GameOptions.world?: ChunkSource`, `GameOptions.place?: GamePlace`; `Game.world: ChunkSource`, `Game.place: GamePlace | null`

- [ ] **Step 1: Write the failing tests**

Append to `test/render.test.ts` (and add `import { Projection } from '../src/geo.ts';` and `import type { ChunkSource } from '../src/world.ts';` after the existing imports):

```ts
test('a chunk still loading draws as fog, with no drops', () => {
  const { world, atm, player } = scene(12);
  const fog = { ...world.chunk(0, 0), ready: false };
  const loading: ChunkSource = {
    seed: 1,
    generated: 0,
    chunk: () => fog,
    chunkAt: () => fog,
    biomeAt: () => 6,
    temperatureAt: () => 0.5,
    prefetch: () => 0,
  };
  const frame = new Frame(60, 20);
  const raining = { ...new Atmosphere(1, { startHour: 12, forceFront: 1 }).snapshot() };
  new Renderer().render(frame, loading, atm, raining, player, { fps: 60 });
  for (let i = 0; i < 19 * 60; i++) {
    if (i === 9 * 60 + 30) continue; // you
    assert.equal(frame.glyph[i], '·'.codePointAt(0), `cell ${i}`);
    assert.equal(frame.fg[i], COLORS.fogFg);
    assert.equal(frame.bg[i], COLORS.fogBg);
  }
});

test('the real-world status bar shows coordinates, the place, attribution and the loading state', () => {
  const { world, atm } = scene(12);
  const frame = new Frame(120, 20);
  const place = { name: 'Prague', projection: new Projection(50.088, 14.414, 3), loading: 2, offline: true };
  new Renderer().render(frame, world, atm, atm.snapshot(), { x: 0.5, y: 1, vx: 0, vy: 0 }, { fps: 60, place });
  const bar = frame.rowText(19);
  assert.match(bar, /^ 50\.0880,14\.4140 │/);
  assert.ok(bar.includes('Prague · © OpenStreetMap · loading · offline'), bar);
  assert.ok(!bar.includes('seed'));
  new Renderer().render(frame, world, atm, atm.snapshot(), { x: 0.5, y: 1, vx: 0, vy: 0 }, { fps: 60, place: { ...place, loading: 0, offline: false } });
  assert.ok(!frame.rowText(19).includes('loading') && !frame.rowText(19).includes('offline'));
});
```

Add `COLORS` to the config import in `test/render.test.ts`: `import { COLORS, COLOR_BITS } from '../src/config.ts';`.

In `test/game.test.ts`, replace the import from `../src/game.ts` with:

```ts
import { Game, benchIntent, cleanLabel, parseOptions, seedFrom } from '../src/game.ts';
```

and add after it:

```ts
import { World } from '../src/world.ts';
```

Replace the test `'parseOptions reads seed, bench, size and frames'` with:

```ts
test('parseOptions reads seed, bench, size, frames, place, at and scale', () => {
  assert.deepEqual(parseOptions(['--seed', '42', '--bench', '--size', '80x24', '--frames', '30']), {
    seed: 42,
    bench: true,
    cols: 80,
    rows: 24,
    frames: 30,
    place: null,
    at: null,
    scale: 3,
  });
  assert.deepEqual(parseOptions(['--place', 'Prague', '--scale', '6']).place, 'Prague');
  assert.deepEqual(parseOptions(['--at', '50.088,14.414']).at, { lat: 50.088, lon: 14.414 });
  assert.equal(parseOptions(['--scale', '6']).scale, 6);
});
```

In the test `'parseOptions has defaults and rejects bad input'`, replace the first assertion with:

```ts
  assert.deepEqual(parseOptions([]), { seed: null, bench: false, cols: 200, rows: 60, frames: 600, place: null, at: null, scale: 3 });
  assert.throws(() => parseOptions(['--at', 'Prague']), /--at must look like 50.088,14.414/);
  assert.throws(() => parseOptions(['--at', '95,14']), /--at must look like 50.088,14.414/);
  assert.throws(() => parseOptions(['--place', 'Prague', '--at', '50,14']), /use --place or --at, not both/);
  assert.throws(() => parseOptions(['--scale', '0']), /--scale must be a positive number of metres/);
  assert.throws(() => parseOptions(['--scale', 'big']), /--scale must be a positive number of metres/);
```

Append to `test/game.test.ts`:

```ts
test('a game in a given world starts on cell (0, 0) and draws that world', () => {
  const world = new World(1);
  const game = new Game(5, 80, 24, { world });
  assert.equal(game.world, world);
  assert.deepEqual(game.player, { x: 0.5, y: ASPECT * 0.5, vx: 0, vy: 0 });
  assert.equal(game.place, null);
  game.prefetch(Infinity);
  assert.ok(game.draw().length > 0);
});

test('place names are cleaned to characters the status bar can draw one per column', () => {
  assert.equal(cleanLabel('Praha 😀'), 'Praha');
  assert.equal(cleanLabel('東京'), '');
  assert.equal(cleanLabel('Zoë​'), 'Zoë');
  assert.equal(cleanLabel('é'), 'é');
  assert.equal(cleanLabel('\x1b[31mBrno'), '[31mBrno');
  assert.equal(cleanLabel('   '), '');
  assert.equal(cleanLabel('a'.repeat(40)).length, 32);
});

test('the status bar of a game with a place reports loading and offline from the world', () => {
  const world = new World(1);
  let loading = 1;
  const game = new Game(5, 120, 24, { world, place: { name: 'Prague', projection: new Projection(50.088, 14.414, 3), status: () => ({ loading, offline: false }) } });
  game.prefetch(Infinity);
  assert.ok(game.draw().includes('Prague · © OpenStreetMap · loading'));
  loading = 0;
  game.update(idle, 1 / 60);
  assert.ok(!game.draw().includes('loading'));
});
```

and add `import { Projection } from '../src/geo.ts';` after the `World` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/render.test.ts test/game.test.ts`
Expected: FAIL. `game.test.ts` fails with `does not provide an export named 'cleanLabel'`; in `render.test.ts` the fog test fails on the first cell's glyph and the status-bar test on the regular expression.

- [ ] **Step 3: Fog and the status bar**

In `src/render.ts`:

- Replace `import type { World } from './world.ts';` with `import type { ChunkSource } from './world.ts';` and add `import type { Projection } from './geo.ts';` after the frame import.
- Replace the `Hud` type with:

```ts
/** A real place for the status bar: where you are, what is loading. */
export type PlaceHud = { readonly name: string; readonly projection: Projection; readonly loading: number; readonly offline: boolean };
/** What the status bar shows besides the world; null hides the bar. */
export type Hud = { readonly fps: number; readonly place?: PlaceHud | null } | null;
```

- After `const SPACE = 32;` add `const FOG = code('·');`.
- Change the `render` signature's `world: World` to `world: ChunkSource`.
- In the cell loop, after `if (cx !== chunk.cx) chunk = world.chunk(cx, cy);` add:

```ts
        if (!chunk.ready) {
          frame.set(c, r, FOG, COLORS.fogFg, COLORS.fogBg);
          continue;
        }
```

- Replace `statusText` with:

```ts
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
```

- In the hud block, replace the `statusText(...)` call with `statusText(player, name, amb, weatherName(amb, cold), hud.fps, world.seed, hud.place ?? null)`.

- [ ] **Step 4: Options, the label cleaner and the game**

In `src/game.ts`:

- Replace the config import with `import { ASPECT, BIOMES, FRAME_DT, PREFETCH_BUDGET_MS, REAL, TIME_LAPSE } from './config.ts';`.
- After `import { World, findLand, findSea } from './world.ts';` add `import type { ChunkSource } from './world.ts';` and `import type { Projection } from './geo.ts';`.
- Replace the `Options` type with:

```ts
export type Options = {
  /** null when no --seed was given. */
  readonly seed: number | null;
  readonly bench: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly frames: number;
  /** A place name to resolve, or null. */
  readonly place: string | null;
  /** Coordinates to start at, or null. */
  readonly at: { readonly lat: number; readonly lon: number } | null;
  /** Metres per column in a real world. */
  readonly scale: number;
};
```

- In `parseOptions`, add to the `options` object after `frames: { type: 'string', default: '600' },`:

```ts
      place: { type: 'string' },
      at: { type: 'string' },
      scale: { type: 'string', default: String(REAL.scale) },
```

and before the `return`, add:

```ts
  let at: { lat: number; lon: number } | null = null;
  if (values.at !== undefined) {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(values.at);
    const lat = m === null ? NaN : Number(m[1]);
    const lon = m === null ? NaN : Number(m[2]);
    if (m === null || lat < -85 || lat > 85 || lon < -180 || lon > 180) throw new Error(`--at must look like 50.088,14.414, not "${values.at}"`);
    at = { lat, lon };
  }
  if (values.place !== undefined && at !== null) throw new Error('use --place or --at, not both');
  const scale = Number(values.scale);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`--scale must be a positive number of metres, not "${values.scale}"`);
```

and to the returned object after `frames,`:

```ts
    place: values.place ?? null,
    at,
    scale,
```

- After `randomSeed`, add:

```ts
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
/** Control and format characters, combining marks, and line and paragraph separators. */
const HIDDEN = /[\p{Cc}\p{Cf}\p{M}\p{Zl}\p{Zp}]/u;

/** A label the status bar can draw one character per column: composed, without hidden or double-width characters, at most 32 long. May be empty. */
export function cleanLabel(text: string): string {
  return Array.from(text.normalize('NFC'))
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return !HIDDEN.test(ch) && !WIDE.some(([from, to]) => cp >= from && cp <= to);
    })
    .join('')
    .trim()
    .slice(0, 32)
    .trim();
}

/** A real place for the status bar. */
export type GamePlace = {
  readonly name: string;
  readonly projection: Projection;
  status(): { readonly loading: number; readonly offline: boolean };
};
```

- Replace the `GameOptions` type with:

```ts
export type GameOptions = AtmosphereOptions & {
  readonly spawn?: 'land' | 'coast';
  /** The world to play in; without it a generated world is made from the seed. */
  readonly world?: ChunkSource;
  readonly place?: GamePlace;
};
```

- In the `Game` class, replace `readonly world: World;` with `readonly world: ChunkSource;` and after it add `readonly place: GamePlace | null;`.
- Replace the constructor with:

```ts
  constructor(seed: number, cols: number, rows: number, options: GameOptions = {}) {
    this.atm = new Atmosphere(seed, options);
    this.place = options.place ?? null;
    if (options.world !== undefined) {
      // A real place: you start exactly on the cell the place resolved to.
      this.world = options.world;
      this.player = { x: 0.5, y: 0.5 * ASPECT, vx: 0, vy: 0 };
    } else {
      const world = new World(seed);
      this.world = world;
      // Start on land; the bench starts on the land nearest a sea, so water is in view.
      const from = options.spawn === 'coast' ? findSea(world, 0, 0) : { mx: 0, my: 0 };
      const land = findLand(world, from.mx, from.my);
      this.player = { x: land.mx + 0.5, y: (land.my + 0.5) * ASPECT, vx: 0, vy: 0 };
    }
    this.frames = [new Frame(cols, rows), new Frame(cols, rows)];
  }
```

- In `draw`, replace `const hud = this.showHud ? { fps: this.fps } : null;` with:

```ts
    const hud = this.showHud ? { fps: this.fps, place: this.placeHud() } : null;
```

and after `draw`, add:

```ts
  private placeHud(): PlaceHud | null {
    if (this.place === null) return null;
    const { loading, offline } = this.place.status();
    return { name: this.place.name, projection: this.place.projection, loading, offline };
  }
```

with `import type { PlaceHud } from './render.ts';` added next to the render import (`import { Renderer, viewOrigin } from './render.ts';`).

- [ ] **Step 5: The entry point**

Replace `src/main.ts` with:

```ts
// Entry point: `node src/main.ts [--seed N] [--place TEXT | --at LAT,LON] [--scale M]` to play, `--bench` to measure.
import { FRAME_DT, FRAME_MS, MAX_CATCH_UP_STEPS, PREFETCH_BUDGET_MS } from './config.ts';
import { Game, cleanLabel, parseOptions, randomSeed, runBench, seedFrom } from './game.ts';
import type { GameOptions, Options } from './game.ts';
import { InputState } from './input.ts';
import { Net, defaultCacheDir } from './net.ts';
import { resolvePlace } from './place.ts';
import { RealWorld } from './realworld.ts';
import { SYNC_BEGIN, SYNC_END, Terminal } from './terminal.ts';

/** The real world for `--place` or `--at`, with its seed; null for the generated world. */
async function realWorld(options: Options): Promise<{ seed: number; game: GameOptions } | null> {
  if (options.place === null && options.at === null) return null;
  const net = new Net(defaultCacheDir());
  let origin: { lat: number; lon: number };
  let name: string;
  if (options.at !== null) {
    origin = options.at;
    name = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}`;
  } else {
    const place = await resolvePlace(options.place ?? '', net);
    origin = place;
    name = cleanLabel(place.name) || `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
  }
  const seed = options.seed ?? seedFrom(`${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}`);
  const world = new RealWorld(origin, options.scale, seed, net);
  return { seed, game: { world, place: { name, projection: world.projection, status: () => world.status() } } };
}

async function play(options: Options): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('wander needs a terminal\n');
    process.exit(1);
  }
  let real: { seed: number; game: GameOptions } | null;
  try {
    real = await realWorld(options);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
  const term = new Terminal({ stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, proc: process });
  await term.open();
  const game = new Game(real?.seed ?? options.seed ?? randomSeed(), term.cols, term.rows, real?.game ?? {});
  game.prefetch(Infinity);
  const input = new InputState(term.kitty);
  term.onData((text) => input.feed(text, performance.now()));
  term.onResize(() => game.resize(term.cols, term.rows));

  // Step n is due at start + n × FRAME_MS. Behind? Catch up a few steps, then draw once.
  const start = performance.now();
  let steps = 0;
  let drawn = 0;
  let fpsSince = start;
  const tick = (): void => {
    const now = performance.now();
    const due = Math.floor((now - start) / FRAME_MS) + 1;
    if (due - steps > MAX_CATCH_UP_STEPS) steps = due - MAX_CATCH_UP_STEPS; // far behind: skip ahead
    if (due > steps) {
      const intent = input.intent(now);
      for (; steps < due; steps++) game.update(intent, FRAME_DT);
      for (const action of input.takeActions()) {
        if (action === 'quit') {
          term.restore();
          process.exit(0);
        } else if (action === 'toggleHud') {
          game.toggleHud();
        }
      }
      game.prefetch(PREFETCH_BUDGET_MS);
      const out = game.draw();
      if (out.length > 0) term.write(SYNC_BEGIN + out + SYNC_END);
      drawn++;
      if (now - fpsSince >= 1000) {
        game.fps = Math.round((drawn * 1000) / (now - fpsSince));
        drawn = 0;
        fpsSince = now;
      }
    }
    setTimeout(tick, Math.max(0, start + steps * FRAME_MS - performance.now()));
  };
  tick();
}

let options: Options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}
if (options.bench) process.stdout.write(`${runBench(options)}\n`);
else await play(options);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/render.test.ts test/game.test.ts`
Expected: PASS, `tests 19`, `fail 0` (8 render, 11 game)

- [ ] **Step 7: Update the README**

In `README.md`, after the paragraph starting with `` `--seed 42` ``, add:

```markdown
## Real places

```bash
node src/main.ts --place Prague
node src/main.ts --at 50.088,14.414 --scale 6
```

With `--place` or `--at`, the landscape is the real one: elevation from the Terrarium tiles and land cover, water, buildings, roads and railways from OpenStreetMap, one character per 3 m (`--scale` changes that). Data is fetched as you walk and cached under `~/.cache/wander`, so a place you have visited works offline. Chunks still loading show as fog, and the status bar says `loading` or `offline`.

Elevation: [Terrarium tiles](https://registry.opendata.aws/terrain-tiles/) by Mapzen and Nextzen on AWS Open Data. Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL. Place names through [Nominatim](https://nominatim.org/).
```

- [ ] **Step 8: Run the whole suite**

Run: `node --test`
Expected: PASS, `tests 121`, `fail 0`

- [ ] **Step 9: Commit**

```bash
git add src/render.ts src/game.ts src/main.ts README.md test/render.test.ts test/game.test.ts
git commit -m "feat: --place and --at play a real place, with fog while it loads" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Verify: suite, bench, a real place in a pseudo-terminal, Ghostty playtest

**Files:**
- Modify: nothing, unless a bench target is missed (`src/config.ts`, `COLOR_BITS`)

**Interfaces:**
- Consumes: the finished program and the network
- Produces: measured numbers and a smoke-test result for the user, then the user's playtest verdict

- [ ] **Step 1: Run the whole suite**

Run: `node --test`
Expected: `fail 0` (121 tests)

- [ ] **Step 2: Bench on the generated world**

```bash
node src/main.ts --bench --seed 1 --size 200x60
```

Expected: build mean ≤ 5 ms, p95 ≤ 8 ms, output mean ≤ 120 KB, as before (the renderer only gained a per-cell `ready` check).

- [ ] **Step 3: Bad arguments and a missing place**

```bash
node src/main.ts --at 95,14; echo "exit $?"
node src/main.ts --place Prague --at 50,14; echo "exit $?"
```

Expected: each prints its message and `exit 2` (the terminal check happens inside `play`, after parsing; without a terminal the first line is `wander needs a terminal` and `exit 1` instead, so run these in a pseudo-terminal if needed: `script -q /dev/null node src/main.ts --at 95,14`).

- [ ] **Step 4: A real place in a pseudo-terminal (needs the network)**

```bash
SMOKE="$(mktemp -d)/smoke.out"
(sleep 6; printf q; sleep 1) | script -q "$SMOKE" sh -c 'stty cols 120 rows 40; exec node src/main.ts --at 50.088,14.414' > /dev/null
printf 'entered full screen: %s\n' "$(grep -aoF $'\x1b[?1049h' "$SMOKE" | wc -l | tr -d ' ')"
printf 'frames written:      %s\n' "$(grep -aoF $'\x1b[?2026h' "$SMOKE" | wc -l | tr -d ' ')"
printf 'attribution shown:   %s\n' "$(grep -acF 'OpenStreetMap' "$SMOKE")"
printf 'map drawn:           %s\n' "$(grep -acF '≈' "$SMOKE")"
printf 'restored at the end: %s\n' "$(tail -c 200 "$SMOKE" | grep -acF $'\x1b[?1049l')"
ls ~/.cache/wander/terrarium/13 ~/.cache/wander/osm/14 2>/dev/null | head
```

Expected:
- entered full screen: `1`
- frames written: ≥ `200`
- attribution shown: ≥ `1`
- map drawn: ≥ `1` (the Vltava's `≈` glyphs once the region has loaded; if the Overpass server is slow, rerun: the second run is served from the cache)
- restored at the end: `1`
- the cache directory lists tile and region files

- [ ] **Step 5: Hand over for the Ghostty playtest**

Report Steps 1–4 to the user, then ask them to run this in a full-size Ghostty window:

```bash
cd ~/Projects/wander && node src/main.ts --place Prague
```

Ask them to check:

- The map appears within a few seconds: the Vltava, Letná, the Old Town's buildings and streets, Petřín's slope.
- Walking in any direction keeps the map arriving ahead; fog is brief and the status bar's `loading` comes and goes.
- The status bar shows latitude and longitude, `Prague · © OpenStreetMap`, and about 60 fps.
- Rivers flow, surf and weather behave, day and night work as before.
- A second start of the same place is instant, and with Wi-Fi off it still starts on the cached area and says `offline`.
- Every character takes one column.

Scale, colours and the five new biomes are tunable in `src/config.ts`. After their verdict, use superpowers:finishing-a-development-branch for `feat/real-world`.
