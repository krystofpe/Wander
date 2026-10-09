// GLSL for the passes (research: HD §6–21). Rows are counted from the top everywhere in this file's maths;
// framebuffer rows are flipped once where they are read or written.

/** Resolves one layer at native resolution: role → palette, the two biome rows mixed by the column's blend. */
export const RESOLVE_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_ring;
uniform sampler2D u_cols;
uniform sampler2D u_palette;
uniform ivec2 u_origin;
uniform int u_ringW;
uniform int u_height;
uniform int u_targetH;
uniform int u_rowBase;
uniform float u_sway;
uniform float u_time;
uniform float u_gustX;
layout(location = 0) out vec4 o_color;
layout(location = 1) out vec4 o_glow;

int roleAt(int x, int row, out int flags) {
  flags = 0;
  if (row < 0 || row >= u_height) return 0;
  vec4 v = texelFetch(u_ring, ivec2(((x % u_ringW) + u_ringW) % u_ringW, row), 0);
  flags = int(v.g * 255.0 + 0.5);
  return int(v.r * 255.0 + 0.5);
}

// The wind's shift for a pixel of sway weight w at ring column x: a travelling gust, whole pixels only.
int shiftOf(int w, int x) {
  if (w == 0 || u_sway == 0.0) return 0;
  float block = floor(float(x) / 8.0);
  float g = 0.45 + 0.55 * pow(max(0.0, sin(6.2831853 * (block * 8.0 - u_gustX) / 300.0)), 3.0);
  return int(floor(u_sway * g * (float(w) / 7.0) + 0.5));
}

void main() {
  int x = int(gl_FragCoord.x);
  int row = u_targetH - 1 - int(gl_FragCoord.y);
  int gx = u_origin.x + x;
  int gy = u_origin.y + row;
  int flags;
  int role = 0;
  // A swaying pixel is drawn where the wind has pushed it: look back along the wind for one that lands here.
  for (int s = 0; s <= 2; s++) {
    int f;
    int sx = gx - s * (u_sway >= 0.0 ? 1 : -1);
    int r = roleAt(sx, gy, f);
    if (r != 0 && abs(shiftOf(f & 7, sx)) == s) { role = r; flags = f; break; }
  }
  if (role == 0) { o_color = vec4(0.0); o_glow = vec4(0.0); return; }
  vec4 c = texelFetch(u_cols, ivec2(((gx % u_ringW) + u_ringW) % u_ringW, 0), 0);
  int a = int(c.r * 255.0 + 0.5);
  int b = int(c.g * 255.0 + 0.5);
  vec4 pa = texelFetch(u_palette, ivec2(role, u_rowBase + a), 0);
  vec4 pb = texelFetch(u_palette, ivec2(role, u_rowBase + b), 0);
  vec4 p = mix(pa, pb, c.b);
  o_color = vec4(p.rgb, 1.0);
  // Palette alpha carries how much a role glows (a lamp, a lit window at night): 1 means not at all.
  float glow = 1.0 - p.a;
  o_glow = vec4(p.rgb * glow, glow);
}`;

/** Composites one native layer target onto the full-resolution scene with its own fractional offset. */
export const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texSize;
uniform vec2 u_frac;
uniform float u_scale;
uniform vec2 u_view;
uniform vec4 u_viewport;
uniform float u_alpha;
uniform vec3 u_glow;
uniform vec2 u_sun;
uniform float u_glowWidth;
uniform float u_glowStrength;
uniform float u_haze;
out vec4 o_color;

// Antialiased point sampling (d7samurai): nearest when aligned, one blended screen pixel at a texel edge otherwise.
vec4 aaSample(vec2 t) {
  vec2 fw = vec2(1.0 / u_scale);
  vec2 pix = floor(t) + min(fract(t) / fw, 1.0) - 0.5;
  return texture(u_tex, pix / u_texSize);
}

void main() {
  vec2 screen = vec2(gl_FragCoord.x - u_viewport.x, u_viewport.w - (gl_FragCoord.y - u_viewport.y));
  vec2 nat = screen / u_scale;
  // Target texel (rows from the top) = view position + fractional offset + 1 for the margin.
  vec2 t = nat + u_frac + 1.0;
  vec2 tf = vec2(t.x, u_texSize.y - t.y);
  vec4 c = aaSample(tf);
  // Haze glows toward the sun: far layers near it warm and lighten (Quilez's sun-aware fog, in 2D).
  vec2 d = (nat - u_sun) / vec2(u_view.x * u_glowWidth * 1.2, u_view.x * u_glowWidth * 0.7);
  float lobe = exp(-dot(d, d) * 1.6) * u_glowStrength;
  c.rgb = mix(c.rgb, u_glow * c.a, clamp(lobe * u_haze * 0.75, 0.0, 0.85));
  o_color = c * u_alpha;
}`;

/**
 * The sky. Its gradient and the glow around the sun are edgeless light, so they are smooth and full-resolution (the
 * final pass dithers them); the sun's disc, the moon in its phase and the stars are pixel art on the native grid
 * (research: Light §9–17, HD §14–15).
 */
export const SKY_FS = `#version 300 es
precision highp float;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec3 u_glow;
uniform float u_glowStrength;
uniform float u_glowWidth;
uniform vec2 u_sun;
uniform float u_sunUp;
uniform vec2 u_moon;
uniform float u_moonPhase;
uniform float u_moonUp;
uniform float u_horizonRow;
uniform float u_scale;
uniform vec2 u_view;
uniform vec4 u_viewport;
uniform float u_night;
uniform float u_clear;
uniform float u_time;
out vec4 o_color;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 screen = vec2(gl_FragCoord.x - u_viewport.x, u_viewport.w - (gl_FragCoord.y - u_viewport.y));
  vec2 f = screen / u_scale;
  vec2 n = floor(f);
  float t = clamp(f.y / u_horizonRow, 0.0, 1.0);
  vec3 c = mix(u_zenith, u_horizon, pow(t, 1.7));
  vec2 d = (f - u_sun) / vec2(u_view.x * u_glowWidth, u_view.x * u_glowWidth * 0.5);
  float lobe = exp(-dot(d, d) * 2.0) * u_glowStrength;
  c = mix(c, u_glow, clamp(lobe, 0.0, 1.0));
  // The moon's halo: soft, cold, wider on hazy nights.
  vec2 dm = (f - u_moon) / 26.0;
  float mh = exp(-dot(dm, dm) * 1.4) * u_moonUp * 0.22 * u_clear * (0.4 + 0.6 * abs(u_moonPhase - 0.5) * -2.0 + 0.6);
  c += vec3(0.55, 0.6, 0.75) * mh * (0.3 + u_night);
  // Stars: fixed to the sky, brighter and steadier high up, twinkling near the horizon.
  float h = hash(n * 1.37 + 11.0);
  float dark = u_night * u_clear * (1.0 - t * 0.6);
  if (h < 0.0042 * dark) {
    float b = hash(n + 3.1);
    float tw = 0.75 + 0.25 * sin(u_time * (1.5 + 3.0 * b) + h * 900.0) * (0.3 + t);
    vec3 star = b < 0.25 ? vec3(0.79, 0.84, 1.0) : b < 0.55 ? vec3(0.97, 0.96, 1.0) : b < 0.8 ? vec3(1.0, 0.9, 0.78) : vec3(1.0, 0.8, 0.55);
    float k = (0.35 + 0.65 * b * b) * tw * dark;
    c = mix(c, star, clamp(k, 0.0, 0.9));
  }
  // The sun: a flat disc on the native grid, paler at noon, deep at the horizon.
  vec2 ds = n + 0.5 - u_sun;
  if (u_sunUp > 0.0 && dot(ds, ds) <= 30.0) c = mix(c, mix(u_glow, vec3(1.0, 0.98, 0.92), 0.55), u_sunUp * u_clear);
  // The moon in its phase: lit side by the terminator, the dark side faintly lit by the earth.
  vec2 dmn = (n + 0.5 - u_moon) / 5.5;
  float rr = dot(dmn, dmn);
  if (u_moonUp > 0.0 && rr <= 1.0) {
    float e = cos(6.2831853 * u_moonPhase);
    float edge = e * sqrt(max(0.0, 1.0 - dmn.y * dmn.y));
    bool lit = u_moonPhase < 0.5 ? dmn.x > edge : dmn.x < -edge;
    // A darker sea or two on the lit face; the dark side shows only at night, faintly, by earthshine.
    vec3 moon = vec3(0.93, 0.92, 0.86) - (rr > 0.7 ? 0.08 : 0.0);
    if (hash(floor(n * 0.5)) < 0.18) moon *= 0.88;
    float k = lit ? u_moonUp * mix(0.45, 1.0, u_clear) * mix(0.6, 1.0, u_night) : u_moonUp * u_night * 0.25 * u_clear;
    if (!lit) moon = vec3(0.22, 0.24, 0.33);
    c = mix(c, moon, k);
  }
  o_color = vec4(c, 1.0);
}`;

/** The last pass: scene to the canvas with a gentle vignette, temporal grain and a triangular dither (Gjøl). */
export const FINAL_FS = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform vec2 u_size;
uniform float u_time;
uniform float u_grain;
uniform float u_vignette;
uniform vec3 u_lift;
out vec4 o_color;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec3 c = texture(u_scene, uv).rgb;
  vec2 d = uv - 0.5;
  float v = 1.0 - u_vignette * smoothstep(0.35, 0.95, length(d * vec2(1.0, 0.8)) * 1.25);
  c *= v;
  c += u_lift;
  // Grain: soft, larger than a device pixel at 4K, moving every frame.
  vec2 cell = floor(gl_FragCoord.xy / max(1.0, floor(u_size.y / 720.0)));
  float n = hash(cell + fract(u_time * 7.13) * 917.0) - 0.5;
  c += n * u_grain * (0.6 + 0.4 * (1.0 - dot(c, vec3(0.33))));
  // Triangular-PDF dither of ±1 LSB just before the 8-bit write.
  float t = hash(gl_FragCoord.xy + fract(u_time) * 131.0) + hash(gl_FragCoord.yx * 1.37 + fract(u_time * 1.7) * 71.0) - 1.0;
  c += t / 255.0;
  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
