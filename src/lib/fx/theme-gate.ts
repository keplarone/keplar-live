import { currentTheme, onThemeChange, type Theme } from "@/lib/theme";

/**
 * Runs `start` while <html data-theme> is `theme`, and calls the cleanup it returns when the theme changes away (and again
 * when it comes back). Backdrop canvases use it so the light theme's liquid layer and the dark theme's star field never both
 * run: only the one you can see costs frames. Returns a disposer for the effect.
 */
export function runWhileTheme(theme: Theme, start: () => (() => void) | void): () => void {
  let stop: (() => void) | null = null;
  let on = false;
  const sync = () => {
    const want = currentTheme() === theme;
    if (want && !on) {
      on = true;
      stop = start() ?? null;
    } else if (!want && on) {
      on = false;
      stop?.();
      stop = null;
    }
  };
  sync();
  const off = onThemeChange(sync);
  return () => {
    off();
    stop?.();
    stop = null;
  };
}
