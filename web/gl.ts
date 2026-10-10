// WebGL2 helpers, and a registry that counts every live GPU resource and its bytes, so a soak test can show that
// nothing grows however long the walk lasts. Resources are made on start and on resize, never per frame.

export type Live = { textures: number; buffers: number; framebuffers: number; vertexArrays: number; programs: number; textureBytes: number };

export type TextureSpec = {
  readonly width: number;
  readonly height: number;
  /** e.g. gl.RGBA8, gl.R8, gl.RG8, gl.RGBA16F */
  readonly internal: number;
  readonly format: number;
  readonly type: number;
  readonly filter?: number;
  readonly wrapS?: number;
  readonly wrapT?: number;
  /** Bytes per texel, for the count. */
  readonly bytes: number;
};

export class Gpu {
  readonly gl: WebGL2RenderingContext;
  readonly live: Live = { textures: 0, buffers: 0, framebuffers: 0, vertexArrays: 0, programs: 0, textureBytes: 0 };
  private readonly sizes = new Map<WebGLTexture, number>();
  readonly floatTargets: boolean;
  timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;

  constructor(canvas: HTMLCanvasElement, preserve: boolean) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: preserve,
      powerPreference: 'high-performance',
      desynchronized: false,
    });
    if (gl === null) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.floatTargets = gl.getExtension('EXT_color_buffer_float') !== null;
    gl.getExtension('EXT_color_buffer_half_float');
    this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  }

  /** The GPU's name, when the browser tells it. */
  renderer(): string {
    const gl = this.gl;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext !== null ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  texture(spec: TextureSpec, data: ArrayBufferView | null = null): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (t === null) throw new Error('out of textures');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, spec.internal, spec.width, spec.height, 0, spec.format, spec.type, data);
    const filter = spec.filter ?? gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, spec.wrapS ?? gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, spec.wrapT ?? gl.CLAMP_TO_EDGE);
    const bytes = spec.width * spec.height * spec.bytes;
    this.sizes.set(t, bytes);
    this.live.textures++;
    this.live.textureBytes += bytes;
    return t;
  }

  deleteTexture(t: WebGLTexture | null): void {
    if (t === null) return;
    const bytes = this.sizes.get(t);
    if (bytes === undefined) return;
    this.gl.deleteTexture(t);
    this.sizes.delete(t);
    this.live.textures--;
    this.live.textureBytes -= bytes;
  }

  buffer(target: number, data: ArrayBufferView | number, usage: number): WebGLBuffer {
    const gl = this.gl;
    const b = gl.createBuffer();
    if (b === null) throw new Error('out of buffers');
    gl.bindBuffer(target, b);
    if (typeof data === 'number') gl.bufferData(target, data, usage);
    else gl.bufferData(target, data, usage);
    this.live.buffers++;
    return b;
  }

  deleteBuffer(b: WebGLBuffer | null): void {
    if (b === null) return;
    this.gl.deleteBuffer(b);
    this.live.buffers--;
  }

  vertexArray(): WebGLVertexArrayObject {
    const v = this.gl.createVertexArray();
    if (v === null) throw new Error('out of vertex arrays');
    this.live.vertexArrays++;
    return v;
  }

  /** A framebuffer over colour textures (several for multiple render targets). */
  framebuffer(colors: readonly WebGLTexture[]): WebGLFramebuffer {
    const gl = this.gl;
    const fb = gl.createFramebuffer();
    if (fb === null) throw new Error('out of framebuffers');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const attachments: number[] = [];
    colors.forEach((tex, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
      attachments.push(gl.COLOR_ATTACHMENT0 + i);
    });
    gl.drawBuffers(attachments);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer incomplete: 0x${status.toString(16)}`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.live.framebuffers++;
    return fb;
  }

  deleteFramebuffer(fb: WebGLFramebuffer | null): void {
    if (fb === null) return;
    this.gl.deleteFramebuffer(fb);
    this.live.framebuffers--;
  }

  program(vertex: string, fragment: string, name: string): Program {
    const gl = this.gl;
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type);
      if (s === null) throw new Error('out of shaders');
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) ?? '';
        const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)} ${l}`).join('\n');
        throw new Error(`${name} ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader: ${log}\n${numbered}`);
      }
      return s;
    };
    const p = gl.createProgram();
    if (p === null) throw new Error('out of programs');
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${name} link: ${gl.getProgramInfoLog(p) ?? ''}`);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.live.programs++;
    const uniforms = new Map<string, WebGLUniformLocation | null>();
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(p, i);
      if (info === null) continue;
      const base = info.name.replace(/\[0\]$/, '');
      uniforms.set(base, gl.getUniformLocation(p, info.name));
    }
    return { program: p, u: (n: string) => uniforms.get(n) ?? null };
  }
}

export type Program = { readonly program: WebGLProgram; u(name: string): WebGLUniformLocation | null };

/** The vertex shader for full-screen and rectangle passes: a unit quad mapped into `u_rect` (clip space x0 y0 x1 y1). */
export const QUAD_VS = `#version 300 es
in vec2 a_pos;
uniform vec4 u_rect;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(mix(u_rect.xy, u_rect.zw, a_pos), 0.0, 1.0);
}`;
