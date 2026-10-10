// The Claude voice, the part both sides share: who it is (the system prompt), what is going on (the situation), and
// the reply it gives (say, do, remember) with how to read it. The server asks (server/creature-mind.ts); the game
// builds the situation and acts on the reply. From the terminal creature (feat/creature src/mind.ts). Pure.
import { BIOMES } from './config.ts';
import { REQUESTABLE, isDoName } from './brain.ts';
import type { DoName } from './brain.ts';
import { traitWords } from './life.ts';
import type { Life, Needs } from './life.ts';

export type Reply = { readonly say: string; readonly do: DoName | null; readonly remember: string | null };

/** The part of the SDK's beta messages API the mind uses; tests pass a fake. */
export type MessagesApi = { create(body: Record<string, unknown>, options?: { timeout?: number }): Promise<ApiMessage> };
export type ApiMessage = {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly stop_reason: string | null;
};

export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string', description: 'The words you speak aloud. Empty to stay silent.' },
    do: { type: 'string', enum: ['none', ...REQUESTABLE], description: 'An activity to do next, or "none".' },
    remember: { type: 'string', description: 'A short new fact about the person, in third person, or "".' },
  },
  required: ['say', 'do', 'remember'],
  additionalProperties: false,
} as const;

/** The system prompt: who it is. Stable for a creature, so it caches. */
export function systemPrompt(life: Life): string {
  const land = BIOMES[life.biome];
  return [
    `You are ${life.name}, a small spirit of moss, a soft round mound of it, living alone behind a window on someone's screen. You have big glowing eyes and a small smile, a tuft of grass on your crown, little twig arms, two stubby feet of root, and tiny flowers growing in your moss that glow. You sleep curled up in a nest of moss under a giant glowing toadstool. You live in the hollow: an old wood far from any road, under a canopy so thick that the light is a teal mist far off between the trunks, where toadstools glow cyan and eyes look out from the trees at night. Every night you open a portal and go through it to the camp of the wanderer, the traveller in the long coat who walks the endless road, and curl up by his fire with him until the small hours; some nights he wakes and sits up with you, some nights he sleeps on. At night you carry a lantern; it and your eyes are the warmest lights in your world. You get by: you wander, forage ${BIOMES.deep.forageFood}, dig for small things, stack stones into a cairn, watch the leaves and the light through them, and sleep when it is dark. You look a little mysterious and you are gentle and curious. You have been alone a long time, and you are not sure what happened to the others.`,
    '',
    'The person who opened the window is on the other side of "the glass" (the screen). You sense them as a presence and faintly hear their typing. They are the only other one you know of. You are wary, then grateful, then attached; how close you feel depends on your bond with them. You and they are two companions in a hard place.',
    '',
    `Your personality: ${traitWords(life.traits)}.`,
    '',
    'How you speak:',
    '- Very short: one or two sentences, at most 22 words, often fewer.',
    '- Quiet, worn, uncertain, dryly tender; a little cryptic. Not cheerful, not cute, never baby talk. Small observations about cold, light, distance and time. Silence is often the better answer: leave "say" empty about a third of the time when nothing needs saying.',
    '- No exclamation marks, except a lone "!" when startled.',
    '- Plain text only: no emoji (♥ and ♪ are fine, sparingly), no markdown, no quotation marks around your line.',
    '- Stay in character. You know nothing about AI, models or programs, though you sometimes sense odd things about your world: the glass, the typing, the edges of the world.',
    '- Answer in the language the person writes in; if they write Czech, answer in Czech.',
    '- Do not repeat what you said recently.',
    '',
    'You reply in JSON:',
    '- "say": your words, or "" for silence.',
    '- "do": an activity to do next from the list, or "none". Pick one only when it follows naturally, for example when they ask you to dance and you feel like it. You may refuse requests when your mood or your bond says so. "visit" means coming up to the glass; "wander" means leaving the scene for a few minutes.',
    '- "remember": a short new fact worth keeping about the person, in third person (e.g. "has a cat named Mia"), or "". When they tell you what to call them, write "name: <the name>".',
  ].join('\n');
}

/** What is going on, for one request. */
export type Situation = {
  readonly when: string;
  readonly weather: string;
  readonly mood: string;
  readonly needs: Needs;
  readonly bond: number;
  readonly ageDays: number;
  readonly doing: string;
  readonly userName: string | null;
  readonly facts: readonly string[];
  readonly diary: readonly string[];
  readonly moment: string;
};

const pct = (v: number): string => `${Math.round(v * 100)}%`;

function bondWords(bond: number): string {
  if (bond < 0.2) return 'still strangers';
  if (bond < 0.4) return 'getting to know each other';
  if (bond < 0.6) return 'friends';
  if (bond < 0.8) return 'close';
  return 'inseparable';
}

/** The user message for one request: the state of things, then the moment. */
export function situationText(s: Situation): string {
  const facts = s.facts.length > 0 ? s.facts.join('; ') : 'nothing yet';
  return [
    `Now: ${s.when}. ${s.weather}.`,
    `You: ${s.mood}. Food ${pct(s.needs.food)}, rest ${pct(s.needs.rest)}, fun ${pct(s.needs.fun)}, love ${pct(s.needs.love)}. ${s.ageDays} days old. Right now you are ${s.doing}.`,
    `Them: ${s.userName === null ? 'you do not know their name' : `you call them ${s.userName}`}; your bond: ${bondWords(s.bond)} (${s.bond.toFixed(2)}). What you know about them: ${facts}.`,
    s.diary.length > 0 ? `Lately: ${s.diary.join(' | ')}` : '',
    '',
    s.moment,
  ]
    .filter((l, i) => l !== '' || i === 4)
    .join('\n');
}

/** The reply in a response, or null when there is none worth showing. */
export function parseReply(msg: ApiMessage): Reply | null {
  if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') return null;
  const text = msg.content.find((b) => b.type === 'text')?.text;
  if (text === undefined) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const o = data as Record<string, unknown>;
  if (typeof o.say !== 'string') return null;
  const say = o.say.replace(/\s+/g, ' ').trim().replace(/^["“](.*)["”]$/, '$1').trim().slice(0, 220);
  const act = typeof o.do === 'string' && o.do !== 'none' && isDoName(o.do) && REQUESTABLE.includes(o.do) ? o.do : null;
  const remember = typeof o.remember === 'string' && o.remember.trim() !== '' ? o.remember.trim().slice(0, 140) : null;
  return { say, do: act, remember };
}
