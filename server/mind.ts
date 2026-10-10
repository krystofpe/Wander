// His thoughts from Claude, when there are credentials: the old mind.ts pattern moved to the server. One short
// structured reply at a time, at most one call every 3–5 minutes so it stays cheap all night, a hard timeout, quiet
// after repeated failures, off for the session when the credentials are refused. Anything else falls back to the
// page's local voice, which never waits for this.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MARK_NAMES } from '../src/biomes.ts';
import type { LandmarkKind } from '../src/biomes.ts';
import { pastOf } from '../src/thoughts.ts';

export const MIND = {
  model: 'claude-opus-5-5',
  effort: 'low',
  maxTokens: 16000,
  timeoutMs: 10000,
  /** Fewest and most milliseconds between two calls: the next allowed call is drawn between them. */
  everyMs: [180_000, 300_000] as const,
  /** After this many failures in a row, stay quiet for quietMs. */
  failures: 3,
  quietMs: 300_000,
} as const;

/** The part of the SDK's beta messages API used here; tests pass a fake. */
export type MessagesApi = { create(body: Record<string, unknown>, options?: { timeout?: number }): Promise<ApiMessage> };
export type ApiMessage = { readonly content: readonly { readonly type: string; readonly text?: string }[]; readonly stop_reason: string | null };

export const THOUGHT_SCHEMA = {
  type: 'object',
  properties: { thought: { type: 'string', description: 'His thought: one or two short sentences, at most 110 characters.' } },
  required: ['thought'],
  additionalProperties: false,
} as const;

/** What the page sends: where he is and what is around him (see src/life.ts thoughtContext), and his last thoughts. */
export type ThoughtRequest = {
  readonly seed?: unknown;
  readonly place?: unknown;
  readonly phase?: unknown;
  readonly sky?: unknown;
  readonly windy?: unknown;
  readonly cold?: unknown;
  readonly doing?: unknown;
  readonly near?: unknown;
  readonly day?: unknown;
  readonly cigarettes?: unknown;
  readonly since?: unknown;
  readonly moon?: unknown;
  readonly recent?: unknown;
};

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.slice(0, 80) : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Who he is. Stable for a road (its people and places come from the seed), so it caches. */
export function systemPrompt(seed: number): string {
  const past = pastOf(seed);
  const people = past.people.map((p) => `${p.name} (${p.who})`).join(', ');
  return [
    'You are the inner voice of a lone wanderer in an endless, quiet land: a hooded traveller in a long coat with a pack and a walking stick, whose face is darkness. He walks on and on through forests, hills, moors, coasts, deserts, marshes and snow, a wild land with nobody else in it, smokes now and then, sits on rocks, makes a small fire at night and sleeps by it. He has been walking a long time. He is alone with his thoughts.',
    '',
    `The life he left: ${people}; ${past.places.join(' and ')}. He still carries ${past.keepsake}. They come back to him, not every time.`,
    '',
    'Write one thought he has now. How:',
    '- One or two short sentences, at most 110 characters. First person, plain words.',
    '- Lonely, quiet, a little melancholic, dry rather than sentimental. Specific to what is around him and the hour: a small observation, or a memory of someone or somewhere he left, set off by what he sees.',
    '- Never addressed to anyone: no "you", no questions to a listener. He does not know anyone is watching.',
    '- No exclamation marks, no emoji, no quotation marks, no clichés (nothing about journeys and destinations, no "lost in thought").',
    '- Do not repeat or echo his recent thoughts.',
  ].join('\n');
}

/** The moment, as words, for one request. */
export function situationText(r: ThoughtRequest): string {
  const recent = Array.isArray(r.recent) ? r.recent.filter((x): x is string => typeof x === 'string').slice(-5) : [];
  return [
    `Where: ${str(r.place, 'the road')}. When: ${str(r.phase, 'day')}, day ${num(r.day, 1)} on the road. Sky: ${str(r.sky, 'clear')}${r.windy === true ? ', windy' : ''}${r.cold === true ? ', cold' : ''}.`,
    `He is ${str(r.doing, 'walking')}.${typeof r.near === 'string' ? ` In sight: ${Object.hasOwn(MARK_NAMES, r.near) ? MARK_NAMES[r.near as LandmarkKind] : `a ${str(r.near)}`}.` : ''}`,
    num(r.cigarettes) > 1 && typeof r.since === 'string' ? `Cigarettes since ${str(r.since)}: ${num(r.cigarettes)}.` : '',
    recent.length > 0 ? `His recent thoughts: ${recent.join(' | ')}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** A reply made fit to show, or null: no shouting, no emoji, never "you", at most two short lines. */
export function cleanThought(text: string): string | null {
  let t = text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .replace(/!+/g, '.')
    .replace(/\s+([.,;])/g, '$1')
    .trim();
  if (t === '' || t.length > 130) return null;
  if (/\b(you|your|yours|yourself)\b/i.test(t)) return null;
  if (!/[.?…]$/.test(t)) t += '.';
  return t;
}

export function parseThought(msg: ApiMessage): string | null {
  if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') return null;
  const text = msg.content.find((b) => b.type === 'text')?.text;
  if (text === undefined) return null;
  try {
    const data = JSON.parse(text) as { thought?: unknown };
    return typeof data.thought === 'string' ? cleanThought(data.thought) : null;
  } catch {
    return null;
  }
}

/** Models that take the server-side refusal fallback. */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5|sonnet-5-5)/;

export class Thinker {
  private readonly api: MessagesApi;
  private readonly isAuthError: (err: unknown) => boolean;
  readonly model: string;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private disabled = false;
  private busy = false;
  private nextAt = 0;
  private failures = 0;

  constructor(api: MessagesApi, isAuthError: (err: unknown) => boolean, model: string = MIND.model, now: () => number = Date.now, timeoutMs: number = MIND.timeoutMs) {
    this.api = api;
    this.isAuthError = isAuthError;
    this.model = model;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  /** `claude` while Claude can be asked; `local` once the credentials were refused. */
  status(): 'claude' | 'local' {
    return this.disabled ? 'local' : 'claude';
  }

  /** A thought for this moment, or null (too soon, busy, failed, refused). Never takes longer than the timeout. */
  async think(r: ThoughtRequest): Promise<string | null> {
    const now = this.now();
    if (this.disabled || this.busy || now < this.nextAt) return null;
    this.busy = true;
    this.nextAt = now + MIND.everyMs[0] + Math.random() * (MIND.everyMs[1] - MIND.everyMs[0]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const seed = num(r?.seed, 1) >>> 0;
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: MIND.maxTokens,
        output_config: { effort: MIND.effort, format: { type: 'json_schema', schema: THOUGHT_SCHEMA } },
        system: [{ type: 'text', text: systemPrompt(seed), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: situationText(r ?? {}) }],
      };
      if (FALLBACK_MODELS.test(this.model)) {
        body.betas = ['server-side-fallback-2026-07-01'];
        body.fallbacks = 'default';
      }
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), this.timeoutMs);
      });
      const msg = await Promise.race([this.api.create(body, { timeout: this.timeoutMs }), timeout]);
      if (msg === null) throw new Error('timed out');
      this.failures = 0;
      return parseThought(msg);
    } catch (err) {
      if (this.isAuthError(err)) this.disabled = true;
      else if (++this.failures >= MIND.failures) {
        this.nextAt = this.now() + MIND.quietMs;
        this.failures = 0;
      }
      return null;
    } finally {
      clearTimeout(timer);
      this.busy = false;
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

/** The thinker, or null when offline, without credentials, or without the SDK installed. */
export async function connectThinker(offline: boolean, env: Readonly<Record<string, string | undefined>> = process.env): Promise<Thinker | null> {
  if (offline || !hasCredentials(env)) return null;
  let sdk: typeof import('@anthropic-ai/sdk');
  try {
    sdk = await import('@anthropic-ai/sdk');
  } catch {
    return null;
  }
  const Anthropic = sdk.default;
  let client: InstanceType<typeof Anthropic>;
  try {
    client = new Anthropic({ maxRetries: 0, timeout: MIND.timeoutMs });
  } catch {
    return null;
  }
  const isAuthError = (err: unknown): boolean => err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError;
  const api: MessagesApi = {
    create: (body, options) => client.beta.messages.create(body as never, options) as unknown as Promise<ApiMessage>,
  };
  const model = env.WANDER_MODEL !== undefined && env.WANDER_MODEL !== '' ? env.WANDER_MODEL : MIND.model;
  return new Thinker(api, isAuthError, model);
}
