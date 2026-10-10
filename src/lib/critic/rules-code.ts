/** Code quality rules, from the real syntax tree (acorn): syntax errors, eval, unsafe innerHTML, leftovers, loose equality. */
import { parse } from "acorn";
import type { Ctx } from "./context";

type N = { type: string; start: number; end: number; [k: string]: unknown };
const isNode = (v: unknown): v is N => Boolean(v) && typeof v === "object" && typeof (v as N).type === "string";

function walk(n: N, fn: (n: N, parent: N | null, depth: number) => void, parent: N | null = null, depth = 0) {
  fn(n, parent, depth);
  const nd = /Function/.test(n.type) ? depth + 1 : depth;
  for (const k in n) {
    if (k === "type" || k === "start" || k === "end" || k === "loc") continue;
    const v = n[k];
    if (Array.isArray(v)) for (const x of v) { if (isNode(x)) walk(x, fn, n, nd); }
    else if (isNode(v)) walk(v, fn, n, nd);
  }
}

const SECRET = /(sk_live_[0-9a-zA-Z]{16,}|sk-(?:or-|proj-)?[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{30,}|xox[bap]-[A-Za-z0-9-]{20,})/;

export function codeRules(c: Ctx) {
  for (const [file, src] of Object.entries(c.files)) {
    const sm = SECRET.exec(src);
    if (sm) c.add({ rule: "code/secret", category: "code", severity: "critical", file, at: sm.index, element: `${sm[0].slice(0, 8)}…`, title: "Secret key in the source", detail: "Anyone can read this file in the browser and use the key on your account.", fix: "Remove it, rotate the key, and keep it server-side (app settings / environment), calling it through the app's backend." });
    if (!/\.m?js$/.test(file)) continue;
    let ast: N;
    try {
      ast = parse(src, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true }) as unknown as N;
    } catch (e) {
      const pos = (e as { pos?: number }).pos ?? 0;
      c.add({ rule: "code/syntax", category: "code", severity: "critical", file, at: pos, element: src.slice(Math.max(0, pos - 30), pos + 30), title: "Syntax error", detail: `${(e as Error).message.replace(/\s*\(\d+:\d+\)$/, "")}: the whole file fails to load, so every screen importing it is blank.`, fix: "Fix the syntax at this position (often a missing bracket, comma or backtick)." });
      continue;
    }
    const removeStmt = (n: N) => {
      let s = n.start;
      while (s > 0 && (src[s - 1] === " " || src[s - 1] === "\t")) s--;
      let e = n.end;
      if (src[e] === "\n") e++;
      const lineStart = src.lastIndexOf("\n", n.start - 1) + 1;
      return c.rep(file, s === lineStart && src[e - 1] === "\n" ? s : n.start, s === lineStart && src[e - 1] === "\n" ? e : n.end, "");
    };
    walk(ast, (n, parent) => {
      if (n.type === "ExpressionStatement" && (n.expression as N).type === "CallExpression") {
        const cal = (n.expression as N).callee as N & { object?: N & { name?: string }; property?: N & { name?: string } };
        if (cal.type === "MemberExpression" && cal.object?.name === "console" && /^(log|debug|info)$/.test(cal.property?.name ?? "")) {
          // Only a statement that sits in a block can be deleted; `if (x) console.log(y)` would swallow the next statement.
          const inBlock = parent?.type === "BlockStatement" || parent?.type === "Program" || parent?.type === "StaticBlock";
          c.add({ rule: "code/console", category: "code", severity: "info", file, at: n.start, element: src.slice(n.start, Math.min(n.end, n.start + 70)), title: `console.${cal.property!.name} left in`, detail: "Debug output ships to every visitor's console and can leak data.", fix: inBlock ? "Delete it (keep console.error for real failures)." : "Delete it together with the branch that only logs.", patch: inBlock ? [removeStmt(n)] : undefined });
        }
      }
      if (n.type === "DebuggerStatement") c.add({ rule: "code/debugger", category: "code", severity: "major", file, at: n.start, element: "debugger;", title: "debugger statement left in", detail: "It pauses the app for anyone with dev tools open.", fix: "Delete it.", patch: [removeStmt(n)] });
      if (n.type === "CallExpression") {
        const cal = n.callee as N & { name?: string; object?: N & { name?: string }; property?: N & { name?: string } };
        if (cal.type === "Identifier" && cal.name === "eval") c.add({ rule: "code/eval", category: "code", severity: "critical", file, at: n.start, element: src.slice(n.start, Math.min(n.end, n.start + 60)), title: "eval() runs strings as code", detail: "Any data that reaches it can execute arbitrary script (XSS), and it disables engine optimizations.", fix: "Parse data with JSON.parse or replace it with a lookup table." });
      }
      if (n.type === "NewExpression" && (n.callee as N & { name?: string }).name === "Function") c.add({ rule: "code/eval", category: "code", severity: "critical", file, at: n.start, element: src.slice(n.start, Math.min(n.end, n.start + 60)), title: "new Function() runs strings as code", detail: "Equivalent to eval: injection risk.", fix: "Replace with a real function." });
      if (n.type === "AssignmentExpression") {
        const l = n.left as N & { property?: N & { name?: string } };
        const r = n.right as N;
        if (l.type === "MemberExpression" && /^(innerHTML|outerHTML)$/.test(l.property?.name ?? "") && r.type !== "Literal" && !(r.type === "TemplateLiteral" && ((r.expressions as N[]) ?? []).length === 0)) {
          c.add({ rule: "code/unsafe-html", category: "code", severity: "major", file, at: n.start, element: src.slice(n.start, Math.min(n.end, n.start + 80)), title: `${l.property!.name} set from data`, detail: "If any part comes from users or the network, it executes injected markup and scripts (XSS).", fix: "Render with html`…` (escapes values) or set textContent; only use innerHTML with sanitized, trusted strings." });
        }
      }
      if (n.type === "BinaryExpression" && (n.operator === "==" || n.operator === "!=")) {
        const L = n.left as N & { value?: unknown; raw?: string };
        const R = n.right as N & { value?: unknown; raw?: string };
        const nullish = (x: N & { raw?: string; name?: string }) => (x.type === "Literal" && x.raw === "null") || (x.type === "Identifier" && x.name === "undefined");
        if (!nullish(L) && !nullish(R)) {
          const between = src.slice(L.end, R.start);
          const off = between.indexOf(n.operator as string);
          if (off >= 0) {
            const at = L.end + off;
            c.add({ rule: "code/loose-equality", category: "code", severity: "minor", file, at, element: src.slice(n.start, Math.min(n.end, n.start + 60)), title: `Loose ${n.operator} comparison`, detail: `${n.operator} converts types first ("0" == 0, "" == false), a classic source of silent bugs.`, fix: `Use ${n.operator}=.`, patch: [c.rep(file, at, at + 2, `${n.operator}=`)] });
          }
        }
      }
      if (n.type === "VariableDeclaration" && n.kind === "var") c.add({ rule: "code/var", category: "code", severity: "info", file, at: n.start, element: src.slice(n.start, Math.min(n.end, n.start + 50)), title: "var declaration", detail: "var is function-scoped and hoisted, which leaks values out of blocks and loops.", fix: "Use let (or const if never reassigned).", patch: [c.rep(file, n.start, n.start + 3, "let")] });
      if (n.type === "CatchClause" && ((n.body as N & { body: N[] }).body ?? []).length === 0) c.add({ rule: "code/empty-catch", category: "code", severity: "minor", file, at: n.start, element: src.slice(n.start, Math.min(n.end, n.start + 40)), title: "Error swallowed silently", detail: "An empty catch hides failures: the UI just stops working and nobody learns why.", fix: "Show the user a message and log it: catch (e) { console.error(e); setError(\"…\"); }." });
      if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)) {
        const lines = src.slice(n.start, n.end).split("\n").length;
        if (lines > 120) c.add({ rule: "code/long-function", category: "code", severity: "minor", file, at: n.start, element: src.slice(n.start, Math.min(n.end, n.start + 60)).split("\n")[0], title: `${lines}-line function`, detail: "Functions this long mix concerns, so changes in one part break another.", fix: "Split it into named pieces (data loading, event handlers, rendering sub-sections)." });
      }
    });
    for (const m of src.matchAll(/\/\/\s*(TODO|FIXME|XXX)\b[^\n]*/g)) c.add({ rule: "code/todo", category: "code", severity: "info", file, at: m.index ?? 0, element: m[0].slice(0, 80), title: `${m[1]} left in the code`, detail: "An unfinished piece is shipping.", fix: "Finish it or remove the note." });
  }
}
