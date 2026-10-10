"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { currentTheme, onThemeChange } from "@/lib/theme";
import { vivid } from "@/lib/tokens";
import { agreementLayout, agreementSummary, resolveQuality, SURFACE_INTENSITY, type AgreementInput } from "@/lib/spatial/policy";
import { asSentence } from "@/lib/sentence";
import { tryCreateStage, detectCaps } from "./stage";
import { pointsFragment, pointsVertex } from "./points";

const COLORS = {
  light: { majority: vivid.light.reasoning.v, dissent: vivid.light.disagree.v, unscored: "#8a5a12", missing: "#c47b45", line: vivid.light.reasoning.v },
  dark: { majority: vivid.dark.reasoning.v, dissent: vivid.dark.disagree.v, unscored: "#8b8d94", missing: "#565861", line: vivid.dark.reasoning.v },
} as const;

/**
 * Spatial view of ONE answer's real comparison: each dot is a model that was actually consulted.
 * Majority converges and is joined to its centre, dissent keeps its distance, non-responders sit dim
 * at the edge. Text twin below is the source of truth for assistive tech; the scene is decoration of data.
 * Renders nothing when there is nothing to compare, or when this device should not run WebGL.
 */
export function AgreementScene({ input }: { input: AgreementInput }) {
  // Callers pass a fresh object each render; key on content so the WebGL scene is not rebuilt.
  const key = JSON.stringify(input);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodes = useMemo(() => agreementLayout(input), [key]);
  const ref = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);
  const summary = agreementSummary(nodes);

  useEffect(() => {
    if (!nodes.length) return;
    const caps = detectCaps();
    const q = resolveQuality(SURFACE_INTENSITY.ask, caps);
    const canvas = ref.current;
    if (q === "off" || !canvas) return;
    setOn(true);
    const n = nodes.length;
    const size = (caps.mobile ? 14 : 18) * (q === "static" ? 1 : 1);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const alpha = new Float32Array(n);
    const sz = new Float32Array(n).fill(size);
    const from = nodes.map((_, i) => ({ x: Math.cos(i * 2.4) * 0.9, y: Math.sin(i * 2.4) * 0.9 }));
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: pointsVertex, fragmentShader: pointsFragment, transparent: true, depthTest: false, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    const maj = nodes.filter((x) => x.group === "majority");
    const lineGeo = new THREE.BufferGeometry();
    const linePos = new Float32Array(maj.length * 6);
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35 });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;

    const paint = () => {
      const c = COLORS[currentTheme() === "light" ? "light" : "dark"];
      nodes.forEach((nd, i) => {
        const k = new THREE.Color(c[nd.group]);
        col.set([k.r, k.g, k.b], i * 3);
        alpha[i] = nd.group === "missing" ? 0.55 : 0.95;
      });
      lineMat.color.set(c.line);
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    };
    paint();
    const cx = maj.length ? maj.reduce((a, b) => a + b.x, 0) / maj.length : 0;
    const cy = maj.length ? maj.reduce((a, b) => a + b.y, 0) / maj.length : 0;
    const DUR = 1.1;
    const place = (t: number) => {
      const k = 1 - Math.pow(1 - Math.min(1, t / DUR), 3);
      nodes.forEach((nd, i) => {
        pos[i * 3] = from[i].x + (nd.x - from[i].x) * k;
        pos[i * 3 + 1] = from[i].y + (nd.y - from[i].y) * k;
      });
      let j = 0;
      maj.forEach((m) => {
        const i = nodes.indexOf(m);
        linePos.set([pos[i * 3], pos[i * 3 + 1], 0, cx * k, cy * k, 0], j);
        j += 6;
      });
      geo.attributes.position.needsUpdate = true;
      lineGeo.attributes.position.needsUpdate = true;
      return t < DUR;
    };
    const stage = tryCreateStage(canvas, q, (_dt, t) => place(t));
    if (!stage) return;
    stage.scene.add(lines, points);
    const stopTheme = onThemeChange(() => {
      paint();
      stage.invalidate();
    });
    return () => {
      stopTheme();
      stage.dispose();
      setOn(false);
    };
  }, [nodes]);

  if (!nodes.length) return null;
  return (
    <figure style={{ margin: "0 0 12px" }}>
      <canvas
        ref={ref}
        role="img"
        aria-label={`Comparison of the models consulted: ${asSentence(summary)}`}
        style={{ display: on ? "block" : "none", width: "100%", height: 120, borderRadius: 12 }}
      />
      <figcaption style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{asSentence(summary)} Each dot is one consulted model.</figcaption>
    </figure>
  );
}
