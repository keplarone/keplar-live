"use client";
/**
 * Agent mode in the chat: the workflow card under the answer, as in the product video.
 *   Schedule → data step → Draft → Owner approval, then "Pending approvals" with the exact drafts and "Approve and send".
 * Setting up an agent is a change to the workspace, so nothing runs until the owner clicks "Set up and run now". The run is the
 * normal agent run (forceApproval): every outbound action waits here, and approving goes through POST /api/business/approvals/[id].
 * The cards only ever show what the run's own steps and approvals say.
 */
import Link from "next/link";
import { BUSINESS_URL } from "@/lib/business-site";
import { useEffect, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { CHAT_INFO as INFO, CHAT_TEMPLATES, isInApp, outboundNoun, pickTemplate, plannedNodes, runNodes, type ChatTemplate, type FlowApproval, type FlowNode } from "@/lib/business/chat-flow";
import type { AgentFlow, KeplarMessage, Ledger, UserMessage } from "../state/types";
import { IconAgents, IconApprovals, IconCheck, IconHistory } from "../icons";
import { Button, Icon, IconButton, notify } from "@/components/kit";
import s from "./agent-flow.module.css";
import la from "../link-action.module.css";

type Props = {
  message: KeplarMessage;
  user?: UserMessage;
  ledger: Ledger;
  isLast: boolean;
  onPatch: (patch: Partial<AgentFlow>) => void;
  onSettled: () => void;
};

const NODE_ICON = { schedule: IconHistory, data: IconAgents, draft: IconAgents, approval: IconApprovals } as const;

/** Runs started in this tab (StrictMode effects run twice; a re-render must never start a second run). */
const started = new Set<string>();

export function AgentFlowTurn({ message: m, user, ledger, isLast, onPatch, onSettled }: Props) {
  const f = m.agentFlow;
  const patch = useRef(onPatch);
  const settled = useRef(onSettled);
  useEffect(() => { patch.current = onPatch; settled.current = onSettled; });

  // First time the answer is in: pick the workflow from the message (or offer the list). Nothing runs yet.
  useEffect(() => {
    if (f || m.status !== "done" || !ledger.synced) return;
    if (!ledger.signedIn) { patch.current({ phase: "signin", steps: [], approvals: [] }); return; }
    const pick = pickTemplate(user?.text ?? "");
    patch.current(pick ? { phase: "ready", template: pick.template, monitor: pick.monitor, steps: [], approvals: [] } : { phase: "choose", steps: [], approvals: [] });
  }, [f, m.status, ledger.synced, ledger.signedIn, user?.text]);

  if (!f) return null;

  const run = async (template: ChatTemplate) => {
    const key = `${m.id}:${template}`;
    if (started.has(key)) return;
    started.add(key);
    let steps: string[] = [];
    patch.current({ phase: "running", template, steps, approvals: [], run: undefined, error: undefined, code: undefined });
    try {
      const res = await fetch("/api/business/agents/from-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template, ...(template === "monitor" && f.monitor ? { monitor: f.monitor } : {}) }) });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        patch.current({ phase: "error", error: j.error ?? "The workflow couldn't start. Nothing was sent.", code: j.code });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line) as { type: string; agent?: AgentFlow["agent"]; text?: string; run?: AgentFlow["run"] & { steps?: string[] }; approvals?: FlowApproval[]; error?: string; code?: string };
          if (e.type === "agent" && e.agent) patch.current({ agent: e.agent });
          else if (e.type === "step" && e.text) { steps = [...steps, e.text]; patch.current({ steps }); }
          else if (e.type === "done" && e.run) {
            const { steps: all, ...r } = e.run;
            patch.current({ phase: "done", run: r, steps: all?.length ? all : steps, approvals: e.approvals ?? [] });
          } else if (e.type === "error") patch.current({ phase: "error", error: e.error, code: e.code });
        }
      }
    } catch {
      patch.current({ phase: "error", error: "The connection dropped. The run may still have finished: check Approvals." });
    } finally {
      started.delete(key);
      settled.current();
    }
  };

  if (f.phase === "signin") {
    return (
      <section className={s.card} data-agent-flow="signin">
        <Head label="Agent" />
        <p className={s.note}>Sign in to set up an agent. Agents run on Plus and up, and nothing they draft is sent without your approval.</p>
      </section>
    );
  }

  if (f.phase === "choose") {
    return (
      <section className={s.card} data-agent-flow="choose">
        <Head label="Agent · Pick a workflow" />
        <p className={s.note}>Keplar can set up and run one of these from the chat. Each one shows you every step, and anything that would leave Keplar waits for your approval.</p>
        <div className={s.choices}>
          {CHAT_TEMPLATES.filter((t) => t !== "monitor" && t !== "social-post").map((t) => (
            <button key={t} type="button" className={s.choice} disabled={!isLast} onClick={() => onPatch({ phase: "ready", template: t })}>
              <span className={s.choiceName}>{INFO[t].name}</span>
              <span className={s.choiceSub}>{INFO[t].trigger}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const template = f.template!;
  const trigger = f.agent?.trigger ?? INFO[template].trigger;
  const nodes: FlowNode[] = f.phase === "ready" || (f.phase === "error" && !f.steps.length) ? plannedNodes(template, trigger) : runNodes(template, trigger, f.steps, f.approvals, f.phase === "done" ? { status: f.run?.status, needs: f.run?.needs, error: f.run?.error } : f.phase === "error" ? { status: "failed", error: f.error } : f.phase === "interrupted" ? { status: "stopped" } : {});
  const name = f.agent?.name ?? INFO[template].name;
  const busy = f.phase === "running";

  return (
    <section className={s.card} data-agent-flow={f.phase} aria-busy={busy || undefined}>
      <Head label={`Agent · ${name}`} chip={scheduleChip(trigger)} busy={busy} />
      <ol className={s.nodes} aria-label="Workflow">
        {nodes.map((n, i) => {
          const Icon = NODE_ICON[n.kind];
          return (
            <li key={n.kind} className={s.node} data-state={n.state} data-kind={n.kind}>
              <div className={s.nodeTop}>
                <span className={s.nodeIcon}><Icon size={14} /></span>
                <span className={s.nodeLabel}>{n.label}</span>
                <span className={s.nodeState} aria-hidden="true">{n.state === "done" ? <IconCheck size={13} /> : n.state === "active" ? <span className={s.spin} /> : null}</span>
              </div>
              <div className={s.nodeValue} data-approval={n.kind === "approval" ? n.state : undefined}>{n.value}</div>
              <div className={s.nodeSub}>{n.sub}</div>
              {i < nodes.length - 1 ? <span className={s.link} aria-hidden="true" data-on={n.state === "done" || undefined} /> : null}
            </li>
          );
        })}
      </ol>

      {f.phase === "ready" ? (
        <div className={s.actions}>
          <span className={s.fine}><IconApprovals size={14} /> {isInApp(template) ? "This workflow only writes to your Keplar inbox; nothing leaves Keplar." : "You approve anything that leaves Keplar."}</span>
          <Button variant="primary" disabled={!isLast} onClick={() => void run(template)}>Set up and run now</Button>
        </div>
      ) : null}

      {f.phase === "done" && f.run?.needs?.length ? (
        <p className={s.note} role="note">
          This workflow needs {f.run.needs.map((n) => n.label).join(" and ")} connected before it can run. Nothing was drafted or sent. <a href={BUSINESS_URL} className={s.inline}>Connect it in Keplar Business</a>
        </p>
      ) : null}

      {f.phase === "error" ? (
        <p className={s.note} role="alert">
          {f.error ?? "The workflow didn't run. Nothing was sent."}
          {f.code === "entitlement" ? <> <Link href="/pricing" className={s.inline}>See plans</Link></> : null}
          {isLast && f.code !== "entitlement" && f.code !== "not_available" ? <> <Button size="sm" variant="ghost" className={s.inlineAct} onClick={() => void run(template)}>Try again</Button></> : null}
        </p>
      ) : null}

      {f.phase === "interrupted" ? <p className={s.note} role="note">The page reloaded while this run was going. It may have finished on the server; its drafts, if any, are in <a href={BUSINESS_URL} className={s.inline}>Keplar Business</a>.</p> : null}

      {f.approvals.length ? <Approvals flow={f} template={template} name={name} onPatch={onPatch} onSettled={onSettled} /> : null}
    </section>
  );
}

function Head({ label, chip, busy }: { label: string; chip?: string; busy?: boolean }) {
  return (
    <header className={s.head}>
      <KeplarSymbol size={16} className={s.sym} />
      <span className={s.label} data-busy={busy || undefined}>{label}</span>
      {chip ? <span className={s.chip}>{chip}</span> : null}
    </header>
  );
}

const scheduleChip = (label: string) => label.replace(/\s*\(America\/New_York\)\s*$/, " ET");

/** The drafts waiting for the owner, one at a time, with the exact recipient and text. Approve sends each through the approvals route. */
function Approvals({ flow: f, template, name, onPatch, onSettled }: { flow: AgentFlow; template: ChatTemplate; name: string; onPatch: (p: Partial<AgentFlow>) => void; onSettled: () => void }) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const list = f.approvals;
  const pending = list.filter((a) => a.status === "pending");
  const cur = list[Math.min(i, list.length - 1)];
  const risk = list.reduce<"low" | "medium" | "high" | undefined>((r, a) => (a.risk === "high" || r === "high" ? "high" : a.risk === "medium" || r === "medium" ? "medium" : a.risk ?? r), undefined);
  const noun = outboundNoun(template);
  const verb = template === "social-post" ? "Schedule" : template === "weekly-report" ? "Post" : "Send";

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    let next = [...list];
    let ok = 0;
    let failed = 0;
    let lastError = "";
    for (const a of pending) {
      try {
        const res = await fetch(`/api/business/approvals/${a.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
        const j = (await res.json().catch(() => ({}))) as { approval?: { status: FlowApproval["status"]; result?: string }; error?: string };
        if (res.ok && j.approval) {
          next = next.map((x) => (x.id === a.id ? { ...x, status: j.approval!.status, result: j.approval!.result } : x));
          if (j.approval.status === "failed") { failed++; lastError = j.approval.result ?? ""; } else ok++;
        } else { failed++; lastError = j.error ?? "Couldn't record the decision."; }
      } catch { failed++; lastError = "The connection dropped."; }
      onPatch({ approvals: next });
    }
    setBusy(null);
    onSettled();
    // The outcome is a kit toast; each draft's own status chip keeps the result on the card.
    if (decision === "reject") notify({ id: "agent-flow-approvals", title: "Rejected · nothing was sent", tone: "neutral" });
    else if (failed) notify({ id: "agent-flow-approvals", title: `${ok ? `${ok} sent · ` : ""}${failed} not sent${lastError ? `: ${lastError}` : ""}`, tone: "danger" });
    else notify({ id: "agent-flow-approvals", title: `Approved · sent ${ok} ${noun}${ok === 1 ? "" : "s"}`, tone: "success" });
  };

  return (
    <div className={s.approvals} data-pending={pending.length || undefined}>
      <div className={s.apHead}>{pending.length ? "Pending approvals" : "Approvals"} <span className={s.count}>{pending.length || list.length}</span></div>
      <h3 className={s.apTitle}>{verb} {list.length} {noun}{list.length === 1 ? "" : "s"}</h3>
      <div className={s.apMeta}>
        <span>Agent · {name}</span>
        {risk ? <span className={s.risk} data-risk={risk}>{risk[0].toUpperCase() + risk.slice(1)} risk</span> : null}
      </div>
      {cur ? (
        <div className={s.preview}>
          <div className={s.previewHead}>
            <span className={s.previewTitle}>{cur.preview.title}</span>
            <span className={s.previewOf}>· {Math.min(i, list.length - 1) + 1} of {list.length}</span>
            {cur.status !== "pending" ? <span className={s.previewStatus} data-status={cur.status}>{cur.status === "sent" ? "Sent" : cur.status === "failed" ? "Not sent" : cur.status === "rejected" ? "Rejected" : cur.status}</span> : null}
            {list.length > 1 ? (
              <span className={s.pager}>
                <IconButton size="sm" variant="secondary" label="Previous draft" disabled={i === 0} onClick={() => setI((x) => Math.max(0, x - 1))} icon={<Icon name="chevron-right" size={14} className={s.flip} />} />
                <IconButton size="sm" variant="secondary" label="Next draft" disabled={i >= list.length - 1} onClick={() => setI((x) => Math.min(list.length - 1, x + 1))} icon={<Icon name="chevron-right" size={14} />} />
              </span>
            ) : null}
          </div>
          {cur.preview.to ? <div className={s.previewTo}>To {cur.preview.to}</div> : null}
          <p className={s.previewBody}>{cur.preview.body}</p>
          {cur.status === "failed" && cur.result ? <p className={s.previewErr}>{cur.result}</p> : null}
        </div>
      ) : null}
      <div className={s.actions}>
        <span className={s.fine}><IconApprovals size={14} /> You approve anything that leaves Keplar.</span>
        {pending.length ? (
          <>
            <Button variant="secondary" disabled={busy !== null && busy !== "reject"} loading={busy === "reject"} onClick={() => void decide("reject")}>{busy === "reject" ? "Rejecting…" : "Reject"}</Button>
            <Button variant="primary" disabled={busy !== null && busy !== "approve"} loading={busy === "approve"} onClick={() => void decide("approve")} data-approve="">{busy === "approve" ? "Sending…" : "Approve and send"}</Button>
          </>
        ) : (
          <a href={BUSINESS_URL} className={la.act} data-variant="secondary">Open Keplar Business</a>
        )}
      </div>
    </div>
  );
}
