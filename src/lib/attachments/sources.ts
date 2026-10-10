import type { KeplarAnswer, KeplarRequest } from "@/lib/orchestration/types";

/** Links Keplar read for this answer, first in Sources (kind "web", with the address), replacing the "no sources cited" note. */
export function withReadSources(answer: KeplarAnswer, docs: KeplarRequest["docs"]): KeplarAnswer {
  const read = (docs ?? []).filter((d) => d.source === "link" && d.url).map((d) => ({ kind: "web" as const, title: d.name.replace(/^[^—]+—\s*/, "") || d.name, url: d.url!, detail: `Read by Keplar for this answer${d.truncated ? " (first part)" : ""}` }));
  if (!read.length) return answer;
  const rest = (answer.sources ?? []).filter((s) => s.title !== "No sources cited" && !read.some((r) => r.url === s.url));
  return { ...answer, sources: [...read, ...rest] };
}
