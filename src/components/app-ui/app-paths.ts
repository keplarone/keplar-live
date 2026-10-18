/**
 * Ask is the site root (/). Other tabs are real URLs under /app/…. The shell stays mounted across tabs
 * (history.pushState); a fresh load of the same path opens that tab via AppLoader.
 * /app and /app/ask still open Ask. Settings / Memory / Usage live under /account, not here.
 */
import type { View } from "./state/types";

/** The chat home. /app and /app/ask stay as aliases (viewForPath). */
export const APP_HOME = "/";

/** Path for every View. Ask is the site root. Other tabs stay under /app. */
export const VIEW_PATH: Record<View, string> = {
  thread: "/",
  create: "/app/create",
  projects: "/app/projects",
  agents: "/app/agents",
  business: "/app/business",
  deployments: "/app/deployments",
  approvals: "/app/approvals",
  slides: "/app/slides",
  study: "/app/study",
  history: "/app/history",
  studio: "/app/studio",
  apps: "/app/apps",
};

const BY_PATH = new Map<string, View>(Object.entries(VIEW_PATH).map(([v, p]) => [p, v as View]));

export function pathForView(view: View): string {
  return VIEW_PATH[view];
}

/** Resolve a pathname to a View. / , /app and /app/ask are Ask. Unknown → null. */
export function viewForPath(pathname: string): View | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/app" || p === "/app/ask") return "thread";
  return BY_PATH.get(p) ?? null;
}

export function isAppPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/" || p === "/app" || p.startsWith("/app/");
}

/**
 * Where the app opens after an outside redirect back to /app: Stripe onboarding and Business connector or bank sign-ins
 * (`conn_…`, `bank_…`) return to Business; a connected app's (MCP) sign-in returns to Connected apps.
 */
export function oauthReturnView(result: string): View {
  return result === "stripe" || /^(conn_|bank_)/.test(result) ? "business" : "apps";
}
