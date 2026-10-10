/**
 * A tiny syntax tinter for the studio's Code view (JS, CSS, HTML). It only tells comments, strings, keywords, numbers and tags
 * apart, which is enough to read generated code; a full editor would cost hundreds of KB for a read-only view. Pure.
 */
export type Tok = { k: "c" | "s" | "k" | "n" | "t" | "p" | ""; v: string };

const JS = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|null|undefined|true|false|this|yield)\b|\b(\d+(?:\.\d+)?)\b/g;
const CSS_RE = /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(@[\w-]+|![a-z]+)|(-?\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?|#[0-9a-fA-F]{3,8}\b)|([\w-]+)(?=\s*:)/g;
const HTML = /(<!--[\s\S]*?-->)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(<\/?[a-zA-Z][\w-]*|\/?>)|(\b[\w-]+)(?==)/g;

export function langOf(path: string): "js" | "css" | "html" | "text" {
  if (/\.(m?js|jsx|ts|tsx|json)$/i.test(path)) return "js";
  if (/\.css$/i.test(path)) return "css";
  if (/\.html?$/i.test(path)) return "html";
  return "text";
}

export function tokenize(src: string, lang: ReturnType<typeof langOf>): Tok[] {
  if (lang === "text") return [{ k: "", v: src }];
  const re = new RegExp(lang === "js" ? JS : lang === "css" ? CSS_RE : HTML);
  const out: Tok[] = [];
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ k: "", v: src.slice(last, m.index) });
    const kind: Tok["k"] = m[1] ? "c" : m[2] ? "s" : m[3] ? (lang === "html" ? "t" : "k") : m[4] ? (lang === "html" ? "p" : "n") : m[5] ? "p" : "";
    out.push({ k: kind, v: m[0] });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < src.length) out.push({ k: "", v: src.slice(last) });
  return out;
}

/** Order files the way people read an app: entry, app shell, screens, shared code, styles, the rest. */
export function sortFiles(paths: string[]): string[] {
  const rank = (p: string) => (p === "index.html" ? 0 : p === "app.js" ? 1 : p.startsWith("pages/") ? 2 : p.startsWith("lib/") ? 3 : /\.css$/.test(p) ? 4 : 5);
  return [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
