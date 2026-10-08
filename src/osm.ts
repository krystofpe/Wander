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
      for (const ring of rings) {
        for (const [, y] of ring) {
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
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
