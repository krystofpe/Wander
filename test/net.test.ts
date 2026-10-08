import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REAL } from '../src/config.ts';
import { Net, defaultCacheDir } from '../src/net.ts';
import type { FetchInit, Fetcher } from '../src/net.ts';

const dirs: string[] = [];
const freshDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'wander-net-'));
  dirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

type Call = { url: string; init: FetchInit };
function fetcher(calls: Call[], status = 200, body = 'hello'): Fetcher {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, bytes: async () => new TextEncoder().encode(body) };
  };
}

test('a cached file is returned without fetching', async () => {
  const dir = freshDir();
  mkdirSync(join(dir, 'a'), { recursive: true });
  writeFileSync(join(dir, 'a', 'b.txt'), 'cached');
  const calls: Call[] = [];
  const bytes = await new Net(dir, fetcher(calls)).get('https://example.test/x', 'a/b.txt');
  assert.equal(new TextDecoder().decode(bytes), 'cached');
  assert.equal(calls.length, 0);
});

test('a fetch writes the cache, sends the user agent and passes the request through', async () => {
  const dir = freshDir();
  const calls: Call[] = [];
  const net = new Net(dir, fetcher(calls));
  const bytes = await net.get('https://example.test/x', 'osm/14/1/2.json', { method: 'POST', body: 'data=q' });
  assert.equal(new TextDecoder().decode(bytes), 'hello');
  assert.equal(readFileSync(join(dir, 'osm/14/1/2.json'), 'utf8'), 'hello');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, 'data=q');
  assert.equal(calls[0].init.headers?.['User-Agent'], REAL.userAgent);
  await net.get('https://example.test/x', 'osm/14/1/2.json');
  assert.equal(calls.length, 1, 'the second call is served from the cache');
});

test('a failed response throws, caches nothing, and inFlight returns to zero', async () => {
  const dir = freshDir();
  const net = new Net(dir, fetcher([], 503));
  await assert.rejects(net.get('https://example.test/x', 't.png'), /503 from https:\/\/example\.test\/x/);
  assert.equal(existsSync(join(dir, 't.png')), false);
  assert.equal(net.inFlight, 0);
});

test('inFlight counts running fetches, and forget deletes a cached file', async () => {
  const dir = freshDir();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow: Fetcher = async () => {
    await gate;
    return { ok: true, status: 200, bytes: async () => new Uint8Array([1]) };
  };
  const net = new Net(dir, slow);
  const pending = net.get('https://example.test/x', 'slow.bin');
  assert.equal(net.inFlight, 1);
  release();
  await pending;
  assert.equal(net.inFlight, 0);
  assert.equal(existsSync(join(dir, 'slow.bin')), true);
  net.forget('slow.bin');
  assert.equal(existsSync(join(dir, 'slow.bin')), false);
  net.forget('never-there.bin');
});

test('the default cache directory follows XDG_CACHE_HOME and falls back to ~/.cache', () => {
  assert.equal(defaultCacheDir({ XDG_CACHE_HOME: '/tmp/xdg' }), join('/tmp/xdg', 'wander'));
  assert.ok(defaultCacheDir({}).endsWith(join('.cache', 'wander')));
});
