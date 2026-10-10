import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, BIOME_NAMES, DEPTH_PX, FOODS } from '../src/creature/config.ts';
import type { PropKind } from '../src/creature/config.ts';
import { rng } from '../src/noise.ts';
import { FOOTPRINTS, Geometry, Scene, TREE_CLEAR, TREE_IN, forestFocus, layoutScene } from '../src/creature/scene.ts';
import { skyAt } from '../src/creature/sky.ts';

test('every prop of every biome has a footprint, and the layout gives it that size', () => {
  for (const biome of BIOME_NAMES) {
    const def = BIOMES[biome];
    const kinds: PropKind[] = [...def.props.map(([k]) => k), def.forage, ...(def.water === null ? [] : [def.water])];
    for (const kind of kinds) {
      const fp = FOOTPRINTS[kind];
      assert.ok(fp !== undefined && fp.w > 0 && fp.h > 0, `${biome} ${kind}`);
    }
    for (let seed = 1; seed < 6; seed++) {
      for (const p of layoutScene(seed, biome).props) {
        if (p.kind !== 'home') assert.equal(p.sprite, FOOTPRINTS[p.kind], `${biome} ${p.kind}`);
      }
    }
  }
});

test('every home has a doorway inside it, where its eyes can show', () => {
  for (const biome of BIOME_NAMES) {
    const home = layoutScene(1, biome).home;
    assert.equal(home.sprite, BIOMES[biome].canopy ? FOOTPRINTS.tree : FOOTPRINTS.shelter, biome);
    const door = home.sprite.door;
    assert.ok(door !== undefined, biome);
    assert.ok(door.x - door.w / 2 >= 0 && door.x + door.w / 2 <= home.sprite.w, `${biome} the door is within its home`);
    assert.ok(door.h > 0 && door.h < home.sprite.h, biome);
    const g = new Geometry(640);
    const at = g.door(home);
    assert.ok(at.x > 0 && at.x < 1, biome);
    assert.equal(at.z, home.z);
  }
});

test('there is a sprite for every food it can be given, in turn', () => {
  assert.ok(FOODS.length >= 3);
  assert.equal(new Set(FOODS.map((f) => f.sprite)).size, FOODS.length);
  const scene = new Scene(1, 'meadow', rng(1));
  const dropped = FOODS.map(() => scene.dropFood(0.5, 0.5).kind);
  assert.deepEqual(dropped, [...FOODS]);
  scene.dropFood(0.5, 0.5);
  assert.equal(scene.foods.length, 5, 'no more than five lie about');
});

test('layouts are the same for a seed, inside the scene, with a home, food and water', () => {
  for (const biome of BIOME_NAMES) {
    const a = layoutScene(9, biome);
    assert.deepEqual(a, layoutScene(9, biome));
    assert.equal(a.home.kind, 'home');
    assert.equal(a.forage.kind, BIOMES[biome].forage);
    assert.equal(a.water === null, BIOMES[biome].water === null, biome);
    assert.equal(a.homeLeft, a.home.x < 0.5, biome);
    for (const p of a.props) assert.ok(p.x >= 0 && p.x <= 1 && p.z >= 0 && p.z <= 1, `${biome} ${p.kind}`);
    assert.ok(a.cairn.x >= 0.05 && a.cairn.x <= 0.95, biome);
    for (const s of a.seats) assert.ok(['rock', 'stump', 'drift'].includes(s.kind), `${biome} ${s.kind}`);
  }
});

test('geometry maps shares to pixels and depth to rows, and back', () => {
  const g = new Geometry(640);
  assert.equal(g.px(0), 0);
  assert.equal(g.px(1), 640);
  assert.equal(g.x(g.px(0.3)), 0.3);
  const ground = g.footY(0.5, 0);
  assert.equal(g.footY(0.5, 1), ground + DEPTH_PX);
  assert.equal(g.footY(0.5, 2), ground + DEPTH_PX, 'nothing stands past the glass');
  for (let y = ground; y <= ground + DEPTH_PX; y++) assert.ok(Math.abs(g.footY(0.5, g.depthOf(0.5, y)) - y) < 1e-9, `row ${y}`);
  assert.equal(g.depthOf(0.5, ground - 20), -1, 'above the walk line');
  assert.equal(g.depthOf(0.5, ground + DEPTH_PX * 2), 2, 'below the band');
  // A hilly walk line moves the feet with it.
  const hills = new Geometry(640, (x) => 280 + x * 20);
  assert.equal(hills.footY(1, 0) - hills.footY(0, 0), 20);
  assert.equal(hills.depthOf(1, 300), 0);
  const door = g.door(layoutScene(1, 'meadow').home);
  assert.ok(door.x > 0 && door.x < 1);
  const beside = g.beside(layoutScene(1, 'meadow').forage, 1);
  assert.ok(beside.x > layoutScene(1, 'meadow').forage.x && beside.z <= 1);
});

test('food falls and lands; the toy bounces and comes to rest', () => {
  const scene = new Scene(1, 'meadow', rng(1));
  const g = new Geometry(640);
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
  assert.equal(food.vh, 0);
  assert.ok(bounced);
  assert.equal(scene.toy?.resting, true);
  assert.ok(scene.toy !== null && scene.toy.x >= 0.02 && scene.toy.x <= 0.98, 'it stays in the scene');
  for (let i = 0; i < 30 * 30; i++) scene.update(1 / 30, g, sky, null);
  assert.equal(scene.toy, null, 'the toy fades after a while');
});

test('little signs drift, fall with gravity, and fade', () => {
  const scene = new Scene(1, 'meadow', rng(1));
  const g = new Geometry(640);
  const sky = skyAt(new Date(2026, 9, 8, 12).getTime(), 1, 'meadow');
  scene.emit({ kind: 'heart', x: 100, y: 200, vx: 0, vy: -10, life: 1 });
  scene.emit({ kind: 'dirt', x: 100, y: 200, vx: 0, vy: 0, life: 1, gravity: 300 });
  scene.update(0.5, g, sky, null);
  const [heart, dirt] = scene.particles;
  assert.equal(heart.gravity, 0);
  assert.ok(heart.y < 200, 'a heart rises');
  assert.ok(dirt.y > 200, 'dirt falls');
  scene.update(0.6, g, sky, null);
  assert.equal(scene.particles.length, 0);
});

test('critters come by in the daytime and leave again', () => {
  const scene = new Scene(1, 'meadow', rng(4));
  const g = new Geometry(640);
  const sky = { ...skyAt(new Date(2026, 6, 8, 12).getTime(), 1, 'meadow'), weather: { cloud: 0, precip: 0, kind: 'none', storm: false, fog: 0, wind: 0, name: 'clear' } as const };
  let seen = 0;
  for (let i = 0; i < 30 * 600; i++) {
    scene.update(1 / 30, g, sky, null);
    seen = Math.max(seen, scene.critters.length);
  }
  assert.ok(seen > 0);
  assert.ok(scene.critters.length <= 3);
});

test('under the canopy the scene is laid out round its home tree: thick with growth, its doorway left open', () => {
  assert.ok(forestFocus(true) > 0.55 && forestFocus(false) < 0.45, 'the glow stands off on the open side');
  const g = new Geometry(640);
  for (let seed = 1; seed < 30; seed++) {
    const l = layoutScene(seed, 'forest');
    const left = l.home.x < 0.5;
    assert.equal(l.homeLeft, left);
    assert.equal(l.home.edge, left ? -1 : 1, 'its home stands against the edge of the view');
    assert.equal(g.px(g.door(l.home).x), left ? TREE_IN : 640 - TREE_IN, 'its door a little way in from the edge');
    assert.ok(left ? g.leftOf(l.home) < 0 : g.leftOf(l.home) + l.home.sprite.w > 640, 'the great tree runs past the edge');
    assert.ok(l.props.filter((p) => p.kind === 'fern').length >= 3, `ferns grow all round (seed ${seed})`);
    for (const p of l.props) {
      if (p !== l.home) assert.ok(left ? p.x >= TREE_CLEAR : p.x <= 1 - TREE_CLEAR, `nothing stands in the doorway of the great tree (seed ${seed}, ${p.kind})`);
    }
  }
});
