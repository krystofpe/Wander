import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { request } from 'node:http';
import { startServer } from '../server/server.ts';
import type { Api } from '../server/server.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fakeApi(): Api & { saved: unknown[]; asked: unknown[] } {
  const saved: unknown[] = [];
  const asked: unknown[] = [];
  return {
    saved,
    asked,
    loadJourney: async () => saved[saved.length - 1] ?? null,
    saveJourney: async (j) => {
      saved.push(j);
    },
    thought: async (ctx) => {
      asked.push(ctx);
      return { text: 'The fire is the only thing out here that answers.' };
    },
    mind: () => 'claude',
  };
}

test('serves TypeScript as JavaScript, with the types stripped', async () => {
  const s = await startServer(root, fakeApi());
  try {
    const res = await fetch(`${s.url}src/noise.ts`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /javascript/);
    const code = await res.text();
    assert.ok(code.includes('export function squirrel'));
    assert.ok(!/\): number \{/.test(code), 'return types are gone');
  } finally {
    await s.close();
  }
});

test('serves the page, and nothing outside the public folders', async () => {
  const s = await startServer(root, fakeApi());
  try {
    assert.equal((await fetch(s.url)).status, 200);
    for (const path of ['package.json', 'server/server.ts', 'src/../server/server.ts', '..%2Fpackage.json', 'web/../../etc/passwd', 'nope/x.ts']) {
      const res = await fetch(`${s.url}${path}`);
      assert.equal(res.status, 404, path);
    }
  } finally {
    await s.close();
  }
});

test('the journey goes in and comes back out, with the mind reported', async () => {
  const api = fakeApi();
  const s = await startServer(root, api);
  try {
    const journey = { version: 2, seed: 7, distance: 1234.5 };
    const put = await fetch(`${s.url}api/journey`, { method: 'PUT', body: JSON.stringify(journey) });
    assert.equal(put.status, 200);
    const got = (await (await fetch(`${s.url}api/journey`)).json()) as { journey: unknown; mind: string };
    assert.deepEqual(got.journey, journey);
    assert.equal(got.mind, 'claude');
  } finally {
    await s.close();
  }
});

test('a thought is asked of the API with the context', async () => {
  const api = fakeApi();
  const s = await startServer(root, api);
  try {
    const res = await fetch(`${s.url}api/thought`, { method: 'POST', body: JSON.stringify({ biome: 'pine' }) });
    const got = (await res.json()) as { thought: string | null; mind: string };
    assert.equal(got.thought, 'The fire is the only thing out here that answers.');
    assert.deepEqual(api.asked, [{ biome: 'pine' }]);
  } finally {
    await s.close();
  }
});

test('a broken request body is refused, and the server keeps going', async () => {
  const s = await startServer(root, fakeApi());
  try {
    const bad = await fetch(`${s.url}api/journey`, { method: 'PUT', body: '{not json' });
    assert.equal(bad.status, 400);
    assert.equal((await fetch(`${s.url}api/mind`)).status, 200);
  } finally {
    await s.close();
  }
});

test('only this machine: another Host or a foreign Origin is refused', async () => {
  const r = await startServer(root, fakeApi());
  try {
    const port = new URL(r.url).port;
    const host = await new Promise<number>((resolve) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/journey', headers: { host: `evil.example:${port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.end();
    });
    assert.equal(host, 403);
    const foreign = await fetch(`${r.url}api/journey`, { method: 'PUT', headers: { origin: 'https://evil.example' }, body: '{}' });
    assert.equal(foreign.status, 403);
    const own = await fetch(`${r.url}api/mind`, { headers: { origin: r.url.replace(/\/$/, '') } });
    assert.equal(own.status, 200);
  } finally {
    await r.close();
  }
});
