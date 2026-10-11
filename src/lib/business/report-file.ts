/** Saved report shapes and the Markdown export (no server imports, so the browser can file a report into a project). */
export type ReportKind = "research" | "reason";
export type ReportSource = { n: number; title: string; url: string; host: string };

/** A report as a Markdown file: the report, then its numbered sources (for export and project files). */
export function reportFile(r: { title: string; markdown: string; sources: ReportSource[]; createdAt: string; kind: ReportKind }): { name: string; text: string } {
  const safe = r.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Report";
  const sources = r.sources.length ? `\n\n## Sources\n\n${r.sources.map((s) => `${s.n}. [${s.title.replace(/[[\]]/g, "")}](${s.url})`).join("\n")}\n` : "\n";
  return { name: `${r.kind === "reason" ? "Decision" : "Research"} - ${safe}.md`, text: `# ${r.title}\n\n_${new Date(r.createdAt).toUTCString()}_\n\n${r.markdown.trim()}${sources}` };
}
