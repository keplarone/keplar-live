/** AI Critic: shared types. Pure and client-safe. */
export type Category = "design" | "code" | "a11y" | "perf" | "ux";
export type Severity = "critical" | "major" | "minor" | "info";
export type Source = "static" | "axe" | "ai";

/** One exact text edit. `expect` is the text being replaced, so a stale patch is detected instead of corrupting a file. */
export type Patch = { file: string; start: number; end: number; expect: string; replace: string; /** Up to 24 chars of context on each side, used to re-anchor the patch after the file moved. */ pre?: string; post?: string };

export type Finding = {
  id: string;
  rule: string;
  category: Category;
  severity: Severity;
  source: Source;
  file: string;
  line: number;
  col: number;
  /** The element or declaration it is about, as written in the file (trimmed). */
  element?: string;
  title: string;
  /** What is wrong, specifically. */
  detail: string;
  /** The exact fix, in words; `patch` carries it as an edit when it can be applied automatically. */
  fix: string;
  patch?: Patch[];
  /** WCAG success criterion or reference, when there is one. */
  ref?: string;
};

export type CategoryScore = { category: Category; score: number; findings: number; critical: number; major: number };

export type CriticReport = {
  id: string;
  workspaceId: string;
  siteId: string;
  version: number;
  /** Live-session critiques are not tied to a saved version. */
  live?: boolean;
  createdAt: string;
  score: number;
  grade: "Ship it" | "Almost there" | "Needs work" | "Not ready";
  summary: string;
  categories: CategoryScore[];
  findings: Finding[];
  passes: { static: { rules: number; ms: number }; axe?: { ok: boolean; violations: number; ms: number; note?: string }; ai?: { ok: boolean; model?: string; kept: number; dropped: number; ms: number; note?: string } };
  files: number;
  bytes: number;
};

export const CATEGORY_LABEL: Record<Category, string> = { design: "Design", code: "Code quality", a11y: "Accessibility", perf: "Performance", ux: "UX" };
export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2, info: 3 };
