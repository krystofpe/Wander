import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, BIOMES, Biome, CHUNK_CACHE_LIMIT, Water } from '../src/config.ts';
import { Terrain, World, biomeOf, chunkKey, classify, findLand, findSea, isWater } from '../src/world.ts';
import { rng } from '../src/noise.ts';

test('the biome table lines up with the biome ids', () => {
  assert.equal(BIOMES.length, Object.keys(Biome).length);
  assert.equal(BIOMES[Biome.Forest].name, 'Forest');
  assert.equal(BIOMES[Biome.SnowyPeaks].name, 'Snowy peaks');
  for (const b of BIOMES) {
    assert.ok(b.glyphs.length > 0, b.name);
    assert.ok(b.speed > 0 && b.speed <= 1, b.name);
  }
});

test('classify follows the rules in order', () => {
  assert.equal(classify(-0.5, 0.5, 0.5), Biome.DeepOcean);
  assert.equal(classify(-0.2, 0.5, 0.5), Biome.Ocean);
  assert.equal(classify(-0.01, 0.5, 0.5), Biome.Shallows);
  assert.equal(classify(0.02, 0.5, 0.5), Biome.Beach);
  assert.equal(classify(0.95, 0.5, 0.5), Biome.SnowyPeaks);
  assert.equal(classify(0.75, 0.5, 0.1), Biome.SnowyPeaks);
  assert.equal(classify(0.75, 0.5, 0.5), Biome.Mountains);
  assert.equal(classify(0.6, 0.5, 0.5), Biome.Hills);
  assert.equal(classify(0.3, 0.5, 0.1), Biome.Tundra);
  assert.equal(classify(0.3, 0.2, 0.7), Biome.Desert);
  assert.equal(classify(0.1, 0.8, 0.5), Biome.Swamp);
  assert.equal(classify(0.3, 0.8, 0.5), Biome.Forest);
  assert.equal(classify(0.3, 0.6, 0.5), Biome.Forest);
  assert.equal(classify(0.3, 0.4, 0.5), Biome.Grassland);
});

test('rivers and lakes override land below the hills', () => {
  const base = { height: 0.3, moisture: 0.6, temperature: 0.5, river: 0.5, lake: 0 };
  assert.equal(biomeOf(base), Biome.Forest);
  assert.equal(biomeOf({ ...base, river: 0.005 }), Biome.River);
  assert.equal(biomeOf({ ...base, height: 0.6, river: 0.005 }), Biome.Hills);
  assert.equal(biomeOf({ ...base, lake: 0.6 }), Biome.Lake);
  assert.equal(biomeOf({ ...base, lake: 0.6, moisture: 0.3 }), Biome.Grassland);
});

test('every biome appears in a large sample of a fixed seed', () => {
  const terrain = new Terrain(1);
  const r = rng(5);
  const seen = new Set<number>();
  for (let i = 0; i < 40000 && seen.size < BIOMES.length; i++) {
    seen.add(biomeOf(terrain.fields(r() * 40000 - 20000, r() * 40000 - 20000)));
  }
  const missing = BIOMES.filter((_, id) => !seen.has(id)).map((b) => b.name);
  assert.deepEqual(missing, []);
});

test('a chunk holds the same biomes as computing each cell directly', () => {
  const world = new World(11);
  const chunk = world.chunk(-2, 3);
  for (const [i, j] of [[0, 0], [63, 0], [0, 63], [31, 17], [63, 63]]) {
    const mx = -2 * 64 + i;
    const my = 3 * 64 + j;
    const expected = biomeOf(world.terrain.fields(mx, my * ASPECT));
    assert.equal(chunk.biome[j * 64 + i], expected);
    assert.equal(world.biomeAt(mx, my), expected);
  }
  assert.equal(world.chunk(-2, 3), chunk);
  assert.equal(world.generated, 1);
});

test('chunks carry shading, river flow and shore data', () => {
  const world = new World(1);
  const sea = findSea(world, 0, 0);
  const coast = findLand(world, sea.mx, sea.my);
  const ccx = Math.floor(coast.mx / 64);
  const ccy = Math.floor(coast.my / 64);
  let shore = 0;
  let shaded = 0;
  for (let cy = ccy - 1; cy <= ccy + 1; cy++) {
    for (let cx = ccx - 1; cx <= ccx + 1; cx++) {
      const c = world.chunk(cx, cy);
      for (let o = 0; o < 64 * 64; o++) {
        assert.ok(c.shade[o] >= 0.55 && c.shade[o] <= 1.35);
        if (c.shade[o] !== 1) shaded++;
        if (c.shore[o] === 1) {
          shore++;
          assert.equal(BIOMES[c.biome[o]].water, Water.Sea);
        }
        if (c.biome[o] === Biome.River) assert.ok(Math.abs(Math.hypot(c.flowX[o], c.flowY[o]) - 1) < 1e-3);
      }
    }
  }
  assert.ok(shore > 0, 'a coast has shore cells');
  assert.ok(shaded > 0, 'land has slope shading');
});

test('far-away and negative coordinates work and chunks stay distinct', () => {
  const world = new World(3);
  for (const [mx, my] of [[1_000_000, -1_000_000], [-1, -1], [-64, -64], [-65, 0]]) {
    const b = world.biomeAt(mx, my);
    assert.ok(b >= 0 && b < BIOMES.length);
    assert.equal(b, biomeOf(world.terrain.fields(mx, my * ASPECT)));
  }
  assert.notEqual(chunkKey(-1, 0), chunkKey(0, -1));
  assert.notEqual(chunkKey(1, 0), chunkKey(0, 1));
  assert.notEqual(world.chunk(-1, 0), world.chunk(0, -1));
});

test('the cache drops the least recently used chunk beyond its limit', () => {
  const world = new World(6);
  const first = world.chunk(0, 0);
  for (let i = 1; i <= CHUNK_CACHE_LIMIT; i++) {
    world.chunk(i, 0);
    if (i === CHUNK_CACHE_LIMIT - 1) world.chunk(0, 0); // keep 0,0 fresh, so 1,0 goes instead
  }
  const before = world.generated;
  assert.equal(world.chunk(0, 0), first);
  assert.equal(world.generated, before);
  world.chunk(1, 0);
  assert.equal(world.generated, before + 1);
});

test('prefetch fills the view plus a one-chunk ring, within its time budget', () => {
  const world = new World(4);
  // View x 0..99, y 0..39 covers chunks x 0..1, y 0; with the ring: x -1..2, y -1..1 = 12 chunks.
  assert.equal(world.prefetch(0, 0, 100, 40, Infinity), 12);
  assert.equal(world.prefetch(0, 0, 100, 40, Infinity), 0);
  const slow = new World(4);
  let clock = 0;
  const made = slow.prefetch(0, 0, 100, 40, 3, () => (clock += 2)); // every look at the clock costs 2 ms
  assert.equal(made, 1);
});

test('findLand and findSea find what they are asked for', () => {
  for (const seed of [1, 2, 3]) {
    const world = new World(seed);
    const land = findLand(world, 0, 0);
    assert.equal(isWater(world.biomeAt(land.mx, land.my)), false);
    const sea = findSea(world, 0, 0);
    assert.equal(BIOMES[world.biomeAt(sea.mx, sea.my)].water, Water.Sea);
  }
});
