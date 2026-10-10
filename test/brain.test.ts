import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTS, choose, freshMemory } from '../src/brain.ts';
import type { Situation, Spot } from '../src/brain.ts';
import { rng } from '../src/noise.ts';

const seat: Spot = { kind: 'seat', at: 120, what: 'rock', quality: 0.7 };
const view: Spot = { kind: 'view', at: 110, what: 'hilltop', quality: 0.8 };
const shelter: Spot = { kind: 'shelter', at: 130, what: 'pine', quality: 0.7 };
const camp: Spot = { kind: 'camp', at: 140, what: 'clearing', quality: 0.7 };

const day: Situation = {
  hour: 11,
  sunElevation: 45,
  precip: 0,
  storm: false,
  snow: false,
  at: 100,
  walking: 60,
  since: freshMemory(600),
  spots: [],
  slept: false,
  nightOwl: 0.2,
};

const tally = (s: Situation, n = 600, seed = 1): Record<string, number> => {
  const random = rng(seed);
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const c = choose(s, random);
    out[c.act] = (out[c.act] ?? 0) + 1;
  }
  return out;
};

test('with nowhere to stop and fresh legs he walks on', () => {
  const t = tally(day);
  assert.ok((t.walk ?? 0) > 500, JSON.stringify(t));
});

test('the same situation and random numbers give the same choice', () => {
  const s = { ...day, spots: [seat, view], walking: 800 };
  assert.deepEqual(choose(s, rng(4)), choose(s, rng(4)));
});

test('after a long walk, a seat ahead is hard to pass by', () => {
  const t = tally({ ...day, walking: 900, spots: [seat] });
  assert.ok((t.sit ?? 0) > 330, JSON.stringify(t));
});

test('he only sits where there is something to sit on', () => {
  const t = tally({ ...day, walking: 1500, since: freshMemory(5000), spots: [view, camp] });
  assert.equal(t.sit ?? 0, 0, JSON.stringify(t));
});

test('a choice to stop names the spot it stops at, one that is ahead of him', () => {
  const random = rng(8);
  for (let i = 0; i < 300; i++) {
    const c = choose({ ...day, walking: 1200, since: freshMemory(4000), spots: [seat, view, shelter] }, random);
    if (c.act === 'sit' || c.act === 'look') {
      assert.ok(c.spot !== null && c.spot.at >= 100, JSON.stringify(c));
      assert.equal(c.spot.kind, c.act === 'sit' ? 'seat' : 'view');
    }
  }
});

test('he does not sit again straight after sitting', () => {
  const since = { ...freshMemory(4000), sit: 30 };
  const t = tally({ ...day, walking: 1500, since, spots: [seat] });
  assert.equal(t.sit ?? 0, 0, JSON.stringify(t));
});

test('a view at golden hour draws him more than at noon', () => {
  const noon = tally({ ...day, spots: [view] });
  const golden = tally({ ...day, hour: 17.5, sunElevation: 4, spots: [view] });
  assert.ok((golden.look ?? 0) > (noon.look ?? 0) + 40, `${JSON.stringify(noon)} ${JSON.stringify(golden)}`);
});

test('in heavy rain he waits it out under shelter when there is one', () => {
  const t = tally({ ...day, precip: 0.85, spots: [shelter, seat] });
  assert.ok((t.shelter ?? 0) > 450, JSON.stringify(t));
  const c = choose({ ...day, precip: 0.85, spots: [shelter] }, rng(2));
  if (c.act === 'shelter') assert.equal(c.until, 'rain eases');
});

test('at dusk he makes camp where he can, and stays until dawn', () => {
  const dusk = { ...day, hour: 19.4, sunElevation: -7, nightOwl: 0.1, spots: [camp, seat] };
  const t = tally(dusk);
  assert.ok((t.camp ?? 0) > 420, JSON.stringify(t));
  const c = choose({ ...dusk, nightOwl: 0 }, rng(5));
  assert.equal(c.act, 'camp');
  assert.equal(c.until, 'dawn');
  assert.equal(c.spot?.kind, 'camp');
});

test('a night owl walks on into the dark before he camps', () => {
  const early = tally({ ...day, hour: 19.4, sunElevation: -7, nightOwl: 0.9, spots: [camp] });
  assert.equal(early.camp ?? 0, 0, JSON.stringify(early));
  const late = tally({ ...day, hour: 21.8, sunElevation: -31, nightOwl: 0.9, spots: [camp] });
  assert.ok((late.camp ?? 0) > 500, JSON.stringify(late));
});

test('with no place to camp he keeps walking into the night', () => {
  const t = tally({ ...day, hour: 21, sunElevation: -25, spots: [seat] });
  assert.equal(t.camp ?? 0, 0);
  assert.ok((t.walk ?? 0) + (t.sit ?? 0) + (t.smoke ?? 0) === 600);
});

test('once he has slept, the night does not make him camp again', () => {
  const t = tally({ ...day, hour: 5, sunElevation: -10, slept: true, spots: [camp] });
  assert.equal(t.camp ?? 0, 0, JSON.stringify(t));
});

test('every act is reachable and every choice has a sensible length', () => {
  const seen = new Set<string>();
  const random = rng(17);
  const situations: Situation[] = [
    { ...day, walking: 1200, since: freshMemory(4000), spots: [seat, view] },
    { ...day, precip: 0.9, spots: [shelter] },
    { ...day, hour: 19.5, sunElevation: -8, spots: [camp] },
    { ...day, walking: 2000, since: freshMemory(4000), spots: [] },
  ];
  for (const s of situations)
    for (let i = 0; i < 400; i++) {
      const c = choose(s, random);
      seen.add(c.act);
      assert.ok(c.seconds > 0 && c.seconds < 900, JSON.stringify(c));
    }
  for (const a of ACTS) assert.ok(seen.has(a), `never chose ${a}`);
});
