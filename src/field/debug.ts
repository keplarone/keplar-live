/** ?fxdebug=1: a tiny overlay with tier, fps, particle count, pixel ratio and the reason for any downgrade. No-op otherwise. */
export type FxInfo = { layer: string; tier?: string; mode?: string; fps?: number; dpr?: number; count?: number; reason?: string; note?: string };

const rows = new Map<string, FxInfo>();
let el: HTMLElement | null = null;

export const fxDebugOn = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fxdebug") === "1";

export function fxDebug(i: FxInfo) {
  if (!fxDebugOn()) return;
  rows.set(i.layer, { ...rows.get(i.layer), ...i });
  if (!el) {
    el = document.createElement("pre");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;margin:0;padding:6px 8px;border-radius:8px;background:rgba(8,12,24,.82);color:#e9e9ec;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;max-width:min(560px,92vw);white-space:pre-wrap";
    document.body.append(el);
  }
  el.textContent = [...rows.values()]
    .map((r) => `${r.layer}: tier ${r.tier ?? "?"} · ${r.mode ?? "?"} · ${r.fps ?? "-"} fps · dpr ${r.dpr ?? "-"} · ${r.count ?? "-"} pts${r.reason ? `\n  why: ${r.reason}` : ""}${r.note ? `\n  ${r.note}` : ""}`)
    .join("\n");
}

export function fxDebugClear(layer: string) {
  rows.delete(layer);
  if (rows.size === 0 && el) { el.remove(); el = null; }
}
