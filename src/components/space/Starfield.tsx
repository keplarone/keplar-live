"use client";

import { useEffect, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, LineSegments, PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer } from "three";

/**
 * Space Studio's background: one THREE.Points (a BufferGeometry, not a mesh per star) in a deep box in front of the camera.
 * Stars sit in three depth bands, so drift, mouse parallax and scroll parallax all move near stars more than far ones.
 * Twinkle and drift run in the vertex shader from one time uniform; a rare shooting star is a two-vertex line.
 *
 * Budget: device pixel ratio capped at 2, at most 40 fps, ~12,000 stars on a desktop window and ~3,000 on a phone.
 * The loop stops when the tab is hidden or the canvas is off screen. With reduced motion it draws one still frame:
 * no twinkle, no drift, no parallax. The canvas is fixed, behind everything (z-index -1) and ignores the pointer.
 */

const FPS = 40;
const BOX = { w: 240, h: 160, near: 8, far: 200 };
const BANDS = [
  { share: 0.62, near: 120, far: BOX.far, size: [1.6, 3.2] },
  { share: 0.3, near: 45, far: 120, size: [2, 3.8] },
  { share: 0.08, near: BOX.near, far: 45, size: [2.2, 4.4] },
] as const;

// Weighted star colours: mostly white and blue-white, with clear blue, gold, orange, red and violet stars.
const PALETTE: [string, number][] = [
  ["#ffffff", 24], ["#e2e9ff", 12], ["#a9c8ff", 12], ["#6b95ff", 7], ["#86e6ff", 4],
  ["#fff2cf", 9], ["#ffd77a", 8], ["#ffaa55", 6], ["#ff7255", 4], ["#ff5c86", 3],
  ["#c79aff", 6], ["#9576ff", 5],
];
const TOTAL = PALETTE.reduce((s, [, w]) => s + w, 0);
function pick(): Color {
  let r = Math.random() * TOTAL;
  for (const [hex, w] of PALETTE) if ((r -= w) <= 0) return new Color(hex);
  return new Color("#ffffff");
}

const STAR_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSpeed;
  attribute float aPhase;
  uniform float uTime;
  uniform float uMotion;
  uniform float uHeight;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uTime * aSpeed * uMotion + uHeight * 0.5, uHeight) - uHeight * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uPixelRatio * (260.0 / -mv.z), 1.2, 16.0 * uPixelRatio);
    vColor = aColor;
    vTwinkle = mix(1.0, 0.72 + 0.28 * sin(uTime * (0.5 + aPhase) + aPhase * 6.2831), uMotion);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float core = pow(smoothstep(0.5, 0.0, length(c)), 1.8);
    float spikes = max(0.0, 1.0 - abs(c.x) * 26.0) * smoothstep(0.5, 0.0, abs(c.y))
                 + max(0.0, 1.0 - abs(c.y) * 26.0) * smoothstep(0.5, 0.0, abs(c.x));
    float a = (core + spikes * 0.16) * vTwinkle;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const METEOR_VERTEX = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const METEOR_FRAGMENT = /* glsl */ `
  uniform float uLife;
  uniform vec3 uColor;
  varying float vT;
  void main() { float a = (1.0 - vT) * uLife; gl_FragColor = vec4(uColor * a, a); }
`;

type Meteor = { line: LineSegments; mat: ShaderMaterial; vx: number; vy: number; x: number; y: number; z: number; len: number; age: number; max: number };

export default function Starfield() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
    } catch {
      return; // No WebGL: the black page background stays.
    }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 1);
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 1, 0.1, 400);
    const field = new Group();
    scene.add(field);

    const mobile = window.matchMedia("(max-width: 700px)").matches;
    const count = mobile ? 3_000 : Math.min(15_000, Math.max(8_000, Math.round((window.innerWidth * window.innerHeight) / 105)));
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const speed = new Float32Array(count);
    const phase = new Float32Array(count);
    let i = 0;
    for (const band of BANDS) {
      const n = band === BANDS[BANDS.length - 1] ? count - i : Math.round(count * band.share);
      for (let k = 0; k < n; k++, i++) {
        pos[i * 3] = (Math.random() - 0.5) * BOX.w;
        pos[i * 3 + 1] = (Math.random() - 0.5) * BOX.h;
        pos[i * 3 + 2] = -(band.near + Math.random() * (band.far - band.near));
        const c = pick();
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        const bright = Math.random();
        size[i] = bright > 0.994 ? 9 + Math.random() * 5 : bright > 0.96 ? 4.5 + Math.random() * 2.5 : band.size[0] + Math.random() * (band.size[1] - band.size[0]);
        speed[i] = 0.8 + Math.random() * 1.2;
        phase[i] = Math.random();
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new BufferAttribute(col, 3));
    geo.setAttribute("aSize", new BufferAttribute(size, 1));
    geo.setAttribute("aSpeed", new BufferAttribute(speed, 1));
    geo.setAttribute("aPhase", new BufferAttribute(phase, 1));
    const mat = new ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: { uTime: { value: Math.random() * 500 }, uMotion: { value: reduced ? 0 : 1 }, uHeight: { value: BOX.h }, uPixelRatio: { value: pixelRatio } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const stars = new Points(geo, mat);
    stars.frustumCulled = false;
    field.add(stars);

    const meteors: Meteor[] = [];
    const spawnMeteor = () => {
      const z = -(35 + Math.random() * 60);
      const half = Math.tan((camera.fov * Math.PI) / 360) * -z;
      const angle = (205 + Math.random() * 25) * (Math.PI / 180);
      const v = 60 + Math.random() * 40;
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
      g.setAttribute("aT", new BufferAttribute(new Float32Array([0, 1]), 1));
      const m = new ShaderMaterial({ vertexShader: METEOR_VERTEX, fragmentShader: METEOR_FRAGMENT, uniforms: { uLife: { value: 0 }, uColor: { value: pick().lerp(new Color("#ffffff"), 0.6) } }, transparent: true, depthWrite: false, blending: AdditiveBlending });
      const line = new LineSegments(g, m);
      line.frustumCulled = false;
      scene.add(line);
      meteors.push({ line, mat: m, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, x: (Math.random() - 0.1) * half * camera.aspect * 1.4, y: half * (0.2 + Math.random() * 0.8), z, len: 0.15 + Math.random() * 0.1, age: 0, max: 0.9 + Math.random() * 0.5 });
    };
    const dropMeteor = (k: number) => {
      const m = meteors[k]!;
      scene.remove(m.line);
      m.line.geometry.dispose();
      m.mat.dispose();
      meteors.splice(k, 1);
    };

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    resize();

    // Parallax targets: the pointer (desktop) and the scroll position, eased toward each frame.
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0, scroll: 0 };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    let raf = 0;
    let last = 0;
    let running = false;
    let visible = true;
    let nextMeteor = 6 + Math.random() * 8;

    const draw = () => renderer.render(scene, camera);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / FPS) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      mat.uniforms.uTime!.value += dt;

      eased.x += (target.x - eased.x) * 0.04;
      eased.y += (target.y - eased.y) * 0.04;
      eased.scroll += (window.scrollY - eased.scroll) * 0.08;
      camera.position.x = eased.x * 3;
      camera.position.y = -eased.y * 2 - eased.scroll * 0.012;
      field.rotation.z = Math.sin(mat.uniforms.uTime!.value * 0.01) * 0.02;

      nextMeteor -= dt;
      if (nextMeteor <= 0 && meteors.length < 1) {
        spawnMeteor();
        nextMeteor = 9 + Math.random() * 14;
      }
      for (let k = meteors.length - 1; k >= 0; k--) {
        const m = meteors[k]!;
        m.age += dt;
        const p = m.age / m.max;
        if (p >= 1) { dropMeteor(k); continue; }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const a = m.line.geometry.getAttribute("position") as BufferAttribute;
        a.setXYZ(0, m.x, m.y, m.z);
        a.setXYZ(1, m.x - m.vx * m.len, m.y - m.vy * m.len, m.z);
        a.needsUpdate = true;
        m.mat.uniforms.uLife!.value = Math.sin(Math.PI * p) * 0.85;
      }
      draw();
    };
    const start = () => {
      if (running || reduced || document.hidden || !visible) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onResize = () => { resize(); if (!running) draw(); };
    const onVisibility = () => (document.hidden ? stop() : start());
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) start(); else stop(); });
    io.observe(canvas);

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

    if (reduced) draw();
    else start();

    return () => {
      stop();
      io.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      while (meteors.length) dropMeteor(meteors.length - 1);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: "#000" }} />;
}
