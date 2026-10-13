import Link from "next/link";
import { brand } from "@/lib/site";
import { cronStatus, healthSummary } from "@/lib/ops/health";
import { checkoutAvailable } from "@/lib/billing/whop";
import { liveMode } from "@/lib/orchestration/providers";
import s from "@/components/status/Status.module.css";

type Line = { name: string; detail: string; state: "ok" | "degraded" | "down" | "info"; badge?: string };
const utc = (iso: string | null) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "never");
const LABEL: Record<Line["state"], string> = { ok: "Operational", degraded: "Degraded", down: "Down", info: "Not active" };

/**
 * Live checks made when the page is opened (not a recorded history): keplar.one/status and, in the Business look,
 * business.keplar.one/status. Keplar One and Keplar Business run on the same servers, so both show the same checks.
 */
export async function StatusContent() {
  const h = await healthSummary();
  const crons = await cronStatus();
  const lines: Line[] = [
    { name: "Website", detail: "This page was just rendered by the live server.", state: "ok" },
    { name: "Accounts and data", detail: h.body.ok ? ("roundTripMs" in h.body ? `A test write and read of the database just worked (${h.body.roundTripMs} ms).` : "Using the local store.") : "A test write and read of the database failed.", state: h.body.ok ? "ok" : "down" },
    { name: "Answers", detail: liveMode() ? "Model access is switched on." : "Model access is not switched on for this deployment.", state: liveMode() ? "ok" : "down" },
    { name: "Plan checkout", detail: checkoutAvailable() ? "Checkout is available." : "Checkout opens soon.", state: checkoutAvailable() ? "ok" : "info" },
    ...crons.map((c): Line => ({
      name: c.label,
      detail: c.state === "ok" ? `Last successful run ${utc(c.lastOkAt)}.` : c.state === "never" ? "Runs once a day; no run recorded yet." : c.state === "late" ? `Late. Last successful run ${utc(c.lastOkAt)}.` : "The last run failed.",
      badge: c.state === "never" ? "Waiting for first run" : c.state === "late" ? "Late" : c.state === "failed" ? "Last run failed" : undefined,
      state: c.state === "ok" ? "ok" : c.state === "never" ? "info" : "degraded",
    })),
  ];
  const worst = lines.some((l) => l.state === "down") ? "down" : lines.some((l) => l.state === "degraded") ? "degraded" : "ok";
  return (
    <div className={s.page}>
      <p className={s.eyebrow}>Status</p>
      <h1 className={s.title}>{worst === "ok" ? "Keplar is running normally." : worst === "degraded" ? "Keplar is running with a delay in one area." : "Keplar has a problem right now."}</h1>
      <p className={s.lede}>These are live checks made when you opened this page, not a recorded history. If something looks wrong, tell us at <a href={`mailto:${brand.contactEmail}`}>{brand.contactEmail}</a>.</p>
      <ul className={s.list}>
        {lines.map((l) => (
          <li key={l.name} className={s.row}>
            <span className={s.name}>{l.name}</span>
            <span className={s.badge}>{l.badge ?? LABEL[l.state]}</span>
            <span className={s.detail}>{l.detail}</span>
          </li>
        ))}
      </ul>
      <p className={s.note}>Machine-readable: <Link href="/api/health">/api/health</Link>.</p>
    </div>
  );
}
