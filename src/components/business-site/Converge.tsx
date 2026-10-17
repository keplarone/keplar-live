"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Several models, one answer (the storefront's "Several models" tile): five streams of light, one per model, spiral in across
 * a tilted disc and merge into a single bright core that breathes as they arrive. Thousands of particles positioned on the GPU
 * (three.js, loaded only when the tile mounts). It renders only while on screen, tilts a little toward the pointer, holds one
 * still frame for reduced motion, and falls back to a CSS glow without WebGL.
 */

const STREAMS = 5;
const COUNT = 3400;

/** Particles: each belongs to a stream and loops from the rim to the core along a spiral, computed from time alone. */
const pointsVertex = /* glsl */ `
attribute float aStream;
attribute float aPhase;
attribute vec3 aRand;
uniform float uTime;
uniform float uAspect;
uniform float uDpr;
uniform vec2 uTilt;
varying float vAlpha;
varying vec3 vColor;

void main() {
  float s = fract(aPhase + uTime * (0.045 + 0.035 * aRand.x));
  float a0 = 6.28318 * aStream / ${STREAMS}.0 + uTime * 0.06;
  float r = 0.94 * pow(1.0 - s, 1.25);
  float ang = a0 + 2.7 * s + (aRand.y - 0.5) * 0.75 * (1.0 - s);
  r += (aRand.z - 0.5) * 0.15 * (1.0 - s);
  vec2 p = vec2(cos(ang), sin(ang)) * r;
  p.y *= 0.5 + 0.12 * uTilt.y;               // a disc seen from above at an angle
  p.x += uTilt.x * 0.05 * r;
  p.y += (aRand.x - 0.5) * 0.02 * (1.0 - s); // a little thickness
  gl_Position = vec4(p.x * 0.92 / max(uAspect, 1.0), p.y * 0.92 * min(uAspect, 1.0) * 1.5, 0.0, 1.0);

  float fade = smoothstep(0.0, 0.15, s) * (1.0 - smoothstep(0.86, 1.0, s));
  vAlpha = fade * (0.25 + 0.75 * aRand.x);
  // each stream has its own muted hue, washing to white as it nears the answer
  vec3 hue = 0.62 + 0.38 * cos(6.28318 * (aStream / ${STREAMS}.0 + vec3(0.0, 0.33, 0.67)));
  vColor = mix(mix(hue, vec3(0.85), 0.25), vec3(1.0), smoothstep(0.55, 1.0, s));
  gl_PointSize = (1.0 + 2.0 * aRand.x * aRand.x + 2.2 * s * s) * uDpr;
}
`;

const pointsFragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.32) discard;
  gl_FragColor = vec4(vColor, vAlpha);
}
`;

/** Background quad: faint orbit rings on the disc and the core, which breathes. */
const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const quadFragment = /* glsl */ `
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uTilt;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float aspect = uRes.x / uRes.y;
  p.x *= max(aspect, 1.0) / 0.92;
  p.y /= 0.92 * min(aspect, 1.0) * 1.5;
  p.x -= uTilt.x * 0.05 * length(p);
  vec2 q = vec2(p.x, p.y / (0.5 + 0.12 * uTilt.y));
  float r = length(q);
  float px = 3.0 / uRes.y;

  vec3 col = vec3(0.0);
  // rings: where the streams start, and two in between
  col += vec3(0.5) * 0.10 * smoothstep(px * 2.0, 0.0, abs(r - 0.94));
  col += vec3(0.5) * 0.06 * smoothstep(px * 2.0, 0.0, abs(r - 0.62));
  col += vec3(0.5) * 0.04 * smoothstep(px * 2.0, 0.0, abs(r - 0.34));
  col *= smoothstep(1.0, 0.0, r * 0.6);

  float d = length(p * vec2(1.0, 1.25));
  col += vec3(0.92) * step(d, 0.028);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function Converge({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    let cleanup = () => {};

    (async () => {
      let THREE: typeof import("three");
      try { THREE = await import("three"); } catch { if (!dead) setFallback(true); return; }
      if (dead) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
      } catch { setFallback(true); return; }
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText = "display:block;width:100%;height:100%";
      el.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const shared = { uTime: { value: 20 }, uTilt: { value: new THREE.Vector2(0, 0) } };

      const quadUniforms = { ...shared, uRes: { value: new THREE.Vector2(1, 1) } };
      const quadMaterial = new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: quadFragment, uniforms: quadUniforms, transparent: true, depthTest: false, blending: THREE.NormalBlending });
      const quadGeometry = new THREE.PlaneGeometry(2, 2);
      scene.add(new THREE.Mesh(quadGeometry, quadMaterial));

      const stream = new Float32Array(COUNT);
      const phase = new Float32Array(COUNT);
      const rand = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        stream[i] = i % STREAMS;
        phase[i] = Math.random();
        rand[i * 3] = Math.random();
        rand[i * 3 + 1] = Math.random();
        rand[i * 3 + 2] = Math.random();
      }
      const pointsGeometry = new THREE.BufferGeometry();
      pointsGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
      pointsGeometry.setAttribute("aStream", new THREE.BufferAttribute(stream, 1));
      pointsGeometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
      pointsGeometry.setAttribute("aRand", new THREE.BufferAttribute(rand, 3));
      const pointsUniforms = { ...shared, uAspect: { value: 1 }, uDpr: { value: 1 } };
      const pointsMaterial = new THREE.ShaderMaterial({ vertexShader: pointsVertex, fragmentShader: pointsFragment, uniforms: pointsUniforms, transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending });
      const points = new THREE.Points(pointsGeometry, pointsMaterial);
      points.frustumCulled = false;
      scene.add(points);

      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const draw = () => renderer.render(scene, camera);
      const resize = () => {
        const { width, height } = el.getBoundingClientRect();
        if (!width || !height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        quadUniforms.uRes.value.set(width * dpr, height * dpr);
        pointsUniforms.uAspect.value = width / height;
        pointsUniforms.uDpr.value = dpr;
        draw();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      // the disc tilts a little toward the pointer, easing back when it leaves
      const target = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        target.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        target.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      };
      const onLeave = () => { target.x = 0; target.y = 0; };
      const tile = el.closest("article") ?? el;
      tile.addEventListener("pointermove", onMove as EventListener);
      tile.addEventListener("pointerleave", onLeave);

      let frame = 0;
      let last = performance.now();
      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        shared.uTime.value += dt;
        const tilt = shared.uTilt.value;
        tilt.x += (target.x - tilt.x) * Math.min(1, dt * 3);
        tilt.y += (target.y - tilt.y) * Math.min(1, dt * 3);
        draw();
        frame = requestAnimationFrame(loop);
      };
      const start = () => { if (!frame && !still) { last = performance.now(); frame = requestAnimationFrame(loop); } };
      const stop = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } };
      const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.05 });
      io.observe(el);

      cleanup = () => {
        stop();
        io.disconnect();
        ro.disconnect();
        tile.removeEventListener("pointermove", onMove as EventListener);
        tile.removeEventListener("pointerleave", onLeave);
        quadGeometry.dispose();
        quadMaterial.dispose();
        pointsGeometry.dispose();
        pointsMaterial.dispose();
        renderer.dispose();
        canvas.remove();
      };
      if (dead) cleanup();
    })();

    return () => { dead = true; cleanup(); };
  }, []);

  return <div ref={host} className={className} data-fallback={fallback || undefined} />;
}
