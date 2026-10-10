/** What every rule sees: the files, parsed once (HTML incl. htm templates, CSS incl. <style> and style=""), design tokens. */
import { attrVal, elementsOf, type El, type HtmlDoc } from "./html";
import { parseCss, type Rule, type Sheet } from "./css";
import { LineIndex, clip } from "./text";
import type { Category, Finding, Patch, Severity } from "./types";

export type CssSource = { file: string; sheet: Sheet; kind: "file" | "style" | "inline"; el?: El };
export type CriticOptions = { name?: string; description?: string; kind?: "app" | "site"; maxPerRule?: number };

export class Ctx {
  readonly html = new Map<string, HtmlDoc[]>();
  readonly css: CssSource[] = [];
  readonly lines = new Map<string, LineIndex>();
  readonly findings: Finding[] = [];
  readonly tokens = new Map<string, string>();
  /** Token scopes: selector → custom properties declared there (":root", "[data-theme=dark]", "body.dark"…). */
  readonly tokenScopes = new Map<string, Map<string, { value: string; file: string; start: number; end: number; valueStart: number; valueEnd: number }>>();
  private perRule = new Map<string, number>();
  constructor(public files: Record<string, string>, public opts: CriticOptions = {}) {
    for (const [path, src] of Object.entries(files)) {
      this.lines.set(path, new LineIndex(src));
      if (/\.css$/i.test(path)) this.css.push({ file: path, sheet: parseCss(src, 0), kind: "file" });
      const docs = elementsOf(path, src);
      if (docs.length) this.html.set(path, docs);
      for (const d of docs) {
        for (const el of d.els) {
          if (el.tag === "style" && !el.inTemplate && el.closeStart !== null) this.css.push({ file: path, sheet: parseCss(src.slice(el.openEnd, el.closeStart), el.openEnd), kind: "style", el });
          const st = el.attrs.style;
          if (st?.value && !st.dynamic) this.css.push({ file: path, sheet: parseCss(src.slice(st.valueStart, st.valueEnd), st.valueStart, true), kind: "inline", el });
        }
      }
    }
    for (const c of this.css) {
      for (const r of c.sheet.rules) {
        for (const d of r.decls) {
          if (!d.prop.startsWith("--")) continue;
          const scope = r.selector.replace(/\s+/g, " ");
          if (!this.tokenScopes.has(scope)) this.tokenScopes.set(scope, new Map());
          this.tokenScopes.get(scope)!.set(d.prop, { value: d.value, file: c.file, start: d.start, end: d.end, valueStart: d.valueStart, valueEnd: d.valueEnd });
          if (/^(:root|html|body)$/i.test(scope) || !this.tokens.has(d.prop)) this.tokens.set(d.prop, d.value);
        }
      }
    }
  }

  get pages(): string[] { return Object.keys(this.files).filter((p) => /\.html?$/i.test(p)); }
  get scripts(): string[] { return Object.keys(this.files).filter((p) => /\.m?js$/i.test(p)); }
  allEls(): { file: string; el: El }[] {
    const out: { file: string; el: El }[] = [];
    for (const [file, docs] of this.html) for (const d of docs) for (const el of d.els) if (!el.tag.includes("\u0001")) out.push({ file, el });
    return out;
  }
  rules(): { file: string; rule: Rule; kind: CssSource["kind"]; el?: El }[] {
    return this.css.flatMap((c) => c.sheet.rules.map((rule) => ({ file: c.file, rule, kind: c.kind, el: c.el })));
  }

  add(f: { rule: string; category: Category; severity: Severity; file: string; at: number; element?: string; title: string; detail: string; fix: string; patch?: Patch[]; ref?: string }) {
    const max = this.opts.maxPerRule ?? 12;
    const n = (this.perRule.get(f.rule) ?? 0) + 1;
    this.perRule.set(f.rule, n);
    if (n > max) return;
    const { line, col } = this.lines.get(f.file)?.pos(f.at) ?? { line: 1, col: 1 };
    const id = `${f.rule}@${f.file}:${line}:${col}`;
    if (this.findings.some((x) => x.id === id)) return;
    this.findings.push({ id, rule: f.rule, category: f.category, severity: f.severity, source: "static", file: f.file, line, col, element: f.element ? clip(f.element, 160) : undefined, title: f.title, detail: f.detail, fix: f.fix, patch: f.patch?.length ? f.patch : undefined, ref: f.ref });
  }

  /** A patch inserting `text` at `at`. */
  ins(file: string, at: number, text: string): Patch { return this.rep(file, at, at, text); }
  /** A patch replacing [start,end), with context for re-anchoring. */
  rep(file: string, start: number, end: number, text: string): Patch {
    const src = this.files[file];
    return { file, start, end, expect: src.slice(start, end), replace: text, pre: src.slice(Math.max(0, start - 24), start), post: src.slice(end, end + 24) };
  }
  /** Insert right after the tag name of an element's open tag. */
  insAttr(file: string, el: El, attr: string): Patch { return this.ins(file, el.start + 1 + el.tag.length, ` ${attr}`); }
  attr(el: El, n: string) { return attrVal(el, n); }
}
