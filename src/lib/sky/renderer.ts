/**
 * The live weather sky: a WebGL2 volumetric cloud renderer (shaders in src/lib/sky/shaders.ts, looks in src/lib/sky/variants.ts).
 *
 * Used two ways: by WeatherSky (src/components/ui/space/WeatherSky.tsx) on desktop, after the page is idle, in place of the
 * pre-rendered still; and offline by scripts/sky/render-stills.mts, which renders those stills with this same code in headless
 * Chromium. No DOM beyond the canvas, no network.
 */
import { COMPOSITE_FRAG, CLOUD_FRAG, NOISE_FRAG, VERT } from "@/lib/sky/shaders";
import { skyLook, STILL_LARGE, type SkyLook, type SkyTheme, type SkyVariant } from "@/lib/sky/variants";

const SHAPE_SIZE = 128;
const DETAIL_SIZE = 32;

function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2)) as [number, number, number];
}
/** Inverse of the shader's ACES fit, so a colour given as a display hex comes out as that hex. */
function invAces(y: number): number {
  const v = Math.min(Math.max(y, 0), 0.985);
  const A = 2.51 - 2.43 * v;
  const B = 0.03 - 0.59 * v;
  const C = -0.14 * v;
  return (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
}
const display = (hex: string) => hexToLinear(hex).map(invAces) as [number, number, number];

export type PrecipCode = 0 | 1 | 2 | 3;
const PRECIP: Record<SkyLook["precip"], PrecipCode> = { none: 0, drizzle: 1, rain: 2, snow: 3 };

export interface SkyFrameOptions {
  /** Seconds since the scene started (drives the drift and the particles). */
  time: number;
  /** Lightning brightness 0..1 and where it is (0..1 screen coordinates). */
  flash?: number;
  flashX?: number;
  flashY?: number;
}

export interface SkyRendererOptions {
  /** Cloud pass resolution as a fraction of the canvas (1/3 live, 1 for stills). */
  scale: number;
  /** View-ray steps (32-64). */
  steps: number;
  /** Frame-to-frame blend of the cloud pass (1 = no history). */
  history: number;
  /** Device pixels per CSS pixel of the output (sizes the stars and the particles). */
  px: number;
  /** Aspect ratio of the still this frame must line up with. */
  refAspect?: number;
}

function compile(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const prog = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`sky shader: ${gl.getShaderInfoLog(sh)}`);
    gl.attachShader(prog, sh);
  }
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`sky program: ${gl.getProgramInfoLog(prog)}`);
  return prog;
}

export class SkyRenderer {
  readonly gl: WebGL2RenderingContext;
  private noise: WebGLProgram;
  private cloud: WebGLProgram;
  private comp: WebGLProgram;
  private shape: WebGLTexture;
  private detail: WebGLTexture;
  private target: WebGLTexture | null = null;
  private fbo: WebGLFramebuffer;
  private tw = 0;
  private th = 0;
  private frameNo = 0;
  private look: SkyLook = skyLook("partly-cloudy", "light");
  private night = false;
  private wind = 1;
  private loc = new Map<string, WebGLUniformLocation | null>();
  opts: SkyRendererOptions;

  /** `null` when WebGL2 (or rendering into its 3D textures) is missing. */
  static create(canvas: HTMLCanvasElement, opts: SkyRendererOptions, attrs: WebGLContextAttributes = {}): SkyRenderer | null {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "low-power", ...attrs });
    if (!gl) return null;
    try {
      return new SkyRenderer(gl, opts);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext, opts: SkyRendererOptions) {
    this.gl = gl;
    this.opts = opts;
    this.noise = compile(gl, NOISE_FRAG);
    this.cloud = compile(gl, CLOUD_FRAG);
    this.comp = compile(gl, COMPOSITE_FRAG);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.shape = this.volume(SHAPE_SIZE);
    this.detail = this.volume(DETAIL_SIZE);
    this.fbo = gl.createFramebuffer()!;
  }

  private volume(size: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA8, size, size, size);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private u(prog: WebGLProgram, name: string) {
    const key = `${prog === this.noise ? "n" : prog === this.cloud ? "c" : "k"}:${name}`;
    if (!this.loc.has(key)) this.loc.set(key, this.gl.getUniformLocation(prog, name));
    return this.loc.get(key) ?? null;
  }

  /**
   * Bake the noise volumes, a few slices per call to `pace` (so a page never stalls on it). Resolves when both are ready.
   * Throws if the GPU cannot render into them.
   */
  async bake(pace: () => Promise<void> = async () => {}, slicesPerStep = 16) {
    const gl = this.gl;
    gl.useProgram(this.noise);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    for (const [tex, size, kind] of [[this.shape, SHAPE_SIZE, 0], [this.detail, DETAIL_SIZE, 1]] as const) {
      gl.viewport(0, 0, size, size);
      gl.uniform1f(this.u(this.noise, "uSize"), size);
      gl.uniform1i(this.u(this.noise, "uKind"), kind);
      for (let z = 0; z < size; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, 0, z);
        if (z === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("sky: 3D noise not renderable");
        gl.uniform1f(this.u(this.noise, "uZ"), (z + 0.5) / size);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if ((z + 1) % slicesPerStep === 0) {
          gl.flush();
          await pace();
        }
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setLook(variant: SkyVariant, theme: SkyTheme, wind = 1) {
    this.look = skyLook(variant, theme);
    this.night = theme === "dark";
    this.wind = wind;
    this.frameNo = 0; // restart the history so the new weather appears at once
  }

  /** Size the canvas (device pixels) and the low-resolution cloud target. */
  resize(width: number, height: number) {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const tw = Math.max(1, Math.round(width * this.opts.scale));
    const th = Math.max(1, Math.round(height * this.opts.scale));
    if (tw === this.tw && th === this.th && this.target) return;
    if (this.target) gl.deleteTexture(this.target);
    this.target = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.target);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, tw, th);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tw = tw;
    this.th = th;
    this.frameNo = 0;
  }

  /** Render the cloud pass only (into the low-resolution target), blending with the frames before it. */
  clouds(time: number, history = this.opts.history) {
    const gl = this.gl;
    const L = this.look;
    const c = this.cloud;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target, 0);
    gl.viewport(0, 0, this.tw, this.th);
    gl.useProgram(c);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this.shape);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.detail);
    gl.uniform1i(this.u(c, "uShape"), 0);
    gl.uniform1i(this.u(c, "uDetail"), 1);
    gl.uniform2f(this.u(c, "uRes"), this.tw, this.th);
    gl.uniform1f(this.u(c, "uRefAspect"), this.opts.refAspect ?? STILL_LARGE.width / STILL_LARGE.height);
    gl.uniform1f(this.u(c, "uTime"), time);
    gl.uniform1f(this.u(c, "uFrame"), this.frameNo % 64);
    gl.uniform1i(this.u(c, "uSteps"), this.opts.steps);
    const az = (L.sunAz * Math.PI) / 180;
    const el = (L.sunEl * Math.PI) / 180;
    gl.uniform3f(this.u(c, "uSunDir"), Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const sun = hexToLinear(L.sun).map((v) => v * L.sunPower);
    gl.uniform3f(this.u(c, "uSunCol"), sun[0]!, sun[1]!, sun[2]!);
    gl.uniform3fv(this.u(c, "uAmbTop"), display(L.ambTop));
    gl.uniform3fv(this.u(c, "uAmbBot"), display(L.ambBot));
    gl.uniform3fv(this.u(c, "uZenith"), display(L.zenith));
    gl.uniform3fv(this.u(c, "uHorizon"), display(L.horizon));
    gl.uniform1f(this.u(c, "uBase"), L.base);
    gl.uniform1f(this.u(c, "uTop"), L.top);
    gl.uniform1f(this.u(c, "uCoverage"), L.coverage);
    gl.uniform1f(this.u(c, "uDensity"), L.density);
    gl.uniform1f(this.u(c, "uDetailAmt"), L.detail);
    gl.uniform1f(this.u(c, "uBillow"), L.billow);
    gl.uniform1f(this.u(c, "uClearing"), L.clearing);
    gl.uniform1f(this.u(c, "uVis"), L.visibility);
    gl.uniform1f(this.u(c, "uGray"), L.gray);
    gl.uniform1f(this.u(c, "uExposure"), L.exposure);
    gl.uniform2f(this.u(c, "uWind"), 0.011 * this.wind, 0.003 * this.wind);
    const a = this.frameNo === 0 ? 1 : history;
    if (a < 1) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, a);
    } else gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    this.frameNo++;
  }

  /** Upscale the cloud pass to the canvas and add stars, precipitation and lightning. */
  composite(o: SkyFrameOptions) {
    const gl = this.gl;
    const L = this.look;
    const k = this.comp;
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(k);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.target);
    gl.uniform1i(this.u(k, "uCloud"), 0);
    gl.uniform2f(this.u(k, "uRes"), canvas.width, canvas.height);
    gl.uniform1f(this.u(k, "uRefAspect"), this.opts.refAspect ?? STILL_LARGE.width / STILL_LARGE.height);
    gl.uniform1f(this.u(k, "uTime"), o.time);
    gl.uniform1f(this.u(k, "uStars"), this.night ? L.stars : 0);
    gl.uniform1i(this.u(k, "uPrecip"), PRECIP[L.precip]);
    gl.uniform1f(this.u(k, "uPrecipAmt"), L.precipAmount);
    gl.uniform1f(this.u(k, "uSlant"), -0.12 * Math.min(this.wind, 2));
    gl.uniform1f(this.u(k, "uFlash"), L.lightning ? (o.flash ?? 0) : 0);
    gl.uniform2f(this.u(k, "uFlashPos"), o.flashX ?? 0.3, o.flashY ?? 0.75);
    gl.uniform1f(this.u(k, "uNight"), this.night ? 1 : 0);
    gl.uniform1f(this.u(k, "uPx"), this.opts.px);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  frame(o: SkyFrameOptions) {
    this.clouds(o.time);
    this.composite(o);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.shape);
    gl.deleteTexture(this.detail);
    if (this.target) gl.deleteTexture(this.target);
    gl.deleteFramebuffer(this.fbo);
    for (const p of [this.noise, this.cloud, this.comp]) gl.deleteProgram(p);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
