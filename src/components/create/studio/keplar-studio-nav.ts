/**
 * Keplar Studio inside Create: one tab, two environments (Roblox Studio | Blender).
 *
 * Pure routing helpers shared by CreateStudio and its tests. Nothing here touches React.
 *
 * URL forms Create understands (all keep working):
 *   /app/create?tab=studio&env=roblox    canonical, Roblox Studio
 *   /app/create?tab=studio&env=blender   canonical, Blender
 *   /app/create?tab=studio               Keplar Studio, last environment used (Roblox Studio the first time)
 *   /app/create?tab=roblox               legacy, same as tab=studio&env=roblox
 *   /app/create?tab=blender              legacy, same as tab=studio&env=blender
 *   /app/create?tab=images|video|mobile  the other Create studios
 *   /app/create?tab=site, or anything else  App (the Site builder has no tab)
 *
 * Keplar Studio needs the desktop app. Outside it, a Studio link lands on App (as it always has) and CreateStudio shows a
 * plain note that points to the download page and the two product pages; see `studioRequested`.
 */

/** Create's top-level tabs. "studio" is Keplar Studio (desktop app only). */
export type CreateView = "app" | "images" | "video" | "mobile" | "studio";

/** The environments Keplar Studio works in. */
export type StudioEnv = "roblox" | "blender";

export type CreateLocation = {
  view: CreateView;
  /** The environment the link asked for, or null when it did not name one (use the remembered one). */
  env: StudioEnv | null;
};

export type StudioEnvInfo = {
  id: StudioEnv;
  /** Label in the environment switch. */
  label: string;
  /** The product page for this environment (marketing; exists today). */
  href: string;
};

export const STUDIO_ENVS: readonly StudioEnvInfo[] = [
  { id: "roblox", label: "Roblox Studio", href: "/roblox-studio-ai" },
  { id: "blender", label: "Blender", href: "/blender-ai" },
] as const;

export const DEFAULT_STUDIO_ENV: StudioEnv = "roblox";

/** localStorage key for the last environment picked in Keplar Studio. */
export const STUDIO_ENV_KEY = "keplar:studio-env";

export const isStudioEnv = (v: unknown): v is StudioEnv => v === "roblox" || v === "blender";

export const studioEnvLabel = (env: StudioEnv): string => STUDIO_ENVS.find((e) => e.id === env)!.label;

/** Turns `?tab=` / `?env=` values into a Create location. Unknown tabs (including the retired "site") land on App. */
export function resolveCreateLocation(tab?: string | null, env?: string | null): CreateLocation {
  if (tab === "images" || tab === "video" || tab === "mobile") return { view: tab, env: null };
  if (tab === "roblox" || tab === "blender") return { view: "studio", env: tab };
  if (tab === "studio") return { view: "studio", env: isStudioEnv(env) ? env : null };
  return { view: "app", env: null };
}

/** Reads `tab` and `env` from a URL (or search string). Never throws. */
export function locationFromUrl(href: string | null | undefined): CreateLocation {
  if (!href) return { view: "app", env: null };
  try {
    const params = new URL(href, "http://x").searchParams;
    return resolveCreateLocation(params.get("tab"), params.get("env"));
  } catch {
    return { view: "app", env: null };
  }
}

/**
 * The search string for a Create view, keeping every unrelated parameter. App clears tab and env; Keplar Studio writes the
 * canonical `tab=studio&env=…`; the other studios write `tab=…` and drop env.
 */
export function createSearch(search: string, view: CreateView, env: StudioEnv): string {
  const params = new URLSearchParams(search);
  if (view === "app") {
    params.delete("tab");
    params.delete("env");
  } else if (view === "studio") {
    params.set("tab", "studio");
    params.set("env", env);
  } else {
    params.set("tab", view);
    params.delete("env");
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** The canonical Create URL for an environment (for links from elsewhere in the app). */
export const studioHref = (env: StudioEnv): string => `/app/create?tab=studio&env=${env}`;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const safeStorage = (): StorageLike | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** The environment picked last time, or null. Storage can be missing or throw (private windows, blocked site data). */
export function readRememberedEnv(storage: StorageLike | null = safeStorage()): StudioEnv | null {
  try {
    const v = storage?.getItem(STUDIO_ENV_KEY);
    return isStudioEnv(v) ? v : null;
  } catch {
    return null;
  }
}

export function rememberEnv(env: StudioEnv, storage: StorageLike | null = safeStorage()): void {
  try {
    storage?.setItem(STUDIO_ENV_KEY, env);
  } catch {
    /* storage blocked: the switch still works for this visit */
  }
}

/** The environment to open: what the link asked for, else the remembered one, else Roblox Studio. */
export const pickEnv = (asked: StudioEnv | null, remembered: StudioEnv | null): StudioEnv => asked ?? remembered ?? DEFAULT_STUDIO_ENV;

/**
 * True when the link asked for Keplar Studio but this is not the desktop app: Create shows App, plus a note saying where
 * Keplar Studio runs. Never true inside the desktop app.
 */
export const studioRequested = (asked: CreateView, desktop: boolean): boolean => asked === "studio" && !desktop;
