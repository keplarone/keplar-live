/** "Open in Study / Slides" from a chat card: which set or deck to open, read once by the studio when it mounts (like Create's resume key). */
export const STUDY_OPEN_KEY = "keplar:study-open";
export const SLIDES_OPEN_KEY = "keplar:slides-open";

export function takeHandoff<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function giveHandoff(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the studio opens on its list */
  }
}
