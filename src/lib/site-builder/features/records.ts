/** Everything visitors (and owners) put into a site's features lives here, one tenant-scoped collection. */
import { deleteSiteViews } from "@/lib/business/traffic";
import { id as newId, now } from "@/lib/create/platform/ids";
import { collection } from "@/lib/create/platform/store";
import type { FeatureId } from "./catalog";

export type FeatureRecord = {
  id: string;
  workspaceId: string;
  siteId: string;
  feature: FeatureId;
  /** The placeholder's data-k-id (one site can hold several of the same feature). */
  key: string;
  data: Record<string, string>;
  /** newsletter: "subscribed"; booking: "confirmed" | "cancelled"; data: "row". */
  status: string;
  createdAt: string;
};

export const records = () => collection<FeatureRecord>("sb_records");

export async function addRecord(input: { workspaceId: string; siteId: string; feature: FeatureId; key: string; data: Record<string, string>; status: string; id?: string }) {
  const row: FeatureRecord = { id: input.id ?? newId("rec"), workspaceId: input.workspaceId, siteId: input.siteId, feature: input.feature, key: input.key, data: input.data, status: input.status, createdAt: now() };
  return records().insertIfAbsent(row);
}

export async function listRecords(workspaceId: string, siteId: string, feature?: FeatureId, key?: string) {
  const rows = await records().list(workspaceId, (r) => r.siteId === siteId && (!feature || r.feature === feature) && (!key || r.key === key));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteSiteRecords(workspaceId: string, siteId: string) {
  await deleteSiteViews(workspaceId, siteId); // analytics views (counters and legacy rows) go with the site
  for (const r of await records().list(workspaceId, (x) => x.siteId === siteId)) await records().remove(workspaceId, r.id);
}
