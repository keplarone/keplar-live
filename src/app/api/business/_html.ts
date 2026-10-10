/** Minimal HTML responses for public Business OS pages (forms, mock checkout). */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export { esc };

export function htmlPage(status: number, title: string, inner: string) {
  const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#f6f6f4;color:#111;display:grid;place-items:center;min-height:100vh}main{background:#fff;border:1px solid #e3e3e0;border-radius:14px;padding:28px;max-width:420px;width:calc(100% - 40px)}h1{font-size:20px;margin:0 0 6px}.mono{font:12px ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:#777}.amt{font-size:28px;margin:12px 0}label{display:block;font-size:13px;margin:14px 0 4px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d6d6d2;border-radius:8px;font:inherit}.row{display:flex;gap:8px;margin-top:16px}button{flex:1;padding:11px;border-radius:999px;border:1px solid #111;background:#111;color:#fff;font:inherit;cursor:pointer}button.ghost{background:#fff;color:#111}.note{font-size:12px;color:#777;margin-top:14px}</style></head><body><main>${inner}</main></body></html>`;
  return new Response(doc, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "x-frame-options": "SAMEORIGIN", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'" } });
}

export function seeOther(location: string) {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });
}

export function withParam(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
