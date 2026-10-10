// GLSL for the passes (research: HD §6–21). Rows are counted from the top everywhere in this file's maths;
// framebuffer rows are flipped once where they are read or written.

/**
 * Local light at native resolution (research: Light §5–7): up to six lights (x, y in native view pixels, radius,
 * intensity), summed with a soft falloff and cut into four rings, so each art pixel takes one of a few steps. A lit
 * pixel moves toward its own daylight colour in the light's colour: firelight shows things as they are, warmed.
 */
export const LIGHT_GLSL = `
uniform vec4 u_lights[6];
uniform int u_lightCount;
uniform vec3 u_lightColor;
uniform float u_lightGain;
uniform int u_albedoRow;
float lightAt(vec2 p) {
  float sum = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= u_lightCount) break;
    vec4 L = u_lights[i];
    vec2 d = (p - L.xy) * vec2(1.0, 1.3);
    float f = clamp(1.0 - length(d) / L.z, 0.0, 1.0);
    sum += f * sqrt(f) * L.w;
  }
  return floor(min(sum, 1.0) * 4.0 + 0.4) / 4.0 * u_lightGain;
}
`;

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
uniform vec2 u_frac;
uniform float u_cover;
layout(location = 0) out vec4 o_color;
layout(location = 1) out vec4 o_glow;
${LIGHT_GLSL}

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
  // The cloud layer: each pixel shows only once the sky is covered enough (its flags hold the cover it needs).
  if (u_cover >= 0.0 && float(flags & 127) > u_cover * 127.0) { o_color = vec4(0.0); o_glow = vec4(0.0); return; }
  vec4 c = texelFetch(u_cols, ivec2(((gx % u_ringW) + u_ringW) % u_ringW, 0), 0);
  int a = int(c.r * 255.0 + 0.5);
  int b = int(c.g * 255.0 + 0.5);
  vec4 pa = texelFetch(u_palette, ivec2(role, u_rowBase + a), 0);
  vec4 pb = texelFetch(u_palette, ivec2(role, u_rowBase + b), 0);
  vec4 p = mix(pa, pb, c.b);
  // Palette alpha carries how much a role glows (a lamp, a lit window at night): 1 means not at all.
  float glow = 1.0 - p.a;
  vec3 col = p.rgb;
  if (u_lightCount > 0 && u_lightGain > 0.0 && glow < 0.5) {
    float q = lightAt(vec2(float(x), float(row)) + 0.5 - 1.0 - u_frac);
    if (q > 0.0) {
      vec3 alb = mix(texelFetch(u_palette, ivec2(role, u_albedoRow + a), 0).rgb, texelFetch(u_palette, ivec2(role, u_albedoRow + b), 0).rgb, c.b);
      col = mix(col, max(col, alb * u_lightColor * 1.35), q);
    }
  }
  o_color = vec4(col, 1.0);
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
uniform float u_milky;
uniform float u_aurora;
uniform float u_seed;
out vec4 o_color;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 q = fract(p);
  vec2 u = q * q * (3.0 - 2.0 * q);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
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
  // The Milky Way on clear dark nights: a soft band slanting across the sky, split by a dark lane of dust and
  // thick with faint stars.
  vec2 mw = vec2(u_view.x * 0.62, u_horizonRow * 0.1);
  vec2 dir = normalize(vec2(1.0, 0.42));
  float across = dot(f - mw, vec2(-dir.y, dir.x));
  float along = dot(f - mw, dir);
  float band = exp(-across * across / 900.0) * u_milky * (1.0 - t * 0.7);
  float cloudy = smoothNoise(vec2(along / 38.0, across / 14.0)) * 0.6 + smoothNoise(vec2(along / 11.0, across / 6.0)) * 0.4;
  float lane = 1.0 - 0.75 * exp(-pow(across + 4.0 * sin(along / 60.0) - 3.0, 2.0) / 30.0) * smoothstep(0.3, 0.7, smoothNoise(vec2(along / 24.0, 3.0)));
  c += vec3(0.42, 0.45, 0.58) * band * (0.1 + 0.18 * cloudy) * lane;
  // Aurora in the cold north: curtains of green hanging from a slow wavering line, violet at their tops, their rays
  // drifting.
  if (u_aurora > 0.0) {
    float x = f.x;
    float foot = u_horizonRow * 0.42 + 16.0 * sin(x * 0.009 + u_time * 0.045 + u_seed) + 9.0 * sin(x * 0.023 - u_time * 0.031);
    float above = foot - f.y;
    if (above > -6.0) {
      float rays = 0.45 + 0.55 * smoothNoise(vec2(x / 5.0 + u_time * 0.35, u_time * 0.05)) * smoothNoise(vec2(x / 23.0 - u_time * 0.12, 7.0));
      float curtain = (above < 0.0 ? exp(above / 2.0) : exp(-above / (34.0 + 22.0 * smoothNoise(vec2(x / 40.0, u_time * 0.02))))) * rays;
      float sweep = 0.5 + 0.5 * sin(x * 0.004 + u_time * 0.02 + u_seed * 3.0);
      vec3 green = vec3(0.25, 0.95, 0.55);
      vec3 violet = vec3(0.55, 0.3, 0.85);
      vec3 ac = mix(green, violet, clamp(above / 70.0, 0.0, 1.0));
      c += ac * curtain * sweep * u_aurora * 0.5 * (1.0 - t * 0.5);
    }
  }
  // Stars: fixed to the sky, brighter and steadier high up, twinkling near the horizon; many more in the Milky Way.
  float h = hash(n * 1.37 + 11.0);
  float dark = u_night * u_clear * (1.0 - t * 0.6);
  if (h < (0.0042 + 0.02 * band) * dark) {
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
  // A shooting star now and then on a clear night: a short bright streak with a fading tail, gone in half a second.
  float slot = floor(u_time / 17.0);
  float e = hash(vec2(slot, u_seed));
  if (u_night * u_clear > 0.5 && e < 0.45) {
    float t0 = slot * 17.0 + hash(vec2(slot, 3.0)) * 12.0;
    float age = (u_time - t0) / 0.6;
    if (age > 0.0 && age < 1.0) {
      vec2 start = vec2(hash(vec2(slot, 5.0)) * u_view.x, 20.0 + hash(vec2(slot, 7.0)) * u_horizonRow * 0.45);
      vec2 v = normalize(vec2(hash(vec2(slot, 9.0)) < 0.5 ? -1.0 : 1.0, 0.45 + 0.4 * hash(vec2(slot, 11.0))));
      vec2 head = start + v * age * 70.0;
      vec2 rel = n + 0.5 - head;
      float back = -dot(rel, v);
      float side = abs(dot(rel, vec2(-v.y, v.x)));
      if (back > -0.5 && back < 18.0 && side < 0.75) {
        float k = (1.0 - back / 18.0) * sin(age * 3.14159) * u_night * u_clear;
        c = mix(c, vec3(0.92, 0.95, 1.0), clamp(k, 0.0, 1.0));
      }
    }
  }
  o_color = vec4(c, 1.0);
}`;

const BAYER_GLSL = `
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float bayer(vec2 n) { return (BAYER[int(mod(n.y, 4.0)) * 4 + int(mod(n.x, 4.0))] + 0.5) / 16.0; }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/**
 * A veil of fog or valley mist between two layers (research: Depth §12–13): two octaves of drifting noise, densest
 * at its band's floor and thinning upward, cut into four alpha steps with the shared Bayer pattern at native pixels
 * so the veil stays pixel art.
 */
export const FOG_FS = `#version 300 es
precision highp float;
uniform vec3 u_color;
uniform float u_density;
uniform float u_base;
uniform float u_height;
uniform float u_drift;
uniform float u_time;
uniform float u_scale;
uniform vec4 u_viewport;
out vec4 o_color;
${BAYER_GLSL}
void main() {
  vec2 screen = vec2(gl_FragCoord.x - u_viewport.x, u_viewport.w - (gl_FragCoord.y - u_viewport.y));
  vec2 n = floor(screen / u_scale);
  vec2 p = n + vec2(u_drift, 0.0);
  float up = max(0.0, u_base - n.y);
  float band = exp(-up / u_height) * (n.y > u_base + u_height * 2.0 ? 0.6 : 1.0);
  float f = vnoise(p / vec2(110.0, 16.0) + vec2(u_time * 0.011, 0.0)) * 0.65 + vnoise(p / vec2(41.0, 7.0) - vec2(u_time * 0.019, 0.0)) * 0.35;
  float a = u_density * band * smoothstep(0.22, 0.78, f);
  // Quantised in eighths by an ordered dither fixed to the screen's pixels: pixel-art steps, no crawling pattern,
  // and no visible dot grid in thin fog.
  a = clamp(floor(a * 8.0 + bayer(n)) / 8.0, 0.0, 0.85);
  o_color = vec4(u_color * a, a);
}`;

/**
 * Rain or snow in one depth plane, at full resolution but sized in native pixels (research: HD §17, Depth §21): a
 * grid of cells, each holding at most one drop with a hashed place and phase, falling at the plane's speed and
 * slanted by the wind.
 */
export const RAIN_FS = `#version 300 es
precision highp float;
uniform float u_amount;
uniform float u_snow;
uniform float u_wind;
uniform float u_time;
uniform float u_scale;
uniform vec4 u_viewport;
uniform vec2 u_cell;
uniform float u_speed;
uniform float u_length;
uniform float u_offset;
uniform vec3 u_color;
uniform float u_alpha;
out vec4 o_color;
${BAYER_GLSL}
void main() {
  vec2 screen = vec2(gl_FragCoord.x - u_viewport.x, u_viewport.w - (gl_FragCoord.y - u_viewport.y));
  vec2 f = screen / u_scale;
  float slant = u_wind * (u_snow > 0.5 ? 0.25 : 0.45);
  float t = u_time;
  // Shear the field by the slant so drops fall along it, then let the field fall.
  vec2 q = vec2(f.x + u_offset - slant * f.y, f.y - u_speed * t);
  vec2 cell = floor(q / u_cell);
  vec2 local = q - cell * u_cell;
  float h = hash12(cell);
  if (h > u_amount) { discard; }
  vec2 at = vec2(hash12(cell + 7.1), hash12(cell + 3.7)) * u_cell;
  float a = 0.0;
  if (u_snow > 0.5) {
    float sway = sin(t * (1.0 + h * 2.0) + h * 40.0) * 1.5;
    vec2 d = local - at - vec2(sway, 0.0);
    a = (abs(d.x) < u_length * 0.5 && abs(d.y) < u_length * 0.5) ? 1.0 : 0.0;
  } else {
    vec2 d = local - at;
    a = (abs(d.x) < 0.5 && d.y > 0.0 && d.y < u_length) ? (1.0 - d.y / u_length * 0.6) : 0.0;
  }
  if (a <= 0.0) discard;
  a *= u_alpha;
  o_color = vec4(u_color * a, a);
}`;

/** Adds a layer's glow attachment into the native glow buffer, at its fractional offset (smearing is fine for glow). */
export const GLOWADD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texSize;
uniform vec2 u_frac;
uniform vec2 u_size;
out vec4 o_color;
void main() {
  vec2 nat = vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y);
  vec2 t = nat + u_frac + 1.0;
  o_color = texture(u_tex, vec2(t.x, u_texSize.y - t.y) / u_texSize);
}`;

/** Dual-filter downsample (Bjørge): the centre and four diagonal half-texel taps. */
export const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec2 u_size;
out vec4 o_color;
void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec2 h = u_texel * 0.5;
  vec4 s = texture(u_tex, uv) * 4.0;
  s += texture(u_tex, uv + vec2(-h.x, -h.y));
  s += texture(u_tex, uv + vec2(h.x, -h.y));
  s += texture(u_tex, uv + vec2(-h.x, h.y));
  s += texture(u_tex, uv + vec2(h.x, h.y));
  o_color = s / 8.0;
}`;

/** Dual-filter upsample: a tent of eight taps around the texel, added onto the larger level. */
export const UP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec2 u_size;
out vec4 o_color;
void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec2 h = u_texel * 0.5;
  vec4 s = texture(u_tex, uv + vec2(-h.x * 2.0, 0.0));
  s += texture(u_tex, uv + vec2(-h.x, h.y)) * 2.0;
  s += texture(u_tex, uv + vec2(0.0, h.y * 2.0));
  s += texture(u_tex, uv + vec2(h.x, h.y)) * 2.0;
  s += texture(u_tex, uv + vec2(h.x * 2.0, 0.0));
  s += texture(u_tex, uv + vec2(h.x, -h.y)) * 2.0;
  s += texture(u_tex, uv + vec2(0.0, -h.y * 2.0));
  s += texture(u_tex, uv + vec2(-h.x, -h.y)) * 2.0;
  o_color = s / 12.0;
}`;

/** The last pass: scene to the canvas with a gentle vignette, temporal grain and a triangular dither (Gjøl). */
export const FINAL_FS = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform vec4 u_viewport;
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
  // Bloom from the glowing things only, smooth, at full resolution.
  vec2 bv = (gl_FragCoord.xy - u_viewport.xy) / u_viewport.zw;
  c += texture(u_bloom, bv).rgb * u_bloomStrength;
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
