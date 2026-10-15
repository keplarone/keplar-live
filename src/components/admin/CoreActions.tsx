"use client";
import { confirmQuestion } from "@/components/kit";
import { useState } from "react";
import { useRouter } from "next/navigation";
import s from "./Admin.module.css";

export type CoreAction = { label: string; action: "kill" | "unkill" | "freeze" | "unfreeze" | "rollback" | "approve" | "promote" | "reject" | "canary" | "approve-proposal" | "reject-proposal" | "run"; id?: string; target?: string; pct?: number; tone?: "warn" | "danger"; confirm?: string; askReason?: boolean };

/** One-click admin actions for Keplar Core's self-development. Audited server-side; destructive ones ask first. */
export function CoreActions({ actions }: { actions: CoreAction[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!actions.length) return null;
  const go = async (a: CoreAction) => {
    if (a.confirm && !(await confirmQuestion(a.confirm, { confirmLabel: a.label, danger: a.tone === "danger" }))) return;
    const reason = a.askReason ? window.prompt("Why? (kept in the audit log)") ?? "" : "";
    setBusy(true);
    setMsg(a.action === "run" ? "Running… this can take a few minutes." : "");
    try {
      const res = await fetch("/api/admin/core", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: a.action, id: a.id, target: a.target, pct: a.pct, reason }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; report?: { skipped?: string; decisions?: string[]; evals?: string[] } };
      if (!res.ok) throw new Error(j.error ?? "That did not work.");
      setMsg(j.report ? j.report.skipped ?? ([...(j.report.decisions ?? []), ...(j.report.evals ?? [])].join("; ") || "Ran; nothing to change.") : "Done.");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={s.controls}>
      <div className={s.switches}>
        {actions.map((a) => (
          <button key={`${a.action}-${a.id ?? a.target ?? ""}`} type="button" className={a.tone === "danger" ? s.danger : a.tone === "warn" ? s.warn : s.btn} disabled={busy} onClick={() => void go(a)}>
            {a.label}
          </button>
        ))}
      </div>
      <p className={s.msg} role="status">{msg}</p>
    </div>
  );
}
