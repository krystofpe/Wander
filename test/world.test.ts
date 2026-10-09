import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_IDS } from '../src/biomes.ts';
import { biomeAt, groundHeight, landmarkAt, landmarksBetween, stretchAt, stretchesBetween, tendencyAt } from '../src/world.ts';

test('the same seed and distance always give the same place', () => {
  for (const d of [0, 1234.5, 98765.4321, 5e6, 2.5e8]) {
    assert.deepEqual(biomeAt(7, d), biomeAt(7, d));
    assert.equal(groundHeight(7, d), groundHeight(7, d));
    assert.deepEqual(stretchAt(7, d), stretchAt(7, d));
    assert.deepEqual(landmarkAt(7, Math.floor(d / 1000)), landmarkAt(7, Math.floor(d / 1000)));
  }
});

test('a different seed gives a different road', () => {
  let same = 0;
  for (let i = 0; i < 40; i++) if (stretchAt(1, i * 1000).biome === stretchAt(2, i * 1000).biome) same++;
  assert.ok(same < 20, `${same}/40 stretches the same`);
});

test('stretches last about 5 to 20 minutes at walking pace', () => {
  const all = stretchesBetween(3, 0, 400000);
  assert.ok(all.length > 200);
  for (const s of all) {
    const minutes = (s.end - s.start) / 1.15 / 60;
    assert.ok(minutes >= 3.5 && minutes <= 24, `${s.biome} lasts ${minutes.toFixed(1)} min`);
  }
});

test('neighbouring stretches are different biomes, and plausible neighbours', () => {
  const all = stretchesBetween(5, 0, 2000000);
  const never: [string, string][] = [
    ['desert', 'tundra'],
    ['desert', 'swamp'],
    ['tundra', 'swamp'],
    ['saltflat', 'tundra'],
  ];
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1].biome;
    const b = all[i].biome;
    assert.notEqual(a, b, `stretch ${i}`);
    for (const [x, y] of never) assert.ok(!((a === x && b === y) || (a === y && b === x)), `${a} next to ${b}`);
  }
});

test('every biome comes up, none dominates', () => {
  const counts: Record<string, number> = {};
  const all = stretchesBetween(11, 0, 3000000);
  for (const s of all) counts[s.biome] = (counts[s.biome] ?? 0) + 1;
  for (const id of BIOME_IDS) {
    const share = (counts[id] ?? 0) / all.length;
    assert.ok(share > 0.025 && share < 0.16, `${id}: ${(share * 100).toFixed(1)}% ${JSON.stringify(counts)}`);
  }
});

test('biomes blend slowly: no hard borders, weights always sum to one', () => {
  for (let d = 0; d < 60000; d += 0.5) {
    const a = biomeAt(9, d);
    const b = biomeAt(9, d + 0.5);
    assert.ok(a.k >= 0 && a.k <= 1);
    // The share of whichever biome is fading in never jumps.
    const share = (w: typeof a, id: string): number => (w.a === id ? 1 - w.k : 0) + (w.b === id ? w.k : 0);
    for (const id of new Set([a.a, a.b, b.a, b.b])) assert.ok(Math.abs(share(a, id) - share(b, id)) < 0.01, `${id} jumps at ${d}`);
  }
});

test('a blend takes minutes of walking', () => {
  // From the first distance where a new biome shows to where the old one is gone.
  const all = stretchesBetween(13, 0, 100000);
  for (let i = 1; i < all.length; i++) {
    const border = all[i].start;
    let from = border;
    while (biomeAt(13, from - 1).k > 0 || biomeAt(13, from - 1).b !== biomeAt(13, from - 1).a) from -= 1;
    let to = border;
    while (biomeAt(13, to + 1).k < 1 && biomeAt(13, to + 1).b !== biomeAt(13, to + 1).a) to += 1;
    const minutes = (to - from) / 1.15 / 60;
    assert.ok(minutes > 1.5, `blend at ${border} lasts ${minutes.toFixed(2)} min`);
  }
});

test('the ground is smooth and walkable', () => {
  let prev = groundHeight(4, 0);
  for (let d = 0.25; d < 50000; d += 0.25) {
    const h = groundHeight(4, d);
    const slope = (h - prev) / 0.25;
    assert.ok(Math.abs(slope) < 0.35, `slope ${slope.toFixed(2)} at ${d}`);
    prev = h;
  }
});

test('landmarks are rare, spaced apart, and fit their place', () => {
  const marks = landmarksBetween(21, 0, 300000);
  assert.ok(marks.length > 60 && marks.length < 300, `${marks.length} landmarks in 300 km`);
  for (let i = 1; i < marks.length; i++) assert.ok(marks[i].at - marks[i - 1].at > 400, `too close at ${marks[i].at}`);
  for (const m of marks) {
    const here = stretchAt(21, m.at).biome;
    if (m.kind === 'lighthouse') assert.equal(here, 'coast');
    if (m.kind === 'skeleton') assert.ok(['desert', 'saltflat', 'tundra', 'plateau'].includes(here), `skeleton in ${here}`);
  }
  const kinds = new Set(marks.map((m) => m.kind));
  assert.ok(kinds.size >= 9, `only ${[...kinds].join(', ')}`);
});

test('the weather leans with the place', () => {
  const desert = tendencyAt(0, 0, 'desert');
  const swamp = tendencyAt(0, 0, 'swamp');
  assert.ok(desert.wet < swamp.wet);
  assert.ok(tendencyAt(0, 0, 'tundra').snow > 0.8);
});
