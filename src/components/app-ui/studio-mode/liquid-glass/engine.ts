/**
 * Keplar liquid glass: the optical recipe of Mike Bespalov's "Liquid Glass" pen
 * (https://codepen.io/Mikhail-Bespalov/pen/MYwrMNy, MIT, see LICENSE-liquid-glass.txt) turned into a system for any shape.
 *
 * Recipe (as in the pen): `backdrop-filter: url(#filter)` where the filter is
 *   feImage (a lens map, stretched over the element) → feGaussianBlur of the backdrop → feDisplacementMap (R moves x, G moves y).
 * Round controls use the pen's own circular map. Pills, panels and cards get a map generated here for their exact shape:
 * the backdrop is pulled inward along the rim (like the edge of a thick piece of glass) and only gently in the middle, so
 * text behind a large surface stays readable.
 *
 * Every surface has its own filter, so each can deform on its own: `surge()` kicks the displacement and a spring settles it
 * back (interruptible: a new kick simply adds to the motion), and `setStrength()` springs to a new resting strength.
 *
 * What it refracts: whatever this page paints behind the element. In the desktop overlay the window itself is transparent and
 * the operating system composites Roblox Studio after Chromium has drawn, so Studio is seen through the glass but cannot be
 * bent by it; the overlay's own content (the Solar core, the aura, messages under the composer) is.
 * Chromium only (Firefox ignores SVG backdrop filters): elsewhere the surface falls back to a plain blur.
 */
import { PEN_CIRCLE_MAP } from "./pen-map";

const NS = "http://www.w3.org/2000/svg";
let host: SVGSVGElement | null = null;
let seq = 0;
const mapCache = new Map<string, string>();

export type GlassShape = "circle" | "rounded";
export type GlassOptions = {
  shape?: GlassShape;
  /** Resting displacement, in pixels at the rim (rounded) or the pen's scale (circle, where 1 is the pen's default). */
  strength?: number;
  /** Backdrop blur in pixels before displacement (the pen: 2% of the element). */
  blur?: number;
  /** Width of the refracting rim, as a fraction of the shorter side (rounded only). */
  band?: number;
};
export type GlassHandle = {
  readonly id: string;
  /** Kick the surface: the distortion swells by `amount` and springs back. */
  surge(amount?: number): void;
  /** Spring to a new resting strength. */
  setStrength(strength: number): void;
  dispose(): void;
};

function defs(): SVGSVGElement {
  if (host && host.isConnected) return host;
  host = document.createElementNS(NS, "svg");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("width", "0");
  host.setAttribute("height", "0");
  host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  document.body.appendChild(host);
  return host;
}

export function glassSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands ?? [];
  return brands.some((b) => /Chromium|Chrome|Electron/i.test(b.brand)) || /\bChrome\/|\bElectron\//.test(navigator.userAgent);
}

/** A lens map for a rounded rectangle of `w`×`h` px with corner radius `r` px (generated once per shape, then cached). */
export function roundedLensMap(w: number, h: number, r: number, band: number): string {
  const W = 192;
  const H = Math.max(24, Math.min(512, Math.round((W * h) / Math.max(1, w))));
  const key = `${W}x${H}:${(r / Math.max(1, Math.min(w, h))).toFixed(2)}:${band.toFixed(2)}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const img = x.createImageData(W, H);
  const sx = w / W, sy = h / H; // map pixel → element pixel
  const bandPx = Math.max(6, band * Math.min(w, h));
  // The lens is computed on corners at least as round as the rim band, so the pull turns smoothly round each corner
  // (sharper corners crease the field along the diagonals).
  const rr = Math.min(Math.max(r, bandPx), w / 2, h / 2);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      // Element-space point relative to the centre, and the rounded-rectangle signed distance (negative inside).
      const px = (i + 0.5) * sx - w / 2, py = (j + 0.5) * sy - h / 2;
      const qx = Math.abs(px) - (w / 2 - rr), qy = Math.abs(py) - (h / 2 - rr);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const sd = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - rr;
      // Outward normal of the nearest edge.
      let nx = 0, ny = 0;
      if (qx > 0 && qy > 0) { const l = Math.hypot(ox, oy) || 1; nx = (ox / l) * Math.sign(px); ny = (oy / l) * Math.sign(py); }
      else if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py);
      // Inside the straight runs the nearest edge flips along the diagonal; fade the pull out before it can meet itself.
      let dx = 0, dy = 0;
      if (sd < 0) {
        const d = -sd;
        // Rim: pull inward, strongest at the edge (the pen's profile rises steeply toward the rim).
        if (d < bandPx) { const t = 1 - d / bandPx; const m = t * t * (3 - 2 * t); dx -= nx * m; dy -= ny * m; }
        // A faint whole-surface lens, so the middle is not dead flat.
        dx -= (px / (w / 2)) * 0.08; dy -= (py / (h / 2)) * 0.08;
      }
      const k = (j * W + i) * 4;
      img.data[k] = Math.round(128 + Math.max(-1, Math.min(1, dx)) * 127);
      img.data[k + 1] = Math.round(128 + Math.max(-1, Math.min(1, dy)) * 127);
      img.data[k + 2] = 128;
      img.data[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const url = c.toDataURL("image/png");
  mapCache.set(key, url);
  return url;
}

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Make `el` a liquid-glass surface. Returns a handle to deform it; call dispose() when the element goes away. */
export function attachGlass(el: HTMLElement, opts: GlassOptions = {}): GlassHandle {
  const shape = opts.shape ?? "rounded";
  const band = opts.band ?? 0.32;
  const id = `kp-lg-${++seq}`;
  if (!glassSupported()) {
    el.style.backdropFilter = "blur(14px) saturate(1.4)";
    el.dataset.glass = "fallback";
    return { id, surge() {}, setStrength() {}, dispose() { el.style.backdropFilter = ""; delete el.dataset.glass; } };
  }

  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", id);
  // Round controls follow the pen exactly (default filter region, linearRGB). Generated maps are written in sRGB values.
  if (shape !== "circle") filter.setAttribute("color-interpolation-filters", "sRGB");
  // Pixel units, sized from the element (bounding-box units mis-place the map for elements not centred by a transform).
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("primitiveUnits", "userSpaceOnUse");
  const image = document.createElementNS(NS, "feImage");
  image.setAttribute("x", "0"); image.setAttribute("y", "0");
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("result", "map");
  const blur = document.createElementNS(NS, "feGaussianBlur");
  blur.setAttribute("in", "SourceGraphic");
  blur.setAttribute("result", "blur");
  const disp = document.createElementNS(NS, "feDisplacementMap");
  disp.setAttribute("in", "blur"); disp.setAttribute("in2", "map");
  disp.setAttribute("xChannelSelector", "R"); disp.setAttribute("yChannelSelector", "G");
  filter.append(image, blur, disp);
  defs().appendChild(filter);

  // Strength is kept in pixels for rounded surfaces and converted to the bounding-box scale (a fraction of the box).
  let size = { w: el.offsetWidth || 1, h: el.offsetHeight || 1 };
  let rest = opts.strength ?? (shape === "circle" ? 1 : 18);
  let value = rest, velocity = 0, raf = 0;
  const place = () => {
    for (const [k, v] of [["x", 0], ["y", 0], ["width", size.w], ["height", size.h]] as const) filter.setAttribute(k, String(v));
    image.setAttribute("width", String(size.w));
    image.setAttribute("height", String(size.h));
  };
  const apply = () => {
    // Circle: the pen's scale is a fraction of the element; rounded: pixels at the rim (×2: the map spans -0.5..0.5).
    const scale = shape === "circle" ? value * Math.min(size.w, size.h) : value * 2;
    disp.setAttribute("scale", scale.toFixed(4));
  };
  const setMap = () => {
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    image.setAttribute("href", shape === "circle" ? PEN_CIRCLE_MAP : roundedLensMap(size.w, size.h, radius, band));
    const blurPx = opts.blur ?? (shape === "circle" ? 0.02 * Math.min(size.w, size.h) : 1.2);
    blur.setAttribute("stdDeviation", blurPx.toFixed(2));
    apply();
  };
  const tick = () => {
    raf = 0;
    // A critically-damped-ish spring (stiffness 170, damping 14): a kick overshoots once and settles.
    const dt = 1 / 60;
    velocity += (-(value - rest) * 170 - velocity * 14) * dt;
    value += velocity * dt;
    apply();
    if (Math.abs(value - rest) > 0.01 || Math.abs(velocity) > 0.01) raf = requestAnimationFrame(tick);
    else { value = rest; velocity = 0; apply(); }
  };
  const run = () => { if (!raf) raf = requestAnimationFrame(tick); };

  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    const w = el.offsetWidth || 1, h = el.offsetHeight || 1;
    if (w === size.w && h === size.h) return;
    size = { w, h };
    place();
    apply();
    // The map stretches with the box while it moves; it is redrawn for the new shape once the size has settled.
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(setMap, 140);
  });
  ro.observe(el);
  place();
  setMap();
  el.style.setProperty("backdrop-filter", `url(#${id})`);
  el.style.setProperty("-webkit-backdrop-filter", `url(#${id})`);
  el.dataset.glass = shape;

  return {
    id,
    surge(amount = 1) {
      if (reducedMotion()) return;
      velocity += (shape === "circle" ? 6 : 140) * amount;
      run();
    },
    setStrength(s: number) {
      rest = s;
      if (reducedMotion()) { value = s; velocity = 0; apply(); return; }
      run();
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      ro.disconnect();
      filter.remove();
      el.style.removeProperty("backdrop-filter");
      el.style.removeProperty("-webkit-backdrop-filter");
      delete el.dataset.glass;
    },
  };
}
