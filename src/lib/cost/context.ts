/**
 * Who and what a provider call is for. The cost meter (./meter.ts) reads this for every call it records.
 *
 *  - Explicit: `withCostTag({ feature }, fn)` / `tagCostFeature("critic")` (AsyncLocalStorage) for code that knows better than
 *    its route (a critic pass inside Create, a core-reasoning step inside Ask).
 *  - Request binding: `bindCostIdentity(req, ws)` is called by currentWorkspace() (src/lib/create/platform/workspace.ts) so every
 *    signed-in or API-key request carries user id, plan and the feature of the route it came in on. It is keyed by Next's
 *    per-request store object, so code deeper in the request (any await depth) sees it without threading arguments.
 *  - Neither (cron, background jobs outside a request): the call is recorded as "system"/"untagged" with no user.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { featureForPath, isFeature, type FeatureId } from "./features";

export type CostTag = { feature?: FeatureId; userId?: string | null; plan?: string; admin?: boolean; route?: string };

const als = new AsyncLocalStorage<CostTag>();
const byRequest = new WeakMap<object, CostTag>();

function requestKey(): object | null {
  try {
    const s = workUnitAsyncStorage.getStore() as unknown;
    return s && typeof s === "object" ? (s as object) : null;
  } catch {
    return null;
  }
}

/** The per-request key (Next's request store), or null outside a request. The meter uses it to count distinct requests. */
export const costRequestKey = requestKey;

/** Runs `fn` with these tag fields layered over the current ones. */
export function withCostTag<T>(tag: CostTag, fn: () => T): T {
  return als.run({ ...currentCostTag(), ...clean(tag) }, fn);
}

/** Tags the rest of the current async context (call at the top of a handler or job, before the provider calls). */
export function tagCostFeature(feature: FeatureId, extra: Omit<CostTag, "feature"> = {}): void {
  const s = als.getStore();
  if (s) Object.assign(s, clean({ ...extra, feature }));
  else als.enterWith({ ...currentCostTag(), ...clean({ ...extra, feature }) });
  const k = requestKey();
  if (k) byRequest.set(k, { ...byRequest.get(k), ...clean({ ...extra, feature }) });
}

function clean(t: CostTag): CostTag {
  const o: CostTag = {};
  if (t.feature && isFeature(t.feature)) o.feature = t.feature;
  if (t.userId !== undefined) o.userId = t.userId;
  if (t.plan) o.plan = t.plan;
  if (t.admin !== undefined) o.admin = t.admin;
  if (t.route) o.route = t.route;
  return o;
}

/** Called from currentWorkspace(): binds user + plan + route feature to the request in progress. Never throws. */
export function bindCostIdentity(req: Request | undefined | null, ws: { id: string; plan: string; anonymous?: boolean; admin?: boolean }): void {
  try {
    const k = requestKey();
    let route: string | undefined;
    try {
      route = req ? new URL(req.url).pathname : undefined;
    } catch {
      route = undefined;
    }
    const feature = featureForPath(route) ?? undefined;
    const tag: CostTag = { userId: ws.anonymous ? null : ws.id, plan: ws.plan, admin: Boolean(ws.admin), route, feature };
    if (k) {
      const prev = byRequest.get(k);
      // An explicit feature set earlier in the request wins over the route's.
      byRequest.set(k, { ...prev, ...clean(tag), ...(prev?.feature ? { feature: prev.feature } : {}) });
    }
    const s = als.getStore();
    if (s) {
      if (s.userId === undefined) s.userId = tag.userId;
      if (!s.plan) s.plan = tag.plan;
      if (s.admin === undefined) s.admin = tag.admin;
      if (!s.feature && feature) s.feature = feature;
    }
  } catch {
    /* attribution is best effort */
  }
}

/** Only what was tagged explicitly (withCostTag / tagCostFeature) in this async context. */
export const explicitCostTag = (): CostTag | null => als.getStore() ?? null;

/** Only the request binding (route + workspace). */
export function boundCostTag(): CostTag | null {
  const k = requestKey();
  return (k && byRequest.get(k)) || null;
}

/** Merged tag for the current context: explicit ALS fields over the request binding. */
export function currentCostTag(): CostTag {
  const k = requestKey();
  const base = (k && byRequest.get(k)) || {};
  const s = als.getStore() ?? {};
  return { ...base, ...s };
}
