"use client";
/**
 * Browser-side media preparation for the composer. Nothing here uploads
 * anything. Images keep their original bytes and format whenever they fit the
 * request (up to 4096 px on the long edge); only when they don't is the image
 * scaled down, and then resolution is given up before quality (lossless PNG
 * first for PNG sources, JPEG at 0.92 otherwise). Videos are sampled into
 * still frames. Results stay in memory as data URLs until the message is sent.
 *
 * Why the budget: Vercel caps request bodies at ~4.5 MB, so the whole message
 * (all images, as base64) has to fit under MEDIA_LIMITS.maxTotalDataUrlChars. See media.ts.
 */
import { fmtClock, frameTimes, framesFor, IMAGE_MIME, MEDIA_LIMITS, VIDEO_MIME, type ImageInput } from "@/lib/orchestration/media";
import { candidatesFor, selectKeyframes } from "@/lib/attachments/keyframes";

export type MediaKind = "image" | "video";

export type ComposerMedia = {
  id: string;
  kind: MediaKind;
  name: string;
  /** Original file size (bytes). */
  bytes: number;
  status: "processing" | "ready";
  /** Small preview (data URL). */
  thumb?: string;
  /** The original file, kept in memory so the image can be re-fitted when more images are added. */
  file?: File;
  /** Object URL of the original, for full-quality viewing in the thread. */
  full?: string;
  /** 0..1 while preparing (video frames); undefined = indeterminate. */
  progress?: number;
  /** True when the original bytes are sent unchanged. */
  original?: boolean;
  /** True when the sent pixels are fewer than the source's (resolution given up to fit the request). */
  resized?: boolean;
  /** What is sent: one image, or the sampled frames of a video. */
  images: ImageInput[];
  durationSec?: number;
};

/** Video frames stay small: up to 16 of them travel with the images. */
const FRAME_TARGET_CHARS = 70_000;
/** Reserve for the prompt, history and JSON around the images. */
export const IMAGE_BUDGET_TOTAL = MEDIA_LIMITS.maxTotalDataUrlChars;
/** Resolutions tried, largest first, when an image has to be fitted. */
const EDGE_STEPS = [4096, 3584, 3072, 2560, 2048, 1792, 1536, 1280, 1024, 768];

const EXT_KIND: Record<string, { kind: MediaKind; mime: string }> = {
  png: { kind: "image", mime: "image/png" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  webp: { kind: "image", mime: "image/webp" },
  gif: { kind: "image", mime: "image/gif" },
  mp4: { kind: "video", mime: "video/mp4" },
  m4v: { kind: "video", mime: "video/mp4" },
  webm: { kind: "video", mime: "video/webm" },
  mov: { kind: "video", mime: "video/quicktime" },
};

/** Kind from the browser-reported MIME type, falling back to the extension. Null = not accepted. */
export function kindOf(file: File): MediaKind | null {
  if ((IMAGE_MIME as readonly string[]).includes(file.type)) return "image";
  if ((VIDEO_MIME as readonly string[]).includes(file.type)) return "video";
  if (file.type && !/^(application\/octet-stream)?$/.test(file.type)) return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_KIND[ext]?.kind ?? null;
}

export const ACCEPT = [...IMAGE_MIME, ...VIDEO_MIME, ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".webm", ".mov"].join(",");

export const UNSUPPORTED = "Attach PNG, JPG, WebP or GIF images, or an MP4, WebM or MOV video.";

export const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
export { fmtClock };

function canvasFor(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Draw a source onto a white canvas (transparent PNG/WebP/GIF → JPEG without black areas). */
function draw(src: CanvasImageSource, sw: number, sh: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const c = canvasFor(sw * scale, sh * scale);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** JPEG-encode, stepping quality then size down until it fits the budget. */
function encode(src: CanvasImageSource, sw: number, sh: number, maxEdge: number, targetChars: number) {
  let edge = Math.min(maxEdge, Math.max(sw, sh));
  for (let round = 0; round < 6; round++) {
    const c = draw(src, sw, sh, edge);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= targetChars) return { dataUrl: url, width: c.width, height: c.height };
    }
    edge = Math.round(edge * 0.75);
  }
  const c = draw(src, sw, sh, 384);
  return { dataUrl: c.toDataURL("image/jpeg", 0.5), width: c.width, height: c.height };
}

/** Draw keeping transparency (for PNG output). */
function drawAlpha(src: CanvasImageSource, sw: number, sh: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(sw, sh));
  const c = canvasFor(sw * scale, sh * scale);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * Fit one image into `budget` data-URL characters with as little loss as possible: for each resolution from the
 * 4096 px cap downwards try PNG (PNG sources only: lossless, best for screenshots and text), then JPEG at 0.92,
 * and only then a smaller resolution. JPEG quality never goes below 0.88.
 */
function fit(src: CanvasImageSource, sw: number, sh: number, budget: number, prefersPng: boolean) {
  const long = Math.max(sw, sh);
  const edges = [...new Set([Math.min(long, MEDIA_LIMITS.imageMaxEdge), ...EDGE_STEPS.filter((e) => e < Math.min(long, MEDIA_LIMITS.imageMaxEdge))])];
  for (const edge of edges) {
    if (prefersPng) {
      const c = drawAlpha(src, sw, sh, edge);
      const url = c.toDataURL("image/png");
      if (url.length <= budget) return { dataUrl: url, width: c.width, height: c.height };
    }
    const c = draw(src, sw, sh, edge);
    for (const q of [0.92, 0.88]) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= budget) return { dataUrl: url, width: c.width, height: c.height };
    }
  }
  const c = draw(src, sw, sh, 512);
  return { dataUrl: c.toDataURL("image/jpeg", 0.85), width: c.width, height: c.height };
}

/** EXIF orientation (1 = upright) of a JPEG, read from its first bytes. Anything else returns 1. */
export function jpegOrientation(head: Uint8Array): number {
  if (head.length < 4 || head[0] !== 0xff || head[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < head.length) {
    if (head[i] !== 0xff) return 1;
    const marker = head[i + 1];
    const len = (head[i + 2] << 8) | head[i + 3];
    if (marker === 0xe1 && head[i + 4] === 0x45 && head[i + 5] === 0x78) {
      const t = i + 10; // TIFF header
      const le = head[t] === 0x49;
      const u16 = (o: number) => (le ? head[o] | (head[o + 1] << 8) : (head[o] << 8) | head[o + 1]);
      const u32 = (o: number) => (le ? (head[o] | (head[o + 1] << 8) | (head[o + 2] << 16) | (head[o + 3] << 24)) >>> 0 : ((head[o] << 24) | (head[o + 1] << 16) | (head[o + 2] << 8) | head[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 12 > head.length) return 1;
        if (u16(e) === 0x0112) return u16(e + 8) || 1;
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    i += 2 + len;
  }
  return 1;
}

const readDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read"));
    r.readAsDataURL(blob);
  });

async function loadImage(file: File): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Prepare one image for sending. The original file is sent byte for byte (same format, no re-encoding) when it is a
 * PNG/JPEG/WebP, fits `budget` and is at most 4096 px on the long edge. Otherwise it is fitted (see `fit`).
 * GIFs keep their first frame, as lossless PNG when it fits.
 */
export async function prepareImage(file: File, budget: number = IMAGE_BUDGET_TOTAL): Promise<Pick<ComposerMedia, "thumb" | "images" | "full" | "original" | "resized">> {
  const { src, w, h, close } = await loadImage(file);
  try {
    if (!w || !h) throw new Error("empty");
    const thumb = draw(src, w, h, 320).toDataURL("image/jpeg", 0.85);
    const full = URL.createObjectURL(file);
    const mime = file.type || "";
    const sendable = mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";
    if (sendable && Math.max(w, h) <= MEDIA_LIMITS.imageMaxEdge && file.size * 1.4 <= budget) {
      let upright = true;
      if (mime === "image/jpeg") upright = jpegOrientation(new Uint8Array(await file.slice(0, 65_536).arrayBuffer())) === 1;
      if (upright) {
        const dataUrl = await readDataUrl(file);
        if (dataUrl.length <= budget) return { thumb, full, original: true, resized: false, images: [{ dataUrl, width: w, height: h, name: file.name }] };
      }
    }
    const out = fit(src, w, h, budget, mime === "image/png" || mime === "image/gif");
    return { thumb, full, original: false, resized: out.width < w || out.height < h, images: [{ ...out, name: file.name }] };
  } finally {
    close();
  }
}

function once(el: HTMLMediaElement, ok: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, ms);
    const onOk = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error("decode")); };
    const cleanup = () => { clearTimeout(t); el.removeEventListener(ok, onOk); el.removeEventListener("error", onErr); };
    el.addEventListener(ok, onOk);
    el.addEventListener("error", onErr);
  });
}

export class VideoTooLongError extends Error {}

/**
 * Sample a video into still frames (8 for ≤ 20 s, 12 for ≤ 60 s, 16 up to 3 min),
 * each ≤ 768 px JPEG, plus its duration. Frames go to vision models labelled as
 * video frames with timestamps.
 */
export async function prepareVideo(file: File, onProgress?: (done: number, total: number) => void): Promise<Pick<ComposerMedia, "thumb" | "images" | "durationSec">> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  try {
    const meta = once(v, "loadeddata", 20_000);
    v.src = url;
    await meta;
    let duration = v.duration;
    if (!Number.isFinite(duration)) {
      // Some WebM files report Infinity until the end is reached.
      const seeked = once(v, "seeked", 10_000);
      v.currentTime = 1e7;
      await seeked;
      duration = v.duration;
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("duration");
    if (duration > MEDIA_LIMITS.maxVideoSeconds + 0.5) throw new VideoTooLongError();
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) throw new Error("no-video-track");
    // Scene-aware keyframes: sample ~2.5× the frames we send, keep a 16×9 luma signature of each, then keep the frames
    // that cover the biggest visual changes (cuts, new slides) plus even coverage (lib/attachments/keyframes.ts).
    const n = framesFor(duration);
    const times = frameTimes(duration, candidatesFor(n));
    const sigCanvas = canvasFor(16, 9);
    const sigCtx = sigCanvas.getContext("2d", { willReadFrequently: true });
    const cands: { f: { dataUrl: string; width: number; height: number }; at: number; sig: Uint8Array }[] = [];
    let thumb: string | undefined;
    for (let i = 0; i < times.length; i++) {
      const seeked = once(v, "seeked", 10_000);
      v.currentTime = Math.min(times[i], Math.max(0, duration - 0.05));
      await seeked;
      const f = encode(v, w, h, MEDIA_LIMITS.frameMaxEdge, FRAME_TARGET_CHARS);
      let sig = new Uint8Array(144);
      if (sigCtx) {
        sigCtx.drawImage(v, 0, 0, 16, 9);
        const px = sigCtx.getImageData(0, 0, 16, 9).data;
        sig = new Uint8Array(144);
        for (let k = 0; k < 144; k++) sig[k] = Math.round(0.299 * px[k * 4] + 0.587 * px[k * 4 + 1] + 0.114 * px[k * 4 + 2]);
      }
      cands.push({ f, at: times[i], sig });
      if (i === 0) thumb = draw(v, w, h, 320).toDataURL("image/jpeg", 0.8);
      onProgress?.(i + 1, times.length);
    }
    const keep = selectKeyframes(cands.map((c) => c.sig), cands.map((c) => c.at), n);
    const images: ImageInput[] = keep.map((k, idx) => ({ ...cands[k].f, name: file.name, frame: { index: idx, of: keep.length, atSec: cands[k].at, video: file.name } }));
    return { thumb, images, durationSec: +duration.toFixed(2) };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

/** Total data URL characters the items would add to the request. */
export const mediaChars = (items: ComposerMedia[]) => items.reduce((a, m) => a + m.images.reduce((b, i) => b + i.dataUrl.length, 0), 0);
