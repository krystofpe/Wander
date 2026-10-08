import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALK_SPEED } from '../src/config.ts';
import { stepPlayer } from '../src/player.ts';
import type { MoveIntent, Player } from '../src/player.ts';

const still: Player = { x: 0, y: 0, vx: 0, vy: 0 };

function simulate(p: Player, intent: MoveIntent, terrain: number, seconds: number): Player {
  let q = p;
  for (let i = 0; i < Math.round(seconds * 60); i++) q = stepPlayer(q, intent, terrain, 1 / 60);
  return q;
}

test('you reach walking speed, and terrain slows you', () => {
  const grass = simulate(still, { dx: 1, dy: 0, run: false }, 1, 2);
  assert.ok(Math.abs(grass.vx - WALK_SPEED) < 0.01);
  const forest = simulate(still, { dx: 1, dy: 0, run: false }, 0.5, 2);
  assert.ok(Math.abs(forest.vx - WALK_SPEED / 2) < 0.01);
});

test('running doubles your speed', () => {
  const p = simulate(still, { dx: 0, dy: 1, run: true }, 1, 2);
  assert.ok(Math.abs(p.vy - WALK_SPEED * 2) < 0.01);
});

test('nothing blocks you: the slowest terrain still moves you', () => {
  const p = simulate(still, { dx: 0, dy: -1, run: false }, 0.4, 1);
  assert.ok(p.y < -3, `moved only to ${p.y}`);
});

test('diagonal speed equals straight-line speed', () => {
  const p = simulate(still, { dx: 1, dy: 1, run: false }, 1, 2);
  assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - WALK_SPEED) < 0.01);
});

test('releasing the keys glides you to a stop', () => {
  const moving = simulate(still, { dx: 1, dy: 0, run: false }, 1, 2);
  const after = simulate(moving, { dx: 0, dy: 0, run: false }, 1, 1);
  assert.equal(after.vx, 0);
  assert.ok(after.x > moving.x + 0.5, 'you coast a little before stopping');
  const later = simulate(after, { dx: 0, dy: 0, run: false }, 1, 1);
  assert.equal(later.x, after.x);
});

test('standing still stays still, without NaN', () => {
  const p = simulate(still, { dx: 0, dy: 0, run: true }, 1, 1);
  assert.deepEqual(p, still);
});
