"use client";
/**
 * The development inspector: Code | Viewport | Changes | Plan | Activity. Every tab shows the run's real state:
 * - Code: the live code engine (CodePanel, wired to the real approvals, revert and retry).
 * - Viewport: Studio's latest real screenshot, earlier ones, and Look again (screenshot only, no model call). Blender has none.
 * - Changes: every change of the session (ChangesList) and the selected script change's diff (DiffView); after a restore, the
 *   saved "changed so far" titles.
 * - Plan: the parsed plan with done / doing / next, its progress, and the run's counters.
 * - Activity: the event log (Timeline).
 * `compact` (the overlay) hides the tab strip: the overlay switches content with its own segmented control.
 */
import { useMemo, useState } from "react";
import { ChangesList, CodePanel, DiffView, Timeline, codePanelProps, type ScriptChange } from "../code";
import { Badge, Button, EmptyState, Icon, MorphIcon, Progress, TabPanel, Tabs, INSPECTOR_TABS, INSPECTOR_TAB_LABELS, type InspectorTab } from "@/components/kit";
import type { StudioAgent } from "../useStudioAgent";
import { ago, formatCredits, planProgress, type Env } from "./layout/run-status";
import { useNow } from "./layout/hooks";
import s from "./shell.module.css";

export type { InspectorTab };

export type InspectorProps = {
  a: StudioAgent;
  env: Env;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  /** An action key to show in Code (the conversation's "view code" link). */
  focusAction?: string | null;
  compact?: boolean;
};

const ID = "ks-inspector";

/** The code document an action produced or touched. */
function docOfAction(a: StudioAgent, key: string): string | null {
  const d = a.code.documents.find((x) => x.action === key || x.changes.some((c) => c.id === key) || x.versions.some((v) => v.action === key));
  return d?.id ?? null;
}

export function Inspector({ a, env, tab, onTab, focusAction, compact }: InspectorProps) {
  // "View code" pins the action's document; a new focus request replaces the pin, and the person can unpin (Follow).
  const [pin, setPin] = useState<{ from: string | null | undefined; id: string | null }>({ from: focusAction, id: null });
  let pinned = pin.id;
  if (pin.from !== focusAction) {
    pinned = focusAction ? docOfAction(a, focusAction) : null;
    setPin({ from: focusAction, id: pinned });
  }
  const [selected, setSelected] = useState<string | null>(null);

  const changes = a.code.changes;
  const { done, total } = planProgress(a.plan);
  const items: { value: InspectorTab; label: string; count?: number }[] = INSPECTOR_TABS.map((v) => ({
    value: v,
    label: INSPECTOR_TAB_LABELS[v],
    count: v === "changes" ? (changes.length || undefined) : undefined,
  }));

  const body = (t: InspectorTab) => {
    switch (t) {
      case "code":
        return (
          <CodePanel
            {...codePanelProps(a)}
            pinned={pinned}
            onPinnedChange={(id) => setPin({ from: focusAction, id })}
            title="Code"
            emptyText={env === "blender" ? "Python Keplar runs in Blender shows here." : "Scripts Keplar reads or edits show here."}
            className={s.fill}
          />
        );
      case "viewport":
        return <ViewportTab a={a} env={env} />;
      case "changes":
        return <ChangesTab a={a} selected={selected} onSelect={setSelected} onOpenCode={(docId) => { setPin({ from: focusAction, id: docId }); onTab("code"); }} />;
      case "plan":
        return (
          <div className={s.planTab}>
            {total ? (
              <>
                <Progress value={done} max={total} label="Plan progress" valueText={`${done}/${total}`} />
                <ol className={s.planList}>
                  {a.plan.map((p, i) => (
                    <li key={i} data-state={p.state}>
                      <span className={s.planMark} aria-hidden="true">{p.state === "done" ? <Icon name="check" size={12} /> : i + 1}</span>
                      <span>{p.text}</span>
                      <span className={s.srState}>{p.state === "done" ? "done" : p.state === "doing" ? "in progress" : "next"}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <EmptyState icon={<Icon name="plan" />} title="No plan yet" hint="Keplar writes one when a build needs several steps." />
            )}
            <dl className={s.statGrid} aria-label="This chat">
              <div><dt>Credits</dt><dd>{formatCredits(a.units)}</dd></div>
              <div><dt>Steps</dt><dd>{a.stats.steps}</dd></div>
              <div><dt>Changes</dt><dd>{a.stats.changes}</dd></div>
              <div data-tone={a.stats.errors ? "bad" : undefined}><dt>Errors</dt><dd>{a.stats.errors}</dd></div>
            </dl>
          </div>
        );
      case "activity":
        return <Timeline events={a.events} title="Activity" maxHeight="none" className={s.fill} />;
    }
  };

  if (compact) {
    return <div className={s.inspectorCompact} data-tab={tab}>{body(tab)}</div>;
  }
  return (
    <section className={s.inspector} aria-label="Inspector">
      <Tabs id={ID} label="Inspector" value={tab} onValueChange={onTab} items={items} className={s.inspectorTabs} />
      {INSPECTOR_TABS.map((t) => (
        <TabPanel key={t} id={ID} value={t} active={tab === t} lazy={t !== "code"} className={s.inspectorPane}>
          {body(t)}
        </TabPanel>
      ))}
    </section>
  );
}

/* ── Viewport ──────────────────────────────────────────────────────────────────────────────────────────────────── */

function ViewportTab({ a, env }: { a: StudioAgent; env: Env }) {
  const now = useNow(Boolean(a.viewport), 15_000);
  if (env === "blender") {
    return <EmptyState icon={<Icon name="viewport" />} title="No viewport in Blender" hint="Keplar reads the scene as text; look it over in Blender." />;
  }
  const earlier = a.shots.filter((x) => x !== a.viewport?.image).slice(0, 3);
  return (
    <div className={s.viewport}>
      <div className={s.viewportBar}>
        <span className={s.viewportMeta} aria-live="polite">{a.looking ? "Looking…" : a.viewport ? `Updated ${ago(a.viewport.at, now)}` : "Not looked yet"}</span>
        {a.place ? <Badge variant="outline">{a.place.name}</Badge> : null}
        <Button size="sm" variant="secondary" onClick={() => void a.refreshViewport()} disabled={a.looking || !a.place} aria-label="Let Keplar look at Studio again" leadingIcon={<MorphIcon icon="refresh" state={a.looking ? "active" : "idle"} size={14} />}>
          Look again
        </Button>
      </div>
      {a.viewport ? (
        <figure className={s.shot} data-looking={a.looking || undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio */}
          <img src={a.viewport.image} alt="What Keplar sees in Studio right now" />
        </figure>
      ) : (
        <EmptyState icon={<Icon name="viewport" />} title="No screenshot yet" hint="Keplar looks before each build. Look again takes one now, free." />
      )}
      {earlier.length ? (
        <ul className={s.thumbs} aria-label="Earlier screenshots">
          {earlier.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- data URLs from Studio
            <li key={src.slice(-32) + i}><img src={src} alt={`Earlier screenshot ${i + 1}`} /></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ── Changes ───────────────────────────────────────────────────────────────────────────────────────────────────── */

function ChangesTab({ a, selected, onSelect, onOpenCode }: { a: StudioAgent; selected: string | null; onSelect: (id: string | null) => void; onOpenCode: (docId: string) => void }) {
  const all = useMemo(() => a.code.documents.flatMap((d) => d.changes.map((c) => ({ c, language: d.language, docId: d.id }))), [a.code.documents]);
  const pick = all.find((x) => x.c.id === selected) ?? null;
  const diff = pick ? diffOf(pick.c) : null;
  const restored = !a.code.changes.length && a.built.length ? a.built.slice(-8) : null;
  return (
    <div className={s.changes}>
      <ChangesList
        changes={a.code.changes}
        includePending
        onSelect={(docId, changeId) => (all.some((x) => x.c.id === changeId) ? onSelect(changeId) : onOpenCode(docId))}
        onRevert={(id) => { void a.revert(id); }}
        onRetry={(k) => { void a.retry(k); }}
        maxHeight="none"
      />
      {pick && diff ? (
        <DiffView
          key={pick.c.id}
          before={diff.before}
          after={diff.after}
          language={pick.language}
          title={pick.c.path}
          beforeLabel="Before"
          afterLabel={diff.afterLabel}
          onApprove={pick.c.awaitingApproval ? () => a.decide(pick.c.id, true) : undefined}
          onDecline={pick.c.awaitingApproval ? () => a.decide(pick.c.id, false) : undefined}
          destructive={pick.c.risk === "destructive"}
          onRevert={pick.c.revert.ok && !a.running ? () => { void a.revert(pick.c.id); } : undefined}
          revertUnavailable={pick.c.revert.ok ? undefined : pick.c.revert.reason || undefined}
        />
      ) : pick ? (
        <p className={s.muted}>{pick.c.previewError ?? "No diff: Keplar could not read this script before the edit."}</p>
      ) : null}
      {restored ? (
        <section className={s.restored} aria-label="Changed so far">
          <h3>Changed so far</h3>
          <ul>{restored.map((b) => <li key={b.key}>{b.title}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}

/** The diff a change can show: before vs the confirmed re-read, else vs the proposal. Null without a real before. */
function diffOf(c: ScriptChange): { before: string; after: string; afterLabel: string } | null {
  if (c.before === null) return null;
  if (c.applied !== null) return { before: c.before, after: c.applied, afterLabel: "Applied" };
  if (c.after !== null) return { before: c.before, after: c.after, afterLabel: "Proposed" };
  return null;
}
