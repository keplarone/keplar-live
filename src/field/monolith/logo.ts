import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MARK_SIZE, markShapes } from "@/components/brand/geometry";

/**
 * The real Keplar mark (src/components/brand/geometry.ts: rounded square, rounded right triangle, circle) extruded into one
 * bevelled solid. The three parts are merged into a single BufferGeometry, so the logo is ONE draw call.
 * Smooth shading: normals are creased at CREASE (vertices welded by position, faces averaged unless they meet at a sharper angle),
 * so the rounded walls and the multi-segment bevel shade as continuous curves and only the real silhouette edges stay crisp.
 * The circle sits a hair proud of the square (as in the 2D union) so the overlap never z-fights.
 * Units: the mark is centred on the origin, `width` world units wide, y up.
 */
/** Faces meeting at more than this angle keep a hard edge (the cap/bevel transition is softer, wall segments far softer). */
export const CREASE = (50 * Math.PI) / 180;

export function logoGeometry(width = 2.5, detail: "high" | "low" = "high"): BufferGeometry {
  const { square: sq, triangle: tr, circle: ci } = markShapes;
  // enough segments that neither the outline nor the bevel shows steps; the low tier (phones) is lighter but still smooth-shaded
  const curve = detail === "high" ? 40 : 18;
  const bevelSeg = detail === "high" ? 6 : 3;

  const square = new Shape();
  const { x, y, size: w, radius: r } = sq;
  square.moveTo(x + r, y);
  square.lineTo(x + w - r, y); square.quadraticCurveTo(x + w, y, x + w, y + r);
  square.lineTo(x + w, y + w - r); square.quadraticCurveTo(x + w, y + w, x + w - r, y + w);
  square.lineTo(x + r, y + w); square.quadraticCurveTo(x, y + w, x, y + w - r);
  square.lineTo(x, y + r); square.quadraticCurveTo(x, y, x + r, y);

  // triangle: the brand path's rounded corners (radii 7 / 16 / 7) as quadratic corners through each vertex
  const [a, b, c] = tr.points;
  const tri = new Shape();
  tri.moveTo(204.95, 11.95);
  tri.quadraticCurveTo(a[0], a[1], 209.9, 0);
  tri.lineTo(362, 0); tri.quadraticCurveTo(b[0], b[1], 378, 16);
  tri.lineTo(378, 168.1); tri.quadraticCurveTo(c[0], c[1], 366.05, 173.05);
  tri.lineTo(204.95, 11.95);

  const circle = new Shape();
  circle.absarc(ci.cx, ci.cy, ci.r, 0, Math.PI * 2, false);

  const depth = 34, bevel = { bevelEnabled: true, bevelThickness: 7, bevelSize: 5, bevelSegments: bevelSeg, curveSegments: curve };
  const parts = [
    new ExtrudeGeometry([square, tri], { depth, ...bevel }),
    new ExtrudeGeometry(circle, { depth: depth + 8, ...bevel, curveSegments: curve * 2 }),
  ];
  parts[1].translate(0, 0, -4);

  // merge (non-indexed) into one geometry
  const pos: number[] = [], nrm: number[] = [];
  for (const g of parts) {
    const gg = toCreasedNormals(g.index ? g.toNonIndexed() : g, CREASE);
    pos.push(...(gg.getAttribute("position").array as Float32Array));
    nrm.push(...(gg.getAttribute("normal").array as Float32Array));
    g.dispose(); if (gg !== g) gg.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  // centre, flip SVG y-down to y-up, scale to `width`
  const s = width / MARK_SIZE, half = MARK_SIZE / 2;
  out.translate(-half, -half, -(depth / 2));
  out.scale(s, -s, s);
  // flipping one axis inverts winding: restore it so front faces stay front
  const p = out.getAttribute("position").array as Float32Array, n = out.getAttribute("normal").array as Float32Array;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; const u = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = u; }
  }
  out.computeBoundingSphere();
  return out;
}
