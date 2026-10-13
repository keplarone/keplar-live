import * as THREE from "three";

/**
 * The home's "How Keplar works" particle scene (ParticleStory.tsx). One cloud of glowing points morphs through three shapes as the
 * section scrolls: a bright core (ask once), five linked clusters with streams back to the center (several models answer), and one
 * sphere (you get one answer). Each point carries all three positions; the vertex shader blends them by scroll progress (0..2), with
 * a small per-point delay so the cloud flows rather than snaps. Light theme draws blue points with normal blending; dark theme adds
 * them up so they glow. A soft aura plane sits behind the cloud. The caller owns the frame loop and calls frame() per frame.
 */
export type ParticleScene = {
  frame: (now: number, progress: number) => void;
  setDark: (dark: boolean) => void;
  setPointer: (x: number, y: number) => void;
  resize: () => void;
  dispose: () => void;
};

const MODELS = 5;

const vert = /* glsl */ `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aC;
  attribute float aSeed;
  attribute float aSize;
  uniform float uP;
  uniform float uT;
  uniform float uSize;
  uniform float uPr;
  uniform float uDark;
  varying vec3 vColor;
  varying float vAlpha;

  float stage(float p, float seed) {
    return smoothstep(0.0, 1.0, clamp((p - seed * 0.3) / 0.7, 0.0, 1.0));
  }

  void main() {
    float m1 = stage(uP, aSeed);
    float m2 = stage(uP - 1.0, aSeed);
    vec3 pos = mix(mix(aA, aB, m1), aC, m2);
    // mid-morph the points billow outward a little, then settle into the next shape
    float burst = sin(m1 * 3.14159) + sin(m2 * 3.14159);
    pos += normalize(pos + vec3(0.0001)) * burst * (0.15 + aSeed * 0.35);
    // slow drift so the cloud is never still
    float t = uT * (0.4 + aSeed * 0.6);
    pos += vec3(sin(t + aSeed * 40.0), cos(t * 0.8 + aSeed * 23.0), sin(t * 0.6 + aSeed * 11.0)) * 0.025;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aSize * uPr / -mv.z;

    vec3 deep = mix(vec3(0.16, 0.38, 0.86), vec3(0.42, 0.68, 1.0), uDark);
    vec3 ice = mix(vec3(0.42, 0.72, 0.98), vec3(0.78, 0.92, 1.0), uDark);
    vColor = mix(deep, ice, fract(aSeed * 7.31));
    vAlpha = mix(0.55, 0.8, uDark) * (0.6 + 0.4 * fract(aSeed * 3.7));
  }
`;

const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uDark;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.4, 0.0, d);
    float halo = exp(-d * d * 5.0) * (1.0 - d);
    float a = (core * 0.85 + halo * 0.4) * vAlpha;
    vec3 c = mix(vColor, mix(vColor * 0.85, vec3(1.0), 0.65 * uDark), core);
    gl_FragColor = vec4(c, a);
  }
`;

const auraFrag = /* glsl */ `
  varying vec2 vUv;
  uniform float uDark;
  uniform float uP;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float spread = 1.4 + sin(clamp(uP, 0.0, 2.0) * 1.5708) * 0.6;
    float g = exp(-d * d * 6.0 / spread);
    vec3 c = mix(vec3(0.55, 0.78, 0.98), vec3(0.22, 0.45, 0.95), uDark);
    gl_FragColor = vec4(c, g * mix(0.5, 0.35, uDark));
  }
`;

function unit(): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

export function createParticleScene(canvas: HTMLCanvasElement, opts: { lite: boolean; dark: boolean }): ParticleScene {
  const { lite } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const pr = lite ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 6);
  const group = new THREE.Group();
  scene.add(group);

  const n = lite ? 5000 : 14000;
  const A = new Float32Array(n * 3);
  const B = new Float32Array(n * 3);
  const C = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const size = new Float32Array(n);
  const centers = Array.from({ length: MODELS }, (_, m) => {
    const a = (m / MODELS) * Math.PI * 2 + Math.PI / 2;
    return new THREE.Vector3(Math.cos(a) * 1.75, Math.sin(a) * 1.15, Math.sin(a * 2) * 0.4);
  });
  const golden = Math.PI * (3 - Math.sqrt(5));
  const v = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    // A: a dense bright core with a thin halo of dust
    const r = Math.random() < 0.82 ? 0.04 + 0.32 * Math.pow(Math.random(), 1.6) : 0.4 + 2.1 * Math.pow(Math.random(), 2);
    v.copy(unit()).multiplyScalar(r).toArray(A, i * 3);

    // B: five model clusters, each a small orb with a tilted ring, linked to the center by streams
    const c = centers[i % MODELS];
    const roll = Math.random();
    if (roll < 0.16) {
      const t = Math.random();
      v.copy(c).multiplyScalar(t).add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(0.03 + 0.04 * Math.sin(t * Math.PI)));
    } else if (roll < 0.38) {
      const a = Math.random() * Math.PI * 2;
      const rr = 0.42 + gauss() * 0.03;
      v.set(Math.cos(a) * rr, Math.sin(a) * rr * 0.3, Math.sin(a) * rr).applyAxisAngle(new THREE.Vector3(0, 0, 1), (i % MODELS) * 0.6).add(c);
    } else {
      v.copy(unit()).multiplyScalar(0.24 * Math.pow(Math.random(), 0.7)).add(c);
    }
    v.toArray(B, i * 3);

    // C: one sphere (an even Fibonacci shell) with a small bright heart
    if (Math.random() < 0.12) {
      v.copy(unit()).multiplyScalar(0.35 * Math.pow(Math.random(), 1.5));
    } else {
      const y = 1 - (i / (n - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = golden * i;
      v.set(Math.cos(th) * rad, y, Math.sin(th) * rad).multiplyScalar(1.3 + gauss() * 0.03);
    }
    v.toArray(C, i * 3);

    seed[i] = Math.random();
    size[i] = 0.55 + Math.pow(Math.random(), 5) * 2.4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(C, 3));
  geo.setAttribute("aA", new THREE.BufferAttribute(A, 3));
  geo.setAttribute("aB", new THREE.BufferAttribute(B, 3));
  geo.setAttribute("aC", new THREE.BufferAttribute(C, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

  const uniforms = {
    uP: { value: 0 },
    uT: { value: 0 },
    uSize: { value: lite ? 44 : 54 },
    uPr: { value: pr },
    uDark: { value: opts.dark ? 1 : 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  group.add(points);

  const auraMat = new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: auraFrag,
    uniforms: { uDark: uniforms.uDark, uP: uniforms.uP },
    transparent: true,
    depthWrite: false,
  });
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), auraMat);
  aura.position.z = -1.5;
  aura.renderOrder = -1;
  scene.add(aura);

  const setDark = (dark: boolean) => {
    uniforms.uDark.value = dark ? 1 : 0;
    mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    auraMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.needsUpdate = true;
    auraMat.needsUpdate = true;
  };
  setDark(opts.dark);

  // Wide screens put the captions on the left, so the cloud sits right of center; narrow ones center it between the title and the steps.
  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const wide = aspect > 1.15;
    const fit = wide ? 1 : Math.min(1, (aspect * halfH) / 2.0);
    group.scale.setScalar(fit);
    group.position.set(wide ? halfH * aspect * 0.32 : 0, 0, 0);
    aura.position.x = group.position.x;
    aura.position.y = group.position.y;
  };
  resize();

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let last = 0;
  const frame = (now: number, progress: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    uniforms.uT.value = now / 1000;
    uniforms.uP.value = progress;
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);
    group.rotation.y = now * 0.00006 + progress * 0.9 + pointer.sx * 0.25;
    group.rotation.x = 0.12 - pointer.sy * 0.18;
    renderer.render(scene, camera);
  };

  return {
    frame,
    setDark,
    setPointer: (x, y) => { pointer.x = x; pointer.y = y; },
    resize,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      aura.geometry.dispose();
      auraMat.dispose();
      renderer.dispose();
    },
  };
}
