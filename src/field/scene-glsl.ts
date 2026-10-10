import { BOOM_RESPONSE_GLSL, BOOM_SLOTS } from "./boom";

/**
 * Shader for the page-wide scenes. All motion is computed here, on the GPU, from a time uniform: nothing moves because
 * JavaScript touched a point, so keystrokes, route changes and scene swaps never queue per-point work on the main thread.
 * Two copies of every attribute (current scene A, next scene B) let a scene swap morph point-by-point.
 */
export const SCENE_VERT = /* glsl */ `
attribute vec3 aP;  attribute vec4 aC;  attribute vec4 aM;  attribute float aS;
attribute vec3 aP2; attribute vec4 aC2; attribute vec4 aM2; attribute float aS2;
uniform float uTime;
uniform float uMorph;
uniform float uBuild;
uniform float uEnergy;
uniform float uAsk;
uniform float uAskOn;
uniform float uDpr;
uniform float uSize;
uniform float uLoop;
uniform float uHalfW;
uniform float uDark;
uniform vec2 uTilt;      // x: tilt about X (A, B)
uniform vec2 uSway;      // y-sway amplitude (A, B)
uniform vec3 uPointer;   // world-space pointer on the z=0 plane
uniform float uPointerOn;
uniform vec3 uCol[8];
// onboarding "boom": up to ${BOOM_SLOTS} overlapping impulses layered on top of each point's current position.
uniform vec4 uBo[${BOOM_SLOTS}];  // origin (world) xyz, seconds since (-1 = free slot)
uniform vec4 uBp[${BOOM_SLOTS}];  // variant, intensity, rotation, time-constant
uniform vec4 uBq[${BOOM_SLOTS}];  // palette tint index, share of points hit hardest
uniform float uPers;     // onboarding "personalizing": the field turns inward, then unwinds into the next scene
uniform float uCalm;     // reduced motion: no displacement, a quick brightness fade instead
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
varying float vGlow;

float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
${BOOM_RESPONSE_GLSL}
vec2 rot2(vec2 v, float a) { float c = cos(a); float s = sin(a); return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }

// One boom's push on one point. It never looks at a "default" or an initial position: it only returns an OFFSET from where
// the point already is, which is 0 at t=0, kicks in smoothly, and returns to 0 (see bResp / bLife), so the ambient motion
// continues underneath without a seam. 'act' (0..1) says how hard this point is hit, for brightness and the accent tint.
vec3 boomPush(vec3 p, vec4 o, vec4 pr, vec4 qq, float s, out float act) {
  float t = o.w; float K = pr.y; float tau = pr.w; float v = pr.x + 0.5;
  float life = bLife(t, tau);
  float env = bResp(t, tau) * life;
  float att = smoothstep(0.0, 0.07, t);
  vec3 bd = p - o.xyz;
  vec2 q2 = rot2(bd.xy, pr.z);
  float bl = length(vec3(bd.xy, bd.z * 0.6));
  vec3 dir = bd / max(bl, 0.001);
  float strong = mix(0.3, 1.0, step(hash(s * 5.7 + 2.0), qq.y));
  float h1 = hash(s * 3.1);
  float h2 = hash(s * 9.1 + 4.0);
  vec3 d = vec3(0.0);
  act = 0.0;
  if (v < 1.0) {
    // shockwave rings: three fronts leave the origin one after another (an ellipse, turned by the rotation)
    float el = length(vec3(q2.x * 0.82, q2.y * 1.18, bd.z * 0.6));
    float w = 0.8 + t * 1.1;
    float sp = 8.5 / (0.6 + tau);
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
      float f = sp * (t - float(i) * 0.2) - 3.4 * w;
      a += exp(-((el - f) * (el - f)) / (2.0 * w * w)) * (1.0 - 0.28 * float(i));
    }
    a *= att * exp(-t * 1.1) * life;
    d = dir * a * 1.7 * K * mix(0.55, 1.0, strong);
    d.z += (h1 - 0.5) * 2.2 * a * K;
    act = min(a, 1.0);
  } else if (v < 2.0) {
    // spiral: arms of points wind around the origin and unwind
    float arm = 0.5 + 0.5 * sin(atan(q2.y, q2.x) * 3.0 + bl * 0.45 - t * 4.0);
    float th = K * 1.35 * env * exp(-bl * 0.1) * (0.45 + 0.55 * arm);
    d.xy = rot2(bd.xy, th) - bd.xy;
    d.xy += dir.xy * env * K * (0.5 + 0.9 * h1) * (0.4 + arm);
    act = min(env * exp(-bl * 0.08) * (0.5 + arm), 1.0);
  } else if (v < 3.0) {
    // radial burst: an impulse thrown straight out, hardest near the origin, each point its own strength
    d = dir * env * K * 3.4 / (1.0 + bl * 0.32) * (0.55 + 0.9 * h2) * strong;
    act = min(env * exp(-bl * 0.1) * strong, 1.0);
  } else if (v < 4.0) {
    // vortex: the neighbourhood swirls round the origin while it is drawn in a little
    float th = K * 2.0 * env * exp(-bl * 0.2);
    d.xy = rot2(bd.xy, th) - bd.xy;
    d.xy -= dir.xy * env * K * 0.7 * exp(-bl * 0.14);
    d.z += (h1 - 0.5) * env * K * 0.8;
    act = min(env * exp(-bl * 0.12) * 1.2, 1.0);
  } else if (v < 5.0) {
    // fracture and reform: the field splits into shards that slide apart, then slide back and knit together
    float sid = floor((atan(q2.y, q2.x) + 3.14159265) / 6.2831853 * 7.0) + floor(bl * 0.45) * 3.0;
    float sh = sid * 12.9898;
    vec3 sdir = vec3(cos(sh * 3.1), sin(sh * 5.3), sin(sh * 2.1) * 0.6);
    d = (sdir * 1.9 + dir * 0.7) * K * env * exp(-bl * 0.07);
    act = min(env * 0.95 * exp(-bl * 0.05), 1.0);
  } else if (v < 6.0) {
    // ripple: concentric swells through depth, travelling out from the origin
    float ph = bl * 1.5 - t * 9.0 + pr.z;
    float er = att * exp(-t * 0.9) * life * exp(-bl * 0.09);
    d.z = sin(ph) * 1.5 * K * er;
    d.xy = dir.xy * cos(ph) * 0.55 * K * er;
    act = abs(sin(ph)) * er;
  } else if (v < 7.0) {
    // pulse: the field breathes in toward the origin, then rebounds outward and settles
    float g = sin(t / tau * 2.4) * exp(-t / (2.2 * tau)) * life;
    d = -dir * K * 1.9 * g * exp(-bl * 0.1);
    act = min(abs(g) * exp(-bl * 0.08) * 1.3, 1.0);
  } else {
    // turbulence: a gust of per-point noise
    d = vec3(sin(s * 91.0 + t * 4.0 + pr.z), cos(s * 53.0 + t * 3.3), sin(s * 17.0 + t * 2.7)) * K * 1.5 * env * exp(-bl * 0.09) * strong;
    act = min(env * 0.8 * exp(-bl * 0.06), 1.0);
  }
  return d;
}

vec3 scatterV(float s) { return (vec3(hash(s * 13.1 + 1.0), hash(s * 29.7 + 2.0), hash(s * 7.3 + 3.0)) - 0.5) * vec3(2.4, 1.5, 1.2) * uHalfW; }

// kinds: 0 hold (tiny drift) · 1 orbit · 2 flow along x with a wave · 3 travel c->p · 4 assemble (loops) · 6 breathe
vec3 motion(vec3 p, vec4 c, vec4 m, float s, float t, out float fade) {
  float kind = m.x;
  fade = 1.0;
  // every point drifts a little all the time, so even "held" structure is alive
  vec3 drift = vec3(sin(t * 0.31 + s * 40.0), cos(t * 0.27 + s * 23.0), sin(t * 0.23 + s * 11.0)) * 0.06;
  if (kind < 0.5) return p + drift;
  if (kind < 1.5) {
    vec2 d = p.xy - c.xy;
    float a = m.y * t;
    float ca = cos(a); float sa = sin(a);
    return vec3(c.xy + vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca), p.z) + drift * 0.6;
  }
  if (kind < 2.5) {
    float L = uHalfW;
    float x = mod(p.x + m.y * t + L, 2.0 * L) - L;
    fade = smoothstep(L, L * 0.8, abs(x));
    return vec3(x, p.y + sin(x * c.x + c.y + t * 0.35) * c.z, p.z) + drift * 0.5;
  }
  if (kind < 3.5) {
    float f = fract(m.y * t + s);
    fade = sin(3.14159265 * f);
    return mix(c.xyz, p, f) + drift * 0.4;
  }
  if (kind < 4.5) {
    float r = smoothstep(c.w, c.w + 0.14, uLoop) * (1.0 - smoothstep(1.2, 1.44, uLoop));
    float e = r * r * (3.0 - 2.0 * r);
    fade = 0.3 + 0.7 * e;
    return mix(p + scatterV(s), p, e) + drift * (0.4 + 0.6 * e);
  }
  float b = 1.0 + 0.05 * sin(t * m.y + s * 6.2831853);
  return c.xyz + (p - c.xyz) * b + drift * 0.7;
}

float groupLight(float g) {
  // Ask: the question fans out (5), answers converge (6), the answer core (7) grows as the run progresses
  if (g > 6.5) return 0.55 + 0.45 * uAskOn * smoothstep(0.15, 1.0, uAsk) + 0.15 * uAskOn;
  if (g > 5.5) return 0.4 + 0.6 * uAskOn * smoothstep(0.3, 0.9, uAsk);
  if (g > 4.5) return 0.5 + 0.5 * uAskOn;
  return 1.0;
}

void main() {
  float fa; float fb;
  vec3 pa = motion(aP, aC, aM, aS, uTime, fa);
  vec3 pb = motion(aP2, aC2, aM2, aS2, uTime, fb);
  float st = hash(aS2 * 7.7 + 1.3);
  float k = clamp(uMorph * 1.7 - st * 0.7, 0.0, 1.0);
  float e = k * k * (3.0 - 2.0 * k);
  vec3 p = mix(pa, pb, e);
  // dissolve and re-form: points swirl out a little as they cross over
  p += vec3(sin(aS * 91.0), cos(aS * 53.0), sin(aS * 17.0)) * sin(3.14159265 * e) * (1.3 - 0.95 * uCalm);
  // assemble-on-load
  float bk = clamp(uBuild * 1.7 - aS * 0.7, 0.0, 1.0);
  bk = 1.0 - pow(1.0 - bk, 3.0);
  p = mix(p + scatterV(aS + 3.7), p, bk);

  // pointer: points part gently around it
  vec2 dd = p.xy - uPointer.xy;
  float fall = exp(-dot(dd, dd) / 2.4) * uPointerOn;
  p.xy += normalize(dd + 1e-4) * fall * 0.45;

  // personalizing: the whole field turns inward around its centre (unwinds as the next scene forms)
  if (uPers > 0.001) {
    float pr = length(p.xy);
    float pa = uPers * (0.5 + 1.5 * exp(-pr * 0.22)) * (1.0 - 0.85 * uCalm);
    float pc = cos(pa); float ps = sin(pa);
    p.xy = vec2(p.x * pc - p.y * ps, p.x * ps + p.y * pc) * (1.0 - 0.2 * uPers * (1.0 - 0.85 * uCalm));
  }

  // whole-scene tilt (about X) and a slow sway (about Y)
  float tilt = mix(uTilt.x, uTilt.y, e);
  float sway = mix(uSway.x, uSway.y, e) * sin(uTime * 0.17);
  float cy = cos(sway); float sy = sin(sway);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  float cx = cos(tilt); float sx = sin(tilt);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);

  // boom: impulses layered on the point's current position (it is already moving: ambient, morph, personalizing turn)
  float boost = 0.0;
  vec3 bTint = vec3(0.0);
  float bTintW = 0.0;
  for (int i = 0; i < ${BOOM_SLOTS}; i++) {
    float bt = uBo[i].w;
    if (bt >= 0.0) {
      if (uCalm > 0.5) {
        // reduced motion: nothing moves, the field just brightens and settles
        boost += 0.45 * smoothstep(0.0, 0.05, bt) * exp(-bt * 4.0);
      } else {
        float act;
        p += boomPush(p, uBo[i], uBp[i], uBq[i], aS, act);
        boost += act * 0.8 * min(uBp[i].y, 1.5);
        bTint += uCol[int(uBq[i].x + 0.5)] * act;
        bTintW += act;
      }
    }
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = mix(aM.z, aM2.z, e);
  float gA = aM.w; float gB = aM2.w;
  float lightA = groupLight(gA); float lightB = groupLight(gB);
  float brA = (aM.x > 3.5 && aM.x < 4.5 ? 1.0 : aC.w) * fa * lightA;
  float brB = (aM2.x > 3.5 && aM2.x < 4.5 ? 1.0 : aC2.w) * fb * lightB;
  float br = mix(brA, brB, e);
  size *= 1.0 + 0.3 * uAskOn * step(4.5, mix(gA, gB, e));
  // tiny, hard-edged: CSS px x device pixel ratio, perspective kept in a narrow band so nothing swells into a blur
  float px = uSize * size * uDpr * clamp(14.0 / max(0.5, -mv.z), 0.8, 1.7) * (1.0 + 0.25 * uEnergy);
  px *= (1.0 + 0.8 * boost) * (1.0 + 0.9 * uDark);
  vGlow = uDark;
  gl_PointSize = max(px, 1.0);
  vPx = gl_PointSize;

  vec3 colA = uCol[int(gA + 0.5)];
  vec3 colB = uCol[int(gB + 0.5)];
  vCol = mix(colA, colB, e);
  vAlpha = clamp(br * (0.78 + 0.35 * uEnergy + 0.2 * uPers) * bk + boost * 0.6, 0.0, 1.0);
  if (bTintW > 0.001) vCol = mix(vCol, bTint / bTintW, clamp(bTintW * 0.9, 0.0, 0.75));
}
`;

/** A hard disc with a ~1.5 px anti-aliased rim. No halo, no soft sprite, no bloom. */
export const SCENE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
varying float vGlow;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  // light: a hard disc with a ~1.5 px anti-aliased rim. dark: the same bright core, grown into a soft white glow.
  float k = 1.0 + 0.9 * vGlow;
  float aa = clamp(1.5 / max(vPx / k, 1.0), 0.08, 1.0);
  float core = 1.0 - smoothstep(1.0 - aa, 1.0, r * k);
  float halo = vGlow * 0.55 * pow(max(0.0, 1.0 - r), 2.4);
  float a = max(core, halo) * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vCol, a);
}
`;
