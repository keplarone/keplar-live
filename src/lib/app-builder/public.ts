/**
 * Lightweight helpers for app list/detail API routes.
 * Kept free of the build/verify import graph so serverless handlers never load Playwright.
 */
import { toUnits } from "@/lib/create/platform/compute";
import { meteredUsd } from "@/lib/orchestration/limits";
import { previewToken } from "@/lib/site-builder/render";
import type { Site } from "@/lib/site-builder/types";
import type { PlanId } from "@/lib/create/platform/plans";
import { APP_BUILD_LIMITS } from "./models";
import type { AppSpec } from "./types";

export type PublicSpec = Pick<AppSpec, "name" | "tagline" | "kind" | "summary" | "features" | "notBuilt" | "uses" | "scope"> & {
  pages: { route: string; title: string; auth?: boolean; admin?: boolean }[];
  collections: { name: string; label: string; fields: string[]; realtime?: boolean }[];
  ai: { name: string; label: string }[];
  auth: boolean;
  files: string[];
  images: string[];
};

export const publicSpec = (s: AppSpec): PublicSpec => ({
  name: s.name, tagline: s.tagline, kind: s.kind, summary: s.summary, features: s.features, notBuilt: s.notBuilt, uses: s.uses, scope: s.scope,
  pages: s.pages.map((p) => ({ route: p.route, title: p.title, ...(p.auth ? { auth: true } : {}), ...(p.admin ? { admin: true } : {}) })),
  collections: s.collections.map((c) => ({ name: c.name, label: c.label, fields: c.fields.map((f) => f.name), ...(c.realtime ? { realtime: true } : {}) })),
  ai: s.ai.map((a) => ({ name: a.name, label: a.label })), auth: s.auth.enabled, files: s.files.map((f) => f.path), images: s.images.map((i) => i.slot),
});

/** What one build is expected to cost in credits (shown before it starts, checked against the allowance). */
export const buildEstimateUnits = (plan: PlanId) => (plan === "free" ? 0 : toUnits(meteredUsd(APP_BUILD_LIMITS[plan].maxBuildUsd * 0.45)));
export const buildMaxUnits = (plan: PlanId) => (plan === "free" ? 0 : toUnits(meteredUsd(APP_BUILD_LIMITS[plan].maxBuildUsd)));

/** The app as an unfinished build has written it so far (served by the draft route while the build tests and fixes it). */
export function previewUrlForBuild(site: Pick<Site, "id">, buildId: string) {
  return `/apps/draft/${site.id}/b.${buildId}/${previewToken(site.id)}/`;
}

export function previewUrlFor(site: Pick<Site, "id">, version: number) {
  return `/apps/draft/${site.id}/${version}/${previewToken(site.id)}/`;
}
