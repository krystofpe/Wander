// The Claude voice: when credentials and the SDK are there, its words (and some of its choices) come from Claude.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AI, BIOMES } from './config.ts';
import { REQUESTABLE, isDoName } from './brain.ts';
import type { DoName } from './brain.ts';
import { traitWords } from './creature.ts';
import type { Life, Needs } from './creature.ts';

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
  const biome = BIOMES[life.biome];
  return [
    `You are ${life.name}, a small mysterious hooded figure who lives in a tiny ${biome.title.toLowerCase()} diorama inside a computer terminal. Your face is darkness; only your two glowing eyes show. At night you carry a lantern. You live a quiet life of your own: you wander, forage ${biome.forageFood}, dig for small treasures, stack stones into a cairn, watch the sky, and sleep in your little home.`,
    '',
    'The person who opened the terminal is on the other side of "the glass" (the screen). You sense them as a presence and faintly hear their typing. You care about them in a gentle, curious way, and how close you feel depends on your bond with them.',
    '',
    `Your personality: ${traitWords(life.traits)}.`,
    '',
    'How you speak:',
    '- Very short: one or two sentences, at most 22 words, often fewer.',
    '- Gentle, curious, a little cryptic and poetic, sometimes playful, with childlike wonder. Never baby talk.',
    '- Plain text only: no emoji (♥ and ♪ are fine, sparingly), no markdown, no quotation marks around your line.',
    '- Stay in character. You know nothing about AI, models or programs, though you sometimes sense odd things about your world: the glass, the typing, the edges of the world.',
    '- Answer in the language the person writes in; if they write Czech, answer in Czech.',
    '- Do not repeat what you said recently.',
    '',
    'You reply in JSON:',
    '- "say": your words (may be empty if silence fits better).',
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

/** Models that take the server-side refusal fallback. */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5|sonnet-5-5)/;

type Turn = { readonly role: 'user' | 'assistant'; readonly content: string };

/** Talks to Claude, one request at a time, keeping a short history. */
export class Mind {
  readonly model: string;
  /** Set when credentials are refused; it then stays local for the session. */
  disabled = false;
  private inFlight = 0;
  /** Requests go out one at a time, in order, so the history stays in order. */
  private queue: Promise<unknown> = Promise.resolve();
  private history: Turn[] = [];
  private lastVolunteer = -Infinity;
  private failures = 0;
  private quietUntil = 0;
  private readonly api: MessagesApi;
  private readonly isAuthError: (err: unknown) => boolean;

  constructor(api: MessagesApi, isAuthError: (err: unknown) => boolean, model: string = AI.model) {
    this.api = api;
    this.isAuthError = isAuthError;
    this.model = model;
  }

  /** True while a request is out or waiting. */
  get busy(): boolean {
    return this.inFlight > 0;
  }

  /** May it volunteer a line now? `nowSec` is a monotonic clock in seconds. */
  mayVolunteer(nowSec: number): boolean {
    return !this.disabled && !this.busy && nowSec >= this.quietUntil && nowSec - this.lastVolunteer >= AI.spontaneousEverySec;
  }

  /**
   * Asks for a reply. A volunteered line is skipped while another request is out; an answer to you waits its
   * turn. Null on any failure; the caller falls back to the local voice.
   */
  ask(life: Life, situation: string, volunteered: boolean, nowSec: number): Promise<Reply | null> {
    if (this.disabled || nowSec < this.quietUntil || (volunteered && this.busy)) return Promise.resolve(null);
    if (volunteered) this.lastVolunteer = nowSec;
    this.inFlight++;
    const turn = this.queue.then(() => this.send(life, situation, nowSec)).finally(() => this.inFlight--);
    this.queue = turn;
    return turn;
  }

  private async send(life: Life, situation: string, nowSec: number): Promise<Reply | null> {
    if (this.disabled) return null;
    try {
      const messages = [...this.history, { role: 'user', content: situation }];
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: AI.maxTokens,
        output_config: { effort: AI.effort, format: { type: 'json_schema', schema: REPLY_SCHEMA } },
        system: [{ type: 'text', text: systemPrompt(life), cache_control: { type: 'ephemeral' } }],
        messages,
      };
      if (FALLBACK_MODELS.test(this.model)) {
        body.betas = ['server-side-fallback-2026-07-01'];
        body.fallbacks = 'default';
      }
      const msg = await this.api.create(body, { timeout: AI.timeoutMs });
      const reply = parseReply(msg);
      this.failures = 0;
      if (reply !== null) {
        this.history.push({ role: 'user', content: situation }, { role: 'assistant', content: JSON.stringify(reply) });
        // Drop whole exchanges from the front; the history is plain text, so trimming it is safe.
        while (this.history.length > AI.historyTurns * 2) this.history.splice(0, 2);
      }
      return reply;
    } catch (err) {
      if (this.isAuthError(err)) this.disabled = true;
      else if (++this.failures >= 3) {
        this.quietUntil = nowSec + 300;
        this.failures = 0;
      }
      return null;
    }
  }
}

/** True when the SDK has some credential source to try: a key, a token, a profile or federation. */
export function hasCredentials(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const set = (k: string): boolean => (env[k] ?? '') !== '';
  if (set('ANTHROPIC_API_KEY') || set('ANTHROPIC_AUTH_TOKEN') || set('ANTHROPIC_PROFILE') || set('ANTHROPIC_FEDERATION_RULE_ID')) return true;
  const config = set('XDG_CONFIG_HOME') ? (env.XDG_CONFIG_HOME ?? '') : join(homedir(), '.config');
  return existsSync(join(config, 'anthropic'));
}

/** The Claude voice, or null when it is turned off, has no credentials, or the SDK is not installed. */
export async function connectMind(offline: boolean, env: Readonly<Record<string, string | undefined>> = process.env): Promise<Mind | null> {
  if (offline || !hasCredentials(env)) return null;
  let sdk: typeof import('@anthropic-ai/sdk');
  try {
    sdk = await import('@anthropic-ai/sdk');
  } catch {
    return null;
  }
  const Anthropic = sdk.default;
  let client: InstanceType<typeof Anthropic>;
  const key = env.ANTHROPIC_API_KEY;
  const token = env.ANTHROPIC_AUTH_TOKEN;
  try {
    client = new Anthropic({
      maxRetries: 1,
      timeout: AI.timeoutMs,
      ...(key !== undefined && key !== '' ? { apiKey: key } : {}),
      ...(token !== undefined && token !== '' ? { authToken: token } : {}),
    });
  } catch {
    return null;
  }
  const isAuthError = (err: unknown): boolean => err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError;
  const api: MessagesApi = {
    create: (body, options) => client.beta.messages.create(body as never, options) as unknown as Promise<ApiMessage>,
  };
  return new Mind(api, isAuthError, env.WANDER_MODEL !== undefined && env.WANDER_MODEL !== '' ? env.WANDER_MODEL : AI.model);
}
