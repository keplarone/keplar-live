/**
 * Keplar Orbit button effects runtime (docs/design/keplar-orbit.md §5). CSS lives in src/styles/orbit/fx.css.
 *
 * One delegated listener set on the document (installed once by <OrbitFx /> in the root layout), never one per button and never a
 * React render on pointermove. A control is "claimed" the first time a pointer reaches it:
 *   - candidates: [data-orbit-fx], <button>, role=button/tab/menuitem*, option, switch, <summary>, and links that look like
 *     controls (not inline text links inside paragraphs);
 *   - it gets data-orbit-fx (its kind: primary, secondary, ghost, danger, icon, chip, segment, menuitem, auto) if it had none,
 *     data-orbit-icon (the icon intent) when its name says what it does, --ofx-ps (press depth by size),
 *     data-ofx-magnet for primary and icon controls. The pointer sheen is not applied.
 * While a fine pointer hovers a claimed control, one rAF writes --mx/--my (sheen position) and, for magnets, --ofx-tx/--ofx-ty
 * (≤ 3px drift). Leaving clears them, and the CSS spring brings the control home. Touch gets press + focus only; reduced motion
 * gets no sheen, magnet or icon motion; disabled controls get nothing.
 */

export type OrbitKind = "primary" | "secondary" | "ghost" | "danger" | "icon" | "chip" | "segment" | "menuitem" | "auto";
export type OrbitIcon = "send" | "plus" | "copy" | "trash" | "chevron" | "refresh";

/** Elements the runtime may claim. Order does not matter; claim() filters further. */
export const ORBIT_CANDIDATES =
  '[data-orbit-fx], button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], summary, a[href]';

/** Largest magnet drift, px (§5.2). */
export const MAGNET_MAX = 3;
/** How long the success check stays before the label returns, ms (§5.6). */
export const SUCCESS_MS = 1600;

/** Drift toward the pointer, clamped to ±max px. */
export function magnetOffset(px: number, py: number, rect: { left: number; top: number; width: number; height: number }, max = MAGNET_MAX, strength = 0.18): [number, number] {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const c = (v: number) => Math.max(-max, Math.min(max, Math.round(v * 10) / 10));
  return [c((px - cx) * strength), c((py - cy) * strength)];
}

/** Press depth: small controls press to .97, wide rows and cards barely move (a whole card shrinking 3% looks broken). */
export function pressScale(width: number): number {
  if (width >= 320) return 0.99;
  if (width >= 160) return 0.98;
  return 0.97;
}

/** Icon intent from a control's accessible name (aria-label, title or text). Null when nothing matches. */
export function iconIntent(name: string): OrbitIcon | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (/^(send|ask keplar|submit)\b/.test(n)) return "send";
  if (/^copy\b/.test(n)) return "copy";
  if (/^(delete|remove|trash|discard)\b/.test(n)) return "trash";
  if (/^(retry|regenerate|refresh|reload|ask again|try again)\b/.test(n)) return "refresh";
  if (/^(new|add|create)\b/.test(n)) return "plus";
  if (/^(next|previous|back|forward|expand|collapse|more|show more|open)\b/.test(n)) return "chevron";
  return null;
}

/** Which effects a pointer gets: "full" (sheen, magnet, micro-motion, press), "press" (touch, reduced motion) or "none". */
export function fxMode(e: { pointerType: string; reducedMotion: boolean; disabled: boolean }): "full" | "press" | "none" {
  if (e.disabled) return "none";
  if (e.pointerType === "touch" || e.reducedMotion) return "press";
  return "full";
}

/** The kind of an un-tagged control, from what it already says about itself. */
export function inferKind(attrs: { variant?: string | null; role?: string | null; iconOnly: boolean; pill?: boolean }): OrbitKind {
  const v = attrs.variant;
  if (v === "primary" || v === "secondary" || v === "ghost" || v === "danger") return v;
  if (attrs.role === "menuitem" || attrs.role === "menuitemradio" || attrs.role === "menuitemcheckbox" || attrs.role === "option") return "menuitem";
  if (attrs.role === "tab") return "segment";
  if (attrs.iconOnly) return "icon";
  return "auto";
}

const DISABLED = ':disabled, [aria-disabled="true"], [inert]';

function isDisabled(el: Element) {
  return el.matches(DISABLED) || !!el.closest("[inert], fieldset:disabled");
}

/** Accessible-ish name for intent matching (cheap: label, title, then visible text). */
function nameOf(el: HTMLElement) {
  return el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent ?? "").slice(0, 40);
}

function iconOnly(el: HTMLElement) {
  return !!el.querySelector("svg") && !(el.textContent ?? "").trim();
}

/** A link is a control (claimable) unless it is text inside running prose. */
function isProseLink(el: HTMLElement, cs: CSSStyleDeclaration) {
  if (el.tagName !== "A" || el.hasAttribute("data-orbit-fx") || el.hasAttribute("data-variant") || el.getAttribute("role") === "button") return false;
  return cs.display === "inline" || !!el.closest("p, li > p, blockquote, td, [data-prose]");
}

const claimed = new WeakSet<Element>();

/** Tag a control for the effects. Idempotent; returns the element when it takes part, else null. */
export function claim(el: HTMLElement): HTMLElement | null {
  if (claimed.has(el)) return el;
  if (el.closest('[data-orbit-fx="off"], [data-space-root], [data-lit]')) return null;
  const cs = getComputedStyle(el);
  if (isProseLink(el, cs)) return null;
  claimed.add(el);
  const io = iconOnly(el);
  if (!el.hasAttribute("data-orbit-fx")) {
    el.setAttribute("data-orbit-fx", inferKind({ variant: el.getAttribute("data-variant"), role: el.getAttribute("role"), iconOnly: io }));
  }
  const kind = el.getAttribute("data-orbit-fx") as OrbitKind;
  if (!el.hasAttribute("data-orbit-icon") && !el.hasAttribute("aria-haspopup") && !el.hasAttribute("aria-expanded")) {
    const intent = iconIntent(nameOf(el));
    if (intent && el.querySelector("svg")) el.setAttribute("data-orbit-icon", intent);
  }
  const w = el.getBoundingClientRect().width;
  el.style.setProperty("--ofx-ps", String(pressScale(w)));
  if (kind === "primary" || kind === "icon" || kind === "danger") el.setAttribute("data-ofx-magnet", "");
  return el;
}

/** Show the success check on an Orbit control for SUCCESS_MS, then return to the label. */
export function flashSuccess(el: HTMLElement | null, ms = SUCCESS_MS): void {
  if (!el) return;
  el.setAttribute("data-ofx-state", "success");
  window.setTimeout(() => {
    if (el.getAttribute("data-ofx-state") === "success") el.removeAttribute("data-ofx-state");
  }, ms);
}

/** Install the delegated listeners. Returns the uninstall. Safe to call on the server (no-op). */
export function installOrbitFx(doc: Document = document): () => void {
  if (typeof window === "undefined" || !doc) return () => {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let cur: HTMLElement | null = null;
  let raf = 0;
  let px = 0;
  let py = 0;

  const release = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.removeProperty("--ofx-tx");
    el.style.removeProperty("--ofx-ty");
    el.removeAttribute("data-ofx-hover");
  };
  const find = (t: EventTarget | null): HTMLElement | null => {
    if (!(t instanceof Element)) return null;
    const el = t.closest<HTMLElement>(ORBIT_CANDIDATES);
    return el ? claim(el) : null;
  };
  const frame = () => {
    raf = 0;
    const el = cur;
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(px - r.left).toFixed(0)}px`);
    el.style.setProperty("--my", `${(py - r.top).toFixed(0)}px`);
    if (el.hasAttribute("data-ofx-magnet")) {
      const [x, y] = magnetOffset(px, py, r);
      el.style.setProperty("--ofx-tx", `${x}px`);
      el.style.setProperty("--ofx-ty", `${y}px`);
    }
  };
  const onOver = (e: PointerEvent) => {
    // Claim on any pointer (touch included) so press depth is ready before pointerdown.
    find(e.target);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const el = find(e.target);
    if (el !== cur) {
      release(cur);
      cur = null;
    }
    if (!el || fxMode({ pointerType: e.pointerType, reducedMotion: reduce.matches, disabled: isDisabled(el) }) !== "full") return;
    cur = el;
    el.setAttribute("data-ofx-hover", "");
    px = e.clientX;
    py = e.clientY;
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const onOut = (e: PointerEvent) => {
    if (!cur) return;
    const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (to && cur.contains(to)) return;
    release(cur);
    cur = null;
  };
  const onFocus = (e: FocusEvent) => {
    // Keyboard users reach controls without a pointer: claim on focus so press depth and icon intent apply.
    const t = e.target;
    if (t instanceof HTMLElement && t.matches(ORBIT_CANDIDATES)) claim(t);
  };

  doc.addEventListener("pointerover", onOver, { passive: true });
  doc.addEventListener("pointermove", onMove, { passive: true });
  doc.addEventListener("pointerout", onOut, { passive: true });
  doc.addEventListener("focusin", onFocus, { passive: true });
  return () => {
    doc.removeEventListener("pointerover", onOver);
    doc.removeEventListener("pointermove", onMove);
    doc.removeEventListener("pointerout", onOut);
    doc.removeEventListener("focusin", onFocus);
    if (raf) cancelAnimationFrame(raf);
    release(cur);
  };
}
