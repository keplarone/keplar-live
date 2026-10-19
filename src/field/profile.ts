import type { Intensity } from "@/lib/spatial/policy";
import type { SceneId } from "./scenes";

/**
 * Which pages get the page-wide particle layer, which scene each one shows, and how loudly. Pure (no DOM, no three).
 * - Home has its own scroll-linked field, so it is excluded here.
 * - Published sites, embeds, API and internal previews are user content or non-pages: never touched.
 * - /app shows a scene per view (Ask, Create, Projects, Agents, Business) and reacts to focus and real answer progress.
 * - /admin and Settings-like pages get the calm scene: faint, capped, slow, not reactive.
 */
export type PageProfile = {
  id: "marketing" | "app" | "admin" | "onboarding";
  scene: SceneId;
  intensity: Intensity;
  /** CSS opacity of the canvas layer (content stays readable on top of it). */
  opacity: number;
  fpsCap?: number;
  density: number;
  speed: number;
  /** Reacts to the pointer and to focus in text fields. */
  reactive: boolean;
};

const MARKETING = { id: "marketing", intensity: "rich", opacity: 0.55, density: 1, speed: 1, reactive: true } as const;
const APP: PageProfile = { id: "app", scene: "ask", intensity: "rich", opacity: 0.66, density: 1, speed: 1, reactive: true };
/** First-run onboarding (/welcome): the richest scene set, drawn bold behind the glass cards, with boom + camera moves. */
const ONBOARDING: PageProfile = { id: "onboarding", scene: "onb-welcome", intensity: "rich", opacity: 0.95, density: 1, speed: 1, reactive: true };
const ADMIN: PageProfile = { id: "admin", scene: "calm", intensity: "subtle", opacity: 0.2, fpsCap: 30, density: 0.5, speed: 0.45, reactive: false };

const BY_PATH: [RegExp, SceneId][] = [
  [/^\/pricing/, "pricing"],
  [/^\/download/, "download"],
  [/^\/account/, "memory"],
  [/^\/agents/, "agents"],
  [/^\/(business|enterprise|for-small-business|for-founders)/, "business"],
  [/^\/(for-researchers)/, "memory"],
  [/^\/(for-students|ai-study-tool|ai-slideshow-maker)/, "create"],
  // Marketing families: each gets its own formation and its own scroll-driven camera move (scenes.ts SCROLL_MOTION).
  [/^\/about/, "helix"],
  [/^\/docs/, "sheets"],
  [/^\/blogs/, "ribbons"],
  [/^\/models/, "globe"],
  [/^\/(compare|vs|compare-ai-models|chatgpt-alternative)(\/|$)/, "split"],
  [/^\/(superintelligence|si-vs-ai|ai-vs-agi-vs-superintelligence)/, "torus"],
  [/^\/(glossary|prompts)/, "rain"],
  [/^\/(signin|signup|forgot-password|reset-password|verify-email|checkout|desktop|r\/)/, "gate"],
  [/^\/(feedback|inquire)/, "echo"],
  [/^\/(privacy|terms)/, "vault"],
  [/^\/(use-cases|for-you)/, "spiral"],
  [/^\/for-developers/, "tunnel"],
  [/^\/(guides|dev)/, "calm"],
];

export function sceneForPath(p: string): SceneId {
  for (const [re, id] of BY_PATH) if (re.test(p)) return id;
  return "converge";
}

/** App view -> scene (the app is one route; its views swap the scene without a navigation). */
export function sceneForView(view: string): SceneId {
  switch (view) {
    case "create": case "slides": case "study": case "deployments": return "create";
    case "projects": case "history": return "projects";
    case "agents": case "approvals": case "tasks": return "agents";
    case "business": return "business";
    default: return "ask";
  }
}

export function profileFor(path: string): PageProfile | null {
  const p = path.split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/") return null;
  if (/^\/(sites|s|i|api|embed)(\/|$)/.test(p) || /-preview(\/|$)/.test(p)) return null;
  if (p === "/app" || p.startsWith("/app/")) return APP;
  if (p === "/welcome" || p.startsWith("/welcome/")) return ONBOARDING;
  if (p === "/admin" || p.startsWith("/admin/")) return ADMIN;
  return { ...MARKETING, scene: sceneForPath(p) };
}

/** Window event the app emits: REAL answer progress, and which view is showing; the field only reacts to it. */
export const FIELD_EVENT = "keplar:field";
export type FieldDetail =
  | { phase: "ask"; p: number }
  | { phase: "idle" }
  | { phase: "scene"; scene: SceneId; picks?: number[] }
  /** Onboarding only: a shockwave from a point on screen (NDC -1..1), and the "Personalizing…" turn. */
  | { phase: "boom"; x: number; y: number; strength?: number }
  | { phase: "personalize"; on: boolean };

/** Answer progress 0..1 from real run state: finished stages, and responded models against the number asked. */
export function askProgress(stagesDone: number, stagesTotal: number, responded: number, asked: number): number {
  const stages = stagesTotal > 0 ? stagesDone / stagesTotal : 0;
  const models = asked > 0 ? Math.min(1, responded / asked) * 0.6 : 0;
  return Math.min(0.97, Math.max(0.04, stages, models));
}
