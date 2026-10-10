/**
 * Reference images and videos for Studio mode, prepared in the browser before anything is sent: images are scaled to at most
 * 1280px and re-encoded as JPEG; videos are sampled into a few evenly spaced frames (UI motion, VFX timing, gameplay feel), so the
 * model sees the reference without a large upload. Nothing here leaves the page until the person sends the request.
 */
const MAX_SIDE = 1280;
const VIDEO_FRAMES = 6;
const FRAME_SIDE = 960;

function canvasJpeg(source: CanvasImageSource, w: number, h: number, side: number): string {
  const scale = Math.min(1, side / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

async function imageToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  try { return canvasJpeg(bmp, bmp.width, bmp.height, MAX_SIDE); } finally { bmp.close(); }
}

async function videoFrames(file: File, count = VIDEO_FRAMES): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("That video could not be read.")); });
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      v.currentTime = Math.min(d - 0.05, (d * (i + 0.5)) / count);
      await new Promise<void>((res) => { v.onseeked = () => res(); });
      out.push(canvasJpeg(v, v.videoWidth, v.videoHeight, FRAME_SIDE));
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Turns picked files into image data URLs: each image as one, each video as a few frames. */
export async function referencesFromFiles(files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    if (f.type.startsWith("image/")) out.push(await imageToDataUrl(f));
    else if (f.type.startsWith("video/")) out.push(...(await videoFrames(f)));
  }
  return out;
}
