"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { currentTheme, onThemeChange } from "@/lib/theme";
import { memoryLayout, nearestNode, resolveQuality, SURFACE_INTENSITY, type MemoryRecord } from "@/lib/spatial/policy";
import { vivid } from "@/lib/tokens";
import { pointsFragment, pointsVertex } from "./points";
import { tryCreateStage, detectCaps, type Stage } from "./stage";

type Item = MemoryRecord & { text: string };

/**
 * Your memory as a field: one dot per remembered record. Kind groups into sectors, older sits further out, pink = what Keplar
 * remembers; solid = you added it, faint = Keplar learned it. Hover or focus the list to read a record. The list below is the full, editable
 * source; this is a view of it and changes as you add or delete.
 */
export function MemoryConstellation({ items }: { items: Item[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const nodes = useMemo(() => memoryLayout(items), [items]);
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const nodesRef = useRef(nodes);

  useEffect(() => {
    nodesRef.current = nodes;
    hoverRef.current = hover;
    stageRef.current?.invalidate();
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || nodes.length < 3) return;
    const caps = detectCaps();
    const q = resolveQuality(SURFACE_INTENSITY.memory, caps);
    if (q === "off") return;
    canvas.style.display = "block";
    const n = nodes.length;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const alpha = new Float32Array(n);
    const size = new Float32Array(n);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    const points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: pointsVertex, fragmentShader: pointsFragment, transparent: true, depthTest: false, depthWrite: false }));
    points.frustumCulled = false;
    const paint = () => {
      const c = vivid[currentTheme() === "light" ? "light" : "dark"];
      const cur = nodesRef.current;
      cur.forEach((nd, i) => {
        const k = new THREE.Color(c.memory.v);
        pos.set([nd.x, nd.y, 0], i * 3);
        col.set([k.r, k.g, k.b], i * 3);
        const on = hoverRef.current === nd.id;
        alpha[i] = (hoverRef.current && !on ? 0.45 : 0.95) * (nd.source === "user" ? 1 : 0.5);
        size[i] = (caps.mobile ? 9 : 11) * (on ? 1.8 : 1);
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    };
    const stage = tryCreateStage(canvas, q === "static" ? "static" : q, () => {
      paint();
      return false; // static scene: redraws only when data, hover or theme change
    });
    if (!stage) return;
    stageRef.current = stage;
    stage.scene.add(points);
    const stopTheme = onThemeChange(() => stage.invalidate());
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const a = r.width / r.height;
      const hit = nearestNode(nodesRef.current, (((e.clientX - r.left) / r.width) * 2 - 1) * a, 1 - ((e.clientY - r.top) / r.height) * 2, 0.1);
      setHover(hit ? hit.id : null);
    };
    const onLeave = () => setHover(null);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      stopTheme();
      stageRef.current = null;
      stage.dispose();
      canvas.style.display = "none";
    };
  }, [nodes.length]);

  if (nodes.length < 3) return null;
  const hovered = hover ? items.find((i) => i.id === hover) : null;
  const learned = items.filter((i) => i.source === "auto").length;
  const added = items.length - learned;
  return (
    <figure style={{ margin: "var(--s-3) 0" }}>
      <canvas ref={ref} role="img" aria-label={`Your memory as a field: ${items.length} records, ${added} added by you and ${learned} learned by Keplar. The list below has every record.`} style={{ display: "none", width: "100%", height: 170, borderRadius: 12, background: "rgb(var(--rgb-ink) / 0.03)" }} />
      <figcaption style={{ fontSize: 12, color: "var(--c-ink-2)", marginTop: 6, minHeight: 32 }}>
        {hovered ? <><b>{hovered.kind}</b>: {hovered.text}</> : `${items.length} records: ${added} you added (solid pink), ${learned} learned (faint pink). Grouped by kind; older sits further out.`}
      </figcaption>
    </figure>
  );
}
