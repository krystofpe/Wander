import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, Biome } from '../src/config.ts';
import { Terrain, biomeOf, classify } from '../src/world.ts';
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
