/**
 * Abuse reports for published user sites. GET renders a minimal report form
 * (linked from every published site's footer); POST records the report.
 * Reports are reviewed by a human; takedown is POST /api/create/abuse/{id}.
 */
import { errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { alertOwner } from "@/lib/accounts/alerts";
import { fileAbuseReport, reporterOf, takedownNote } from "@/lib/create/abuse-policy";
import { clientIpOf, rateLimit } from "@/lib/create/platform/ratelimit";
import { projects } from "@/lib/create/repo";
import { brand } from "@/lib/site";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(req: Request) {
  const site = new URL(req.url).searchParams.get("site") ?? "";
  const done = new URL(req.url).searchParams.get("done");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Report abuse · ${esc(brand.name)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:10vh auto;padding:0 24px;color:#141414}label{display:grid;gap:6px;margin-top:16px;font-size:14px;color:#555}select,input,textarea{font:inherit;padding:10px;border:1px solid #ddd;border-radius:8px}button{margin-top:20px;height:44px;padding:0 20px;border-radius:999px;border:0;background:#141414;color:#fff;font:inherit}</style></head>
<body><h1>Report a site hosted on ${esc(brand.name)}</h1>${
    done
      ? `<p>Thanks. We review every report, and remove sites that break our terms.</p>`
      : `<p>Tell us what's wrong. We review every report.</p>
<form method="post"><input type="hidden" name="target" value="${esc(site)}">
<label>Reason<select name="reason" required><option value="phishing">Phishing or scam</option><option value="malware">Malware</option><option value="csam">Child sexual abuse material</option><option value="ncii">Non-consensual intimate imagery</option><option value="impersonation">Impersonation</option><option value="copyright">Copyright</option><option value="other">Other</option></select></label>
<label>Details<textarea name="details" rows="4"></textarea></label>
<label>Your email (optional)<input name="email" type="email"></label>
<button type="submit">Send report</button></form>`
  }</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: Request) {
  try {
    await rateLimit(`abuse:${clientIpOf(req)}`, 5);
    const form = req.headers.get("content-type")?.includes("json") ? ((await req.json()) as Record<string, string>) : Object.fromEntries((await req.formData()).entries());
    const target = String(form.target ?? "").slice(0, 200);
    if (!target) throw new HttpError(400, "Which site are you reporting?");
    const project = await projects().findSystem((p) => p.id === target || p.slug === target);
    const reason = String(form.reason ?? "other").slice(0, 40);
    const details = String(form.details ?? "").slice(0, 4000);
    // csam/ncii: taken down at once only from a verified account or 3+ distinct reporters in 24 h; otherwise urgent + alert (abuse-policy.ts).
    const filed = await fileAbuseReport({ workspaceId: project?.workspaceId ?? "system", target: project?.id ?? target, reason, details, reporterEmail: form.email ? String(form.email).slice(0, 200) : undefined, reporter: await reporterOf(req) });
    const report = filed.report;
    if (project && filed.takeDown) await projects().update(project.workspaceId, project.id, { takenDown: true });
    if (project && filed.urgent) await alertOwner(`${filed.takeDown ? "" : "URGENT "}Abuse report: ${reason} on project ${project.slug}`, `Project ${project.name} (${project.id}, workspace ${project.workspaceId}) was reported for ${reason}. Report ${report.id}.\n\n${details.slice(0, 1000)}\n\n${takedownNote(filed)}`).catch(() => undefined);
    if (req.headers.get("accept")?.includes("text/html")) return Response.redirect(new URL(`/api/create/abuse?done=1`, req.url), 303);
    return json({ report: { id: report.id, status: report.status } }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
