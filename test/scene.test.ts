import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, BIOME_NAMES } from '../src/config.ts';
import { CREATURE, CRITTERS, FOODS, HOMES, PROPS, doorOf, drawSprite, sprite } from '../src/art.ts';
import type { Canvas, Sprite } from '../src/art.ts';
import { rng } from '../src/noise.ts';
import { Geometry, Scene, layoutScene } from '../src/scene.ts';
import { skyAt } from '../src/sky.ts';

/** Code points that take two columns, roughly: CJK, fullwidth, emoji. */
const wide = (cp: number): boolean => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xff00 && cp <= 0xff60) || cp >= 0x1f300;

function grid(s: Sprite, opts: Parameters<typeof drawSprite>[5] = {}): string[] {
  const g = Array.from({ length: s.h }, () => Array<string>(s.w).fill('.'));
  const canvas: Canvas = { width: s.w, height: s.h, put: (c, r, glyph) => (g[r][c] = String.fromCodePoint(glyph)) };
  drawSprite(canvas, s, 0, 0, new Proxy({}, { get: () => ({ fg: 1 }) }), opts);
  return g.map((r) => r.join(''));
}

test('every sprite is single-width, and its mask lines up with it', () => {
  const all: [string, Sprite][] = [...Object.entries(CREATURE), ...Object.entries(PROPS), ...Object.entries(HOMES)];
  for (const [name, s] of all) {
    assert.equal(s.glyphs.length, s.h, name);
    for (let r = 0; r < s.h; r++) {
      assert.equal(s.glyphs[r].length, s.w, `${name} row ${r}`);
      assert.equal(s.keys[r].length, s.w, `${name} row ${r}`);
      for (const cp of s.glyphs[r]) assert.ok(!wide(cp), `${name} has a wide glyph`);
    }
  }
  for (const frames of Object.values(CRITTERS)) for (const f of frames) assert.ok(Array.from(f).every((ch) => !wide(ch.codePointAt(0) ?? 0)));
  for (const f of FOODS) assert.equal(Array.from(f.glyph).length, 1);
});

test('the creature is 7 by 4 with three face cells; every home has a two-cell door', () => {
  for (const [name, s] of Object.entries(CREATURE)) {
    assert.equal(s.w, 7, name);
    assert.equal(s.h, 4, name);
    assert.equal(s.glyphs.flat().filter((g) => g === 69).length, 3, name);
  }
  for (const [name, home] of Object.entries(HOMES)) {
    assert.equal(home.w, 12, name);
    const [c, r] = doorOf(home);
    assert.equal(home.keys[r][c], 'D', name);
    assert.equal(home.keys[r][c + 1], 'D', name);
    assert.equal(home.keys[r + 1][c], 'D', name);
  }
});

test('drawing mirrors glyphs and puts the eyes in screen order', () => {
  const s = sprite(['/EEE>'], ['aaaaa']);
  assert.deepEqual(grid(s, { eyes: '1 2' }), ['/1 2>']);
  assert.deepEqual(grid(s, { eyes: '1 2', flip: true }), ['<1 2\\']);
  assert.deepEqual(grid(sprite(['a b']), {}), ['a.b'], 'spaces without a mask are transparent');
});

test('layouts are the same for a seed, inside the scene, with a home, food and water', () => {
  for (const biome of BIOME_NAMES) {
    const a = layoutScene(9, biome);
    assert.deepEqual(a, layoutScene(9, biome));
    assert.equal(a.home.kind, 'home');
    assert.equal(a.forage.kind, BIOMES[biome].forage);
    assert.equal(a.water === null, BIOMES[biome].water === null, biome);
    for (const p of a.props) assert.ok(p.x >= 0 && p.x <= 1 && p.z >= 0 && p.z <= 1, `${biome} ${p.kind}`);
  }
});

test('geometry maps depth to rows and back', () => {
  const g = new Geometry(100, 40);
  assert.equal(g.horizon, 20);
  assert.equal(g.footRow(0), 20);
  assert.equal(g.footRow(1), 39);
  for (let r = 20; r < 40; r++) assert.equal(g.footRow(g.depthOf(r)), r);
  assert.equal(g.col(0), 0);
  assert.equal(g.col(1), 99);
  const door = g.door(layoutScene(1, 'meadow').home);
  assert.ok(door.x > 0 && door.x < 1);
});

test('food falls and lands; the toy bounces and comes to rest', () => {
  const scene = new Scene(1, 'meadow', rng(1));
  const g = new Geometry(100, 40);
  const sky = skyAt(new Date(2026, 9, 8, 12).getTime(), 1, 'meadow');
  const food = scene.dropFood(0.5, 0.5);
  scene.throwToy(true);
  let bounced = false;
  for (let i = 0; i < 30 * 20; i++) {
    const before = scene.toy?.vh ?? 0;
    scene.update(1 / 30, g, sky, null);
    if (before < 0 && (scene.toy?.vh ?? 0) > 0) bounced = true;
  }
  assert.equal(food.h, 0);
  assert.ok(bounced);
  assert.equal(scene.toy?.resting, true);
  for (let i = 0; i < 30 * 30; i++) scene.update(1 / 30, g, sky, null);
  assert.equal(scene.toy, null, 'the toy fades after a while');
});

test('critters come by in the daytime and leave again', () => {
  const scene = new Scene(1, 'meadow', rng(4));
  const g = new Geometry(100, 40);
  const sky = { ...skyAt(new Date(2026, 6, 8, 12).getTime(), 1, 'meadow'), weather: { cloud: 0, precip: 0, kind: 'none', storm: false, name: 'Clear' } as const };
  let seen = 0;
  for (let i = 0; i < 30 * 600; i++) {
    scene.update(1 / 30, g, sky, null);
    seen = Math.max(seen, scene.critters.length);
  }
  assert.ok(seen > 0);
  assert.ok(scene.critters.length <= 3);
});
