import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, BIOME_NAMES, VISITOR } from '../src/creature/config.ts';
import { Game } from '../src/creature/game.ts';
import { newLife } from '../src/creature/life.ts';
import { Geometry } from '../src/creature/scene.ts';
import { visitAt } from '../src/creature/visitor.ts';
import { rng } from '../src/noise.ts';

const night = new Date(2026, 9, 8, 21).getTime();

/** The first moment from `from` on when the visitor starts to cross, for a seed. */
function nextVisit(from: number, seed: number): number {
  for (let ms = from; ms < from + 6 * 3600000; ms += 1000) {
    const v = visitAt(ms, seed, 'forest', 0);
    if (v !== null && v.progress < 0.01) return ms;
  }
  throw new Error('no visit in six hours');
}

test('the visitor comes only in the dark, only under the canopy, and crosses in its time', () => {
  const start = nextVisit(night, 4);
  assert.deepEqual(visitAt(start + 30000, 4, 'forest', 0), visitAt(start + 30000, 4, 'forest', 0), 'the same for the same time');
  assert.ok(visitAt(start + 30000, 4, 'forest', 0.9) === null, 'never by day');
  for (const biome of BIOME_NAMES) {
    if (!BIOMES[biome].canopy) assert.ok(visitAt(start + 30000, 4, biome, 0) === null, `never outside the woods (${biome})`);
  }
  const mid = visitAt(start + (VISITOR.crossSec * 1000) / 2, 4, 'forest', 0);
  assert.ok(mid !== null && Math.abs(mid.progress - 0.5) < 0.02);
  assert.equal(visitAt(start + VISITOR.crossSec * 1000 + 1000, 4, 'forest', 0), null, 'and is gone');
  // Over a long night it comes more than once, but not all the time.
  let crossing = 0;
  for (let ms = night; ms < night + 8 * 3600000; ms += 10000) if (visitAt(ms, 4, 'forest', 0) !== null) crossing++;
  const share = crossing / (8 * 360);
  assert.ok(share > 0.02 && share < 0.12, `crossing ${(share * 100).toFixed(1)}% of the night`);
});

test('awake when it comes, it stops to watch it go, and remembers it', () => {
  const seed = 7;
  const start = nextVisit(night, seed);
  const life = newLife(seed, start - 86400000, { biome: 'forest' });
  life.userName = 'Tester';
  // A night owl, so it is still up.
  life.traits.nightOwl = 1;
  life.needs.rest = 1;
  const g = new Game(life, { geo: new Geometry(640), now: start - 2000, random: rng(seed), mind: null, login: 'krystofpe', away: null });
  let watched = false;
  for (let i = 0; i < (VISITOR.crossSec + 40) * 30; i++) {
    g.update(1 / 30);
    watched ||= g.brain.current === 'watch';
  }
  assert.ok(watched, 'it stopped to watch');
  assert.ok(life.diary.some((e) => /Something tall walked through the light/.test(e.text)), life.diary.map((e) => e.text).join(' | '));
});
