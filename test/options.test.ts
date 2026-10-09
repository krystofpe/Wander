import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, argvToQuery, parseOptions, seedOf } from '../src/options.ts';

const from = (q: string) => {
  const p = new URLSearchParams(q);
  return parseOptions((k) => p.get(k));
};

test('no parameters give the defaults', () => {
  assert.deepEqual(from(''), DEFAULTS);
});

test('every option is read from the URL', () => {
  const o = from('seed=moss&new=1&speed=20&day=30&realclock=1&hour=18.5&biome=coast&offline=1&frozen=1&at=1200.5&weather=fog&pose=sit&size=3840x2160&bench=20&mute=1&t=0.34');
  assert.equal(o.seed, 'moss');
  assert.equal(o.fresh, true);
  assert.equal(o.speed, 20);
  assert.equal(o.day, 30);
  assert.equal(o.realClock, true);
  assert.equal(o.hour, 18.5);
  assert.equal(o.biome, 'coast');
  assert.equal(o.offline, true);
  assert.equal(o.frozen, true);
  assert.equal(o.at, 1200.5);
  assert.equal(o.weather, 'fog');
  assert.equal(o.pose, 'sit');
  assert.deepEqual(o.size, { w: 3840, h: 2160 });
  assert.equal(o.bench, 20);
  assert.equal(o.mute, true);
  assert.equal(o.t, 0.34);
});

test('bad values fall back instead of breaking', () => {
  const o = from('speed=fast&hour=99&biome=moon&size=huge&day=0');
  assert.equal(o.speed, 1);
  assert.equal(o.hour, 23.999);
  assert.equal(o.biome, null);
  assert.equal(o.size, null);
  assert.equal(o.day, 1);
});

test('the command line becomes the same URL parameters', () => {
  assert.equal(argvToQuery(['--seed', 'moss', '--speed=20', '--frozen', '--new']).toString(), 'seed=moss&speed=20&frozen=1&new=1');
  assert.throws(() => argvToQuery(['--colour', 'red']), /unknown option/);
  assert.throws(() => argvToQuery(['--seed']), /needs a value/);
  assert.throws(() => argvToQuery(['moss']), /unexpected/);
});

test('a seed can be any word, and the same word is the same road', () => {
  assert.equal(seedOf('moss'), seedOf('moss'));
  assert.notEqual(seedOf('moss'), seedOf('fern'));
  assert.equal(seedOf('42'), 42);
});
