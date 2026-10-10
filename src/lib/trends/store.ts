import { collection } from "@/lib/create/platform/store";
import type { GateResult, TrendPage } from "./logic";

/** Every page the tracker has built, whatever happened to it. status: published | held (passed gates, auto-publish off or daily cap) | rejected | rolled_back */
export type TrendRow = {
  id: string; // slug
  workspaceId: "system";
  status: "published" | "held" | "rejected" | "rolled_back";
  createdAt: string;
  publishedAt?: string;
  rolledBackAt?: string;
  rolledBackBy?: string;
  query: string;
  source: string;
  page?: TrendPage;
  gates?: GateResult;
  reason?: string;
  indexNow?: string;
};
export type TrendSettings = { id: "main"; workspaceId: "system"; /** Kill switch: when true nothing is built or published and every page 404s. */ paused: boolean; autoPublish: boolean; maxPerDay: number; maxLive: number; updatedAt: string; updatedBy?: string };
export type TrendLog = { id: string; workspaceId: "system"; at: string; kind: "run" | "setting" | "rollback" | "publish" | "error"; message: string; data?: Record<string, unknown> };

export const trendPages = () => collection<TrendRow>("trend_pages");
const settings = () => collection<TrendSettings>("trend_settings");
const logs = () => collection<TrendLog>("trend_log");

export const DEFAULTS: TrendSettings = { id: "main", workspaceId: "system", paused: false, autoPublish: false, maxPerDay: 3, maxLive: 40, updatedAt: "" };

export async function getSettings(): Promise<TrendSettings> {
  const s = await settings().get("system", "main").catch(() => null);
  return { ...DEFAULTS, ...(s ?? {}) };
}
export async function saveSettings(patch: Partial<Pick<TrendSettings, "paused" | "autoPublish" | "maxPerDay" | "maxLive">>, by: string) {
  const cur = await settings().get("system", "main");
  const next = { ...(patch.maxPerDay !== undefined ? { maxPerDay: Math.max(0, Math.min(10, Math.floor(patch.maxPerDay))) } : {}), ...(patch.maxLive !== undefined ? { maxLive: Math.max(0, Math.min(200, Math.floor(patch.maxLive))) } : {}), ...(patch.paused !== undefined ? { paused: patch.paused } : {}), ...(patch.autoPublish !== undefined ? { autoPublish: patch.autoPublish } : {}), updatedAt: new Date().toISOString(), updatedBy: by };
  if (cur) await settings().update("system", "main", next);
  else await settings().insert({ ...DEFAULTS, ...next });
  await log("setting", `Settings changed by ${by}`, patch);
}
export async function log(kind: TrendLog["kind"], message: string, data?: Record<string, unknown>) {
  await logs().insert({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, workspaceId: "system", at: new Date().toISOString(), kind, message: message.slice(0, 300), ...(data ? { data } : {}) }).catch(() => undefined);
}
export const recentLog = async (n = 60) => (await logs().listSystemRange({ field: "at", gte: "1" }, n).catch(() => [])) as TrendLog[];

export const livePage = async (slug: string): Promise<TrendRow | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 70) return null;
  if ((await getSettings()).paused) return null;
  const r = await trendPages().get("system", slug).catch(() => null);
  return r && r.status === "published" && r.page ? r : null;
};
export const allRows = async () => ((await trendPages().list("system").catch(() => [])) as TrendRow[]).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
export const publishedRows = async () => ((await getSettings()).paused ? [] : (await allRows()).filter((r) => r.status === "published" && r.page));
