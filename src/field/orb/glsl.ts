/** GLSL for the front-page orb hero (original). White / black / grey only; every colour is a grey. */

export const NOISE = /* glsl */ `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){
  vec3 i = floor(x), f = fract(x), u = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), u.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), u.x), u.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), u.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), u.x), u.y), u.z);
}
float fbm(vec3 p){ return vn(p)*0.62 + vn(p*2.03+vec3(4.1,1.7,8.3))*0.38; }
`;

/* ── the core: a noise-displaced sphere, bright white with grey flow, rim glow ── */
export const CORE_VERT = /* glsl */ `
${NOISE}
uniform float uTime, uAgit, uConv, uFlash;
varying vec3 vN, vV, vObj;
varying float vD;
vec3 surf(vec3 d){
  float t = uTime * 0.32;
  float amp = 0.055 + uAgit * 0.16 + uConv * 0.1 + uFlash * 0.08;
  float n = fbm(d * (1.5 + uAgit * 1.2) + vec3(t, t * 0.7, -t * 0.6));
  return d * (1.0 + amp * (n - 0.5) * 2.0);
}
void main(){
  vec3 d = normalize(position);
  vec3 a = normalize(cross(d, abs(d.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0)));
  vec3 b = cross(d, a);
  vec3 p0 = surf(d), p1 = surf(normalize(d + a * 0.03)), p2 = surf(normalize(d + b * 0.03));
  vec3 n = normalize(cross(p1 - p0, p2 - p0));
  if (dot(n, d) < 0.0) n = -n;
  vN = normalize(normalMatrix * n);
  vObj = p0;
  vec4 mv = modelViewMatrix * vec4(p0, 1.0);
  vV = -mv.xyz;
  vD = length(p0);
  gl_Position = projectionMatrix * mv;
}`;
export const CORE_FRAG = /* glsl */ `
${NOISE}
precision highp float;
uniform float uTime, uAgit, uFlash, uConv;
varying vec3 vN, vV, vObj;
varying float vD;
void main(){
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float flow = fbm(vObj * 2.6 + vec3(uTime * 0.18, -uTime * 0.12, uTime * 0.1));
  float rim = pow(1.0 - ndv, 2.4);
  float lum = mix(0.74, 1.0, pow(ndv, 0.55)) - 0.16 * flow + 0.22 * rim + uFlash * 0.4 + uAgit * 0.08;
  lum += 0.08 * sin(vD * 40.0 - uTime * 2.0) * uAgit;
  gl_FragColor = vec4(vec3(clamp(lum, 0.0, 1.35)), 1.0);
}`;

/* ── sharp orbiting points: crisp discs, no soft falloff ── */
export const ORBIT_VERT = /* glsl */ `
attribute vec4 aSeed; // radius, inclination, speed, phase
attribute float aSize;
uniform float uTime, uAgit, uConv, uDpr, uScale, uR;
varying float vA;
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1,0,0, 0,c,-s, 0,s,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0, s,c,0, 0,0,1); }
void main(){
  float a = aSeed.w * 6.2831853 + uTime * aSeed.z * (1.0 + uAgit * 2.2 + uConv * 3.0);
  float r = aSeed.x * (1.0 - uConv * 0.62) + sin(uTime * 0.7 + aSeed.w * 20.0) * 0.04 + uAgit * 0.12 * sin(a * 3.0 + uTime * 6.0);
  vec3 p = vec3(cos(a) * r, sin(a * 0.5) * 0.06, sin(a) * r);
  p = rotZ(aSeed.y * 0.9) * rotX(aSeed.y * 2.3) * p;
  vec4 mv = modelViewMatrix * vec4(p * uR, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uDpr * uScale / max(0.5, -mv.z);
  vA = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed.z) + aSeed.w * 40.0);
}`;
export const POINT_FRAG = /* glsl */ `
precision mediump float;
varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  if (d > 0.5) discard;
  float edge = 1.0 - smoothstep(0.40, 0.5, d);
  gl_FragColor = vec4(vec3(1.0), edge * vA);
}`;

/* ── far dust / embers: rise slowly, twinkle ── */
export const DUST_VERT = /* glsl */ `
attribute vec4 aSeed; // x, y, z, phase
attribute float aSize;
uniform float uTime, uDpr, uScale, uHeight, uFlood;
varying float vA;
void main(){
  vec3 p = aSeed.xyz;
  p.y = mod(p.y + uTime * (0.08 + aSeed.w * 0.22) + uHeight * 0.5, uHeight) - uHeight * 0.5;
  p.x += sin(uTime * 0.2 + aSeed.w * 30.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uDpr * uScale / max(0.5, -mv.z);
  vA = (0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (0.6 + aSeed.w * 2.0) + aSeed.w * 60.0), 2.0)) * (1.0 - uFlood);
}`;

/* ── additive halo / streak (a screen-facing quad) ── */
export const HALO_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const HALO_FRAG = /* glsl */ `
precision highp float;
uniform float uStrength, uStreak, uFlash, uTime;
varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float g = exp(-r * r * 3.2) * 0.55 + exp(-r * 5.5) * 0.35;
  float s = exp(-abs(p.y) * 70.0) * exp(-abs(p.x) * 2.2) * uStreak;
  float breathe = 0.92 + 0.08 * sin(uTime * 0.9);
  float v = (g * breathe + s) * uStrength + uFlash * exp(-r * 2.0) * 0.8;
  gl_FragColor = vec4(vec3(v), v);
}`;

/* ── energy lines: tube with travelling light pulses ── */
export const LINE_VERT = /* glsl */ `
uniform float uTime, uAgit, uConv, uSeed, uFade;
uniform vec3 uOrb;
varying float vU;
varying vec3 vN, vV;
void main(){
  vU = uv.x;
  vec3 p = position;
  float w = sin(vU * 3.14159);
  p.x += sin(vU * 16.0 - uTime * 3.2 + uSeed * 6.0) * uAgit * 0.07 * w;
  p.y += cos(vU * 13.0 - uTime * 2.6 + uSeed * 4.0) * uAgit * 0.05 * w;
  p.z += sin(vU * 9.0 + uTime * 2.0 + uSeed) * (0.05 + uAgit * 0.12) * w;
  p = mix(p, uOrb + (p - uOrb) * 0.1, clamp(uConv * (0.4 + 0.6 * vU), 0.0, 1.0));
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
export const LINE_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uAgit, uConv, uSeed, uFade, uGlow, uSpeed, uFocus;
varying float vU;
varying vec3 vN, vV;
float pulse(float u, float ph, float inward){
  float pos = mix(ph, 1.0 - ph, inward);
  float d = (u - pos) * 8.0;
  return exp(-d * d);
}
void main(){
  vec3 n = normalize(vN), v = normalize(vV);
  float facing = abs(dot(n, v));
  float inward = smoothstep(0.0, 0.15, uConv);
  float sp = uSpeed * (1.0 + uAgit * 1.4 + uConv * 2.5);
  float ph1 = fract(uTime * sp + uSeed), ph2 = fract(uTime * sp * 0.83 + uSeed + 0.5);
  float pl = pulse(vU, ph1, inward) + 0.7 * pulse(vU, ph2, inward);
  float base = 0.2 + 0.1 * uFocus + 0.12 * uAgit;
  float ends = smoothstep(0.0, 0.05, vU) * (1.0 - 0.0 * vU);
  float br = (base + pl * (0.9 + uAgit * 0.8)) * ends;
  float a = uGlow > 0.5 ? pow(facing, 3.0) * 0.32 * (0.5 + pl) : mix(0.5, 1.0, facing);
  a *= uFade;
  gl_FragColor = vec4(vec3(br), a * br);
}`;

/* ── model tile: a glass rounded square with an own-drawn glyph; 3 layers give it depth ── */
export const TILE_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const TILE_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uLayer, uGlyph, uHover, uGlow, uFade, uSeed;
uniform vec2 uTilt;
varying vec2 vUv;
float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float glyph(vec2 p, float id){
  if (id < 0.5) return abs(length(p) - 0.36) - 0.07;                 // ring
  if (id < 1.5) return abs(abs(p.x) + abs(p.y) - 0.42) - 0.06;       // diamond outline
  if (id < 2.5) return pow(abs(p.x), 0.6667) + pow(abs(p.y), 0.6667) - 0.5; // four-point star
  if (id < 3.5) return min(box(p - vec2(0.0, 0.2), vec2(0.38, 0.07), 0.03), box(p + vec2(0.0, 0.2), vec2(0.26, 0.07), 0.03)); // two bars
  if (id < 4.5) return min(box(p, vec2(0.38, 0.07), 0.03), box(p, vec2(0.07, 0.38), 0.03)); // plus
  return min(min(length(p - vec2(-0.3, 0.0)) - 0.09, length(p) - 0.09), length(p - vec2(0.3, 0.0)) - 0.09); // three dots
}
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float d = box(p, vec2(0.9), 0.3);
  float inside = 1.0 - smoothstep(-0.015, 0.015, d);
  float rim = exp(-abs(d) * 26.0);
  float lift = uHover * 0.5 + uGlow * 0.6;
  if (uLayer > 1.5) { // outer glow, behind
    float g = exp(-max(d, 0.0) * 4.5) * (0.16 + lift * 0.5);
    gl_FragColor = vec4(vec3(g), g * uFade);
    return;
  }
  if (uLayer > 0.5) { // back rim
    float r = exp(-abs(d + 0.02) * 40.0) * (0.35 + lift * 0.5);
    gl_FragColor = vec4(vec3(r), r * uFade);
    return;
  }
  // front: dark glass, a sheen that slides with the tilt, white rim, glyph
  float sheen = smoothstep(0.55, 0.0, abs(dot(p, normalize(vec2(1.0, 1.0))) - uTilt.x * 1.1 + uTilt.y * 0.6));
  float g = 0.05 + 0.12 * sheen + 0.04 * (p.y * 0.5 + 0.5);
  float gl = 1.0 - smoothstep(-0.01, 0.02, glyph(p, uGlyph));
  vec3 col = vec3(g) + vec3(rim * (0.55 + lift)) + vec3(gl * (0.78 + lift * 0.4));
  float a = inside * (0.86 + rim * 0.14) * uFade;
  gl_FragColor = vec4(col, a);
}`;

/* ── black floor reflection (a screen-facing quad below the horizon) ── */
export const FLOOR_FRAG = /* glsl */ `
${NOISE}
precision highp float;
uniform float uTime, uHorizon, uOx, uR, uStrength, uFlash;
varying vec3 vW;
void main(){
  float dy = uHorizon - vW.y;
  if (dy < 0.0) { float lineGlow = exp(-abs(dy) * 90.0) * 0.0; gl_FragColor = vec4(vec3(lineGlow), 0.0); return; }
  float rx = (vW.x - uOx) / (uR * 1.9);
  float ry = dy / (uR * 2.8);
  float ripple = 0.55 + 0.45 * sin(dy * 38.0 / max(0.3, uR) + vn(vec3(vW.x * 0.8, dy * 3.0, uTime * 0.2)) * 6.0 - uTime * 0.9);
  float g = exp(-(rx * rx + ry * ry * 1.4) * 1.6) * ripple * 0.55;
  float edge = exp(-dy * 18.0 / max(0.3, uR)) * 0.5 * exp(-abs(rx) * 0.45);
  float fade = exp(-dy / (uR * 3.2));
  float v = (g * fade + edge) * uStrength + uFlash * g * 0.5;
  gl_FragColor = vec4(vec3(v), v);
}`;
export const FLOOR_VERT = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

/* ── vertical light ribbons: many thin lines with a bright sweep that crosses the screen ── */
export const RIBBON_VERT = /* glsl */ `
attribute vec3 aInfo; // x offset (0..1 across), seed, along (0 bottom, 1 top)
uniform float uTime, uWidth, uHeight, uSweepX, uFade;
varying float vA;
void main(){
  float x = (aInfo.x - 0.5) * uWidth;
  float sway = sin(uTime * 0.35 + aInfo.y * 31.0 + aInfo.z * 2.0) * 0.14;
  vec3 p = vec3(x + sway, (aInfo.z - 0.5) * uHeight, -2.0 - aInfo.y * 3.0);
  float band = exp(-pow((x - uSweepX) / (uWidth * 0.06), 2.0));
  float flick = 0.5 + 0.5 * sin(uTime * 5.0 + aInfo.y * 90.0 + aInfo.z * 6.0);
  vA = (0.035 + band * (0.55 + 0.45 * flick)) * (0.25 + 0.75 * sin(aInfo.z * 3.14159)) * uFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
export const RIBBON_FRAG = /* glsl */ `
precision mediump float;
varying float vA;
void main(){ gl_FragColor = vec4(vec3(1.0), vA); }`;

/* ── post: grey-only glitch (scanlines, row slices, ghosted split, pixel stretch) + vignette ── */
export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uGlitch, uTime, uFlood;
uniform vec2 uRes;
varying vec2 vUv;
float h11(float x){ return fract(sin(x * 91.345) * 47453.5453); }
float lum(vec3 c){ return dot(c, vec3(0.3333)); }
void main(){
  vec2 uv = vUv;
  float g = uGlitch;
  float band = floor(uv.y * 38.0 + floor(uTime * 14.0));
  float slice = (h11(band) - 0.5) * step(0.72, h11(band + 3.1)) * g * 0.09;
  uv.x += slice;
  float stretch = step(0.9, h11(floor(uv.y * 9.0) + floor(uTime * 9.0))) * g;
  uv.x = mix(uv.x, floor(uv.x * 46.0) / 46.0, stretch * 0.8);
  float o = g * 0.012;
  vec3 c = texture2D(tDiffuse, uv).rgb;
  float a = lum(texture2D(tDiffuse, uv + vec2(o, 0.0)).rgb);
  float b = lum(texture2D(tDiffuse, uv - vec2(o, 0.0)).rgb);
  c = mix(c, vec3(max(c.r, max(a, b))), min(1.0, g * 1.4));
  float scan = 0.5 + 0.5 * sin(uv.y * uRes.y * 1.15);
  c *= 1.0 - g * 0.22 * scan;
  c += g * 0.06 * h11(uv.x * 400.0 + uv.y * 90.0 + uTime);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.55;
  gl_FragColor = vec4(c, 1.0);
}`;
