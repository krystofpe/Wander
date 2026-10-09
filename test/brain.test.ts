import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { newLife } from '../src/creature.ts';
import type { Life } from '../src/creature.ts';
import { rng } from '../src/noise.ts';
import { weatherAt } from '../src/sky.ts';

/** A dry hour on 8 October 2026 at or after `hour`, for a meadow creature with this seed. */
function dryAt(hour: number, seed: number): number {
  let t = new Date(2026, 9, 8, hour).getTime();
  while (weatherAt(t, seed, 'meadow').precip > 0 || weatherAt(t + 3600000, seed, 'meadow').precip > 0) t += 86400000;
  return t;
}

function game(hour: number, tweak: (life: Life) => void = () => {}, seed = 3): Game {
  const now = dryAt(hour, seed);
  const life = newLife(seed, now - 86400000, { biome: 'meadow' });
  life.userName = 'Tester';
  life.needs = { food: 0.8, rest: 0.8, fun: 0.7, love: 0.8 };
  tweak(life);
  return new Game(life, { cols: 120, rows: 40, now, random: rng(seed), away: { ms: 0, wandered: false, events: 0 } });
}

function run(g: Game, seconds: number, each: (g: Game) => void = () => {}): void {
  for (let i = 0; i < seconds * 30; i++) {
    g.update(1 / 30);
    each(g);
  }
}

test('left alone, it keeps busy with many different things', () => {
  const g = game(14);
  const seen = new Set<string>();
  run(g, 900, (x) => seen.add(x.brain.current ?? ''));
  assert.ok(seen.size >= 6, [...seen].join(', '));
});

test('a hungry creature feeds itself', () => {
  const g = game(14, (life) => (life.needs.food = 0.1));
  run(g, 120);
  assert.ok(g.life.needs.food > 0.3, String(g.life.needs.food));
});

test('dropped food is eaten when it is hungry, and left when it is full', () => {
  const hungry = game(14, (life) => (life.needs.food = 0.3));
  hungry.feed();
  run(hungry, 40);
  assert.equal(hungry.life.stats.fed, 1);
  assert.equal(hungry.scene.foods.length, 0);
  const full = game(14, (life) => (life.needs.food = 1));
  full.feed();
  run(full, 40);
  assert.equal(full.life.stats.fed, 0);
  assert.equal(full.scene.foods.length, 1);
});

test('at bedtime it goes home to sleep', () => {
  const g = game(22, (life) => (life.traits.nightOwl = 0));
  run(g, 120);
  assert.equal(g.life.asleep, true);
  assert.equal(g.body.inside, true);
  assert.equal(g.eyes(), '- -');
});

test('a thrown toy gets chased', () => {
  const g = game(14, (life) => {
    life.traits.playful = 1;
    life.needs.fun = 0.2;
    life.needs.rest = 1;
  });
  g.play();
  run(g, 25);
  assert.ok(g.life.stats.played >= 1);
  assert.ok(g.life.needs.fun > 0.2);
});

test('a request runs once the current activity ends', () => {
  const g = game(14);
  g.brain.run('jump');
  g.brain.later('hum');
  let hummed = false;
  run(g, 20, (x) => (hummed ||= x.brain.current === 'hum'));
  assert.ok(hummed);
});

test('what cannot happen scores zero', () => {
  const g = game(14);
  const score = new Map(g.brain.scores());
  assert.equal(score.get('chase'), 0, 'no toy');
  assert.equal(score.get('stargaze'), 0, 'daytime');
  assert.equal(score.get('gift'), 0, 'nothing found');
  assert.equal(score.get('eat'), 0, 'no food');
  assert.equal(score.get('sleep'), 0, 'not bedtime, not tired');
});

test('petting too often annoys it', () => {
  const g = game(14);
  for (let i = 0; i < 7; i++) {
    g.pet();
    run(g, 0.2);
  }
  assert.ok(g.feelings.annoyance > 0.5);
  assert.equal(g.mood, 'grumpy');
});

test('different seeds live different days', () => {
  const day = (seed: number): string => {
    const g = game(14, () => {}, seed);
    const log: string[] = [];
    run(g, 300, (x) => {
      if (log.at(-1) !== x.brain.current) log.push(x.brain.current ?? '');
    });
    return log.join(' ');
  };
  assert.equal(day(5), day(5));
  assert.notEqual(day(5), day(6));
});

test('it steps through its doorway into the dark, and out again a few steps from the door', () => {
  const g = game(14, (life) => (life.needs.rest = 0.05));
  g.brain.run('sleep');
  const fades: number[] = [];
  run(g, 60, (x) => x.body.doorway > 0 && fades.push(x.body.doorway));
  assert.equal(g.body.inside, true);
  assert.equal(g.body.doorway, 0, 'once inside, only its eyes show');
  assert.ok(fades.length > 5 && fades.every((k, i) => i === 0 || k >= fades[i - 1]), 'it fades in steps, deeper each frame');
  const home = g.scene.layout.home;
  g.life.needs.rest = 1;
  const out: number[] = [];
  run(g, 30, (x) => !x.body.inside && x.body.doorway > 0 && out.push(x.body.doorway));
  assert.equal(g.body.inside, false);
  assert.ok(out.length > 5 && out[out.length - 1] < out[0], 'it comes out of the dark');
  assert.ok(g.body.z > home.z + 0.05, 'and walks a few steps from the door');
});
