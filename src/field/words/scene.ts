import { NormalBlending, BufferAttribute, BufferGeometry, PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer } from "three";
import { PHRASES } from "./glyphs";
import { WORD_FRAG, WORD_VERT } from "./glsl";

export type WordQuality = "low" | "medium" | "high";

export type WordOptions = {
  canvas: HTMLCanvasElement;
  quality: WordQuality;
  mobile: boolean;
  /** Reduced motion: dots stay put. No loop. */
  still: boolean;
  theme: "dark" | "light";
  /** Dark paints the graphite night. Light is transparent so the page shows through. */
  opaque: boolean;
  onFirstFrame?: () => void;
  onLost?: () => void;
};

const COUNTS: Record<WordQuality, number> = { high: 1600, medium: 1000, low: 480 };
const FOV = 38;

/** Star colours, numeric only. White, warm white, gold, peach, and a cool white. */
const STAR: [number, number, number][] = [
  [1, 0.98, 0.94],
  [1, 0.93, 0.8],
  [1, 0.8, 0.5],
  [0.98, 0.7, 0.46],
  [0.9, 0.94, 1],
];

/** A sparse star field. Each point is a different size, with its own soft glow. The pointer parts them. */
export class WordScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private cam: PerspectiveCamera;
  private points: Points;
  private geo: BufferGeometry;
  private mat: ShaderMaterial;
  private pos: Float32Array;
  private home: Float32Array;
  private vel: Float32Array;
  private n: number;
  private still: boolean;
  private dprCap: number;
  private hidden = false;
  private visible = true;
  private raf = 0;
  private first = false;
  private pointer = false;
  private mx = 0;
  private my = 0;
  private burst = 0;
  private converging = false;
  private convergeLeft = 0;
  private convergeDone: (() => void) | null = null;
  private onVis: () => void;
  private onLostContext: (e: Event) => void;

  constructor(private o: WordOptions) {
    this.still = o.still;
    this.hidden = document.hidden;
    this.dprCap = o.mobile ? 1.15 : o.quality === "low" ? 1.2 : 1.5;
    const count = Math.round(COUNTS[o.quality] * (o.mobile ? 0.7 : 1));
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.home = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const light = o.theme === "light";
    const salt = PHRASES[0].length;
    for (let i = 0; i < count; i++) {
      const x = (hash(i + salt) - 0.5) * 5.4;
      const y = (hash(i + 19) - 0.5) * 3.2;
      this.home[i * 3] = x;
      this.home[i * 3 + 1] = y;
      this.home[i * 3 + 2] = (hash(i + 41) - 0.5) * 0.8;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = this.home[i * 3 + 2];
      const pick = STAR[Math.floor(hash(i + 7) * STAR.length) % STAR.length];
      const ink = light ? 0.28 + hash(i + 11) * 0.35 : 1;
      color[i * 3] = light ? pick[0] * ink : pick[0];
      color[i * 3 + 1] = light ? pick[1] * ink : pick[1];
      color[i * 3 + 2] = light ? pick[2] * ink : pick[2];
      const roll = hash(i + 5);
      size[i] = roll > 0.97 ? 16 + hash(i + 2) * 10 : roll > 0.9 ? 7 + hash(i + 4) * 6 : 2.4 + hash(i + 6) * 3.2;
      phase[i] = hash(i + 13) * 6.28;
    }
    this.geo = new BufferGeometry();
    this.geo.setAttribute("position", new BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aColor", new BufferAttribute(color, 3));
    this.geo.setAttribute("aSize", new BufferAttribute(size, 1));
    this.geo.setAttribute("aPhase", new BufferAttribute(phase, 1));
    this.mat = new ShaderMaterial({
      vertexShader: WORD_VERT,
      fragmentShader: WORD_FRAG,
      transparent: true,
      depthWrite: false,
      blending: light ? NormalBlending : NormalBlending,
      uniforms: { uTime: { value: 0 } },
    });
    this.points = new Points(this.geo, this.mat);
    this.scene.add(this.points);
    this.cam = new PerspectiveCamera(FOV, 1, 0.1, 40);
    this.cam.position.set(0, 0, 6.2);
    this.renderer = new WebGLRenderer({ canvas: o.canvas, alpha: !o.opaque, antialias: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(o.opaque ? 0x0b0b0d : 0x000000, o.opaque ? 1 : 0);
    this.onVis = () => {
      this.hidden = document.hidden;
      if (!this.hidden && !this.still && this.visible) this.loop();
    };
    this.onLostContext = (e: Event) => { e.preventDefault(); this.o.onLost?.(); };
    document.addEventListener("visibilitychange", this.onVis);
    o.canvas.addEventListener("webglcontextlost", this.onLostContext);
    this.resize();
  }

  resize() {
    const c = this.o.canvas;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    this.dprCap = Math.min(this.dprCap, 1.6);
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    if (this.still) this.draw();
  }

  setVisible(on: boolean) {
    this.visible = on;
    if (on && !this.hidden && !this.still) this.loop();
    else if (!on && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  /** Pointer in canvas space, -1..1. Particles near it move away. */
  setPointer(x: number, y: number, on: boolean) {
    this.pointer = on;
    const halfH = Math.tan((FOV * Math.PI) / 360) * this.cam.position.z;
    const halfW = halfH * (this.cam.aspect || 1);
    this.mx = x * halfW;
    this.my = y * halfH;
  }

  /** A keystroke gives the field a small shove. */
  agitate(n: number) { this.burst = Math.min(0.22, this.burst + n * 0.35); }

  setFocus(on: boolean) { if (!on) this.pointer = false; }

  /** A short pull inward, then the dots spring home. Resolves either way. */
  converge(): Promise<void> {
    if (this.still) return Promise.resolve();
    this.converging = true;
    this.convergeLeft = 28;
    return new Promise((resolve) => { this.convergeDone = resolve; });
  }

  start() {
    this.draw();
    if (!this.still) this.loop();
  }

  private step() {
    const reach = 0.72;
    const reach2 = reach * reach;
    for (let i = 0; i < this.n; i++) {
      const ix = i * 3;
      const iy = ix + 1;
      let vx = this.vel[ix];
      let vy = this.vel[iy];
      const x = this.pos[ix];
      const y = this.pos[iy];
      if (this.pointer) {
        const dx = x - this.mx;
        const dy = y - this.my;
        const d2 = dx * dx + dy * dy;
        if (d2 < reach2 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (reach - d) / reach;
          vx += (dx / d) * push * 0.11;
          vy += (dy / d) * push * 0.11;
        }
      }
      if (this.burst > 0) {
        vx += (hash(i + 3) - 0.5) * this.burst;
        vy += (hash(i + 9) - 0.5) * this.burst;
      }
      if (this.converging) {
        vx += -x * 0.04;
        vy += -y * 0.04;
      }
      vx += (this.home[ix] - x) * 0.045;
      vy += (this.home[iy] - y) * 0.045;
      vx *= 0.84;
      vy *= 0.84;
      this.vel[ix] = vx;
      this.vel[iy] = vy;
      this.pos[ix] = x + vx;
      this.pos[iy] = y + vy;
    }
    if (this.burst > 0) this.burst *= 0.9;
    if (this.converging) {
      this.convergeLeft -= 1;
      if (this.convergeLeft <= 0) {
        this.converging = false;
        const done = this.convergeDone;
        this.convergeDone = null;
        done?.();
      }
    }
  }

  private draw(time = 0) {
    this.mat.uniforms.uTime.value = time * 0.001;
    (this.geo.getAttribute("position") as BufferAttribute).needsUpdate = true;
    this.renderer.render(this.scene, this.cam);
    if (!this.first) { this.first = true; this.o.onFirstFrame?.(); }
  }

  private loop = () => {
    if (this.hidden || !this.visible || this.still) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    this.step();
    this.draw(now);
  };

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVis);
    this.o.canvas.removeEventListener("webglcontextlost", this.onLostContext);
    this.geo.dispose();
    this.mat.dispose();
    this.renderer.forceContextLoss();
    this.renderer.dispose();
    this.convergeDone?.();
    this.convergeDone = null;
  }
}

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
