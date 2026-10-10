/**
 * Shaders for the Monolith "space" layer: nebula clouds, depth star field, warp streaks, galaxy spiral, planets, orbit rings, aurora
 * curtains and low mist. Original code. Every fragment writes (rgb, alpha): additive on dark, normal blending on light.
 * Nebula/stars/warp/galaxy/orbit-rings/aurora/mist stay grey via uInk. Planets (and Saturn's rings) use chromatic uColor.
 */

const NOISE3 = /* glsl */ `
float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p){
  vec3 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), u.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), u.x), u.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), u.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), u.x), u.y), u.z);
}
float fbm3(vec3 p, float oct){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) { if (float(i) >= oct) break; s += a * vn3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn2(vec2 p){ vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
`;

/* ── nebula: a full-screen volumetric-looking cloud, sampled along the view ray so it has parallax as the camera moves ── */
export const NEB_VERT = /* glsl */ `
uniform mat4 uCamWorld; uniform float uTanY, uAspect; varying vec3 vDir;
void main(){
  vDir = (uCamWorld * vec4(position.x * uAspect * uTanY, position.y * uTanY, -1.0, 0.0)).xyz;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;
export const NEB_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uNeb, uOct, uScroll, uAlpha, uAgit; uniform vec2 uPtr; uniform vec3 uInk; uniform vec2 uHole;
varying vec3 vDir;
${NOISE3}
void main(){
  vec3 d = normalize(vDir);
  vec3 p = d * 2.4 + vec3(uPtr.x * 0.35, uPtr.y * 0.25 + uScroll * 1.6, uTime * 0.018);
  float w = fbm3(p + vec3(0.0, uTime * 0.02, 0.0), uOct);
  float q = fbm3(p + 1.7 * vec3(w, w * 0.7, w * 1.3), uOct);
  float cloud = smoothstep(0.36, 0.86, q);
  float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.8, -0.45))) * 2.6, 2.0));
  float core = exp(-pow(dot(d, normalize(vec3(-0.25, 0.55, -0.8))) * 1.0 - 0.95, 2.0) * 60.0);
  float dens = cloud * (0.35 + 0.9 * band) + core * 0.5 * cloud;
  dens *= 1.0 + uAgit * 0.4;
  float a = dens * uNeb * 0.5 * (0.35 + 0.65 * smoothstep(-0.1, 0.5, d.y + 0.15));
  a += (h21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(uInk, max(a, 0.0) * uAlpha);
}`;

/* Star palette: four spectral families only — hot blue, white, yellow, orange. Shared by stars, galaxy and constellation shaders. */
export const STAR_PALETTE = /* glsl */ `
vec3 starCol(float h){
  if (h < 0.24) return vec3(0.50, 0.67, 1.00);
  if (h < 0.58) return vec3(1.00, 0.98, 0.95);
  if (h < 0.80) return vec3(1.00, 0.87, 0.46);
  return vec3(1.00, 0.60, 0.26);
}`;

/* ── stars: real 3D points in a shell around the camera, three depth layers; near ones shift more as the camera moves ── */
export const STAR_VERT = /* glsl */ `
attribute vec4 aSeed; uniform float uTime, uDpr, uStars, uWarp; uniform vec2 uPtr; varying float vA; varying vec3 vCol; varying float vMag;
${STAR_PALETTE}
void main(){
  vCol = starCol(fract(aSeed.x * 7.13 + aSeed.w * 3.71));
  float th = aSeed.x * 6.2831853, ph = acos(1.0 - aSeed.y * 1.92);
  float layer = aSeed.z;
  float r = mix(26.0, 260.0, layer * layer);
  vec3 p = vec3(sin(ph) * cos(th), cos(ph) * 0.55 + 0.45, sin(ph) * sin(th)) * r;
  p.xy += uPtr * (14.0 / (1.0 + r * 0.06)) * vec2(1.0, 0.6);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float tw = 0.65 + 0.35 * sin(uTime * (0.7 + aSeed.w * 2.2) + aSeed.w * 60.0);
  float mag = 0.25 + 0.75 * pow(aSeed.w, 2.5);
  vA = mag * tw * uStars * (1.0 - uWarp * 0.5);
  vMag = mag;
  vA *= 1.0 + 0.35 * step(0.24, abs(vCol.b - vCol.r));
  // the brightest stars get room for a soft coloured halo
  gl_PointSize = max(1.0, (0.9 + mag * 2.6 + step(0.72, mag) * 4.0) * uDpr * (1.0 + (1.0 - layer) * 0.8));
  gl_Position = projectionMatrix * mv;
}`;
export const STAR_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk; uniform float uAlpha, uChroma; varying float vA; varying vec3 vCol; varying float vMag;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
  vec3 col = mix(uInk, vCol, uChroma);
  float big = step(0.72, vMag);
  float core = exp(-r * r * mix(3.2, 22.0, big));
  float halo = exp(-r * r * 3.0) * 0.45 * big;
  vec3 rgb = mix(col, mix(col, uInk, 0.45), core * big);
  gl_FragColor = vec4(rgb, clamp(core + halo, 0.0, 1.0) * vA * uAlpha);
}`;

/* ── warp: streaks that fly past the camera along its view axis (view space, so the tunnel always faces the viewer) ── */
export const WARP_VERT = /* glsl */ `
attribute vec4 aSeed; attribute float aEnd; uniform float uTime, uWarp, uSpeed; varying float vA;
void main(){
  float ang = aSeed.x * 6.2831853, rad = 1.6 + pow(aSeed.y, 0.7) * 26.0;
  float depth = 120.0;
  float z = mod(aSeed.z * depth + uTime * (10.0 + aSeed.w * 26.0) * (0.35 + uSpeed), depth);
  float len = (1.0 + aSeed.w * 6.0) * (0.15 + uWarp * 5.0);
  vec3 p = vec3(cos(ang) * rad, sin(ang) * rad * 0.62, -(depth - z) + aEnd * len);
  vA = uWarp * (0.2 + 0.8 * aSeed.w) * smoothstep(0.0, 6.0, -p.z) * (1.0 - aEnd * 0.9) * (1.0 - smoothstep(60.0, depth, -p.z));
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;
export const WARP_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk; uniform float uAlpha; varying float vA;
void main(){ gl_FragColor = vec4(uInk, vA * 0.75 * uAlpha); }`;

/* ── galaxy: a log-spiral of points (three arms), brighter and denser toward the core ── */
export const GAL_VERT = /* glsl */ `
attribute vec4 aSeed; uniform float uTime, uDpr, uGal, uRad; varying float vA; varying vec3 vCol; varying float vMag;
${STAR_PALETTE}
void main(){
  float arm = floor(aSeed.x * 3.0);
  float r = pow(aSeed.y, 0.62);
  // old yellow/orange stars in the core, hot young stars along the arms
  vCol = starCol(r < 0.25 ? 0.62 + aSeed.w * 0.38 : (aSeed.w < 0.55 ? aSeed.w * 0.43 : 0.24 + aSeed.z * 0.56));
  vMag = 0.0;
  float spread = (aSeed.z - 0.5) * (0.9 / (0.25 + r * 1.6));
  float ang = arm * 2.0943951 + r * 5.2 + spread + uTime * 0.045 / (0.35 + r);
  vec3 p = vec3(cos(ang), (aSeed.w - 0.5) * 0.12 * (1.0 - r), sin(ang)) * r * uRad;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  vA = uGal * (0.3 + 1.0 * (1.0 - r)) * (0.55 + 0.45 * aSeed.w);
  gl_PointSize = max(1.2, (1.0 + (1.0 - r) * 3.0) * uDpr);
  gl_Position = projectionMatrix * mv;
}`;
export const GAL_FRAG = STAR_FRAG;

/* ── planets: physically-inspired shading. Sun-lit terminator with a soft wrap, rim scattering on the lit limb, per-world surfaces
 *    (Earth oceans with sun glint, drifting clouds and night-side city lights; Jupiter's animated belts and the Great Red Spot;
 *    Saturn's ring shadow; Mars' dark albedo and polar caps; Mercury's craters; Venus' cloud deck; ice-giant haze). ── */
export const PLANET_VERT = /* glsl */ `
varying vec3 vO, vWN, vWP;
void main(){
  vO = position;
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const RING_DENS = /* glsl */ `
// Saturn's rings by radius (planet radii): C ring (faint), B ring (dense), Cassini division, A ring with the Encke gap
float ringDens(float r){
  float c = smoothstep(1.22, 1.27, r) * (1.0 - smoothstep(1.51, 1.53, r)) * 0.28;
  float b = smoothstep(1.52, 1.56, r) * (1.0 - smoothstep(1.93, 1.95, r)) * 0.95;
  float a = smoothstep(2.02, 2.04, r) * (1.0 - smoothstep(2.25, 2.28, r)) * 0.72;
  float encke = 1.0 - (smoothstep(2.195, 2.205, r) - smoothstep(2.212, 2.222, r));
  float fine = 0.78 + 0.22 * sin(r * 230.0) * sin(r * 61.0 + 1.3);
  return (c + b + a * encke) * fine;
}`;
export const PLANET_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor, uLand, uAtmo, uSunDir, uCenter, uRingN;
uniform float uTime, uPlanet, uAlpha, uSeed, uType, uOct, uFocus, uFx, uRadius, uRing;
varying vec3 vO, vWN, vWP;
${NOISE3}
${RING_DENS}
void main(){
  vec3 n = normalize(vWN), L = normalize(uSunDir), V = normalize(cameraPosition - vWP);
  vec3 o = normalize(vO);
  float lat = o.y;
  float ndl = dot(n, L);
  int type = int(uType + 0.5);
  float oct = uOct;
  vec3 albedo = uColor; float spec = 0.0; float cloud = 0.0; vec3 night = vec3(0.0); float rough = 24.0;
  if (type == 2) {
    // Earth: continents, ice caps, sun glint on water, drifting clouds, city lights on the night side
    float h = fbm3(o * 2.1 + uSeed, oct) + 0.22 * fbm3(o * 7.0 + uSeed * 2.0, max(oct - 2.0, 1.0));
    float land = smoothstep(0.585, 0.605, h);
    float ice = smoothstep(0.8, 0.87, abs(lat) + 0.06 * h);
    vec3 ocean = mix(uColor * 0.45, uColor, smoothstep(0.35, 0.58, h));
    vec3 ground = mix(uLand, vec3(0.58, 0.5, 0.34), smoothstep(0.66, 0.78, h));
    albedo = mix(mix(ocean, ground, land), vec3(0.93), ice);
    spec = (1.0 - land) * (1.0 - ice); rough = 70.0;
    vec3 cp = o * 2.6 + vec3(uTime * 0.01, 0.0, uSeed);
    cloud = smoothstep(0.52, 0.78, fbm3(cp + 0.8 * fbm3(cp * 1.7 + uTime * 0.004, 3.0), oct)) * 0.9;
    if (uFx > 1.5) {
      float city = land * (1.0 - ice) * step(0.86, h31(floor(o * 110.0))) * smoothstep(0.6, 0.68, h);
      night = vec3(1.0, 0.74, 0.42) * city;
    }
  } else if (type == 4 || type == 5) {
    // gas giants: latitude belts sheared by a slow turbulent flow; Jupiter carries the Great Red Spot
    bool jup = type == 4;
    float flow = fbm3(vec3(o.x * 2.4 + uTime * 0.015, lat * (jup ? 9.0 : 6.0), o.z * 2.4) + uSeed, oct);
    float belts = 0.5 + 0.5 * sin(lat * (jup ? 17.0 : 12.0) + flow * (jup ? 3.2 : 1.6));
    float fine = fbm3(vec3(o.x * 5.0, lat * 46.0, o.z * 5.0) + vec3(uTime * 0.02, 0.0, 0.0), max(oct - 1.0, 1.0));
    albedo = mix(uLand, uColor, belts) * (0.86 + 0.28 * fine);
    if (jup) {
      vec3 c = normalize(vec3(cos(0.9) * 0.93, -0.37, sin(0.9) * 0.93));
      vec3 e = normalize(cross(vec3(0.0, 1.0, 0.0), c)), nn = cross(c, e);
      vec2 q = vec2(dot(o - c, e) / 0.2, dot(o - c, nn) / 0.105);
      float r = length(q);
      float sw = sin(atan(q.y, q.x) * 2.0 + r * 9.0 - uTime * 0.25) * 0.5 + 0.5;
      float spot = 1.0 - smoothstep(0.65, 1.0, r);
      albedo = mix(albedo, mix(vec3(0.74, 0.32, 0.2), vec3(0.86, 0.5, 0.34), sw * 0.6), spot * 0.9);
      albedo = mix(albedo, vec3(0.95, 0.88, 0.76), (smoothstep(0.85, 1.0, r) - smoothstep(1.0, 1.25, r)) * 0.5);
    }
  } else if (type == 3) {
    // Mars: rust with dark albedo features and small polar caps
    float d = fbm3(o * 2.6 + uSeed, oct);
    albedo = mix(uColor, uLand, smoothstep(0.45, 0.62, d)) * (0.85 + 0.25 * fbm3(o * 9.0, max(oct - 2.0, 1.0)));
    albedo = mix(albedo, vec3(0.92, 0.9, 0.88), smoothstep(0.9, 0.95, abs(lat) + 0.04 * d));
  } else if (type == 0) {
    // Mercury / the Moon: grey regolith with craters (cell distance)
    vec3 g = o * 6.0 + uSeed; vec3 i = floor(g), f = fract(g); float md = 1.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 b = vec3(float(x), float(y), float(z)); vec3 pt = b + vec3(h31(i + b), h31(i + b + 7.1), h31(i + b + 3.3)) - f;
      md = min(md, dot(pt, pt));
    }
    float crater = smoothstep(0.05, 0.18, md) * 0.25 + 0.75 + (1.0 - smoothstep(0.16, 0.2, md)) * smoothstep(0.12, 0.16, md) * 0.2;
    albedo = mix(uLand, uColor, fbm3(o * 3.0 + uSeed, oct)) * crater;
  } else if (type == 1) {
    // Venus: a bright sulphuric cloud deck with soft chevrons
    float w = fbm3(vec3(o.x * 2.0, lat * 5.0 + fbm3(o * 2.5 + uTime * 0.008, 3.0) * 1.5, o.z * 2.0) + uSeed, oct);
    albedo = mix(uLand, uColor, smoothstep(0.3, 0.75, w));
  } else {
    // ice giants: smooth methane haze with faint bands (Neptune also a dark storm)
    float bands = 0.5 + 0.5 * sin(lat * 10.0 + fbm3(o * 2.0 + uSeed + uTime * 0.01, oct) * 1.4);
    albedo = mix(uLand, uColor, 0.55 + 0.45 * bands);
    if (type == 7) {
      vec3 c = normalize(vec3(0.6, -0.3, 0.74)); vec2 q = vec2(dot(o - c, normalize(cross(vec3(0,1,0), c))) / 0.15, (lat + 0.3) / 0.08);
      albedo *= 1.0 - 0.45 * (1.0 - smoothstep(0.6, 1.0, length(q)));
    }
  }

  // light: soft terminator (a little atmospheric wrap), deep but not pure-black night side
  float wrap = type == 0 || type == 3 ? 0.04 : 0.14;
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  diff = diff * diff * (3.0 - 2.0 * diff) * 0.35 + diff * 0.65;
  // Saturn: shadow of the rings on the globe (march toward the sun to the ring plane)
  if (uRing > 0.5) {
    float dn = dot(L, uRingN);
    if (abs(dn) > 1e-3) {
      float tt = dot(uCenter - vWP, uRingN) / dn;
      if (tt > 0.0) { float rr = length(vWP + L * tt - uCenter) / uRadius; diff *= 1.0 - 0.8 * clamp(ringDens(rr), 0.0, 1.0); }
    }
  }
  vec3 col = albedo * diff;
  if (cloud > 0.0) col = mix(col, vec3(0.97) * diff, cloud);
  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.95, 0.86) * pow(max(dot(n, H), 0.0), rough) * spec * (1.0 - cloud) * step(0.0, ndl) * 0.85;
  col += night * (1.0 - smoothstep(-0.18, 0.05, ndl)) * (1.0 - cloud * 0.85);
  // rim scattering: bright on the lit limb, a thin line on the dark limb
  float mu = max(dot(n, V), 0.0);
  float fr = pow(1.0 - mu, 3.0);
  float sunSide = smoothstep(-0.35, 0.45, ndl);
  col += uAtmo * fr * (0.06 + 0.95 * sunSide);
  col += albedo * 0.018;
  col *= 1.15 + uFocus * 0.28;
  // soft limb anti-alias: fade the last sliver of the silhouette
  float edge = smoothstep(0.0, 0.08, mu);
  float a = clamp(uPlanet * uAlpha * edge, 0.0, 1.0);
  // Premultiply so NormalBlending over graphite keeps hue (no grey wash)
  gl_FragColor = vec4(col * a, a);
}`;
/* atmosphere halo just outside the limb, brighter where the sun scatters through it */
export const ATMO_VERT = /* glsl */ `
varying vec3 vWN, vWP;
void main(){ vWN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const ATMO_FRAG = /* glsl */ `
precision highp float; uniform vec3 uAtmo, uSunDir; uniform float uPlanet, uAlpha, uShell; varying vec3 vWN, vWP;
void main(){
  vec3 n = normalize(vWN), V = normalize(cameraPosition - vWP);
  float mu = abs(dot(n, V));
  float limb = sqrt(max(1.0 - 1.0 / (uShell * uShell), 0.0));
  float g = smoothstep(0.0, limb, mu); g = g * g * g;
  float sun = 0.12 + 0.88 * smoothstep(-0.4, 0.6, dot(n, normalize(uSunDir)));
  gl_FragColor = vec4(uAtmo, clamp(g * sun, 0.0, 1.0) * uPlanet * 0.75 * uAlpha);
}`;

/* Saturn's rings: radial structure, lit / back-lit faces (forward scattering through the thin rings), the planet's shadow */
export const SATRING_VERT = /* glsl */ `
varying vec3 vL, vWP;
void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const SATRING_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor, uSunDir, uCenter, uRingN; uniform float uRadius, uRings, uAlpha;
varying vec3 vL, vWP;
${RING_DENS}
void main(){
  float r = length(vL.xy);
  float d = clamp(ringDens(r), 0.0, 1.0);
  if (d < 0.004) discard;
  vec3 L = normalize(uSunDir), V = normalize(cameraPosition - vWP), N = normalize(uRingN);
  float lit = dot(N, L), view = dot(N, V);
  float face = lit * view > 0.0 ? 0.55 + 0.45 * abs(lit) : 0.0;
  float through = lit * view <= 0.0 ? (1.0 - d) * (0.25 + 1.2 * pow(max(dot(-V, L), 0.0), 4.0)) : 0.0;
  // planet shadow
  vec3 pc = vWP - uCenter; float b = dot(pc, L); float dist = sqrt(max(dot(pc, pc) - b * b, 0.0));
  float sh = b < 0.0 ? smoothstep(uRadius * 0.96, uRadius * 1.04, dist) : 1.0;
  vec3 tint = mix(vec3(0.62, 0.56, 0.48), uColor, smoothstep(1.45, 1.7, r));
  vec3 col = tint * (face + through) * (0.12 + 0.88 * sh);
  gl_FragColor = vec4(col, d * uRings * uAlpha * (0.35 + 0.65 * sh));
}`;

/* ── rings: thin annulus with bright arcs travelling around it ── */
export const RING_VERT = /* glsl */ `
uniform float uInner, uOuter; varying float vR; varying float vAng;
void main(){
  vR = clamp((length(position.xy) - uInner) / (uOuter - uInner), 0.0, 1.0);
  vAng = atan(position.y, position.x);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
export const RING_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk, uColor; uniform float uTime, uRings, uAlpha, uSeed, uSpin, uChromatic; varying float vR, vAng;
void main(){
  float edge = smoothstep(0.0, 0.5, vR) * (1.0 - smoothstep(0.5, 1.0, vR));
  float core = pow(edge, 2.0);
  float arc = 0.18 + 0.82 * pow(0.5 + 0.5 * sin(vAng * 2.0 - uTime * uSpin + uSeed), 6.0);
  float tick = 0.75 + 0.25 * sin(vAng * 90.0);
  vec3 col = mix(uInk, uColor, uChromatic);
  gl_FragColor = vec4(col, core * arc * tick * uRings * 0.8 * uAlpha);
}`;

/* ── aurora curtains: vertical ribbons of light that sway ── */
export const AUR_VERT = /* glsl */ `
uniform float uTime, uSeed; varying vec2 vUv; varying float vX;
void main(){
  vUv = uv; vec3 p = position;
  float s = sin(p.x * 0.16 + uTime * 0.18 + uSeed) + 0.5 * sin(p.x * 0.41 - uTime * 0.11 + uSeed * 2.0);
  p.z += s * 3.2; p.y += s * 0.9 * uv.y; vX = p.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
export const AUR_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk; uniform float uTime, uAurora, uAlpha, uSeed; varying vec2 vUv; varying float vX;
${NOISE3}
void main(){
  float v = vUv.y;
  float rays = vn2(vec2(vX * 1.4 + uSeed * 9.0, uTime * 0.07)) * 0.6 + vn2(vec2(vX * 4.0 - uTime * 0.05, uSeed)) * 0.4;
  float shape = smoothstep(0.0, 0.08, v) * exp(-v * 2.6) * (0.3 + rays);
  float edgeX = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float flick = 0.8 + 0.2 * sin(uTime * 0.6 + vX * 0.7 + uSeed);
  gl_FragColor = vec4(uInk, shape * edgeX * flick * uAurora * 0.5 * uAlpha);
}`;

/* ── mist: low smoke over the water ── */
export const MIST_VERT = /* glsl */ `
varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const MIST_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk, uCam; uniform float uTime, uMist, uAlpha, uAgit; varying vec3 vW;
${NOISE3}
void main(){
  vec2 p = vW.xz * 0.11;
  float n = fbm3(vec3(p + vec2(uTime * 0.012, -uTime * 0.008), uTime * 0.02), 4.0);
  float m = smoothstep(0.42, 0.85, n);
  float dist = length(vW.xz - uCam.xz);
  float fall = exp(-length(vW.xz) * 0.028) * smoothstep(1.5, 9.0, dist) ;
  gl_FragColor = vec4(uInk, m * fall * uMist * 0.3 * (1.0 + uAgit * 0.3) * uAlpha);
}`;

/* ── story: light paths from the question to each planet (screen-space ribbons along a quadratic curve). Per path uP = (draw,
 *    alpha, collapse, boost). A bright tip while a path grows, answers flowing back as pulses, a verification band. Light ink with
 *    only a faint hint of the planet's hue at the far end. ── */
export const PATH_VERT = /* glsl */ `
attribute float aT, aS, aI;
uniform vec3 uA[6], uB[6], uC[6]; uniform vec4 uP[6]; uniform float uAspect, uWidth;
varying float vT, vS, vI; varying vec4 vP;
vec3 qb(vec3 a, vec3 c, vec3 b, float t){ float u = 1.0 - t; return u * u * a + 2.0 * u * t * c + t * t * b; }
void main(){
  int idx = int(aI + 0.5);
  vec3 a = uA[0], b = uB[0], c = uC[0]; vec4 p = uP[0];
  for (int i = 0; i < 6; i++) { if (i == idx) { a = uA[i]; b = uB[i]; c = uC[i]; p = uP[i]; } }
  vec4 s0 = projectionMatrix * viewMatrix * vec4(qb(a, c, b, aT), 1.0);
  vec4 s1 = projectionMatrix * viewMatrix * vec4(qb(a, c, b, min(aT + 0.01, 1.0)), 1.0);
  vec4 sm = projectionMatrix * viewMatrix * vec4(qb(a, c, b, max(aT - 0.01, 0.0)), 1.0);
  vec2 dir = (s1.xy / s1.w - sm.xy / sm.w) * vec2(uAspect, 1.0);
  dir = length(dir) < 1e-6 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 nrm = vec2(-dir.y, dir.x) / vec2(uAspect, 1.0);
  float w = uWidth * (0.55 + 0.45 * sin(aT * 3.14159)) * (1.0 + p.w * 0.9);
  s0.xy += nrm * aS * w * s0.w;
  vT = aT; vS = aS; vI = aI; vP = p;
  gl_Position = s0;
}`;
export const PATH_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk; uniform vec3 uHue[6]; uniform float uTime, uAlpha, uFlow, uScan, uPathOn;
varying float vT, vS, vI; varying vec4 vP;
void main(){
  float end = vP.x * (1.0 - vP.z);
  if (vT > end + 0.003 || vP.y < 0.003) discard;
  int idx = int(vI + 0.5); vec3 hue = uHue[0];
  for (int i = 0; i < 6; i++) { if (i == idx) hue = uHue[i]; }
  float edge = 1.0 - vS * vS; edge *= edge;
  float head = exp(-pow((vT - end) * 26.0, 2.0)) * (1.0 - step(0.995, vP.x)) * 1.6;
  float pp = 1.0 - fract(uTime * 0.2 + vI * 0.37);
  float pulse = exp(-pow((vT - pp) * 13.0, 2.0)) * uFlow;
  float band = exp(-pow((vT - fract(uTime * 0.42 + vI * 0.11)) * 9.0, 2.0)) * uScan;
  float a = edge * vP.y * (0.26 + 0.55 * vP.w + head + pulse * 0.85 + band * 0.75) * smoothstep(0.0, 0.03, vT);
  vec3 col = mix(uInk, hue, smoothstep(0.45, 1.0, vT) * 0.32);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uPathOn * uAlpha);
}`;

/* the question (a travelling point of light) and the answer (a steady point orbiting Earth) */
export const SPARK_VERT = /* glsl */ `
attribute float aI; uniform vec4 uS, uQ; uniform float uSize, uDpr; varying float vA;
void main(){
  vec4 p = aI < 0.5 ? uS : uQ;
  vA = p.w;
  gl_PointSize = max(1.0, uSize * uDpr * (0.55 + 0.45 * p.w));
  gl_Position = projectionMatrix * viewMatrix * vec4(p.xyz, 1.0);
}`;
export const SPARK_FRAG = /* glsl */ `
precision highp float; uniform vec3 uInk; uniform float uAlpha; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
  float core = exp(-r * r * 30.0), halo = exp(-r * r * 5.0) * 0.32;
  float spikes = (exp(-abs(c.x) * 70.0) * exp(-abs(c.y) * 7.0) + exp(-abs(c.y) * 70.0) * exp(-abs(c.x) * 7.0)) * 0.4;
  gl_FragColor = vec4(uInk, clamp(core + halo + spikes, 0.0, 1.0) * vA * uAlpha);
}`;

/* the sun just off frame: a warm corona whose outer glow reaches into the picture (a cheap stand-in for bloom) */
export const SUN_VERT = /* glsl */ `
uniform vec3 uSun; uniform float uSize; varying vec2 vUv;
void main(){ vUv = position.xy; vec4 mv = viewMatrix * vec4(uSun, 1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`;
export const SUN_FRAG = /* glsl */ `
precision highp float; uniform float uSunOn, uAlpha, uTime; varying vec2 vUv;
void main(){
  float r = length(vUv);
  float core = 1.0 - smoothstep(0.045, 0.06, r);
  float corona = exp(-r * 7.0) * 0.5 + exp(-r * 2.6) * 0.14;
  float rays = (0.5 + 0.5 * sin(atan(vUv.y, vUv.x) * 14.0 + uTime * 0.04)) * exp(-r * 5.0) * 0.1;
  float a = (core + corona + rays) * (1.0 - smoothstep(0.8, 1.0, r));
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.82), clamp(a, 0.0, 1.0) * uSunOn * uAlpha);
}`;
