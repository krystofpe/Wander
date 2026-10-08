import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AI } from '../src/config.ts';
import { newLife } from '../src/creature.ts';
import { Mind, connectMind, hasCredentials, parseReply, situationText, systemPrompt } from '../src/mind.ts';
import type { ApiMessage, MessagesApi } from '../src/mind.ts';

const life = newLife(4, 0, { biome: 'swamp', name: 'Moss' });
const reply = (o: unknown, stop = 'end_turn'): ApiMessage => ({ content: [{ type: 'text', text: JSON.stringify(o) }], stop_reason: stop });

function fakeApi(answer: () => ApiMessage | Promise<ApiMessage>): { api: MessagesApi; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  return {
    bodies,
    api: {
      create: async (body) => {
        bodies.push(body);
        return answer();
      },
    },
  };
}

test('the system prompt says who it is', () => {
  const p = systemPrompt(life);
  assert.match(p, /You are Moss/);
  assert.match(p, /swamp/);
  assert.match(p, /JSON/);
});

test('the situation carries the moment and the state of things', () => {
  const s = situationText({
    when: 'Thursday 8 October, 21:14 (night)',
    weather: 'Weather: rain',
    mood: 'content',
    needs: { food: 0.5, rest: 1, fun: 0.25, love: 0.75 },
    bond: 0.5,
    ageDays: 3,
    doing: 'sitting',
    userName: 'Kryštof',
    facts: ['likes tea'],
    diary: ['2 hours ago: Found a frog-shaped stone.'],
    moment: 'They type to you: "hello"',
  });
  assert.match(s, /Food 50%, rest 100%, fun 25%, love 75%/);
  assert.match(s, /you call them Kryštof/);
  assert.match(s, /likes tea/);
  assert.ok(s.endsWith('They type to you: "hello"'));
});

test('replies are checked: words, a known activity, a fact', () => {
  assert.deepEqual(parseReply(reply({ say: ' "Hello there." ', do: 'dance', remember: 'has a cat' })), { say: 'Hello there.', do: 'dance', remember: 'has a cat' });
  assert.deepEqual(parseReply(reply({ say: 'Hm.', do: 'none', remember: '' })), { say: 'Hm.', do: null, remember: null });
  assert.equal(parseReply(reply({ say: 'Hm.', do: 'explode', remember: '' }))?.do, null);
  assert.equal(parseReply({ content: [{ type: 'text', text: 'not json' }], stop_reason: 'end_turn' }), null);
  assert.equal(parseReply(reply({ say: 'x', do: 'none', remember: '' }, 'refusal')), null);
  assert.equal(parseReply({ content: [], stop_reason: 'end_turn' }), null);
});

test('a request asks for structured JSON at low effort, with the refusal fallback on Opus', async () => {
  const { api, bodies } = fakeApi(() => reply({ say: 'Hi.', do: 'none', remember: '' }));
  const mind = new Mind(api, () => false, 'claude-opus-5-5');
  assert.deepEqual(await mind.ask(life, 'They type to you: "hi"', false, 0), { say: 'Hi.', do: null, remember: null });
  const body = bodies[0] as Record<string, any>;
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(body.messages.length, 1);
  const haiku = fakeApi(() => reply({ say: 'Hi.', do: 'none', remember: '' }));
  await new Mind(haiku.api, () => false, 'claude-haiku-5-5').ask(life, 'hi', false, 0);
  assert.equal((haiku.bodies[0] as Record<string, any>).fallbacks, undefined, 'Haiku has no server-side fallback');
});

test('the conversation is remembered, in whole exchanges, up to a limit', async () => {
  const { api, bodies } = fakeApi(() => reply({ say: 'Mm.', do: 'none', remember: '' }));
  const mind = new Mind(api, () => false);
  for (let i = 0; i < AI.historyTurns + 3; i++) await mind.ask(life, `line ${i}`, false, i);
  const last = bodies.at(-1) as Record<string, any>;
  assert.equal(last.messages.length, AI.historyTurns * 2 + 1);
  assert.equal(last.messages[0].role, 'user');
  assert.equal(last.messages.at(-1).content, `line ${AI.historyTurns + 2}`);
});

test('volunteered lines are rate-limited', async () => {
  const { api } = fakeApi(() => reply({ say: 'Mm.', do: 'none', remember: '' }));
  const mind = new Mind(api, () => false);
  assert.equal(mind.mayVolunteer(0), true);
  await mind.ask(life, 'thought', true, 0);
  assert.equal(mind.mayVolunteer(10), false);
  assert.equal(mind.mayVolunteer(AI.spontaneousEverySec + 1), true);
});

test('refused credentials turn it off; repeated failures make it rest a while', async () => {
  const denied = new Mind(fakeApi(() => Promise.reject(new Error('401'))).api, () => true);
  assert.equal(await denied.ask(life, 'hi', false, 0), null);
  assert.equal(denied.disabled, true);
  const flaky = new Mind(fakeApi(() => Promise.reject(new Error('500'))).api, () => false);
  for (let i = 0; i < 3; i++) assert.equal(await flaky.ask(life, 'hi', false, 1), null);
  assert.equal(flaky.disabled, false);
  assert.equal(flaky.mayVolunteer(100), false, 'resting for five minutes');
  assert.equal(await flaky.ask(life, 'hi', false, 2), null);
  assert.equal(flaky.mayVolunteer(302), true);
});

test('without credentials, or offline, there is no Claude voice', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'wander-'));
  assert.equal(hasCredentials({ XDG_CONFIG_HOME: empty }), false);
  assert.equal(hasCredentials({ XDG_CONFIG_HOME: empty, ANTHROPIC_API_KEY: 'sk-test' }), true);
  mkdirSync(join(empty, 'anthropic'));
  assert.equal(hasCredentials({ XDG_CONFIG_HOME: empty }), true);
  assert.equal(await connectMind(true, { ANTHROPIC_API_KEY: 'sk-test' }), null);
  assert.equal(await connectMind(false, { XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'wander-')) }), null);
  const mind = await connectMind(false, { ANTHROPIC_API_KEY: 'sk-test', WANDER_MODEL: 'claude-haiku-5-5' });
  assert.equal(mind?.model, 'claude-haiku-5-5');
});
