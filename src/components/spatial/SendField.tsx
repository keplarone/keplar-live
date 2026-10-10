"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { currentTheme } from "@/lib/theme";
import { SEND_EVENT, type SendDetail } from "@/lib/spatial/events";
import { budget, resolveQuality, SURFACE_INTENSITY } from "@/lib/spatial/policy";
import { vivid } from "@/lib/tokens";
import { pointsFragment, pointsVertex } from "./points";
import { tryCreateStage, detectCaps, type Stage } from "./stage";


/**
 * The prompt leaves the composer: a short burst of points rises from the composer edge toward the thread when a
 * question is actually sent. One event, one burst (~0.7s). Count scales with the length of the real prompt.
 * Created lazily on the first send; renders only during the burst; off for reduced motion / data saver / no WebGL.
 */
export function SendField({ replay }: { replay?: SendDetail } = {}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const caps = detectCaps();
    const q = resolveQuality(SURFACE_INTENSITY.ask, caps);
    if (q === "off" || q === "static") return; // nothing to animate: skip silently
    let stage: Stage | null = null;
    let failed = false;
    let geo: THREE.BufferGeometry | null = null;
    let n = 0;
    let from: Float32Array;
    let to: Float32Array;
    let pos: Float32Array;
    let alpha: Float32Array;
    const DUR = 0.7;

    const onSend = (e: Event) => {
      const d = (e as CustomEvent<SendDetail>).detail;
      if (!d) return;
      const count = Math.max(8, budget(q, Math.min(160, 24 + d.chars)));
      const W = window.innerWidth;
      const H = window.innerHeight;
      const a = W / H;
      const toScene = (px: number, py: number) => [(px / W * 2 - 1) * a, 1 - (py / H) * 2] as const;
      if (failed) return;
      if (!stage) {
        stage = tryCreateStage(canvas, "medium", (_dt, elapsed) => {
          const k = Math.min(1, elapsed / DUR);
          const ease = 1 - Math.pow(1 - k, 3);
          for (let i = 0; i < n; i++) {
            pos[i * 3] = from[i * 2] + (to[i * 2] - from[i * 2]) * ease;
            pos[i * 3 + 1] = from[i * 2 + 1] + (to[i * 2 + 1] - from[i * 2 + 1]) * ease;
            alpha[i] = Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.9;
          }
          geo!.attributes.position.needsUpdate = true;
          geo!.attributes.aAlpha.needsUpdate = true;
          return k < 1;
        });
        if (!stage) { failed = true; return; }
      }
      // (Re)build the burst for this send.
      if (geo) {
        stage.scene.clear();
        geo.dispose();
      }
      n = count;
      from = new Float32Array(n * 2);
      to = new Float32Array(n * 2);
      pos = new Float32Array(n * 3);
      alpha = new Float32Array(n);
      const col = new Float32Array(n * 3);
      const size = new Float32Array(n).fill(caps.mobile ? 5 : 6);
      const c = new THREE.Color(vivid[currentTheme() === "light" ? "light" : "dark"].reasoning.v);
      const cx = d.rect.x + d.rect.w / 2;
      for (let i = 0; i < n; i++) {
        const [fx, fy] = toScene(d.rect.x + Math.random() * d.rect.w, d.rect.y + Math.random() * 6);
        const [tx, ty] = toScene(cx + (Math.random() - 0.5) * Math.min(d.rect.w, 520), H * (0.25 + Math.random() * 0.2));
        from.set([fx, fy], i * 2);
        to.set([tx, ty], i * 2);
        col.set([c.r, c.g, c.b], i * 3);
      }
      geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
      geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: pointsVertex, fragmentShader: pointsFragment, transparent: true, depthTest: false, depthWrite: false }));
      pts.frustumCulled = false;
      stage.scene.add(pts);
      stage.restart();
    };
    window.addEventListener(SEND_EVENT, onSend);
    // the lazy wrapper loaded this chunk because of a send: play that first burst now (not through the window, other listeners already saw it)
    if (replay) onSend({ detail: replay } as unknown as Event);
    return () => {
      window.removeEventListener(SEND_EVENT, onSend);
      stage?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replay is only read once, on mount
  }, []);

  return <canvas ref={ref} aria-hidden="true" style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 40 }} />;
}
