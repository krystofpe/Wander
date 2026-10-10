// The music: soft, sparse and unmetered, after Eno's incommensurable loops and Generative.fm's instruments. Each
// voice of each instrument repeats on its own loop length, plays only by chance, and that chance swells and thins
// over minutes. The notes come from the mode of the place; the hour sets which instruments speak; rain makes the
// plucks twinkle high; at the fire a pad rests on the root; a drone sits far below at night (research: Sound
// §18–22).
import { panFor } from './engine.ts';
import type { Engine } from './engine.ts';
import type { Mix } from './heard.ts';

type Voice = 'pluck' | 'bell' | 'pad';

type Slot = {
  readonly voice: Voice;
  /** Which degree of the mode, counted up from the instrument's register. */
  readonly degree: number;
  /** Seconds between its chances to play: incommensurable across slots. */
  readonly loop: number;
  next: number;
};

type Instrument = {
  readonly voice: Voice;
  /** The register's lowest note, semitones above the root. */
  readonly octave: number;
  /** Seconds of the instrument's slow swell (Lemniscate-style), and where in it this road starts. */
  readonly swell: number;
  readonly phase: number;
};

const INSTRUMENTS: readonly Instrument[] = [
  { voice: 'pluck', octave: 12, swell: 480, phase: 0 },
  { voice: 'bell', octave: 24, swell: 610, phase: 2.1 },
  { voice: 'pad', octave: 0, swell: 730, phase: 4.2 },
];

/** Loop lengths in seconds, prime tenths, so the pattern never comes round again within a night. */
const LOOPS: Readonly<Record<Voice, readonly number[]>> = {
  pluck: [17.3, 19.7, 22.3, 26.9, 29.3, 31.7, 37.1, 41.3],
  bell: [43.1, 47.9, 53.9, 61.1],
  pad: [47.3, 59.3, 71.3],
};

/** Degrees per slot: the plucks walk the mode; bells and pads keep to chord tones (root, third, fifth, ninth). */
const DEGREES: Readonly<Record<Voice, readonly number[]>> = {
  pluck: [0, 2, 4, 1, 3, 5, 7, 6],
  bell: [4, 7, 9, 8],
  pad: [0, 4, 2],
};

const LEVEL = { pluck: 0.11, bell: 0.035, pad: 0.035, drone: 0.05, motif: 0.09 } as const;

/** The landmarks that have a motif: the lone tree, the stone arch, the waterfall. */
const MOTIF_PLACES: ReadonlySet<string> = new Set(['lonetree', 'arch', 'waterfall']);

const ROOTS = [38, 40, 41, 43, 45];

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class Music {
  private readonly e: Engine;
  private readonly root: number;
  private readonly slots: Slot[] = [];
  private readonly plucks = new Map<number, AudioBuffer>();
  private readonly drone: GainNode;
  private readonly droneOscs: OscillatorNode[] = [];
  private readonly droneLow: BiquadFilterNode;
  private motifFor: string | null = null;
  readonly count = { pluck: 0, bell: 0, pad: 0, motif: 0 };

  constructor(e: Engine, seed: number) {
    this.e = e;
    this.root = ROOTS[seed % ROOTS.length];
    const now = e.now;
    for (const ins of INSTRUMENTS) {
      LOOPS[ins.voice].forEach((loop, i) => this.slots.push({ voice: ins.voice, degree: DEGREES[ins.voice][i], loop, next: now + 4 + Math.random() * loop }));
    }
    // The drone: root and fifth an octave below the pads, a slow filter breathing over them.
    const ctx = e.ctx;
    this.drone = new GainNode(ctx, { gain: 0 });
    this.droneLow = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 300, Q: 1.2 });
    this.drone.connect(this.droneLow).connect(e.bus.music);
    for (const [st, det, type] of [
      [0, -4, 'sawtooth'],
      [0, 5, 'triangle'],
      [7, 2, 'triangle'],
    ] as const) {
      const o = new OscillatorNode(ctx, { type, frequency: hz(this.root + st), detune: det });
      const g = new GainNode(ctx, { gain: st === 0 ? 0.5 : 0.3 });
      o.connect(g).connect(this.drone);
      o.start();
      this.droneOscs.push(o);
    }
    const sweep = new AudioBufferSourceNode(ctx, { buffer: e.slow, loop: true, playbackRate: 0.25 });
    const depth = new GainNode(ctx, { gain: 180 });
    sweep.connect(depth).connect(this.droneLow.frequency);
    sweep.start(now, Math.random() * 60);
  }

  /** How much the music speaks now: thinner by day, nearly gone in a storm, quiet while he sleeps. */
  private presence(m: Mix): number {
    const storm = m.storm ? 0.15 : 1 - 0.5 * Math.min(1, m.rain * 1.4);
    const sleep = m.sleeping ? 0.45 : 1;
    return storm * sleep;
  }

  update(m: Mix): void {
    const e = this.e;
    const drone = LEVEL.drone * (0.25 + 0.75 * m.night) * (m.fire > 0.2 ? 1.2 : 1) * (m.storm ? 0.2 : 1);
    e.glide(this.drone.gain, drone, 20);
  }

  schedule(m: Mix, until: number): void {
    const e = this.e;
    const now = e.now;
    const presence = this.presence(m);
    for (const s of this.slots) {
      if (s.next < now) s.next = now + Math.random() * 2;
      if (s.next >= until) continue;
      const at = s.next;
      s.next += s.loop;
      const ins = INSTRUMENTS.find((x) => x.voice === s.voice) as Instrument;
      const swell = 0.5 + 0.5 * Math.sin((2 * Math.PI * m.time) / ins.swell + ins.phase);
      if (Math.random() > this.chance(s.voice, m) * presence * (0.25 + 0.75 * swell)) continue;
      let midi = this.note(m.mode, s.degree, ins.octave);
      if (s.voice === 'pluck' && m.rain > 0.08 && m.rain < 0.55 && Math.random() < 0.6) midi += 12;
      if (s.voice === 'pad' && m.fire > 0.3) midi = this.root + 12;
      if (s.voice === 'pluck') this.pluck(at, midi, panFor(Math.random()), 1);
      else if (s.voice === 'bell') this.bell(at, midi);
      else this.pad(at, midi);
      this.count[s.voice]++;
    }
    // A place with a motif of its own: it sounds once, slowed and dim, as he comes near (after Kentucky Route Zero).
    const motif = m.landmark !== null && MOTIF_PLACES.has(m.landmark) ? `${m.landmark}${m.place}` : null;
    if (motif !== null && motif !== this.motifFor && presence > 0.3) {
      this.motifFor = motif;
      const tune = [0, 4, 2, 7, 4, 0];
      let t = now + 0.5;
      for (const d of tune) {
        this.pluck(t, this.note(m.mode, d, 24), -0.2 + Math.random() * 0.4, 0.5);
        t += 1.7 + Math.random() * 0.8;
      }
      this.count.motif++;
    } else if (motif === null) this.motifFor = null;
  }

  /** The chance a slot of this voice plays when its turn comes, by the hour. */
  private chance(voice: Voice, m: Mix): number {
    const golden = Math.exp(-(((m.hour - 18.5) / 1.6) ** 2)) + Math.exp(-(((m.hour - 6.5) / 1.2) ** 2));
    if (voice === 'pluck') return 0.25 + 0.3 * golden + 0.15 * m.night + (m.rain > 0.08 ? 0.2 : 0);
    if (voice === 'bell') return 0.1 + 0.35 * m.night + 0.15 * golden;
    return 0.15 + 0.45 * m.night + (m.fire > 0.3 ? 0.3 : 0);
  }

  /** The MIDI note of a degree of the mode, counted up from a register above the root. */
  private note(mode: readonly number[], degree: number, octave: number): number {
    const n = mode.length;
    return this.root + octave + mode[degree % n] + 12 * Math.floor(degree / n);
  }

  /** A plucked string, Karplus-Strong, computed once per note (research: Sound §20). */
  private pluck(at: number, midi: number, pan: number, rate: number): void {
    const e = this.e;
    if (!e.take('note')) return;
    const buffer = this.pluckBuffer(midi);
    const src = new AudioBufferSourceNode(e.ctx, { buffer, playbackRate: rate });
    const low = new BiquadFilterNode(e.ctx, { type: 'lowpass', frequency: rate < 1 ? 1200 : 2400 + Math.random() * 2400, Q: 0.5 });
    const out = e.out('music', LEVEL.pluck * (0.6 + 0.4 * Math.random()), pan);
    src.connect(low).connect(out.gain);
    src.start(at);
    e.free('note', src, [low, out.gain, out.pan]);
  }

  private pluckBuffer(midi: number): AudioBuffer {
    const have = this.plucks.get(midi);
    if (have !== undefined) return have;
    if (this.plucks.size >= 40) this.plucks.delete(this.plucks.keys().next().value as number);
    const rate = 22050;
    const len = rate * 3;
    const buf = this.e.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    const period = rate / hz(midi) - 0.5;
    const n = Math.max(2, Math.floor(period));
    const frac = period - n;
    const line = new Float32Array(n + 2);
    // The excitation: a burst of noise, softened so the string sounds felt rather than picked.
    let lp = 0;
    for (let i = 0; i < line.length; i++) {
      lp = lp * 0.5 + (Math.random() * 2 - 1) * 0.5;
      line[i] = lp;
    }
    const rho = 0.996 + Math.min(0.003, (60 - Math.min(60, midi - 40)) * 0.00005);
    let w = 0;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const a = line[w];
      const b = line[(w + 1) % line.length];
      const y = a + (b - a) * frac;
      d[i] = y;
      const next = rho * 0.5 * (y + prev);
      prev = y;
      line[w] = next;
      w = (w + 1) % (n + 1);
    }
    // A soft attack and a fade at the end.
    for (let i = 0; i < 64; i++) d[i] *= i / 64;
    for (let i = 0; i < 2000; i++) d[len - 1 - i] *= i / 2000;
    this.plucks.set(midi, buf);
    return buf;
  }

  /** An FM bell after Chowning: carrier and modulator at 1 : 1.4, the index falling with the level. */
  private bell(at: number, midi: number): void {
    const e = this.e;
    if (!e.take('note')) return;
    const ctx = e.ctx;
    const f = hz(midi);
    const decay = 6 + Math.random() * 4;
    const carrier = new OscillatorNode(ctx, { frequency: f });
    const mod = new OscillatorNode(ctx, { frequency: f * 1.4 });
    const index = new GainNode(ctx, { gain: 0 });
    mod.connect(index).connect(carrier.frequency);
    const out = e.out('music', 0, panFor(0.2 + Math.random() * 0.6));
    carrier.connect(out.gain);
    const peak = LEVEL.bell * (0.6 + 0.4 * Math.random());
    const imax = (2 + Math.random() * 2) * f * 1.4;
    out.gain.gain.setValueAtTime(0, at);
    out.gain.gain.linearRampToValueAtTime(peak, at + 0.01);
    out.gain.gain.setTargetAtTime(0, at + 0.01, decay / 5);
    index.gain.setValueAtTime(imax, at);
    index.gain.setTargetAtTime(0, at, decay / 5);
    carrier.start(at);
    mod.start(at);
    carrier.stop(at + decay);
    mod.stop(at + decay);
    e.free('note', carrier, [mod, index, out.gain, out.pan]);
  }

  /** A pad: three detuned voices through a low-pass, a slow attack and a slower release. */
  private pad(at: number, midi: number): void {
    const e = this.e;
    if (!e.take('note')) return;
    const ctx = e.ctx;
    const attack = 4 + Math.random() * 4;
    const hold = 4 + Math.random() * 6;
    const release = 8 + Math.random() * 4;
    const end = at + attack + hold + release;
    const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700 + Math.random() * 600, Q: 0.7 });
    const out = e.out('music', 0, panFor(0.3 + Math.random() * 0.4));
    low.connect(out.gain);
    const oscs: OscillatorNode[] = [];
    const parts: AudioNode[] = [low, out.gain, out.pan];
    for (const det of [-6, 0, 5]) {
      const o = new OscillatorNode(ctx, { type: det === 0 ? 'triangle' : 'sawtooth', frequency: hz(midi), detune: det + (Math.random() - 0.5) * 2 });
      const g = new GainNode(ctx, { gain: det === 0 ? 0.6 : 0.25 });
      o.connect(g).connect(low);
      o.start(at);
      o.stop(end);
      oscs.push(o);
      parts.push(g);
    }
    const g = out.gain.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(LEVEL.pad, at + attack);
    g.setValueAtTime(LEVEL.pad, at + attack + hold);
    g.linearRampToValueAtTime(0, end);
    e.free('note', oscs[0], [...parts, ...oscs.slice(1)]);
  }
}
