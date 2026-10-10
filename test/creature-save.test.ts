// The pure half of the save: reading a saved life back, and living through the time it was closed. The file itself
// (where it lives, writing it safely, keeping a .bak) belongs to the server and is tested there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_NAMES, CLOAKS } from '../src/creature/config.ts';
import { newLife } from '../src/creature/life.ts';
import { catchUp, revive } from '../src/creature/save.ts';
import { rng } from '../src/noise.ts';

const at = (d: number, h: number): number => new Date(2026, 9, d, h).getTime();

test('a life read back is the life saved', () => {
  const life = newLife(8, at(8, 12));
  life.userName = 'Kryštof';
  life.facts.push('likes tea');
  life.shelf.push({ t: 5, item: 'a pearl' });
  life.found.push('a jay feather');
  life.cairn = 3;
  assert.deepEqual(revive(JSON.parse(JSON.stringify(life))), life);
});

test('something that is not a save, or from another version, is refused with a way out', () => {
  assert.throws(() => revive(null), /--new/);
  assert.throws(() => revive('nope', 'creature.json'), /creature\.json is not a Wander save/);
  assert.throws(() => revive({ version: 9 }), /another version/);
});

test('missing fields are filled in, and bad values tamed', () => {
  const life = revive({ version: 1, seed: 3, name: 'Fen', needs: { food: 7 }, biome: 'moon', cairn: 99, diary: [{ t: 1, text: 'hi' }, { bad: true }] });
  assert.equal(life.name, 'Fen');
  assert.equal(life.needs.food, 1);
  assert.notEqual(life.biome, 'moon');
  assert.equal(life.cairn, 9);
  assert.deepEqual(life.diary, [{ t: 1, text: 'hi' }]);
  assert.deepEqual(life.found, []);
});

test('a cloak saved as a colour in the terminal days becomes its place among the six', () => {
  assert.equal(revive({ version: 1, seed: 3, cloak: 0x3a3470 }).cloak, 0);
  assert.equal(revive({ version: 1, seed: 3, cloak: 0x6a5a3a }).cloak, 5);
  assert.equal(revive({ version: 1, seed: 3, cloak: 4 }).cloak, 4);
  const base = newLife(3, 0).cloak;
  for (const odd of [0x123456, -1, 2.5, 'red', null]) {
    const cloak = revive({ version: 1, seed: 3, cloak: odd }).cloak;
    assert.equal(cloak, base, `an unknown cloak ${String(odd)} is the seed's own`);
    assert.ok(cloak >= 0 && cloak < CLOAKS);
  }
});

test('a creature from the shore or the desert, which are gone, moves and remembers it', () => {
  for (const gone of ['shore', 'desert']) {
    const life = revive({ version: 1, seed: 3, name: 'Fen', biome: gone, lastSeen: 50, diary: [] });
    assert.ok((BIOME_NAMES as readonly string[]).includes(life.biome), gone);
    assert.equal(life.diary.length, 1);
    assert.match(life.diary[0].text, new RegExp(`^Left the ${gone}, which is no more, for the ${life.biome}\\.$`));
  }
  assert.equal(revive({ version: 1, seed: 3, biome: 'moon' }).diary.length, 0, 'a biome that never was is no move');
});

test('a minute away changes nothing', () => {
  const life = newLife(2, at(8, 12));
  const before = JSON.stringify(life.needs);
  const away = catchUp(life, at(8, 12) + 30000, rng(1));
  assert.equal(JSON.stringify(life.needs), before);
  assert.equal(away.wandered, false);
});

test('a night away: it slept, so it is rested (then up for three hours), and hungrier', () => {
  const life = newLife(2, at(8, 22));
  life.traits.nightOwl = 0;
  life.needs = { food: 0.8, rest: 0.3, fun: 0.6, love: 0.8 };
  const away = catchUp(life, at(9, 9), rng(1));
  assert.ok(life.needs.rest > 0.75, String(life.needs.rest));
  assert.ok(life.needs.food < 0.8);
  assert.equal(life.asleep, false);
  assert.equal(life.lastSeen, at(9, 9));
  assert.equal(away.ms, at(9, 9) - at(8, 22));
});

test('days alone: it went wandering, the bond cooled, and the diary filled', () => {
  const life = newLife(2, at(1, 12));
  life.traits.curious = 1;
  life.bond = 0.6;
  const entries = life.diary.length;
  const away = catchUp(life, at(8, 12), rng(3));
  assert.equal(away.wandered, true);
  assert.equal(life.away, true);
  assert.ok(life.bond < 0.6);
  assert.ok(life.diary.length > entries);
  assert.equal(away.events, life.diary.length - entries);
  assert.ok(life.needs.food > 0.2, 'it fed itself');
});
