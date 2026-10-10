/**
 * axe-core on the RENDERED preview, in a real headless Chromium (the same browser the build tests use). This sees what the
 * static rules can't: markup rendered by JavaScript, computed colors after the cascade, real focus order. Every violation is
 * traced back to a file and line where possible, and color-contrast failures get an exact replacement color.
 */
import { contrast, fixContrast, parseColor, parseCss } from "./css";
import { LineIndex, clip } from "./text";
import type { Finding, Severity } from "./types";

type AxeNode = { html: string; target: string[]; failureSummary?: string; any?: { id: string; data?: Record<string, unknown> }[] };
type AxeViolation = { id: string; impact: "minor" | "moderate" | "serious" | "critical" | null; help: string; helpUrl: string; tags: string[]; nodes: AxeNode[] };

const IMPACT: Record<string, Severity> = { critical: "critical", serious: "major", moderate: "minor", minor: "info" };
/** axe rule → static rule that already covers the same thing (so we don't report it twice). */
export const AXE_TWIN: Record<string, string> = { "image-alt": "a11y/img-alt", "button-name": "a11y/button-name", "link-name": "a11y/link-name", label: "a11y/input-label", "html-has-lang": "a11y/html-lang", "landmark-one-main": "a11y/landmark-main", "heading-order": "a11y/heading-order", "color-contrast": "a11y/contrast", "duplicate-id": "a11y/duplicate-id", tabindex: "a11y/tabindex-positive", "meta-viewport": "a11y/zoom-disabled", "frame-title": "a11y/iframe-title", "document-title": "ux/page-title" };

/** Finds where a rendered element comes from: by id, then src/href, then distinctive class, then its text. */
export function locateNode(html: string, files: Record<string, string>): { file: string; at: number } | null {
  const probes: string[] = [];
  const id = /\sid="([^"]+)"/.exec(html)?.[1];
  if (id) probes.push(`id="${id}"`);
  for (const a of ["src", "href", "name", "placeholder", "aria-label"]) { const v = new RegExp(`\\s${a}="([^"]{3,})"`).exec(html)?.[1]; if (v) probes.push(v); }
  const cls = /\sclass="([^"]+)"/.exec(html)?.[1]?.split(/\s+/).sort((a, b) => b.length - a.length)[0];
  if (cls && cls.length > 3) probes.push(cls);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length >= 6) probes.push(text.slice(0, 40));
  for (const p of probes) for (const [file, src] of Object.entries(files)) { const at = src.indexOf(p); if (at >= 0) return { file, at }; }
  return null;
}

export function axeToFindings(violations: AxeViolation[], files: Record<string, string>, staticFindings: Finding[]): Finding[] {
  const out: Finding[] = [];
  const index = new Map<string, LineIndex>();
  const lines = (f: string) => index.get(f) ?? index.set(f, new LineIndex(files[f])).get(f)!;
  for (const v of violations) {
    for (const node of v.nodes.slice(0, 6)) {
      const loc = locateNode(node.html, files);
      const pos = loc ? lines(loc.file).pos(loc.at) : { line: 1, col: 1 };
      const twin = AXE_TWIN[v.id];
      if (twin && loc && staticFindings.some((s) => s.rule.startsWith(twin) && s.file === loc.file && Math.abs(s.line - pos.line) <= 1)) continue;
      let fix = `${v.help}.`;
      let patch: Finding["patch"];
      let file = loc?.file ?? Object.keys(files).find((f) => f.endsWith(".html")) ?? Object.keys(files)[0];
      let line = pos.line;
      let col = pos.col;
      if (v.id === "color-contrast") {
        const d = node.any?.find((x) => x.id === "color-contrast")?.data as { fgColor?: string; bgColor?: string; contrastRatio?: number; expectedContrastRatio?: string } | undefined;
        const fg = d?.fgColor ? parseColor(d.fgColor) : null;
        const bg = d?.bgColor ? parseColor(d.bgColor) : null;
        const target = Number(String(d?.expectedContrastRatio ?? "4.5").replace(":1", "")) || 4.5;
        if (fg && bg) {
          const better = fixContrast(fg, bg, target);
          fix = better ? `Rendered text is ${d!.fgColor} on ${d!.bgColor} (${(d!.contrastRatio ?? contrast(fg, bg)).toFixed(2)}:1, needs ${target}:1). Use ${better}.` : fix;
          // find the declaration that paints this color, and patch it
          if (better) {
            for (const [f, src] of Object.entries(files)) {
              if (!/\.css$/.test(f)) continue;
              const decl = parseCss(src).rules.flatMap((r) => r.decls).find((x) => (x.prop === "color" || x.prop.startsWith("--")) && parseColor(x.value) && contrast(parseColor(x.value)!, fg) < 1.02);
              if (decl) {
                file = f;
                ({ line, col } = lines(f).pos(decl.start));
                patch = [{ file: f, start: decl.valueStart, end: decl.valueEnd, expect: src.slice(decl.valueStart, decl.valueEnd), replace: better, pre: src.slice(Math.max(0, decl.valueStart - 24), decl.valueStart), post: src.slice(decl.valueEnd, decl.valueEnd + 24) }];
                break;
              }
            }
          }
        }
      }
      const id = `axe/${v.id}@${file}:${line}:${col}`;
      if (out.some((o) => o.id === id)) continue;
      out.push({ id, rule: `axe/${v.id}`, category: v.tags.includes("best-practice") && !v.tags.some((t) => t.startsWith("wcag")) ? "ux" : "a11y", severity: IMPACT[v.impact ?? "moderate"] ?? "minor", source: "axe", file, line, col, element: clip(node.html, 160), title: v.help, detail: `${clip((node.failureSummary ?? "").replace(/^Fix (any|all) of the following:\s*/i, ""), 300)}${loc ? "" : ` (rendered element ${node.target.join(" ")}; generated at runtime)`}`, fix, patch, ref: v.tags.find((t) => /^wcag\d{3,4}$/.test(t))?.replace(/^wcag(\d)(\d)(\d+)$/, "WCAG $1.$2.$3") ?? v.helpUrl });
    }
  }
  return out;
}

export type AxeRun = { ok: boolean; violations: AxeViolation[]; screenshot: Buffer | null; ms: number; note?: string };
export type Serve = (req: Request, path: string) => Promise<Response>;
export const AXE_HOST = "https://critic.keplar.test";

async function fxFile(p: string): Promise<string | null> {
  if (!/^\/fx\/[a-z0-9.-]+\.js$/.test(p)) return null;
  const [{ readFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  return readFile(path.join(process.cwd(), "public", p), "utf8").catch(() => null);
}

/**
 * Renders the creation in Chromium with every request answered IN-PROCESS by `serve` (the same code that serves previews), so
 * the check needs no network and can't be blocked by a firewall; only Google Fonts load for real. Runs axe-core (WCAG 2.0–2.2
 * A/AA + best practices) and takes a 1280×800 screenshot for the visual pass.
 */
export async function runAxe(serve: Serve, entry = "/", timeoutMs = 40_000): Promise<AxeRun> {
  const t0 = Date.now();
  try {
    const [{ withBrowser }, axe] = await Promise.all([import("@/lib/site-builder/qa/browser"), import("axe-core")]);
    const source = (axe as unknown as { source?: string }).source ?? (axe as unknown as { default: { source: string } }).default.source;
    return await withBrowser(async (b) => {
      const context = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      await context.route("**/*", async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") return route.continue();
        if (url.origin !== AXE_HOST) return route.abort();
        if (url.pathname.startsWith("/fx/")) {
          const js = await fxFile(url.pathname);
          return js === null ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ status: 200, body: js, headers: { "content-type": "text/javascript; charset=utf-8" } });
        }
        const body = req.postDataBuffer();
        const res = await serve(new Request(url.toString(), { method: req.method(), headers: req.headers(), body: body && req.method() !== "GET" && req.method() !== "HEAD" ? new Uint8Array(body) : undefined }), url.pathname).catch(() => new Response("", { status: 500 }));
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { if (k !== "content-security-policy") headers[k] = v; });
        return route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
      });
      const page = await context.newPage();
      await page.goto(`${AXE_HOST}${entry}`, { waitUntil: "networkidle", timeout: Math.min(25_000, timeoutMs) }).catch(() => page.waitForLoadState("domcontentloaded").catch(() => undefined));
      await page.waitForTimeout(600);
      const screenshot = await page.screenshot({ type: "jpeg", quality: 62 }).catch(() => null);
      await page.addScriptTag({ content: source });
      const res = (await page.evaluate(async () => {
        const w = window as unknown as { axe: { run: (ctx: unknown, o: unknown) => Promise<{ violations: unknown[] }> } };
        const r = await w.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
        return r.violations;
      })) as AxeViolation[];
      return { ok: true, violations: res, screenshot, ms: Date.now() - t0 };
    });
  } catch (e) {
    return { ok: false, violations: [], screenshot: null, ms: Date.now() - t0, note: e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : "The test browser could not run." };
  }
}
