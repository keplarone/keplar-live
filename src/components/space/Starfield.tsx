"use client";

import { useEffect, useRef } from "react";
import { isPhone } from "@/lib/fx/lite";
import { isMotionPaused } from "./motion-pause";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

/**
 * The Space Studio universe. Scrolling the page is a journey: the camera starts in open space, flies forward through a star
 * field, along the Milky Way, and arrives inside a dense star cluster at the end of the page. Stars are hard discs.
 *
 * - Stars: one THREE.Points spread along the flight path. Colours follow stellar temperature (blue-white O/B stars are rare,
 *   orange and red K/M stars are common) and brightness follows a power law. Each star is a hard disc.
 * - Milky Way: a second, finer Points layer packed around a tilted plane, far behind everything.
 * - Cluster: a dense globular cluster of stars the camera flies into at the end of the scroll (no planets).
 * - Shooting stars: thin streak quads in a screen-space overlay.
 *
 * Budget: DPR capped at 2, ≤ 40 fps, pauses when the tab is hidden or the canvas is off screen. Reduced motion and phones
 * (isPhone, 640px and narrower) draw one still frame (no twinkle, drift, flight or parallax). The canvas is fixed behind the page with pointer-events: none.
 */

const FPS = 40;
const PATH = 1100; // how far the camera travels from the top of the page to the bottom
const FIELD = { w: 420, h: 280, near: 10, far: PATH + 420 };

// Stellar classes: colour (approximate blackbody), share of stars, brightness multiplier.
const CLASSES: { c: string; share: number; lum: number }[] = [
  { c: "#9bb0ff", share: 0.03, lum: 2.2 }, // O/B blue
  { c: "#aabfff", share: 0.07, lum: 1.7 }, // A blue-white
  { c: "#cad7ff", share: 0.12, lum: 1.35 }, // F white
  { c: "#f8f7ff", share: 0.2, lum: 1.15 }, // white
  { c: "#fff4ea", share: 0.18, lum: 1.0 }, // G yellow-white
  { c: "#ffe2b8", share: 0.16, lum: 0.9 }, // K orange
  { c: "#ffc58a", share: 0.14, lum: 0.8 }, // K/M orange
  { c: "#ff9f7a", share: 0.1, lum: 0.75 }, // M red
];
function stellar(): { color: Color; lum: number } {
  let r = Math.random();
  for (const k of CLASSES) if ((r -= k.share) <= 0) return { color: new Color(k.c), lum: k.lum };
  return { color: new Color("#ffffff"), lum: 1 };
}

const STAR_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uMotion;
  uniform float uPixelRatio;
  uniform float uScale;
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vBright;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    // Fade in from the far end and out right before the camera passes, so stars never pop.
    float fade = smoothstep(${FIELD.far.toFixed(1)}, ${(FIELD.far * 0.7).toFixed(1)}, dist) * smoothstep(1.0, 12.0, dist);
    gl_PointSize = clamp(aSize * uPixelRatio * (uScale / dist), 1.0, 26.0 * uPixelRatio);
    vColor = aColor * fade;
    vBright = aSize;
    vTwinkle = mix(1.0, 0.82 + 0.18 * sin(uTime * (1.3 + aPhase * 2.0) + aPhase * 40.0), uMotion);
  }
`;
const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vBright;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (length(c) > 0.42) discard;
    gl_FragColor = vec4(vColor * vTwinkle, 1.0);
  }
`;

const STREAK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const STREAK_FRAGMENT = /* glsl */ `
  uniform float uLife;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    // uv.x: 0 = tail, 1 = head. uv.y: across the streak.
    float across = step(0.38, 1.0 - abs(vUv.y - 0.5) * 2.0);
    float along = step(0.08, vUv.x);
    float a = along * across * uLife;
    if (a < 0.04) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

type Streak = { mesh: Mesh; mat: ShaderMaterial; x: number; y: number; vx: number; vy: number; len: number; age: number; max: number };

export default function Starfield() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Phones draw one still frame too, like reduced motion: a calm star field behind the text, no per-frame work while scrolling.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || isPhone();
    const mobile = window.matchMedia("(max-width: 700px)").matches;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    } catch {
      return; // No WebGL: the black page background stays.
    }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(62, 1, 0.5, 2600);
    const world = new Group();
    scene.add(world);
    const disposers: (() => void)[] = [];

    // ---- stars along the flight path ----
    const count = mobile ? 5_000 : Math.min(15_000, Math.max(10_000, Math.round((window.innerWidth * window.innerHeight) / 95)));
    const sPos = new Float32Array(count * 3), sCol = new Float32Array(count * 3), sSize = new Float32Array(count), sPhase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      sPos[i * 3] = (Math.random() - 0.5) * FIELD.w;
      sPos[i * 3 + 1] = (Math.random() - 0.5) * FIELD.h;
      sPos[i * 3 + 2] = -(FIELD.near + Math.random() * (FIELD.far - FIELD.near));
      const { color, lum } = stellar();
      // Power-law magnitudes: most stars faint, about 1 in 150 very bright.
      const m = Math.pow(Math.random(), 7.5);
      const size = (1.6 + m * 15) * lum;
      const bright = 0.55 + Math.min(1, m * 6) * 0.9;
      sCol[i * 3] = color.r * bright; sCol[i * 3 + 1] = color.g * bright; sCol[i * 3 + 2] = color.b * bright;
      sSize[i] = size;
      sPhase[i] = Math.random();
    }
    const starGeo = new BufferGeometry();
    starGeo.setAttribute("position", new BufferAttribute(sPos, 3));
    starGeo.setAttribute("aColor", new BufferAttribute(sCol, 3));
    starGeo.setAttribute("aSize", new BufferAttribute(sSize, 1));
    starGeo.setAttribute("aPhase", new BufferAttribute(sPhase, 1));
    const starMat = new ShaderMaterial({
      vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uMotion: { value: reduced ? 0 : 1 }, uPixelRatio: { value: pixelRatio }, uScale: { value: 300 } },
      transparent: true, depthWrite: false, blending: NormalBlending,
    });
    const stars = new Points(starGeo, starMat);
    stars.frustumCulled = false;
    world.add(stars);
    disposers.push(() => { starGeo.dispose(); starMat.dispose(); });

    // ---- Milky Way: a dense band of fine stars far behind, rotated across the sky ----
    const band = new Group();
    band.position.z = -PATH - 900;
    band.rotation.z = -0.42;
    const bandCount = mobile ? 6_000 : 14_000;
    const bPos = new Float32Array(bandCount * 3), bCol = new Float32Array(bandCount * 3), bSize = new Float32Array(bandCount), bPhase = new Float32Array(bandCount);
    for (let i = 0; i < bandCount; i++) {
      // Gaussian-ish thickness around the band's centre line.
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.9;
      bPos[i * 3] = (Math.random() - 0.5) * 3200;
      bPos[i * 3 + 1] = g * 260;
      bPos[i * 3 + 2] = (Math.random() - 0.5) * 300;
      const { color } = stellar();
      const k = 0.35 + Math.random() * 0.5;
      bCol[i * 3] = color.r * k; bCol[i * 3 + 1] = color.g * k; bCol[i * 3 + 2] = color.b * k;
      bSize[i] = 1.4 + Math.random() * 2.2;
      bPhase[i] = Math.random();
    }
    const bandGeo = new BufferGeometry();
    bandGeo.setAttribute("position", new BufferAttribute(bPos, 3));
    bandGeo.setAttribute("aColor", new BufferAttribute(bCol, 3));
    bandGeo.setAttribute("aSize", new BufferAttribute(bSize, 1));
    bandGeo.setAttribute("aPhase", new BufferAttribute(bPhase, 1));
    const bandMat = starMat.clone();
    bandMat.uniforms.uScale = { value: 2600 };
    const bandPoints = new Points(bandGeo, bandMat);
    bandPoints.frustumCulled = false;
    band.add(bandPoints);
    disposers.push(() => { bandGeo.dispose(); bandMat.dispose(); });
    world.add(band);

    // ---- the cluster at the end of the journey: a dense ball of stars the camera flies into ----
    const clusterCount = mobile ? 2_500 : 6_000;
    const cPos = new Float32Array(clusterCount * 3), cCol = new Float32Array(clusterCount * 3), cSize = new Float32Array(clusterCount), cPhase = new Float32Array(clusterCount);
    for (let i = 0; i < clusterCount; i++) {
      // Denser toward the centre (a globular cluster's light falls off with radius).
      const r = Math.pow(Math.random(), 2.2) * 120;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      cPos[i * 3] = 30 + r * Math.sin(ph) * Math.cos(th);
      cPos[i * 3 + 1] = -20 + r * Math.sin(ph) * Math.sin(th) * 0.8;
      cPos[i * 3 + 2] = -PATH - 140 + r * Math.cos(ph);
      const { color, lum } = stellar();
      const m = Math.pow(Math.random(), 5);
      const k = 0.6 + m * 1.2;
      cCol[i * 3] = color.r * k; cCol[i * 3 + 1] = color.g * k; cCol[i * 3 + 2] = color.b * k;
      cSize[i] = (1.8 + m * 10) * lum;
      cPhase[i] = Math.random();
    }
    const clusterGeo = new BufferGeometry();
    clusterGeo.setAttribute("position", new BufferAttribute(cPos, 3));
    clusterGeo.setAttribute("aColor", new BufferAttribute(cCol, 3));
    clusterGeo.setAttribute("aSize", new BufferAttribute(cSize, 1));
    clusterGeo.setAttribute("aPhase", new BufferAttribute(cPhase, 1));
    const cluster = new Points(clusterGeo, starMat);
    cluster.frustumCulled = false;
    world.add(cluster);
    disposers.push(() => clusterGeo.dispose());

    // ---- shooting stars in a screen-space overlay ----
    const overlay = new Scene();
    const ortho = new OrthographicCamera(0, 1, 1, 0, -1, 1);
    const streakGeo = new PlaneGeometry(1, 1);
    streakGeo.translate(0.5, 0, 0); // pivot at the tail
    const streaks: Streak[] = [];
    const spawnStreak = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const angle = (-155 - Math.random() * 30) * (Math.PI / 180); // falling to the left
      const speed = (0.9 + Math.random() * 0.8) * Math.max(w, h);
      const mat = new ShaderMaterial({
        vertexShader: STREAK_VERTEX, fragmentShader: STREAK_FRAGMENT,
        uniforms: { uLife: { value: 0 }, uColor: { value: new Color(Math.random() < 0.7 ? "#cfe0ff" : "#ffe6c4") } },
        transparent: true, depthWrite: false, blending: NormalBlending,
      });
      const mesh = new Mesh(streakGeo, mat);
      overlay.add(mesh);
      streaks.push({ mesh, mat, x: w * (0.3 + Math.random() * 0.75), y: h * (0.55 + Math.random() * 0.45), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, len: 120 + Math.random() * 180, age: 0, max: 0.55 + Math.random() * 0.5 });
    };
    const dropStreak = (k: number) => {
      const s = streaks[k]!;
      overlay.remove(s.mesh);
      s.mat.dispose();
      streaks.splice(k, 1);
    };
    disposers.push(() => { while (streaks.length) dropStreak(streaks.length - 1); streakGeo.dispose(); });

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      ortho.left = 0; ortho.right = w; ortho.top = h; ortho.bottom = 0;
      ortho.updateProjectionMatrix();
    };
    resize();

    // ---- journey: scroll progress drives the flight; the pointer adds parallax ----
    const progress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0, p: reduced ? 0 : progress() };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const place = (t: number) => {
      // Ease the flight so the last stretch (entering the cluster) slows down.
      const p = 1 - Math.pow(1 - eased.p, 1.6);
      camera.position.set(eased.x * 6, -eased.y * 4, -p * PATH + Math.sin(t * 0.05) * 2);
      camera.lookAt(eased.x * 2, -eased.y * 1.5 - p * 18, camera.position.z - 100);
      camera.rotation.z += Math.sin(t * 0.02) * 0.01;
      cluster.rotation.z = t * 0.004;
    };

    let raf = 0, last = 0, running = false, visible = true;
    let nextStreak = 2 + Math.random() * 3;
    const draw = () => {
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(overlay, ortho);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / FPS) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const t = (starMat.uniforms.uTime!.value += dt);
      bandMat.uniforms.uTime!.value = t;
      eased.x += (target.x - eased.x) * 0.05;
      eased.y += (target.y - eased.y) * 0.05;
      eased.p += (progress() - eased.p) * 0.07;
      place(t);

      nextStreak -= dt;
      if (nextStreak <= 0 && streaks.length < 2) {
        spawnStreak();
        nextStreak = 2.5 + Math.random() * 5.5;
      }
      for (let k = streaks.length - 1; k >= 0; k--) {
        const s = streaks[k]!;
        s.age += dt;
        const p = s.age / s.max;
        if (p >= 1) { dropStreak(k); continue; }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const len = s.len * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, p * 1.4)));
        // The quad's pivot is its tail; place the tail behind the head along the direction of travel.
        const ang = Math.atan2(s.vy, s.vx);
        s.mesh.position.set(s.x - Math.cos(ang) * len, s.y - Math.sin(ang) * len, 0);
        s.mesh.rotation.z = ang;
        s.mesh.scale.set(len, 2.2 * pixelRatio, 1);
        s.mat.uniforms.uLife!.value = Math.sin(Math.PI * p);
      }
      draw();
    };
    const start = () => {
      if (running || reduced || document.hidden || !visible || isMotionPaused()) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    const onResize = () => { resize(); if (!running) { place(starMat.uniforms.uTime!.value); draw(); } };
    const onVisibility = () => (document.hidden ? stop() : start());
    // The site's pause control (MotionToggle): the flight holds its current frame, and picks up again on play.
    const onMotion = () => (isMotionPaused() ? stop() : start());
    window.addEventListener("space:motion", onMotion);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) start(); else stop(); });
    io.observe(canvas);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

    place(0);
    if (reduced) draw();
    else start();

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("space:motion", onMotion);
      window.removeEventListener("pointermove", onPointer);
      for (const d of disposers) d();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "#000" }} />;
}
