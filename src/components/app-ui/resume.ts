import type { Thread } from "./state/types";

/** "Today", "Yesterday", "3 days ago", "Last week", "5 weeks ago", then a short date. */
export function ago(ts: number, now: number): string {
  const day = 86_400_000;
  const d = Math.floor((now - ts) / day);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "Last week";
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The last three chats someone can pick up again (never private ones, never untitled drafts), newest first. */
export function resumable(threads: Thread[]): Thread[] {
  return threads.filter((t) => !t.private && t.title.trim()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
}
