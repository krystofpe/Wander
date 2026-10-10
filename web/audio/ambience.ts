// The world's sounds: wind (a body, trees, whistles and leaf ticks fed by one gusting speed), rain (a bed, a
// boiling layer and drops by surface), the coast's waves, crickets on warm nights, birds by day, an owl now and
// then, a train far off, and thunder after each flash (research: Sound §7–10, §14–17).
import { flashIn, FLASH_WINDOW } from '../../src/sky.ts';
import { db, panFor } from './engine.ts';
import type { Engine } from './engine.ts';
import type { Mix } from './heard.ts';

/** Layer levels, tuned by ear and by measured loudness (research: Sound §23). */
const LEVEL = {
  body: 1.1,
  trees: 0.9,
  whistle: 0.5,
  leaf: 0.16,
  bed: 0.25,
  boil: 0.06,
  drop: 0.08,
  surfBed: 0.22,
  wave: 0.5,
  cricket: 0.016,
  bird: 0.035,
  owl: 0.07,
  train: 0.05,
  thunder: 0.45,
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A Poisson process's next gap, seconds, for a rate per second. */
const gap = (rate: number): number => -Math.log(1 - Math.random()) / Math.max(1e-6, rate);

export class Ambience {
  private readonly e: Engine;
  // Wind.
  private readonly body: GainNode;
  private readonly bodyBand: BiquadFilterNode;
  private readonly bodyShelf: BiquadFilterNode;
  private readonly treesL: GainNode;
  private readonly treesR: GainNode;
  private readonly treesBandL: BiquadFilterNode;
  private readonly treesBandR: BiquadFilterNode;
  private readonly whistles: { gain: GainNode; band: BiquadFilterNode; lo: number; hi: number; hz: number }[] = [];
  // Rain.
  private readonly bed: GainNode;
  private readonly bedLow: BiquadFilterNode[] = [];
  private readonly boil: GainNode;
  private readonly boilBand: BiquadFilterNode;
  // The coast's bed.
  private readonly surf: GainNode;
  // Crickets.
  private readonly crickets: { gain: GainNode; env: AudioBufferSourceNode; rate: number }[] = [];
  // Pre-made drops.
  private readonly clicks: AudioBuffer[];
  private readonly plinks: AudioBuffer[];
  private readonly ticks: AudioBuffer[];
  // Event clocks, in AudioContext seconds.
  private nextLeaf = 0;
  private nextDrop = 0;
  private nextWave = 0;
  private nextOwl = 0;
  private nextTrain = 0;
  private flashDone = -1;
  private readonly birds = new Birds();
  /** How many of each event have played (the soak and the 30-minute run read these). */
  readonly count = { leaf: 0, drop: 0, wave: 0, owl: 0, train: 0, thunder: 0, bird: 0 };

  constructor(e: Engine) {
    this.e = e;
    const ctx = e.ctx;
    const amb = e.bus.amb;

    // Wind body: pink noise through a broad 800 Hz band, brighter as it rises (research: Sound §7).
    this.bodyBand = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 800, Q: 0.9 });
    this.bodyShelf = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 2000, gain: 0 });
    this.body = new GainNode(ctx, { gain: 0 });
    e.loop('pink').connect(this.bodyBand).connect(this.bodyShelf).connect(this.body).connect(amb);

    // Wind in the trees: two decorrelated broad bands, left and right, each fed the gust a little later.
    const trees = (pan: number): [GainNode, BiquadFilterNode] => {
      const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2500, Q: 0.7 });
      const g = new GainNode(ctx, { gain: 0 });
      e.loop('pink').connect(band).connect(g).connect(new StereoPannerNode(ctx, { pan })).connect(amb);
      return [g, band];
    };
    [this.treesL, this.treesBandL] = trees(-0.6);
    [this.treesR, this.treesBandR] = trees(0.55);

    // Whistles: narrow bands that sing only inside their own band of wind speeds.
    for (const [hz, lo, hi, pan] of [
      [420, 0.35, 0.6, 0.6],
      [210, 0.25, 0.5, -0.7],
      [690, 0.5, 0.85, 0.2],
    ] as const) {
      const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: hz, Q: 40 });
      const gain = new GainNode(ctx, { gain: 0 });
      e.loop('white').connect(band).connect(gain).connect(new StereoPannerNode(ctx, { pan })).connect(amb);
      this.whistles.push({ gain, band, lo, hi, hz });
    }

    // Rain bed: two pink sources hard apart, a high-pass and a low-pass that opens as it pours (research: Sound §8).
    this.bed = new GainNode(ctx, { gain: 0 });
    for (const pan of [-0.9, 0.9]) {
      const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3000, Q: 0.5 });
      e.loop('pink')
        .connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 400, Q: 0.5 }))
        .connect(low)
        .connect(new StereoPannerNode(ctx, { pan }))
        .connect(this.bed);
      this.bedLow.push(low);
    }
    this.bed.connect(amb);
    this.boilBand = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2000, Q: 2 });
    this.boil = new GainNode(ctx, { gain: 0 });
    e.loop('white').connect(this.boilBand).connect(this.boil).connect(amb);

    // The coast: a low constant surf under the waves.
    this.surf = new GainNode(ctx, { gain: 0 });
    e.loop('brown').connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 220, Q: 0.5 })).connect(this.surf).connect(amb);

    // Crickets: Farnell's pulsed carriers near 4.5 kHz, gated by a looping chirp envelope whose rate follows the
    // temperature by Dolbear's law (research: Sound §15).
    const chirp = chirpEnvelope(ctx);
    for (const [hz, pan] of [
      [4420, -0.5],
      [4610, 0.35],
      [4530, 0.8],
    ] as const) {
      const gate = new GainNode(ctx, { gain: 0 });
      const a = new OscillatorNode(ctx, { frequency: hz });
      const b = new OscillatorNode(ctx, { frequency: hz * 2 });
      const bGain = new GainNode(ctx, { gain: 0.3 });
      a.connect(gate);
      b.connect(bGain).connect(gate);
      a.start();
      b.start();
      const env = new AudioBufferSourceNode(ctx, { buffer: chirp, loop: true });
      env.connect(gate.gain);
      env.start(e.now + Math.random() * 0.7);
      const gain = new GainNode(ctx, { gain: 0 });
      gate.connect(gain).connect(new StereoPannerNode(ctx, { pan })).connect(amb);
      this.crickets.push({ gain, env, rate: 0.97 + Math.random() * 0.06 });
    }

    this.clicks = Array.from({ length: 8 }, () => dropClick(ctx));
    this.plinks = Array.from({ length: 8 }, () => dropPlink(ctx));
    this.ticks = Array.from({ length: 8 }, () => leafTick(ctx));
    const now = e.now;
    this.nextOwl = now + 40 + Math.random() * 60;
    this.nextTrain = now + 120 + Math.random() * 240;
  }

  /** Sets every continuous layer's target from the mix (called about four times a second). */
  update(m: Mix): void {
    const e = this.e;
    const hushed = 1 - 0.35 * m.snow;
    // Wind: the body always (it is the bed everything sits on), louder and brighter as it rises.
    const w = m.wind;
    e.glide(this.body.gain, LEVEL.body * (0.05 + 0.5 * w * w + 0.12 * w) * hushed, 0.6);
    e.glide(this.bodyBand.frequency, 650 + 450 * w - 200 * m.snow, 0.6);
    e.glide(this.bodyShelf.gain, 6 * w - 6 * m.snow, 0.6);
    const tree = (wl: number): number => LEVEL.trees * m.trees * (0.03 + 0.7 * (wl + 0.12) ** 2) * hushed;
    e.glide(this.treesL.gain, tree(m.windLate), 0.5);
    e.glide(this.treesR.gain, tree(m.windLater), 0.5);
    e.glide(this.treesBandL.frequency, 1500 + 2500 * m.windLate, 0.5);
    e.glide(this.treesBandR.frequency, 1700 + 2600 * m.windLater, 0.5);
    for (const wh of this.whistles) {
      const x = clamp01((w - wh.lo) / (wh.hi - wh.lo));
      const bell = x > 0 && x < 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * x) : 0;
      e.glide(wh.gain.gain, LEVEL.whistle * m.whistle * bell, 1.5);
      e.glide(wh.band.frequency, wh.hz * (0.94 + 0.12 * x), 1.5);
    }
    // Rain.
    const r = m.rain;
    e.glide(this.bed.gain, LEVEL.bed * r ** 0.7, 4);
    for (const low of this.bedLow) e.glide(low.frequency, 3000 + 5000 * r, 4);
    e.glide(this.boil.gain, LEVEL.boil * r, 4);
    e.glide(this.boilBand.frequency, 1800 + 300 * Math.random(), 0.3);
    // The coast, under any weather.
    e.glide(this.surf.gain, LEVEL.surfBed * m.surf * (0.6 + 0.6 * m.wind), 8);
    // Crickets: warm dry nights, slowing as the night cools (N = 7·T − 30 chirps a minute).
    const t = m.temperature;
    const warm = clamp01((t - 11) / 4);
    const cricket = LEVEL.cricket * m.crickets * m.night * warm * (1 - clamp01(r * 3)) * (1 - m.snow) * (1 - 0.6 * w);
    const perMinute = Math.max(40, 7 * t - 30);
    for (const c of this.crickets) {
      e.glide(c.gain.gain, cricket, 30);
      e.glide(c.env.playbackRate, (perMinute / 85.7) * c.rate, 10);
    }
    // Late at night the ambience softens above 5 kHz; snow and fog hush the world.
    const late = m.night * (m.hour >= 23 || m.hour < 5 ? 1 : 0.3);
    e.glide(e.shelf.gain, -3 * late, 60);
    e.glide(e.hush.frequency, 16000 - 9000 * Math.max(m.snow, m.fog * 0.6), 10);
    // The room: forest around him, or open land.
    e.glide(e.forest.gain, 0.15 + 0.6 * m.trees, 10);
    e.glide(e.open.gain, 0.7 - 0.5 * m.trees, 10);
  }

  /** Schedules the events falling before `until` (AudioContext seconds). */
  schedule(m: Mix, until: number): void {
    const e = this.e;
    const now = e.now;
    // Leaves ticking in the gusts, thicker as the wind rises.
    const leafRate = m.leaves * 14 * Math.max(0, m.windLeaves - 0.18) + m.trees * 1.5 * Math.max(0, m.windLeaves - 0.3);
    // A wait drawn while the rate was near nothing is drawn again when it rises (rain starting, a gust).
    if (this.nextLeaf < now || (leafRate > 0.2 && this.nextLeaf > now + 10 / leafRate)) this.nextLeaf = now + gap(Math.max(leafRate, 0.01));
    while (this.nextLeaf < until) {
      if (leafRate > 0.02) this.play(this.ticks, this.nextLeaf, LEVEL.leaf * (0.4 + Math.random() * 0.6), Math.random() * 1.6 - 0.8, 'tick', 0.8 + Math.random() * 0.5) && this.count.leaf++;
      this.nextLeaf += gap(Math.max(leafRate, 0.01));
    }
    // Drops: their sound depends on what they land on (research: Sound §8).
    const dropRate = m.rain > 0.02 ? Math.min(30, 3 + 30 * m.rain) : 0;
    if (this.nextDrop < now || (dropRate > 0 && this.nextDrop > now + 10 / dropRate)) this.nextDrop = now + gap(Math.max(dropRate, 0.01));
    while (this.nextDrop < until) {
      if (dropRate > 0) {
        const x = Math.random();
        const kind = x < m.water * 0.6 ? this.plinks : x < m.water * 0.6 + m.trees * 0.5 ? this.ticks : this.clicks;
        this.play(kind, this.nextDrop, LEVEL.drop * (0.2 + 0.8 * Math.random() ** 2), Math.random() * 1.8 - 0.9, 'drop', 0.85 + Math.random() * 0.3) && this.count.drop++;
      }
      this.nextDrop += gap(Math.max(dropRate, 0.01));
    }
    // Waves on the coast: a dominant period with jitter, shorter in a storm (research: Sound §10).
    if (m.surf > 0.05) {
      if (this.nextWave < now) this.nextWave = now + 0.3;
      while (this.nextWave < until) {
        this.wave(this.nextWave, m);
        const period = m.storm ? 7 : 9;
        this.nextWave += period * (0.7 + 0.6 * Math.random());
      }
    } else this.nextWave = 0;
    this.birds.schedule(e, m, until, this.count);
    // An owl after dusk in the woods, every one to three minutes (research: Sound §16).
    if (this.nextOwl < until) {
      if (m.owls > 0.2 && m.night > 0.8 && m.rain < 0.2 && !m.storm && Math.random() < m.owls) {
        this.owl(Math.max(now + 0.05, this.nextOwl));
        this.count.owl++;
      }
      this.nextOwl = Math.max(now, this.nextOwl) + 60 + Math.random() * 120;
    }
    // A train, heard and never seen: by the rail line every few minutes, elsewhere hardly ever (research: Sound §17).
    if (this.nextTrain < until) {
      const chance = m.train > 0.3 ? 0.8 * m.train : m.night > 0.9 ? 0.04 : 0;
      if (Math.random() < chance && e.take('train')) {
        this.trainPass(Math.max(now + 0.05, this.nextTrain));
        this.count.train++;
      }
      this.nextTrain = Math.max(now, this.nextTrain) + 180 + Math.random() * 300;
    }
    // Thunder after each flash, later and darker the further off it struck (research: Sound §9).
    if (m.storm) {
      const ahead = m.time + (until - now);
      for (let w = Math.floor(m.time / FLASH_WINDOW); w <= Math.floor(ahead / FLASH_WINDOW); w++) {
        if (w <= this.flashDone) continue;
        const at = flashIn(w, m.seed);
        if (at === null) {
          this.flashDone = w;
          continue;
        }
        if (at > ahead) break;
        this.flashDone = w;
        if (at < m.time - 0.5) continue;
        const km = 0.3 + 4 * Math.random() ** 1.5;
        void this.thunder(now + Math.max(0, at - m.time) + Math.min(9, km / 0.343), km);
      }
    }
  }

  /** One pre-made drop or tick, panned, at a level. Returns whether it played. */
  private play(set: readonly AudioBuffer[], at: number, level: number, pan: number, kind: string, rate: number): boolean {
    const e = this.e;
    if (!e.take(kind)) return false;
    const src = new AudioBufferSourceNode(e.ctx, { buffer: set[Math.floor(Math.random() * set.length)], playbackRate: rate });
    const out = e.out('amb', level, pan);
    src.connect(out.gain);
    src.start(at);
    e.free(kind, src, [out.gain, out.pan]);
    return true;
  }

  /** A wave: an approach that swells and brightens, the break, the hiss of the backwash. */
  private wave(at: number, m: Mix): void {
    const e = this.e;
    if (!e.take('wave')) return;
    this.count.wave++;
    const ctx = e.ctx;
    const rise = 2 + Math.random() * 2;
    const peak = 0.3 + Math.random() * 0.3;
    const fall = 3 + Math.random() * 3;
    const size = (0.55 + 0.45 * Math.random()) * (0.7 + 0.5 * m.wind) * m.surf;
    const src = e.burst('pink', at, rise + peak + fall + 0.2);
    const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 300, Q: 0.6 });
    const out = e.out('amb', 0, Math.random() * 0.8 - 0.4);
    src.connect(low).connect(out.gain);
    const g = out.gain.gain;
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(LEVEL.wave * size * 0.6, at + rise);
    g.linearRampToValueAtTime(LEVEL.wave * size, at + rise + peak);
    g.setTargetAtTime(0, at + rise + peak, fall / 3);
    low.frequency.setValueAtTime(300, at);
    low.frequency.exponentialRampToValueAtTime(1500, at + rise);
    low.frequency.exponentialRampToValueAtTime(3000, at + rise + peak);
    low.frequency.exponentialRampToValueAtTime(600, at + rise + peak + fall);
    // The break: a short bright burst.
    const spray = e.burst('white', at + rise, peak + 0.6);
    const high = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 2000, Q: 0.5 });
    const sg = new GainNode(ctx, { gain: 0 });
    spray.connect(high).connect(sg).connect(out.gain);
    sg.gain.setValueAtTime(0, at + rise);
    sg.gain.linearRampToValueAtTime(0.25 * size, at + rise + peak * 0.5);
    sg.gain.setTargetAtTime(0, at + rise + peak, 0.25);
    e.free('wave', src, [low, out.gain, out.pan, spray, high, sg]);
  }

  /** A tawny owl: the first hoot rising and falling, a pause, a brief second, then a long wavering third. */
  private owl(at: number): void {
    const e = this.e;
    const ctx = e.ctx;
    if (!e.take('call')) return;
    const pan = Math.random() < 0.5 ? -0.8 : 0.8;
    const osc = new OscillatorNode(ctx, { type: 'triangle', frequency: 750 });
    const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1400, Q: 0.5 });
    const out = e.out('amb', 0, pan);
    osc.connect(low).connect(out.gain);
    const g = out.gain.gain;
    const f = osc.frequency;
    const v = LEVEL.owl * (0.6 + 0.4 * Math.random());
    const note = (t: number, dur: number, from: number, top: number, to: number): void => {
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(v, t + 0.05);
      g.setValueAtTime(v, t + dur - 0.08);
      g.linearRampToValueAtTime(0, t + dur);
      f.setValueAtTime(from, t);
      f.linearRampToValueAtTime(top, t + dur * 0.4);
      f.linearRampToValueAtTime(to, t + dur);
    };
    note(at, 0.6, 750, 850, 790);
    const second = at + 0.6 + 3 + Math.random();
    note(second, 0.18, 780, 800, 770);
    const third = second + 0.45;
    note(third, 1.4, 760, 820, 780);
    // The third note wavers.
    const vib = new OscillatorNode(ctx, { frequency: 8 });
    const depth = new GainNode(ctx, { gain: 0 });
    vib.connect(depth).connect(f);
    depth.gain.setValueAtTime(0, third + 0.3);
    depth.gain.linearRampToValueAtTime(25, third + 0.6);
    vib.start(third);
    vib.stop(third + 1.5);
    osc.start(at);
    osc.stop(third + 1.5);
    e.free('call', osc, [low, out.gain, out.pan, vib, depth]);
  }

  /**
   * A train passing far off: a rumble swelling for most of a minute, the clack of rail joints, and the horn's
   * B-major-sixth chord sounding long, long, short, long while its pitch falls as it passes.
   */
  /** A train seen crossing far off, starting at `x` across the screen (0..1): its sound goes with it. */
  seenTrain(x: number): void {
    if (!this.e.take('train')) return;
    this.trainPass(this.e.now + 0.05, x < 0.5 ? -0.85 : 0.85);
    this.count.train++;
  }

  private trainPass(at: number, pan0: number = Math.random() < 0.5 ? -0.85 : 0.85): void {
    const e = this.e;
    const ctx = e.ctx;
    const len = 48;
    const out = e.out('amb', LEVEL.train, pan0);
    out.pan.pan.setValueAtTime(pan0, at);
    out.pan.pan.linearRampToValueAtTime(-pan0, at + len);
    const rumble = e.burst('brown', at, len);
    const rumbleLow = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 150, Q: 0.6 });
    const rg = new GainNode(ctx, { gain: 0 });
    rumble.connect(rumbleLow).connect(rg).connect(out.gain);
    rg.gain.setValueAtTime(0, at);
    rg.gain.linearRampToValueAtTime(1.6, at + len * 0.5);
    rg.gain.linearRampToValueAtTime(0, at + len);
    // Clacks: doublets of low thumps, two a second at speed, swelling and fading with the rumble.
    const clacks = e.burst('brown', at, len);
    const clackLow = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 300, Q: 1 });
    const cg = new GainNode(ctx, { gain: 0 });
    clacks.connect(clackLow).connect(cg).connect(out.gain);
    for (let t = 4; t < len - 4; t += 0.52) {
      const swell = Math.sin((Math.PI * t) / len) ** 2 * 3;
      for (const d of [0, 0.11]) {
        cg.gain.setValueAtTime(swell, at + t + d);
        cg.gain.setTargetAtTime(0, at + t + d + 0.01, 0.025);
      }
    }
    // The horn, five bells of the Nathan K5LA, far and low-passed, falling about a quarter-tone as it passes.
    const horn = new GainNode(ctx, { gain: 0 });
    const hornLow = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 900, Q: 0.7 });
    horn.connect(hornLow).connect(out.gain);
    const oscs: OscillatorNode[] = [];
    const start = at + len * 0.35;
    for (const hz of [311, 370, 415, 490, 622]) {
      const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: hz });
      o.detune.setValueAtTime(120, start);
      o.detune.linearRampToValueAtTime(-130, start + 9);
      o.connect(horn);
      o.start(start);
      o.stop(start + 10);
      oscs.push(o);
    }
    let t = start;
    for (const dur of [2.2, 2.2, 0.8, 2.6]) {
      horn.gain.setValueAtTime(0, t);
      horn.gain.linearRampToValueAtTime(0.05, t + 0.12);
      horn.gain.setValueAtTime(0.05, t + dur - 0.15);
      horn.gain.linearRampToValueAtTime(0, t + dur);
      t += dur + 0.45;
    }
    e.free('train', rumble, [rumbleLow, rg, clacks, clackLow, cg, horn, hornLow, out.gain, out.pan, ...oscs]);
  }

  /** Renders one peal of thunder off the main thread and plays it at `at` (research: Sound §9). */
  private async thunder(at: number, km: number): Promise<void> {
    const e = this.e;
    if (!e.take('thunder')) return;
    let buffer: AudioBuffer;
    try {
      buffer = await renderThunder(e, km);
    } catch {
      e.release('thunder');
      return;
    }
    const src = new AudioBufferSourceNode(e.ctx, { buffer });
    const out = e.out('amb', LEVEL.thunder * Math.min(1, 1.2 / (0.6 + km)), Math.random() * 1.2 - 0.6);
    src.connect(out.gain);
    src.start(Math.max(e.now + 0.02, at));
    e.free('thunder', src, [out.gain, out.pan]);
    this.count.thunder++;
  }
}

/** Thunder in four bands after Farnell: the crack, the rumble, a delayed sub-boom and a resonant afterimage. */
async function renderThunder(e: Engine, km: number): Promise<AudioBuffer> {
  const rate = 24000;
  const sec = 16;
  const ctx = new OfflineAudioContext(2, rate * sec, rate);
  const far = Math.min(1, km / 4.3);
  const dest = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6000 * (400 / 6000) ** far, Q: 0.5 });
  dest.connect(ctx.destination);
  const noise = (kind: 'white' | 'brown' | 'pink', at: number, dur: number): AudioBufferSourceNode => {
    const s = new AudioBufferSourceNode(ctx, { buffer: e.noise[kind], loop: dur > 1.5 });
    s.start(at, Math.random() * 6, dur);
    return s;
  };
  // Crack: up to four strikes, each a burst through two bands.
  const strikes = 1 + Math.floor(Math.random() * 4);
  for (let i = 0; i < strikes; i++) {
    const x = Math.random() * 0.6;
    const t = i * (0.05 + Math.random() * 0.25);
    const dur = (200 * (1.4 - x) ** 5) / 1000;
    const g = new GainNode(ctx, { gain: 0 });
    const hz = 100 + 1200 * x;
    noise('white', t, dur + 0.05)
      .connect(new BiquadFilterNode(ctx, { type: 'bandpass', frequency: hz, Q: 1.5 }))
      .connect(g);
    g.gain.setValueAtTime(1.6 * (1 - far * 0.7), t);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(dest);
  }
  // Rumble: low noise rolling down over eight seconds, in uneven swells.
  const rumble = new GainNode(ctx, { gain: 0 });
  noise('brown', 0, sec)
    .connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 260, Q: 0.7 }))
    .connect(rumble)
    .connect(dest);
  rumble.gain.setValueAtTime(0, 0);
  rumble.gain.linearRampToValueAtTime(1.4, 0.05 + far * 0.4);
  let t = 0.3;
  while (t < 9) {
    rumble.gain.setTargetAtTime((1.4 * Math.exp(-t / 3)) * (0.5 + Math.random()), t, 0.25);
    t += 0.3 + Math.random() * 0.8;
  }
  rumble.gain.setTargetAtTime(0, t, 1.5);
  // The deep boom: very low noise, starting late, swelling slowly and dying for a long time.
  const deep = new GainNode(ctx, { gain: 0 });
  noise('brown', 0.8, sec - 0.8)
    .connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 80, Q: 0.7 }))
    .connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 80, Q: 0.7 }))
    .connect(deep)
    .connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 22, Q: 0.7 }))
    .connect(ctx.destination);
  deep.gain.setValueAtTime(0, 0.8);
  deep.gain.linearRampToValueAtTime(3.5, 2.8);
  deep.gain.setTargetAtTime(0, 2.8, 3.5);
  // The afterimage: a resonant band near 333 Hz, ringing on.
  const after = new GainNode(ctx, { gain: 0 });
  noise('white', 0.2, 7)
    .connect(new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 333, Q: 4 }))
    .connect(after)
    .connect(dest);
  after.gain.setValueAtTime(0.5, 0.2);
  after.gain.setTargetAtTime(0, 0.2, 2);
  return ctx.startRendering();
}

/** Birds by day: a few species of the place, each a song of FM syllables repeated now and then (research: Sound §14). */
class Birds {
  private place = -1;
  private species: Species[] = [];

  schedule(e: Engine, m: Mix, until: number, count: { bird: number }): void {
    if (m.place !== this.place) {
      this.place = m.place;
      this.species = speciesOf(m.seed, m.place, e.now);
    }
    const density = m.birds * m.dawn * (1 - Math.min(1, m.rain * 2.5)) * (m.storm ? 0 : 1) * (1 - 0.7 * m.wind);
    for (const s of this.species) {
      if (s.next < e.now) s.next = e.now + Math.random() * s.every;
      while (s.next < until) {
        if (Math.random() < density * 1.5) count.bird += sing(e, s, s.next);
        s.next += (s.every * (0.6 + 0.8 * Math.random())) / Math.max(0.15, density) ** 1.5;
      }
    }
  }
}

type Syllable = { readonly curve: Float32Array; readonly dur: number; readonly trill: number };
type Species = { readonly song: readonly Syllable[]; readonly gaps: readonly number[]; readonly level: number; readonly bright: number; readonly pan: number; readonly every: number; next: number };

/** The birds of a stretch: two or three species with their own pitch, songs and distances. */
function speciesOf(seed: number, place: number, now: number): Species[] {
  let s = (seed ^ Math.imul(place + 7, 0x9e3779b1)) >>> 0;
  const r = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Species[] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const base = 2000 + r() * 3200;
    const span = 0.15 + r() * 0.5;
    const shapes = Array.from({ length: 2 + Math.floor(r() * 3) }, () => syllable(base, span, r));
    const length = 3 + Math.floor(r() * 6);
    const song: Syllable[] = [];
    const gaps: number[] = [];
    for (let j = 0; j < length; j++) {
      song.push(shapes[Math.floor(r() * shapes.length)]);
      gaps.push(0.06 + r() * 0.09);
    }
    const far = r();
    out.push({ song, gaps, level: 1 - 0.75 * far, bright: 9000 - 6000 * far, pan: r() * 1.6 - 0.8, every: 3 + r() * 6, next: now + r() * 6 });
  }
  return out;
}

/** One syllable: a swoop, a rising chirp, a falling slur or a flat trill, as a frequency curve. */
function syllable(base: number, span: number, r: () => number): Syllable {
  const kind = Math.floor(r() * 4);
  const dur = 0.06 + r() * 0.1;
  const curve = new Float32Array(32);
  for (let i = 0; i < 32; i++) {
    const x = i / 31;
    const k = kind === 0 ? Math.sin(Math.PI * x) : kind === 1 ? x * x : kind === 2 ? 1 - x : 0.5;
    curve[i] = base * (1 + span * (k - 0.3));
  }
  return { curve, dur, trill: kind === 3 ? 25 + r() * 35 : 0 };
}

function sing(e: Engine, s: Species, at: number): number {
  const ctx = e.ctx;
  if (!e.take('bird')) return 0;
  const osc = new OscillatorNode(ctx, { frequency: s.song[0].curve[0] });
  const low = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: s.bright, Q: 0.5 });
  const out = e.out('amb', 0, s.pan);
  osc.connect(low).connect(out.gain);
  const level = LEVEL.bird * s.level * db(-2 + Math.random() * 4);
  let t = at;
  const nodes: AudioNode[] = [low, out.gain, out.pan];
  for (let i = 0; i < s.song.length; i++) {
    const y = s.song[i];
    osc.frequency.setValueCurveAtTime(y.curve, t, y.dur);
    out.gain.gain.setValueAtTime(0, t);
    out.gain.gain.linearRampToValueAtTime(level, t + 0.018);
    out.gain.gain.setValueAtTime(level, t + y.dur - 0.02);
    out.gain.gain.linearRampToValueAtTime(0, t + y.dur);
    if (y.trill > 0) {
      const lfo = new OscillatorNode(ctx, { frequency: y.trill });
      const depth = new GainNode(ctx, { gain: 100 + 300 * Math.random() });
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + y.dur);
      nodes.push(lfo, depth);
    }
    t += y.dur + s.gaps[i];
  }
  osc.start(at);
  osc.stop(t);
  e.free('bird', osc, nodes);
  return 1;
}

// ── Pre-made drops ─────────────────────────────────────────────────────────

/** A drop on ground or rock: Farnell's parabolic pulse, ringing briefly in a band (research: Sound §8). */
function dropClick(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 0.03);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  const width = Math.max(2, Math.floor(rate * (0.00015 + Math.random() * 0.00036)));
  for (let i = 0; i < width; i++) {
    const x = i / width;
    d[i] = (1 - 4 * (x - 0.5) ** 2) * Math.sqrt(width / rate / 0.0005 + 0.1);
  }
  resonate(d, rate, 2500 + Math.random() * 3500, 6, 0.004);
  return buf;
}

/** A drop into water: a sine whose pitch rises sharply at the end, fading as (1 − t/D)⁴. */
function dropPlink(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const dur = 0.04 + Math.random() * 0.1;
  const len = Math.floor(rate * dur);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  const f0 = 400 + Math.random() * 600;
  const k = 2 + Math.random() * 8;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const x = i / len;
    phase += (2 * Math.PI * f0 * (1 + 3 * x ** k)) / rate;
    const attack = Math.min(1, i / (rate * 0.002));
    d[i] = Math.sin(phase) * (1 - x) ** 4 * attack * 0.8;
  }
  return buf;
}

/** A tick on a leaf: a few clustered clicks, high-passed. */
function leafTick(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * 0.04);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  const n = 1 + Math.floor(Math.random() * 3);
  for (let j = 0; j < n; j++) {
    const at = Math.floor(Math.random() * rate * 0.015);
    for (let i = 0; i < rate * 0.004 && at + i < len; i++) d[at + i] += (Math.random() * 2 - 1) * (1 - i / (rate * 0.004)) ** 2 * (0.4 + Math.random() * 0.6);
  }
  resonate(d, rate, 3000 + Math.random() * 3000, 1.5, 0.002);
  return buf;
}

/** Runs a buffer through a band-pass (RBJ) in place, and fades it out after `ring` seconds. */
function resonate(d: Float32Array, rate: number, hz: number, q: number, ring: number): void {
  const w = (2 * Math.PI * hz) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let peak = 1e-9;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    d[i] = y * Math.exp(-Math.max(0, i / rate - ring) * 300);
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < d.length; i++) d[i] /= peak;
}

/** One cricket chirp's envelope: a parabola over the first 17% of the period, pulsed by cos² at 58 Hz. */
function chirpEnvelope(ctx: BaseAudioContext): AudioBuffer {
  const rate = 8000;
  const len = Math.floor(rate * 0.7);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const x = i / len / 0.17;
    const para = x < 1 ? 1 - (2 * x - 1) ** 2 : 0;
    d[i] = para * Math.cos(Math.PI * 58 * (i / rate)) ** 2;
  }
  return buf;
}
