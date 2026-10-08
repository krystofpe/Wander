import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, parseOptions, seedFrom, todayAt } from '../src/game.ts';
import { newLife } from '../src/creature.ts';
import type { Life } from '../src/creature.ts';
import { Mind } from '../src/mind.ts';
import type { ApiMessage } from '../src/mind.ts';
import { rng } from '../src/noise.ts';
import { weatherAt } from '../src/sky.ts';
import type { InputEvent } from '../src/input.ts';

function dryAt(hour: number, seed: number): number {
  let t = new Date(2026, 9, 8, hour).getTime();
  while (weatherAt(t, seed, 'meadow').precip > 0 || weatherAt(t + 3600000, seed, 'meadow').precip > 0) t += 86400000;
  return t;
}

function game(options: { hour?: number; first?: boolean; mind?: Mind; tweak?: (life: Life) => void } = {}): Game {
  const now = dryAt(options.hour ?? 14, 3);
  const life = newLife(3, now - (options.first === true ? 0 : 86400000), { biome: 'meadow' });
  if (options.first !== true) life.userName = 'Tester';
  options.tweak?.(life);
  return new Game(life, { cols: 120, rows: 40, now, random: rng(3), mind: options.mind ?? null, login: 'krystofpe', firstMeeting: options.first, away: null });
}

const run = (g: Game, seconds: number): void => {
  for (let i = 0; i < seconds * 30; i++) g.update(1 / 30);
};
const type = (g: Game, text: string): void => {
  for (const ch of text) g.handle({ type: 'char', ch });
};
const key = (g: Game, k: Extract<InputEvent, { type: 'key' }>['key']): void => g.handle({ type: 'key', key: k });
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

test('options: defaults, and clear refusals', () => {
  assert.deepEqual(parseOptions([]), {
    seed: null, biome: null, name: null, speed: 1, hour: null, offline: false, save: null, fresh: false, bell: false, bench: false, cols: 160, rows: 48, frames: 300,
  });
  const o = parseOptions(['--biome', 'Shore', '--name', 'ulo', '--speed', '60', '--hour', '21.5', '--offline', '--new', '--seed', 'hello']);
  assert.equal(o.biome, 'shore');
  assert.equal(o.name, 'Ulo');
  assert.equal(o.speed, 60);
  assert.equal(o.hour, 21.5);
  assert.equal(o.seed, seedFrom('hello'));
  assert.throws(() => parseOptions(['--biome', 'moon']), /--biome must be one of/);
  assert.throws(() => parseOptions(['--speed', '0']), /--speed/);
  assert.throws(() => parseOptions(['--hour', '25']), /--hour/);
  assert.throws(() => parseOptions(['--size', 'big']), /--size must look like 160x48/);
  assert.throws(() => parseOptions(['--nope']));
  assert.equal(new Date(todayAt(21.5)).getHours(), 21);
});

test('the first meeting: it appears, asks your name, and remembers it', () => {
  const g = game({ first: true });
  assert.equal(g.body.visible, false);
  let asked = false;
  for (let i = 0; i < 30 * 20 && !asked; i++) {
    g.update(1 / 30);
    asked = g.mode === 'name';
  }
  assert.ok(asked);
  assert.equal(g.body.visible, true);
  type(g, 'Kryštof');
  key(g, 'enter');
  assert.equal(g.life.userName, 'Kryštof');
  assert.equal(g.mode, 'live');
  assert.ok(g.life.diary.some((e) => e.text === 'Met Kryštof.'));
  assert.match(g.view().bubble?.text ?? '', /Kryštof/);
});

test('skipping your name, it uses your login', () => {
  const g = game({ first: true });
  run(g, 20);
  key(g, 'escape');
  assert.equal(g.life.userName, 'Krystofpe');
  assert.equal(g.quitRequested, false, 'Esc while typing cancels, it does not quit');
});

test('talking to it without Claude gets a local answer', () => {
  const g = game();
  run(g, 3);
  g.handle({ type: 'char', ch: 't' });
  assert.equal(g.mode, 'talk');
  type(g, 'hello');
  assert.equal(g.view().hud?.[1].map((s) => s.text).join(''), ' you › hello▏   Enter send · Esc cancel');
  key(g, 'enter');
  assert.equal(g.mode, 'live');
  assert.match(g.view().bubble?.text ?? '', /Hello|Hi|hello/);
  assert.equal(g.life.stats.talks, 1);
});

test('talking to Claude: its words, a name to remember, and something to do', async () => {
  const answer: ApiMessage = { content: [{ type: 'text', text: JSON.stringify({ say: 'Ahoj, Kryštofe!', do: 'dance', remember: 'name: Kryštof' }) }], stop_reason: 'end_turn' };
  const mind = new Mind({ create: async () => answer }, () => false);
  const g = game({ mind });
  run(g, 3);
  g.startTalk();
  type(g, 'ahoj, jsem Kryštof');
  key(g, 'enter');
  assert.equal(g.view().bubble?.kind, 'think');
  await flush();
  assert.equal(g.view().bubble?.text, 'Ahoj, Kryštofe!');
  assert.equal(g.life.userName, 'Kryštof');
  let danced = false;
  for (let i = 0; i < 30 * 30 && !danced; i++) {
    g.update(1 / 30);
    danced = g.brain.current === 'dance';
  }
  assert.ok(danced);
});

test('when Claude fails, the local voice answers', async () => {
  const mind = new Mind({ create: async () => Promise.reject(new Error('down')) }, () => false);
  const g = game({ mind });
  run(g, 3);
  g.startTalk();
  type(g, 'hello');
  key(g, 'enter');
  await flush();
  assert.match(g.view().bubble?.text ?? '', /Hello|Hi|hello/);
});

test('questions are answered with Y or N and remembered', () => {
  const g = game();
  assert.equal(g.ask(), true);
  assert.match(g.view().bubble?.text ?? '', /\(y\/n\)$/);
  g.handle({ type: 'char', ch: 'y' });
  assert.equal(g.questionState(), 'answered');
  assert.equal(g.life.facts.length, 1);
});

test('a gift is taken with E', () => {
  const g = game({ tweak: (life) => life.found.push('a pearl') });
  g.offer('a pearl');
  assert.equal(g.view().hud?.[1][0].text, ' E take it');
  g.handle({ type: 'char', ch: 'e' });
  assert.equal(g.offerState(), 'taken');
  assert.deepEqual(g.life.shelf.map((s) => s.item), ['a pearl']);
  assert.deepEqual(g.life.found, []);
});

test('clicking it pets it; its eyes follow the mouse', () => {
  const g = game();
  run(g, 1);
  g.brain.run('idle');
  const col = g.geo.col(g.body.x);
  const foot = g.geo.footRow(g.body.z);
  g.handle({ type: 'mouse', col: col + 20, row: foot - 2, button: 3, action: 'move' });
  assert.equal(g.eyes(), ' ••');
  g.handle({ type: 'mouse', col, row: foot - 1, button: 0, action: 'press' });
  assert.equal(g.life.stats.petted, 1);
  assert.equal(g.brain.current, 'petted');
});

test('at night it is home asleep, and E may wake it', () => {
  const g = game({ hour: 23, tweak: (life) => ((life.asleep = true), (life.traits.nightOwl = 0)) });
  assert.equal(g.body.inside, true);
  assert.equal(g.eyes(), '- -');
  g.pet();
  assert.equal(g.brain.current, 'woken');
});

test('a creature that went wandering walks back in', () => {
  const g = game({ tweak: (life) => (life.away = true) });
  assert.equal(g.life.away, false);
  run(g, 1);
  assert.equal(g.body.visible, false);
  run(g, 4);
  assert.equal(g.body.visible, true);
});

test('the journal opens with J and closes with any key; H hides the bars', () => {
  const g = game();
  g.handle({ type: 'char', ch: 'j' });
  assert.equal(g.mode, 'journal');
  assert.match(g.view().journal?.[0] ?? '', /of the meadow/);
  g.handle({ type: 'key', key: 'escape' });
  assert.equal(g.mode, 'live');
  assert.equal(g.quitRequested, false);
  g.handle({ type: 'char', ch: 'h' });
  g.update(1 / 30);
  assert.equal(g.view().hud, null);
  assert.equal(g.geo.rows, 40);
  g.handle({ type: 'char', ch: 'q' });
  assert.equal(g.quitRequested, true);
});

test('coming back to the window after a while, it greets you', () => {
  const g = game();
  run(g, 10);
  g.handle({ type: 'focus', on: false });
  run(g, 200);
  g.brain.run('idle');
  g.handle({ type: 'focus', on: true });
  assert.equal(g.brain.current, 'greet');
});

test('the first draw is a full redraw and the next is much smaller; a resize redraws', () => {
  const g = game();
  const first = g.draw();
  assert.ok(first.startsWith('\x1b[2J'));
  g.update(1 / 30);
  assert.ok(g.draw().length < first.length / 2);
  g.resize(100, 30);
  assert.ok(g.draw().startsWith('\x1b[2J'));
});
