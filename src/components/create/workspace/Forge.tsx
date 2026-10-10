"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { dotMaterial, disposeScene, fitRenderer, inkHex, loop, lowPower, recolor, reducedMotion, watchTheme, webglOk } from "./glow3d";
import s from "./ws.module.css";

import type { ForgeFile, ForgeState } from "./forgeState";

type Kind = "page" | "style" | "script" | "image" | "other";
const kindOf = (p: string): Kind => (/\.html?$/i.test(p) ? "page" : /\.css$/i.test(p) ? "style" : /\.m?js$/i.test(p) ? "script" : /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(p) ? "image" : "other");
const SIZE: Record<Kind, [number, number]> = { page: [1.15, 0.9], style: [0.55, 0.9], script: [0.6, 0.6], image: [0.8, 0.8], other: [0.6, 0.6] };
const COLS = 6;
const GAP = 1.5;
const homeOf = (i: number, n: number) => {
  const cols = Math.min(COLS, Math.max(1, n));
  const rows = Math.ceil(n / COLS);
  return new THREE.Vector3((i % COLS - (cols - 1) / 2) * GAP, ((rows - 1) / 2 - Math.floor(i / COLS)) * 1.25, 0);
};
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/**
 * Forge / assembly, driven only by real build events. Every file the model starts becomes a wireframe block that flies in and snaps
 * into the grid (sparks); when that file's closing tag arrives the block solidifies and its page lines draw in. Faint ghost outlines mark
 * the files the plan expects. When the build ends (`dissolve` -> 1) the blocks lift, fade and burst into light over the real preview.
 * Stays on white/grey, pauses off screen, caps pixel ratio, and with reduced motion draws one still frame of the current state.
 */
export function Forge({ state }: { state: { current: ForgeState } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !webglOk()) return;
    const still = reducedMotion();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPower(), powerPreference: "low-power" });
    } catch {
      return; // no usable WebGL here: the page works without the animation
    }
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    const box = new THREE.BoxGeometry(1, 1, 0.18);
    const edge = new THREE.EdgesGeometry(box);
    // Page lines inside a block (drawn in once its file is complete).
    const lineGeo = new THREE.BufferGeometry().setFromPoints([-0.32, -0.12, 0.1, 0.12, 0.32].flatMap((y, i) => [new THREE.Vector3(-0.36, y, 0.1), new THREE.Vector3(i === 0 ? 0.1 : 0.36 - (i % 2) * 0.16, y, 0.1)]));
    type Blk = { path: string; kind: Kind; g: THREE.Group; edges: THREE.LineSegments; fill: THREE.Mesh; lines: THREE.LineSegments; size: THREE.Vector3; home: THREE.Vector3; born: number; landed: boolean; solid: number; wasDone: boolean; seed: number; flash: number };
    const blocks: Blk[] = [];
    const ghosts: THREE.LineSegments[] = [];
    const ghostMat = new THREE.LineBasicMaterial({ color: inkHex(), transparent: true, opacity: 0.1 });
    const ringMat = new THREE.LineBasicMaterial({ color: inkHex(), transparent: true, opacity: 0.4 });
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 140 }, (_, i) => new THREE.Vector3(Math.cos((i / 140) * 6.2832) * 4.4, -1.9, Math.sin((i / 140) * 6.2832) * 1.5))), ringMat);
    scene.add(ring);

    const MAX = lowPower() ? 90 : 220;
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(MAX * 3);
    const ss = new Float32Array(MAX);
    const sa = new Float32Array(MAX);
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("aSize", new THREE.BufferAttribute(ss, 1));
    sg.setAttribute("aAlpha", new THREE.BufferAttribute(sa, 1));
    scene.add(new THREE.Points(sg, dotMaterial()));
    const vel = new Float32Array(MAX * 3);
    const life = new Float32Array(MAX);
    let next = 0;
    const burst = (at: THREE.Vector3, n: number, up = 1) => {
      for (let k = 0; k < n; k++) {
        const i = next++ % MAX;
        sp.set([at.x + (Math.random() - 0.5) * 0.6, at.y + (Math.random() - 0.5) * 0.4, at.z], i * 3);
        const a = Math.random() * 6.28;
        const v = 0.6 + Math.random() * 1.8;
        vel.set([Math.cos(a) * v, (0.5 + Math.random() * 1.8) * up, (Math.random() - 0.5) * 1.2], i * 3);
        life[i] = 0.5 + Math.random() * 0.8;
        ss[i] = 0.6 + Math.random() * 1.0;
      }
    };

    const fit = () => {
      fitRenderer(renderer, camera, canvas, lowPower() ? 1.25 : 2);
      const half = Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, 0.5, Math.max(6.8, 4.9 / (half * camera.aspect), 2.7 / half));
      camera.lookAt(0, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(() => { fit(); renderer.render(scene, camera); });
    ro.observe(canvas);

    const addBlock = (f: ForgeFile, t: number): Blk => {
      const kind = kindOf(f.path);
      const [w, h] = SIZE[kind];
      const g = new THREE.Group();
      const edges = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: inkHex(), transparent: true, opacity: 0 }));
      const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: inkHex(), transparent: true, opacity: 0 }));
      const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: inkHex(), transparent: true, opacity: 0 }));
      lines.visible = kind === "page";
      g.add(edges, fill, lines);
      g.scale.set(w, h, 1);
      const a = Math.random() * 6.28;
      g.position.set(Math.cos(a) * 6.5, 2 + Math.random() * 3, 2 + Math.random() * 3);
      g.rotation.set(Math.random() * 1.5, Math.random() * 2, Math.random());
      scene.add(g);
      return { path: f.path, kind, g, edges, fill, lines, size: new THREE.Vector3(w, h, 1), home: new THREE.Vector3(), born: t, landed: false, solid: 0, wasDone: false, seed: Math.random() * 6.28, flash: 0 };
    };

    let lastPulse = state.current.pulse;
    let d = 0;
    const unwatch = watchTheme((dark) => { recolor(scene, dark); if (still) renderer.render(scene, camera); });
    let dissolved = false;
    const tmp = new THREE.Vector3();
    const stop = loop(canvas, (dt, t) => {
      const st = state.current;
      // New real files -> new blocks; a file that restarted (retry) keeps its block.
      for (const f of st.files) if (!blocks.some((b) => b.path === f.path)) blocks.push(addBlock(f, t));
      const slots = Math.max(blocks.length, Math.min(12, st.planned));
      blocks.forEach((b, i) => b.home.copy(homeOf(i, slots)));
      // Ghost outlines for planned slots not yet taken.
      while (ghosts.length < slots) {
        const gm = new THREE.LineSegments(edge, ghostMat);
        gm.scale.set(SIZE.page[0], SIZE.page[1], 1);
        scene.add(gm);
        ghosts.push(gm);
      }
      ghosts.forEach((gm, i) => {
        gm.visible = i >= blocks.length && i < slots;
        if (gm.visible) gm.position.copy(homeOf(i, slots));
      });
      ghostMat.opacity = (0.07 + 0.12 * st.progress + 0.04 * Math.sin(t * 2.4)) * (1 - d);
      if (st.pulse !== lastPulse) {
        lastPulse = st.pulse;
        const b = blocks[blocks.length - 1];
        burst(b ? b.home : tmp.set(0, 0, 0), 6);
      }
      d += (st.dissolve - d) * Math.min(1, dt * 2.6);
      if (still) d = st.dissolve;
      if (d > 0.03 && !dissolved) { dissolved = true; blocks.forEach((b) => burst(b.home, 6, 1.6)); }
      if (d < 0.01) dissolved = false;
      const fade = 1 - ease(d);
      let flash = 0;
      for (const b of blocks) {
        const k = still ? 1 : Math.min(1, dt * (b.landed ? 6 : 2.4));
        // fly in along a curve: start loose, converge on the slot
        b.g.position.lerp(b.home, k);
        const dist = b.g.position.distanceTo(b.home);
        if (!b.landed && (dist < 0.08 || still)) { b.landed = true; b.flash = 1; burst(b.home, 10); }
        if (!b.landed) b.g.position.addScaledVector(tmp.set(Math.sin(t * 2 + b.seed), Math.cos(t * 1.7 + b.seed), 0), dt * 0.6);
        const settle = ease(1 - Math.min(1, dist / 4));
        b.g.rotation.x += (0 - b.g.rotation.x) * Math.min(1, dt * 3) * (still ? 9 : 1);
        b.g.rotation.y += (0 - b.g.rotation.y) * Math.min(1, dt * 3) * (still ? 9 : 1);
        b.g.rotation.z += (0 - b.g.rotation.z) * Math.min(1, dt * 3) * (still ? 9 : 1);
        const f = st.files.find((x) => x.path === b.path);
        const done = Boolean(f?.done);
        if (done && !b.wasDone) { b.wasDone = true; b.flash = 1; burst(b.home, 14); }
        b.solid += ((done ? 1 : 0) - b.solid) * Math.min(1, dt * 4) * (still ? 9 : 1);
        b.flash = Math.max(0, b.flash - dt * 2.2);
        flash = Math.max(flash, b.flash);
        const lift = ease(d) * 1.4;
        b.g.position.y += lift * dt * 2;
        const grow = 1 + b.flash * 0.07 + ease(d) * 0.3;
        b.g.scale.set(b.size.x * grow, b.size.y * grow, 1);
        (b.edges.material as THREE.LineBasicMaterial).opacity = (0.35 + 0.55 * settle + b.flash * 0.1) * fade;
        (b.fill.material as THREE.MeshBasicMaterial).opacity = (0.03 + 0.1 * b.solid + 0.14 * b.flash) * fade;
        (b.lines.material as THREE.LineBasicMaterial).opacity = 0.6 * b.solid * fade;
      }
      ringMat.opacity = (0.28 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3)) * (st.progress < 1 ? 1 : 0.3) + flash * 0.2) * fade;
      ring.rotation.y = t * (0.3 + st.progress * 0.5);
      for (let i = 0; i < MAX; i++) {
        if (life[i] > 0) {
          life[i] -= dt;
          vel[i * 3 + 1] -= 2.6 * dt;
          sp[i * 3] += vel[i * 3] * dt;
          sp[i * 3 + 1] += vel[i * 3 + 1] * dt;
          sp[i * 3 + 2] += vel[i * 3 + 2] * dt;
          sa[i] = Math.max(0, Math.min(1, life[i] * 1.6));
        } else sa[i] = 0;
      }
      (sg.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (sg.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
      (sg.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
      scene.rotation.y = Math.sin(t * 0.25) * 0.14;
      renderer.render(scene, camera);
    }, still);
    return () => {
      stop();
      unwatch();
      ro.disconnect();
      lineGeo.dispose();
      disposeScene(scene, renderer);
    };
  }, [state]);
  return <canvas ref={ref} className={s.forge} aria-hidden="true" />;
}
