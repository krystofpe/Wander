import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Net } from '../src/net.ts';
import type { Fetcher } from '../src/net.ts';
import { resolvePlace } from '../src/place.ts';

const dir = mkdtempSync(join(tmpdir(), 'wander-place-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function nominatim(calls: string[], results: unknown[]): Fetcher {
  return async (url) => {
    calls.push(url);
    return { ok: true, status: 200, bytes: async () => new TextEncoder().encode(JSON.stringify(results)) };
  };
}

test('a place resolves to its first result, and the lookup is cached', async () => {
  const calls: string[] = [];
  const net = new Net(dir, nominatim(calls, [{ lat: '50.0874654', lon: '14.4212535', display_name: 'Prague, Czechia' }]));
  const place = await resolvePlace('  Prague ', net);
  assert.deepEqual(place, { lat: 50.0874654, lon: 14.4212535, name: 'Prague' });
  assert.ok(calls[0].includes('q=Prague') && calls[0].includes('format=json'), calls[0]);
  await resolvePlace('prague', net);
  assert.equal(calls.length, 1, 'the same query in another case is served from the cache');
});

test('an unknown place throws and is not cached', async () => {
  const calls: string[] = [];
  const net = new Net(dir, nominatim(calls, []));
  await assert.rejects(resolvePlace('Nowhereville', net), /place not found: Nowhereville/);
  await assert.rejects(resolvePlace('Nowhereville', net), /place not found/);
  assert.equal(calls.length, 2, 'a miss is looked up again next time');
});
