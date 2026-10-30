"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Tabs, TabPanel } from "@/components/kit";
import { IconClose } from "../icons";
import type { KeplarMessage } from "../state/types";
import r from "./shell.module.css";

/**
 * Keplar Orbit context panel (docs/design/keplar-orbit.md §4): the right-hand panel for the latest answer, closed by default,
 * opened from the top strip. Only tabs with data behind them today: Sources (answer.sources), Models (answer.models and the
 * agreement summary) and Memory (the account's memory switch and what memory did for this answer). A tab with nothing to show
 * is left out; with no tab, the opener is not rendered at all (contextTabs() returns []).
 */
export type ContextTab = "sources" | "models" | "memory";

export function contextTabs(msg: KeplarMessage | null | undefined, memoryOn: boolean | null): ContextTab[] {
  const a = msg?.answer;
  const tabs: ContextTab[] = [];
  if (a?.sources?.length) tabs.push("sources");
  if (a?.models?.length) tabs.push("models");
  if (memoryOn !== null) tabs.push("memory");
  return tabs;
}

/** "3 of 3 models agree" for the top strip, or null when the answer has no panel. */
export function agreementLabel(msg: KeplarMessage | null | undefined): string | null {
  const c = msg?.answer?.consensus;
  if (!c || !c.responded || msg?.answer?.smalltalk) return null;
  return c.responded === 1 ? "1 model answered" : `${c.agree} of ${c.responded} models agree`;
}

const LABEL: Record<ContextTab, string> = { sources: "Sources", models: "Models", memory: "Memory" };

type Props = {
  msg: KeplarMessage | null;
  memoryOn: boolean | null;
  tab: ContextTab;
  onTab: (t: ContextTab) => void;
  onClose: () => void;
  /** Move focus to the selected tab on open (default). The dev showcase renders it statically. */
  autoFocus?: boolean;
};

export function ContextPanel({ msg, memoryOn, tab, onTab, onClose, autoFocus = true }: Props) {
  const tabs = contextTabs(msg, memoryOn);
  const ref = useRef<HTMLElement>(null);
  const a = msg?.answer;
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")?.focus({ preventScroll: true });
  }, [autoFocus]);
  const current = tabs.includes(tab) ? tab : tabs[0];
  return (
    <aside
      ref={ref}
      id="keplar-context"
      className={r.context}
      aria-label="Answer details"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className={r.contextHead}>
        <h2 className={r.contextTitle}>Answer details</h2>
        <button type="button" className={r.railBtn} onClick={onClose} aria-label="Close answer details" data-orbit-fx="icon">
          <IconClose size={16} />
        </button>
      </div>
      {tabs.length ? (
        <>
          <Tabs id="kp-context" label="Answer details" value={current} onValueChange={onTab} items={tabs.map((t) => ({ value: t, label: LABEL[t] }))} className={r.contextTabs} />
          {tabs.includes("sources") ? (
            <TabPanel id="kp-context" value="sources" active={current === "sources"} className={r.contextBody}>
              <ol className={r.ctxList}>
                {a!.sources.map((src, i) => (
                  <li key={`${src.title}-${i}`} className={r.ctxItem}>
                    <span className={r.ctxKind}>{src.kind === "web" ? "Web" : src.kind === "attachment" ? "File" : src.kind === "model" ? "Model" : "Note"}</span>
                    {src.url ? (
                      <a href={src.url} target="_blank" rel="noreferrer noopener" className={r.ctxLink}>{src.title}</a>
                    ) : (
                      <span className={r.ctxText}>{src.title}</span>
                    )}
                    {src.detail ? <span className={r.ctxDetail}>{src.detail}</span> : null}
                  </li>
                ))}
              </ol>
            </TabPanel>
          ) : null}
          {tabs.includes("models") ? (
            <TabPanel id="kp-context" value="models" active={current === "models"} className={r.contextBody}>
              {a!.consensus?.summary ? <p className={r.ctxLede}>{a!.consensus.summary}</p> : null}
              <ul className={r.ctxList}>
                {a!.models.map((m) => (
                  <li key={m.id} className={r.ctxItem} data-status={m.status}>
                    <span className={r.ctxModel}>
                      <span className={r.ctxDot} data-status={m.status} aria-hidden="true" />
                      {m.name}
                    </span>
                    <span className={r.ctxDetail}>
                      {m.status === "responded" ? (m.stance ? m.stance : "Answered") : m.status === "not-needed" ? "Not needed" : m.status === "refused" ? "Declined" : "Did not answer"}
                    </span>
                  </li>
                ))}
              </ul>
            </TabPanel>
          ) : null}
          {tabs.includes("memory") ? (
            <TabPanel id="kp-context" value="memory" active={current === "memory"} className={r.contextBody}>
              <p className={r.ctxLede}>{memoryOn ? "Memory is on. Keplar remembers your name, goals and past chats." : "Memory is off. Keplar does not remember past chats."}</p>
              {msg?.memory ? (
                <p className={r.ctxText}>
                  {msg.memory.used ? `This answer used ${msg.memory.used} saved ${msg.memory.used === 1 ? "memory" : "memories"}. ` : ""}
                  {msg.memory.saved ? "Memory updated from this chat." : ""}
                </p>
              ) : null}
              <Link href="/account#memory" className={r.ctxAction} data-orbit-fx="secondary">Manage memory</Link>
            </TabPanel>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
