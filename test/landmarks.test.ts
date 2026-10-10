import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_IDS, LANDMARK_HOMES, LANDMARK_KINDS, MARK_NAMES, ROAD_BIOMES } from '../src/biomes.ts';
import { catchUp, newJourney } from '../src/journal.ts';
import { LAYERS, PX_PER_M } from '../src/layers.ts';
import { MARK_ON, markStamp, marksOn } from '../src/paint/landmarks.ts';
import { ROLES } from '../src/palette.ts';
import { FLORA, spotsBetween } from '../src/place.ts';
import { landmarksBetween } from '../src/world.ts';

/** What people make, that his road no longer has. */
const MADE = ['house', 'chapel', 'lighthouse', 'mast', 'car', 'bridge', 'train', 'circle', 'shrine', 'camp'];

test('nothing on his road is made by people', () => {
  for (const kind of MADE) assert.ok(!(LANDMARK_KINDS as readonly string[]).includes(kind), kind);
  for (const id of ['ruins', 'rail']) {
    assert.ok(!(ROAD_BIOMES as readonly string[]).includes(id), id);
    assert.ok(!(BIOME_IDS as readonly string[]).includes(id), id);
  }
  for (const id of ROAD_BIOMES) for (const f of FLORA[id]) assert.ok(!['pole', 'wall', 'post', 'stone'].includes(f.species), `${f.species} in ${id}`);
});

test('every landmark kind stands on a layer and draws a stamp of natural things, in each of its forms', () => {
  // Families only people's things are painted in.
  const made = new Set(['brick', 'roof', 'glass', 'metal', 'rail', 'wire', 'lamp', 'path']);
  for (const kind of LANDMARK_KINDS) {
    const layer = LAYERS.find((l) => l.name === MARK_ON[kind]);
    assert.ok(layer, kind);
    for (let cell = 0; cell < 4; cell++) {
      const s = markStamp({ cell, at: 2000, kind });
      assert.ok(s.w > 0 && s.h > 0 && s.h <= 140, `${kind} ${s.w}×${s.h}`);
      const painted = s.roles.filter((r) => r !== 0).length;
      assert.ok(painted > 300, `${kind}/${cell}: ${painted} px`);
      for (const r of s.roles) if (r !== 0) assert.ok(!made.has(ROLES[r].family), `${kind} uses ${ROLES[r].family}`);
    }
  }
});

test('every biome of the road has at least two sights it can show; the hollow has none', () => {
  for (const id of ROAD_BIOMES) {
    const kinds = LANDMARK_KINDS.filter((k) => (LANDMARK_HOMES[k][id] ?? 0) > 0);
    assert.ok(kinds.length >= 2, `${id}: ${kinds.join(', ')}`);
  }
  for (const k of LANDMARK_KINDS) assert.equal(LANDMARK_HOMES[k].deep, undefined);
});

test('a landmark is found on its own layer, at its own column, the same every time', () => {
  const seed = 1234;
  const marks = landmarksBetween(seed, 0, 60000);
  assert.ok(marks.length > 10);
  for (const m of marks.slice(0, 12)) {
    const layer = LAYERS.find((l) => l.name === MARK_ON[m.kind]);
    if (layer === undefined) throw new Error(m.kind);
    const u = Math.round((m.at * PX_PER_M) / layer.z);
    const found = marksOn(seed, layer, u - 10, u + 10).find((p) => p.mark.cell === m.cell);
    assert.ok(found, `${m.kind} at ${m.at}`);
    assert.equal(found.u, u);
    assert.deepEqual(marksOn(seed, layer, u - 10, u + 10), marksOn(seed, layer, u - 10, u + 10));
  }
});

test('he stops to look at every kind of landmark', () => {
  const seen = new Set<string>();
  for (const m of landmarksBetween(5, 0, 3e6)) {
    if (seen.has(m.kind)) continue;
    const views = spotsBetween(5, m.at - 40, m.at);
    assert.ok(views.some((s) => s.kind === 'view' && s.what === m.kind), m.kind);
    seen.add(m.kind);
  }
  assert.equal(seen.size, LANDMARK_KINDS.length);
});

test('a landmark he passes is logged by its name', () => {
  const names = new Set(Object.values(MARK_NAMES));
  for (const n of names) assert.match(n, /^the [a-z ]+$/);
  const j = newJourney('heath-1234', 0, 0.5);
  catchUp(j, 40_000_000, 1800);
  const passed = j.life.log.filter((e) => e.kind === 'landmark');
  assert.ok(passed.length > 3, `${passed.length} landmarks`);
  for (const e of passed) assert.ok(names.has(e.name), e.name);
});
