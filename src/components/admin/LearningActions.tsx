"use client";
import { confirmQuestion } from "@/components/kit";
import { useState } from "react";
import { useRouter } from "next/navigation";
import s from "./Admin.module.css";

type Action = { label: string; action: "rollback" | "approve" | "reject" | "restore" | "freeze" | "unfreeze" | "run"; version?: number; tone?: "warn" | "danger"; confirm?: string; dry?: boolean };

/** One-click admin actions for the learning loop. Every one is audited server-side; destructive ones ask first. */
export function LearningActions({ actions }: { actions: Action[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (a: Action) => {
    if (a.confirm && !(await confirmQuestion(a.confirm, { confirmLabel: a.label, danger: a.tone === "danger" }))) return;
    setBusy(true);
    setMsg("");
    try {
      const reason = a.action === "rollback" ? window.prompt("Why? (shown in the audit log)") ?? "" : "";
      const res = await fetch("/api/admin/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: a.action, version: a.version, reason, dry: a.dry }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; candidate?: { note: string }; skipped?: string };
      if (!res.ok) throw new Error(j.error ?? "That did not work.");
      setMsg(j.candidate?.note ?? j.skipped ?? "Done.");
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
          <button key={`${a.action}-${a.version ?? ""}-${a.dry ? "d" : ""}`} type="button" className={a.tone === "danger" ? s.danger : a.tone === "warn" ? s.warn : s.btn} disabled={busy} onClick={() => void go(a)}>
            {a.label}
          </button>
        ))}
      </div>
      <p className={s.msg} role="status">{msg}</p>
    </div>
  );
}
