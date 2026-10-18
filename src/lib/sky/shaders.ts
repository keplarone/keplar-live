/**
 * GLSL (WebGL2 / GLSL ES 3.00) for the weather sky (src/lib/sky/renderer.ts). Three programs:
 *
 * 1. NOISE: bakes the tileable 3D noise volumes once, slice by slice: the shape volume (R = Perlin-Worley, GBA = Worley FBM at
 *    rising frequencies) and the detail volume (RGB = high-frequency Worley FBM), as in Schneider's Nubis cloud model.
 * 2. CLOUDS: raymarches a cloud shell above a curved Earth through that density field (coverage from a drifting weather map,
 *    height profile by cloud type, detail erosion), with Beer-Lambert extinction, a dual-lobe Henyey-Greenstein phase with
 *    multiple-scattering octaves (bright sunlit edges, silver lining toward the sun), a powder term, height-graded ambient light
 *    (blue-gray bases), a short light march toward the sun, aerial perspective and a Rayleigh-like sky with horizon haze. It runs
 *    at a fraction of the screen resolution with per-pixel jitter (interleaved gradient noise) and is accumulated over frames.
 * 3. COMPOSITE: upscales that (bilinear), adds the small stars through the gaps (dark theme), the precipitation particle layer
 *    (rain / drizzle streaks, snow flakes), the soft lightning glow and a dither, at full resolution.
 *
 * The camera works in the coordinates of the 1600x1000 still (background-size: cover), so a live frame and a still line up.
 */

export const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const NOISE_FRAG = `#version 300 es
precision highp float;
uniform float uZ;
uniform float uSize;
uniform int uKind;
out vec4 o;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// Tileable Worley (cellular) noise, inverted (1 at feature points); p in [0, period).
float worley(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float d = 1.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      for (int z = -1; z <= 1; z++) {
        vec3 c = vec3(float(x), float(y), float(z));
        vec3 r = c + hash33(mod(id + c, period) + 0.5) - f;
        d = min(d, dot(r, r));
      }
  return 1.0 - sqrt(d);
}
float worleyFbm(vec3 p, float f) {
  return worley(p * f, f) * 0.625 + worley(p * f * 2.0, f * 2.0) * 0.25 + worley(p * f * 4.0, f * 4.0) * 0.125;
}
vec3 grad(vec3 c, float period) { return normalize(hash33(mod(c, period) + 0.5) * 2.0 - 1.0); }
float gnoise(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad(i, period), f);
  float n100 = dot(grad(i + vec3(1, 0, 0), period), f - vec3(1, 0, 0));
  float n010 = dot(grad(i + vec3(0, 1, 0), period), f - vec3(0, 1, 0));
  float n110 = dot(grad(i + vec3(1, 1, 0), period), f - vec3(1, 1, 0));
  float n001 = dot(grad(i + vec3(0, 0, 1), period), f - vec3(0, 0, 1));
  float n101 = dot(grad(i + vec3(1, 0, 1), period), f - vec3(1, 0, 1));
  float n011 = dot(grad(i + vec3(0, 1, 1), period), f - vec3(0, 1, 1));
  float n111 = dot(grad(i + vec3(1, 1, 1), period), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float perlinFbm(vec3 p, float f) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) { s += a * gnoise(p * f, f); n += a; f *= 2.0; a *= 0.5; }
  return s / n;
}
void main() {
  vec3 p = vec3(gl_FragCoord.xy / uSize, uZ);
  if (uKind == 0) {
    float pf = clamp(perlinFbm(p, 3.0) * 1.4 + 0.5, 0.0, 1.0);
    float wf = worleyFbm(p, 4.0);
    float pw = clamp((pf - (1.0 - wf)) / max(wf, 1e-3), 0.0, 1.0); // Perlin dilated by Worley (billows with soft gaps)
    o = vec4(pw, wf, worleyFbm(p, 8.0), worleyFbm(p, 16.0));
  } else {
    o = vec4(worleyFbm(p, 2.0), worleyFbm(p, 4.0), worleyFbm(p, 8.0), 1.0);
  }
}
`;

export const CLOUD_FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D uShape;
uniform sampler3D uDetail;
uniform vec2 uRes;
uniform float uRefAspect;
uniform float uTime;
uniform float uFrame;
uniform int uSteps;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmbTop;
uniform vec3 uAmbBot;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uBase;
uniform float uTop;
uniform float uCoverage;
uniform float uDensity;
uniform float uDetailAmt;
uniform float uBillow;
uniform float uClearing;
uniform float uVis;
uniform float uGray;
uniform float uExposure;
uniform vec2 uWind;
out vec4 o;

const float R = 6360.0;
const float PI = 3.14159265;
const float FOV = 0.92;     // vertical field of view of the still (radians, ~53 deg)
const float PITCH = 0.40;   // camera pitched up ~23 deg: the bottom edge sits just above the horizon

float saturate(float x) { return clamp(x, 0.0, 1.0); }
float remap(float v, float l0, float h0, float l1, float h1) { return l1 + (v - l0) * (h1 - l1) / (h0 - l0); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
float phase(float c, float k) { return mix(hg(c, -0.25 * k), hg(c, 0.82 * k), 0.72); }
vec2 sphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.0);
  float h = pow(1.0 - y, 5.0);
  vec3 c = mix(uZenith, uHorizon, h);
  // Rayleigh-like brightening toward the sun and a Mie halo around it, softened by cloud cover
  float cs = dot(rd, uSunDir);
  c += uSunCol * (0.012 * hg(cs, 0.76) + 0.05 * pow(saturate(cs), 6.0) + 0.04 * h * (0.5 + 0.5 * cs)) * (1.0 - 0.85 * uGray);
  if (rd.y < 0.0) c = mix(c, uHorizon * 0.96, saturate(-rd.y * 12.0));
  return c;
}

// Coverage multiplier in the still's frame: clear behind the headline (upper middle), denser toward the horizon and the edges.
float framing(vec2 q) {
  vec2 e = (q - vec2(0.0, 0.17)) / vec2(0.62, 0.34);
  float hole = 1.0 - smoothstep(0.55, 1.35, length(e));
  float side = abs(q.x) / uRefAspect * 2.0;
  float edge = smoothstep(0.35, 0.85, side) * 0.25 + smoothstep(0.1, -0.45, q.y) * 0.2 + smoothstep(0.2, 0.5, q.y) * smoothstep(0.25, 0.8, side) * 0.35;
  return saturate(1.0 - uClearing * hole) + edge * (1.0 - uClearing * hole * 0.6);
}

float weatherMap(vec2 xz) {
  vec4 w = texture(uShape, vec3(xz * 0.021, 0.31));
  vec4 w2 = texture(uShape, vec3(xz * 0.083 + 0.4, 0.63));
  return saturate(w.g * 0.7 + w2.r * 0.45 - 0.1);
}

float heightProfile(float h) {
  // flat bases, rounded tops for cumulus (billow = 1), a thin even slab for stratus (billow = 0)
  float bottom = smoothstep(0.0, mix(0.12, 0.06, uBillow), h);
  float top = 1.0 - smoothstep(mix(0.55, 0.3, uBillow), 1.0, h);
  return bottom * top;
}

float density(vec3 p, float cov, bool full) {
  float hgt = length(p) - R;
  float h = (hgt - uBase) / (uTop - uBase);
  if (h < 0.0 || h > 1.0) return 0.0;
  vec3 wp = p + vec3(uWind.x, 0.0, uWind.y) * uTime;
  float wm = weatherMap(wp.xz);
  float c = saturate(cov * (0.45 + wm * 1.1) + (cov - 0.5) * 0.35);
  c *= mix(1.0, smoothstep(0.0, 0.4, h) * 0.6 + 0.4, 1.0 - uBillow) ;
  vec4 s = texture(uShape, vec3(wp.x, hgt * 0.9, wp.z) * mix(0.11, 0.07, uBillow) + vec3(0.0, 0.0, 0.17));
  float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  float shape = remap(s.r, fbm - 1.0, 1.0, 0.0, 1.0);
  shape = mix(fbm * 0.9 + 0.1, shape, uBillow);
  shape *= heightProfile(h);
  float d = saturate(remap(shape, 1.0 - c, 1.0, 0.0, 1.0)) * sqrt(c);
  if (d <= 0.0) return 0.0;
  if (full) {
    vec3 dp = wp * 0.85 + vec3(0.0, uTime * 0.012, 0.0);
    vec3 n = texture(uDetail, dp).rgb;
    float hf = n.r * 0.625 + n.g * 0.25 + n.b * 0.125;
    hf = mix(hf, 1.0 - hf, saturate(h * 4.0)); // wispy below, billowy above
    d = saturate(remap(d, hf * 0.7 * uDetailAmt, 1.0, 0.0, 1.0));
  }
  return d * uDensity;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float aspect = uRes.x / uRes.y;
  vec2 p = (frag / uRes - 0.5) * vec2(aspect, 1.0);
  vec2 q = p * min(1.0, uRefAspect / aspect); // still-frame coordinates (cover)
  float tf = tan(FOV * 0.5) * 2.0;
  vec3 fwd = vec3(0.0, sin(PITCH), -cos(PITCH));
  vec3 up = vec3(0.0, cos(PITCH), sin(PITCH));
  vec3 right = vec3(1.0, 0.0, 0.0);
  vec3 rd = normalize(fwd + right * q.x * tf + up * q.y * tf);
  vec3 ro = vec3(0.0, R + 0.25, 0.0);

  vec3 bg = sky(rd);
  vec3 col = vec3(0.0);
  float T = 1.0;
  float depth = 0.0, wsum = 0.0;

  vec2 tb = sphere(ro, rd, R + uBase);
  vec2 tt = sphere(ro, rd, R + uTop);
  float t0 = rd.y > -0.02 ? tb.y : -1.0;
  if (t0 > 0.0 && t0 < 160.0) {
    float t1 = min(tt.y, t0 + mix(30.0, 12.0, saturate(t0 / 80.0)));
    float cov = saturate(uCoverage * framing(q));
    float cs = dot(rd, uSunDir);
    float jitter = ign(frag + uFrame * 5.588238);
    int steps = uSteps;
    float dt = (t1 - t0) / float(steps);
    float t = t0 + dt * jitter;
    for (int i = 0; i < 128; i++) {
      if (i >= steps || T < 0.01) break;
      vec3 pos = ro + rd * t;
      float d = density(pos, cov, true);
      if (d > 0.002) {
        // light march toward the sun, growing steps (~2.6 km)
        float od = 0.0;
        float ls = 0.06;
        vec3 lp = pos;
        for (int j = 0; j < 6; j++) {
          lp += uSunDir * ls * (1.0 + 0.5 * ign(frag + float(j) * 7.13));
          od += density(lp, cov, j < 2) * ls;
          ls *= 1.8;
        }
        float ext = 110.0;
        // multiple-scattering octaves: each one lets light through more and scatters it more evenly
        vec3 sun = vec3(0.0);
        float a = 1.0, b = 1.0, k = 1.0;
        for (int m = 0; m < 3; m++) { sun += a * exp(-od * ext * b) * phase(cs, k); a *= 0.6; b *= 0.25; k *= 0.5; }
        sun += 0.06 / (1.0 + od * ext * 0.12); // light diffused through thick cloud: thinner parts glow, thick parts darken
        float powder = 1.0 - exp(-d * ext * 0.08);
        sun *= mix(1.0, powder, 0.5 * saturate(1.0 - cs));
        float h = saturate((length(pos) - R - uBase) / (uTop - uBase));
        vec3 amb = mix(uAmbBot, uAmbTop, smoothstep(0.0, 0.8, h));
        vec3 L = uSunCol * sun * 11.0 + amb;
        float se = d * ext;
        float tr = exp(-se * dt);
        float w = T * (1.0 - tr);
        col += w * L;
        depth += w * t;
        wsum += w;
        T *= tr;
      }
      t += dt;
    }
    if (wsum > 0.0) {
      float dist = depth / wsum;
      float fog = exp(-dist / uVis);
      vec3 haze = sky(normalize(vec3(rd.x, max(rd.y, 0.0) * 0.4, rd.z)));
      col = mix(haze * (1.0 - T), col, fog);
    }
  }
  vec3 c = bg * T + col;
  // ACES (Narkowicz) tone map, then to sRGB
  c *= uExposure;
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
  c = pow(c, vec3(1.0 / 2.2));
  o = vec4(c, 1.0 - T);
}
`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uCloud;
uniform vec2 uRes;
uniform float uRefAspect;
uniform float uTime;
uniform float uStars;
uniform int uPrecip;
uniform float uPrecipAmt;
uniform float uSlant;
uniform float uFlash;
uniform vec2 uFlashPos;
uniform float uNight;
uniform float uPx;
out vec4 o;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n * 19.19)); }

// Rain / drizzle: a few layers of thin streaks falling at a slant, in screen pixels (uPx = device px per CSS px).
float streaks(vec2 px, float len, float width, float speed, float density, float seed) {
  vec2 cell = vec2(26.0, len * 3.2) * uPx;
  float a = 0.0;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float sc = 1.0 + fl * 0.6;
    vec2 p = px / sc;
    p.x += p.y * uSlant;
    p.y += uTime * speed * uPx / sc * (1.0 + fl * 0.25);
    p.y += h21(vec2(floor(p.x / cell.x), fl + seed)) * cell.y; // each column has its own phase: no rows of drops
    vec2 id = floor(p / cell);
    vec2 r = h22(id + seed + fl * 37.0);
    if (r.x > density) continue;
    vec2 f = p - (id + vec2(0.15 + 0.7 * r.y, 0.0)) * cell;
    float x = abs(f.x) / (width * uPx);
    float y = f.y / (len * uPx * (0.6 + 0.6 * r.x / max(density, 1e-3)));
    float s = (1.0 - smoothstep(0.0, 1.0, x)) * smoothstep(0.0, 0.25, y) * (1.0 - smoothstep(0.5, 1.0, y));
    a += s * (0.55 - fl * 0.12);
  }
  return a;
}

float flakes(vec2 px, float density) {
  float a = 0.0;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float size = (4.6 - fl * 1.2) * uPx;
    vec2 cell = vec2(70.0 - fl * 18.0) * uPx;
    vec2 p = px;
    p.y += uTime * (34.0 - fl * 9.0) * uPx;
    p.x += sin(uTime * 0.6 + p.y * 0.004 + fl) * 14.0 * uPx + p.y * uSlant * 0.3;
    vec2 id = floor(p / cell);
    vec2 r = h22(id + fl * 53.0);
    if (r.x > density) continue;
    vec2 c = (id + 0.2 + 0.6 * h22(id + 7.0 + fl)) * cell;
    c.x += sin(uTime * (0.8 + r.y) + r.x * 6.28) * 6.0 * uPx;
    float d = length(p - c) / size;
    a += (1.0 - smoothstep(0.15, 1.0, d)) * (0.95 - fl * 0.2);
  }
  return a;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / uRes;
  vec4 s = texture(uCloud, uv);
  vec3 c = s.rgb;
  float aspect = uRes.x / uRes.y;
  vec2 q = (uv - 0.5) * vec2(aspect, 1.0) * min(1.0, uRefAspect / aspect);

  if (uStars > 0.0) {
    // Small sparse stars in still-frame coordinates (they hold still across sizes), dimmer toward the horizon, hidden by cloud
    float pxq = uRes.y / min(1.0, uRefAspect / aspect); // device px per still unit
    vec2 g = q * 110.0;
    vec2 id = floor(g);
    vec2 r = h22(id);
    float star = 0.0;
    if (r.x < 0.045) {
      vec2 sp = id + 0.15 + 0.7 * h22(id + 3.1);
      float d = length(g - sp) * pxq / 110.0;
      float b = pow(h21(id + 9.7), 4.0) * 0.9 + 0.1;
      star = b * exp(-d * d / (0.9 * uPx * uPx));
    }
    star *= smoothstep(-0.45, 0.05, q.y) * uStars * (1.0 - s.a);
    c += vec3(0.85, 0.9, 1.0) * star;
  }

  if (uPrecip == 1 || uPrecip == 2) {
    float drizzle = uPrecip == 1 ? 1.0 : 0.0;
    float a = streaks(frag, mix(26.0, 9.0, drizzle), mix(0.9, 0.6, drizzle), mix(1100.0, 420.0, drizzle), uPrecipAmt * mix(0.55, 0.4, drizzle), 0.0);
    vec3 tint = uNight > 0.5 ? vec3(0.62, 0.68, 0.8) : vec3(0.93, 0.95, 0.98);
    c = mix(c, tint, saturate(a * mix(0.32, 0.26, drizzle)));
  } else if (uPrecip == 3) {
    float a = flakes(frag, uPrecipAmt * 0.6);
    vec3 tint = uNight > 0.5 ? vec3(0.78, 0.82, 0.92) : vec3(1.0);
    c = mix(c, tint, saturate(a * 0.85));
  }

  if (uFlash > 0.0) {
    // soft lightning inside the clouds: lights them from within, mostly where the cloud is
    float d = length((uv - uFlashPos) * vec2(aspect, 1.0));
    float glow = exp(-d * d * 2.2) * (0.25 + 0.75 * s.a);
    c += vec3(0.8, 0.84, 1.0) * uFlash * glow * 0.55;
  }

  c += (h21(frag + fract(uTime) * 61.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}
`;

