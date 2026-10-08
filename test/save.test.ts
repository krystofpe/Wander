import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newLife } from '../src/creature.ts';
import { rng } from '../src/noise.ts';
import { backUp, catchUp, defaultSavePath, loadLife, revive, saveLife } from '../src/save.ts';

const dir = (): string => mkdtempSync(join(tmpdir(), 'wander-save-'));
const at = (d: number, h: number): number => new Date(2026, 9, d, h).getTime();

test('the save lives under XDG_DATA_HOME, or ~/.local/share', () => {
  assert.equal(defaultSavePath({ XDG_DATA_HOME: '/data' }), '/data/wander/creature.json');
  assert.match(defaultSavePath({}), /\.local\/share\/wander\/creature\.json$/);
});

test('a life saved is the life loaded, and no temporary file is left', () => {
  const d = dir();
  const path = join(d, 'deep', 'creature.json');
  const life = newLife(8, at(8, 12));
  life.facts.push('likes tea');
  life.shelf.push({ t: 5, item: 'a pearl' });
  saveLife(path, life);
  assert.deepEqual(loadLife(path), life);
  assert.deepEqual(readdirSync(join(d, 'deep')), ['creature.json']);
  assert.equal(loadLife(join(d, 'missing.json')), null);
});

test('a broken or foreign file is refused with a way out', () => {
  const d = dir();
  const broken = join(d, 'broken.json');
  writeFileSync(broken, '{nope');
  assert.throws(() => loadLife(broken), /--new/);
  const other = join(d, 'other.json');
  writeFileSync(other, JSON.stringify({ version: 9 }));
  assert.throws(() => loadLife(other), /another version/);
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

test('--new keeps the old creature as .bak', () => {
  const d = dir();
  const path = join(d, 'creature.json');
  assert.equal(backUp(path), null);
  saveLife(path, newLife(1, 0));
  assert.equal(backUp(path), `${path}.bak`);
  assert.ok(!existsSync(path));
  assert.ok(existsSync(`${path}.bak`));
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
  assert.ok(life.needs.food > 0.2, 'it fed itself');
});
