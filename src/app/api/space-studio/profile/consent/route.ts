import { limitRequest } from "@/lib/create/platform/ratelimit";
import { errorResponse } from "@/lib/create/platform/http";
import { isSameOrigin } from "@/lib/security/origin";
import { approveConsent, lookupConsent } from "@/lib/space-studio/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5;color:#111;background:#fff}button{font:inherit;padding:10px 18px;border-radius:999px;border:0;background:#111;color:#fff;cursor:pointer}@media (prefers-color-scheme: dark){body{color:#eee;background:#111}button{background:#eee;color:#111}}</style></head>
<body><h1>${esc(title)}</h1>${body}</body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "same-origin", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });
}

const invalid = (reason: "invalid" | "expired") =>
  page(reason === "expired" ? "This link expired" : "This link doesn't work", `<p>${reason === "expired" ? "Approval links work for 7 days." : "It may have been used already or replaced by a newer one."} Your child can send a new request from Space Studio.</p>`, reason === "expired" ? 410 : 404);

/**
 * The link from the parental consent email. GET shows what is being approved and an Approve button (so a mail scanner that opens
 * links can't approve by itself); POST (same form, same origin) approves. The token is single use and expires after 7 days.
 */
export async function GET(req: Request) {
  try {
    await limitRequest(req, "space-parent-consent", { perIp: 30 });
    const token = new URL(req.url).searchParams.get("token");
    const l = await lookupConsent(token);
    if (!l.ok) return invalid(l.reason);
    return page(
      "Approve Space Studio for your child",
      `<p>Your child asked to use Space Studio, Keplar's app for building Roblox and Blender projects with an AI assistant. They told us they are under 13, so they need your approval before they can use the assistant.</p>
<p>What they write to the assistant is processed to answer them. You can ask us to delete the account at any time by replying to the email.</p>
<form method="post"><input type="hidden" name="token" value="${esc(token!)}"><button type="submit">Approve</button></form>
<p>If you don't approve, just close this page.</p>`,
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await limitRequest(req, "space-parent-consent", { perIp: 30 });
    if (!isSameOrigin(req)) return page("This link doesn't work", "<p>Open the link from the email again.</p>", 403);
    const form = await req.formData().catch(() => null);
    const token = form?.get("token") ?? new URL(req.url).searchParams.get("token");
    const r = await approveConsent(token);
    if (!r.ok) return invalid(r.reason);
    return page("Approved", "<p>Thank you. Your child can now use Space Studio's assistant. You can close this page.</p>");
  } catch (e) {
    return errorResponse(e);
  }
}
