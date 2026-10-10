// The sound, as the page sees it: switched on and off with M, louder and softer with + and −, told what is
// happening a few times a second by a worker-driven clock that keeps going in a background window, never by the
// render loop (research: Sound §4). It schedules half a second ahead; footsteps a fifth of a second ahead.
import type { LifeEvent } from '../../src/life.ts';
import { Ambience } from './ambience.ts';
import { Body } from './body.ts';
import { db, Engine } from './engine.ts';
import { hear, newMix } from './heard.ts';
import type { Hear, Mix } from './heard.ts';
import { Music } from './music.ts';

/** Seconds scheduled ahead: events, and footsteps (which must meet the walk cycle). */
const AHEAD = 0.6;
const STEP_AHEAD = 0.2;
/** Continuous layers are re-aimed this often (seconds): never faster than about four times a second (§3). */
const AIM_EVERY = 0.25;

const STORE = 'wander.sound';

/** Calls `fn` about every `ms` from a worker, which background windows do not throttle (Tone.js's clock). */
export function ticker(ms: number, fn: () => void): () => void {
  try {
    const code = `setInterval(() => postMessage(0), ${ms});`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = fn;
    return () => w.terminate();
  } catch {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

type Saved = { on: boolean; volume: number };

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Saved> | null;
    return { on: v?.on !== false, volume: typeof v?.volume === 'number' ? v.volume : 0 };
  } catch {
    return { on: true, volume: 0 };
  }
}

export class Sound {
  private engine: Engine | null = null;
  private ambience: Ambience | null = null;
  private body: Body | null = null;
  private music: Music | null = null;
  private readonly mix: Mix = newMix();
  private aimedAt = -1;
  private readonly seed: number;
  private saved: Saved;
  /** Whether it plays (M), and the volume in dB (+/−, in 2 dB steps). */
  on: boolean;

  constructor(seed: number, muted: boolean) {
    this.seed = seed;
    this.saved = load();
    this.on = !muted && this.saved.on;
    if (this.on) this.start();
    // Browsers start a context suspended until the page is touched (unless launched to allow it).
    const wake = (): void => {
      if (this.on) void this.engine?.ctx.resume().catch(() => {});
    };
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);
  }

  private start(): void {
    if (this.engine !== null) {
      void this.engine.ctx.resume().catch(() => {});
      this.engine.glide(this.engine.master.gain, this.level(), 2);
      return;
    }
    const e = new Engine();
    this.engine = e;
    this.ambience = new Ambience(e);
    this.body = new Body(e);
    this.music = new Music(e, this.seed);
    e.ctx.addEventListener('statechange', () => {
      if (this.on && e.ctx.state === 'suspended') void e.ctx.resume().catch(() => {});
    });
    // Fade in from silence: nothing starts with a jump.
    e.master.gain.setValueAtTime(0, e.now);
    e.glide(e.master.gain, this.level(), 6);
  }

  private level(): number {
    return 0.7 * db(this.saved.volume);
  }

  private keep(): void {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.saved));
    } catch {
      // Private window or blocked storage: the choice lasts until the page closes.
    }
  }

  toggle(): void {
    this.on = !this.on;
    this.saved.on = this.on;
    this.keep();
    if (this.on) this.start();
    else if (this.engine !== null) {
      const e = this.engine;
      e.glide(e.master.gain, 0, 0.6);
      setTimeout(() => {
        if (!this.on) void e.ctx.suspend().catch(() => {});
      }, 800);
    }
  }

  /** Whether it is meant to play but the browser holds it until the page is first touched (a web page). */
  get waiting(): boolean {
    return this.on && this.engine !== null && this.engine.ctx.state !== 'running';
  }

  /** Louder or softer by 2 dB, between −30 and +6. */
  volume(step: number): void {
    this.saved.volume = Math.max(-30, Math.min(6, this.saved.volume + 2 * step));
    this.keep();
    if (this.on && this.engine !== null) this.engine.glide(this.engine.master.gain, this.level(), 0.3);
  }

  /** What the page heard this tick; schedules what falls in the window ahead. */
  tick(h: Hear, wet: boolean): void {
    const e = this.engine;
    if (e === null || !this.on || e.ctx.state !== 'running') return;
    const m = this.mix;
    hear(m, h);
    const now = e.now;
    if (now - this.aimedAt >= AIM_EVERY || this.aimedAt < 0) {
      this.aimedAt = now;
      this.ambience?.update(m);
      this.music?.update(m);
    }
    this.ambience?.schedule(m, now + AHEAD);
    this.music?.schedule(m, now + AHEAD);
    this.body?.steps(m, h.walked, h.ground, wet, now + STEP_AHEAD);
    this.body?.fireSound(m, now + AHEAD);
  }

  /** A train seen crossing, starting at `x` across the screen (0..1). */
  train(x: number): void {
    if (this.on && this.engine?.ctx.state === 'running') this.ambience?.seenTrain(x);
  }

  /** His life's events that make a sound. */
  event(ev: LifeEvent): void {
    if (this.body === null || !this.on || this.engine?.ctx.state !== 'running') return;
    if (ev.type === 'lighter') this.body.lighter(this.mix);
    else if (ev.type === 'drag') this.body.drag(this.mix);
    else if (ev.type === 'exhale') this.body.exhale(this.mix);
  }

  /** For the bar of the tools: what is sounding, and how much has played. */
  status(): Record<string, unknown> {
    const e = this.engine;
    const m = this.mix;
    const r = (v: number): number => Math.round(v * 100) / 100;
    return {
      on: this.on,
      state: e?.ctx.state ?? 'none',
      voices: e?.live ?? 0,
      wind: r(m.wind),
      trees: r(m.trees),
      rain: r(m.rain),
      surf: r(m.surf),
      night: r(m.night),
      dawn: r(m.dawn),
      crickets: r(m.crickets * m.night * (m.temperature > 11 ? 1 : 0) * (m.rain > 0.33 ? 0 : 1)),
      temperature: r(m.temperature),
      fire: r(m.fire),
      ground: this.body?.ground ?? '',
      ambience: { ...this.ambience?.count },
      body: { ...this.body?.count },
      music: { ...this.music?.count },
    };
  }

  /** Records the output for `sec` seconds (the tools measure loudness and draw spectrograms from it). */
  record(sec: number): Promise<Blob | null> {
    const e = this.engine;
    if (e === null) return Promise.resolve(null);
    return new Promise((resolve) => {
      const rec = new MediaRecorder(e.stream(), { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 });
      const parts: Blob[] = [];
      rec.ondataavailable = (ev) => parts.push(ev.data);
      rec.onstop = () => resolve(new Blob(parts, { type: 'audio/webm' }));
      rec.start();
      setTimeout(() => rec.stop(), sec * 1000);
    });
  }
}
