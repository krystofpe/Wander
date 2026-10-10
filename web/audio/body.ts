// His sounds and the fire's: footsteps on the ground under him, timed to the walk cycle's contact frames; the
// lighter, the drag and the slow exhale; the camp fire's lapping, hiss and crackle, dying down as the fire does
// (research: Sound §11–13).
import { FRAME_M } from '../../src/walker.ts';
import { db, panFor } from './engine.ts';
import type { Engine } from './engine.ts';
import type { Mix } from './heard.ts';

/** Metres between footfalls: four walk frames a step, contacts on frames 0 and 4. */
const STEP_M = 4 * FRAME_M;

const LEVEL = { step: 0.22, lighter: 0.2, breath: 0.07, lap: 0.05, hiss: 0.03, crackle: 0.2 } as const;

const gap = (rate: number): number => -Math.log(1 - Math.random()) / Math.max(1e-6, rate);

export class Body {
  private readonly e: Engine;
  private lastStep = -1;
  private walked = Number.NaN;
  private seen = 0;
  /** Metres per real second, smoothed. */
  private speed = 0;
  private stepAt = 0;
  private fire: Fire | null = null;
  readonly count = { step: 0, lighter: 0, drag: 0, exhale: 0, crackle: 0 };
  /** The ground of the last step (the bar of the 30-minute run reads it). */
  ground = '';

  constructor(e: Engine) {
    this.e = e;
  }

  /** Schedules the next footfall when it falls within the window, from how far he has walked and how fast. */
  steps(m: Mix, walked: number, ground: string, wet: boolean, until: number): void {
    const e = this.e;
    const now = e.now;
    const t = performance.now() / 1000;
    if (Number.isNaN(this.walked)) {
      this.walked = walked;
      this.seen = t;
      this.lastStep = Math.floor(walked / STEP_M);
      return;
    }
    const dt = t - this.seen;
    if (dt > 0.02) {
      const v = (walked - this.walked) / dt;
      this.speed += (v - this.speed) * Math.min(1, dt / 0.25);
      this.walked = walked;
      this.seen = t;
    }
    const index = Math.floor(walked / STEP_M);
    if (index < this.lastStep || index > this.lastStep + 4) this.lastStep = index;
    if (m.stage !== 'walk' || this.speed < 0.15) return;
    const next = this.lastStep + 1;
    const wait = (next * STEP_M - walked) / this.speed;
    if (wait > until - now) return;
    this.lastStep = next;
    // At high speeds the steps would blur into a rattle: keep at most four a second.
    const at = now + Math.max(0.01, wait);
    if (at - this.stepAt < 0.25) return;
    this.stepAt = at;
    this.ground = ground;
    step(e, at, ground, wet, panFor(m.himX), next % 2 === 0);
    this.count.step++;
  }

  /** The lighter: lid, flint wheel, the flame catching, lid shut (research: Sound §13). */
  lighter(m: Mix): void {
    const e = this.e;
    if (!e.take('breath')) return;
    const ctx = e.ctx;
    const at = e.now + 0.05;
    const out = e.out('sfx', LEVEL.lighter, panFor(m.himX));
    const nodes: AudioNode[] = [out.gain, out.pan];
    const click = (t: number, loud: number): void => {
      const s = e.burst('white', t, 0.03);
      const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3500, Q: 8 });
      const g = new GainNode(ctx, { gain: 0 });
      s.connect(band).connect(g).connect(out.gain);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(loud * 3, t + 0.001);
      g.gain.setTargetAtTime(0, t + 0.003, 0.006);
      nodes.push(s, band, g);
    };
    // Lid open: a click and a little metallic ping.
    click(at, 0.8);
    const ping = new GainNode(ctx, { gain: 0 });
    for (const hz of [2800, 4100]) {
      const o = new OscillatorNode(ctx, { frequency: hz });
      o.connect(ping);
      o.start(at + 0.004);
      o.stop(at + 0.12);
      nodes.push(o);
    }
    ping.gain.setValueAtTime(0.06, at + 0.004);
    ping.gain.setTargetAtTime(0, at + 0.006, 0.015);
    ping.connect(out.gain);
    nodes.push(ping);
    // The flint wheel: a short burst of spiky noise.
    const wheelAt = at + 0.45;
    const wheel = e.burst('white', wheelAt, 0.06);
    const wheelHigh = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 2000, Q: 0.7 });
    const wg = new GainNode(ctx, { gain: 0 });
    wheel.connect(wheelHigh).connect(wg).connect(out.gain);
    wg.gain.setValueAtTime(0, wheelAt);
    for (let i = 0; i < 6; i++) wg.gain.setValueAtTime(Math.random() * 0.9, wheelAt + i * 0.008);
    wg.gain.setValueAtTime(0, wheelAt + 0.05);
    nodes.push(wheel, wheelHigh, wg);
    // The flame catches: a soft low fwump.
    const flame = e.burst('pink', wheelAt + 0.02, 0.6);
    const flameBand = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 300, Q: 1 });
    const fg = new GainNode(ctx, { gain: 0 });
    flame.connect(flameBand).connect(fg).connect(out.gain);
    fg.gain.setValueAtTime(0, wheelAt + 0.02);
    fg.gain.linearRampToValueAtTime(1.6, wheelAt + 0.06);
    fg.gain.setTargetAtTime(0, wheelAt + 0.1, 0.12);
    nodes.push(flame, flameBand, fg);
    // Lid shut, louder.
    click(at + 2.2, 1);
    e.free('breath', e.timer(at, at + 2.4, out.gain), nodes);
    this.count.lighter++;
  }

  /** A drag: a very quiet draw of air, the tobacco crackling. */
  drag(m: Mix): void {
    const e = this.e;
    if (!e.take('breath')) return;
    const ctx = e.ctx;
    const at = e.now + 0.05;
    const src = e.burst('pink', at, 1.4);
    const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2000, Q: 2 });
    const out = e.out('sfx', 0, panFor(m.himX));
    src.connect(band).connect(out.gain);
    const v = LEVEL.breath * 0.5;
    out.gain.gain.setValueAtTime(0, at);
    out.gain.gain.linearRampToValueAtTime(v, at + 0.5);
    out.gain.gain.linearRampToValueAtTime(0, at + 1.3);
    const nodes: AudioNode[] = [band, out.gain, out.pan];
    // Two or three tiny crackles of the burning tip.
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const t = at + 0.3 + Math.random() * 0.8;
      const c = e.burst('white', t, 0.01);
      const cb = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 4000 + Math.random() * 4000, Q: 1 });
      const cg = new GainNode(ctx, { gain: 0 });
      c.connect(cb).connect(cg).connect(out.pan);
      cg.gain.setValueAtTime(0.025, t);
      cg.gain.setTargetAtTime(0, t + 0.001, 0.003);
      nodes.push(c, cb, cg);
    }
    e.free('breath', src, nodes);
    this.count.drag++;
  }

  /** The exhale: air shaped like a breath, rising quickly and falling slowly, its band gliding down. */
  exhale(m: Mix): void {
    const e = this.e;
    if (!e.take('breath')) return;
    const ctx = e.ctx;
    const at = e.now + 0.05;
    const src = e.burst('pink', at, 3);
    const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 900, Q: 0.8 });
    const high = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 250, Q: 0.7 });
    const out = e.out('sfx', 0, panFor(m.himX));
    src.connect(band).connect(high).connect(out.gain);
    band.frequency.setValueAtTime(900, at);
    band.frequency.exponentialRampToValueAtTime(600, at + 2.8);
    const v = LEVEL.breath * db(-1 + Math.random() * 2);
    const g = out.gain.gain;
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(v, at + 0.25);
    // A half-cosine fall over about two and a half seconds.
    const fall = new Float32Array(24).map((_, i) => v * 0.5 * (1 + Math.cos((Math.PI * i) / 23)));
    g.setValueCurveAtTime(fall, at + 0.26, 2.5);
    e.free('breath', src, [band, high, out.gain, out.pan]);
    this.count.exhale++;
  }

  /** Keeps the fire's sound in step with the fire: it starts when lit, follows its heat, and goes when it is out. */
  fireSound(m: Mix, until: number): void {
    const e = this.e;
    if (m.fire > 0.01 && this.fire === null) this.fire = new Fire(e);
    if (this.fire === null) return;
    this.fire.update(m);
    this.count.crackle += this.fire.crackles(m, until);
    if (m.fire <= 0.01 && this.fire.quiet()) {
      this.fire.stop();
      this.fire = null;
    }
  }
}

/** One footfall: the heel and then the ball of the foot, through the texture of the ground (research: Sound §12). */
function step(e: Engine, at: number, ground: string, wet: boolean, pan: number, left: boolean): void {
  if (!e.take('step')) return;
  const ctx = e.ctx;
  const level = LEVEL.step * db(-2 + Math.random() * 4) * (left ? 1 : 0.85);
  const pitch = 0.95 + Math.random() * 0.1;
  const out = e.out('sfx', level, pan);
  const nodes: AudioNode[] = [out.gain, out.pan];
  /** A band of noise with an envelope: heel strike at 0, roll, push-off from the ball. */
  const grain = (kind: 'white' | 'pink' | 'brown', t: number, dur: number, type: BiquadFilterType, hz: number, q: number, peak: number, sweepTo = 0): void => {
    const s = e.burst(kind, t, dur + 0.02);
    const f = new BiquadFilterNode(ctx, { type, frequency: hz * pitch, Q: q });
    const g = new GainNode(ctx, { gain: 0 });
    s.connect(f).connect(g).connect(out.gain);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.2));
    g.gain.setTargetAtTime(0, t + dur * 0.3, dur * 0.25);
    if (sweepTo > 0) {
      f.frequency.setValueAtTime(hz * pitch, t);
      f.frequency.exponentialRampToValueAtTime(sweepTo * pitch, t + dur);
    }
    nodes.push(s, f, g);
  };
  const thud = (t: number, hz: number, peak: number): void => {
    const o = new OscillatorNode(ctx, { frequency: hz * pitch });
    const g = new GainNode(ctx, { gain: 0 });
    o.connect(g).connect(out.gain);
    o.frequency.setValueAtTime(hz * pitch, t);
    o.frequency.exponentialRampToValueAtTime(hz * 0.6, t + 0.08);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.setTargetAtTime(0, t + 0.01, 0.025);
    o.start(t);
    o.stop(t + 0.15);
    nodes.push(o, g);
  };
  const ticks = (t: number, n: number, span: number, lo: number, hi: number, peak: number): void => {
    for (let i = 0; i < n; i++) grain('white', t + Math.random() * span, 0.008 + Math.random() * 0.012, 'bandpass', lo + Math.random() * (hi - lo), 2, peak * (0.4 + Math.random() * 0.6));
  };
  const ball = at + 0.1 + Math.random() * 0.03;
  switch (ground) {
    case 'gravel':
      thud(at, 90, 0.25);
      ticks(at, 5, 0.06, 600, 6000, 0.8);
      ticks(ball, 4, 0.05, 900, 7000, 0.55);
      break;
    case 'snow':
      grain('pink', at, 0.16, 'bandpass', 700, 0.5, 0.9, 3500);
      ticks(at + 0.02, 6, 0.14, 1500, 4500, 0.3);
      grain('pink', ball, 0.1, 'bandpass', 900, 0.5, 0.5, 3000);
      break;
    case 'sand':
      grain('pink', at, 0.15, 'bandpass', 600, 0.6, 0.7, 2200);
      grain('pink', ball, 0.12, 'lowpass', 2500, 0.5, 0.4);
      break;
    case 'salt':
      thud(at, 110, 0.3);
      ticks(at, 7, 0.08, 2000, 9000, 0.55);
      ticks(ball, 5, 0.06, 2500, 9000, 0.4);
      break;
    case 'mud':
      grain('brown', at, 0.12, 'bandpass', 420, 2, 1.2, 180);
      grain('pink', ball, 0.15, 'bandpass', 900, 3, 0.25, 500);
      break;
    case 'leaves':
      thud(at, 75, 0.22);
      grain('white', at, 0.12, 'bandpass', 2500 + Math.random() * 2500, 1.2, 0.35);
      ticks(at, 5, 0.12, 2000, 7000, 0.5);
      ticks(ball, 3, 0.06, 2000, 7000, 0.35);
      break;
    default:
      // Grass: a soft brush in a high band and a low thud of the heel.
      thud(at, 70 + Math.random() * 40, 0.22);
      grain('white', at, 0.12, 'bandpass', 3000 + Math.random() * 5000, 2 + Math.random() * 3, 0.7);
      grain('white', ball, 0.09, 'bandpass', 3000 + Math.random() * 4000, 2, 0.45);
  }
  if (wet && ground !== 'snow') {
    // A puddle: a splash and a plink.
    grain('white', at + 0.01, 0.07, 'bandpass', 1800, 1, 0.5);
    const o = new OscillatorNode(ctx, { frequency: 500 });
    const g = new GainNode(ctx, { gain: 0 });
    o.frequency.setValueAtTime(500, at);
    o.frequency.exponentialRampToValueAtTime(1400, at + 0.06);
    o.connect(g).connect(out.gain);
    g.gain.setValueAtTime(0.12, at + 0.01);
    g.gain.setTargetAtTime(0, at + 0.02, 0.015);
    o.start(at);
    o.stop(at + 0.1);
    nodes.push(o, g);
  }
  e.free('step', e.timer(at, ball + 0.3, out.gain), nodes);
}

/** The camp fire: lapping (a low turbulent roar), hiss flaring now and then, and crackles in clustered bursts. */
class Fire {
  private readonly e: Engine;
  private readonly lap: GainNode;
  private readonly hiss: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private heat = 0;
  private next = 0;
  private burstUntil = 0;

  constructor(e: Engine) {
    this.e = e;
    const ctx = e.ctx;
    this.pan = new StereoPannerNode(ctx, { pan: 0 });
    this.pan.connect(e.bus.sfx);
    // Lapping: brown noise through a low resonant band, driven into a soft clip, the rumble kept above 25 Hz.
    const brown = e.loop('brown');
    const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 45, Q: 3 });
    const drive = new GainNode(ctx, { gain: 30 });
    const clip = new WaveShaperNode(ctx, { curve: softClip() });
    const high = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 30, Q: 0.7 });
    const body = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 400, Q: 0.5 });
    this.lap = new GainNode(ctx, { gain: 0 });
    brown.connect(band).connect(drive).connect(clip).connect(high).connect(body).connect(this.lap).connect(this.pan);
    // Hiss: high noise whose level flares as the fourth power of a slow random signal.
    const white = e.loop('white');
    const hissHigh = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1000, Q: 0.7 });
    const flare = new GainNode(ctx, { gain: 0 });
    const ctl = new AudioBufferSourceNode(ctx, { buffer: e.slow, loop: true, playbackRate: 2.2 });
    const power = new WaveShaperNode(ctx, { curve: fourth() });
    ctl.connect(power).connect(flare.gain);
    ctl.start(e.now, Math.random() * 50);
    this.hiss = new GainNode(ctx, { gain: 0 });
    white.connect(hissHigh).connect(flare).connect(this.hiss).connect(this.pan);
    this.sources.push(brown, white, ctl);
    this.nodes.push(band, drive, clip, high, body, this.lap, hissHigh, flare, power, this.hiss, this.pan);
  }

  update(m: Mix): void {
    const e = this.e;
    this.heat = m.fire;
    e.glide(this.pan.pan, panFor(m.fireX), 0.5);
    e.glide(this.lap.gain, LEVEL.lap * Math.min(1, m.fire * 1.2), 2);
    e.glide(this.hiss.gain, LEVEL.hiss * m.fire, 2);
  }

  /** Crackles: a Poisson rate of about four a second at full heat, tripling now and then for a second or two. */
  crackles(m: Mix, until: number): number {
    const e = this.e;
    const ctx = e.ctx;
    let n = 0;
    const rate = (): number => 4 * this.heat * (this.next < this.burstUntil ? 3 : 1);
    if (this.next < e.now) this.next = e.now + gap(Math.max(0.01, rate()));
    while (this.next < until) {
      if (this.heat > 0.05 && e.take('crackle')) {
        const at = this.next;
        const dur = 0.003 + Math.random() * 0.026;
        const s = e.burst('white', at, dur);
        const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1500 + Math.random() * 10500, Q: 1 });
        const g = new GainNode(ctx, { gain: 0 });
        s.connect(band).connect(g).connect(this.pan);
        const v = LEVEL.crackle * (0.2 + Math.random() ** 2) * Math.min(1, this.heat * 1.5);
        g.gain.setValueAtTime(v, at);
        g.gain.setTargetAtTime(0, at + 0.001, dur / 3);
        e.free('crackle', s, [band, g]);
        n++;
      }
      if (Math.random() < 0.05) this.burstUntil = this.next + 1 + Math.random();
      this.next += gap(Math.max(0.01, rate()));
    }
    void m;
    return n;
  }

  quiet(): boolean {
    return this.lap.gain.value < 0.002;
  }

  stop(): void {
    for (const s of this.sources) {
      s.stop();
      s.disconnect();
    }
    for (const n of this.nodes) n.disconnect();
  }
}

function softClip(): Float32Array<ArrayBuffer> {
  const c = new Float32Array(1025);
  for (let i = 0; i < c.length; i++) {
    const x = (i / 1024) * 2 - 1;
    c[i] = Math.tanh(x * 2) * 0.9;
  }
  return c;
}

/** x ↦ max(x, 0)⁴ × 4: quiet most of the time, flaring on the peaks. */
function fourth(): Float32Array<ArrayBuffer> {
  const c = new Float32Array(257);
  for (let i = 0; i < c.length; i++) {
    const x = (i / 256) * 2 - 1;
    c[i] = Math.max(0, x) ** 4 * 4;
  }
  return c;
}
