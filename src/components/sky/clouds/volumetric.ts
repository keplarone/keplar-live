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
  const hash33 = wgslFn(`
fn hash33(p: vec3<f32>) -> vec3<f32> {
  let p3 = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
  let q = p3 + vec3<f32>(dot(p3, p3.yzx + 33.33));
  return fract((q.xxy + q.yzz) * q.zyx);
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
  const worley = wgslFn(`
fn worley(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  var m = 1.0;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let g = vec3<f32>(f32(x), f32(y), f32(z));
        let o = hash33(i + g);
        let r = g + o - f;
        m = min(m, dot(r, r));
      }
    }
  }
  return clamp(sqrt(m), 0.0, 1.0);
}`, [asInclude(hash33)]);
  const density = wgslFn(`
fn density(p: vec3<f32>, time: f32, lite: f32) -> f32 {
  let w = p + vec3<f32>(time * 0.11, 0.0, time * 0.025);
  let base = smoothstep(0.2, 0.62, p.y) * smoothstep(1.65, 0.95, p.y);
  let shape = fbm(w * 0.72);
  var detail = 0.0;
  if (lite < 0.5) {
    detail = fbm(w * 2.1 + vec3<f32>(5.1, 1.4, 2.2));
  }
  let erode = worley(w * 1.35);
  var d = smoothstep(0.46, 0.7, shape * 0.7 + detail * 0.3 - (1.0 - erode) * 0.22);
  d = d * base;
  let sheet = smoothstep(0.4, 0.75, p.y) * smoothstep(1.2, 0.8, p.y);
  let sheetN = smoothstep(0.5, 0.66, fbm(w * vec3<f32>(0.42, 1.3, 0.42)));
  d = max(d, sheetN * sheet * 0.55);
  let high = smoothstep(1.75, 1.95, p.y) * smoothstep(2.4, 2.1, p.y);
  let wisp = smoothstep(0.6, 0.8, fbm(vec3<f32>(w.x * 0.32, w.y * 1.8, w.z * 0.32)));
  return d + wisp * high * 0.22;
}`, [asInclude(fbm), asInclude(worley)]);
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
    let den = density(p, time, 0.0);
    if (den > 0.015) {
      var lightAcc = 0.0;
      var lp = p;
      let ldt = 0.22;
      for (var j = 0; j < 4; j++) {
        lp = lp + sun * ldt;
        lightAcc = lightAcc + density(lp, time, 1.0) * ldt;
      }
      let beer = exp(-lightAcc * 1.7);
      let absorb = den * 1.25 * dt;
      let contrib = (1.0 - exp(-absorb)) * beer;
      col = col + transmittance * contrib * mix(shadow, lit, beer);
      transmittance = transmittance * exp(-absorb);
    }
    t = t + dt;
  }
  col = col + sky * transmittance;
  let hx = abs(uv.x - 0.5);
  let hero = smoothstep(0.34, 0.1, hx) * smoothstep(0.4, 0.6, uv.y) * smoothstep(0.98, 0.76, uv.y);
  let nav = smoothstep(0.84, 0.94, uv.y);
  col = mix(col, sky, hero * 0.9 * (1.0 - nav));
  // The march accumulates low in the frame, so a clear night reads as an empty field behind the headline.
  // These banks sit at the sides and under the top bar. The hero mix above keeps the title on the sky.
  let left = length((uv - vec2<f32>(0.14, 0.78)) * vec2<f32>(1.2, 2.6));
  let right = length((uv - vec2<f32>(0.86, 0.7)) * vec2<f32>(1.05, 2.3));
  let top = length((uv - vec2<f32>(0.5, 0.93)) * vec2<f32>(1.8, 4.0));
  let banks = smoothstep(0.62, 0.16, left) + smoothstep(0.58, 0.14, right) + smoothstep(0.5, 0.1, top) * 0.7;
  let deck = clamp(cover, 0.55, 1.0);
  col = mix(col, mix(shadow, lit, 0.78), clamp(banks, 0.0, 1.0) * deck * (1.0 - hero));
  let bodyP = uv - vec2<f32>(0.72, 0.8);
  let bodyD = length(bodyP * vec2<f32>(1.0, 1.35));
  let disc = smoothstep(0.046, 0.018, bodyD);
  let edge = smoothstep(0.085, 0.04, bodyD) * 0.4;
  let bodyVis = journey * (1.0 - smoothstep(0.02, 0.42, altitude));
  let bodyCol = mix(vec3<f32>(1.0, 0.96, 0.89), vec3<f32>(0.84, 0.87, 0.95), step(0.5, dark));
  col = mix(col, bodyCol, (disc + edge * (1.0 - disc)) * bodyVis);
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
  let streak = fract(uv.x * 22.0 + uv.y * 1.6 + time * fall);
  let rainA = smoothstep(0.04, 0.0, abs(streak - 0.5)) * smoothstep(0.0, 0.2, uv.y) * 0.35;
  if (fall > 1.2) { col = mix(col, vec3<f32>(0.55, 0.62, 0.7), rainA); }
  else if (fall > 0.2) {
    let flake = fract(uv.x * 14.0 + sin(uv.y * 9.0 + time * fall));
    let snowA = smoothstep(0.06, 0.0, length(vec2<f32>(flake - 0.5, fract(uv.y * 11.0 - time * fall * 0.2) - 0.5))) * 0.55;
    col = mix(col, vec3<f32>(0.94, 0.96, 0.98), snowA);
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
  renderer.setClearColor(new Color(opts.dark ? 0x2a4068 : 0x4f86c8), 1);
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
    const crush = new Color(themeDark ? "#243656" : "#8ea4b8");
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
      // Clear still keeps the side banks. Coverage only fills the deck in from there.
      cover.value = Math.max(0.55, Math.min(1, profile.coverage));
      paintLook(profile);
    },
    setJourney: (state) => {
      altitude.value = state.journey ? state.altitude : 0;
      journey.value = state.journey ? 1 : 0;
      ground.value = state.meadow;
      darkU.value = state.meadow === 1 ? 1 : themeDark ? 1 : 0;
      if (state.journey && !state.reduce) {
        const mul = 1 + Math.min(3, Math.max(0, state.scroll) / 900);
        if (fall.value > 0) fall.value = (lastProfile?.precip === "snow" ? 0.7 : 2.4) * mul;
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
