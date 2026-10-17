/**
 * Create's top-level tabs: App, Images, Video, Mobile.
 *
 * Pure routing helpers. Nothing here touches React.
 *
 *   /app/create?tab=images|video|mobile
 *   /app/create, or any other tab (including retired site, studio, roblox and blender)  App
 */

export type CreateView = "app" | "images" | "video" | "mobile";

/** Turns a `?tab=` value into a Create view. Unknown and retired tabs land on App. */
export function resolveCreateView(tab?: string | null): CreateView {
  if (tab === "images" || tab === "video" || tab === "mobile") return tab;
  return "app";
}

/** Reads `tab` from a URL (or search string). Never throws. */
export function viewFromUrl(href: string | null | undefined): CreateView {
  if (!href) return "app";
  try {
    return resolveCreateView(new URL(href, "http://x").searchParams.get("tab"));
  } catch {
    return "app";
  }
}

/** The search string for a Create view, keeping every unrelated parameter. App clears tab and env. */
export function createSearch(search: string, view: CreateView): string {
  const params = new URLSearchParams(search);
  if (view === "app") params.delete("tab");
  else params.set("tab", view);
  params.delete("env");
  const s = params.toString();
  return s ? `?${s}` : "";
}
