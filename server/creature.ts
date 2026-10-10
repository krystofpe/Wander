// The creature on the server: its save file and its Claude voice.
//
// The file is the terminal creature's own, $XDG_DATA_HOME/wander/creature.json (default ~/.local/share/wander), so a
// creature from those days lives on here; written atomically, a broken file moved aside rather than lost, a new
// creature keeping the old one as .bak. The voice is the terminal creature's Mind (feat/creature src/mind.ts) moved
// to the server: one request at a time, a short history, at most one unprompted line every few minutes, quiet after
// repeated failures, off for the session when the credentials are refused. Anything else falls back to the page's
// local voice, which never waits for this.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { AI } from '../src/creature/config.ts';
import type { Life } from '../src/creature/life.ts';
import { REPLY_SCHEMA, parseReply, systemPrompt } from '../src/creature/mind.ts';
import type { ApiMessage, MessagesApi, Reply } from '../src/creature/mind.ts';
import { revive } from '../src/creature/save.ts';
import { hasCredentials } from './mind.ts';

export function defaultCreaturePath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const xdg = env.XDG_DATA_HOME;
  const base = xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'wander', 'creature.json');
}

export class CreatureStore {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** The saved life as it was written (the page revives it and lives through the time away), or null. */
  load(): unknown {
    if (!existsSync(this.path)) return null;
    try {
      const data: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      revive(data, this.path);
      return data;
    } catch {
      renameSync(this.path, `${this.path}.broken`);
      return null;
    }
  }

  /** Saves atomically: a temporary file, then a rename. Refuses anything that is not a creature. */
  save(data: unknown): void {
    const life = revive(data, 'the page');
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(life, null, 1)}\n`);
    renameSync(tmp, this.path);
  }

  /** Starts over: the old creature is kept as .bak. */
  fresh(): void {
    if (existsSync(this.path)) renameSync(this.path, `${this.path}.bak`);
  }
}

/** Models that take the server-side refusal fallback. */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5|sonnet-5-5)/;

type Turn = { readonly role: 'user' | 'assistant'; readonly content: string };

/** What the page sends for its words: who it is, what is going on, and whether it volunteers them. */
export type SayRequest = { readonly life?: unknown; readonly situation?: unknown; readonly volunteered?: unknown };

/** Talks to Claude for the creature, one request at a time, keeping a short history. */
export class CreatureMind {
  readonly model: string;
  /** Set when credentials are refused; it then stays local for the session. */
  disabled = false;
  private queue: Promise<unknown> = Promise.resolve();
  private inFlight = 0;
  private history: Turn[] = [];
  private lastVolunteer = -Infinity;
  private failures = 0;
  private quietUntil = 0;
  private readonly api: MessagesApi;
  private readonly isAuthError: (err: unknown) => boolean;
  private readonly now: () => number;

  constructor(api: MessagesApi, isAuthError: (err: unknown) => boolean, model: string = AI.model, now: () => number = () => performance.now() / 1000) {
    this.api = api;
    this.isAuthError = isAuthError;
    this.model = model;
    this.now = now;
  }

  status(): 'claude' | 'local' {
    return this.disabled ? 'local' : 'claude';
  }

  /**
   * Its words for this moment, or null: on any failure, while another unprompted request is out, or when an
   * unprompted one comes sooner than allowed. An answer to you waits its turn.
   */
  ask(r: SayRequest): Promise<Reply | null> {
    const now = this.now();
    const volunteered = r.volunteered === true;
    if (this.disabled || now < this.quietUntil || typeof r.situation !== 'string') return Promise.resolve(null);
    if (volunteered && (this.inFlight > 0 || now - this.lastVolunteer < AI.spontaneousEverySec * 0.8)) return Promise.resolve(null);
    let life: Life;
    try {
      life = revive(r.life, 'the request');
    } catch {
      return Promise.resolve(null);
    }
    if (volunteered) this.lastVolunteer = now;
    this.inFlight++;
    const situation = r.situation.slice(0, 4000);
    const turn = this.queue.then(() => this.send(life, situation)).finally(() => this.inFlight--);
    this.queue = turn;
    return turn;
  }

  private async send(life: Life, situation: string): Promise<Reply | null> {
    if (this.disabled) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: AI.maxTokens,
        output_config: { effort: AI.effort, format: { type: 'json_schema', schema: REPLY_SCHEMA } },
        system: [{ type: 'text', text: systemPrompt(life), cache_control: { type: 'ephemeral' } }],
        messages: [...this.history, { role: 'user', content: situation }],
      };
      if (FALLBACK_MODELS.test(this.model)) {
        body.betas = ['server-side-fallback-2026-07-01'];
        body.fallbacks = 'default';
      }
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), AI.timeoutMs);
      });
      const msg = await Promise.race([this.api.create(body, { timeout: AI.timeoutMs }), timeout]);
      if (msg === null) throw new Error('timed out');
      const reply = parseReply(msg as ApiMessage);
      this.failures = 0;
      if (reply !== null) {
        this.history.push({ role: 'user', content: situation }, { role: 'assistant', content: JSON.stringify(reply) });
        // Whole exchanges drop from the front; the history is plain text, so trimming it is safe.
        while (this.history.length > AI.historyTurns * 2) this.history.splice(0, 2);
      }
      return reply;
    } catch (err) {
      if (this.isAuthError(err)) this.disabled = true;
      else if (++this.failures >= 3) {
        this.quietUntil = this.now() + 300;
        this.failures = 0;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The creature's Claude voice, or null when offline, without credentials, or without the SDK installed. */
export async function connectCreatureMind(offline: boolean, env: Readonly<Record<string, string | undefined>> = process.env): Promise<CreatureMind | null> {
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
    client = new Anthropic({ maxRetries: 0, timeout: AI.timeoutMs });
  } catch {
    return null;
  }
  const isAuthError = (err: unknown): boolean => err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError;
  const api: MessagesApi = {
    create: (body, options) => client.beta.messages.create(body as never, options) as unknown as Promise<ApiMessage>,
  };
  const model = env.WANDER_MODEL !== undefined && env.WANDER_MODEL !== '' ? env.WANDER_MODEL : AI.model;
  return new CreatureMind(api, isAuthError, model);
}
