/**
 * WebGL2 landing sky.
 *
 * Clouds are a short vertical ray march through FBM density (domain-warped, so the edge is
 * fractal rather than a ball). A few steps toward the light give sunlit tops and darker bases.
 * The march is original; Beer-Lambert absorption follows the same lighting idea as
 * procedural-clouds-threejs (Teaching Three.js series), MIT License. No sphere primitives,
 * no bloom, no halo. The sun and moon are hard discs in pixel space.
 */
import {
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { cloudPalette } from "./palette";
import { fallMultiplier } from "@/lib/sky/journey";
import { fallbackProfile, type SkyProfile } from "@/lib/sky/profile";

export type WebglCloudMode = "mesh" | "billboard";

export type JourneyFrame = {
  /** 0 high in the sky, 1 at the meadow. Other pages pass 0. */
  altitude: number;
  /** Smoothed scroll speed, px/s. */
  scroll: number;
  /** Landing page only. */
  journey: boolean;
  /** 0 day, 1 night, 2 wet grass, 3 snow. */
  meadow: number;
  reduce: boolean;
};

export type CloudHandle = {
  setDark: (dark: boolean) => void;
  /** Coverage, greyness, haze and precipitation for the current weather. */
  setWeather: (profile: SkyProfile, precipCount: number) => void;
  setJourney: (state: JourneyFrame) => void;
  resize: () => void;
  /** `seconds` is the drift clock. Pass the same value again to hold a still frame. */
  frame: (seconds: number) => void;
  dispose: () => void;
};

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uBody;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform vec2 uRes;
uniform float uHazeAmt;
uniform float uFlash;
uniform float uAltitude;
uniform float uJourney;
uniform float uGround;
uniform float uTime;
uniform float uCover;
uniform float uDark;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
/* Loose window only. The silhouette is the warped noise, not the ellipse. */
float bank(vec2 p, vec2 c, vec2 r, float n) {
  vec2 q = (p - c) / r;
  float edge = 0.55 + (n - 0.5) * 1.45;
  return smoothstep(edge + 0.5, edge - 0.55, dot(q, q));
}
float density(vec3 p, float lite) {
  /* The cumulus are CC0 cutouts in the DOM. This march no longer paints them. */
  float drift = uTime * 0.012;
  return (p.x + drift) * lite * uCover * 0.0;
}
void main() {
  float h = smoothstep(0.0, 0.85, vUv.y);
  vec3 sky = mix(uHorizon, uZenith, h);
  sky = mix(sky, uHaze, clamp(uHazeAmt, 0.0, 0.72));
  sky = mix(sky, vec3(0.78), clamp(uFlash, 0.0, 0.08));

  vec3 ro = vec3((vUv.x - 0.5) * 6.2, 0.12, (0.92 - vUv.y) * 5.4);
  ro.z += uAltitude * 1.6;
  vec3 rd = vec3(0.0, 1.0, 0.0);
  float steps = 10.0;
  float dt = 0.11;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = jitter * dt;
  float transmittance = 1.0;
  vec3 col = vec3(0.0);
  vec3 sun = normalize(vec3(-0.45, 0.85, 0.18));
  for (int i = 0; i < 10; i++) {
    if (transmittance < 0.04) break;
    vec3 p = ro + rd * t;
    float den = density(p, 0.0);
    if (den > 0.012) {
      float lightAcc = 0.0;
      vec3 lp = p;
      for (int j = 0; j < 3; j++) {
        lp += sun * 0.22;
        lightAcc += density(lp, 1.0);
      }
      float beer = exp(-lightAcc * 1.55);
      float heightLit = smoothstep(0.15, 0.9, clamp((p.y - 0.12) / 1.15, 0.0, 1.0));
      float shade = clamp(beer * 0.72 + heightLit * 0.38, 0.0, 1.0);
      float absorb = den * mix(1.35, 0.85, uDark) * dt * 8.0;
      float contrib = (1.0 - exp(-absorb)) * mix(0.55, 1.0, shade);
      col += transmittance * contrib * mix(uShadow, uLit, shade);
      transmittance *= exp(-absorb);
    }
    t += dt;
  }
  col += sky * transmittance;
  float hx = abs(vUv.x - 0.5);
  float hero = smoothstep(0.36, 0.12, hx) * smoothstep(0.4, 0.58, vUv.y) * smoothstep(0.98, 0.74, vUv.y);
  float nav = smoothstep(0.9, 0.97, vUv.y);
  col = mix(col, sky, hero * 0.92 * (1.0 - nav));

  /* 20% from the right, 18% from the top. Length is in pixels, so the disc stays round. */
  vec2 center = vec2(0.80, 0.82);
  vec2 px = (vUv - center) * uRes;
  float rad = min(uRes.x, uRes.y) * 0.016;
  float disc = 1.0 - smoothstep(rad - 0.6, rad + 0.45, length(px));
  float crater = 0.0;
  if (uDark > 0.5) {
    crater = smoothstep(rad * 0.22, rad * 0.05, length(px - vec2(rad * 0.28, rad * 0.12))) * 0.16;
    crater += smoothstep(rad * 0.16, rad * 0.04, length(px - vec2(-rad * 0.22, -rad * 0.18))) * 0.1;
  }
  float vis = 1.0 - smoothstep(0.02, 0.42, uAltitude);
  col = mix(col, uBody * (1.0 - crater), disc * vis);

  float band = uJourney * smoothstep(0.62, 1.0, uAltitude) * smoothstep(0.48, 0.02, vUv.y);
  vec3 grass = vec3(0.33, 0.5, 0.27);
  if (uGround > 2.5) grass = vec3(0.9, 0.93, 0.95);
  else if (uGround > 1.5) grass = vec3(0.16, 0.26, 0.16);
  else if (uGround > 0.5) grass = vec3(0.07, 0.11, 0.08);
  float sheen = 0.0;
  if (uGround > 1.5 && uGround < 2.5) sheen = smoothstep(0.16, 0.26, vUv.y) * smoothstep(0.34, 0.24, vUv.y) * 0.18;
  col = mix(col, grass + vec3(sheen), band);
  gl_FragColor = vec4(col, 1.0);
}`;

const PRECIP_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uFall;
uniform float uSway;
uniform float uShear;
uniform vec2 uPx;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  // Clip space, not the camera. Scroll moves the cloud camera; these must not ride with it.
  vec3 center = instanceMatrix[3].xyz;
  float span = 2.4;
  float pace = mix(0.65, 1.35, aSeed);
  float y = mod(center.y + 1.2 - uTime * uFall * 0.22 * pace, span) - 1.2;
  float x = center.x + sin(uTime * 0.45 + aSeed * 6.28318) * uSway;
  vec2 sizePx = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  vec2 side = vec2(cos(uShear), sin(uShear));
  vec2 dir = vec2(sin(uShear), -cos(uShear));
  vec2 p = vec2(x, y) + side * (position.x * sizePx.x * uPx.x) + dir * (position.y * sizePx.y * uPx.y);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
uniform vec3 uColor;
void main() {
  float a = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.55, vUv.y) * mix(0.15, 0.35, vSeed);
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}`;

const BIRD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const BIRD_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uFlap;
uniform vec3 uInk;
void main() {
  vec2 p = vUv - 0.5;
  float wing = sin(uFlap) * 0.07;
  float body = smoothstep(0.09, 0.02, length(p * vec2(2.4, 5.2)));
  vec2 w = vec2(p.x, p.y - wing);
  float wings = smoothstep(0.15, 0.03, length(w * vec2(0.65, 2.6)));
  float a = max(body, wings);
  if (a < 0.06) discard;
  gl_FragColor = vec4(uInk, a);
}`;

const SNOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
uniform vec3 uColor;
void main() {
  float d = length(vUv - 0.5);
  float a = smoothstep(0.5, 0.22, d) * mix(0.3, 0.8, vSeed);
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}`;

/** sRGB 0–1. ShaderMaterial writes gl_FragColor as stored, so Color()'s linear values would crush the dark sky. */
function srgb(hex: string): Vector3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function mixHex(a: Vector3, b: Vector3, t: number): Vector3 {
  return a.clone().lerp(b, Math.min(1, Math.max(0, t)));
}

function makePrecip(max: number, rain: boolean, color: Vector3) {
  const seeds = new Float32Array(max);
  const geo = new PlaneGeometry(1, 1);
  for (let i = 0; i < max; i++) seeds[i] = Math.random();
  geo.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
  const uniforms = {
    uTime: { value: 0 },
    uFall: { value: rain ? 3.1 : 0.55 },
    uSway: { value: rain ? 0.012 : 0.04 },
    uShear: { value: rain ? 0.18 : 0.0 },
    uPx: { value: new Vector2(2 / 1280, 2 / 800) },
    uColor: { value: color },
  };
  const mat = new ShaderMaterial({
    vertexShader: PRECIP_VERT,
    fragmentShader: rain ? RAIN_FRAG : SNOW_FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
  });
  const mesh = new InstancedMesh(geo, mat, max);
  const dummy = new Object3D();
  for (let i = 0; i < max; i++) {
    dummy.position.set((Math.random() - 0.5) * 1.9, (Math.random() - 0.5) * 2.2, 0);
    const flake = 1 + Math.random() * 3;
    const rw = 1 + Math.random() * 0.6;
    const rh = 8 + Math.random() * 10;
    dummy.scale.set(rain ? rw : flake, rain ? rh : flake, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, geo, mat, uniforms };
}

export function createWebglClouds(
  canvas: HTMLCanvasElement,
  opts: { mode: WebglCloudMode; dark: boolean; draw?: SkyProfile; precipMax?: number },
): CloudHandle {
  // preserveDrawingBuffer: Chromium's backdrop-filter reads this canvas for the liquid-glass lens.
  // With the default discard, that sample is blank and the refraction never bends the sky.
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: opts.mode === "billboard" ? "low-power" : "default",
  });
  renderer.setClearColor(opts.dark ? 0x161e2c : 0x5d9be8, 1);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 40);
  camera.position.set(0, 0.35, 6.2);
  camera.lookAt(0, 0.55, 0);

  const pal0 = cloudPalette(opts.dark);
  const skyUniforms = {
    uZenith: { value: srgb(pal0.zenith) },
    uHorizon: { value: srgb(pal0.horizon) },
    uHaze: { value: srgb(pal0.shadow) },
    uBody: { value: srgb(pal0.body) },
    uLit: { value: srgb(pal0.lit) },
    uShadow: { value: srgb(pal0.shadow) },
    uRes: { value: new Vector2(1, 1) },
    uHazeAmt: { value: 0 },
    uFlash: { value: 0 },
    uAltitude: { value: 0 },
    uJourney: { value: 0 },
    uGround: { value: 0 },
    uTime: { value: 0 },
    uCover: { value: 0 },
    uDark: { value: opts.dark ? 1 : 0 },
  };
  const skyMat = new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: skyUniforms,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new Mesh(new PlaneGeometry(2, 2), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  const grassMat = new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: /* glsl */ `
uniform float uAltitude;
uniform float uJourney;
uniform float uGround;
varying vec2 vUv;
void main() {
  float band = uJourney * smoothstep(0.5, 0.85, uAltitude) * smoothstep(0.82, 0.5, vUv.y);
  if (band < 0.02) discard;
  vec3 grass = vec3(0.29, 0.5, 0.22);
  float sheen = 0.0;
  if (uGround > 2.5) grass = vec3(0.92, 0.95, 0.97);
  else if (uGround > 1.5) {
    grass = vec3(0.11, 0.2, 0.11);
    sheen = smoothstep(0.16, 0.27, vUv.y) * smoothstep(0.36, 0.24, vUv.y) * 0.2;
  } else if (uGround > 0.5) grass = vec3(0.04, 0.13, 0.06);
  float horizon = smoothstep(0.5, 0.34, vUv.y);
  gl_FragColor = vec4(grass + vec3(sheen * horizon), band);
}`,
    uniforms: skyUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: NormalBlending,
  });
  const grass = new Mesh(new PlaneGeometry(2, 2), grassMat);
  grass.frustumCulled = false;
  grass.renderOrder = 4;
  scene.add(grass);

  const precipMax = Math.max(1, Math.min(48, opts.precipMax ?? 48));
  const rain = makePrecip(precipMax, true, srgb(pal0.shadow));
  const snow = makePrecip(precipMax, false, srgb(pal0.lit));
  scene.add(rain.mesh);
  scene.add(snow.mesh);

  const birdCount = opts.mode === "billboard" ? 4 : 6;
  const birdUniforms = { uFlap: { value: 0 }, uInk: { value: srgb(opts.dark ? "#c5cad6" : "#2a3038") } };
  const birdGeo = new PlaneGeometry(1, 1);
  const birdMat = new ShaderMaterial({
    vertexShader: BIRD_VERT,
    fragmentShader: BIRD_FRAG,
    uniforms: birdUniforms,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
  });
  const birds = new InstancedMesh(birdGeo, birdMat, birdCount);
  birds.frustumCulled = false;
  birds.renderOrder = 3;
  birds.count = 0;
  scene.add(birds);
  const birdDummy = new Object3D();

  let altitude = 0;
  let journeyOn = false;
  let reduceMotion = false;
  let scrollMul = 1;
  const rainBase = 3.1;
  const snowBase = 0.42;

  let dark = opts.dark;
  let draw = opts.draw ?? fallbackProfile();

  const paintLook = () => {
    const pal = cloudPalette(dark);
    const zenith = srgb(pal.zenith);
    const horizon = srgb(pal.horizon);
    const lit = srgb(pal.lit);
    const shadow = srgb(pal.shadow);
    // Rain greys the sky. Day stays a blue-grey, not a black crush, so the sunlit edge still reads.
    const zenithCrush = dark ? srgb("#243044") : srgb("#8ea4b8");
    renderer.setClearColor(dark ? 0x161e2c : 0x5d9be8, 1);
    skyUniforms.uZenith.value.copy(mixHex(zenith, zenithCrush, draw.gray * (dark ? 0.18 : 0.55)));
    skyUniforms.uHorizon.value.copy(mixHex(horizon, shadow, draw.gray * 0.12));
    skyUniforms.uHaze.value.copy(mixHex(horizon, shadow, 0.45));
    skyUniforms.uHazeAmt.value = draw.haze;
    skyUniforms.uBody.value.copy(srgb(pal.body));
    skyUniforms.uLit.value.copy(mixHex(lit, shadow, draw.gray * (dark ? 0.42 : 0.22)));
    skyUniforms.uShadow.value.copy(mixHex(shadow, zenith, draw.gray * 0.08));
    skyUniforms.uCover.value = draw.gray;
    skyUniforms.uDark.value = dark ? 1 : 0;
    rain.uniforms.uColor.value.copy(dark ? mixHex(lit, shadow, 0.25) : srgb("#5e6d7c"));
    snow.uniforms.uColor.value.copy(dark ? skyUniforms.uLit.value : srgb("#f4f7fb"));
    birdUniforms.uInk.value.copy(srgb(dark ? "#d5dbe6" : "#2c3340"));
  };

  const applyWeather = (profile: SkyProfile, precipCount: number) => {
    draw = profile;
    const n = profile.precip === "none" ? 0 : Math.max(0, Math.min(precipMax, precipCount));
    rain.mesh.count = profile.precip === "rain" ? Math.min(n, 18) : 0;
    snow.mesh.count = profile.precip === "snow" ? Math.min(n, 36) : 0;
    paintLook();
  };
  applyWeather(draw, 0);

  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const cap = opts.mode === "billboard" ? 1 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const longest = Math.max(w, h) * dpr;
    const scale = longest > 1280 ? 1280 / longest : 1;
    renderer.setPixelRatio(dpr * scale);
    renderer.setSize(w, h, false);
    const px = new Vector2(2 / Math.max(1, w), 2 / Math.max(1, h));
    rain.uniforms.uPx.value.copy(px);
    snow.uniforms.uPx.value.copy(px);
    skyUniforms.uRes.value.set(w * dpr * scale, h * dpr * scale);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const placeBirds = (seconds: number) => {
    const show = journeyOn && !reduceMotion && altitude > 0.08 && altitude < 0.82;
    birds.count = show ? birdCount : 0;
    if (!show) return;
    const fly = Math.min(1, Math.max(0, (altitude - 0.16) / 0.58));
    birdUniforms.uFlap.value = seconds * 14;
    for (let i = 0; i < birdCount; i++) {
      const seed = (i + 0.5) / birdCount;
      const away = fly * (0.45 + seed * 0.55);
      const dist = 3.2 + away * 14;
      birdDummy.position.set((seed - 0.5) * (4.2 + away * 2.2) + Math.sin(seconds * 0.6 + i) * 0.12, camera.position.y - 1.45 + (seed - 0.5) * 0.9, camera.position.z - dist);
      const s = 0.85 * (1 - away * 0.78);
      birdDummy.scale.set(s * 1.7, s, 1);
      birdDummy.updateMatrix();
      birds.setMatrixAt(i, birdDummy.matrix);
    }
    birds.instanceMatrix.needsUpdate = true;
  };

  let disposed = false;
  return {
    setDark: (next) => {
      dark = next;
      paintLook();
    },
    setWeather: applyWeather,
    setJourney: (state) => {
      altitude = state.altitude;
      journeyOn = state.journey;
      reduceMotion = state.reduce;
      scrollMul = state.reduce ? 1 : fallMultiplier(state.scroll);
      skyUniforms.uAltitude.value = state.journey ? state.altitude : 0;
      skyUniforms.uJourney.value = state.journey ? 1 : 0;
      skyUniforms.uGround.value = state.meadow;
      rain.uniforms.uFall.value = rainBase * scrollMul;
      snow.uniforms.uFall.value = snowBase * scrollMul;
      const a = state.journey ? state.altitude : 0;
      camera.position.set(0, 6.4 - a * 6.1, 6.2);
      camera.lookAt(0, 3.2 - a * 2.8, 0);
    },
    resize,
    frame: (seconds) => {
      if (disposed) return;
      skyUniforms.uTime.value = seconds;
      rain.uniforms.uTime.value = seconds;
      snow.uniforms.uTime.value = seconds;
      placeBirds(seconds);
      const phase = seconds % 10;
      skyUniforms.uFlash.value = draw.flash && phase > 0.04 && phase < 0.12 ? 0.06 : 0;
      renderer.render(scene, camera);
    },
    dispose: () => {
      disposed = true;
      sky.geometry.dispose();
      skyMat.dispose();
      grass.geometry.dispose();
      grassMat.dispose();
      rain.geo.dispose();
      rain.mat.dispose();
      snow.geo.dispose();
      snow.mat.dispose();
      birdGeo.dispose();
      birdMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
