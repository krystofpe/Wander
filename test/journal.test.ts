import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AWAY, catchUp, newJourney, reviveJourney, roadWord } from '../src/journal.ts';
import { stepLife } from '../src/life.ts';
import type { Env, LifeEvent } from '../src/life.ts';
import { hourOfDay } from '../src/sky.ts';
import { JourneyStore, defaultJourneyPath } from '../server/journey.ts';

const env: Env = { hourAt: (c) => hourOfDay(c), natural: false, weather: null };
const DAY = 3600;

test('a journey saves and loads back the same, through the file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wander-'));
  const store = new JourneyStore(join(dir, 'journey.json'));
  assert.equal(store.load(), null);
  const j = newJourney('tarn-4821', 1_000_000, 0.3, 9);
  const events: LifeEvent[] = [];
  for (let t = 0; t < 600; t += 0.5) stepLife(j.life, 0.5, DAY, env, events);
  store.save(JSON.parse(JSON.stringify(j)));
  assert.deepEqual(store.load(), j);
});

test('closing and reopening continues the same road exactly', () => {
  const j = newJourney('moss-1234', 0, 0.5, 14);
  const events: LifeEvent[] = [];
  for (let t = 0; t < 900; t += 0.5) stepLife(j.life, 0.5, DAY, env, events);
  const back = reviveJourney(JSON.parse(JSON.stringify(j)));
  for (let t = 0; t < 900; t += 0.5) {
    stepLife(j.life, 0.5, DAY, env, events);
    stepLife(back.life, 0.5, DAY, env, events);
  }
  assert.deepEqual(back, j);
});

test('time away moves him on: the clock, the distance and the log', () => {
  const j = newJourney('ash-2000', 0, 0.5, 10);
  j.life.at = 500;
  const clock = j.life.clock;
  const away = catchUp(j, 3 * 3600_000, DAY);
  assert.equal(Math.round(away.metres), Math.round(Math.min(AWAY.capMetres, 3 * 3600 * AWAY.pace)));
  assert.ok(j.life.at > 500 + 6000);
  assert.ok(Math.abs(j.life.clock - (clock + 72)) < 1e-6, 'three hours at an hour a day is three days');
  assert.ok(away.places > 0 && j.life.log.length === away.places, `${away.places} places logged`);
  assert.equal(j.life.stage, 'walk');
  assert.equal(j.savedAt, 3 * 3600_000);
});

test('a long absence is capped, a short one changes nothing', () => {
  const far = newJourney('ash-2000', 0, 0.5);
  catchUp(far, 30 * 86400_000, DAY);
  assert.equal(far.life.at, AWAY.capMetres);
  const near = newJourney('ash-2000', 0, 0.5);
  const a = catchUp(near, 30_000, DAY);
  assert.equal(a.metres, 0);
  assert.equal(near.life.at, 0);
});

test('a broken save is moved aside, not lost, and a new road keeps the old one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wander-'));
  const path = join(dir, 'journey.json');
  writeFileSync(path, '{"version": 1, "creature": true}');
  const store = new JourneyStore(path);
  assert.equal(store.load(), null);
  assert.ok(existsSync(`${path}.broken`));
  store.save(newJourney('fern-1000', 0, 0.5));
  store.fresh();
  assert.ok(existsSync(`${path}.bak`));
  assert.equal(JSON.parse(readFileSync(`${path}.bak`, 'utf8')).word, 'fern-1000');
  assert.throws(() => store.save({ nope: 1 }), /not a Wander journey/);
});

test('the save lives under the XDG data directory, and road words read as words', () => {
  assert.equal(defaultJourneyPath({ XDG_DATA_HOME: '/data' }), '/data/wander/journey.json');
  assert.match(roadWord(0.37), /^[a-z]+-\d{4}$/);
});
