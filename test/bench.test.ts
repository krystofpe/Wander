import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const main = fileURLToPath(new URL('../src/main.ts', import.meta.url));

test('--bench runs without a terminal and prints its numbers', () => {
  const r = spawnSync(process.execPath, [main, '--bench', '--frames', '60', '--size', '80x24', '--seed', '1'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /build {2}mean [\d.]+ ms · p95 [\d.]+ ms/);
  assert.match(r.stdout, /output mean [\d.]+ KB · p95 [\d.]+ KB · max [\d.]+ KB/);
});

test('without a terminal the game explains itself and exits with 1', () => {
  const r = spawnSync(process.execPath, [main], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /wander needs a terminal/);
});

test('bad arguments exit with 2 and say what is wrong', () => {
  const r = spawnSync(process.execPath, [main, '--biome', 'moon'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--biome must be one of forest, meadow, tundra, swamp/);
});
