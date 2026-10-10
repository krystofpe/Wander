// The in-page bench: for a number of seconds it records, for every frame, the time between frames (what the eye
// sees), the CPU time spent stepping and drawing, and the GPU time from timer queries where the browser allows them,
// then reports p50, p99 and the worst of each, with the frames that missed a 60 Hz deadline (research:
// Engineering §10).
import type { Gpu } from './gl.ts';

export type BenchReport = {
  readonly seconds: number;
  readonly frames: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly interval: Stats;
  readonly cpu: Stats;
  readonly gpu: Stats | null;
  /** Frames more than 1.5 × 16.7 ms after the one before. */
  readonly late: number;
};

export type Stats = { readonly p50: number; readonly p99: number; readonly max: number; readonly mean: number };

function stats(values: readonly number[]): Stats {
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number): number => v[Math.min(v.length - 1, Math.floor(q * v.length))] ?? 0;
  const r = (x: number): number => Math.round(x * 100) / 100;
  return { p50: r(at(0.5)), p99: r(at(0.99)), max: r(v[v.length - 1] ?? 0), mean: r(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)) };
}

export class Bench {
  private readonly gpu: Gpu;
  private readonly seconds: number;
  /** Frames to skip first, while the first chunks are painted and shaders warm up. */
  private warm = 120;
  private start = 0;
  private last = 0;
  private t0 = 0;
  private readonly intervals: number[] = [];
  private readonly cpu: number[] = [];
  private readonly gpuMs: number[] = [];
  private readonly pending: WebGLQuery[] = [];
  private query: WebGLQuery | null = null;
  report: BenchReport | null = null;

  constructor(gpu: Gpu, seconds: number) {
    this.gpu = gpu;
    this.seconds = seconds;
  }

  get done(): boolean {
    return this.report !== null;
  }

  /** At the start of a frame, with the rAF time. */
  begin(now: number): void {
    if (this.report !== null) return;
    this.t0 = performance.now();
    if (this.warm > 0) {
      this.warm--;
      this.last = now;
      this.start = now;
      return;
    }
    this.intervals.push(now - this.last);
    this.last = now;
    const gl = this.gpu.gl;
    const ext = this.gpu.timerExt;
    if (ext !== null && this.pending.length < 8) {
      this.query = gl.createQuery();
      if (this.query !== null) gl.beginQuery(ext.TIME_ELAPSED_EXT, this.query);
    }
  }

  /** At the end of a frame, after drawing. */
  end(): void {
    if (this.report !== null || this.warm > 0) return;
    this.cpu.push(performance.now() - this.t0);
    const gl = this.gpu.gl;
    const ext = this.gpu.timerExt;
    if (ext !== null && this.query !== null) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.pending.push(this.query);
      this.query = null;
    }
    // Collect finished queries, oldest first.
    while (ext !== null && this.pending.length > 0) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint) this.gpuMs.push((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
      gl.deleteQuery(q);
      this.pending.shift();
    }
    if (this.last - this.start >= this.seconds * 1000) {
      const canvas = gl.canvas as HTMLCanvasElement;
      this.report = {
        seconds: this.seconds,
        frames: this.intervals.length,
        fps: Math.round((this.intervals.length / ((this.last - this.start) / 1000)) * 10) / 10,
        width: canvas.width,
        height: canvas.height,
        interval: stats(this.intervals),
        cpu: stats(this.cpu),
        gpu: this.gpuMs.length > 0 ? stats(this.gpuMs) : null,
        late: this.intervals.filter((x) => x > 25).length,
      };
      for (const q of this.pending) gl.deleteQuery(q);
      this.pending.length = 0;
    }
  }
}
