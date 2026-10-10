import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARK_KINDS } from '../src/biomes.ts';
import { LAYERS, PX_PER_M } from '../src/layers.ts';
import { groundAt, newLife } from '../src/life.ts';
import { BRIDGE, MARK_ON, markStamp, marksOn } from '../src/paint/landmarks.ts';
import { namedWeather } from '../src/sky.ts';
import { groundHeight, landmarksBetween } from '../src/world.ts';

const clear = namedWeather('clear');
if (clear === null) throw new Error('no clear weather');

test('every landmark kind has a layer, and a stamp unless it is painted in place', () => {
  for (const kind of LANDMARK_KINDS) {
    const layer = LAYERS.find((l) => l.name === MARK_ON[kind]);
    assert.ok(layer, kind);
    const s = markStamp({ cell: 3, at: 2000, kind }, layer.z);
    if (kind === 'bridge' || kind === 'train') assert.equal(s, null);
    else assert.ok(s !== null && s.w > 0 && s.h > 0 && s.roles.some((r) => r !== 0), kind);
  }
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

test('the bridge is level from bank to bank, and its deck sounds of wood', () => {
  for (let seed = 1; seed < 400; seed++) {
    const bridge = landmarksBetween(seed, 0, 50000).find((m) => m.kind === 'bridge');
    if (bridge === undefined) continue;
    for (let d = bridge.at - BRIDGE.half - 2; d <= bridge.at + BRIDGE.half + 2; d += 0.5) assert.equal(groundHeight(seed, d), 0);
    const l = newLife(seed, bridge.at);
    assert.equal(groundAt(l, clear), 'wood');
    return;
  }
  assert.fail('no bridge found');
});
