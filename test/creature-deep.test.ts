import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_BIOMES } from '../src/biomes.ts';
import { BIOMES } from '../src/creature/config.ts';
import { Game } from '../src/creature/game.ts';
import { newLife } from '../src/creature/life.ts';
import { Geometry } from '../src/creature/scene.ts';
import { skyAt } from '../src/creature/sky.ts';
import { rng } from '../src/noise.ts';
import { bigCap, crystals, glowCaps, stalagmite } from '../src/paint/deep.ts';
import { DAYLIGHT, gradeOf, newGrade, newMoment, role } from '../src/palette.ts';
import { biomeAt, isRealm, landmarksBetween, realm, stretchAt } from '../src/world.ts';

test('a realm is one place all the way along, with no landmarks; a road never is', () => {
  const deep = realm(7);
  assert.equal(realm(7), deep, 'the same realm for the same seed');
  assert.ok(isRealm(deep) && !isRealm(7));
  for (let d = 0; d < 200000; d += 997) {
    assert.equal(stretchAt(deep, d).biome, 'deep');
    const b = biomeAt(deep, d);
    assert.ok(b.a === 'deep' && b.b === 'deep');
  }
  assert.equal(landmarksBetween(deep, 0, 200000).length, 0);
  assert.ok(!ROAD_BIOMES.includes('deep'));
  for (const seed of [1, 2, 3, 99]) for (let d = 0; d < 400000; d += 1500) assert.notEqual(stretchAt(seed, d).biome, 'deep');
});

test('the deep has its colours, teal by day and violet by night under a sky of stone', () => {
  assert.ok(DAYLIGHT.deep.length > 0);
  const day = newMoment();
  day.elevation = 40;
  const night = newMoment();
  night.elevation = -30;
  const d = gradeOf(day, newGrade(), true);
  const n = gradeOf(night, newGrade(), true);
  // Oklab: the roof near black either way; the mist teal (a < 0) by day and toward violet (b < 0, a lifted) at night.
  assert.ok(d.zenith[0] < 0.2 && n.zenith[0] < 0.2, 'a roof of stone overhead');
  assert.ok(d.fog[1] < 0 && d.fog[2] < 0.02, 'teal mist by day');
  assert.ok(n.fog[2] < -0.05 && n.fog[1] > d.fog[1], 'indigo mist at night');
  // No weather but the mist: rain and storm leave the deep's grade alone.
  const wet = newMoment();
  wet.elevation = 40;
  wet.precip = 1;
  wet.storm = true;
  assert.equal(gradeOf(wet, newGrade(), true).gain, d.gain);
});

test('its giant mushrooms glow underneath and trail threads; stalagmites point; crystal and small caps glow', () => {
  const glow = new Set([role('shroom', 0), role('shroom', 1), role('shroom', 2)]);
  const cap = bigCap(3, 120);
  assert.deepEqual(bigCap(3, 120), cap, 'the same for the same seed');
  const lit = [...cap.roles].filter((r) => glow.has(r)).length;
  assert.ok(lit > 30 && lit < cap.roles.length * 0.25, `glowing, not all glow: ${lit} of ${cap.roles.length}`);
  // Threads hang below the cap: glowing pixels well under its rim.
  let deepest = 0;
  for (let y = 0; y < cap.h; y++) for (let x = 0; x < cap.w; x++) if (glow.has(cap.roles[y * cap.w + x])) deepest = Math.max(deepest, y);
  assert.ok(deepest > cap.h * 0.45, 'threads of light hanging from the rim');
  const s = stalagmite(5, 40);
  const top = [...s.roles.slice(0, s.w)].filter((r) => r !== 0).length;
  const foot = [...s.roles.slice((s.h - 1) * s.w)].filter((r) => r !== 0).length;
  assert.ok(top <= 2 && foot > top, 'pointed at the top, wide at the foot');
  assert.ok([...crystals(2, 10).roles].some((r) => glow.has(r)));
  assert.ok([...glowCaps(2, 7).roles].some((r) => glow.has(r)));
});

test('set in the deep: no rain, its own small lives, and his visits seen at its door', () => {
  assert.equal(BIOMES.deep.rain, 0);
  for (let t = Date.UTC(2026, 9, 10); t < Date.UTC(2026, 10, 10); t += 3 * 3600000) assert.equal(skyAt(t, 11, 'deep').weather.precip, 0);
  for (const k of [...BIOMES.deep.dayCritters, ...BIOMES.deep.nightCritters]) assert.ok(['moth', 'bat', 'frog', 'firefly'].includes(k), k);
  const now = new Date(2026, 9, 10, 14).getTime();
  const life = newLife(12, now - 86400000, { biome: 'meadow' });
  const g = new Game(life, { geo: new Geometry(640), now, random: rng(4), mind: null, login: 'k', firstMeeting: false, away: null, place: 'deep' });
  assert.equal(g.place, 'deep');
  assert.ok(g.scene.layout.home.edge !== undefined, 'it lives in the great tree down there, whatever its land above');
  assert.equal(g.traveller(), null);
  g.passer = { d: -20, sitting: false, walking: true, dir: 1 };
  const door = g.geo.door(g.scene.layout.home).x;
  const far = g.traveller();
  g.passer = { d: 3.5, sitting: true, walking: false, dir: 1 };
  const sat = g.traveller();
  assert.ok(far !== null && Math.abs(far.x - door) < 0.05, 'beyond its door: it watches the doorway');
  assert.ok(sat !== null && sat.sitting && Math.abs(sat.x - door) < 0.05 && sat.x !== door, 'sitting, he has come down to sit on the root beside it');
});
