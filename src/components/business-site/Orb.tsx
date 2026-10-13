"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small universe in a glass sphere (the storefront's "Several models" tile): violet nebula drifting through depth, stars at
 * three distances that parallax as it turns, and a thin glass rim that splits into colour at the edge. One full-tile quad with a
 * ray-traced fragment shader (three.js, loaded only when the tile mounts). It renders only while on screen, follows the pointer
 * a little, holds one still frame for reduced motion, and falls back to a CSS sphere without WebGL.
 */

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uTilt;
varying vec2 vUv;

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }

// Stars: one jittered point per 3D cell, a few lit, each twinkling at its own rate.
float stars(vec3 p, float scale, float size) {
  vec3 c = floor(p * scale);
  vec3 f = fract(p * scale);
  vec3 h = hash33(c);
  if (h.x < 0.55) return 0.0;
  float d = length(f - (0.2 + 0.6 * h));
  float tw = 0.65 + 0.35 * sin(uTime * (1.0 + 3.0 * h.y) + 6.283 * h.z);
  float core = smoothstep(size, 0.0, d);
  return (core * core * 1.6 + smoothstep(size * 2.6, 0.0, d) * 0.18) * tw * (0.45 + 0.55 * h.y);
}

void main() {
  float m = min(uRes.x, uRes.y);
  vec2 p = (vUv - 0.5) * uRes / (0.5 * m);
  const float R = 0.86;
  float px = 2.0 / m;
  float d = length(p);
  if (d > R + 0.06) { gl_FragColor = vec4(0.0); return; }

  float z = sqrt(max(R * R - d * d, 0.0));
  mat3 turn = rotY(uTime * 0.05 + uTilt.x * 0.35) * rotX(0.25 + uTilt.y * 0.25);

  // nebula: march through the sphere's depth
  vec3 col = vec3(0.012, 0.010, 0.028);
  float t0 = -z, t1 = z;
  for (int i = 0; i < 7; i++) {
    float t = mix(t1, t0, (float(i) + 0.5) / 7.0);
    vec3 q = turn * (vec3(p, t) / R);
    float n = fbm(q * 1.8 + vec3(0.0, uTime * 0.02, 0.0));
    float wisp = pow(smoothstep(0.38, 0.8, n), 1.8);
    float band = smoothstep(0.55, 0.0, abs(q.y + 0.35 * sin(q.x * 2.4 + 1.3) - 0.1));
    vec3 tint = mix(vec3(0.30, 0.26, 0.62), vec3(0.62, 0.42, 0.78), noise(q * 3.0 + 4.0));
    col += tint * wisp * (0.16 + 0.34 * band) * (z / R);
  }

  // stars at three depths (front, middle, far), so they parallax as the sphere turns
  vec3 front = turn * (vec3(p, z * 0.6) / R);
  vec3 mid = turn * (vec3(p, 0.0) / R);
  vec3 far = turn * (vec3(p, -z * 0.6) / R);
  float s = stars(front, 8.0, 0.13) * 1.2 + stars(mid + 7.3, 14.0, 0.15) * 0.9 + stars(far + 3.1, 26.0, 0.18) * 0.6;
  col += vec3(0.92, 0.94, 1.0) * s * smoothstep(0.0, 0.25, z / R);

  // glass: darker toward the edge, then a thin rim that splits into colour (chromatic aberration)
  float edge = 1.0 - z / R;
  col *= 1.0 - 0.75 * pow(edge, 2.0);
  float ang = atan(p.y, p.x);
  float speck = smoothstep(0.6, 0.9, noise(vec3(ang * 22.0, uTime * 0.4, 1.0))) + 0.5 * smoothstep(0.7, 0.95, noise(vec3(ang * 60.0, uTime * 0.6, 5.0)));
  vec3 rim = vec3(
    smoothstep(0.012, 0.0, abs(d - (R - 0.008))),
    smoothstep(0.012, 0.0, abs(d - (R - 0.016))),
    smoothstep(0.012, 0.0, abs(d - (R - 0.024)))
  );
  col += rim * (0.05 + 0.6 * speck) * vec3(1.0, 0.9, 1.15);
  col += vec3(0.75, 0.8, 1.0) * smoothstep(0.012, 0.0, abs(d - (R - 0.004))) * 0.18;

  // a soft reflection of light, top left
  vec2 hl = p - vec2(-0.32, 0.38);
  col += vec3(1.0) * 0.05 * smoothstep(0.42, 0.0, length(hl * vec2(1.0, 1.4)));

  float a = smoothstep(R + px, R - px, d);
  gl_FragColor = vec4(col * a, a);
}
`;

export function Orb({ className }: { className?: string }) {
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
      const uniforms = { uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 8 }, uTilt: { value: new THREE.Vector2(0, 0) } };
      const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthTest: false });
      const geometry = new THREE.PlaneGeometry(2, 2);
      scene.add(new THREE.Mesh(geometry, material));

      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const draw = () => renderer.render(scene, camera);
      const resize = () => {
        const { width, height } = el.getBoundingClientRect();
        if (!width || !height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
        renderer.setPixelRatio(dpr);
        renderer.setSize(width, height, false);
        uniforms.uRes.value.set(width * dpr, height * dpr);
        draw();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      // the sphere leans a little toward the pointer, easing back when it leaves
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
        uniforms.uTime.value += dt;
        const tilt = uniforms.uTilt.value;
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
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        canvas.remove();
      };
      if (dead) cleanup();
    })();

    return () => { dead = true; cleanup(); };
  }, []);

  return <div ref={host} className={className} data-fallback={fallback || undefined} />;
}
