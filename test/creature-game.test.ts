import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/creature/game.ts';
import type { MindLink } from '../src/creature/game.ts';
import { headOf } from '../src/creature/brain.ts';
import { newLife } from '../src/creature/life.ts';
import type { Life } from '../src/creature/life.ts';
import type { Reply } from '../src/creature/mind.ts';
import { Geometry } from '../src/creature/scene.ts';
import { QUESTIONS } from '../src/creature/speech.ts';
import { weatherAt } from '../src/creature/sky.ts';
import { rng } from '../src/noise.ts';

function dryAt(hour: number, seed: number): number {
  let t = new Date(2026, 9, 8, hour).getTime();
  while (weatherAt(t, seed, 'meadow').precip > 0 || weatherAt(t + 3600000, seed, 'meadow').precip > 0) t += 86400000;
  return t;
}

function game(options: { hour?: number; first?: boolean; mind?: MindLink; tweak?: (life: Life) => void } = {}): Game {
  const now = dryAt(options.hour ?? 14, 3);
  const life = newLife(3, now - (options.first === true ? 0 : 86400000), { biome: 'meadow' });
  if (options.first !== true) life.userName = 'Tester';
  options.tweak?.(life);
  return new Game(life, { geo: new Geometry(640), now, random: rng(3), mind: options.mind ?? null, login: 'krystofpe', firstMeeting: options.first, away: null });
}

/** A stand-in for the server's link to Claude: answers every request with `answer()`, and keeps what it was asked. */
function fakeMind(answer: () => Promise<Reply | null>): MindLink & { asked: string[] } {
  const asked: string[] = [];
  return {
    model: 'claude-test',
    disabled: false,
    busy: false,
    asked,
    mayVolunteer: () => false,
    ask: (_life, situation) => {
      asked.push(situation);
      return answer();
    },
  };
}

const run = (g: Game, seconds: number): void => {
  for (let i = 0; i < seconds * 30; i++) g.update(1 / 30);
};
const text = (segments: readonly { text: string }[]): string => segments.map((s) => s.text).join(' · ');
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

test('the first meeting: it appears, asks your name, and remembers it', () => {
  const g = game({ first: true });
  assert.equal(g.body.visible, false);
  let asked = false;
  for (let i = 0; i < 30 * 20 && !asked; i++) {
    g.update(1 / 30);
    asked = g.mode === 'name';
  }
  assert.ok(asked);
  assert.equal(g.body.visible, true);
  assert.match(text(g.hints()), /your name/);
  g.submit('Kryštof');
  assert.equal(g.life.userName, 'Kryštof');
  assert.equal(g.mode, 'live');
  assert.ok(g.life.diary.some((e) => e.text === 'Met Kryštof.'));
  assert.match(g.bubble()?.text ?? '', /Kryštof/);
});

test('skipping your name, it uses your login', () => {
  const g = game({ first: true });
  run(g, 20);
  assert.equal(g.mode, 'name');
  g.cancel();
  assert.equal(g.life.userName, 'Krystofpe');
  assert.equal(g.mode, 'live');
});

test('talking to it without Claude gets a local answer', () => {
  const g = game();
  run(g, 3);
  g.startTalk();
  assert.equal(g.mode, 'talk');
  assert.equal(text(g.hints()), 'say something · Enter send · Esc cancel');
  g.submit('hello');
  assert.equal(g.mode, 'live');
  assert.match(g.bubble()?.text ?? '', /Hello|Hi|hello/);
  assert.equal(g.life.stats.talks, 1);
  assert.deepEqual(g.hints(), [{ text: 'you ›', tone: 'dim' }, { text: 'hello' }], 'what you said shows below');
});

test('talking to Claude: its words, a name to remember, and something to do', async () => {
  const mind = fakeMind(async () => ({ say: 'Ahoj, Kryštofe!', do: 'dance', remember: 'name: Kryštof' }));
  const g = game({ mind });
  run(g, 3);
  g.startTalk();
  g.submit('ahoj, jsem Kryštof');
  assert.deepEqual(g.bubble(), { text: '…', kind: 'think' });
  assert.match(text(g.statusBar()), /mind: claude …/);
  assert.match(mind.asked.at(-1) ?? '', /They type to you: "ahoj, jsem Kryštof"$/);
  await flush();
  assert.equal(g.bubble()?.text, 'Ahoj, Kryštofe!');
  assert.equal(g.life.userName, 'Kryštof');
  let danced = false;
  for (let i = 0; i < 30 * 30 && !danced; i++) {
    g.update(1 / 30);
    danced = g.brain.current === 'dance';
  }
  assert.ok(danced);
});

test('when Claude fails, the local voice answers', async () => {
  const g = game({ mind: fakeMind(async () => null) });
  run(g, 3);
  g.startTalk();
  g.submit('hello');
  await flush();
  assert.match(g.bubble()?.text ?? '', /Hello|Hi|hello/);
});

test('when Claude refused the credentials, it stays local', () => {
  const mind = { ...fakeMind(async () => ({ say: 'never', do: null, remember: null })), disabled: true };
  const g = game({ mind });
  run(g, 3);
  g.startTalk();
  g.submit('hello');
  assert.equal(mind.asked.length, 0);
  assert.match(g.bubble()?.text ?? '', /Hello|Hi|hello/);
  assert.match(text(g.statusBar()), /mind: local \(no access\)/);
  assert.match(g.journal().at(-1) ?? '', /its own small mind/);
});

test('questions are answered with Y or N and remembered', () => {
  const g = game();
  assert.equal(g.ask(), true);
  const asked = QUESTIONS.find((q) => q.id === g.life.asked.at(-1));
  assert.equal(g.bubble()?.text, asked?.text, 'it asks in its bubble');
  assert.equal(g.hints()[0].text, 'Y yes · N no', 'and the hints say how to answer');
  g.answer(true);
  assert.equal(g.questionState(), 'answered');
  assert.equal(g.life.facts.length, 1);
  g.answer(false);
  assert.equal(g.life.facts.length, 1, 'answered once only');
});

test('a gift is taken with E', () => {
  const g = game({ tweak: (life) => life.found.push('a pearl') });
  g.offer('a pearl');
  assert.equal(g.hints()[0].text, 'E take it');
  g.pet();
  assert.equal(g.offerState(), 'taken');
  assert.deepEqual(g.life.shelf.map((s) => s.item), ['a pearl']);
  assert.deepEqual(g.life.found, []);
});

test('clicking it pets it; its eyes follow the mouse', () => {
  const g = game();
  run(g, 1);
  g.brain.run('idle');
  const x = g.geo.px(g.body.x);
  const foot = g.geo.footY(g.body.x, g.body.z);
  g.hover(x + 40, headOf(g).y + 9);
  assert.equal(g.eyes(), ' ••');
  g.hover(x - 40, headOf(g).y + 9);
  assert.equal(g.eyes(), '•• ');
  g.click(x, foot - 5);
  assert.equal(g.life.stats.petted, 1);
  assert.equal(g.brain.current, 'petted');
});

test('a click on the ground sends it to look', () => {
  const g = game({ tweak: (life) => (life.bond = 1) });
  run(g, 1);
  g.brain.run('idle');
  const target = g.body.x < 0.5 ? 0.8 : 0.2;
  g.click(g.geo.px(target), g.geo.footY(target, 0.5));
  assert.equal(g.brain.current, 'go');
  assert.ok(g.scene.particles.some((p) => p.kind === 'spark'), 'a spark where you clicked');
  const before = Math.abs(g.body.x - target);
  run(g, 3);
  assert.ok(Math.abs(g.body.x - target) < before);
});

test('at night it is home asleep, and E may wake it', () => {
  const g = game({ hour: 23, tweak: (life) => ((life.asleep = true), (life.traits.nightOwl = 0)) });
  assert.equal(g.body.inside, true);
  assert.equal(g.eyes(), '- -');
  assert.match(text(g.hints()), /E wake/);
  g.pet();
  assert.equal(g.brain.current, 'woken');
});

test('out in the dark it carries its lantern; by day, or inside, it does not', () => {
  const day = game();
  assert.equal(day.lantern(), null);
  const night = game({ hour: 22, tweak: (life) => ((life.traits.nightOwl = 1), (life.needs.rest = 1)) });
  const lantern = night.lantern();
  assert.ok(lantern !== null);
  assert.ok(Math.abs(lantern.x - night.geo.px(night.body.x)) < 12, 'it hangs at its side');
  const asleep = game({ hour: 23, tweak: (life) => ((life.asleep = true), (life.traits.nightOwl = 0)) });
  assert.equal(asleep.lantern(), null);
});

test('a creature that went wandering walks back in', () => {
  const g = game({ tweak: (life) => (life.away = true) });
  assert.equal(g.life.away, false);
  run(g, 1);
  assert.equal(g.body.visible, false);
  assert.match(text(g.statusBar()), /away/);
  run(g, 4);
  assert.equal(g.body.visible, true);
});

test('the journal opens with J and closes with J, Esc or a click', () => {
  const g = game();
  g.toggleJournal();
  assert.equal(g.mode, 'journal');
  assert.match(g.journal()[0], /of the meadow/);
  assert.match(g.journal().join('\n'), /What it knows about Tester/);
  g.toggleJournal();
  assert.equal(g.mode, 'live');
  g.toggleJournal();
  g.cancel();
  assert.equal(g.mode, 'live');
  g.toggleJournal();
  g.click(10, 10);
  assert.equal(g.mode, 'live');
  g.startTalk();
  g.toggleJournal();
  assert.equal(g.mode, 'talk', 'not while you type');
});

test('coming back to the window after a while, it greets you', () => {
  const g = game();
  run(g, 10);
  g.focus(false);
  run(g, 200);
  g.brain.run('idle');
  g.focus(true);
  assert.equal(g.brain.current, 'greet');
});

test('the bar: its name, how it is, its needs, the hour and the weather, whose words', () => {
  const g = game({ tweak: (life) => (life.needs.food = 0.1) });
  const bar = g.statusBar();
  assert.deepEqual(bar[0], { text: g.life.name, tone: 'accent' });
  assert.match(bar[1].text, /^1 day · /);
  const food = bar.find((s) => s.text.startsWith('food '));
  assert.deepEqual(food, { text: 'food ■····', tone: 'low' });
  assert.equal(bar.find((s) => s.text.startsWith('rest '))?.tone, undefined);
  assert.match(bar.at(-2)?.text ?? '', /^14:00 afternoon, /);
  assert.equal(bar.at(-1)?.text, 'mind: local');
});

test('a snapshot is the life as it is now, seen now', () => {
  const g = game();
  run(g, 10);
  const life = g.snapshot();
  assert.equal(life, g.life);
  assert.equal(life.lastSeen, g.worldNow());
  assert.ok(life.stats.visits >= 1);
});
