/**
 * Keplar Business report history: finished Deep Research and Reason reports, kept per workspace so they can be reopened,
 * exported and filed into projects. The report itself is produced by Keplar's research engine (/api/keplar); this stores
 * what the person chose to keep.
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";
import type { ReportKind, ReportSource } from "./report-file";

export type { ReportKind, ReportSource } from "./report-file";
export type BusinessReportRow = {
  id: string; workspaceId: string;
  kind: ReportKind;
  title: string;
  template: string;
  prompt: string;
  projectId: string | null;
  markdown: string;
  sources: ReportSource[];
  queries: string[];
  consensus: string;
  createdAt: string;
};

export const reportsStore = () => collection<BusinessReportRow>("business_reports");
export const REPORT_LIMITS = { maxPerWorkspace: 1_000, maxMarkdown: 200_000, maxSources: 80, maxQueries: 20 };

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Only http(s) links are kept for sources. */
function cleanSources(v: unknown): ReportSource[] {
  if (!Array.isArray(v)) return [];
  const out: ReportSource[] = [];
  for (const s of v.slice(0, REPORT_LIMITS.maxSources)) {
    const o = (s ?? {}) as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!/^https?:\/\//i.test(url) || url.length > 2000) continue;
    out.push({ n: typeof o.n === "number" && Number.isFinite(o.n) ? Math.round(o.n) : out.length + 1, title: line(o.title, 300) || url, url, host: line(o.host, 200) });
  }
  return out;
}

export async function saveReport(workspaceId: string, input: Record<string, unknown>): Promise<BusinessReportRow> {
  const kind: ReportKind = input.kind === "reason" ? "reason" : "research";
  const markdown = typeof input.markdown === "string" ? input.markdown.slice(0, REPORT_LIMITS.maxMarkdown) : "";
  if (!markdown.trim()) throw new HttpError(400, "There is no report to save yet.", "empty");
  const count = (await reportsStore().list(workspaceId)).length;
  if (count >= REPORT_LIMITS.maxPerWorkspace) throw new HttpError(409, `Up to ${REPORT_LIMITS.maxPerWorkspace} saved reports. Delete some to save more.`, "too_many");
  const row: BusinessReportRow = {
    id: `rp_${randomBytes(9).toString("base64url")}`, workspaceId, kind,
    title: line(input.title, 200) || (kind === "reason" ? "Decision report" : "Research report"),
    template: line(input.template, 60),
    prompt: line(input.prompt, 4000),
    projectId: typeof input.projectId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(input.projectId) ? input.projectId : null,
    markdown,
    sources: cleanSources(input.sources),
    queries: Array.isArray(input.queries) ? input.queries.slice(0, REPORT_LIMITS.maxQueries).map((q) => line(q, 300)).filter(Boolean) : [],
    consensus: line(input.consensus, 600),
    createdAt: new Date().toISOString(),
  };
  return reportsStore().insert(row);
}

export { reportFile } from "./report-file";
