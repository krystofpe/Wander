// The sound engine: one AudioContext tuned for long playback, three buses into a quiet master and a limiter that
// only catches accidents, two generated reverbs, noise made once and looped from random offsets, and one-shot voices
// that disconnect themselves and are capped per kind (research: Sound §1–5, §21, §23–24).

export type Bus = 'amb' | 'sfx' | 'music';
export type NoiseKind = 'white' | 'pink' | 'brown';

/** Voices per kind; past the cap a new event is dropped rather than stealing one (research: Sound §3). */
const CAPS: Readonly<Record<string, number>> = {
  drop: 24,
  crackle: 8,
  bird: 6,
  note: 12,
  step: 6,
  tick: 10,
  wave: 3,
  breath: 3,
  call: 3,
  thunder: 2,
  train: 1,
};

/** Seconds of each looping noise buffer. */
const NOISE_SEC = 8;

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Equal-power pan for a place across the screen (0..1), never hard to one side (research: Sound §24). */
export const panFor = (x: number): number => clamp((x - 0.5) * 2, -1, 1) * 0.75;

/** A dB value as a gain. */
export const db = (v: number): number => 10 ** (v / 20);

export class Engine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly bus: Record<Bus, GainNode>;
  /** The ambience passes a low-pass (snow and fog hush the world) and a high shelf (softer late at night). */
  readonly hush: BiquadFilterNode;
  readonly shelf: BiquadFilterNode;
  /** Sends into the two rooms, and the rooms' levels (open land and forest, crossfaded by the trees around him). */
  readonly send: Record<Bus, GainNode>;
  readonly open: GainNode;
  readonly forest: GainNode;
  readonly noise: Record<NoiseKind, AudioBuffer>;
  /** Slow random control signal (about 0.5 Hz), at a low rate, for things that breathe. */
  readonly slow: AudioBuffer;
  /** For recordings by the tools: the master's output as a stream. */
  private tap: MediaStreamAudioDestinationNode | null = null;
  private readonly voices = new Map<string, number>();
  /** Voices alive now, for the soak. */
  live = 0;

  constructor() {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.limiter = new DynamicsCompressorNode(ctx, { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.25 });
    this.limiter.connect(ctx.destination);
    this.master = new GainNode(ctx, { gain: 0 });
    this.master.connect(this.limiter);
    this.hush = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 16000, Q: 0.5 });
    this.shelf = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 5000, gain: 0 });
    this.hush.connect(this.shelf).connect(this.master);
    this.bus = {
      amb: new GainNode(ctx, { gain: 1 }),
      sfx: new GainNode(ctx, { gain: 1 }),
      music: new GainNode(ctx, { gain: 1 }),
    };
    this.bus.amb.connect(this.hush);
    this.bus.sfx.connect(this.master);
    this.bus.music.connect(this.master);

    const rate = ctx.sampleRate;
    this.open = new GainNode(ctx, { gain: 0.5 });
    this.forest = new GainNode(ctx, { gain: 0.5 });
    const openRoom = new ConvolverNode(ctx, { buffer: room(ctx, 4.5, 0.02, 8000, 1500, 11) });
    const forestRoom = new ConvolverNode(ctx, { buffer: room(ctx, 2.2, 0.008, 5000, 2500, 23) });
    const wet = new GainNode(ctx, { gain: 1 });
    wet.connect(openRoom).connect(this.open).connect(this.master);
    wet.connect(forestRoom).connect(this.forest).connect(this.master);
    this.send = {
      amb: new GainNode(ctx, { gain: 0.18 }),
      sfx: new GainNode(ctx, { gain: 0.12 }),
      music: new GainNode(ctx, { gain: 0.45 }),
    };
    for (const b of ['amb', 'sfx', 'music'] as const) this.bus[b].connect(this.send[b]).connect(wet);

    this.noise = { white: makeNoise(ctx, 'white', rate), pink: makeNoise(ctx, 'pink', rate), brown: makeNoise(ctx, 'brown', rate) };
    this.slow = smoothNoise(ctx, 61, 0.5, 7);
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  /** A looping noise source started at a random point, at a slightly different rate from every other. */
  loop(kind: NoiseKind, rate = 0.97 + Math.random() * 0.06): AudioBufferSourceNode {
    const src = new AudioBufferSourceNode(this.ctx, { buffer: this.noise[kind], loop: true, playbackRate: rate });
    src.start(this.now, Math.random() * (NOISE_SEC - 0.01));
    return src;
  }

  /** A slice of noise for an event: starts at `at`, stops after `dur` seconds (looping when that is long). */
  burst(kind: NoiseKind, at: number, dur: number): AudioBufferSourceNode {
    const long = dur > NOISE_SEC / 2;
    const src = new AudioBufferSourceNode(this.ctx, { buffer: this.noise[kind], loop: long });
    src.start(at, Math.random() * (long ? NOISE_SEC - 0.01 : NOISE_SEC - dur - 0.01), dur + 0.01);
    return src;
  }

  /** Takes a voice of this kind if one is free. */
  take(kind: string): boolean {
    const n = this.voices.get(kind) ?? 0;
    if (n >= (CAPS[kind] ?? 8)) return false;
    this.voices.set(kind, n + 1);
    this.live++;
    return true;
  }

  /** Gives back a voice taken with take(). */
  release(kind: string): void {
    this.voices.set(kind, (this.voices.get(kind) ?? 1) - 1);
    this.live--;
  }

  /** When `source` ends, disconnects every node of the voice and gives the voice back. */
  free(kind: string, source: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
    source.onended = () => {
      source.disconnect();
      for (const n of nodes) n.disconnect();
      this.release(kind);
    };
  }

  /**
   * A silent source that ends at `end`, to free a voice made of many parts. It feeds `into` (adding nothing) so
   * that it is processed, and so ends, on every engine.
   */
  timer(at: number, end: number, into: AudioNode): ConstantSourceNode {
    const t = new ConstantSourceNode(this.ctx, { offset: 0 });
    t.connect(into);
    t.start(at);
    t.stop(end);
    return t;
  }

  /** A gain set to a level, panned to a place, into a bus: the usual end of a voice. */
  out(bus: Bus, gain: number, pan: number): { gain: GainNode; pan: StereoPannerNode } {
    const g = new GainNode(this.ctx, { gain });
    const p = new StereoPannerNode(this.ctx, { pan });
    g.connect(p).connect(this.bus[bus]);
    return { gain: g, pan: p };
  }

  /** Moves a parameter toward a value over about `sec` seconds (three time constants). */
  glide(param: AudioParam, value: number, sec: number): void {
    param.setTargetAtTime(value, this.now, Math.max(0.005, sec / 3));
  }

  /** The master output as a stream (the tools record it). */
  stream(): MediaStream {
    if (this.tap === null) {
      this.tap = this.ctx.createMediaStreamDestination();
      this.limiter.connect(this.tap);
    }
    return this.tap.stream;
  }
}

/** White, pink (Paul Kellet's filter) or brown noise, stereo with independent channels (research: Sound §2). */
function makeNoise(ctx: BaseAudioContext, kind: NoiseKind, rate: number): AudioBuffer {
  const len = Math.floor(NOISE_SEC * rate);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362 + w * 0.115926) * 0.11;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // The ends meet without a click.
    const fade = Math.min(256, len >> 4);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
    }
  }
  return buf;
}

/** Smooth random values in −1..1 at `hz` changes a second, over `sec` seconds, at a low sample rate. */
function smoothNoise(ctx: BaseAudioContext, sec: number, hz: number, seed: number): AudioBuffer {
  const rate = 3000;
  const len = sec * rate;
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  const knots = Math.ceil(sec * hz);
  let s = seed;
  const r = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
  const k = Array.from({ length: knots }, r);
  for (let i = 0; i < len; i++) {
    const x = (i / len) * knots;
    const a = Math.floor(x);
    const f = x - a;
    const e = f * f * (3 - 2 * f);
    d[i] = k[a % knots] * (1 - e) + k[(a + 1) % knots] * e;
  }
  return buf;
}

/**
 * A room's impulse response, made in place: stereo noise under an exponential decay after a pre-delay, low-passed
 * more and more along the tail so it darkens as it fades (research: Sound §21).
 */
function room(ctx: BaseAudioContext, decay: number, pre: number, brightHz: number, darkHz: number, seed: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor((decay + pre) * rate);
  const buf = ctx.createBuffer(2, len, rate);
  let s = seed;
  const r = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
  const start = Math.floor(pre * rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = start; i < len; i++) {
      const t = (i - start) / rate;
      const k = t / decay;
      const hz = brightHz * (darkHz / brightHz) ** k;
      const a = Math.exp((-2 * Math.PI * hz) / rate);
      lp = lp * a + r() * (1 - a);
      d[i] = lp * Math.exp((-6.9 * t) / decay);
    }
  }
  return buf;
}
