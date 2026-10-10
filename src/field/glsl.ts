/** GLSL for the Convergence Field. `streamPos` mirrors streamPos() in path.ts. */

export const COMMON = /* glsl */ `
#define PI 3.14159265
const float OX = -5.4;
const float FX = 4.4;
uniform float uTime;
uniform float uReveal;
uniform float uVerify;
uniform float uInvest;
uniform float uConverge;
uniform float uDark;
uniform float uAmb;
uniform float uBuild;
uniform float uEnergy;
uniform vec3 uColA[6];
uniform vec3 uColB[6];
uniform vec3 uGreenA; uniform vec3 uGreenB;
uniform vec3 uAmberA; uniform vec3 uAmberB;
uniform vec3 uResA; uniform vec3 uResB;

float sm(float a, float b, float x) { return smoothstep(a, b, x); }
float amp(float u) { return sm(0.05, 0.4, u) * (1.0 - sm(0.7, 0.94, u)); }
float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }

// Assemble-on-load: every particle starts scattered and flies to its place; \`seed\` staggers the arrival so the structure builds up.
float buildK(float seed) { float t = clamp(uBuild * 1.7 - seed * 0.7, 0.0, 1.0); return 1.0 - pow(1.0 - t, 3.0); }
vec3 scatter(float seed) { return (vec3(hash(seed * 13.1 + 1.0), hash(seed * 29.7 + 2.0), hash(seed * 7.3 + 3.0)) - 0.5) * vec3(12.0, 7.0, 6.0); }
vec3 assemble(vec3 p, float seed, float k) { return mix(p + scatter(seed), p, k); }

// Tiny, hard-edged points: size in CSS px (dpr-correct), perspective kept in a narrow band so nothing swells into a blur.
float pointPx(float css, float viewZ, float uDprv) { return css * uDprv * clamp(14.0 / max(0.5, -viewZ), 0.75, 1.8) * (1.0 + 0.22 * uEnergy); }

vec3 streamPos(float s, float l, float u, float seed) {
  float e = u * u * (3.0 - 2.0 * u);
  float x = mix(OX, FX, e);
  float A = amp(u);
  float spread = (s - 2.5) * 0.74;
  float y = spread * A;
  float z = (mod(s, 3.0) - 1.0) * A + sin(s * 2.3 + 1.0) * 0.35 * A;
  y += sin(u * 9.0 + seed * 6.2831 + s * 1.7) * 0.14 * A + l * 0.06 * (0.25 + A);
  z += cos(u * 7.0 + seed * 6.2831 + s) * 0.16 * A + l * 0.08;
  float d = step(4.5, s);
  float k = sm(0.36, 0.5, u) * (1.0 - sm(0.6, 0.74, u));
  y += d * k * 1.35;
  z -= d * k * 0.9;
  return vec3(x, y, z);
}

// Colour = meaning. Stream hue; green past the verification boundary; amber while the dissent is investigated;
// the resolved blue-green as everything converges.
vec3 colourFor(float s, float u) {
  int i = int(s + 0.5);
  vec3 base = mix(uColA[i], uColB[i], uDark);
  // Hero: the dissenting line is the same blue as the rest; coral only appears once the story reaches disagreement.
  base = mix(base, mix(uColA[1], uColB[1], uDark), step(4.5, s) * uAmb);
  vec3 green = mix(uGreenA, uGreenB, uDark);
  vec3 amber = mix(uAmberA, uAmberB, uDark);
  vec3 res = mix(uResA, uResB, uDark);
  float ver = sm(0.66, 0.73, u) * uVerify;
  vec3 c = mix(base, green, ver * 0.9);
  float inv = step(4.5, s) * sm(0.46, 0.54, u) * (1.0 - sm(0.6, 0.68, u)) * uInvest;
  c = mix(c, amber, inv * 0.9);
  c = mix(c, res, sm(0.86, 0.98, u) * uConverge);
  return c;
}
`;


/** Crisp point: a hard disc with a ~1.5 px anti-aliased rim. No halo, no soft sprite. */
export const POINT_FRAG = /* glsl */ `
${COMMON}
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float aa = clamp(1.5 / max(vPx, 1.0), 0.08, 1.0);
  float a = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vCol, a);
}
`;

/** The streams themselves: lines built from thousands of tiny particles laid along each path, tapered at both ends. */
export const STRAND_VERT = /* glsl */ `
${COMMON}
attribute float aU;
attribute float aStream;
attribute float aLane;
attribute float aSeed;
uniform float uFocal;
uniform float uDpr;
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
void main() {
  float u = aU;
  vec3 p = streamPos(aStream, aLane, u, aSeed);
  p += (vec3(hash(aSeed * 3.1), hash(aSeed * 7.7), hash(aSeed * 5.3)) - 0.5) * 0.012;
  float k = buildK(aSeed);
  p = assemble(p, aSeed, k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float vis = 1.0 - smoothstep(uReveal - 0.02, uReveal, u);
  float head = exp(-max(uReveal - u, 0.0) * 30.0) * step(u, uReveal);
  float taper = smoothstep(0.0, 0.07, u) * (1.0 - smoothstep(0.9, 1.0, u));
  float flow = 0.5 + 0.5 * sin(u * 64.0 - uTime * 1.1 * (1.0 + 0.6 * uEnergy) + aSeed * 30.0);
  float laneA = 1.0 - abs(aLane) * 0.34;
  float a = vis * (0.28 + 0.72 * taper) * (0.5 + 0.5 * flow) * laneA * (1.0 + 0.4 * uEnergy);
  vAlpha = clamp(a + head * 0.7, 0.0, 1.0) * k * mix(0.82, 0.9, uDark);
  vCol = colourFor(aStream, u) * (1.0 + 0.3 * head * uDark) + vec3(0.35) * head * uDark;
  float px = pointPx(1.15 + 0.5 * head, mv.z, uDpr) * (0.55 + 0.45 * taper);
  vPx = px;
  gl_PointSize = max(1.0 * uDpr, px);
}
`;

export const STRAND_FRAG = POINT_FRAG;

export const DUST_VERT = /* glsl */ `
${COMMON}
attribute float aStream;
attribute float aU0;
attribute float aLane;
attribute float aSeed;
attribute float aSize;
uniform float uFocal;
uniform float uDpr;
uniform float uSpeed;
uniform vec3 uPointer;
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
void main() {
  float sp = 0.022 + aSeed * 0.04;
  float u = fract(aU0 + uTime * sp * uSpeed);
  vec3 p = streamPos(aStream, aLane, u, aSeed);
  float A = amp(u);
  vec3 off = vec3(hash(aSeed * 3.1) - 0.5, hash(aSeed * 7.7) - 0.5, hash(aSeed * 5.3) - 0.5);
  p += off * (0.06 + 0.5 * A);
  vec2 d = p.xy - uPointer.xy;
  float f = exp(-dot(d, d) * 1.6) * uPointer.z;
  p.xy += normalize(d + vec2(1e-3)) * f * 0.3;
  float k = buildK(aSeed);
  p = assemble(p, aSeed + 0.31, k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float vis = 1.0 - smoothstep(uReveal - 0.02, uReveal, u);
  float head = exp(-max(uReveal - u, 0.0) * 22.0);
  float taper = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.93, 1.0, u));
  vAlpha = vis * taper * (0.4 + 0.6 * hash(aSeed + 2.0)) * (0.65 + 0.35 * head) * k * (1.0 + 0.35 * uEnergy) * mix(0.8, 0.86, uDark);
  vCol = colourFor(aStream, u);
  float px = pointPx(0.85 + aSize * 0.26 + 0.5 * head, mv.z, uDpr) * (0.6 + 0.4 * taper);
  vPx = px;
  gl_PointSize = max(1.0 * uDpr, px);
}
`;
export const DUST_FRAG = POINT_FRAG;

export const ORBIT_VERT = /* glsl */ `
${COMMON}
attribute float aAng;
attribute float aRad;
attribute float aSeed;
attribute float aSize;
uniform float uFocal;
uniform float uDpr;
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
void main() {
  // Kepler's second law, loosely: faster near the focus.
  float speed = 0.28 + 0.2 * aSeed;
  float ang = aAng + uTime * speed;
  float a = 1.3 + (aRad - 0.5) * 0.24;
  float b = 0.6 + (aRad - 0.5) * 0.12;
  vec3 p = vec3(cos(ang) * a - 1.15, sin(ang) * b, (aRad - 0.5) * 0.18);
  p = rotX(p, 0.95);
  p = rotZ(p, -0.28);
  p += vec3(FX, 0.0, 0.0);
  float k = buildK(aSeed);
  p = assemble(p, aSeed + 0.63, k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float peri = pow(0.5 + 0.5 * cos(ang), 2.0);
  float t = fract(aAng / 6.2831 + 0.0);
  vec3 res = mix(uResA, uResB, uDark);
  vec3 green = mix(uGreenA, uGreenB, uDark);
  vec3 blue = mix(uColA[0], uColB[0], uDark);
  vec3 cy = mix(uColA[1], uColB[1], uDark);
  vec3 c = mix(blue, cy, smoothstep(0.0, 0.5, t));
  c = mix(c, green, smoothstep(0.45, 1.0, t));
  vCol = mix(c, res, 0.2);
  vAlpha = uConverge * (0.35 + 0.65 * peri) * (0.55 + 0.45 * hash(aSeed + 9.0)) * k * 0.9;
  float px = pointPx(0.95 + aSize * 0.28 * (0.8 + 0.6 * peri), mv.z, uDpr);
  vPx = px;
  gl_PointSize = max(1.0 * uDpr, px);
}
`;
export const ORBIT_FRAG = POINT_FRAG;

/** The answer core: a few concentric rings and a centre made of hard points (no glow). */
export const CORE_VERT = /* glsl */ `
${COMMON}
attribute float aRing;
attribute float aAng;
attribute float aSeed;
uniform float uFocal;
uniform float uDpr;
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
void main() {
  float r = aRing * 0.5;
  float ang = aAng + uTime * (0.35 - aRing * 0.12);
  vec3 p = vec3(FX + cos(ang) * r, sin(ang) * r, 0.0);
  float k = buildK(aSeed);
  p = assemble(p, aSeed + 0.9, k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec3 green = mix(uGreenA, uGreenB, uDark);
  vec3 ink = mix(vec3(0.03, 0.04, 0.05), vec3(1.0), uDark);
  vCol = mix(ink, green, smoothstep(0.0, 0.5, aRing));
  vAlpha = uConverge * k * (aRing < 0.01 ? 1.0 : 0.85);
  float px = pointPx(aRing < 0.01 ? 3.6 : 1.5, mv.z, uDpr);
  vPx = px;
  gl_PointSize = max(1.0 * uDpr, px);
}
`;
export const CORE_FRAG = POINT_FRAG;

/** The verification boundary: a quiet lattice of tiny green points standing across the field. */
export const LATTICE_VERT = /* glsl */ `
${COMMON}
attribute vec3 aPos;
attribute float aSeed;
uniform float uDpr;
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
void main() {
  float k = buildK(aSeed);
  vec3 p = assemble(aPos, aSeed + 0.5, k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec2 c = vec2(aPos.y / 7.0, aPos.z / 4.6);
  float radial = 1.0 - smoothstep(0.1, 0.5, length(c * vec2(1.0, 1.25)));
  float scan = 0.5 + 0.5 * sin(aPos.y * 5.0 - uTime * 1.2);
  vCol = mix(uGreenA, uGreenB, uDark);
  vAlpha = radial * uVerify * (0.55 + 0.45 * scan) * k * 0.9;
  float px = pointPx(1.2, mv.z, uDpr);
  vPx = px;
  gl_PointSize = max(1.0 * uDpr, px);
}
`;
export const LATTICE_FRAG = POINT_FRAG;

/** Ambient motes: a faint, slow volume of fine particles around the streams (depth, richness). Pure decoration, no meaning. */
export const MOTE_VERT = /* glsl */ `
${COMMON}
attribute vec3 aPos;
attribute float aSeed;
attribute float aSize;
uniform float uFocal;
uniform float uDpr;
uniform float uSpeed;
uniform vec3 uPointer;
varying vec3 vCol;
varying float vAlpha;
varying float vPx;
void main() {
  float t = uTime * uSpeed * (0.25 + aSeed * 0.5);
  vec3 p = aPos;
  p.x += sin(t + aSeed * 40.0) * 0.35;
  p.y += cos(t * 0.8 + aSeed * 23.0) * 0.28;
  p.z += sin(t * 0.6 + aSeed * 11.0) * 0.3;
  vec2 d = p.xy - uPointer.xy;
  float f = exp(-dot(d, d) * 1.2) * uPointer.z;
  p.xy += normalize(d + vec2(1e-3)) * f * 0.3;
  float k = buildK(aSeed);
  p = assemble(p, aSeed + 0.17, k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.55 + 0.45 * sin(uTime * (0.4 + aSeed) + aSeed * 90.0);
  vAlpha = (0.2 + 0.4 * hash(aSeed + 4.0)) * tw * k * (1.0 + 0.4 * uEnergy);
  int ci = int(mod(floor(aSeed * 5.0), 5.0));
  vCol = mix(uColA[ci], uColB[ci], uDark);
  float px = pointPx(0.8 + aSize * 0.18, mv.z, uDpr);
  vPx = px;
  gl_PointSize = max(1.0 * uDpr, px);
}
`;
export const MOTE_FRAG = POINT_FRAG;
