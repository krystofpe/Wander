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
  private regionsInFlight = 0;
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
    const slot = this.net.inFlight < REAL.maxInFlight && (input.kind !== 'region' || this.regionsInFlight < REAL.maxRegionsInFlight);
    if (due && slot) void this.load(input, entry);
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
        this.regionsInFlight++;
        let bytes: Uint8Array;
        try {
          bytes = await this.net.get(REAL.overpassUrl, cacheFile, {
            method: 'POST',
            body: `data=${encodeURIComponent(overpassQuery(bounds))}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        } finally {
          this.regionsInFlight--;
        }
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
