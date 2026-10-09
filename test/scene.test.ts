import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, BIOME_NAMES } from '../src/config.ts';
import type { PropKind } from '../src/config.ts';
import { FOODS } from '../src/art.ts';
import { draw, drawColorsAt, flat, paint } from '../src/kit.ts';
import type { Canvas } from '../src/art.ts';
import { cairnArt, critterArt, footprint, itemArt, propArt } from '../src/scenery.ts';
import { rng } from '../src/noise.ts';
import { Geometry, Scene, layoutScene } from '../src/scene.ts';
import { skyAt } from '../src/sky.ts';

test('painted pixels are drawn two to a cell, half a cell down when asked, and mirrored', () => {
  const calls: string[] = [];
  const canvas: Canvas = {
    width: 9,
    height: 9,
    put: () => calls.push('put'),
    halves: (c, r, top, bottom, glowTop, glowBottom) => calls.push(`${c},${r} ${top} ${bottom}${glowTop ? ' glow' : ''}${glowBottom ? ' glow' : ''}`),
  };
  const mats = { a: { ramp: flat(1, 1) }, g: { ramp: flat(3, 3), glow: true } };
  const s = paint(draw(2, 2, [{ rows: ['a.', 'ag'], x: 0, y: 0, bare: true }]), mats);
  drawColorsAt(canvas, s, 0, 2);
  assert.deepEqual(calls, ['0,1 1 1', '1,1 null 3 glow'], 'on whole cells');
  calls.length = 0;
  drawColorsAt(canvas, s, 0, 3);
  assert.deepEqual(calls, ['0,1 null 1', '0,2 1 null', '1,2 3 null glow'], 'half a cell down');
  calls.length = 0;
  drawColorsAt(canvas, s, 0, 2, true);
  assert.deepEqual(calls, ['0,1 null 3 glow', '1,1 1 1'], 'mirrored');
});

test('every prop of every biome is drawn the size its footprint says, and stands on whole cells', () => {
  for (const biome of BIOME_NAMES) {
    const def = BIOMES[biome];
    const kinds: PropKind[] = ['home', ...def.props.map(([k]) => k), def.forage, ...(def.water === null ? [] : [def.water])];
    for (const kind of kinds) {
      for (const variant of [0, 1, 2, 3, 7]) {
        const fp = footprint(kind, variant, biome);
        for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
          const art = propArt(kind, variant, { biome, season, snowy: season === 'winter', frozen: season === 'winter', night: false, frame: variant, sky: 0x9cc8f0, sway: 0 });
          assert.equal(art.w, fp.w, `${biome} ${kind}`);
          assert.equal(art.h, fp.h, `${biome} ${kind}`);
          // Something on its bottom row of pixels: nothing floats above the ground.
          const bottom = art.rgb.subarray((art.h * 2 - 1) * art.w, art.h * 2 * art.w);
          assert.ok(bottom.some((c) => c >= 0), `${biome} ${kind} reaches the ground`);
        }
      }
    }
  }
});

test('every shelter has a dark hollow where its eyes can show, and embers that glow at night', () => {
  for (const biome of BIOME_NAMES) {
    const fp = footprint('home', 0, biome);
    assert.ok(fp.door !== undefined, biome);
    const door = fp.door;
    const look = { biome, season: 'summer' as const, snowy: false, frozen: false, night: true, frame: 0, sky: 0x9cc8f0, sway: 0 };
    const art = propArt('home', 0, look);
    // The two cells at its eyes are dark, top and bottom pixels both.
    for (const c of [door.col, door.col + 1]) {
      for (const y of [door.row * 2, door.row * 2 + 1]) {
        const rgb = art.rgb[y * art.w + c];
        assert.ok(rgb >= 0 && (rgb >> 16) + ((rgb >> 8) & 255) + (rgb & 255) < 90, `${biome} doorway at ${c},${y}`);
      }
    }
    assert.ok(art.glow.some((g) => g === 1), `${biome} has glowing embers`);
    assert.ok(!propArt('home', 0, { ...look, night: false }).glow.some((g) => g === 1), `${biome} embers are ash by day`);
    assert.ok(footprint('home', 0, biome).smoke !== undefined, `${biome} smoke rises from somewhere`);
  }
});

test('critters, food, finds and cairns all have pixels', () => {
  for (const kind of ['butterfly', 'bird', 'firefly', 'frog', 'moth'] as const) {
    for (const frame of [0, 1]) assert.ok(critterArt(kind, frame, 0x808080).rgb.some((c) => c >= 0), kind);
  }
  for (const f of FOODS) assert.ok(itemArt(f.glyph, f.color).rgb.some((c) => c >= 0), f.name);
  assert.ok(itemArt('?', 0xffffff).rgb.some((c) => c >= 0), 'anything unknown is a gem');
  for (let n = 1; n <= 9; n++) assert.ok(cairnArt(n, false).rgb.some((c) => c >= 0));
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
  assert.equal(g.horizon, 22);
  assert.equal(g.footRow(0), 22);
  assert.equal(g.footRow(1), 39);
  for (let r = 22; r < 40; r++) assert.equal(g.footRow(g.depthOf(r)), r);
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
