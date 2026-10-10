// The frame (spec §7): chunks painted into ring textures, palette rows graded for the moment, every layer resolved at
// native resolution into its own target, then composited at full resolution with its own fractional offset, then
// the final pass. GPU resources are made here on start and on resize, never per frame.
import { BIOME_IDS, BIOMES } from '../src/biomes.ts';
import type { BiomeId } from '../src/biomes.ts';
import { CHUNK_W, GROUND, LAYERS, RING_W, VIEW_H, columnDistance } from '../src/layers.ts';
import type { LayerDef } from '../src/layers.ts';
import { buildRow, gradeOf, hazeAt, labToBytes, newGrade, newMoment } from '../src/palette.ts';
import type { Grade } from '../src/palette.ts';
import { Chunk } from '../src/paint/chunk.ts';
import { paintLand } from '../src/paint/land.ts';
import { paintFore, paintGround, paintTrees } from '../src/paint/scene.ts';
import { paintClouds } from '../src/paint/clouds.ts';
import { stretchesBetween, WORLD } from '../src/world.ts';
import { Gpu, QUAD_VS } from './gl.ts';
import type { Program } from './gl.ts';
import { COMPOSITE_FS, DOWN_FS, FINAL_FS, FOG_FS, GLOWADD_FS, RAIN_FS, RESOLVE_FS, SKY_FS, UP_FS } from './shaders.ts';
import { NO_LIGHT, SpriteBatch } from './sprites.ts';
import type { Atlas, Light } from './sprites.ts';

/** Biome rows reserved per layer in the palette texture. */
const BIOME_SLOTS = 16;
const SLOTS = RING_W / CHUNK_W;

type LayerGpu = {
  readonly def: LayerDef;
  readonly index: number;
  readonly ring: WebGLTexture;
  readonly cols: WebGLTexture;
  /** Which chunk sits in each ring slot (NaN for none). */
  readonly slots: Float64Array;
  color: WebGLTexture | null;
  glow: WebGLTexture | null;
  fb: WebGLFramebuffer | null;
  /** This frame: integer and fractional offsets (layer px), and the first visible column. */
  ox: number;
  oy: number;
  fx: number;
  fy: number;
};

/** What the renderer needs to know about the moment, filled by the caller each frame. */
export type View = {
  seed: number;
  /** Camera position: his distance (m) plus the framing shift, in playfield px; and height above level, px. */
  camX: number;
  camY: number;
  grade: Grade;
  /** Sun position on the native view (px, rows from the top) and how far it is above the horizon. */
  sunX: number;
  sunY: number;
  time: number;
  wind: number;
  /** The horizon row (native, from the top of a 360-row view) under him, and how clear the sky is (0..1). */
  horizon: number;
  clear: number;
  /** How much of the sun's disc shows (0 below the horizon … 1), the moon's place, phase and how much shows. */
  sunUp: number;
  moonX: number;
  moonY: number;
  moonPhase: number;
  moonUp: number;
  /** Rim light on sprites: which side the light is on (−1 left, +1 right, 0 none) and how strong (0..1). */
  rimSide: number;
  rimStrength: number;
  /** The Milky Way's strength and the aurora's, 0..1. */
  milky: number;
  aurora: number;
  /** The rim's colour (rgb 0..1): the sun's light by day, a cold sky light at night. */
  rim: Float32Array;
  /** Local lights (fire, ember, windows) in native view pixels. */
  light: Light;
  /** How strongly the glowing things bloom. */
  bloom: number;
  /** How much of the sky is under cloud (0..1), and how far the clouds have drifted (layer px). */
  cover: number;
  cloudDrift: number;
  /** Fog veils drawn after layers FOG_AFTER[i]: their floor row on screen, thickness, density, drift; colour. */
  fogBase: Float32Array;
  fogHeight: Float32Array;
  fogDensity: Float32Array;
  fogDrift: Float32Array;
  fogColor: Float32Array;
  /** Rain or snow: how much (0..1), snow or not, and the colour of a drop. */
  rain: number;
  snow: boolean;
  rainColor: Float32Array;
  /** A lightning flash, 0..1. */
  flash: number;
};

/** The layers after which a fog veil is drawn (far ridge, far hills, mid, playfield). */
export const FOG_AFTER = [2, 4, 6, 8] as const;

/** Rain and snow planes: after which layer, cell size, speed, length (native px), alpha, parallax. */
const RAIN_PLANES = [
  { after: 4, cell: [5, 14], speed: 90, length: 3, alpha: 0.22, snowCell: [7, 7], snowSpeed: 9, snowSize: 1, z: 5 },
  { after: 7, cell: [9, 24], speed: 170, length: 6, alpha: 0.32, snowCell: [11, 11], snowSpeed: 16, snowSize: 1.5, z: 1.5 },
  { after: 8, cell: [14, 40], speed: 330, length: 12, alpha: 0.42, snowCell: [17, 17], snowSpeed: 27, snowSize: 2.5, z: 0.8 },
] as const;

/** How much a layer takes the local light: fully on the playfield, less the further back it stands. */
function lightGain(kind: string, z: number): number {
  if (kind === 'ground' || kind === 'fore') return 1;
  if (z <= 1.5) return 0.55;
  if (z <= 2.1) return 0.22;
  return 0;
}

/** The first palette row holding each biome's daylight colours, unhazed: what local light reveals. */
export const ALBEDO_ROW = LAYERS.length * 16;

/** The palette row of a biome on a layer. */
export function paletteRow(layer: number, biome: number): number {
  return layer * BIOME_SLOTS + biome;
}

export class Renderer {
  readonly gpu: Gpu;
  readonly gl: WebGL2RenderingContext;
  private readonly quad: WebGLVertexArrayObject;
  /** Sprites drawn over each layer (him, the fire and smoke on the playfield; animals, a train, lamps further off). */
  readonly batches: SpriteBatch[];
  readonly ground: SpriteBatch;
  atlas: Atlas | null = null;
  private readonly resolve: Program;
  private readonly composite: Program;
  private readonly sky: Program;
  private readonly final: Program;
  private readonly glowAdd: Program;
  private readonly fog: Program;
  private readonly rain: Program;
  private readonly down: Program;
  private readonly up: Program;
  /** The bloom chain: native glow, then halves; level 0 is what the final pass adds. */
  private bloomTex: WebGLTexture[] = [];
  private bloomFb: WebGLFramebuffer[] = [];
  private bloomSize: [number, number][] = [];
  private readonly layers: LayerGpu[] = [];
  private readonly palette: Uint8Array;
  private readonly paletteTex: WebGLTexture;
  private chunk: Chunk;
  private scene: WebGLTexture | null = null;
  private sceneFb: WebGLFramebuffer | null = null;
  /** Canvas size, integer scale, native view, and where the native view sits on the canvas. */
  canvasW = 0;
  canvasH = 0;
  scale = 1;
  nativeW = 640;
  nativeH = 360;
  private viewX = 0;
  private viewY = 0;
  /** Where the native view's top-left sits on the canvas, in device pixels. */
  get viewOffsetX(): number {
    return this.viewX;
  }
  get viewOffsetY(): number {
    return this.viewY;
  }
  private paletteLayer = 0;
  /** For debugging: only these layer indices are composited (null for all). */
  only: Set<number> | null = null;
  /** How many chunks were painted, and the time spent (ms), for the bench. */
  chunksPainted = 0;
  paintMs = 0;

  constructor(canvas: HTMLCanvasElement, preserve: boolean) {
    this.gpu = new Gpu(canvas, preserve);
    const gl = (this.gl = this.gpu.gl);
    this.quad = this.gpu.vertexArray();
    gl.bindVertexArray(this.quad);
    const quadBuf = this.gpu.buffer(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const prog = (fs: string, name: string): Program => {
      const p = this.gpu.program(QUAD_VS, fs, name);
      gl.bindAttribLocation(p.program, 0, 'a_pos');
      return p;
    };
    this.resolve = prog(RESOLVE_FS, 'resolve');
    this.composite = prog(COMPOSITE_FS, 'composite');
    this.sky = prog(SKY_FS, 'sky');
    this.final = prog(FINAL_FS, 'final');
    this.batches = LAYERS.map(() => new SpriteBatch(this.gpu, quadBuf));
    this.ground = this.batches[GROUND];
    this.glowAdd = prog(GLOWADD_FS, 'glow');
    this.fog = prog(FOG_FS, 'fog');
    this.rain = prog(RAIN_FS, 'rain');
    this.down = prog(DOWN_FS, 'down');
    this.up = prog(UP_FS, 'up');
    const rows = (LAYERS.length + 1) * BIOME_SLOTS;
    this.palette = new Uint8Array(256 * rows * 4);
    this.paletteTex = this.gpu.texture({ width: 256, height: rows, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, bytes: 4 });
    let maxH = 0;
    LAYERS.forEach((def, index) => {
      maxH = Math.max(maxH, def.height);
      this.layers.push({
        def,
        index,
        ring: this.gpu.texture({ width: RING_W, height: def.height, internal: gl.RG8, format: gl.RG, type: gl.UNSIGNED_BYTE, bytes: 2 }),
        cols: this.gpu.texture({ width: RING_W, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, bytes: 4 }),
        slots: new Float64Array(SLOTS).fill(Number.NaN),
        color: null,
        glow: null,
        fb: null,
        ox: 0,
        oy: 0,
        fx: 0,
        fy: 0,
      });
    });
    this.chunk = new Chunk(CHUNK_W, maxH);
    // Daylight rows: each biome at noon, no haze. Local light moves pixels toward these.
    const noon = newMoment();
    noon.elevation = 45;
    const g = gradeOf(noon, newGrade());
    BIOME_IDS.forEach((id, b) => buildRow(id, g, 0, 0, this.palette, (ALBEDO_ROW + b) * 1024));
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, ALBEDO_ROW, 256, BIOME_SLOTS, gl.RGBA, gl.UNSIGNED_BYTE, this.palette.subarray(ALBEDO_ROW * 1024, (ALBEDO_ROW + BIOME_SLOTS) * 1024));
  }

  /** Sizes everything for a canvas of w×h device pixels: the integer scale and the native view grown to fit. */
  resize(w: number, h: number): void {
    const gl = this.gl;
    this.canvasW = w;
    this.canvasH = h;
    this.scale = Math.max(1, Math.floor(Math.min(w / 640, h / 360)));
    this.nativeW = Math.ceil(w / this.scale);
    this.nativeH = Math.min(400, Math.ceil(h / this.scale));
    this.viewX = Math.floor((w - this.nativeW * this.scale) / 2);
    this.viewY = Math.floor((h - this.nativeH * this.scale) / 2);
    for (const l of this.layers) {
      this.gpu.deleteFramebuffer(l.fb);
      this.gpu.deleteTexture(l.color);
      this.gpu.deleteTexture(l.glow);
      const spec = { width: this.nativeW + 2, height: this.nativeH + 2, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR, bytes: 4 };
      l.color = this.gpu.texture(spec);
      l.glow = this.gpu.texture(spec);
      l.fb = this.gpu.framebuffer([l.color, l.glow]);
    }
    // The bloom chain at native size and below.
    for (const fb of this.bloomFb) this.gpu.deleteFramebuffer(fb);
    for (const t of this.bloomTex) this.gpu.deleteTexture(t);
    this.bloomTex = [];
    this.bloomFb = [];
    this.bloomSize = [];
    const hf = this.gpu.floatTargets;
    for (let i = 0, bw = this.nativeW, bh = this.nativeH; i < 5; i++, bw = Math.max(1, bw >> 1), bh = Math.max(1, bh >> 1)) {
      const t = this.gpu.texture({ width: bw, height: bh, internal: hf ? gl.RGBA16F : gl.RGBA8, format: gl.RGBA, type: hf ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, filter: gl.LINEAR, bytes: hf ? 8 : 4 });
      this.bloomTex.push(t);
      this.bloomFb.push(this.gpu.framebuffer([t]));
      this.bloomSize.push([bw, bh]);
    }
    this.gpu.deleteFramebuffer(this.sceneFb);
    this.gpu.deleteTexture(this.scene);
    const half = this.gpu.floatTargets;
    this.scene = this.gpu.texture({ width: w, height: h, internal: half ? gl.RGBA16F : gl.RGBA8, format: gl.RGBA, type: half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, filter: gl.LINEAR, bytes: half ? 8 : 4 });
    this.sceneFb = this.gpu.framebuffer([this.scene]);
  }

  /** Offsets of every layer for this camera: integer part for the native pass, fraction for the composite. */
  private place(v: View): void {
    const extra = this.nativeH - VIEW_H;
    for (const l of this.layers) {
      const z = l.def.z;
      const x = v.camX / z + (l.def.kind === 'clouds' ? v.cloudDrift : 0);
      const y = l.def.top - extra - v.camY / z;
      l.ox = Math.floor(x);
      l.fx = x - l.ox;
      l.oy = Math.floor(y);
      l.fy = y - l.oy;
    }
  }

  /** Paints chunks so every layer's view (plus a margin ahead) is ready; at most `budget` beyond what is visible. */
  private stream(seed: number, budget: number): void {
    const gl = this.gl;
    let spare = budget;
    // Nearest needs first: visible chunks on every layer, then one chunk of lookahead at a time.
    for (let pass = 0; pass < 2; pass++) {
      for (const l of this.layers) {
        const first = Math.floor((l.ox - 2) / CHUNK_W);
        const last = Math.floor((l.ox + this.nativeW + 2) / CHUNK_W) + (pass === 0 ? 0 : 2);
        const from = pass === 0 ? first : first - 1;
        for (let c = from; c <= last; c++) {
          const slot = ((c % SLOTS) + SLOTS) % SLOTS;
          if (l.slots[slot] === c) continue;
          if (pass === 1 && spare <= 0) return;
          const t0 = performance.now();
          this.paint(seed, l, c);
          gl.bindTexture(gl.TEXTURE_2D, l.ring);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, slot * CHUNK_W, 0, CHUNK_W, l.def.height, gl.RG, gl.UNSIGNED_BYTE, this.chunk.data.subarray(0, CHUNK_W * l.def.height * 2));
          gl.bindTexture(gl.TEXTURE_2D, l.cols);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, slot * CHUNK_W, 0, CHUNK_W, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.chunk.cols);
          l.slots[slot] = c;
          this.chunksPainted++;
          this.paintMs += performance.now() - t0;
          if (pass === 1) spare--;
        }
      }
    }
  }

  private paint(seed: number, l: LayerGpu, c: number): void {
    // The chunk buffer is shared and sized for the tallest layer; painters use its own height.
    const view = this.chunkFor(l.def.height);
    const u0 = c * CHUNK_W;
    switch (l.def.kind) {
      case 'clouds':
        paintClouds(view, seed, l.def, u0);
        return;
      case 'land':
        paintLand(view, seed, l.def, l.index, u0);
        return;
      case 'trees':
        paintTrees(view, seed, l.def, l.index, u0);
        return;
      case 'ground':
        paintGround(view, seed, l.def, l.index, u0);
        return;
      case 'fore':
        paintFore(view, seed, l.def, l.index, u0);
        return;
    }
  }

  private readonly chunks = new Map<number, Chunk>();
  private chunkFor(h: number): Chunk {
    let c = this.chunks.get(h);
    if (c === undefined) {
      c = new Chunk(CHUNK_W, h);
      this.chunks.set(h, c);
    }
    // The upload reads the chunk painted last.
    this.chunk = c;
    return c;
  }

  /** Rebuilds the palette rows of one layer (round-robin) for the biomes it can show. */
  private paletteStep(v: View, all: boolean): void {
    const gl = this.gl;
    const n = all ? this.layers.length : 1;
    for (let i = 0; i < n; i++) {
      const l = this.layers[this.paletteLayer];
      this.paletteLayer = (this.paletteLayer + 1) % this.layers.length;
      const d0 = columnDistance(l.ox - 4, l.def.z) - WORLD.blend * 2;
      const d1 = columnDistance(l.ox + this.nativeW + 4 + CHUNK_W * 3, l.def.z) + WORLD.blend * 2;
      const seen = new Set<BiomeId>();
      for (const s of stretchesBetween(v.seed, d0, d1)) seen.add(s.biome);
      for (const id of seen) {
        const b = BIOME_IDS.indexOf(id);
        const sigma = BIOMES[id].air.haze * v.grade.haze;
        const row = l.index * BIOME_SLOTS + b;
        buildRow(id, v.grade, hazeAt(l.def.z, sigma), v.time, this.palette, row * 256 * 4);
        gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.palette.subarray(row * 1024, row * 1024 + 1024));
      }
    }
  }

  /** The fog veil and rain plane that belong after a layer. */
  private air(v: View, index: number, vp: readonly number[]): void {
    const gl = this.gl;
    const fi = (FOG_AFTER as readonly number[]).indexOf(index);
    if (fi >= 0 && v.fogDensity[fi] > 0.01) {
      gl.useProgram(this.fog.program);
      gl.bindVertexArray(this.quad);
      gl.uniform4f(this.fog.u('u_rect'), -1, -1, 1, 1);
      gl.uniform3fv(this.fog.u('u_color'), v.fogColor);
      gl.uniform1f(this.fog.u('u_density'), v.fogDensity[fi]);
      gl.uniform1f(this.fog.u('u_base'), v.fogBase[fi]);
      gl.uniform1f(this.fog.u('u_height'), v.fogHeight[fi]);
      gl.uniform1f(this.fog.u('u_drift'), v.fogDrift[fi]);
      gl.uniform1f(this.fog.u('u_time'), v.time % 3600);
      gl.uniform1f(this.fog.u('u_scale'), this.scale);
      gl.uniform4f(this.fog.u('u_viewport'), vp[0], vp[1], vp[2], vp[3]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (v.rain <= 0.02) return;
    for (const p of RAIN_PLANES) {
      if (p.after !== index) continue;
      gl.useProgram(this.rain.program);
      gl.bindVertexArray(this.quad);
      gl.uniform4f(this.rain.u('u_rect'), -1, -1, 1, 1);
      gl.uniform1f(this.rain.u('u_amount'), Math.min(0.95, v.rain * (v.snow ? 0.6 : 0.85)));
      gl.uniform1f(this.rain.u('u_snow'), v.snow ? 1 : 0);
      gl.uniform1f(this.rain.u('u_wind'), v.wind);
      gl.uniform1f(this.rain.u('u_time'), v.time % 600);
      gl.uniform1f(this.rain.u('u_scale'), this.scale);
      gl.uniform4f(this.rain.u('u_viewport'), vp[0], vp[1], vp[2], vp[3]);
      gl.uniform2f(this.rain.u('u_cell'), v.snow ? p.snowCell[0] : p.cell[0], v.snow ? p.snowCell[1] : p.cell[1]);
      gl.uniform1f(this.rain.u('u_speed'), v.snow ? p.snowSpeed : p.speed);
      gl.uniform1f(this.rain.u('u_length'), v.snow ? p.snowSize : p.length);
      gl.uniform1f(this.rain.u('u_offset'), (v.camX / p.z) % 10000);
      gl.uniform3fv(this.rain.u('u_color'), v.rainColor);
      gl.uniform1f(this.rain.u('u_alpha'), p.alpha * (v.snow ? 1.6 : 1));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    void RECT;
  }

  private first = true;

  /** Draws one frame. `streamBudget` limits lookahead chunks painted this frame. */
  frame(v: View, streamBudget = 1): void {
    const gl = this.gl;
    if (this.scene === null || this.sceneFb === null) return;
    this.place(v);
    this.stream(v.seed, streamBudget);
    this.paletteStep(v, this.first);
    this.first = false;

    gl.bindVertexArray(this.quad);
    gl.disable(gl.DEPTH_TEST);

    // 1. Native passes.
    gl.useProgram(this.resolve.program);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    gl.uniform1i(this.resolve.u('u_palette'), 2);
    gl.uniform1i(this.resolve.u('u_ring'), 0);
    gl.uniform1i(this.resolve.u('u_cols'), 1);
    gl.uniform4f(this.resolve.u('u_rect'), -1, -1, 1, 1);
    gl.uniform1i(this.resolve.u('u_ringW'), RING_W);
    gl.uniform1i(this.resolve.u('u_targetH'), this.nativeH + 2);
    gl.uniform1f(this.resolve.u('u_time'), v.time % 1000);
    gl.uniform1f(this.resolve.u('u_gustX'), (v.time * 60) % 300);
    gl.uniform4fv(this.resolve.u('u_lights'), v.light.lights);
    gl.uniform1i(this.resolve.u('u_lightCount'), v.light.count);
    gl.uniform3fv(this.resolve.u('u_lightColor'), v.light.color);
    gl.uniform1i(this.resolve.u('u_albedoRow'), ALBEDO_ROW);
    for (const l of this.layers) {
      gl.uniform2f(this.resolve.u('u_frac'), l.fx, l.fy);
      gl.uniform1f(this.resolve.u('u_lightGain'), lightGain(l.def.kind, l.def.z));
      gl.uniform1f(this.resolve.u('u_cover'), l.def.kind === 'clouds' ? v.cover : -1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, l.fb);
      gl.viewport(0, 0, this.nativeW + 2, this.nativeH + 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, l.ring);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, l.cols);
      gl.uniform2i(this.resolve.u('u_origin'), (l.ox - 1) % RING_W, l.oy - 1);
      gl.uniform1i(this.resolve.u('u_height'), l.def.height);
      gl.uniform1i(this.resolve.u('u_rowBase'), l.index * BIOME_SLOTS);
      const swayAmp = l.def.kind === 'ground' || l.def.kind === 'fore' ? 2 : l.def.kind === 'trees' ? 1 : 0;
      gl.uniform1f(this.resolve.u('u_sway'), swayAmp * v.wind);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // 2. The glow buffer at native size: every layer's glowing pixels at their offsets, and the sprites' glow;
    // then blurred down a chain of halves and back up (dual filter).
    const nw = this.nativeW;
    const nh = this.nativeH;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFb[0]);
    gl.viewport(0, 0, nw, nh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.glowAdd.program);
    gl.uniform4f(this.glowAdd.u('u_rect'), -1, -1, 1, 1);
    gl.uniform1i(this.glowAdd.u('u_tex'), 0);
    gl.uniform2f(this.glowAdd.u('u_texSize'), nw + 2, nh + 2);
    gl.uniform2f(this.glowAdd.u('u_size'), nw, nh);
    gl.activeTexture(gl.TEXTURE0);
    for (const l of this.layers) {
      gl.bindTexture(gl.TEXTURE_2D, l.glow);
      gl.uniform2f(this.glowAdd.u('u_frac'), l.fx, l.fy);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (this.atlas !== null) for (const b of this.batches) b.draw(this.atlas, this.paletteTex, 1, [0, 0, nw, nh], nw, nh, labToRgb(v.grade.light), 0, 0, b === this.ground ? v.light : NO_LIGHT, 1);
    gl.bindVertexArray(this.quad);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(this.down.program);
    gl.uniform4f(this.down.u('u_rect'), -1, -1, 1, 1);
    gl.uniform1i(this.down.u('u_tex'), 0);
    for (let i = 1; i < this.bloomTex.length; i++) {
      const [bw, bh] = this.bloomSize[i];
      const [pw, ph] = this.bloomSize[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFb[i]);
      gl.viewport(0, 0, bw, bh);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[i - 1]);
      gl.uniform2f(this.down.u('u_texel'), 1 / pw, 1 / ph);
      gl.uniform2f(this.down.u('u_size'), bw, bh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(this.up.program);
    gl.uniform4f(this.up.u('u_rect'), -1, -1, 1, 1);
    gl.uniform1i(this.up.u('u_tex'), 0);
    for (let i = this.bloomTex.length - 1; i > 0; i--) {
      const [bw, bh] = this.bloomSize[i - 1];
      const [sw, sh] = this.bloomSize[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFb[i - 1]);
      gl.viewport(0, 0, bw, bh);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[i]);
      gl.uniform2f(this.up.u('u_texel'), 1 / sw, 1 / sh);
      gl.uniform2f(this.up.u('u_size'), bw, bh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);

    // 3. Full-resolution composite into the scene.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFb);
    gl.viewport(0, 0, this.canvasW, this.canvasH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const vx = this.viewX;
    const vy = this.canvasH - this.viewY - this.nativeH * this.scale;
    const vw = this.nativeW * this.scale;
    const vh = this.nativeH * this.scale;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.max(0, vx), Math.max(0, vy), Math.min(this.canvasW, vw), Math.min(this.canvasH, vh));

    // The sky.
    const g = v.grade;
    gl.useProgram(this.sky.program);
    gl.uniform4f(this.sky.u('u_rect'), -1, -1, 1, 1);
    gl.uniform3fv(this.sky.u('u_zenith'), labToRgb(g.zenith));
    gl.uniform3fv(this.sky.u('u_horizon'), labToRgb(g.horizon));
    gl.uniform3fv(this.sky.u('u_glow'), labToRgb(g.glow));
    gl.uniform1f(this.sky.u('u_glowStrength'), g.glowStrength);
    gl.uniform1f(this.sky.u('u_glowWidth'), g.glowWidth);
    gl.uniform2f(this.sky.u('u_sun'), v.sunX, v.sunY);
    gl.uniform1f(this.sky.u('u_horizonRow'), this.nativeH - VIEW_H + v.horizon);
    gl.uniform1f(this.sky.u('u_scale'), this.scale);
    gl.uniform2f(this.sky.u('u_view'), this.nativeW, this.nativeH);
    gl.uniform4f(this.sky.u('u_viewport'), vx, vy, vw, vh);
    gl.uniform1f(this.sky.u('u_night'), g.night);
    gl.uniform1f(this.sky.u('u_sunUp'), v.sunUp);
    gl.uniform2f(this.sky.u('u_moon'), v.moonX, v.moonY);
    gl.uniform1f(this.sky.u('u_moonPhase'), v.moonPhase);
    gl.uniform1f(this.sky.u('u_moonUp'), v.moonUp);
    gl.uniform1f(this.sky.u('u_clear'), v.clear);
    gl.uniform1f(this.sky.u('u_time'), v.time % 3400);
    gl.uniform1f(this.sky.u('u_milky'), v.milky);
    gl.uniform1f(this.sky.u('u_aurora'), v.aurora);
    gl.uniform1f(this.sky.u('u_seed'), (v.seed % 997) / 97);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // The layers, back to front, premultiplied.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.composite.program);
    gl.uniform4f(this.composite.u('u_rect'), -1, -1, 1, 1);
    gl.uniform1i(this.composite.u('u_tex'), 0);
    gl.uniform2f(this.composite.u('u_texSize'), this.nativeW + 2, this.nativeH + 2);
    gl.uniform1f(this.composite.u('u_scale'), this.scale);
    gl.uniform2f(this.composite.u('u_view'), this.nativeW, this.nativeH);
    gl.uniform4f(this.composite.u('u_viewport'), vx, vy, vw, vh);
    gl.uniform1f(this.composite.u('u_alpha'), 1);
    gl.uniform3fv(this.composite.u('u_glow'), labToRgb(g.glow));
    gl.uniform2f(this.composite.u('u_sun'), v.sunX, v.sunY);
    gl.uniform1f(this.composite.u('u_glowWidth'), g.glowWidth);
    gl.uniform1f(this.composite.u('u_glowStrength'), g.glowStrength);
    gl.activeTexture(gl.TEXTURE0);
    for (const l of this.layers) {
      if (this.only !== null && !this.only.has(l.index)) continue;
      gl.useProgram(this.composite.program);
      gl.bindVertexArray(this.quad);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, l.color);
      gl.uniform2f(this.composite.u('u_frac'), l.fx, l.fy);
      gl.uniform1f(this.composite.u('u_haze'), hazeAt(l.def.z, 0.12));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const batch = this.batches[l.index];
      if (batch.count > 0 && this.atlas !== null) {
        const near = batch === this.ground;
        batch.draw(this.atlas, this.paletteTex, this.scale, [vx, vy, vw, vh], this.canvasW, this.canvasH, v.rim, v.rimSide, near ? v.rimStrength : v.rimStrength / l.def.z, near ? v.light : NO_LIGHT);
      }
      this.air(v, l.index, [vx, vy, vw, vh]);
    }
    gl.bindVertexArray(this.quad);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);

    // 4. Final pass to the canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvasW, this.canvasH);
    gl.useProgram(this.final.program);
    gl.uniform4f(this.final.u('u_rect'), -1, -1, 1, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.uniform1i(this.final.u('u_scene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
    gl.uniform1i(this.final.u('u_bloom'), 1);
    gl.uniform1f(this.final.u('u_bloomStrength'), v.bloom);
    gl.uniform4f(this.final.u('u_viewport'), vx, vy, vw, vh);
    gl.uniform2f(this.final.u('u_size'), this.canvasW, this.canvasH);
    gl.uniform1f(this.final.u('u_time'), v.time % 1000);
    gl.uniform1f(this.final.u('u_grain'), 0.035);
    gl.uniform1f(this.final.u('u_vignette'), 0.32);
    gl.uniform3f(this.final.u('u_lift'), v.flash * 0.18, v.flash * 0.2, v.flash * 0.26);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}

const SCRATCH = new Uint8Array(3);
const RECT = [0, 0, 0, 0];
const RGB = new Float32Array(3);

/** An Oklab colour as linear-free sRGB 0..1 floats for a uniform (reuses one array). */
function labToRgb(lab: readonly number[]): Float32Array {
  labBytes(lab[0], lab[1], lab[2], SCRATCH);
  RGB[0] = SCRATCH[0] / 255;
  RGB[1] = SCRATCH[1] / 255;
  RGB[2] = SCRATCH[2] / 255;
  return RGB;
}

const labBytes = (L: number, a: number, b: number, out: Uint8Array): void => labToBytes(L, a, b, out, 0);
