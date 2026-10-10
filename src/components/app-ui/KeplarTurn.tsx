"use client";

import { DisagreementView } from "@/components/answer/DisagreementView";
import { SourceChecks } from "@/components/answer/SourceChecks";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { KeplarSymbol } from "@/components/brand";
import { brand } from "@/lib/site";
import { tiers } from "@/lib/tiers";
import { formatResetAt, upgradesFrom, WINDOW_WARN_AT, windowResetText } from "@/lib/orchestration/plans";
import { computeLevelLabel } from "@/lib/orchestration/compute";
import { modelStatusSentence, summarizeModels } from "@/lib/orchestration/model-status";
import type { KeplarAnswer, VerificationCheck } from "@/lib/orchestration/types";
import { IconCheck, IconChevron, IconCopy, IconRetry, IconThumb } from "./icons";
import { ListenButton } from "./ListenButton";
import { Markdown } from "./Markdown";
import { ToolUses } from "./ToolUses";
import { ClarifyChips, DetailsBody, quietIds, reasoningMeta, UsingMemory } from "./AnswerExtras";
import { ShareAnswer } from "./ShareAnswer";
import { ExtensionOffer } from "./LimitExtensions";
import { formatDailyReset } from "@/lib/usage/format";
import { ReportAnswer } from "./ReportAnswer";
import { askId, growthTrack } from "@/lib/growth/client";
import type { AnswerAction } from "@/lib/growth/events";
import dynamic from "next/dynamic";
// Three.js loads only when a scene is actually shown.
const AgreementScene = dynamic(() => import("@/components/spatial/AgreementScene").then((m) => m.AgreementScene), { ssr: false });
const ActivationScene = dynamic(() => import("@/components/spatial/ActivationScene").then((m) => m.ActivationScene), { ssr: false });
import { useTypewriter } from "./useTypewriter";
import { stageCopy } from "./copy";
import { DebateLive, DebateTranscript } from "./DebateView";
import { ResearchHead, ResearchLive, ResearchSources, citeRenderer } from "./research/Research";
import { CoreLive, CoreSummaryView } from "./core/CoreTrace";
import { asSentence } from "@/lib/sentence";
import { needsChargeNote } from "@/lib/orchestration/no-response";
import type { KeplarMessage, Ledger } from "./state/types";
import s from "./KeplarTurn.module.css";

type Props = {
  message: KeplarMessage;
  onRetry: () => void;
  /** Router learning: thumbs and copy on the answer. */
  onSignal?: (kind: "up" | "down" | "copy") => void;
  /** Sends a suggested question (a clarifying chip) as the next message. */
  onAsk?: (text: string) => void;
  ledger: Ledger;
  isLast: boolean;
  onDismissUpsell?: () => void;
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function KeplarTurn({ message: m, onRetry, onSignal, onAsk, isLast, ledger, onDismissUpsell }: Props) {
  const uid = useId();
  // Only answers streamed in this session type out; stored threads render at once.
  const [live] = useState(m.status === "running");
  const fullText = m.answer ? m.answer.markdown : m.draft;
  const tw = useTypewriter(fullText, { live, done: m.status !== "running" });
  const typingAnswer = live && tw.typing && (m.status === "running" ? Boolean(m.draft) : m.status === "done" && Boolean(m.answer));
  const [showSteps, setShowSteps] = useState(false);
  const running = m.status === "running";
  const finished = m.status === "done";
  const collapsed = finished && !showSteps;
  const count = m.modelCount ?? 0;

  // Minimal first-party events (consent-gated, no text): an ask started here, and how it ended. Stored threads never fire.
  const reported = useRef<{ start: boolean; end: boolean }>({ start: false, end: false });
  const tier = ledger.plan === "free" ? "free" : "paid";
  useEffect(() => {
    if (!live || m.smalltalk) return;
    const aid = askId(m.id);
    if (!reported.current.start) {
      reported.current.start = true;
      growthTrack("ask_started", { aid, tier });
    }
    if (reported.current.end) return;
    if (m.status === "done" && m.answer) {
      reported.current.end = true;
      const a = m.answer;
      growthTrack("ask_done", { aid, tier, mode: m.mode === "single" || a.consensus.level === "single" ? "single" : "consensus", secs: m.finishedAt ? (m.finishedAt - m.startedAt) / 1000 : Math.round(a.durationMs / 1000), consulted: a.consensus.consulted, responded: a.consensus.responded, disagreed: a.disagreements.length > 0 });
    } else if (m.status === "error" || m.status === "limit" || m.status === "stopped") {
      reported.current.end = true;
      growthTrack("ask_error", { aid, tier, kind: m.status === "limit" ? "limit" : m.error?.kind ?? "other" });
    }
  }, [live, m.id, m.status, m.answer, m.mode, m.smalltalk, m.finishedAt, m.startedAt, m.error?.kind, tier]);

  const summary =
    m.mode === "single"
      ? "Answered with one model"
      : `Reasoned with ${m.answer ? m.answer.consensus.consulted : count} intelligences`;

  return (
    <div className={s.turn} data-status={m.status}>
      {m.stages.length > 0 && m.status !== "limit" && !m.smalltalk ? (
        <div className={s.process}>
          {finished ? (
            <button
              type="button"
              className={s.processSummary}
              aria-expanded={showSteps}
              aria-controls={`${uid}-steps`}
              onClick={() => setShowSteps((v) => !v)}
            >
              <span className={s.dotDone} aria-hidden="true" />
              {summary}
              {m.finishedAt ? <span className={s.processTime}>{seconds(m.finishedAt - m.startedAt)}</span> : null}
              <span className={s.chev} data-open={showSteps || undefined} aria-hidden="true">
                <IconChevron size={12} />
              </span>
            </button>
          ) : null}
          {running && m.mode === "consensus" && !m.debate?.speakers.length ? (
            <ActivationScene
              running={running}
              input={{ count: m.modelCount ?? 0, ticks: m.models.map((x) => x.status), stage: [...m.stages].reverse().find((x) => x.status === "active")?.id ?? m.stages[m.stages.length - 1]?.id ?? null }}
            />
          ) : null}
          <ol id={`${uid}-steps`} className={s.steps} hidden={collapsed} aria-label="Keplar progress">
            {m.stages.map((st) => {
              const state = st.status === "done" || !running ? "done" : "active";
              const label =
                st.id === "synthesize" && m.mode === "single"
                  ? state === "done" ? "Answered" : "Answering…"
                  : state === "done"
                    ? st.detail && st.id !== "understand" ? st.detail : stageCopy[st.id].done
                    : stageCopy[st.id].active;
              return (
                <li key={st.id} className={s.step} data-state={state} data-kind={st.id}>
                  <span className={s.stepDot} aria-hidden="true" />
                  <span className={s.stepLabel}>{label}</span>
                  {st.id === "select" && m.capabilities.length ? (
                    <span className={s.chips}>
                      {m.capabilities.map((c) => (
                        <span key={c} className={s.chip}>{c}</span>
                      ))}
                    </span>
                  ) : null}
                  {st.id === "compare" && count > 1 ? (
                    <span className={s.bars} aria-label={`${m.models.length} of ${count} models responded`}>
                      {Array.from({ length: count }, (_, k) => {
                        const tick = m.models[k];
                        return <span key={k} className={s.bar} data-state={tick?.status ?? "pending"} />;
                      })}
                    </span>
                  ) : null}
                  {st.id === "disagree" && m.disagreement ? <span className={s.disagreeNote}>{m.disagreement}</span> : null}
                </li>
              );
            })}
          </ol>
          {running ? <span className="visually-hidden" aria-live="polite">{stageCopy[m.stages[m.stages.length - 1].id].active}</span> : null}
        </div>
      ) : null}

      {m.debate && (m.debate.skipped || (m.status !== "done" && m.status !== "limit")) ? <DebateLive d={m.debate} running={running} /> : null}
      {m.research && m.status !== "done" && m.status !== "limit" ? <ResearchLive r={m.research} running={running} /> : null}
      {m.core && m.status !== "done" && m.status !== "limit" ? <CoreLive c={m.core} running={running} /> : null}

      <ToolUses uses={m.answer?.tools ?? m.tools} />

      {typingAnswer && (m.smalltalk || m.answer?.smalltalk) ? (
        <article className={`${s.answer} ${s.plainReply}`} aria-busy="true" data-typing="" data-plain="">
          <header className={s.answerHead}><AnswerTitle /></header>
          {running && m.mode === "consensus" ? <p className={s.draftNote} role="status" data-early-note="">Early draft from the first model to answer. Keplar is checking it with the others; the final answer will replace it.</p> : null}
          <Markdown source={tw.text} streaming caret />
          <TypingBar text={fullText} onSkip={tw.skip} canSkip={!running} />
        </article>
      ) : null}

      {typingAnswer && !(m.smalltalk || m.answer?.smalltalk) ? (
        <article className={s.answer} aria-busy="true" data-typing="" data-continued={live || undefined}>
          <header className={s.answerHead}><AnswerTitle /></header>
          {m.answer?.research ? <ResearchHead research={m.answer.research} /> : null}
          <Markdown source={tw.text} streaming caret cite={citeRenderer(m.answer?.research?.sources ?? m.research?.sources)} />
          <TypingBar text={fullText} onSkip={tw.skip} canSkip={!running} />
        </article>
      ) : null}

      {finished && m.answer && !typingAnswer && (m.smalltalk || m.answer.smalltalk) ? <PlainReply answer={m.answer} onRetry={onRetry} onSignal={onSignal} isLast={isLast} onAsk={onAsk} /> : null}
      {finished && m.answer && !typingAnswer && !(m.smalltalk || m.answer.smalltalk) ? <Answer answer={m.answer} onRetry={onRetry} onSignal={onSignal} isLast={isLast} continued={live} /> : null}
      {finished && m.answer?.core && !typingAnswer && !(m.smalltalk || m.answer.smalltalk) ? <CoreSummaryView core={m.answer.core} onAsk={onAsk} enabled={isLast} /> : null}
      {finished && m.answer?.debate && !typingAnswer ? <DebateTranscript debate={m.answer.debate} /> : null}
      {finished && m.memory && m.memory.used && m.memory.used > 0 ? <UsingMemory used={m.memory.used} /> : null}
      {finished && m.memory && m.memory.saved > 0 ? (
        <p className={s.memoryHint} role="status">
          Memory updated{m.memory.saved > 1 ? ` (${m.memory.saved} notes)` : ""}. <Link href="/account#memory">See or delete</Link>
        </p>
      ) : null}
      {finished && m.upsell && ledger.plan === "free" && !m.smalltalk && !m.answer?.smalltalk ? <UpsellNote reason={m.upsell} onDismiss={onDismissUpsell} /> : null}
      {finished && isLast && !m.smalltalk && !m.answer?.smalltalk ? <WindowWarning ledger={ledger} /> : null}
      {finished && ledger.total && ledger.plan !== "free" && isLast && !m.smalltalk && !m.answer?.smalltalk && ledger.total - ledger.used <= ledger.total * 0.1 ? <LowCredits ledger={ledger} /> : null}

      {m.status === "stopped" ? (
        <NoticeCard>
          <div className={s.notice}>
            <p>Stopped. {m.debate?.turns.length ? (ledger.plan === "free" ? "The debate was stopped and this question wasn't counted." : "The debate was stopped; only the rounds that had started count toward usage.") : m.draft ? "The partial answer was discarded." : "Nothing was charged."}</p>
            <button type="button" className={s.textBtn} onClick={onRetry}>
              <IconRetry size={14} /> Ask again
            </button>
          </div>
        </NoticeCard>
      ) : null}

      {m.status === "error" && m.error?.kind === "no_response" ? <NoResponse error={m.error} onRetry={onRetry} /> : null}

      {m.status === "error" && m.error && m.error.kind !== "no_response" ? (
        <NoticeCard>
        <div className={s.notice} role="alert" data-kind="error">
          <div>
            <p className={s.noticeTitle}>{m.error.kind === "network" ? "Connection lost." : "Keplar couldn't finish this answer."}</p>
            <p className={s.noticeBody}>{m.error.message} {m.error.kind === "network" ? "Your question is saved." : ""}</p>
          </div>
          {m.error.upgrade ? (
            <Link href="/pricing?from=feature" className={s.retry}>See plans</Link>
          ) : null}
          {m.error.retryable ? (
            <button type="button" className={s.retry} onClick={onRetry}>
              <IconRetry size={14} /> Retry
            </button>
          ) : null}
        </div>
        </NoticeCard>
      ) : null}

      {m.status === "limit" && m.limit ? <UsageLimit limit={m.limit} ledger={ledger} /> : null}
    </div>
  );
}

/**
 * No model responded. Free and signed-out: a friendly note with Plus suggested.
 * Plus, Pro and admin: a plain message. Never charged either way.
 */
function NoResponse({ error, onRetry }: { error: { message: string; upgrade?: boolean }; onRetry: () => void }) {
  return (
    <NoticeCard>
    <div className={s.notice} role="alert" data-kind="error" data-no-response={error.upgrade ? "upgrade" : "plain"}>
      <div>
        <p className={s.noticeBody}>{error.message}</p>
        {error.upgrade && needsChargeNote(error.message) ? <p className={s.noticeBody}>You were not charged.</p> : null}
      </div>
      <div className={s.noticeActions}>
        {error.upgrade ? (
          <>
            <Link href="/checkout?plan=lite" className={s.retry}>Upgrade to Lite</Link>
            <Link href="/pricing?from=upsell" className={s.textBtn}>See plans</Link>
          </>
        ) : null}
        <button type="button" className={error.upgrade ? s.textBtn : s.retry} onClick={onRetry}>
          <IconRetry size={14} /> Try again
        </button>
      </div>
    </div>
    </NoticeCard>
  );
}

/** Errors and stops sit in the same card as an answer (same header and shell), so nothing Keplar says looks different from an answer. */
function NoticeCard({ children }: { children: ReactNode }) {
  return (
    <article className={s.answer} data-notice="">
      <header className={s.answerHead}><AnswerTitle /></header>
      {children}
    </article>
  );
}

/**
 * Shown under a typing answer: Copy always copies the full text (not the part revealed so far),
 * and Skip shows the rest at once once the stream has finished.
 */
function TypingBar({ text, onSkip, canSkip }: { text: string; onSkip: () => void; canSkip: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className={s.typingBar}>
      <button type="button" className={s.iconBtn} onClick={copy} aria-label={copied ? "Copied answer" : "Copy full answer"}>
        {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
      </button>
      {canSkip ? (
        <button type="button" className={s.textBtn} onClick={onSkip}>Skip</button>
      ) : null}
    </div>
  );
}

function AnswerTitle() {
  return (
    <h3 className={s.answerTitle}>
      <KeplarSymbol size={15} />
      {brand.answer}
    </h3>
  );
}

const upgradeTiersFor = (plan: Ledger["plan"]) =>
  upgradesFrom(plan)
    .map((p) => tiers.find((t) => t.id === p.id))
    .filter((t): t is (typeof tiers)[number] => Boolean(t));

/** A rolling 5-hour or weekly limit stopped the question: say which, when it resets, and (Plus) suggest Pro. */
function WindowLimit({ window: w, ledger }: { window: NonNullable<NonNullable<KeplarMessage["limit"]>["window"]>; ledger: Ledger }) {
  const when = windowResetText(w.id, w.resetsAt);
  return (
    <section className={s.limit} aria-labelledby="limit-title" role="alert" data-window={w.id}>
      <h3 id="limit-title" className={s.limitTitle}>You&rsquo;ve reached your {w.label.toLowerCase()} {brand.usage} limit.</h3>
      <p className={s.limitBody}>
        Keplar didn&rsquo;t start this question, so none of your allowance was used. Your {w.label.toLowerCase()} limit {when}
        {w.id === "weekly" ? ` (${new Date(w.resetsAt).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })})` : ""}. Your monthly credits are kept.
      </p>
      <ExtensionOffer plan={ledger.plan} />
      <div className={s.limitActions}>
        {ledger.plan === "plus" ? (
          <Link href="/checkout?plan=pro" className={s.primaryBtn}>
            Upgrade to Pro for higher limits <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <Link href="/account" className={ledger.plan === "plus" ? s.textBtn : s.primaryBtn}>See your usage</Link>
      </div>
    </section>
  );
}

/** The Free plan's questions for today are used up. Honest: Free uses free models only, so there is no credit pack to buy; upgrading is the way on. */
function DailyLimit({ daily, ledger }: { daily: NonNullable<NonNullable<KeplarMessage["limit"]>["daily"]>; ledger: Ledger }) {
  const upgradeTiers = upgradeTiersFor(ledger.plan);
  const nextPaid = upgradeTiers.find((t) => t.id === "plus") ?? null;
  return (
    <section className={s.limit} aria-labelledby="limit-title" role="alert" data-daily-limit="">
      <h3 id="limit-title" className={s.limitTitle}>You&rsquo;ve used today&rsquo;s {daily.limit} Free questions.</h3>
      <p className={s.limitBody}>
        Keplar didn&rsquo;t start this question. Your Free questions come back {formatDailyReset(daily.resetsAt)}. Free runs on free models only, so there are no extra credits to buy;
        a paid plan runs stronger models with a bigger allowance, and upgrading is how you keep going now.
      </p>
      <ExtensionOffer plan="free" />
      {upgradeTiers.length ? (
        <ul className={s.limitPlans} aria-label="Plans with more usage">
          {upgradeTiers.map((t) => (
            <li key={t.id}>
              <span>{t.name}</span>
              <span className={s.limitPrice}>{t.price === null ? "Custom" : `$${t.price}/mo`}</span>
              <span className={s.limitPlanNote}>{t.summary}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={s.limitActions}>
        {nextPaid ? (
          <Link href={`/checkout?plan=${nextPaid.id}`} className={s.primaryBtn}>
            Upgrade to {nextPaid.name.replace("Keplar ", "")} · ${nextPaid.price}/mo <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <Link href="/pricing?from=daily-limit" className={nextPaid ? s.textBtn : s.primaryBtn}>Compare plans</Link>
      </div>
    </section>
  );
}

function UsageLimit({ limit, ledger }: { limit: NonNullable<KeplarMessage["limit"]>; ledger: Ledger }) {
  if (limit.window) return <WindowLimit window={limit.window} ledger={ledger} />;
  if (limit.daily) return <DailyLimit daily={limit.daily} ledger={ledger} />;
  const total = ledger.total ?? Infinity;
  const upgradeTiers = upgradeTiersFor(ledger.plan);
  const nextPaid = upgradeTiers.find((t) => t.id === "plus" || t.id === "pro") ?? null;
  const formatReset = () => formatResetAt(ledger.resetsAt);
  const empty = limit.remaining <= 0;
  const left = empty ? 0 : Math.max(1, Math.floor((limit.remaining / total) * 100));
  return (
    <section className={s.limit} aria-labelledby="limit-title" role="alert">
      <h3 id="limit-title" className={s.limitTitle}>
        {empty ? <>You&rsquo;ve used this month&rsquo;s {brand.usage}.</> : <>This question needs more {brand.usage} than you have left.</>}
      </h3>
      <div className={s.limitMeterRow}>
        <div className={s.limitMeter} role="meter" aria-label={`${brand.usage} remaining this month`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={left}>
          <span style={{ width: `${left}%` }} />
        </div>
        <span className={s.limitMeterText}>{left}% left · resets {formatReset()}</span>
      </div>
      <p className={s.limitBody}>
        Keplar didn&rsquo;t start this question, so none of your allowance was used. Your {brand.usage} resets on {formatReset()}.
        {empty ? null : " A simpler question, or turning off Deep Research, may fit in what you have left."}
        {" "}To keep going now, you can buy more credits or move to a plan with more usage.
      </p>
      <ExtensionOffer plan={ledger.plan} />
      {upgradeTiers.length ? (
        <ul className={s.limitPlans} aria-label="Plans with more usage">
          {upgradeTiers.map((t) => (
            <li key={t.id}>
              <span>{t.name}</span>
              <span className={s.limitPrice}>{t.price === null ? "Custom" : `$${t.price}/mo`}</span>
              <span className={s.limitPlanNote}>{t.summary}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={s.limitActions}>
        {nextPaid ? (
          <Link href={`/checkout?plan=${nextPaid.id}`} className={s.primaryBtn}>
            Upgrade to {nextPaid.name.replace("Keplar ", "")} · ${nextPaid.price}/mo <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <Link href="/pricing?from=credits" className={nextPaid ? s.textBtn : s.primaryBtn}>
          {nextPaid ? "Compare plans" : <>Compare plans <span aria-hidden="true">→</span></>}
        </Link>
      </div>
    </section>
  );
}

/** Soft, dismissible Plus note for Free users (upsell.ts decides when). Honest about what Plus changes. */
function UpsellNote({ reason, onDismiss }: { reason: "milestone" | "complex"; onDismiss?: () => void }) {
  return (
    <aside className={s.upsell} aria-label="About paid plans">
      <p>
        {reason === "complex"
          ? "The models disagreed on this one. Paid plans, starting with Lite, use stronger models with more verification, which helps most on questions like this."
          : "Liking Keplar? Paid plans, starting with Lite, run stronger models with more verification on your questions."}{" "}
        <Link href="/pricing?from=upsell" className={s.upsellLink}>See plans</Link>
      </p>
      {onDismiss ? (
        <button type="button" className={s.upsellClose} onClick={onDismiss} aria-label="Dismiss">
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </aside>
  );
}

/** Plus/Pro at 80% or more of a rolling window: warn once, with the reset time. */
function WindowWarning({ ledger }: { ledger: Ledger }) {
  const w = ledger.windows?.map((x) => ({ ...x, pct: x.used / x.limit })).filter((x) => x.pct >= WINDOW_WARN_AT && x.pct < 1).sort((a, b) => b.pct - a.pct)[0];
  if (!w) return null;
  return (
    <aside className={s.upsell} role="status" aria-label="Usage limit warning">
      <p>
        You&rsquo;ve used {Math.round(w.pct * 100)}% of your {w.label.toLowerCase()} limit; it {windowResetText(w.id, w.resetsAt)}.{" "}
        {ledger.plan === "plus" ? <Link href="/checkout?plan=pro" className={s.upsellLink}>Upgrade to Pro</Link> : null}
      </p>
    </aside>
  );
}

/** Paid plan with ~10% or less of the month's credits left. */
function LowCredits({ ledger }: { ledger: Ledger }) {
  const left = Math.max(0, (ledger.total ?? 0) - ledger.used);
  const next = ledger.plan === "plus" ? { id: "pro", label: "Upgrade to Pro" } : null;
  return (
    <aside className={s.upsell} role="status" aria-label="Credits running low">
      <p>
        You have about {left.toLocaleString("en-US")} credits left this month. They renew on {formatResetAt(ledger.resetsAt)}.{" "}
        {next ? <Link href={`/checkout?plan=${next.id}`} className={s.upsellLink}>{next.label}</Link> : <Link href="/account" className={s.upsellLink}>Manage plan</Link>}
      </p>
    </aside>
  );
}

function ConsensusBadge({ c }: { c: KeplarAnswer["consensus"] }) {
  if (c.level === "single") {
    return <span className={s.badgeQuiet}>Single model</span>;
  }
  if (c.level === "unscored") {
    return <span className={s.badgeQuiet}>{c.responded} of {c.consulted} responded</span>;
  }
  // Counts, never a percentage: agreement is how many models took the same position, not a probability that the answer is right.
  const voters = c.agree + c.disagree;
  const pct = voters > 0 ? Math.round((c.agree / voters) * 100) : 0;
  const label = c.level === "none" ? "No majority" : c.level === "partial" ? "Models split" : "Models agree";
  return (
    <div className={s.consensus} data-level={c.level} aria-label={`${label}. ${asSentence(c.summary)} Agreement is not proof the answer is right.`}>
      <svg className={s.ring} viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" className={s.ringTrack} />
        <circle cx="18" cy="18" r="15.5" className={s.ringValue} pathLength={100} strokeDasharray={`${pct} 100`} />
      </svg>
      <span className={s.consensusValue} aria-hidden="true">
        <span className={s.consensusPct}>{c.level === "none" ? "Split" : `${c.agree} of ${voters}`}</span>
        <span className={s.consensusLabel}>{label}</span>
      </span>
      <span className={s.consensusSplit} aria-hidden="true">
        {c.level === "none" ? (
          <span>No majority</span>
        ) : (
          <>
            <span><i className={s.agreeDot} />{c.agree} agree</span>
            <span><i className={s.dissentDot} />{c.disagree} {c.disagree === 1 ? "disagrees" : "disagree"}</span>
          </>
        )}
        {c.missing ? <span className={s.missing}>{c.responded} of {c.consulted} responded</span> : null}
      </span>
    </div>
  );
}

function sourcesMeta(sources: KeplarAnswer["sources"]) {
  const cited = sources.filter((x) => x.kind === "model" || x.kind === "web").length;
  const attached = sources.filter((x) => x.kind === "attachment").length;
  const parts = [cited ? `${cited} cited by models` : "None cited", attached ? `${attached} attached` : ""].filter(Boolean);
  return parts.join(" · ");
}

const checkKindLabel: Record<VerificationCheck["kind"], string> = {
  reasoning: "Reasoning that doesn’t hold",
  contradiction: "Contradiction",
  unsupported: "Claim not supported by other models",
  web: "Checked against web sources",
};

const outcomeLabel: Record<VerificationCheck["outcome"], string> = {
  held: "Held up",
  revised: "Revised",
  removed: "Left out",
  "kept-as-dissent": "Kept as dissent",
  supported: "Supported",
  contradicted: "Contradicted",
  inconclusive: "Inconclusive",
};

function verificationMeta(v: KeplarAnswer["verification"]) {
  if (v.mode === "not-needed") return "Not needed";
  // Threads saved before checks existed have no `checks` array.
  const checks = v.checks ?? [];
  const n = checks.filter((c) => c.kind !== "web").length;
  const web = checks.filter((c) => c.kind === "web").length;
  return [n ? `${n} ${n === 1 ? "issue" : "issues"} resolved` : "No issues found", web ? `${web} checked on the web` : ""].filter(Boolean).join(" · ");
}

function CheckItem({ c }: { c: VerificationCheck }) {
  return (
    <li className={s.check}>
      <div className={s.checkHead}>
        <span className={s.checkKind}>{checkKindLabel[c.kind]}</span>
        <span className={s.checkOutcome} data-outcome={c.outcome}>{outcomeLabel[c.outcome]}</span>
      </div>
      <p className={s.checkFinding}>{c.finding}</p>
      {c.models.length ? <p className={s.checkModels}>{c.models.join(", ")}</p> : null}
      {c.resolution ? <p className={s.checkResolution}><span className={s.itemTitle}>Resolution.</span> {c.resolution}</p> : null}
      {c.sources?.length ? (
        <ul className={s.checkSources} aria-label="Web sources">
          {c.sources.map((src) => (
            <li key={src.url}>
              <a href={src.url} target="_blank" rel="noreferrer noopener">{src.title}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function VerificationBody({ v }: { v: KeplarAnswer["verification"] }) {
  if (v.mode === "not-needed") return <p>{v.summary}</p>;
  const model = (v.checks ?? []).filter((c) => c.kind !== "web");
  // Web entries exist only when the Retriever is enabled; otherwise nothing about web checking is shown.
  const web = (v.checks ?? []).filter((c) => c.kind === "web");
  return (
    <>
      <p>{v.summary}</p>
      {model.length ? <ul className={s.checks}>{model.map((c, i) => <CheckItem key={i} c={c} />)}</ul> : null}
      {web.length ? (
        <>
          <p className={s.checkGroup}>Checked against web sources</p>
          <ul className={s.checks}>{web.map((c, i) => <CheckItem key={i} c={c} />)}</ul>
        </>
      ) : null}
      {v.notes.length ? (
        <ul className={s.plainList}>
          {v.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      ) : null}
    </>
  );
}

/** Casual chat, fixed replies, instant answers, jokes and support: the same card as every answer (header, body, footer), without the sections that have nothing to say. */
function PlainReply({ answer: a, onRetry, onSignal, isLast, onAsk }: { answer: KeplarAnswer; onRetry: () => void; onSignal?: (kind: "up" | "down" | "copy") => void; isLast: boolean; onAsk?: (text: string) => void }) {
  return (
    <article className={`${s.answer} ${s.plainReply}`} data-plain="">
      <header className={s.answerHead}><AnswerTitle /></header>
      <Markdown source={a.markdown} />
      {a.clarify ? <ClarifyChips clarify={a.clarify} onAsk={onAsk} enabled={isLast} /> : null}
      <AnswerFooter answer={a} onRetry={onRetry} onSignal={onSignal} isLast={isLast} meta={<span className={s.compute}>{a.durationMs && a.durationMs > 2500 ? `Replied in ${(a.durationMs / 1000).toFixed(1)}s` : "Quick reply"}</span>} />
    </article>
  );
}

/** The footer every answer card shares: a meta line, then copy, (rating when offered), share, and ask again on the latest one. */
function AnswerFooter({ answer: a, meta, onRetry, onSignal, isLast }: { answer: KeplarAnswer; meta: ReactNode; onRetry: () => void; onSignal?: (kind: "up" | "down" | "copy") => void; isLast: boolean }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(a.markdown);
      growthTrack("answer_action", { action: "copy" });
      onSignal?.("copy");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };
  return (
    <footer className={s.answerFoot}>
      <div className={s.footMeta}>{meta}</div>
      <div className={s.footActions}>
        <button type="button" className={s.iconBtn} onClick={copy} aria-label={copied ? "Copied answer" : "Copy answer"}>
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
        </button>
        {onSignal ? (
          <>
            <button type="button" className={s.iconBtn} aria-pressed={vote === "up"} onClick={() => { setVote("up"); onSignal("up"); }} aria-label="Good answer" title="Good answer. This helps Keplar choose better next time (the models themselves are not retrained).">
              <IconThumb size={15} up />
            </button>
            <button type="button" className={s.iconBtn} aria-pressed={vote === "down"} onClick={() => { setVote("down"); onSignal("down"); }} aria-label="Not a good answer" title="Not a good answer. This helps Keplar choose better next time (the models themselves are not retrained).">
              <IconThumb size={15} />
            </button>
          </>
        ) : null}
        <ListenButton id={a.id} markdown={a.markdown} isLast={isLast} className={s.iconBtn} />
        <ShareAnswer answer={a} triggerClass={s.iconBtn} />
        <ReportAnswer answerId={a.id} excerpt={a.markdown} triggerClass={s.iconBtn} />
        {isLast ? (
          <button type="button" className={s.iconBtn} onClick={() => { growthTrack("answer_action", { action: "retry" }); onRetry(); }} aria-label="Ask again">
            <IconRetry size={15} />
          </button>
        ) : null}
      </div>
    </footer>
  );
}

/** Where the models disagree: side by side right under the answer (not behind a click). See src/components/answer/DisagreementView.tsx. */
function SplitView({ a, onMore }: { a: KeplarAnswer; onMore: () => void }) {
  return (
    <DisagreementView
      data={{ consensus: a.consensus, models: a.models, disagreements: a.disagreements, checks: a.verification.checks, reviewer: a.verification.mode === "cross-model" ? a.verification.reviewer : undefined }}
      footer={<button type="button" className={s.splitLink} onClick={onMore}>Open the full comparison</button>}
    />
  );
}

const slotLabel = { panel: "Panel", verifier: "Verifier", judge: "Judge" } as const;
const statusLabel = { responded: "Responded", failed: "No response", refused: "Declined", "not-needed": "Not needed" } as const;

function Answer({ answer: a, onRetry, onSignal, isLast, continued }: { answer: KeplarAnswer; onRetry: () => void; onSignal?: (kind: "up" | "down" | "copy") => void; isLast: boolean; continued?: boolean }) {
  const uid = useId();
  const [open, setOpen] = useState<string | null>(null);
  const c = a.consensus;
  const checkedOnWeb = a.sourcing?.state === "checked" || a.sourcing?.state === "no_sources";
  const toggle = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && (id === "consensus" || id === "models" || id === "disagreements" || id === "verification" || id === "reasoning")) growthTrack("answer_action", { action: `open_${id}` as AnswerAction });
  };
  const hasSplit = a.disagreements.length > 0 && c.level !== "single";
  const modelStatus = summarizeModels(a.models);
  const modelsNote = c.level === "single" ? "" : modelStatusSentence(modelStatus);

  const sections: { id: string; title: string; meta: string; body: ReactNode }[] = [
    {
      id: "consensus",
      title: "Consensus",
      meta: c.level === "single" ? "Not applicable" : c.level === "unscored" ? "Not scored" : c.level === "none" ? "No majority" : c.summary,
      body: (
        <>
          <p>{asSentence(c.summary) || "One model answered. There was nothing to compare."}</p>
          <p>
            This shows how many of the consulted models took the same position once weakly supported claims were set aside.
            It is not a score of how likely the answer is to be right, and several models can share the same mistake. Verify anything high-stakes.
          </p>
        </>
      ),
    },
    {
      id: "models",
      title: "Models consulted",
      meta: c.level === "single" ? "1 model" : `${c.responded} of ${c.consulted} responded`,
      body: (
        <>
        <AgreementScene input={{ level: c.level, models: a.models }} />
        <ul className={s.modelList}>
          {a.models.map((m) => (
            <li key={`${m.slot}-${m.id}`} className={s.modelRow} data-status={m.status}>
              <span className={s.modelName}>
                {m.name}
                <span className={s.modelProvider}>{m.provider}</span>
              </span>
              <span className={s.modelSlot}>{slotLabel[m.slot]}</span>
              <span className={s.modelStatus}>{statusLabel[m.status]}</span>
              {m.stance || m.note ? <span className={s.modelNote}>{[m.stance, m.note].filter(Boolean).join(" · ")}</span> : null}
            </li>
          ))}
        </ul>
        </>
      ),
    },
    {
      id: "sources",
      title: "Sources",
      meta: sourcesMeta(a.sources),
      body: (
        <>
        <p className={s.sectionNote}>{a.sources.some((x) => x.detail === "Read by Keplar for this answer") ? "Links you shared were opened and read by Keplar. Other sources are ones the models cited, plus your attachments; Keplar did not open those pages." : "Sources the models cited, plus your attachments. Keplar did not open these pages."}{checkedOnWeb ? " The source check above searched the web separately for the key claims." : ""}</p>
        <ul className={s.plainList}>
          {a.sources.map((src, i) => (
            <li key={i}>
              {src.kind === "model" ? <span className={s.sourceTag}>Cited by models</span> : src.detail === "Read by Keplar for this answer" ? <span className={s.sourceTag}>Read by Keplar</span> : null}
              {src.url ? (
                <a className={s.itemTitle} href={src.url} target="_blank" rel="noreferrer noopener">{src.title}</a>
              ) : (
                <span className={s.itemTitle}>{src.title}</span>
              )}
              {src.detail ? <span> {src.detail}</span> : null}
            </li>
          ))}
        </ul>
        </>
      ),
    },
    {
      id: "disagreements",
      title: "Disagreements",
      meta: a.disagreements.length ? `${a.disagreements.length} · ${a.disagreements[0].topic.toLowerCase()}` : "None",
      body: a.disagreements.length ? (
        <div className={s.disagreements}>
          {a.disagreements.map((d) => (
            <div key={d.topic}>
              <ul className={s.positions}>
                {d.positions.map((p) => (
                  <li key={p.stance}>
                    <span className={s.itemTitle}>{p.stance}</span>
                    <span className={s.positionModels}>{p.models.join(", ")}</span>
                    <span>{p.summary}</span>
                  </li>
                ))}
              </ul>
              <p className={s.resolution}><span className={s.itemTitle}>Resolution.</span> {d.resolution}</p>
            </div>
          ))}
        </div>
      ) : (
        <p>The models that responded took the same position.</p>
      ),
    },
    {
      id: "verification",
      title: "Verification",
      meta: verificationMeta(a.verification),
      body: <VerificationBody v={a.verification} />,
    },
    { id: "reasoning", title: "Reasoning summary", meta: reasoningMeta(a.reasoning), body: <p>{a.reasoning}</p> },
  ];
  // Only rows that say something are shown; "Not applicable", "None" and "Not needed" collapse under one "Details" row.
  const quiet = quietIds(a);
  const shownSections = sections.filter((sec) => !quiet.has(sec.id) && !(sec.id === "reasoning" && !a.reasoning));
  const quietSections = sections.filter((sec) => quiet.has(sec.id));
  if (quietSections.length) {
    shownSections.push({ id: "details", title: "Details", meta: quietSections.map((q) => q.title.toLowerCase()).join(", "), body: <DetailsBody sections={quietSections} /> });
  }


  return (
    <article className={s.answer} aria-labelledby={`${uid}-title`} data-level={c.level} data-continued={continued || undefined}>
      <header className={s.answerHead}>
        <h3 id={`${uid}-title`} className={s.answerTitle}>
          <KeplarSymbol size={15} />
          {brand.answer}
        </h3>
        <ConsensusBadge c={c} />
      </header>

      {a.research ? <ResearchHead research={a.research} /> : null}
      <Markdown source={a.markdown} cite={citeRenderer(a.research?.sources)} />

      {modelsNote ? (
        <p className={s.missingNote} role="note" data-missing-models={modelStatus.missing.length || undefined}>
          {modelsNote}
          {modelStatus.missing.length && isLast ? (
            <>
              {" "}
              <button type="button" className={s.splitLink} onClick={onRetry}>Retry with all models</button>
            </>
          ) : null}
        </p>
      ) : null}

      {hasSplit ? (
        <SplitView a={a} onMore={() => { setOpen("disagreements"); growthTrack("answer_action", { action: "open_disagreements" }); }} />
      ) : c.level === "consensus" && c.consulted > 1 ? (
        <p className={s.agreeNote}>The models that responded took the same position. That is a good sign, not proof: they can share the same mistake{checkedOnWeb ? ", so the key claims were searched on the web (below)" : ", and this answer was not looked up on the web"}.</p>
      ) : null}

      {a.research ? <ResearchSources research={a.research} /> : null}
      {a.sourcing ? <SourceChecks sourcing={a.sourcing} /> : null}

      <ul className={s.sections}>
        {shownSections.map((sec) => {
          const isOpen = open === sec.id;
          return (
            <li key={sec.id} className={s.section} data-open={isOpen || undefined}>
              <h4 className={s.sectionH}>
                <button
                  type="button"
                  className={s.sectionBtn}
                  aria-expanded={isOpen}
                  aria-controls={`${uid}-${sec.id}`}
                  onClick={() => toggle(sec.id)}
                  data-section={sec.id}
                >
                  <span className={s.sectionTitle}>{sec.title}</span>
                  <span className={s.sectionMeta}>{sec.meta}</span>
                  <span className={s.plusMinus} aria-hidden="true" />
                </button>
              </h4>
              <div id={`${uid}-${sec.id}`} className={s.sectionPanel} hidden={!isOpen}>
                {sec.body}
              </div>
            </li>
          );
        })}
      </ul>

      <AnswerFooter answer={a} onRetry={onRetry} onSignal={onSignal} isLast={isLast} meta={<span className={s.compute}>{brand.usage} · {computeLevelLabel[a.compute.level]}</span>} />
    </article>
  );
}
