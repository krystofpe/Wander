import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES, QUESTIONS, fill, line, localReply, moonWords, nextQuestion } from '../src/speech.ts';
import { rng } from '../src/noise.ts';

const vars = { name: 'Ulo', user: 'Kryštof', time: '21:14', weather: 'rain', forage: 'berries', item: 'a feather' };
const context = { mood: 'content', hungry: false, tired: false, bored: false, bond: 0.5, night: false };

test('placeholders are filled; unknown ones vanish', () => {
  assert.equal(fill('Hello, {user}. I am {name}.', vars), 'Hello, Kryštof. I am Ulo.');
  assert.equal(fill('A {nothing} day.', vars), 'A day.');
});

test('every line fills cleanly', () => {
  const all = { ...vars, food: 'berry', season: 'autumn', moon: 'full', biome: 'forest', away: '2 hours', date: '2026-10-08' };
  for (const [topic, lines] of Object.entries(LINES)) {
    for (const l of lines) assert.ok(!fill(l, all).includes('{'), `${topic}: ${l}`);
  }
  assert.equal(line('hello', vars, rng(1)), line('hello', vars, rng(1)));
});

test('it learns your name, keeping your spelling', () => {
  assert.equal(localReply('my name is kryštof', vars, context, rng(1)).userName, 'Kryštof');
  assert.equal(localReply('Call me Ann!', vars, context, rng(1)).userName, 'Ann');
  assert.equal(localReply('Jmenuju se Kryštof', vars, context, rng(1)).userName, 'Kryštof');
  assert.equal(localReply("I'm tired", vars, context, rng(1)).userName, null);
});

test('greetings, Czech too, and what it is asked to do', () => {
  assert.match(localReply('ahoj', vars, context, rng(1)).say, /Ahoj/);
  assert.equal(localReply('hello there', vars, context, rng(1)).do, 'wave');
  assert.match(localReply('how are you?', vars, { ...context, hungry: true }, rng(1)).say, /content\. A little hungry/);
  assert.equal(localReply('dance for me', vars, context, rng(1)).do, 'dance');
  assert.equal(localReply('go to sleep', vars, { ...context, night: true }, rng(1)).do, 'sleep');
  assert.equal(localReply('go to sleep', vars, context, rng(1)).do, null);
});

test('anything else gets a gentle answer', () => {
  for (const text of ['what is the meaning of it all?', 'pineapples', 'x']) {
    const r = localReply(text, vars, context, rng(2));
    assert.ok(r.say.length > 0 && !r.say.includes('{'), r.say);
  }
});

test('questions: unasked ones first, all of them eventually', () => {
  const asked = QUESTIONS.map((q) => q.id).filter((id) => id !== 'rain' && id !== 'happy');
  for (let i = 0; i < 20; i++) assert.ok(['rain', 'happy'].includes(nextQuestion(asked, rng(i))?.id ?? ''));
  assert.equal(nextQuestion(QUESTIONS.map((q) => q.id), rng(1))?.id, 'happy');
});

test('the moon in words', () => {
  assert.equal(moonWords(0), 'hiding');
  assert.equal(moonWords(0.5), 'full');
  assert.equal(moonWords(0.25), 'half');
});
