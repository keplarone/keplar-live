"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { dotMaterial, disposeScene, fitRenderer, inkHex, loop, lowPower, recolor, reducedMotion, watchTheme, webglOk } from "./glow3d";
import s from "./ws.module.css";

/**
 * Glowing point field (white on dark, graphite on light) behind the workspace: a slow drifting slab of light with two faint rings. `energy` (0..1) is fed by real
 * build activity (events arriving) and only changes how fast and bright it moves; it never draws anything that isn't there.
 */
export function Backdrop({ energy }: { energy: { current: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !webglOk()) return;
    const still = reducedMotion();
    const N = lowPower() ? 220 : 520;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
    } catch {
      return; // no usable WebGL here: the page works without the animation
    }
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
    camera.position.set(0, 0, 9);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const alpha = new Float32Array(N);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      size[i] = 0.5 + Math.random() * 1.6;
      alpha[i] = 0.12 + Math.random() * 0.5;
      seed[i] = Math.random() * 6.28;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    const pts = new THREE.Points(geo, dotMaterial());
    scene.add(pts);
    const ringMat = new THREE.LineBasicMaterial({ color: inkHex(), transparent: true, opacity: 0.08 });
    const rings = [new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * 6.2832) * 5.2, Math.sin((i / 96) * 6.2832) * 5.2, 0))), ringMat), new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * 6.2832) * 7.4, Math.sin((i / 96) * 6.2832) * 7.4, 0))), ringMat)];
    rings.forEach((r, i) => { r.rotation.x = 1.15 - i * 0.3; scene.add(r); });
    let mx = 0;
    let my = 0;
    const onMove = (e: PointerEvent) => { mx = (e.clientX / window.innerWidth - 0.5) * 2; my = (e.clientY / window.innerHeight - 0.5) * 2; };
    if (!still) window.addEventListener("pointermove", onMove, { passive: true });
    const fit = () => fitRenderer(renderer, camera, canvas, lowPower() ? 1 : 1.5);
    fit();
    const ro = new ResizeObserver(() => { fit(); renderer.render(scene, camera); });
    ro.observe(canvas);
    const unwatch = watchTheme((dark) => { recolor(scene, dark); if (still) renderer.render(scene, camera); });
    let e = 0;
    const stop = loop(canvas, (dt, t) => {
      e += (Math.min(1, Math.max(0, energy.current)) - e) * Math.min(1, dt * 2);
      const sp = 0.05 + e * 0.28;
      pts.rotation.y = t * sp * 0.4 + mx * 0.12;
      pts.rotation.x = Math.sin(t * 0.07) * 0.08 + my * 0.06;
      rings[0].rotation.z = t * sp;
      rings[1].rotation.z = -t * sp * 0.7;
      ringMat.opacity = 0.07 + e * 0.16;
      (pts.material as THREE.ShaderMaterial).opacity = 0.7 + e * 0.3;
      renderer.render(scene, camera);
    }, still);
    return () => {
      stop();
      unwatch();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      disposeScene(scene, renderer);
    };
  }, [energy]);
  return <canvas ref={ref} className={s.backdrop} aria-hidden="true" />;
}
