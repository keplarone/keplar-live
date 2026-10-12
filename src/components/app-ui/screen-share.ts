"use client";
/**
 * Keplar Vision on the web: share a screen, window or tab with Keplar, explicitly.
 *
 *  - Only through the browser's own screen picker (getDisplayMedia): the person chooses what to share, and the browser shows
 *    its own "sharing" indicator. Nothing is ever captured in the background: a frame is taken when sharing starts and each time
 *    the person presses Capture, and it becomes an ordinary image attachment (the same type, size and count checks as any
 *    screenshot; nothing is uploaded until Send).
 *  - An unchanged screen is not attached again (frameSignature), so the models are not sent identical screenshots.
 *  - Sharing ends when the person presses Stop, stops it from the browser's own bar, or after SHARE_TIMEOUT_MS.
 * A web page cannot read other apps on its own; the desktop app needs its own permission handler for this to work there.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const SHARE_TIMEOUT_MS = 15 * 60_000;
const SIG_W = 32;
const SIG_H = 18;

/**
 * A coarse fingerprint of a frame: average brightness per cell on a 32x18 grid, in 16 levels. Two frames with the same
 * fingerprint look the same to a person (a blinking cursor or a clock tick does not change it; a new window or page does). Pure.
 */
export function frameSignature(rgba: Uint8ClampedArray | number[], width: number, height: number): string {
  const cells = new Array<number>(SIG_W * SIG_H).fill(0);
  const counts = new Array<number>(SIG_W * SIG_H).fill(0);
  for (let y = 0; y < height; y++) {
    const cy = Math.min(SIG_H - 1, Math.floor((y * SIG_H) / height));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(SIG_W - 1, Math.floor((x * SIG_W) / width));
      const i = (y * width + x) * 4;
      const lum = 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0);
      cells[cy * SIG_W + cx] += lum;
      counts[cy * SIG_W + cx] += 1;
    }
  }
  return cells.map((v, i) => Math.min(15, Math.floor((counts[i] ? v / counts[i] : 0) / 16)).toString(16)).join("");
}

/** Where a capture can't start, in words a person can act on. */
export function shareErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError") return "Screen sharing was cancelled or blocked. Nothing was captured.";
  if (name === "NotFoundError") return "No screen, window or tab was available to share.";
  if (name === "NotSupportedError" || name === "TypeError") return "This browser can't share a screen with Keplar. Try Chrome, Edge, Firefox or Safari on a computer.";
  return "Screen sharing didn't start. Nothing was captured.";
}

/** What is being shared, in words (track labels are opaque ids like "screen:0:0", so they are never shown). */
export function surfaceLabel(surface: unknown): string {
  if (surface === "window") return "a window";
  if (surface === "browser") return "a tab";
  return "your screen";
}

type Share = { active: boolean; label: string; start: () => Promise<void>; capture: () => Promise<void>; stop: () => void };

export function useScreenShare(onFrame: (file: File) => void, onNote: (message: string) => void): Share {
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const lastSig = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) { video.current.srcObject = null; video.current = null; }
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    lastSig.current = null;
    setActive(false);
    setLabel("");
  }, []);

  const capture = useCallback(async () => {
    const v = video.current;
    if (!v || !stream.current) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) { onNote("The shared screen isn't ready yet. Try Capture again in a moment."); return; }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const small = document.createElement("canvas");
    small.width = 128;
    small.height = 72;
    const sctx = small.getContext("2d");
    sctx?.drawImage(canvas, 0, 0, 128, 72);
    const sig = sctx ? frameSignature(sctx.getImageData(0, 0, 128, 72).data, 128, 72) : null;
    if (sig && sig === lastSig.current) { onNote("Your screen hasn't changed since the last capture, so nothing new was attached."); return; }
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) { onNote("That capture didn't work. Try again."); return; }
    lastSig.current = sig;
    const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, "-");
    onFrame(new File([blob], `screen-${stamp}.png`, { type: "image/png" }));
  }, [onFrame, onNote]);

  const start = useCallback(async () => {
    if (stream.current) { await capture(); return; }
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getDisplayMedia) { onNote(shareErrorMessage({ name: "NotSupportedError" })); return; }
    try {
      const s = await md.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      const track = s.getVideoTracks()[0];
      if (!track) { s.getTracks().forEach((t) => t.stop()); onNote(shareErrorMessage({ name: "NotFoundError" })); return; }
      track.addEventListener("ended", stop);
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s;
      await v.play();
      stream.current = s;
      video.current = v;
      setLabel(surfaceLabel(track.getSettings?.().displaySurface));
      setActive(true);
      timer.current = window.setTimeout(() => { stop(); onNote("Screen sharing stopped after 15 minutes. Share again when you need it."); }, SHARE_TIMEOUT_MS);
      // Give the first frame a moment to arrive, then attach it (sharing was the explicit request).
      await new Promise((r) => window.setTimeout(r, 250));
      await capture();
    } catch (e) {
      stop();
      onNote(shareErrorMessage(e));
    }
  }, [capture, onNote, stop]);

  useEffect(() => stop, [stop]);
  return { active, label, start, capture, stop };
}
