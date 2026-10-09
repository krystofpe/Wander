// Sprites: the atlas of hand-drawn frames (each pixel a colour role), drawn as instanced quads at float positions
// on the full-resolution scene, coloured through the same palette rows as the layer they stand in, with a 1 px
// rim of light on the edge facing the light (research: Light §14–15, HD §9).
import { decodeIndexedPng } from '../src/png.ts';
import { Gpu } from './gl.ts';
import type { Program } from './gl.ts';

export type Atlas = {
  readonly w: number;
  readonly h: number;
  readonly tex: WebGLTexture;
  /** sheet → tag → frames [x, y, w, h, ms] */
  readonly sheets: Readonly<Record<string, Readonly<Record<string, readonly (readonly number[])[]>>>>;
  readonly points: Readonly<Record<string, readonly [number, number]>>;
};

export async function loadAtlas(gpu: Gpu): Promise<Atlas> {
  const [png, meta] = await Promise.all([fetch('/assets/atlas.png').then((r) => r.arrayBuffer()), fetch('/assets/atlas.json').then((r) => r.json())]);
  const img = await decodeIndexedPng(png);
  const gl = gpu.gl;
  const tex = gpu.texture({ width: img.w, height: img.h, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, bytes: 1 }, img.indices);
  const m = meta as { sheets: Atlas['sheets']; points: Atlas['points'] };
  return { w: img.w, h: img.h, tex, sheets: m.sheets, points: m.points };
}

const MAX = 512;
/** Floats per instance: rect (x, y, w, h; native, top-left), source (atlas x, y, w, h), rows (A, B, k, flip), alpha. */
const STRIDE = 13;

const VS = `#version 300 es
in vec2 a_pos;
in vec4 i_rect;
in vec4 i_src;
in vec4 i_rows;
in float i_alpha;
uniform float u_scale;
uniform vec4 u_viewport;
uniform vec2 u_canvas;
out vec2 v_local;
flat out vec4 v_src;
flat out vec4 v_rows;
flat out float v_alpha;
void main() {
  // Snap the sprite's top-left to whole screen pixels: every art pixel stays exactly scale × scale.
  vec2 origin = floor(i_rect.xy * u_scale + 0.5);
  vec2 p = origin + a_pos * i_rect.zw * u_scale;
  // u_viewport.y is the gap below the native view; rows count from its top.
  vec2 canvas = vec2(u_viewport.x + p.x, (u_viewport.y + u_viewport.w) - p.y);
  gl_Position = vec4(canvas / u_canvas * 2.0 - 1.0, 0.0, 1.0);
  v_local = a_pos * i_rect.zw;
  v_src = i_src;
  v_rows = i_rows;
  v_alpha = i_alpha;
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_atlas;
uniform sampler2D u_palette;
uniform vec3 u_rim;
uniform float u_rimSide;
uniform float u_rimStrength;
in vec2 v_local;
flat in vec4 v_src;
flat in vec4 v_rows;
flat in float v_alpha;
out vec4 o_color;

int roleAt(ivec2 t, ivec2 size) {
  if (t.x < 0 || t.y < 0 || t.x >= size.x || t.y >= size.y) return 0;
  return int(texelFetch(u_atlas, ivec2(v_src.xy) + t, 0).r * 255.0 + 0.5);
}

void main() {
  ivec2 size = ivec2(v_src.zw);
  ivec2 t = ivec2(floor(v_local));
  // Mirrored when walking left.
  bool flip = v_rows.w > 0.5;
  ivec2 s = flip ? ivec2(size.x - 1 - t.x, t.y) : t;
  int role = roleAt(s, size);
  if (role == 0) discard;
  vec4 pa = texelFetch(u_palette, ivec2(role, int(v_rows.x)), 0);
  vec4 pb = texelFetch(u_palette, ivec2(role, int(v_rows.y)), 0);
  vec4 p = mix(pa, pb, v_rows.z);
  vec3 c = p.rgb;
  // A rim: this pixel is on the outline facing the light (the side the sun or the fire is on), or the top edge.
  int side = int(u_rimSide * (flip ? -1.0 : 1.0));
  if (u_rimStrength > 0.0 && p.a > 0.99) {
    bool edge = (side != 0 && roleAt(s + ivec2(side, 0), size) == 0) || roleAt(s + ivec2(0, -1), size) == 0;
    if (edge) c = mix(c, u_rim, u_rimStrength);
  }
  o_color = vec4(c, 1.0) * v_alpha;
}`;

export class SpriteBatch {
  private readonly gpu: Gpu;
  private readonly prog: Program;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private readonly data = new Float32Array(MAX * STRIDE);
  count = 0;

  constructor(gpu: Gpu, quad: WebGLBuffer) {
    this.gpu = gpu;
    const gl = gpu.gl;
    this.prog = gpu.program(VS, FS, 'sprites');
    this.vao = gpu.vertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const loc = (n: string): number => gl.getAttribLocation(this.prog.program, n);
    gl.enableVertexAttribArray(loc('a_pos'));
    gl.vertexAttribPointer(loc('a_pos'), 2, gl.FLOAT, false, 0, 0);
    this.buf = gpu.buffer(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const attr = (name: string, size: number, offset: number): void => {
      const l = loc(name);
      if (l < 0) return;
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
      gl.vertexAttribDivisor(l, 1);
    };
    attr('i_rect', 4, 0);
    attr('i_src', 4, 4);
    attr('i_rows', 4, 8);
    attr('i_alpha', 1, 12);
    gl.bindVertexArray(null);
  }

  clear(): void {
    this.count = 0;
  }

  /**
   * Queues one sprite frame: top-left at native (x, y) (fractional allowed), frame [ax, ay, w, h] in the atlas,
   * palette rows A and B mixed by k, mirrored or not.
   */
  add(x: number, y: number, frame: readonly number[], rowA: number, rowB: number, k: number, flip: boolean, alpha = 1): void {
    if (this.count >= MAX) return;
    const o = this.count * STRIDE;
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = frame[2];
    d[o + 3] = frame[3];
    d[o + 4] = frame[0];
    d[o + 5] = frame[1];
    d[o + 6] = frame[2];
    d[o + 7] = frame[3];
    d[o + 8] = rowA;
    d[o + 9] = rowB;
    d[o + 10] = k;
    d[o + 11] = flip ? 1 : 0;
    d[o + 12] = alpha;
    this.count++;
  }

  draw(atlas: Atlas, palette: WebGLTexture, scale: number, viewport: readonly number[], canvasW: number, canvasH: number, rim: Float32Array, rimSide: number, rimStrength: number): void {
    if (this.count === 0) return;
    const gl = this.gpu.gl;
    gl.useProgram(this.prog.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * STRIDE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, palette);
    gl.uniform1i(this.prog.u('u_atlas'), 0);
    gl.uniform1i(this.prog.u('u_palette'), 1);
    gl.uniform1f(this.prog.u('u_scale'), scale);
    gl.uniform4f(this.prog.u('u_viewport'), viewport[0], viewport[1], viewport[2], viewport[3]);
    gl.uniform2f(this.prog.u('u_canvas'), canvasW, canvasH);
    gl.uniform3fv(this.prog.u('u_rim'), rim);
    gl.uniform1f(this.prog.u('u_rimSide'), rimSide);
    gl.uniform1f(this.prog.u('u_rimStrength'), rimStrength);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }
}
