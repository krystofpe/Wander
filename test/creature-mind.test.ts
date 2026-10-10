// The pure half of the Claude voice: who it is, what is going on, and how a reply is read. Asking Claude (the Mind,
// its history, its rate limits and credentials) is the server's, and is tested there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUESTABLE } from '../src/creature/brain.ts';
import { newLife } from '../src/creature/life.ts';
import { REPLY_SCHEMA, parseReply, situationText, systemPrompt } from '../src/creature/mind.ts';
import type { ApiMessage } from '../src/creature/mind.ts';

const life = newLife(4, 0, { biome: 'swamp', name: 'Moss' });
const reply = (o: unknown, stop = 'end_turn'): ApiMessage => ({ content: [{ type: 'text', text: JSON.stringify(o) }], stop_reason: stop });

test('the system prompt says who it is', () => {
  const p = systemPrompt(life);
  assert.match(p, /You are Moss/);
  assert.match(p, /JSON/);
  assert.match(p, /the hollow/);
  assert.match(p, /portal/, 'it goes through its portal to him at night');
  assert.match(p, /spirit of moss/);
  assert.match(p, /nest of moss/);
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
  assert.equal(parseReply(reply({ say: 'Hm.', do: 'eat', remember: '' }))?.do, null, 'an activity, but not one it can be asked to do');
  assert.equal(parseReply({ content: [{ type: 'text', text: 'not json' }], stop_reason: 'end_turn' }), null);
  assert.equal(parseReply(reply({ say: 'x', do: 'none', remember: '' }, 'refusal')), null);
  assert.equal(parseReply(reply({ say: 'x', do: 'none', remember: '' }, 'max_tokens')), null);
  assert.equal(parseReply({ content: [], stop_reason: 'end_turn' }), null);
});

test('the reply schema offers exactly what it can be asked to do', () => {
  assert.deepEqual(REPLY_SCHEMA.properties.do.enum, ['none', ...REQUESTABLE]);
  assert.deepEqual(REPLY_SCHEMA.required, ['say', 'do', 'remember']);
  assert.equal(REPLY_SCHEMA.additionalProperties, false);
});
