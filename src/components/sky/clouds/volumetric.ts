/**
 * WebGPU volumetric clouds for the landing sky.
 *
 * The ray march, altitude envelope, FBM body and Worley erosion follow procedural-clouds-threejs
 * (Teaching Three.js series), MIT License. This port is WGSL through three's node materials
 * (`three/webgpu`), which three r170+ requires instead of a GLSL ShaderMaterial.
 * Lighting is Beer-Lambert absorption plus a short light march for self-shadowing.
 * Silver linings, god rays, bloom and additive glow are not used.
 */
import { Color, Mesh, MeshBasicNodeMaterial, NoToneMapping, OrthographicCamera, PlaneGeometry, Scene, WebGPURenderer } from "three/webgpu";
import { cloudPalette } from "./palette";
import { fallMultiplier } from "@/lib/sky/journey";
import type { SkyProfile } from "@/lib/sky/profile";
import type { CloudHandle } from "./webgl-clouds";

type Tsl = typeof import("three/webgpu").TSL;
type Include = { build(builder: unknown): void };
const asInclude = (fn: unknown) => fn as Include;

function buildShade(tsl: Tsl) {
  const { wgslFn } = tsl;
  const hash13 = wgslFn(`
fn hash13(p: vec3<f32>) -> f32 {
  return fract(sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453);
}`);
  const noise3 = wgslFn(`
fn noise3(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash13(i);
  let n100 = hash13(i + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash13(i + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash13(i + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash13(i + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash13(i + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash13(i + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash13(i + vec3<f32>(1.0, 1.0, 1.0));
  let nx00 = mix(n000, n100, u.x);
  let nx10 = mix(n010, n110, u.x);
  let nx01 = mix(n001, n101, u.x);
  let nx11 = mix(n011, n111, u.x);
  return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z);
}`, [asInclude(hash13)]);
  const fbm = wgslFn(`
fn fbm(p: vec3<f32>) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    v = v + a * noise3(q);
    q = q * 2.03 + vec3<f32>(1.7, 9.2, 3.1);
    a = a * 0.5;
  }
  return v;
}`, [asInclude(noise3)]);
  const bank = wgslFn(`
fn bank(p: vec2<f32>, c: vec2<f32>, r: vec2<f32>, n: f32) -> f32 {
  let q = (p - c) / r;
  let rad = 0.84 + (n - 0.5) * 0.32;
  return smoothstep(0.0, 0.13, rad - length(q));
}`);
  const density = wgslFn(`
fn density(p: vec3<f32>, time: f32, lite: f32, cover: f32) -> f32 {
  let drift = time * 0.012 * (0.65 + p.z * 0.06);
  let xz = p.xz + vec2<f32>(drift, drift * 0.08);
  let edgeN = fbm(vec3<f32>(xz * 1.25 + vec2<f32>(1.7, 4.2), 1.2));
  var detail = 0.55;
  if (lite < 0.5) {
    detail = fbm(vec3<f32>(xz * 2.35 + vec2<f32>(8.0, 2.0), 2.0));
  }
  var banks = 0.0;
  banks = max(banks, bank(xz, vec2<f32>(-2.7, 2.35), vec2<f32>(1.4, 1.05), edgeN));
  banks = max(banks, bank(xz, vec2<f32>(2.8, 3.45), vec2<f32>(1.5, 1.15), edgeN + 0.22));
  banks = max(banks, bank(xz, vec2<f32>(-2.9, 4.3), vec2<f32>(1.2, 0.9), edgeN + 0.38));
  let extra = smoothstep(0.18, 0.55, cover);
  banks = max(banks, bank(xz, vec2<f32>(2.95, 1.7), vec2<f32>(1.05, 0.72), edgeN + 0.12) * extra);
  banks = banks * smoothstep(0.95, 1.7, abs(p.x));
  let yh = clamp((p.y - 0.1) / 1.05, 0.0, 1.0);
  let profile = smoothstep(0.0, 0.07, yh) * smoothstep(1.0, 0.58, yh);
  return clamp(banks * profile * mix(0.86, 1.0, detail) * 1.4, 0.0, 1.0);
}`, [asInclude(bank), asInclude(fbm)]);
  const shade = wgslFn(`
fn cloudShade(uv: vec2<f32>, time: f32, aspect: f32, zenith: vec3<f32>, horizon: vec3<f32>, lit: vec3<f32>, shadow: vec3<f32>, altitude: f32, journey: f32, ground: f32, dark: f32, fall: f32, cover: f32) -> vec4<f32> {
  let uvn = uv * 2.0 - vec2<f32>(1.0, 1.0);
  let rd = normalize(vec3<f32>(uvn.x * aspect * 0.7, uvn.y * 0.46 + 0.36, 1.15));
  let ro = vec3<f32>(sin(time * 0.05) * 0.15, -0.02, -0.15);
  let bmin = vec3<f32>(-3.4, 0.35, 0.35);
  let bmax = vec3<f32>(3.4, 2.45, 7.2);
  let inv = 1.0 / (rd + vec3<f32>(0.0001, 0.0001, 0.0001));
  let t0 = (bmin - ro) * inv;
  let t1 = (bmax - ro) * inv;
  let tsm = min(t0, t1);
  let tbg = max(t0, t1);
  let tn = max(max(tsm.x, tsm.y), tsm.z);
  let tf = min(min(tbg.x, tbg.y), tbg.z);
  let skyT = clamp(rd.y * 0.9 + 0.25, 0.0, 1.0);
  let sky = mix(horizon, zenith, skyT);
  var missed = 0.0;
  if (tf < tn || tf < 0.0) {
    missed = 1.0;
  }
  let tNear = max(tn, 0.0);
  let steps = 22.0;
  let dt = (tf - tNear) / steps;
  let jitter = fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  var t = tNear + jitter * dt;
  var transmittance = 1.0;
  var col = vec3<f32>(0.0);
  let sun = normalize(vec3<f32>(0.4, 0.86, 0.26));
  if (missed > 0.5) {
    col = sky;
  }
  for (var i = 0; i < 22; i++) {
    if (missed > 0.5) {
      break;
    }
    if (transmittance < 0.03) {
      break;
    }
    let p = ro + rd * t;
    let den = density(p, time, 0.0, cover);
    if (den > 0.015) {
      var lightAcc = 0.0;
      var lp = p;
      let ldt = 0.22;
      for (var j = 0; j < 4; j++) {
        lp = lp + sun * ldt;
        lightAcc = lightAcc + density(lp, time, 1.0, cover) * ldt;
      }
      let beer = exp(-lightAcc * 0.85);
      let shade = clamp(beer * 0.62 + 0.38, 0.08, 1.0);
      let absorb = den * 3.2 * dt;
      let contrib = 1.0 - exp(-absorb);
      col = col + transmittance * contrib * mix(shadow, lit, shade);
      transmittance = transmittance * exp(-absorb);
    }
    t = t + dt;
  }
  col = col + sky * transmittance;
  let column = smoothstep(0.32, 0.16, abs(uv.x - 0.5));
  let heroRows = smoothstep(0.2, 0.42, uv.y);
  col = mix(col, sky, column * heroRows);
  let center = vec2<f32>(0.80, 0.82);
  let delta = uv - center;
  let pd = length(vec2<f32>(delta.x * aspect, delta.y));
  let rad = 0.016;
  let disc = smoothstep(rad + 0.0012, rad - 0.0004, pd);
  let bodyVis = 1.0 - smoothstep(0.02, 0.42, altitude);
  var bodyCol = vec3<f32>(1.0, 0.965, 0.89);
  if (dark > 0.5) {
    bodyCol = vec3<f32>(0.894, 0.918, 0.965);
    let craterP = vec2<f32>(delta.x * aspect, delta.y);
    let c1 = smoothstep(rad * 0.22, rad * 0.05, length(craterP - vec2<f32>(rad * 0.28, rad * 0.12))) * 0.16;
    let c2 = smoothstep(rad * 0.16, rad * 0.04, length(craterP - vec2<f32>(-rad * 0.22, -rad * 0.18))) * 0.1;
    bodyCol = bodyCol * (1.0 - c1 - c2);
  }
  col = mix(col, bodyCol, disc * bodyVis);
  let band = journey * smoothstep(0.5, 0.85, altitude) * smoothstep(0.82, 0.5, uv.y);
  var grass = vec3<f32>(0.33, 0.5, 0.27);
  if (ground > 2.5) { grass = vec3<f32>(0.9, 0.93, 0.95); }
  else if (ground > 1.5) { grass = vec3<f32>(0.16, 0.26, 0.16); }
  else if (ground > 0.5) { grass = vec3<f32>(0.07, 0.11, 0.08); }
  col = mix(col, grass, band);
  let fly = clamp((altitude - 0.12) / 0.62, 0.0, 1.0);
  if (journey > 0.5 && altitude > 0.08 && altitude < 0.82) {
    for (var b = 0; b < 4; b++) {
      let seed = (f32(b) + 0.5) / 4.0;
      let away = fly * (0.55 + seed * 0.45);
      let bx = 0.5 + (seed - 0.5) * 0.46;
      let by = 0.62 + seed * 0.08 - away * 0.12;
      let bs = 0.02 * (1.0 - away * 0.72);
      let flap = sin(time * 14.0 + f32(b)) * bs * 0.4;
      let bd = length((uv - vec2<f32>(bx, by + flap)) / vec2<f32>(bs * 2.2, bs));
      col = mix(col, vec3<f32>(0.16, 0.18, 0.22), smoothstep(1.0, 0.45, bd));
    }
  }
  // Screen-space specks. They fall down only; scroll never shifts them sideways or up.
  if (fall > 1.2) {
    for (var r = 0; r < 16; r++) {
      let s = fract(f32(r) * 0.173 + 0.11);
      let speed = mix(0.55, 1.25, fract(s * 4.1));
      let x = fract(s * 7.3);
      let y = fract(s * 3.7 - time * fall * 0.06 * speed);
      let len = mix(0.012, 0.026, fract(s * 9.2));
      let dx = (uv.x - x) * aspect;
      let dy = uv.y - y;
      let along = dy * 0.985 + dx * 0.17;
      let across = abs(dx * 0.985 - dy * 0.17);
      let drop = smoothstep(len, 0.0, abs(along - len * 0.5)) * smoothstep(0.0014, 0.0003, across);
      col = mix(col, vec3<f32>(0.62, 0.68, 0.74), drop * mix(0.15, 0.32, s));
    }
  } else if (fall > 0.2) {
    for (var n = 0; n < 22; n++) {
      let s = fract(f32(n) * 0.217 + 0.3);
      let x = fract(s * 5.1 + sin(time * 0.35 + s * 6.2) * 0.015);
      let y = fract(s * 2.7 - time * fall * 0.045);
      let sz = mix(0.0016, 0.0048, fract(s * 8.0));
      let d = length((uv - vec2<f32>(x, y)) * vec2<f32>(aspect, 1.0));
      let flake = smoothstep(sz, sz * 0.4, d);
      col = mix(col, vec3<f32>(0.94, 0.96, 0.98), flake * mix(0.3, 0.75, s));
    }
  }
  return vec4<f32>(col, 1.0);
}`, [asInclude(density)]);
  return shade;
}

export async function createVolumetric(canvas: HTMLCanvasElement, opts: { dark: boolean }): Promise<CloudHandle> {
  const tsl = (await import("three/webgpu")).TSL;
  const renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false, depth: false });
  renderer.toneMapping = NoToneMapping;
  await renderer.init();
  renderer.setClearColor(new Color(opts.dark ? 0x161e2c : 0x5d9be8), 1);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pal = cloudPalette(opts.dark);
  const time = tsl.uniform(0);
  const aspect = tsl.uniform(1);
  const zenith = tsl.uniform(new Color(pal.zenith));
  const horizon = tsl.uniform(new Color(pal.horizon));
  const lit = tsl.uniform(new Color(pal.lit));
  const shadow = tsl.uniform(new Color(pal.shadow));
  const altitude = tsl.uniform(0);
  const journey = tsl.uniform(0);
  const ground = tsl.uniform(0);
  const darkU = tsl.uniform(opts.dark ? 1 : 0);
  const fall = tsl.uniform(0);
  const cover = tsl.uniform(0.7);
  const shade = buildShade(tsl);
  const material = new MeshBasicNodeMaterial();
  material.toneMapped = false;
  material.fog = false;
  material.fragmentNode = shade({
    uv: tsl.uv(),
    time,
    aspect,
    zenith,
    horizon,
    lit,
    shadow,
    altitude,
    journey,
    ground,
    dark: darkU,
    fall,
    cover,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    const longest = Math.max(w, h) * dpr;
    const scale = longest > 1280 ? 1280 / longest : 1;
    renderer.setPixelRatio(dpr * scale);
    renderer.setSize(w, h, false);
    aspect.value = w / Math.max(1, h);
  };

  let disposed = false;
  let themeDark = opts.dark;
  let lastProfile: SkyProfile | undefined;
  const paintLook = (profile?: SkyProfile) => {
    const next = cloudPalette(themeDark);
    const gray = profile?.gray ?? 0;
    const z = new Color(next.zenith);
    const h = new Color(next.horizon);
    const l = new Color(next.lit);
    const s = new Color(next.shadow);
    // Rain greys the night sky toward a darker navy, not toward black.
    const crush = new Color(themeDark ? "#243044" : "#8ea4b8");
    renderer.setClearColor(themeDark ? 0x161e2c : 0x5d9be8, 1);
    (zenith.value as Color).copy(z).lerp(crush, gray * (themeDark ? 0.18 : 0.55));
    (horizon.value as Color).copy(h).lerp(s, gray * 0.12);
    (lit.value as Color).copy(l).lerp(s, gray * (themeDark ? 0.22 : 0.22));
    (shadow.value as Color).copy(s);
  };
  return {
    setDark: (dark) => {
      themeDark = dark;
      darkU.value = dark ? 1 : 0;
      paintLook(lastProfile);
    },
    setWeather: (profile) => {
      lastProfile = profile;
      const wet = profile.precip === "rain";
      fall.value = wet ? 2.4 : profile.precip === "snow" ? 0.7 : 0;
      // Grey weather (overcast, rain) adds the higher sheet. Clear keeps the handful only.
      cover.value = Math.min(1, Math.max(0, profile.gray));
      paintLook(profile);
    },
    setJourney: (state) => {
      altitude.value = state.journey ? state.altitude : 0;
      journey.value = state.journey ? 1 : 0;
      ground.value = state.meadow;
      darkU.value = state.meadow === 1 ? 1 : themeDark ? 1 : 0;
      if (fall.value > 0) {
        const mul = state.reduce ? 1 : fallMultiplier(state.scroll);
        fall.value = (lastProfile?.precip === "snow" ? 0.7 : 2.4) * mul;
      }
    },
    resize,
    frame: (seconds) => {
      if (disposed) return;
      time.value = seconds;
      renderer.render(scene, camera);
    },
    dispose: () => {
      disposed = true;
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
