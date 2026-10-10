import { MARK_SIZE, markShapes } from "@/components/brand/geometry";

/**
 * Samples points on the Keplar mark (same geometry as the SVG). Returns
 * positions in a unit space centred on the mark, y-up, spanning [-0.5, 0.5].
 * ~62% of points fill the area, the rest trace edges so the silhouette is crisp.
 */
export function sampleMark(count: number, rand: () => number): Float32Array {
  const out = new Float32Array(count * 3);
  const { square: sq, triangle: tri, circle: ci } = markShapes;

  const inSquare = (x: number, y: number) => {
    const r = sq.radius;
    const cx = Math.min(Math.max(x, sq.x + r), sq.x + sq.size - r);
    const cy = Math.min(Math.max(y, sq.y + r), sq.y + sq.size - r);
    return x >= sq.x && x <= sq.x + sq.size && y >= sq.y && y <= sq.y + sq.size && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const [[ax], [bx, by], [, cy]] = tri.points;
  const inTriangle = (x: number, y: number) => x <= bx && y >= by && x - y >= ax - by && y <= cy;
  const inCircle = (x: number, y: number) => (x - ci.cx) ** 2 + (y - ci.cy) ** 2 <= ci.r * ci.r;

  // Perimeter samplers per shape.
  const edgeSquare = (): [number, number] => {
    const r = sq.radius, s = sq.size, straight = s - 2 * r, arc = (Math.PI / 2) * r;
    const per = 4 * straight + 4 * arc;
    let t = rand() * per;
    const corners = [
      [sq.x + s - r, sq.y + r, -Math.PI / 2], [sq.x + s - r, sq.y + s - r, 0],
      [sq.x + r, sq.y + s - r, Math.PI / 2], [sq.x + r, sq.y + r, Math.PI],
    ];
    const sides: [number, number, number, number][] = [
      [sq.x + r, sq.y, 1, 0], [sq.x + s, sq.y + r, 0, 1], [sq.x + s - r, sq.y + s, -1, 0], [sq.x, sq.y + s - r, 0, -1],
    ];
    for (let i = 0; i < 4; i++) {
      if (t < straight) { const [x0, y0, dx, dy] = sides[i]; return [x0 + dx * t, y0 + dy * t]; }
      t -= straight;
      if (t < arc) { const [cx0, cy0, a0] = corners[i]; const a = a0 + t / r; return [cx0 + Math.cos(a) * r, cy0 + Math.sin(a) * r]; }
      t -= arc;
    }
    return [sq.x, sq.y];
  };
  const edgeTriangle = (): [number, number] => {
    const pts = tri.points;
    const lens = [0, 1, 2].map((i) => Math.hypot(pts[(i + 1) % 3][0] - pts[i][0], pts[(i + 1) % 3][1] - pts[i][1]));
    let t = rand() * (lens[0] + lens[1] + lens[2]);
    for (let i = 0; i < 3; i++) {
      if (t < lens[i]) {
        const k = t / lens[i];
        const a = pts[i], b = pts[(i + 1) % 3];
        const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
        // pull slightly inside so rounded corners aren't overshot
        return [x + (316 - x) * 0.03, y + (62 - y) * 0.03];
      }
      t -= lens[i];
    }
    return [pts[0][0], pts[0][1]];
  };
  const edgeCircle = (): [number, number] => {
    const a = rand() * Math.PI * 2;
    return [ci.cx + Math.cos(a) * ci.r, ci.cy + Math.sin(a) * ci.r];
  };

  const areaSq = sq.size * sq.size - (4 - Math.PI) * sq.radius ** 2;
  const areaTri = ((bx - ax) * (cy - by)) / 2;
  const areaCi = Math.PI * ci.r * ci.r;
  const total = areaSq + areaTri + areaCi;

  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, z = 0;
    const edge = rand() < 0.38;
    const pick = rand() * total;
    const shape = pick < areaSq ? 0 : pick < areaSq + areaTri ? 1 : 2;
    const depth = shape === 0 ? 0 : shape === 1 ? 0.012 : 0.03; // layered, like the solid mark
    if (edge) {
      [x, y] = shape === 0 ? edgeSquare() : shape === 1 ? edgeTriangle() : edgeCircle();
      z = depth + (rand() - 0.5) * 0.05;
    } else {
      for (let tries = 0; tries < 60; tries++) {
        x = rand() * MARK_SIZE; y = rand() * MARK_SIZE;
        const ok = shape === 0 ? inSquare(x, y) : shape === 1 ? inTriangle(x, y) : inCircle(x, y);
        if (ok) break;
      }
      z = depth + (rand() - 0.5) * 0.035;
    }
    out[i * 3] = x / MARK_SIZE - 0.5;
    out[i * 3 + 1] = 0.5 - y / MARK_SIZE;
    out[i * 3 + 2] = z;
  }
  return out;
}

/**
 * Samples a product-window wireframe in normalised [-1, 1] space: frame outline,
 * title-bar rule, sidebar rule and a few content lines. Particles land here just
 * before the real DOM window takes over.
 */
export function sampleWindow(count: number, rand: () => number, aspect: number, radiusPx = 0.06): Float32Array {
  const out = new Float32Array(count * 3);
  const segs: [number, number, number, number, number][] = []; // x0,y0,x1,y1,weight
  const r = radiusPx;
  const rx = r / aspect;
  // outline (straight parts)
  segs.push([-1 + rx, 1, 1 - rx, 1, 3], [-1 + rx, -1, 1 - rx, -1, 3], [-1, 1 - r, -1, -1 + r, 2], [1, 1 - r, 1, -1 + r, 2]);
  // title bar rule + sidebar rule
  segs.push([-1, 0.84, 1, 0.84, 1.6], [-0.56, 0.84, -0.56, -1, 1.2]);
  // content lines (answer block)
  const lines: [number, number, number][] = [
    [-0.42, 0.62, 0.3], [-0.42, 0.5, 0.82], [-0.42, 0.4, 0.74], [-0.42, 0.3, 0.8], [-0.42, 0.2, 0.52],
    [-0.42, -0.02, 0.86], [-0.42, -0.2, 0.86], [-0.42, -0.38, 0.86], [-0.42, -0.56, 0.86],
    [-0.9, 0.62, -0.66], [-0.9, 0.5, -0.7], [-0.9, 0.4, -0.72],
  ];
  for (const [x0, y, x1] of lines) segs.push([x0, y, x1, y, 0.7]);
  const weights = segs.map((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) * s[4]);
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < count; i++) {
    let t = rand() * total;
    let k = 0;
    while (k < segs.length - 1 && t > weights[k]) { t -= weights[k]; k++; }
    const [x0, y0, x1, y1] = segs[k];
    const u = rand();
    out[i * 3] = x0 + (x1 - x0) * u;
    out[i * 3 + 1] = y0 + (y1 - y0) * u;
    out[i * 3 + 2] = k < 4 ? 1 : 0; // 1 = frame, 0 = interior
  }
  return out;
}

/** Deterministic PRNG so server-rendered fallbacks and screenshots are stable. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
