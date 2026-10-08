import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, REAL, Water } from '../src/config.ts';
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
  for (const needle of ['natural"="water', 'waterway', 'landuse', 'leisure', 'building', 'highway', 'railway', 'out geom', '(50,14,50.1,14.1)', `[timeout:${Math.ceil(REAL.fetchTimeoutMs / 1000)}]`]) {
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
