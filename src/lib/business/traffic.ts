/** First-party page views for published sites (no cookies, no IPs stored). */
import { id, now } from "@/lib/create/platform/ids";
import { pageViews } from "./repo";

export async function recordView(workspaceId: string, projectId: string, path: string) {
  const at = now();
  await pageViews().insert({ id: id("pv"), workspaceId, projectId, path: path.slice(0, 200), day: at.slice(0, 10), at });
}
