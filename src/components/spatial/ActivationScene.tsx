"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { currentTheme, onThemeChange } from "@/lib/theme";
import { activationState, activationSummary, resolveQuality, SURFACE_INTENSITY, type ActivationInput } from "@/lib/spatial/policy";
import { vivid } from "@/lib/tokens";
import { pointsFragment, pointsVertex } from "./points";
import { tryCreateStage, detectCaps, type Stage } from "./stage";

const dim = { light: "#c47b45", dark: "#565861" };

/**
 * "Intelligence activating": one dot per model that was actually asked. A dot lights when that model's result really
 * arrives, dots that failed or refused stay dim, and the lit dots draw together as the pipeline really moves into
 * compare and synthesize. Waiting dots breathe (the only motion not tied to an event) and only while the answer runs.
 * Nothing renders until the stream says more than one model was asked.
 */
export function ActivationScene({ input, running }: { input: ActivationInput; running: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ input, running });
  const stageRef = useRef<Stage | null>(null);
  const count = input.count;
  const eligible = count >= 2;
  const text = activationSummary(input);

  useEffect(() => {
    live.current = { input, running };
    stageRef.current?.invalidate();
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!eligible || !canvas) return;
    const caps = detectCaps();
    const q = resolveQuality(SURFACE_INTENSITY.ask, caps);
    if (q === "off") return;
    canvas.style.display = "block"; // only once a scene can really run
    const n = count;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const alpha = new Float32Array(n).fill(0.3);
    const size = new Float32Array(n).fill(caps.mobile ? 12 : 15);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    const home = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * 0.62, y: Math.sin(a) * 0.5 };
    });
    const cur = home.map((h) => ({ ...h }));
    const mat = new THREE.ShaderMaterial({ vertexShader: pointsVertex, fragmentShader: pointsFragment, transparent: true, depthTest: false, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    const theme = () => (currentTheme() === "light" ? "light" : "dark");
    let settled = false;
    const update = (dt: number, t: number) => {
      const { input: inp, running: run } = live.current;
      const st = activationState(inp);
      if (!st) return false;
      const c = vivid[theme()];
      const lit = new THREE.Color(c.reasoning.v);
      const off = new THREE.Color(dim[theme()]);
      let moving = false;
      st.nodes.forEach((nd, i) => {
        const k = nd.state === "responded" ? st.converge * 0.7 : 0; // lit dots draw together, others hold their place
        const tx = home[i].x * (1 - k);
        const ty = home[i].y * (1 - k);
        const f = q === "static" ? 1 : 1 - Math.pow(0.001, dt);
        cur[i].x += (tx - cur[i].x) * f;
        cur[i].y += (ty - cur[i].y) * f;
        if (Math.abs(tx - cur[i].x) > 0.002 || Math.abs(ty - cur[i].y) > 0.002) moving = true;
        pos.set([cur[i].x, cur[i].y, 0], i * 3);
        const colr = nd.state === "responded" ? lit : off;
        col.set([colr.r, colr.g, colr.b], i * 3);
        alpha[i] = nd.state === "responded" ? 0.95 : nd.state === "missing" ? 0.5 : q === "static" ? 0.35 : 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.4 + i));
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      const pulsing = run && st.nodes.some((x) => x.state === "pending");
      settled = !moving && !pulsing;
      return !settled;
    };
    const stage = tryCreateStage(canvas, q, update);
    if (!stage) return;
    stageRef.current = stage;
    stage.scene.add(points);
    const stopTheme = onThemeChange(() => stage.invalidate());
    return () => {
      stopTheme();
      stageRef.current = null;
      stage.dispose();
      canvas.style.display = "none";
    };
  }, [eligible, count]);

  if (!eligible) return null;
  return (
    <div style={{ margin: "6px 0 2px" }}>
      <canvas ref={ref} role="img" aria-label={text} style={{ display: "none", width: "100%", maxWidth: 360, height: 84 }} />
    </div>
  );
}
