import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, BIOMES, Water } from '../src/config.ts';
import { Game, benchIntent, cleanLabel, parseOptions, seedFrom } from '../src/game.ts';
import { World } from '../src/world.ts';
import { Projection } from '../src/geo.ts';

const idle = { dx: 0, dy: 0, run: false, fastTime: false };

test('parseOptions reads seed, bench, size, frames, place, at and scale', () => {
  assert.deepEqual(parseOptions(['--seed', '42', '--bench', '--size', '80x24', '--frames', '30']), {
    seed: 42,
    bench: true,
    cols: 80,
    rows: 24,
    frames: 30,
    place: null,
    at: null,
    scale: 3,
  });
  assert.deepEqual(parseOptions(['--place', 'Prague', '--scale', '6']).place, 'Prague');
  assert.deepEqual(parseOptions(['--at', '50.088,14.414']).at, { lat: 50.088, lon: 14.414 });
  assert.equal(parseOptions(['--scale', '6']).scale, 6);
});

test('parseOptions has defaults and rejects bad input', () => {
  assert.deepEqual(parseOptions([]), { seed: null, bench: false, cols: 200, rows: 60, frames: 600, place: null, at: null, scale: 3 });
  assert.throws(() => parseOptions(['--at', 'Prague']), /--at must look like 50.088,14.414/);
  assert.throws(() => parseOptions(['--at', '95,14']), /--at must look like 50.088,14.414/);
  assert.throws(() => parseOptions(['--place', 'Prague', '--at', '50,14']), /use --place or --at, not both/);
  assert.throws(() => parseOptions(['--scale', '0']), /--scale must be a positive number of metres/);
  assert.throws(() => parseOptions(['--scale', 'big']), /--scale must be a positive number of metres/);
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

test('a game in a given world starts on cell (0, 0) and draws that world', () => {
  const world = new World(1);
  const game = new Game(5, 80, 24, { world });
  assert.equal(game.world, world);
  assert.deepEqual(game.player, { x: 0.5, y: ASPECT * 0.5, vx: 0, vy: 0 });
  assert.equal(game.place, null);
  game.prefetch(Infinity);
  assert.ok(game.draw().length > 0);
});

test('place names are cleaned to characters the status bar can draw one per column', () => {
  assert.equal(cleanLabel('Praha 😀'), 'Praha');
  assert.equal(cleanLabel('東京'), '');
  assert.equal(cleanLabel('Zoë\u200b'), 'Zoë');
  assert.equal(cleanLabel('e\u0301'), '\u00e9');
  assert.equal(cleanLabel('\x1b[31mBrno'), '[31mBrno');
  assert.equal(cleanLabel('   '), '');
  assert.equal(cleanLabel('a'.repeat(40)).length, 32);
});

test('the status bar of a game with a place reports loading and offline from the world', () => {
  const world = new World(1);
  let loading = 1;
  const game = new Game(5, 120, 24, { world, place: { name: 'Prague', projection: new Projection(50.088, 14.414, 3), status: () => ({ loading, offline: false, busy: false }) } });
  game.prefetch(Infinity);
  const bar = game.draw();
  assert.ok(bar.includes('Prague · © OpenStreetMap') && bar.includes('· loading'), bar.slice(-200));
  loading = 0;
  game.update(idle, 1 / 60);
  assert.ok(!game.draw().includes('loading'));
});

test('--at accepts negative latitudes and a space after the comma', () => {
  assert.deepEqual(parseOptions(['--at', '-33.87,151.21']).at, { lat: -33.87, lon: 151.21 });
  assert.deepEqual(parseOptions(['--at=-33.87,151.21']).at, { lat: -33.87, lon: 151.21 });
  assert.deepEqual(parseOptions(['--at', '50.08804, 14.42076']).at, { lat: 50.08804, lon: 14.42076 });
});
