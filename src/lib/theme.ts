/**
 * Theme: Dark (default) / Light / Auto (follows the OS).
 *
 * The preference lives in localStorage and a cookie (`keplar-theme`). An inline
 * script in <head> (THEME_SCRIPT, rendered by the root layout) resolves it and
 * sets <html data-theme="dark|light" class="dark|light"> before first paint, so
 * there is no flash. Pages stay statically rendered: the server always emits
 * the default (dark) and the script corrects it before paint; the cookie is
 * also readable server-side for any dynamic route that wants it.
 */
export type ThemePref = "dark" | "light" | "auto";
export type Theme = "dark" | "light";

/**
 * Where the visitor's choice is kept (localStorage, plus a cookie of the same name). "-v2" since the Oct 2026 light redesign:
 * choices saved before it are ignored once, so everyone starts in light; a choice made after it sticks as usual.
 */
export const THEME_KEY = "keplar-theme-v2";
/** Light is the default for everyone (first visit, no stored choice). Dark and Auto stay available in the theme control and Settings. */
export const DEFAULT_THEME_PREF: ThemePref = "light";
export const THEME_COLORS: Record<Theme, string> = { dark: "#0b0b0d", light: "#f7f8fa" }; // light = the cool off-white canvas (src/styles/light.css)

export const isThemePref = (v: unknown): v is ThemePref => v === "dark" || v === "light" || v === "auto";

export function resolveTheme(pref: ThemePref, osDark: boolean): Theme {
  return pref === "auto" ? (osDark ? "dark" : "light") : pref;
}

/**
 * Runs before paint. Keep it tiny, dependency-free and exception-safe. Docs (/docs/... and docs.keplar.one) always paint light with
 * <html data-docs="1"> (src/styles/docs-theme.css); the saved preference is untouched and applies again outside the docs.
 */
export const THEME_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_KEY)},p=null;try{p=localStorage.getItem(k)}catch(e){}if(!p){var m=document.cookie.match(/(?:^|; )${THEME_KEY}=(dark|light|auto)/);p=m&&m[1]}if(p!=="dark"&&p!=="light"&&p!=="auto")p=${JSON.stringify(DEFAULT_THEME_PREF)};var d=p==="dark"||(p==="auto"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement,l=document.location,k2=l&&(/^docs\\./.test(l.hostname)||/^\\/docs(\\/|$)/.test(l.pathname));if(k2){d=false;r.setAttribute("data-docs","1")}var t=d?"dark":"light";r.setAttribute("data-theme",t);r.setAttribute("data-theme-pref",p);r.classList.remove(d?"light":"dark");r.classList.add(t);r.style.colorScheme=t}catch(e){}})();`;

/* ── client helpers ── */

export function readThemePref(): ThemePref {
  if (typeof document === "undefined") return DEFAULT_THEME_PREF;
  const attr = document.documentElement.getAttribute("data-theme-pref");
  return isThemePref(attr) ? attr : DEFAULT_THEME_PREF;
}

/**
 * The saved choice itself (localStorage, then the cookie), or null when there is none. readThemePref() reads <html data-theme-pref>, which
 * the head script sets from this; but when Next client-renders the document (the error shell a dynamic route gets after notFound(), e.g.
 * /r/<revoked token> or /answers/<unknown slug>), React inserts the head script without running it, so the attribute is the server default.
 */
export function storedThemePref(): ThemePref | null {
  if (typeof document === "undefined") return null;
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (isThemePref(v)) return v;
  } catch {
    /* private mode */
  }
  const m = document.cookie.match(new RegExp(`(?:^|; )${THEME_KEY}=(dark|light|auto)`));
  return m && isThemePref(m[1]) ? m[1] : null;
}

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function applyTheme(pref: ThemePref) {
  const osDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const r = document.documentElement;
  // The docs are always light (white-and-blue); the preference is still recorded and applies again when the visitor leaves them.
  const theme = r.getAttribute("data-docs") === "1" ? "light" : resolveTheme(pref, osDark);
  r.setAttribute("data-theme", theme);
  r.setAttribute("data-theme-pref", pref);
  r.classList.remove(theme === "dark" ? "light" : "dark");
  r.classList.add(theme);
  r.style.colorScheme = theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = THEME_COLORS[theme];
    m.removeAttribute("media");
  });
}

export function saveThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* private mode */
  }
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_KEY}=${pref}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  // The whole page crossfades into the new theme (a view transition snapshots the old one); instant without support or with reduced motion.
  const d = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!d.startViewTransition || still || document.hidden) return applyTheme(pref);
  const r = document.documentElement;
  r.setAttribute("data-vt", "theme");
  const done = () => {
    if (r.getAttribute("data-vt") === "theme") r.removeAttribute("data-vt");
  };
  d.startViewTransition(() => applyTheme(pref)).finished.finally(done);
  window.setTimeout(done, 1000); // backstop: a skipped or stalled transition never leaves the marker behind
}

/** Calls back with the resolved theme whenever <html data-theme> changes. */
export function onThemeChange(cb: (theme: Theme) => void): () => void {
  const obs = new MutationObserver(() => cb(currentTheme()));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
