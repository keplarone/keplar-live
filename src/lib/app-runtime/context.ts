/** Everything a runtime request knows about the app it serves. Built only by the server from the resolved site. */
import type { PlanId } from "@/lib/create/platform/plans";
import type { AppMeta, AppSpec } from "@/lib/app-builder/types";
import type { Site } from "@/lib/site-builder/types";
import type { Workspace } from "@/lib/create/platform/workspace";
import { limitsFor, type RuntimeLimits } from "./limits";

export type AppEnv = "draft" | "live" | "qa";

export type AppCtx = {
  site: Site;
  appId: string;
  env: AppEnv;
  spec: AppSpec;
  meta: AppMeta;
  /** The creator's plan right now. */
  plan: PlanId;
  limits: RuntimeLimits;
  /** The creator's workspace when the caller already has it (the builder's own test runs); otherwise looked up on demand. */
  workspace?: Workspace;
  /** A draft preview opened by a collaborator who may only look (a "view" preview token): no sign-in links are handed out. */
  viewOnly?: boolean;
};

/** The app meta an environment runs with: live uses the publish snapshot when there is one. */
export function effectiveMeta(meta: AppMeta, env: AppEnv): AppMeta {
  if (env !== "live" || !meta.live) return meta;
  return { ...meta, spec: meta.live.spec, design: meta.live.design, images: meta.live.images ?? meta.images };
}

export function appCtx(site: Site, env: AppEnv, plan: PlanId, specOverride?: AppSpec): AppCtx | null {
  const meta = site.app ? effectiveMeta(site.app, env) : null;
  if (!meta) return null;
  const spec = specOverride ?? meta.spec;
  return { site, appId: site.id, env, spec, meta, plan, limits: limitsFor(plan, env) };
}
