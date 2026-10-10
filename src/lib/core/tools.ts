/**
 * Tools Core can use while it works: run JavaScript to check math or test code (sandbox.ts), syntax-check code blocks,
 * search the web (when the plan has live search), and search the conversation and attached documents (retrieval.ts).
 */
import * as acorn from "acorn";
import { runJs, type RunResult } from "./sandbox";
import type { Retriever, RoutingPlan } from "@/lib/orchestration/types";

export type CodeBlock = { lang: string; code: string };

export function codeBlocks(md: string): CodeBlock[] {
  const out: CodeBlock[] = [];
  const rx = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(md))) out.push({ lang: (m[1] || "").toLowerCase(), code: m[2] });
  return out;
}

const JS = new Set(["js", "javascript", "mjs", "cjs", "node", "jsx"]);
export const isJs = (lang: string) => JS.has(lang);

/** Parses JavaScript without running it. Returns null when it parses, else the first error. */
export function syntaxError(code: string, lang = "js"): string | null {
  if (!isJs(lang)) return null;
  for (const sourceType of ["module", "script"] as const) {
    try {
      acorn.parse(code, { ecmaVersion: "latest", sourceType, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
      return null;
    } catch (e) {
      if (sourceType === "script") return e instanceof Error ? e.message : "Syntax error";
    }
  }
  return null;
}

/** Strips imports/exports so a self-contained snippet can run in the sandbox (no modules there). */
export function runnable(code: string): string {
  return code
    .replace(/^\s*import\s[^\n]*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "")
    .replace(/^\s*export\s+(?=(?:async\s+)?function|const|let|var|class)/gm, "");
}

export async function runCheck(code: string, timeoutMs = 2000): Promise<RunResult> {
  return runJs(runnable(code), timeoutMs);
}

/** The last number in a text (for comparing a computed result with the one the answer states). */
export function lastNumber(s: string): number | null {
  const m = s.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi);
  return m ? Number(m[m.length - 1]) : null;
}

export function numbersIn(s: string): number[] {
  return (s.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

/** Two numbers agree when they match to 6 significant digits (or 0.5% for rounded answers). */
export function sameNumber(a: number, b: number): boolean {
  if (a === b) return true;
  const d = Math.abs(a - b);
  return d <= 1e-9 || d / Math.max(Math.abs(a), Math.abs(b)) < 0.005;
}

export type SearchHit = { title: string; url: string; snippet?: string };

/** Live web search (paid plans with search on). Returns null when no search is available, so the step says so honestly. */
export async function webSearch(retriever: Retriever | null | undefined, query: string, plan: RoutingPlan, signal?: AbortSignal): Promise<{ notes: string; sources: SearchHit[]; costUsd: number } | null> {
  if (!retriever?.research) return null;
  try {
    const r = await retriever.research({ query: query.slice(0, 300), plan, signal });
    return { notes: r.notes, sources: r.sources.slice(0, 5), costUsd: r.costUsd };
  } catch {
    return null;
  }
}
