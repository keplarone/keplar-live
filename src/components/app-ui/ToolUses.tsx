"use client";

import { useEffect, useState } from "react";
import type { ToolUse } from "@/lib/orchestration/types";
import { Button } from "@/components/kit";
import s from "./ChatTools.module.css";

type Decision = { state: "idle" | "busy" | "sent" | "failed" | "rejected" | "cancelled"; result?: string; error?: string };

const VERB: Record<ToolUse["status"], string> = {
  running: "Using",
  done: "Used",
  error: "Couldn't use",
  awaiting_approval: "Needs your approval:",
  blocked: "Blocked:",
  skipped: "Skipped:",
};

/**
 * Visible, honest tool states for one answer: "Using <app>: <tool>", the receipt, and an inline approval card for
 * anything that isn't allowed to run on its own. Text here is our own sentences plus the owner-visible arguments;
 * app output is never rendered as markup or as instructions.
 */
export function ToolUses({ uses }: { uses?: ToolUse[] }) {
  if (!uses?.length) return null;
  return (
    <ul className={s.list} aria-label="Connected apps used for this answer">
      {uses.map((u) => (
        <UseCard key={u.id} use={u} />
      ))}
    </ul>
  );
}

function UseCard({ use: u }: { use: ToolUse }) {
  const [d, setD] = useState<Decision>({ state: "idle" });

  // A stored answer can outlive its approval: look up the real status once.
  useEffect(() => {
    if (u.status !== "awaiting_approval" || !u.approvalId) return;
    let off = false;
    fetch("/api/business/approvals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { approvals?: { id: string; status: string; result?: string }[] } | null) => {
        const a = j?.approvals?.find((x) => x.id === u.approvalId);
        if (off || !a || a.status === "pending") return;
        setD(a.status === "sent" ? { state: "sent", result: a.result } : a.status === "failed" ? { state: "failed", error: a.result } : a.status === "rejected" ? { state: "rejected" } : { state: "cancelled" });
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [u.status, u.approvalId]);

  async function decide(decision: "approve" | "reject") {
    setD({ state: "busy" });
    try {
      const res = await fetch(`/api/business/approvals/${encodeURIComponent(u.approvalId ?? "")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const j = (await res.json().catch(() => null)) as { approval?: { status: string; result?: string }; error?: string } | null;
      if (!res.ok || !j?.approval) {
        setD({ state: "idle", error: j?.error ?? "That didn't go through. Try again." });
        return;
      }
      const a = j.approval;
      setD(a.status === "sent" ? { state: "sent", result: a.result } : a.status === "failed" ? { state: "failed", error: a.result } : a.status === "rejected" ? { state: "rejected" } : { state: "cancelled" });
    } catch {
      setD({ state: "idle", error: "Couldn't reach Keplar. Try again." });
    }
  }

  const pending = u.status === "awaiting_approval" && (d.state === "idle" || d.state === "busy");
  return (
    <li className={s.use} data-status={pending ? "awaiting_approval" : d.state === "sent" ? "done" : d.state === "failed" ? "error" : u.status}>
      <p className={s.head}>
        <span className={s.dot} aria-hidden="true" />
        <span>
          {VERB[u.status]} {u.app}: {u.tool}
        </span>
      </p>
      {u.message && u.status !== "done" ? <p className={s.msg}>{u.message}</p> : null}
      {u.status === "done" && u.message ? <p className={s.meta}>{u.message}</p> : null}
      {u.args && u.args !== "{}" ? <pre className={s.args} aria-label="Arguments">{u.args}</pre> : null}
      {pending ? (
        <>
          <div className={s.row}>
            <Button size="sm" variant="primary" loading={d.state === "busy"} onClick={() => void decide("approve")}>
              {d.state === "busy" ? "Working…" : "Approve and run"}
            </Button>
            <Button size="sm" variant="secondary" disabled={d.state === "busy"} onClick={() => void decide("reject")}>
              Decline
            </Button>
          </div>
          {d.error ? <p className={s.msg} role="alert">{d.error}</p> : null}
        </>
      ) : null}
      {d.state === "sent" ? <p className={s.msg} role="status">Approved and run. {d.result ? `App output (untrusted): ${d.result.slice(0, 400)}` : ""}</p> : null}
      {d.state === "failed" ? <p className={s.msg} role="status">Approved, but the call failed: {(d.error ?? "unknown error").slice(0, 300)}</p> : null}
      {d.state === "rejected" ? <p className={s.msg} role="status">Declined. Nothing was sent.</p> : null}
      {d.state === "cancelled" ? <p className={s.msg} role="status">Canceled. Nothing was sent.</p> : null}
      {u.receiptId ? <p className={s.meta}>Receipt {u.receiptId}{u.durationMs ? ` · ${u.durationMs} ms` : ""}</p> : null}
    </li>
  );
}
