/** Pure helpers for the live preview (no React, no DOM): unit-tested in tests/create-advanced-ui.test.ts. */

/** Sites render in this browser from the live files (stylesheets and scripts inlined); apps use the signed live-draft URL. */
export function siteSrcDoc(files: Record<string, string>, page: string): string {
  const norm = (h: string) => h.replace(/^\.?\//, "").split(/[?#]/)[0];
  let html = files[page] ?? files["index.html"] ?? Object.entries(files).find(([p]) => /\.html?$/.test(p))?.[1] ?? "";
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/rel=["']?stylesheet/i.test(tag)) return tag;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    const css = href ? files[norm(href)] : undefined;
    return css === undefined ? tag : `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  });
  html = html.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (tag, a: string, src: string, b: string) => {
    const js = files[norm(src)];
    return js === undefined ? tag : `<script${(a + b).trimEnd()}>${js.replace(/<\/script/gi, "<\\/script")}</script>`;
  });
  return html;
}
