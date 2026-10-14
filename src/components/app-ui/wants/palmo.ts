/**
 * Palmo, Keplar's desktop companion (keplar-desktop src/main/palmo). On keplar.one/app/* inside the Keplar desktop app the
 * preload exposes window.keplarPalmo; in a normal browser it is absent and Keplar Wants falls back to opening the page for the
 * person to finish. Palmo pops up its character, works on the person's screen and always asks before consequential steps
 * (paying, sending, signing in) in its own approval bar: Keplar Wants never bypasses that.
 */
export type PalmoMode = "guide" | "with_me" | "for_me";
export type PalmoStatus = { state?: string; say?: string; answer?: string; reason?: string; [k: string]: unknown };

type PalmoBridge = {
  version: number;
  open(): Promise<unknown>;
  ask(text: string, mode?: PalmoMode): Promise<unknown>;
  stop(): Promise<unknown>;
  status(): Promise<unknown>;
  onStatus(listener: (status: unknown) => void): () => void;
};

type StudioBridge = { version: number; status(): Promise<unknown>; connect(): Promise<unknown> };

export const palmo = (): PalmoBridge | null => (typeof window === "undefined" ? null : ((window as unknown as { keplarPalmo?: PalmoBridge }).keplarPalmo ?? null));
export const studioBridge = (): StudioBridge | null => (typeof window === "undefined" ? null : ((window as unknown as { keplarStudio?: StudioBridge }).keplarStudio ?? null));

/** Opens Palmo and hands it the task in "for me" mode (it carries it out, asking only before consequential steps). */
export async function launchPalmo(goal: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = palmo();
  if (!p) return { ok: false, error: "Palmo runs in the Keplar desktop app." };
  try {
    await p.open();
    await p.ask(goal, "for_me");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Palmo couldn't start." };
  }
}

/* ── purchase PIN: a per-device confirmation step (not a password: it stops accidental orders, it is not account security) ── */

const PIN_KEY = "keplar:wants:pin";

async function hash(pin: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`keplar-wants:${pin}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hasPin(): boolean {
  try { return Boolean(localStorage.getItem(PIN_KEY)); } catch { return false; }
}

export async function setPin(pin: string): Promise<boolean> {
  if (!/^\d{4,6}$/.test(pin)) return false;
  try { localStorage.setItem(PIN_KEY, await hash(pin)); return true; } catch { return false; }
}

export async function checkPin(pin: string): Promise<boolean> {
  try { const h = localStorage.getItem(PIN_KEY); return Boolean(h) && h === (await hash(pin)); } catch { return false; }
}

/* ── saved delivery service ("save for future purchases") ── */

const DELIVERY_KEY = "keplar:wants:delivery";
export type DeliveryService = "doordash" | "ubereats" | "grubhub";

export function savedDelivery(): DeliveryService | null {
  try { const v = localStorage.getItem(DELIVERY_KEY); return v === "doordash" || v === "ubereats" || v === "grubhub" ? v : null; } catch { return null; }
}

export function saveDelivery(v: DeliveryService | null) {
  try { if (v) localStorage.setItem(DELIVERY_KEY, v); else localStorage.removeItem(DELIVERY_KEY); } catch { /* storage off: asked again next time */ }
}
