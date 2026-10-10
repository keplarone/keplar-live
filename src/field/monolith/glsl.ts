/** Shaders for the Monolith scene. Every fragment writes (ink, alpha): additive on dark, normal blending on light. */

const NOISE = /* glsl */ `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
`;

export const WATER_VERT = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

export const WATER_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uRipple, uGlow, uAlpha, uScale;
uniform vec3 uInk, uCam, uCube;
uniform vec3 uBX[8];
varying vec3 vW;
${NOISE}
void main(){
  vec2 p = vW.xz;
  vec2 g = vec2(cos(p.x*1.3 + uTime*0.5)*1.3*0.03, cos(p.y*0.9 - uTime*0.45)*0.9*0.03);
  float ph = p.x*3.1 + p.y*2.3 + uTime*0.8;
  g += vec2(cos(ph)*3.1, cos(ph)*2.3) * 0.012;
  g += (vec2(vn(p*2.2 + uTime*0.15), vn(p*2.2 + 9.0 - uTime*0.12)) - 0.5) * 0.05;
  g *= uRipple;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(uCam - vW);
  float fr = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  float dx = (p.x - uCube.x) + g.x * 16.0;
  float front = smoothstep(-0.9, 0.5, p.y - uCube.z);
  float w = 0.55 * uScale;
  float streak = exp(-dx*dx / (2.0*w*w)) * front * exp(-max(p.y - uCube.z, 0.0) * 0.13);
  float band = 0.55 + 0.45 * sin(p.y*6.0 + g.y*70.0 - uTime*0.6);
  float refl = streak * band * uGlow;
  for (int i = 0; i < 8; i++) {
    float bx = (p.x - uBX[i].x) + g.x * 12.0;
    float bs = exp(-bx*bx / 0.03) * smoothstep(-1.0, 1.0, p.y - uBX[i].y) * exp(-max(p.y - uBX[i].y, 0.0) * 0.2);
    refl += bs * uBX[i].z * 0.5;
  }
  float glint = smoothstep(0.975, 1.0, vn(p*9.0 + uTime*0.25)) * fr;
  float dist = length(uCam - vW);
  float fog = exp(-dist * 0.03);
  float a = (refl * 0.85 + glint * 0.6 + fr * 0.05) * fog;
  gl_FragColor = vec4(uInk, clamp(a, 0.0, 1.0) * uAlpha);
}`;

export const GLASS_VERT = /* glsl */ `
varying vec3 vN, vW, vL;
void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

export const GLASS_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uGlow, uScan, uScanOn, uAlpha, uH, uConv;
uniform vec3 uInk, uCam;
varying vec3 vN, vW, vL;
void main(){
  vec3 v = normalize(uCam - vW);
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float fr = pow(1.0 - abs(dot(n, v)), 2.4);
  float y01 = vL.y / uH + 0.5;
  float vert = mix(0.34, 0.05, smoothstep(0.0, 1.0, y01)) + 0.28 * smoothstep(0.88, 1.0, y01);
  float bands = pow(0.5 + 0.5 * sin(vL.y*34.0 - uTime*1.1 + vL.x*3.0), 6.0) * 0.14;
  float scan = exp(-pow((y01 - uScan) * 10.0, 2.0)) * uScanOn;
  float a = (fr * 0.75 + vert * 0.22 + bands) * (0.45 + uGlow * 0.45 + uConv * 0.4) + scan * 0.7;
  a *= gl_FrontFacing ? 1.0 : 0.55;
  gl_FragColor = vec4(uInk, clamp(a, 0.0, 1.0) * uAlpha);
}`;

export const EDGE_VERT = /* glsl */ `
varying float vY;
void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const EDGE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk; uniform float uGlow, uAlpha, uTime;
varying float vY;
void main(){ float pulse = 0.75 + 0.25 * sin(uTime*1.3 + vY*2.0); gl_FragColor = vec4(uInk, clamp((0.28 + uGlow*0.4) * pulse, 0.0, 1.0) * uAlpha); }`;

export const CORE_VERT = /* glsl */ `
uniform float uTime, uAgit; varying vec3 vN, vW;
${NOISE}
void main(){
  vec3 p = position;
  float d = vn(p.xy*3.0 + uTime*0.6) * 0.6 + vn(p.yz*3.0 - uTime*0.5) * 0.4;
  p += normal * (d - 0.5) * (0.22 + uAgit * 0.25);
  vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
export const CORE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk, uCam; uniform float uGlow, uAlpha;
varying vec3 vN, vW;
void main(){ vec3 v = normalize(uCam - vW); float d = max(dot(normalize(vN), v), 0.0); float a = (0.3 + 0.55 * pow(d, 1.6)) * (0.3 + uGlow * 0.5); gl_FragColor = vec4(uInk, clamp(a, 0.0, 1.0) * uAlpha); }`;

export const HALO_VERT = /* glsl */ `
uniform float uSize; varying vec2 vUv;
void main(){ vUv = uv * 2.0 - 1.0; vec4 mv = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`;
export const HALO_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk; uniform float uGlow, uAlpha; varying vec2 vUv;
void main(){ float r = length(vUv); float a = (exp(-r*r*5.0) * 0.4 + exp(-r*r*18.0) * 0.3) * uGlow; gl_FragColor = vec4(uInk, clamp(a, 0.0, 1.0) * uAlpha * step(r, 1.0)); }`;

export const NODE_VERT = /* glsl */ `
attribute float aOn; uniform float uSize, uDpr, uOn; varying float vOn;
void main(){ vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0); vOn = uOn; gl_PointSize = uSize * uDpr * (22.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
export const NODE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk; uniform float uAlpha, uTime; varying float vOn;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
  float core = exp(-r*r*22.0); float halo = exp(-r*r*4.0) * 0.45; float ring = smoothstep(0.62, 0.66, r) * (1.0 - smoothstep(0.7, 0.76, r)) * 0.5;
  gl_FragColor = vec4(uInk, clamp(core + halo * 0.7 + ring, 0.0, 1.0) * vOn * uAlpha); }`;

export const ROUTE_VERT = /* glsl */ `
attribute float aT; attribute float aS; attribute float aI;
uniform vec3 uNodes[6]; uniform vec3 uC; uniform float uAspect, uWidth, uTime;
varying float vT; varying float vS; varying float vI;
vec3 bez(vec3 a, vec3 b, vec3 c, vec3 d, float t){ float u = 1.0 - t; return u*u*u*a + 3.0*u*u*t*b + 3.0*u*t*t*c + t*t*t*d; }
void main(){
  int idx = int(aI + 0.5);
  vec3 a = uNodes[0];
  for (int i = 0; i < 6; i++) { if (i == idx) a = uNodes[i]; }
  vec3 d = uC;
  vec3 b = mix(a, d, 0.35) + vec3(0.0, 2.4, 0.0);
  vec3 c = mix(a, d, 0.78) + vec3(0.0, 1.3, 0.0);
  vec3 p0 = bez(a, b, c, d, aT);
  vec3 p1 = bez(a, b, c, d, min(aT + 0.01, 1.0));
  vec4 s0 = projectionMatrix * viewMatrix * vec4(p0, 1.0);
  vec4 s1 = projectionMatrix * viewMatrix * vec4(p1, 1.0);
  vec2 n0 = s0.xy / s0.w, n1 = s1.xy / s1.w;
  vec2 dir = (n1 - n0) * vec2(uAspect, 1.0);
  dir = length(dir) < 1e-5 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 nrm = vec2(-dir.y, dir.x) / vec2(uAspect, 1.0);
  float taper = sin(clamp(aT, 0.0, 1.0) * 3.14159) * 0.6 + 0.4;
  vec4 outp = s0; outp.xy += nrm * aS * uWidth * taper * outp.w;
  vT = aT; vS = aS; vI = aI;
  gl_Position = outp;
}`;
export const ROUTE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk; uniform float uAlpha, uTime, uRoutes, uFlash;
varying float vT; varying float vS; varying float vI;
void main(){
  float edge = 1.0 - vS*vS;
  float flow = pow(0.5 + 0.5 * sin((vT * 9.0 - uTime * (0.7 + vI * 0.07)) * 3.14159 + vI * 2.0), 8.0);
  float a = (0.12 + flow * 0.75 + uFlash * 0.8) * edge * smoothstep(0.0, 0.08, vT) * (1.0 - smoothstep(0.92, 1.0, vT));
  gl_FragColor = vec4(uInk, clamp(a, 0.0, 1.0) * uRoutes * uAlpha);
}`;

export const BEAM_VERT = /* glsl */ `
attribute vec3 aPos; attribute float aSeed;
uniform float uH, uTime; varying vec2 vUv; varying float vSeed;
void main(){
  vUv = vec2(position.x, position.y);
  vSeed = aSeed;
  vec3 base = vec3(aPos.x, -0.2, aPos.y);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  right.y = 0.0; right = normalize(right);
  vec3 wp = base + right * position.x * aPos.z + vec3(0.0, position.y * uH, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
export const BEAM_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk; uniform float uAlpha, uTime, uBeams; varying vec2 vUv; varying float vSeed;
void main(){
  float x = abs(vUv.x);
  float core = exp(-x*x*9.0);
  float vert = pow(1.0 - vUv.y, 1.4) * smoothstep(0.0, 0.04, vUv.y);
  float flick = 0.7 + 0.3 * sin(uTime * (0.4 + vSeed) + vSeed * 40.0);
  float vis = step(vSeed, uBeams) ;
  gl_FragColor = vec4(uInk, clamp(core * vert * flick * (0.2 + 0.5 * vSeed) , 0.0, 1.0) * vis * uAlpha);
}`;

export const DUST_VERT = /* glsl */ `
attribute vec4 aSeed; uniform float uTime, uDpr; varying float vA;
void main(){
  vec3 p = vec3(aSeed.x * 34.0 - 17.0, mod(aSeed.y * 9.0 + uTime * (0.04 + aSeed.z * 0.12), 9.0), aSeed.w * 30.0 - 18.0);
  p.x += sin(uTime * 0.2 + aSeed.z * 20.0) * 0.4;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  vA = (0.25 + 0.75 * aSeed.z) * (0.6 + 0.4 * sin(uTime * 0.8 + aSeed.w * 30.0));
  gl_PointSize = (1.4 + aSeed.z * 2.2) * uDpr * (10.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
export const DUST_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk; uniform float uAlpha; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard; gl_FragColor = vec4(uInk, exp(-r*r*3.0) * vA * 0.7 * uAlpha); }`;

export const NET_VERT = /* glsl */ `
attribute vec3 aCol; uniform float uTime, uDpr, uPoint; varying float vD; varying vec3 vCol; varying float vSeed;
void main(){
  vCol = aCol; vSeed = fract(position.x * 1.37 + position.z * 0.71);
  float a = uTime * 0.035;
  vec3 p = vec3(position.x * cos(a) - position.z * sin(a), position.y + sin(uTime * 0.3 + position.x) * 0.1, position.x * sin(a) + position.z * cos(a));
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  vD = clamp(1.0 - (-mv.z) / 40.0, 0.0, 1.0);
  gl_PointSize = uPoint * uDpr * (12.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
export const NET_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk; uniform float uAlpha, uNet, uLine, uChroma, uTime; varying float vD; varying vec3 vCol; varying float vSeed;
void main(){
  vec3 col = mix(uInk, vCol, uChroma);
  // lines carry the blend of their two endpoint star colours (interpolated per vertex)
  if (uLine > 0.5) { gl_FragColor = vec4(col, 0.22 * uNet * vD * uAlpha); return; }
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
  float tw = 0.82 + 0.18 * sin(uTime * (0.9 + vSeed * 1.6) + vSeed * 40.0);
  float core = exp(-r * r * 16.0), halo = exp(-r * r * 3.4) * 0.55;
  vec3 rgb = mix(col, mix(col, uInk, 0.5), core);
  gl_FragColor = vec4(rgb, clamp(core + halo, 0.0, 1.0) * uNet * vD * tw * uAlpha);
}`;

export const RIDGE_VERT = /* glsl */ `
uniform float uSeed, uHeight, uBase, uZ; varying float vTop; varying float vX;
float rn(float x){ return abs(sin(x*0.21+uSeed)*0.5 + sin(x*0.47+uSeed*2.0)*0.3 + sin(x*1.13+uSeed*3.0)*0.2); }
void main(){
  float x = position.x * 150.0;
  float top = step(0.0, position.y);
  float env = 0.25 + 0.75 * smoothstep(0.0, 0.7, abs(x) / 75.0);
  float hgt = uBase + uHeight * env * (0.15 + 0.85 * rn(x));
  vTop = top; vX = x;
  vec3 wp = vec3(x, top > 0.5 ? hgt : uBase - 3.0, uZ);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
export const RIDGE_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk; uniform float uAlpha, uRidge, uTime; varying float vTop; varying float vX;
void main(){ float rim = pow(vTop, 9.0); float body = pow(vTop, 2.2) * 0.07; float sh = 0.8 + 0.2 * sin(vX * 0.8 + uTime * 0.2);
  gl_FragColor = vec4(uInk, clamp((rim * 0.5 + body) * sh, 0.0, 1.0) * uRidge * uAlpha); }`;

export const POST_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse; uniform float uGlitch, uTime, uCA; uniform vec2 uRes; varying vec2 vUv;
void main(){
  // the cut is a brief grey doubling of the whole frame: no torn row slices (they read as random lines across the page mid-scroll)
  vec2 uv = vUv;
  vec2 d = (uv - 0.5);
  float ca = uCA + uGlitch * 0.012;
  // grey-only "aberration": the picture is doubled either side of centre (no colour fringes)
  vec4 c0 = texture2D(tDiffuse, uv);
  vec4 c1 = texture2D(tDiffuse, uv + d * ca);
  vec4 c2 = texture2D(tDiffuse, uv - d * ca);
  float lum = c0.r * 0.5 + c1.r * 0.25 + c2.r * 0.25;
  float al = c0.a * 0.5 + c1.a * 0.25 + c2.a * 0.25;
  vec3 col = vec3(lum);
  // no per-pixel scan lines or column noise either: those read as stripes and a broken, pixelated logo
  gl_FragColor = vec4(col, al);
}`;

/* ── the Keplar mark: brushed silver lit by a key light and a soft star-field environment (a few warm and cool glints from the
 *    star families), a clean fresnel edge, no glow. On a light page the same metal reads as graphite. ── */
export const LOGO_VERT = /* glsl */ `
varying vec3 vN, vW, vL, vNl;
void main(){ vL = position; vNl = normal; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
export const LOGO_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk; uniform float uTime, uGlow, uAlpha, uConv, uDark;
varying vec3 vN, vW, vL, vNl;
vec3 env(vec3 r){
  // studio sky: graphite floor, a long soft-box band, a bright top light, and small glints from the four star families
  vec3 c = mix(vec3(0.03, 0.03, 0.035), vec3(0.34, 0.35, 0.38), smoothstep(-0.35, 0.9, r.y));
  c += vec3(0.95) * smoothstep(0.08, 0.24, r.y) * smoothstep(0.62, 0.38, r.y) * 0.75;
  c += vec3(1.0) * pow(max(dot(r, normalize(vec3(-0.1, 0.95, 0.2))), 0.0), 24.0) * 0.8;
  c += vec3(1.0, 0.87, 0.46) * pow(max(dot(r, normalize(vec3(-0.7, 0.45, 0.55))), 0.0), 40.0) * 0.9;
  c += vec3(0.5, 0.67, 1.0) * pow(max(dot(r, normalize(vec3(0.75, 0.2, 0.6))), 0.0), 30.0) * 0.8;
  c += vec3(1.0, 0.6, 0.26) * pow(max(dot(r, normalize(vec3(0.25, -0.4, 0.85))), 0.0), 22.0) * 0.35;
  return c;
}
void main(){
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vW);
  vec3 L = normalize(vec3(-0.55, 0.7, 0.6));
  float ndv = max(dot(n, v), 0.0);
  float fr = 0.08 + 0.92 * pow(1.0 - ndv, 5.0);
  // a touch of fake curvature so the flat faces sweep through the soft-box like polished metal instead of one flat tone
  vec3 r = normalize(reflect(-v, n) + vec3(vL.x * 0.18, vL.y * 0.32, 0.0));
  float edge = 1.0 - abs(normalize(vNl).z); // bevels and sides
  vec3 base = mix(vec3(0.16, 0.16, 0.18), vec3(0.55, 0.56, 0.6), uDark);
  float wrap = clamp((dot(n, L) + 0.3) / 1.3, 0.0, 1.0);
  vec3 col = base * (0.1 + 0.42 * wrap) + env(r) * mix(0.6, 1.0, fr) * mix(0.45, 0.95, uDark);
  col += pow(max(dot(reflect(-L, n), v), 0.0), 80.0) * 0.7;
  col += edge * env(r) * 0.35 * uDark;
  // cool rim from the blue key, warm from the orange: lit by the star families, never glowing
  float rim = pow(1.0 - ndv, 3.0);
  col += rim * (vec3(0.5, 0.67, 1.0) * max(n.x, 0.0) * 0.3 + vec3(1.0, 0.75, 0.4) * max(-n.x, 0.0) * 0.22) * uDark;
  col *= 0.94 + 0.08 * uGlow + 0.2 * uConv;
  gl_FragColor = vec4(col, uAlpha);
}`;
