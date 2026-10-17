/**
 * Space UI effects bus (the web twin of Space Studio's lib/fx.ts). Components fire; the cloud sky (components/ui/space/CloudSky)
 * listens. Nothing happens when nobody listens, so firing is always safe (server-side it is a no-op).
 *
 *  - warp(strength, seconds): a gust; the clouds' drift speeds up and eases back. Small ones (0.3) for navigation, 1 for a sent
 *    prompt, 1.5 for an arrival. (The Space site has its own three.js journey and does not use this.)
 *  - aura(): reserved for an ambient colour shift; nothing listens today.
 *
 * Reduced motion and phones: the sky is still, so warps do nothing.
 */
export const WARP_EVENT = "space:warp";
export const AURA_EVENT = "space:aura";

export type WarpDetail = { strength: number; seconds: number };

function fire<T>(name: string, detail?: T) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export const spaceFx = {
  warp(strength = 0.35, seconds = 0.9) {
    fire<WarpDetail>(WARP_EVENT, { strength: Math.max(0, Math.min(1.5, strength)), seconds: Math.max(0.4, seconds) });
  },
  /** A prompt or another big action: aura shifts and a full warp jump. */
  prompt() {
    fire(AURA_EVENT);
    spaceFx.warp(1, 1.7);
  },
  aura() {
    fire(AURA_EVENT);
  },
  onWarp(cb: (d: WarpDetail) => void): () => void {
    const h = (e: Event) => cb((e as CustomEvent<WarpDetail>).detail ?? { strength: 0.35, seconds: 0.9 });
    window.addEventListener(WARP_EVENT, h);
    return () => window.removeEventListener(WARP_EVENT, h);
  },
  onAura(cb: () => void): () => void {
    window.addEventListener(AURA_EVENT, cb);
    return () => window.removeEventListener(AURA_EVENT, cb);
  },
};
