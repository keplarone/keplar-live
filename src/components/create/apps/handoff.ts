/**
 * "Open in Create studio" from a chat Create card: the App tab opens that app, or starts a new one with the chat's prompt
 * (to pick colors and fonts first). Read once by AppBuilder when it mounts.
 */
export const APP_OPEN_KEY = "keplar:app-open";
export type AppHandoff = { id?: string; prompt?: string };

export function giveAppHandoff(h: AppHandoff) {
  try {
    sessionStorage.setItem(APP_OPEN_KEY, JSON.stringify(h));
  } catch {
    /* storage unavailable: Create opens on a new app */
  }
}

export function takeAppHandoff(): AppHandoff | null {
  try {
    const raw = sessionStorage.getItem(APP_OPEN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(APP_OPEN_KEY);
    const v = JSON.parse(raw) as AppHandoff;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
