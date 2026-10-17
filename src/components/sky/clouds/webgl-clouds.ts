/**
 * WebGL2 cloud fallbacks for the landing sky.
 *
 * Density shapes and the mesh-cluster / billboard split follow procedural-clouds-threejs
 * (Teaching Three.js series), MIT License. Silver linings, god rays, bloom and additive
 * glow are not used. Each puff is shaded with a Beer-Lambert absorption proxy and a wrap
 * diffuse term so the body self-shadows and the rim stays dark.
 */
import {
  CanvasTexture,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Mesh,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { cloudPalette } from "./palette";
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
uniform float uHazeAmt;
uniform float uFlash;
uniform float uAltitude;
uniform float uJourney;
uniform float uGround;
varying vec2 vUv;
void main() {
  float h = smoothstep(0.0, 0.85, vUv.y);
  vec3 sky = mix(uHorizon, uZenith, h);
  sky = mix(sky, uHaze, clamp(uHazeAmt, 0.0, 0.72));
  sky = mix(sky, vec3(0.78), clamp(uFlash, 0.0, 0.08));
  // Sun or moon, high above the clouds. A short soft edge, not a bloom.
  vec2 p = vUv - vec2(0.72, 0.8);
  float d = length(p * vec2(1.0, 1.35));
  float disc = smoothstep(0.046, 0.018, d);
  float edge = smoothstep(0.085, 0.04, d) * 0.4;
  float vis = uJourney * (1.0 - smoothstep(0.02, 0.42, uAltitude));
  sky = mix(sky, uBody, (disc + edge * (1.0 - disc)) * vis);
  // The meadow only appears at the bottom of the landing descent.
  float band = uJourney * smoothstep(0.62, 1.0, uAltitude) * smoothstep(0.48, 0.02, vUv.y);
  vec3 grass = vec3(0.33, 0.5, 0.27);
  if (uGround > 2.5) grass = vec3(0.9, 0.93, 0.95);
  else if (uGround > 1.5) grass = vec3(0.16, 0.26, 0.16);
  else if (uGround > 0.5) grass = vec3(0.07, 0.11, 0.08);
  float sheen = 0.0;
  if (uGround > 1.5 && uGround < 2.5) sheen = smoothstep(0.16, 0.26, vUv.y) * smoothstep(0.34, 0.24, vUv.y) * 0.18;
  sky = mix(sky, grass + vec3(sheen), band);
  gl_FragColor = vec4(sky, 1.0);
}`;

const MESH_VERT = /* glsl */ `
attribute float aKind;
uniform float uTime;
varying vec3 vNormal;
varying float vKind;
void main() {
  vKind = aKind;
  mat4 m = instanceMatrix;
  float drift = uTime * (aKind > 1.5 ? 0.08 : 0.22);
  m[3][0] += drift;
  m[3][0] = mod(m[3][0] + 8.0, 16.0) - 8.0;
  vec4 world = modelMatrix * m * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix * m) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const MESH_FRAG = /* glsl */ `
varying vec3 vNormal;
varying float vKind;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform vec2 uRes;
uniform float uClearing;
void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(0.42, 0.84, 0.32));
  float ndl = dot(n, light);
  float wrap = clamp(ndl * 0.45 + 0.55, 0.0, 1.0);
  // Back faces and the core absorb more. No bright rim.
  float optical = mix(0.45, 2.2, 1.0 - wrap);
  if (vKind > 1.5) optical *= 0.32;
  float beer = exp(-optical);
  // The shadow colour is as dark as the night sky, so a low mix disappears. The body stays towards lit.
  float shade = mix(0.72, 1.0, smoothstep(0.12, 0.9, beer));
  vec3 col = mix(uShadow, uLit, shade);
  float alpha = vKind > 1.5 ? 0.48 : 0.92;
  vec2 uvh = gl_FragCoord.xy / max(uRes, vec2(1.0));
  float hero = smoothstep(0.36, 0.12, abs(uvh.x - 0.5)) * smoothstep(0.42, 0.58, uvh.y) * smoothstep(0.98, 0.74, uvh.y);
  // The top bar keeps its clouds. The clearing is for the headline, not the glass.
  float nav = smoothstep(0.86, 0.94, uvh.y);
  alpha *= 1.0 - hero * uClearing * (1.0 - nav);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}`;

const BILL_VERT = /* glsl */ `
attribute float aKind;
uniform float uTime;
varying vec2 vUv;
varying float vKind;
void main() {
  vUv = uv;
  vKind = aKind;
  vec3 center = instanceMatrix[3].xyz;
  center.x += uTime * (aKind > 1.5 ? 0.06 : 0.16);
  center.x = mod(center.x + 8.0, 16.0) - 8.0;
  vec2 scale = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = center + right * (position.x * scale.x) + up * (position.y * scale.y);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;

const BILL_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform vec2 uRes;
uniform float uClearing;
varying vec2 vUv;
varying float vKind;
void main() {
  float dens = texture2D(uMap, vUv).a;
  if (dens < 0.03) discard;
  float up = smoothstep(0.15, 0.8, vUv.y);
  float optical = dens * (vKind > 1.5 ? 0.4 : 1.8) * mix(1.15, 0.55, up);
  float beer = exp(-optical);
  float shade = mix(0.72, 1.0, smoothstep(0.12, 0.9, beer));
  vec3 col = mix(uShadow, uLit, shade);
  float alpha = smoothstep(0.1, 0.32, dens) * (vKind > 1.5 ? 0.55 : 0.96);
  vec2 uvh = gl_FragCoord.xy / max(uRes, vec2(1.0));
  float hero = smoothstep(0.36, 0.12, abs(uvh.x - 0.5)) * smoothstep(0.42, 0.58, uvh.y) * smoothstep(0.98, 0.74, uvh.y);
  float nav = smoothstep(0.86, 0.94, uvh.y);
  alpha *= 1.0 - hero * uClearing * (1.0 - nav);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}`;

const PRECIP_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uFall;
uniform float uSway;
uniform float uShear;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec3 center = instanceMatrix[3].xyz;
  float span = 8.0;
  float pace = mix(0.62, 1.4, aSeed);
  center.y = mod(aSeed * span - uTime * uFall * pace, span) - 1.6;
  center.x += sin(uTime * 0.35 + aSeed * 6.283) * uSway + center.y * uShear * 0.08;
  vec2 scale = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 angled = up + right * uShear;
  vec3 p = center + right * (position.x * scale.x) + angled * (position.y * scale.y);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
uniform vec3 uColor;
void main() {
  float a = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * 0.72;
  if (a < 0.03) discard;
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
  float soft = mix(0.08, 0.42, vSeed);
  float a = smoothstep(0.5, soft, d) * mix(0.45, 0.85, vSeed);
  if (a < 0.03) discard;
  gl_FragColor = vec4(uColor, a);
}`;

type Puff = { x: number; y: number; z: number; sx: number; sy: number; sz: number; kind: number };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cumulus domes, a stratocumulus sheet, and a few high cirrus wisps. Kept off the view centre. */
function layout(mode: WebglCloudMode): Puff[] {
  const rand = mulberry32(11);
  const out: Puff[] = [];
  if (mode === "billboard") {
    const spots = [
      [-4.8, 2.2, -2.5, 3.8, 1.6, 0],
      [4.6, 2.4, -3.2, 4.0, 1.55, 0],
      [-1.5, 2.8, -6.5, 4.6, 1.25, 1],
      [2.2, 2.7, -7.2, 4.2, 1.1, 1],
      [-5.5, 3.6, -8.5, 5.4, 0.42, 2],
      [5.2, 3.8, -8.0, 5.0, 0.38, 2],
      [0.2, 4.0, -10, 6.2, 0.3, 2],
      [-2.8, 1.7, -1.6, 2.8, 1.25, 0],
      [2.6, 1.8, -1.8, 2.6, 1.15, 0],
      // A wide puff whose edge crosses the top glass, including the centre links.
      [-0.15, 2.2, -1.3, 5.2, 0.95, 0],
      // A wide low puff. Its top edge crosses the lower half of the view, where a card sits, so the lens has a boundary to bend.
      [-1.4, -1.45, -1.25, 6.6, 1.45, 0],
    ] as const;
    for (const [x, y, z, sx, sy, kind] of spots) {
      out.push({ x, y, z, sx, sy, sz: 1, kind });
    }
    // The deck sits high enough that the top glass (nav pills) has cloud edges behind it.
    return out.map((p) => ({ ...p, y: p.y + 1.15 }));
  }
  const clusters = [
    { x: -3.3, y: 1.7, z: -1.5 },
    { x: 3.0, y: 1.9, z: -2.6 },
    { x: -0.4, y: 2.6, z: -5.2 },
  ];
  for (const c of clusters) {
    for (let i = 0; i < 8; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 1.05;
      const base = i < 3;
      out.push({
        x: c.x + Math.cos(a) * r,
        y: c.y + (base ? -0.22 : rand() * 0.65),
        z: c.z + Math.sin(a) * r * 0.65,
        sx: 0.5 + rand() * 0.42,
        sy: base ? 0.24 : 0.36 + rand() * 0.32,
        sz: 0.46 + rand() * 0.36,
        kind: 0,
      });
    }
  }
  for (let i = 0; i < 14; i++) {
    out.push({
      x: -6 + rand() * 12,
      y: 2.15 + rand() * 0.28,
      z: -3.2 - rand() * 3.6,
      sx: 1.05 + rand() * 0.7,
      sy: 0.18 + rand() * 0.12,
      sz: 0.7 + rand() * 0.45,
      kind: 1,
    });
  }
  for (let i = 0; i < 5; i++) {
    out.push({
      x: -5.2 + i * 2.4 + rand() * 0.4,
      y: 3.45 + rand() * 0.25,
      z: -6.5 - rand(),
      sx: 2.2 + rand() * 0.6,
      sy: 0.07,
      sz: 0.28,
      kind: 2,
    });
  }
  // One wide puff in front of the deck so the top glass has a cloud edge to bend.
  out.push({ x: 0.1, y: 2.25, z: -1.35, sx: 2.4, sy: 0.55, sz: 0.9, kind: 0 });
  // And one low, so a card in the lower half of the view has an edge too.
  out.push({ x: -1.1, y: -1.3, z: -1.3, sx: 3.2, sy: 0.75, sz: 1.1, kind: 0 });
  return out.map((p) => ({ ...p, y: p.y + 1.15 }));
}

/** sRGB 0–1. ShaderMaterial writes gl_FragColor as stored, so Color()'s linear values would crush the dark sky. */
function srgb(hex: string): Vector3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    v += a * valueNoise(x * f, y * f);
    f *= 2.05;
    a *= 0.5;
  }
  return v;
}

/** One lumpy cloud plate: flat base, soft body, neutral grey. Alpha is optical density. */
function cloudTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const shape = fbm(nx * 3.2 + 2.0, ny * 3.2);
      const detail = fbm(nx * 7.0, ny * 7.0 + 4.0);
      const base = ny < 0.34 ? (ny - 0.12) / 0.22 : 1;
      const body = shape * 0.72 + detail * 0.28 - (1 - Math.max(0, Math.min(1, base))) * 0.55;
      const dx = nx - 0.5;
      const dy = (ny - 0.52) * 1.15;
      const rad = Math.sqrt(dx * dx + dy * dy);
      const mask = rad < 0.22 ? 1 : rad > 0.5 ? 0 : 1 - (rad - 0.22) / 0.28;
      let dens = Math.max(0, Math.min(1, (body - 0.38) / 0.28)) * mask;
      dens *= dens * (3 - 2 * dens);
      const i = (y * size + x) * 4;
      const g = 214 + dens * 30;
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g + 1;
      img.data[i + 3] = Math.round(dens * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
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
    uSway: { value: rain ? 0.08 : 0.42 },
    uShear: { value: rain ? 0.85 : 0.12 },
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
    const x = (Math.random() - 0.5) * 16;
    const z = -1.2 - Math.random() * 5;
    dummy.position.set(x, Math.random() * 6, z);
    const flake = 0.045 + Math.random() * 0.16;
    dummy.scale.set(rain ? 0.012 + Math.random() * 0.012 : flake, rain ? 0.45 + Math.random() * 0.55 : flake, 1);
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
  renderer.setClearColor(opts.dark ? 0x2a4068 : 0x4f86c8, 1);
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
    uHazeAmt: { value: 0 },
    uFlash: { value: 0 },
    uAltitude: { value: 0 },
    uJourney: { value: 0 },
    uGround: { value: 0 },
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

  const puffs = layout(opts.mode);
  const kinds = new Float32Array(puffs.map((p) => p.kind));
  const cloudUniforms = {
    uTime: { value: 0 },
    uLit: { value: srgb(pal0.lit) },
    uShadow: { value: srgb(pal0.shadow) },
    uRes: { value: new Vector2(1, 1) },
    uClearing: { value: 0.55 },
  };
  let tex: CanvasTexture | null = null;
  let geo: SphereGeometry | PlaneGeometry;
  let mat: ShaderMaterial;
  if (opts.mode === "billboard") {
    tex = cloudTexture();
    geo = new PlaneGeometry(1, 1);
    mat = new ShaderMaterial({
      vertexShader: BILL_VERT,
      fragmentShader: BILL_FRAG,
      uniforms: { ...cloudUniforms, uMap: { value: tex } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      side: DoubleSide,
    });
  } else {
    geo = new SphereGeometry(1, 12, 9);
    mat = new ShaderMaterial({
      vertexShader: MESH_VERT,
      fragmentShader: MESH_FRAG,
      uniforms: cloudUniforms,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
  }
  geo.setAttribute("aKind", new InstancedBufferAttribute(kinds, 1));
  const mesh = new InstancedMesh(geo, mat, puffs.length);
  const dummy = new Object3D();
  puffs.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.set(p.sx, p.sy, p.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

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

  const placeClouds = () => {
    puffs.forEach((p, i) => {
      const slot = (i + 0.5) / puffs.length;
      // Low coverage used to hide every near puff, and the opaque canvas then covered the CSS clouds.
      // Banks in front of the camera stay up even on a clear night. Coverage only thins the far deck.
      const show = draw.coverage >= 0.95 || p.kind >= 2 || p.z > -3.3 || slot > 1 - draw.coverage;
      const s = show ? draw.bulk : 0.0001;
      dummy.position.set(p.x, p.y - draw.drop, p.z);
      dummy.scale.set(p.sx * s, p.sy * s * draw.flat, p.sz * s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  const paintLook = () => {
    const pal = cloudPalette(dark);
    const zenith = srgb(pal.zenith);
    const horizon = srgb(pal.horizon);
    const lit = srgb(pal.lit);
    const shadow = srgb(pal.shadow);
    // Rain greys the sky. Day stays a blue-grey, not a black crush, so the sunlit edge still reads.
    const zenithCrush = dark ? srgb("#243656") : srgb("#8ea4b8");
    skyUniforms.uZenith.value.copy(mixHex(zenith, zenithCrush, draw.gray * (dark ? 0.18 : 0.55)));
    skyUniforms.uHorizon.value.copy(mixHex(horizon, shadow, draw.gray * 0.12));
    skyUniforms.uHaze.value.copy(mixHex(horizon, shadow, 0.45));
    skyUniforms.uHazeAmt.value = draw.haze;
    skyUniforms.uBody.value.copy(srgb(pal.body));
    cloudUniforms.uLit.value.copy(mixHex(lit, shadow, draw.gray * (dark ? 0.42 : 0.22)));
    cloudUniforms.uShadow.value.copy(mixHex(shadow, zenith, draw.gray * 0.08));
    cloudUniforms.uClearing.value = draw.clearing;
    rain.uniforms.uColor.value.copy(dark ? mixHex(lit, shadow, 0.25) : srgb("#5e6d7c"));
    snow.uniforms.uColor.value.copy(dark ? cloudUniforms.uLit.value : srgb("#f4f7fb"));
    birdUniforms.uInk.value.copy(srgb(dark ? "#d5dbe6" : "#2c3340"));
  };

  const applyWeather = (profile: SkyProfile, precipCount: number) => {
    draw = profile;
    const n = profile.precip === "none" ? 0 : Math.max(0, Math.min(precipMax, precipCount));
    rain.mesh.count = profile.precip === "rain" ? n : 0;
    snow.mesh.count = profile.precip === "snow" ? n : 0;
    paintLook();
    placeClouds();
  };
  applyWeather(draw, 0);

  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const cap = opts.mode === "billboard" ? 1 : 1.25;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    cloudUniforms.uRes.value.set(w * dpr, h * dpr);
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
      scrollMul = state.reduce ? 1 : 1 + Math.min(3, Math.max(0, state.scroll) / 900);
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
      cloudUniforms.uTime.value = seconds;
      rain.uniforms.uTime.value = seconds;
      snow.uniforms.uTime.value = seconds;
      placeBirds(seconds);
      const phase = seconds % 10;
      skyUniforms.uFlash.value = draw.flash && phase > 0.04 && phase < 0.12 ? 0.06 : 0;
      renderer.render(scene, camera);
    },
    dispose: () => {
      disposed = true;
      geo.dispose();
      mat.dispose();
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
      tex?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
