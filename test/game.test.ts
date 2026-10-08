import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, BIOMES, Water } from '../src/config.ts';
import { Game, benchIntent, cleanName, parseOptions, seedFrom } from '../src/game.ts';

const idle = { dx: 0, dy: 0, run: false, fastTime: false };

test('parseOptions reads seed, bench, size, frames and name', () => {
  assert.deepEqual(parseOptions(['--seed', '42', '--bench', '--size', '80x24', '--frames', '30', '--name', 'Senje']), {
    seed: 42,
    bench: true,
    cols: 80,
    rows: 24,
    frames: 30,
    name: 'Senje',
  });
});

test('parseOptions has defaults and rejects bad input', () => {
  assert.deepEqual(parseOptions([]), { seed: null, bench: false, cols: 200, rows: 60, frames: 600, name: null });
  assert.throws(() => parseOptions(['--size', 'big']), /--size must look like 200x60/);
  assert.throws(() => parseOptions(['--frames', '0']), /--frames must be a positive whole number/);
  assert.throws(() => parseOptions(['--nope']));
});

test('a text seed is hashed to a stable number', () => {
  assert.equal(seedFrom('7'), 7);
  assert.equal(seedFrom('hello'), seedFrom('hello'));
  assert.notEqual(seedFrom('hello'), seedFrom('world'));
});

test('you start on land', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const game = new Game(seed, 80, 24);
    const here = game.world.biomeAt(Math.floor(game.player.x), Math.floor(game.player.y / ASPECT));
    assert.equal(BIOMES[here].water, Water.None, `seed ${seed}`);
  }
});

test('walking east moves you east', () => {
  const game = new Game(3, 80, 24);
  const x0 = game.player.x;
  for (let i = 0; i < 60; i++) game.update({ ...idle, dx: 1 }, 1 / 60);
  assert.ok(game.player.x > x0 + 3);
});

test('the first draw is a full redraw and the next is much smaller', () => {
  const game = new Game(3, 80, 24, { startHour: 12, forceFront: 0 });
  game.prefetch(Infinity);
  const first = game.draw();
  assert.ok(first.startsWith('\x1b[2J'));
  game.update(idle, 1 / 60);
  const second = game.draw();
  assert.ok(second.length < first.length / 2, `${second.length} vs ${first.length}`);
});

test('resizing and toggling the status bar redraw correctly', () => {
  const game = new Game(3, 80, 24);
  game.draw();
  game.resize(100, 30);
  assert.ok(game.draw().startsWith('\x1b[2J'));
  game.toggleHud();
  assert.equal(game.showHud, false);
  assert.ok(game.draw().length > 0);
});

test('the bench walk has five two-second legs, some running', () => {
  assert.deepEqual(benchIntent(0), { dx: 1, dy: 0, run: false, fastTime: false });
  assert.deepEqual(benchIntent(120), { dx: 1, dy: 1, run: true, fastTime: false });
  assert.deepEqual(benchIntent(600), benchIntent(0));
});

test('each update records your position in the trail', () => {
  const game = new Game(3, 80, 24);
  assert.equal(game.trail.bounds(0), null);
  for (let i = 0; i < 12; i++) game.update({ ...idle, dx: 1 }, 1 / 60);
  assert.notEqual(game.trail.bounds(game.atm.realTime), null);
});

test('your name is cleaned: trimmed, control characters removed, cut to 16, never empty', () => {
  assert.equal(cleanName('  Elowen  '), 'Elowen');
  assert.equal(cleanName('a\x1bb\x07c\x7fd'), 'abcd');
  assert.equal(cleanName('abcdefghijklmnopqrstuvwxyz'), 'abcdefghijklmnop');
  assert.equal(cleanName('   '), 'you');
  assert.equal(cleanName('\x1b[31m'), '[31m');
  assert.equal(new Game(3, 80, 24, { name: ' Senje ' }).name, 'Senje');
  assert.equal(new Game(3, 80, 24).name, 'you');
});

test('names keep one column per character and carry no hidden characters', () => {
  assert.equal(cleanName('\u009b31mX'), '31mX', 'an 8-bit escape introducer is stripped');
  assert.equal(cleanName('a​b'), 'ab', 'a zero-width space is stripped');
  assert.equal(cleanName('‮abc'), 'abc', 'a bidi override is stripped');
  assert.equal(cleanName('é'), 'é', 'a combining accent composes into one character');
  assert.equal(cleanName('田中'), 'you', 'double-width characters are dropped');
  assert.equal(cleanName('Zoë😀'), 'Zoë', 'emoji are dropped');
});
