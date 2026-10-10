/**
 * Progressive preview: while the model is still writing, every finished html/css file is shown in a script-less sandboxed frame.
 * It is a view of text that has not been saved, linted or sanitized yet, so it never runs script: scripts, event handlers, <base>,
 * <iframe>/<object>/<embed> and javascript: URLs are removed, links are disabled, and the frame is sandboxed with no permissions.
 */
export function buildSrcdoc(files: Record<string, string>, page = "index.html"): string | null {
  const name = files[page] !== undefined ? page : Object.keys(files).find((f) => /\.html?$/i.test(f));
  if (!name) return null;
  let html = files[name];
  const links = [...html.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)];
  let pending = false;
  for (const l of links) {
    const href = /href=["']?([^"'\s>]+)/i.exec(l[0])?.[1];
    const css = href ? files[href.replace(/^\.?\//, "")] : undefined;
    if (css === undefined) pending = !href || !/^https?:/i.test(href) || pending;
    html = html.replace(l[0], css !== undefined ? `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>` : "");
  }
  if (pending) return null; // wait for the stylesheet so the first thing you see is styled, not a flash of plain text
  html = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|base)\b[\s\S]*?(<\/\1\s*>|>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2');
  const guard = "<style>a,button,input,select,textarea{pointer-events:none!important}html{scrollbar-width:none}</style>";
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${guard}</head>`) : guard + html;
}
