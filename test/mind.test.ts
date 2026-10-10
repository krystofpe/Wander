import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Thinker, cleanThought, hasCredentials } from '../server/mind.ts';
import type { ApiMessage, MessagesApi } from '../server/mind.ts';

const ctx = {
  seed: 7,
  biome: 'pine',
  place: 'pine forest',
  phase: 'dusk',
  sky: 'clear',
  windy: false,
  cold: false,
  doing: 'smoking',
  near: null,
  day: 3,
  cigarettes: 2,
  since: 'the waterfall',
  moon: 0.4,
  recent: ['A fire makes a room out of nothing.'],
};

const reply = (thought: string, stop = 'end_turn'): ApiMessage => ({ content: [{ type: 'text', text: JSON.stringify({ thought }) }], stop_reason: stop });

function fakeApi(answer: () => Promise<ApiMessage>): MessagesApi & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    create: (body) => {
      calls.push(body);
      return answer();
    },
  };
}

test('a thought comes back from Claude, cleaned', async () => {
  let now = 1000_000;
  const api = fakeApi(async () => reply('  "The pines keep their own counsel tonight."  '));
  const t = new Thinker(api, () => false, 'claude-opus-5-5', () => now);
  assert.equal(await t.think(ctx), 'The pines keep their own counsel tonight.');
  assert.equal(t.status(), 'claude');
  const body = api.calls[0] as { model: string; output_config: { effort: string; format: { type: string } } };
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.output_config.format.type, 'json_schema');
  now += 1;
});

test('at most one call every three minutes; earlier asks get nothing and cost nothing', async () => {
  let now = 0;
  const api = fakeApi(async () => reply('Cold enough to hear the stars.'));
  const t = new Thinker(api, () => false, 'claude-opus-5-5', () => now);
  assert.notEqual(await t.think(ctx), null);
  now += 60_000;
  assert.equal(await t.think(ctx), null);
  now += 60_000;
  assert.equal(await t.think(ctx), null);
  assert.equal(api.calls.length, 1);
  now += 5 * 60_000;
  assert.notEqual(await t.think(ctx), null);
  assert.equal(api.calls.length, 2);
});

test('a slow API gives up in time and the caller falls back', async () => {
  const api = fakeApi(() => new Promise(() => {}));
  const t = new Thinker(api, () => false, 'claude-opus-5-5', () => 0, 50);
  const started = Date.now();
  assert.equal(await t.think(ctx), null);
  assert.ok(Date.now() - started < 1000);
});

test('refusals and broken replies fall back; refused credentials turn Claude off', async () => {
  const refuse = new Thinker(fakeApi(async () => reply('x', 'refusal')), () => false, 'claude-opus-5-5', () => 0);
  assert.equal(await refuse.think(ctx), null);
  const junk = new Thinker(fakeApi(async () => ({ content: [{ type: 'text', text: 'not json' }], stop_reason: 'end_turn' })), () => false, 'claude-opus-5-5', () => 0);
  assert.equal(await junk.think(ctx), null);
  const auth = new Error('401');
  const denied = new Thinker(
    fakeApi(async () => {
      throw auth;
    }),
    (e) => e === auth,
    'claude-opus-5-5',
    () => 0,
  );
  assert.equal(await denied.think(ctx), null);
  assert.equal(denied.status(), 'local');
});

test('thoughts are cleaned: no shouting, no emoji, never addressed to the viewer, two short lines at most', () => {
  assert.equal(cleanThought('Rain again!'), 'Rain again.');
  assert.equal(cleanThought('The fire 🔥 is low.'), 'The fire is low.');
  assert.equal(cleanThought('You would like it here.'), null);
  assert.equal(cleanThought(''), null);
  assert.equal(cleanThought('a'.repeat(300)), null);
});

test('credentials are found in the environment', () => {
  assert.equal(hasCredentials({ ANTHROPIC_API_KEY: 'k', XDG_CONFIG_HOME: '/nonexistent' }), true);
  assert.equal(hasCredentials({ XDG_CONFIG_HOME: '/nonexistent' }), false);
});
