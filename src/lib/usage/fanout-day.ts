/** Count of full-panel answers per account per UTC day (collection system_fanout_day). Read before a run, bumped when a run starts. */
import { collection } from "@/lib/create/platform/store";

type Row = { id: string; workspaceId: string; n: number; day: string };
const rows = () => collection<Row>("system_fanout_day");
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const key = (ws: string, t?: number) => `${ws}:${day(t)}`;

export async function fanoutUsedToday(workspaceId: string): Promise<number> {
  try {
    return (await rows().get("system", key(workspaceId)))?.n ?? 0;
  } catch {
    return 0; // a store hiccup must never block an answer
  }
}

export async function bumpFanout(workspaceId: string): Promise<void> {
  try {
    const k = key(workspaceId);
    await rows().increment("system", k, { n: 1 }, { id: k, workspaceId: "system", n: 0, day: day() });
  } catch {
    /* best effort */
  }
}
