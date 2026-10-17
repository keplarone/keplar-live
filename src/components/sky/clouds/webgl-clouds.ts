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

export type WebglCloudMode = "mesh" | "billboard";

export type CloudHandle = {
  setDark: (dark: boolean) => void;
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
varying vec2 vUv;
void main() {
  float h = smoothstep(0.0, 0.85, vUv.y);
  gl_FragColor = vec4(mix(uHorizon, uZenith, h), 1.0);
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
void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(0.42, 0.84, 0.32));
  float ndl = dot(n, light);
  float wrap = clamp(ndl * 0.45 + 0.55, 0.0, 1.0);
  // Back faces and the core absorb more. No bright rim.
  float optical = mix(0.45, 2.2, 1.0 - wrap);
  if (vKind > 1.5) optical *= 0.32;
  float beer = exp(-optical);
  vec3 col = mix(uShadow, uLit, beer);
  float alpha = vKind > 1.5 ? 0.48 : 0.92;
  vec2 uvh = gl_FragCoord.xy / max(uRes, vec2(1.0));
  float hero = smoothstep(0.36, 0.12, abs(uvh.x - 0.5)) * smoothstep(0.42, 0.58, uvh.y) * smoothstep(0.98, 0.74, uvh.y);
  alpha *= 1.0 - hero;
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
varying vec2 vUv;
varying float vKind;
void main() {
  float dens = texture2D(uMap, vUv).a;
  if (dens < 0.03) discard;
  float up = smoothstep(0.15, 0.8, vUv.y);
  float optical = dens * (vKind > 1.5 ? 0.4 : 1.8) * mix(1.15, 0.55, up);
  float beer = exp(-optical);
  vec3 col = mix(uShadow, uLit, beer);
  float alpha = smoothstep(0.04, 0.45, dens) * (vKind > 1.5 ? 0.5 : 0.94);
  vec2 uvh = gl_FragCoord.xy / max(uRes, vec2(1.0));
  float hero = smoothstep(0.36, 0.12, abs(uvh.x - 0.5)) * smoothstep(0.42, 0.58, uvh.y) * smoothstep(0.98, 0.74, uvh.y);
  alpha *= 1.0 - hero;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
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

export function createWebglClouds(canvas: HTMLCanvasElement, opts: { mode: WebglCloudMode; dark: boolean }): CloudHandle {
  // preserveDrawingBuffer: Chromium's backdrop-filter reads this canvas for the liquid-glass lens.
  // With the default discard, that sample is blank and the refraction never bends the sky.
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: opts.mode === "billboard" ? "low-power" : "default",
  });
  renderer.setClearColor(0x000000, 1);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 40);
  camera.position.set(0, 0.35, 6.2);
  camera.lookAt(0, 0.55, 0);

  const pal = cloudPalette(opts.dark);
  const skyUniforms = { uZenith: { value: srgb(pal.zenith) }, uHorizon: { value: srgb(pal.horizon) } };
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

  const puffs = layout(opts.mode);
  const kinds = new Float32Array(puffs.map((p) => p.kind));
  const cloudUniforms = {
    uTime: { value: 0 },
    uLit: { value: srgb(pal.lit) },
    uShadow: { value: srgb(pal.shadow) },
    uRes: { value: new Vector2(1, 1) },
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

  let disposed = false;
  return {
    setDark: (dark) => {
      const next = cloudPalette(dark);
      skyUniforms.uZenith.value.copy(srgb(next.zenith));
      skyUniforms.uHorizon.value.copy(srgb(next.horizon));
      cloudUniforms.uLit.value.copy(srgb(next.lit));
      cloudUniforms.uShadow.value.copy(srgb(next.shadow));
    },
    resize,
    frame: (seconds) => {
      if (disposed) return;
      cloudUniforms.uTime.value = seconds;
      renderer.render(scene, camera);
    },
    dispose: () => {
      disposed = true;
      geo.dispose();
      mat.dispose();
      sky.geometry.dispose();
      skyMat.dispose();
      tex?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
