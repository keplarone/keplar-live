/**
 * Static verification of a generated project, before anything runs: every JS file parses as an ES module, every relative import
 * resolves to a file that exports the imported names, HTML references point at real files, the code only uses collections and
 * AI actions that exist in the spec, and common "forgot to import" mistakes are caught (hooks, html, components).
 */
import { parse, type Node } from "acorn";
import type { AppSpec } from "../types";

export type StaticIssue = { file: string; message: string; line?: number };

type Mod = { exports: Set<string>; star: boolean; hasDefault: boolean; imports: { from: string; names: string[]; line: number; def: boolean }[]; declared: Set<string>; refs: Map<string, number> };

const KUI = ["html", "render", "h", "Fragment", "useState", "useEffect", "useLayoutEffect", "useMemo", "useCallback", "useRef", "useReducer", "useContext", "createContext", "useId"];

function walk(node: unknown, fn: (n: Node & Record<string, unknown>, parent: (Node & Record<string, unknown>) | null, key: string) => void, parent: (Node & Record<string, unknown>) | null = null, key = "") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, fn, parent, key);
    return;
  }
  const n = node as Node & Record<string, unknown>;
  if (typeof n.type !== "string") return;
  fn(n, parent, key);
  for (const k of Object.keys(n)) {
    if (k === "type" || k === "start" || k === "end" || k === "loc" || k === "range") continue;
    const v = n[k];
    if (v && typeof v === "object") walk(v, fn, n, k);
  }
}

function bindNames(p: unknown, out: Set<string>) {
  if (!p || typeof p !== "object") return;
  const n = p as Record<string, unknown>;
  switch (n.type) {
    case "Identifier":
      out.add(n.name as string);
      break;
    case "ObjectPattern":
      for (const prop of n.properties as Record<string, unknown>[]) bindNames(prop.type === "RestElement" ? prop.argument : prop.value, out);
      break;
    case "ArrayPattern":
      for (const el of n.elements as unknown[]) bindNames(el, out);
      break;
    case "AssignmentPattern":
      bindNames(n.left, out);
      break;
    case "RestElement":
      bindNames(n.argument, out);
      break;
  }
}

const lineOf = (src: string, pos: number) => src.slice(0, pos).split("\n").length;

function analyze(src: string): Mod | { error: string; line: number } {
  let ast: Node;
  try {
    ast = parse(src, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
  } catch (e) {
    const err = e as { message: string; loc?: { line: number } };
    return { error: err.message.replace(/\s*\(\d+:\d+\)$/, ""), line: err.loc?.line ?? 0 };
  }
  const m: Mod = { exports: new Set(), star: false, hasDefault: false, imports: [], declared: new Set(), refs: new Map() };
  walk(ast, (n, parent, key) => {
    switch (n.type) {
      case "ImportDeclaration": {
        const names: string[] = [];
        let def = false;
        for (const s of n.specifiers as Record<string, unknown>[]) {
          bindNames(s.local, m.declared);
          if (s.type === "ImportSpecifier") names.push(((s.imported as Record<string, unknown>).name ?? (s.imported as Record<string, unknown>).value) as string);
          if (s.type === "ImportDefaultSpecifier") def = true;
        }
        m.imports.push({ from: (n.source as Record<string, unknown>).value as string, names, line: lineOf(src, n.start), def });
        break;
      }
      case "ImportExpression": {
        const s = n.source as Record<string, unknown>;
        if (s.type === "Literal" && typeof s.value === "string") m.imports.push({ from: s.value, names: [], line: lineOf(src, n.start), def: false });
        break;
      }
      case "ExportNamedDeclaration": {
        const d = n.declaration as Record<string, unknown> | null;
        if (d) {
          if (d.type === "VariableDeclaration") for (const v of d.declarations as Record<string, unknown>[]) bindNames(v.id, m.exports);
          else if (d.id) m.exports.add((d.id as Record<string, unknown>).name as string);
        }
        for (const s of (n.specifiers as Record<string, unknown>[]) ?? []) {
          const ex = s.exported as Record<string, unknown>;
          m.exports.add((ex.name ?? ex.value) as string);
        }
        if (n.source) m.imports.push({ from: (n.source as Record<string, unknown>).value as string, names: ((n.specifiers as Record<string, unknown>[]) ?? []).map((s) => (s.local as Record<string, unknown>).name as string), line: lineOf(src, n.start), def: false });
        break;
      }
      case "ExportDefaultDeclaration":
        m.hasDefault = true;
        m.exports.add("default");
        break;
      case "ExportAllDeclaration":
        m.star = true;
        m.imports.push({ from: (n.source as Record<string, unknown>).value as string, names: [], line: lineOf(src, n.start), def: false });
        break;
      case "VariableDeclarator":
        bindNames(n.id, m.declared);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (n.id) bindNames(n.id, m.declared);
        for (const p of n.params as unknown[]) bindNames(p, m.declared);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        if (n.id) bindNames(n.id, m.declared);
        break;
      case "CatchClause":
        if (n.param) bindNames(n.param, m.declared);
        break;
      case "Identifier": {
        if (parent) {
          if (parent.type === "MemberExpression" && key === "property" && !parent.computed) return;
          if ((parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") && key === "key" && !parent.computed) return;
          if (parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement") return;
          if (parent.type.startsWith("Import") || parent.type.startsWith("Export")) return;
        }
        const name = n.name as string;
        if (!m.refs.has(name)) m.refs.set(name, lineOf(src, n.start));
        break;
      }
    }
  });
  return m;
}

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
  const parts = from.split("/").slice(0, -1);
  let above = 0; // "../" past the app's root: the browser resolves it outside the app (a missing file), so keep it visible
  for (const seg of spec.replace(/^\//, "").split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") { if (parts.length) parts.pop(); else above++; }
    else parts.push(seg);
  }
  return ("../".repeat(above) + parts.join("/")).toLowerCase();
}

/** The relative specifier from one project file to another ("./x.js", "../lib/x.js"). */
function relativeSpec(from: string, to: string): string {
  const a = from.split("/").slice(0, -1);
  const b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  return (up ? "../".repeat(up) : "./") + b.slice(i).join("/");
}

/**
 * A relative import whose file is missing but whose tail names exactly one project file (root app.js importing
 * "../lib/ui.js" when the file is lib/ui.js): point it at that file.
 */
function autofixPaths(files: Record<string, string>, changed: string[]): Record<string, string> {
  const out = { ...files };
  const paths = Object.keys(files);
  const lower = new Set(paths.map((x) => x.toLowerCase()));
  const SPEC = /(\bimport\s[^"';]*?\sfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']+)\2/g;
  for (const [p, src] of Object.entries(files)) {
    if (!p.endsWith(".js")) continue;
    const next = src.replace(SPEC, (whole, head: string, q: string, spec: string) => {
      const target = resolve(p, spec);
      if (target && lower.has(target)) return whole;
      const tail = spec.replace(/^(\.{1,2}\/)+/, "").toLowerCase();
      const hits = paths.filter((f) => f.toLowerCase() === tail || f.toLowerCase().endsWith(`/${tail}`));
      if (hits.length !== 1 || hits[0] === p) return whole;
      return `${head}${q}${relativeSpec(p, hits[0])}${q}`;
    });
    if (next !== src) { out[p] = next; if (!changed.includes(p)) changed.push(p); }
  }
  return out;
}

export function staticCheck(files: Record<string, string>, spec: AppSpec): { issues: StaticIssue[]; uses: Set<"ui" | "three"> } {
  const issues: StaticIssue[] = [];
  const mods = new Map<string, Mod>();
  const uses = new Set<"ui" | "three">();
  for (const [p, src] of Object.entries(files)) {
    if (!/\.(m?js)$/.test(p)) continue;
    const a = analyze(src);
    if ("error" in a) issues.push({ file: p, line: a.line, message: `Syntax error: ${a.error}` });
    else mods.set(p, a);
    if (/window\.kui\b/.test(src)) uses.add("ui");
    if (/\bTHREE\./.test(src)) uses.add("three");
  }
  const exportedAnywhere = new Map<string, string>();
  for (const [p, m] of mods) for (const e of m.exports) if (e !== "default") exportedAnywhere.set(e, p);
  for (const [p, m] of mods) {
    for (const imp of m.imports) {
      if (/^https?:/.test(imp.from)) {
        issues.push({ file: p, line: imp.line, message: `Imports from a URL (${imp.from}); only the project's own files can be imported.` });
        continue;
      }
      const target = resolve(p, imp.from);
      if (!target) {
        issues.push({ file: p, line: imp.line, message: `Bare import "${imp.from}" cannot work (no npm in the browser). Use window.kui / window.THREE / keplar or a project file.` });
        continue;
      }
      const tm = mods.get(target);
      if (!files[target]) {
        issues.push({ file: p, line: imp.line, message: `Imports "${imp.from}" but ${target} does not exist${/\.(m?js)$/.test(target) ? "" : " (imports need the .js extension)"}.` });
        continue;
      }
      if (!tm || tm.star) continue;
      for (const n of imp.names) if (!tm.exports.has(n)) issues.push({ file: p, line: imp.line, message: `Imports { ${n} } from "${imp.from}", but ${target} does not export it (it exports: ${[...tm.exports].filter((e) => e !== "default").join(", ") || "nothing named"}).` });
      if (imp.def && !tm.hasDefault) issues.push({ file: p, line: imp.line, message: `Uses the default export of ${target}, which has no default export.` });
    }
    for (const [name, line] of m.refs) {
      if (m.declared.has(name)) continue;
      if (KUI.includes(name)) issues.push({ file: p, line, message: `Uses ${name} without defining it; add it to "const { ... } = window.kui;" at the top.` });
      else if (exportedAnywhere.has(name) && exportedAnywhere.get(name) !== p) issues.push({ file: p, line, message: `Uses ${name} without importing it from ${exportedAnywhere.get(name)}.` });
      else if (/^[A-Z][a-z]+[A-Z]\w*$/.test(name) && !(name in globalThis) && !/^(HTML|SVG)\w*Element$|^\w+(Event|Observer|Error)$/.test(name) && !/^(HashChangeEvent|KeyboardEvent|MouseEvent|PointerEvent|TouchEvent|CustomEvent|FormData|FileReader|IntersectionObserver|ResizeObserver|MutationObserver|AbortController|TextDecoder|TextEncoder|DOMParser|DataTransfer|ReadableStream|WeakMap|WeakSet|BigInt|ArrayBuffer|SharedArrayBuffer|DataView|OffscreenCanvas|AudioContext|ImageData|DOMRect|NodeFilter|HTMLElement|SyntaxError|TypeError|RangeError|ReferenceError|AnimationEvent|TransitionEvent|InputEvent|FocusEvent|WheelEvent|ErrorEvent|StorageEvent|MessageChannel|BroadcastChannel|SpeechSynthesisUtterance|URLSearchParams|PerformanceObserver|GainNode|OscillatorNode|CanvasGradient|Path2D|DOMMatrix|ClipboardItem|NumberFormat|DateTimeFormat|RelativeTimeFormat|PluralRules|ListFormat)$/.test(name))
        issues.push({ file: p, line, message: `Uses ${name}, which is not defined or imported anywhere in this file.` });
    }
  }
  const cols = new Set(spec.collections.map((c) => c.name));
  const acts = new Set(spec.ai.map((a) => a.name));
  for (const [p, src] of Object.entries(files)) {
    if (!/\.(m?js)$/.test(p)) continue;
    for (const m of src.matchAll(/collection\(\s*["'`]([A-Za-z_][\w]*)["'`]\s*\)/g)) if (!cols.has(m[1])) issues.push({ file: p, line: lineOf(src, m.index!), message: `Uses collection "${m[1]}", which is not in the spec (available: ${[...cols].join(", ") || "none - use keplar.local"}).` });
    for (const m of src.matchAll(/ai\.(?:run|stream)\(\s*["'`]([A-Za-z_][\w]*)["'`]/g)) if (!acts.has(m[1])) issues.push({ file: p, line: lineOf(src, m.index!), message: `Calls AI action "${m[1]}", which is not in the spec (available: ${[...acts].join(", ") || "none"}).` });
    if (!spec.auth.enabled && /keplar\.auth\.(signUp|signIn|require|ui|user)\(/.test(src)) issues.push({ file: p, message: "Uses keplar.auth but this app has no accounts; remove account features." });
    for (const m of src.matchAll(/keplar-image:([A-Za-z][\w]*)/g)) if (!spec.images.some((i) => i.slot === m[1])) issues.push({ file: p, message: `References image slot "${m[1]}", which does not exist (slots: ${spec.images.map((i) => i.slot).join(", ") || "none - draw with SVG/CSS"}).` });
  }
  for (const [p, src] of Object.entries(files)) {
    if (!p.endsWith(".html")) continue;
    for (const m of src.matchAll(/<(?:script|link|img|source)\b[^>]*\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi)) {
      const ref = m[1];
      if (/^(https?:|data:|mailto:|tel:|keplar-image:|\/fx\/)/i.test(ref) || ref === "kapp.css") continue;
      const t = resolve(p, ref.startsWith(".") || ref.startsWith("/") ? ref : `./${ref}`);
      if (t && !files[t] && /\.(js|css|html|svg)$/i.test(t)) issues.push({ file: p, message: `References ${ref}, which does not exist.` });
    }
    for (const m of src.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#?:]+\.html)["']/gi)) {
      const t = resolve(p, `./${m[1]}`);
      if (t && !files[t]) issues.push({ file: p, message: `Links to ${m[1]}, which does not exist.` });
    }
  }
  if (!files["app.js"] && spec.kind !== "site" && !Object.keys(files).some((f) => f.endsWith(".js"))) issues.push({ file: "app.js", message: "The app has no entry module." });
  return { issues: dedupe(issues), uses };
}

function dedupe(list: StaticIssue[]): StaticIssue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.file}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 60);
}

/**
 * Deterministic repairs for the most common wiring slip, before any model is asked: importing Preact/htm hooks from a module
 * that does not exist ("../lib/kui.js", "preact", "preact/hooks", "htm/preact"). Those names come from window.kui, so the import
 * becomes (or merges into) one `const { ... } = window.kui;` line. Returns the files that changed.
 */
export function autofixImports(input: Record<string, string>): { files: Record<string, string>; changed: string[] } {
  const changed: string[] = [];
  const files = autofixPaths(input, changed);
  const out = { ...files };
  const exists = new Set(Object.keys(files).map((p) => p.toLowerCase()));
  const IMPORT = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?[ \t]*$/gm;
  for (const [p, src] of Object.entries(files)) {
    if (!p.endsWith(".js")) continue;
    const names: string[] = [];
    const next = src.replace(IMPORT, (line, list: string, from: string) => {
      const target = resolve(p, from);
      const kuiLike = /(^|\/)(kui|preact|hooks|htm|react)(\.m?js)?$|^(preact|preact\/hooks|htm|htm\/preact|react)$/.test(from);
      if (!kuiLike || (target && exists.has(target))) return line;
      const parsed = list.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.split(/\s+as\s+/));
      if (!parsed.every(([n]) => KUI.includes(n))) return line;
      for (const [n, alias] of parsed) names.push(alias && alias !== n ? `${n}: ${alias}` : n);
      return "";
    });
    if (!names.length) continue;
    const existing = /const\s*\{([^}]*)\}\s*=\s*window\.kui\s*;?/.exec(next);
    let fixed: string;
    if (existing) {
      const have = existing[1].split(",").map((x) => x.trim()).filter(Boolean);
      const merged = [...new Set([...have, ...names])];
      fixed = next.replace(existing[0], `const { ${merged.join(", ")} } = window.kui;`);
    } else {
      const lines = next.split("\n");
      let last = -1;
      lines.forEach((l, i) => { if (/^\s*import\s/.test(l)) last = i; });
      lines.splice(last + 1, 0, `const { ${[...new Set(names)].join(", ")} } = window.kui;`);
      fixed = lines.join("\n");
    }
    out[p] = fixed.replace(/\n{3,}/g, "\n\n");
    if (!changed.includes(p)) changed.push(p);
  }
  return { files: out, changed };
}
