"use client";

import { SourceChecks } from "@/components/answer/SourceChecks";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { brand } from "@/lib/site";
import { tiers } from "@/lib/tiers";
import { formatResetAt, upgradesFrom, WINDOW_WARN_AT, windowResetText } from "@/lib/orchestration/plans";
import { computeLevelLabel } from "@/lib/orchestration/compute";
import { summarizeModels } from "@/lib/orchestration/model-status";
import type { KeplarAnswer, VerificationCheck } from "@/lib/orchestration/types";
import { IconCheck, IconChevron, IconRetry, IconSave, IconThumb, IconWeb } from "./icons";
import { ListenButton } from "./ListenButton";
import { Button, Icon, IconButton, MorphIcon, Tooltip } from "@/components/kit";
import la from "./link-action.module.css";
import { Markdown } from "./Markdown";
import { StructuredAnswer } from "./rich/StructuredAnswer";
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
import { SynthesisView } from "./SynthesisView";
import { DebateLive, DebateTranscript } from "./DebateView";
import { LiveChecks, ResearchChecks, ResearchHead, ResearchLive, ResearchSources, citeRenderer } from "./research/Research";
import { liveCopyText } from "./state/live-research";
import { researchBridge, safe } from "@/lib/desktop/research-bridge";
import { downloadText } from "./chat-export";
import { CoreLive, CoreSummaryView } from "./core/CoreTrace";
import { asSentence } from "@/lib/sentence";
import { needsChargeNote } from "@/lib/orchestration/no-response";
import type { KeplarMessage, Ledger } from "./state/types";
import type { QuizProgress } from "@/lib/quiz/types";
import { QuizBuilding, QuizCard } from "./quiz/QuizCard";
import { AnswerBrand, BrandMark } from "./AnswerBrand";
import { answerBrands, consensusSides, modelMark } from "./model-marks";
import s from "./KeplarTurn.module.css";

type Props = {
  message: KeplarMessage;
  onRetry: () => void;
  /** Live Research answers: ask again with the desktop reading every page afresh. */
  onRefreshResearch?: () => void;
  /** Router learning: thumbs and copy on the answer. */
  onSignal?: (kind: "up" | "down" | "copy") => void;
  /** Sends a suggested question (a clarifying chip) as the next message. */
  onAsk?: (text: string) => void;
  ledger: Ledger;
  isLast: boolean;
  onDismissUpsell?: () => void;
  /** Saves quiz picks on the message. */
  onQuizProgress?: (progress: QuizProgress) => void;
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function KeplarTurn({ message: m, onRetry, onRefreshResearch, onSignal, onAsk, isLast, ledger, onDismissUpsell, onQuizProgress }: Props) {
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
  const activeStage = [...m.stages].reverse().find((x) => x.status === "active")?.id ?? m.stages[m.stages.length - 1]?.id ?? null;

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
            activeStage === "synthesize" && count > 1 ? (
              <SynthesisView models={m.models} count={count} disagreement={m.disagreement} />
            ) : (
              <ActivationScene running={running} input={{ count, ticks: m.models.map((x) => x.status), stage: activeStage }} />
            )
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
                    <span className={s.bars} role="img" aria-label={`${m.models.length} of ${count} models responded`}>
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

      {running && m.practice && !m.answer?.quiz ? <QuizBuilding kind={m.practice.kind} source={m.practice.source} /> : null}

      {typingAnswer && !m.practice && (m.smalltalk || m.answer?.smalltalk) ? (
        <article className={`${s.answer} ${s.plainReply}`} data-o="KeplarTurn answer" aria-busy="true" data-typing="" data-plain="">
          <header className={s.answerHead}><AnswerTitle models={m.answer?.models ?? m.models} /></header>
          {running && m.mode === "consensus" ? <p className={s.draftNote} role="status" data-early-note="">Early draft from the first model to answer. Keplar is checking it with the others; the final answer will replace it.</p> : null}
          <Markdown source={tw.text} streaming caret />
          <TypingBar text={fullText} />
        </article>
      ) : null}

      {typingAnswer && !m.practice && !(m.smalltalk || m.answer?.smalltalk) ? (
        <article className={s.answer} data-o="KeplarTurn answer" aria-busy="true" data-typing="" data-continued={live || undefined}>
          <header className={s.answerHead}><AnswerTitle models={m.answer?.models ?? m.models} /></header>
          {/* A panel's first words are one model's early draft (early-stream.ts): say so, so the checked answer replacing it is no surprise. */}
          {running && m.mode === "consensus" && !m.answer ? <p className={s.draftNote} role="status" data-early-note="">Early draft from the first model to answer. Keplar is checking it with the others; the final answer will replace it.</p> : null}
          {m.answer?.research ? <ResearchHead research={m.answer.research} /> : null}
          <StructuredAnswer source={tw.text} streaming caret cite={citeRenderer(m.answer ? m.answer.research?.sources : m.research?.sources)} rich={m.answer?.rich} consensus={m.answer?.consensus} />
          <TypingBar text={fullText} />
        </article>
      ) : null}

      {finished && m.answer && !typingAnswer && (m.smalltalk || m.answer.smalltalk) ? <PlainReply answer={m.answer} onRetry={onRetry} onSignal={onSignal} isLast={isLast} onAsk={onAsk} /> : null}
      {finished && m.answer && !typingAnswer && !(m.smalltalk || m.answer.smalltalk) ? <Answer answer={m.answer} onRetry={onRetry} onRefreshResearch={onRefreshResearch} onSignal={onSignal} isLast={isLast} continued={live} quizProgress={m.quizProgress} onQuizProgress={onQuizProgress} onAsk={onAsk} /> : null}
      {finished && m.answer?.core && !typingAnswer && !(m.smalltalk || m.answer.smalltalk) ? <CoreSummaryView core={m.answer.core} onAsk={onAsk} enabled={isLast} /> : null}
      {finished && m.answer?.debate && !typingAnswer ? <DebateTranscript debate={m.answer.debate} /> : null}
      {/* Answer recovery: real states only (state/recovery.ts polls the server's turn). */}
      {m.recovery?.state === "recovering" && running ? <p className={s.memoryHint} role="status">Connection dropped. Keplar is still working on this answer; getting it for you…</p> : null}
      {finished && m.recovery?.state === "recovered" ? <p className={s.memoryHint} role="status">Recovered after a dropped connection{m.recovery.headless ? " (it finished while you were away)" : ""}. It was not run twice.</p> : null}
      {finished && m.recovery?.state === "replayed" ? <p className={s.memoryHint} role="status">This answer had already finished{m.recovery.headless ? " while you were away" : ""}, so it is shown again: not run or charged a second time.</p> : null}
      {finished && m.memory && m.memory.used && m.memory.used > 0 ? <UsingMemory used={m.memory.used} /> : null}
      {finished && m.memory && m.memory.saved > 0 ? (
        <p className={s.memoryHint} role="status">
          Memory updated{m.memory.saved > 1 ? ` (${m.memory.saved} notes)` : ""}. <Link href="/account#memory">See or delete</Link>
        </p>
      ) : null}
      {finished && m.upsell && ledger.plan === "free" && !m.smalltalk && !m.answer?.smalltalk ? <UpsellNote reason={m.upsell} onDismiss={onDismissUpsell} /> : null}
      {finished && isLast && !m.smalltalk && !m.answer?.smalltalk ? <WindowWarning ledger={ledger} /> : null}
      {finished && ledger.total && ledger.plan !== "free" && isLast && !m.smalltalk && !m.answer?.smalltalk && ledger.total - ledger.used <= ledger.total * 0.1 ? <LowCredits ledger={ledger} /> : null}

      {(m.status === "stopped" || m.status === "error") && m.draft && !m.answer ? <PartialAnswer m={m} /> : null}

      {m.status === "stopped" ? (
        <NoticeCard>
          <div className={s.notice}>
            {/* Charges: Free gives the question back when stopped; paid plans are billed only for models that had already been asked
                (route.ts settles the planned cost once the panel started), which this screen can't see, so it never says "nothing". */}
            <p>Stopped. {m.debate?.turns.length ? (ledger.plan === "free" ? "The debate was stopped and this question wasn't counted." : "The debate was stopped; only the rounds that had started count toward usage.") : ledger.plan === "free" ? "This question wasn't counted." : "Only models that had already started count toward usage."}</p>
            <Button size="sm" variant="ghost" onClick={onRetry} leadingIcon={<IconRetry size={14} />}>
              Ask again
            </Button>
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
            <Link href="/pricing?from=feature" className={la.act} data-variant="secondary" data-size="sm">See plans</Link>
          ) : null}
          {m.error.retryable ? (
            <Button size="sm" variant="secondary" onClick={onRetry} leadingIcon={<IconRetry size={14} />}>
              Retry
            </Button>
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
            <Link href="/checkout?plan=lite" className={la.act} data-variant="primary" data-size="sm">Upgrade to Lite</Link>
            <Link href="/pricing?from=upsell" className={la.act} data-variant="ghost" data-size="sm">See plans</Link>
          </>
        ) : null}
        <Button size="sm" variant={error.upgrade ? "ghost" : "secondary"} onClick={onRetry} leadingIcon={<IconRetry size={14} />}>
          Try again
        </Button>
      </div>
    </div>
    </NoticeCard>
  );
}

/** Errors and stops sit in the same card as an answer (same header and shell), so nothing Keplar says looks different from an answer. */
function NoticeCard({ children }: { children: ReactNode }) {
  return (
    <article className={s.answer} data-o="KeplarTurn answer" data-notice="">
      <header className={s.answerHead}><AnswerTitle /></header>
      {children}
    </article>
  );
}

/**
 * Shown under a typing answer: Copy always copies the full text (not the part revealed so far),
 * and Skip shows the rest at once once the stream has finished.
 */
/** While an answer streams in: copy the full text so far. (No "Skip": once the stream ends the rest appears within ~0.3 s.) */
function TypingBar({ text }: { text: string }) {
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
      <IconButton size="sm" className={s.footAct} onClick={copy} label={copied ? "Copied answer" : "Copy full answer"} icon={<MorphIcon icon="copy" state={copied ? "copied" : "idle"} size={15} />} />
    </div>
  );
}

/**
 * What arrived before an answer was stopped or broke off. Shown as unfinished (never as an answer): it may be one model's early draft that
 * the others never checked. It can still be read, selected and copied.
 */
function PartialAnswer({ m }: { m: KeplarMessage }) {
  return (
    <article className={s.answer} data-o="KeplarTurn answer" data-partial="">
      <p className={s.draftNote}>
        {m.status === "stopped" ? "Unfinished: stopped here" : "Unfinished: the answer broke off here"}
        {m.mode === "consensus" ? ", before the other models checked it." : "."}
      </p>
      <Markdown source={m.draft} />
      <TypingBar text={m.draft} />
    </article>
  );
}

/** The answer header: the brand(s) of the models that answered (AnswerBrand.tsx), or the Keplar mark when no model is credited. */
function AnswerTitle({ models }: { models?: readonly { id: string; name: string; status?: string }[] }) {
  return <AnswerBrand models={models} />;
}

const upgradeTiersFor = (plan: Ledger["plan"]) =>
  upgradesFrom(plan)
    .map((p) => tiers.find((t) => t.id === p.id))
    .filter((t): t is (typeof tiers)[number] => Boolean(t));

/** A rolling 5-hour or weekly limit stopped the question: say which, when it resets, and (Plus) suggest Pro. */
function WindowLimit({ window: w, ledger }: { window: NonNullable<NonNullable<KeplarMessage["limit"]>["window"]>; ledger: Ledger }) {
  const titleId = useId(); // one per card: a thread can show several limit cards
  const when = windowResetText(w.id, w.resetsAt);
  return (
    <section className={s.limit} aria-labelledby={titleId} role="alert" data-window={w.id}>
      <h3 id={titleId} className={s.limitTitle}>You&rsquo;ve reached your {w.label.toLowerCase()} {brand.usage} limit.</h3>
      <p className={s.limitBody}>
        Keplar didn&rsquo;t start this question, so none of your allowance was used. Your {w.label.toLowerCase()} limit {when}
        {w.id === "weekly" ? ` (${new Date(w.resetsAt).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })})` : ""}. Your monthly credits are kept.
      </p>
      <ExtensionOffer plan={ledger.plan} />
      <div className={s.limitActions}>
        {ledger.plan === "plus" ? (
          <Link href="/checkout?plan=pro" className={la.act} data-variant="primary">
            Upgrade to Pro for higher limits <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <Link href="/account" className={la.act} data-variant={ledger.plan === "plus" ? "ghost" : "primary"}>See your usage</Link>
      </div>
    </section>
  );
}

/** The Free plan's questions for today are used up. Honest: Free uses free models only, so there is no credit pack to buy; upgrading is the way on. */
function DailyLimit({ daily, ledger }: { daily: NonNullable<NonNullable<KeplarMessage["limit"]>["daily"]>; ledger: Ledger }) {
  const titleId = useId(); // one per card: a thread can show several limit cards
  const upgradeTiers = upgradeTiersFor(ledger.plan);
  const nextPaid = upgradeTiers.find((t) => t.id === "plus") ?? null;
  return (
    <section className={s.limit} aria-labelledby={titleId} role="alert" data-daily-limit="">
      <h3 id={titleId} className={s.limitTitle}>You&rsquo;ve used today&rsquo;s {daily.limit} Free questions.</h3>
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
          <Link href={`/checkout?plan=${nextPaid.id}`} className={la.act} data-variant="primary">
            Upgrade to {nextPaid.name.replace("Keplar ", "")} · ${nextPaid.price}/mo <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <Link href="/pricing?from=daily-limit" className={la.act} data-variant={nextPaid ? "ghost" : "primary"}>See plans</Link>
      </div>
    </section>
  );
}

/** Today's shared usage budget paused Free. The person's own questions were not used, and there is no monthly balance to show. */
function DayBudget({ resetsAt }: { resetsAt?: string }) {
  const titleId = useId(); // one per card: a thread can show several limit cards
  const when = resetsAt ? formatDailyReset(resetsAt) : "at 00:00 UTC";
  return (
    <section className={s.limit} aria-labelledby={titleId} role="alert" data-day-budget="">
      <h3 id={titleId} className={s.limitTitle}>Keplar has reached today&rsquo;s usage budget.</h3>
      <p className={s.limitBody}>
        Free is paused until 00:00 UTC ({when}). This question did not run, and it was not counted against your Free questions.
        Paid plans keep working, so upgrading is how you keep going now.
      </p>
      <div className={s.limitActions}>
        <Link href="/checkout?plan=plus" className={la.act} data-variant="primary">
          Upgrade to Plus <span aria-hidden="true">→</span>
        </Link>
        <Link href="/pricing?from=day-budget" className={la.act} data-variant="ghost">See plans</Link>
      </div>
    </section>
  );
}

function UsageLimit({ limit, ledger }: { limit: NonNullable<KeplarMessage["limit"]>; ledger: Ledger }) {
  const titleId = useId(); // one per card: a thread can show several limit cards
  if (limit.budget === "day") return <DayBudget resetsAt={limit.resetsAt} />;
  if (limit.window) return <WindowLimit window={limit.window} ledger={ledger} />;
  if (limit.daily) return <DailyLimit daily={limit.daily} ledger={ledger} />;
  const total = ledger.total ?? Infinity;
  const upgradeTiers = upgradeTiersFor(ledger.plan);
  const nextPaid = upgradeTiers.find((t) => t.id === "plus" || t.id === "pro") ?? null;
  const formatReset = () => formatResetAt(ledger.resetsAt);
  const empty = limit.remaining <= 0;
  const left = empty ? 0 : Math.max(1, Math.floor((limit.remaining / total) * 100));
  return (
    <section className={s.limit} aria-labelledby={titleId} role="alert">
      <h3 id={titleId} className={s.limitTitle}>
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
          <Link href={`/checkout?plan=${nextPaid.id}`} className={la.act} data-variant="primary">
            Upgrade to {nextPaid.name.replace("Keplar ", "")} · ${nextPaid.price}/mo <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <Link href="/pricing?from=credits" className={la.act} data-variant={nextPaid ? "ghost" : "primary"}>
          {nextPaid ? "See plans" : <>See plans <span aria-hidden="true">→</span></>}
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
        <IconButton size="sm" className={s.upsellClose} onClick={onDismiss} label="Dismiss" tooltip={false} icon={<Icon name="close" size={14} />} />
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

/** The brands on one side of the vote, as small overlapping logos (one per brand; the count beside them is per model). */
function LogoStack({ models }: { models: readonly { id: string; name: string }[] }) {
  const marks = answerBrands(models);
  if (!marks.length) return null;
  const shown = marks.slice(0, 4);
  return (
    <span className={s.logoStack} aria-hidden="true">
      {shown.map((m) => (
        <span key={m.family} className={s.logoChip} title={m.family}>
          <BrandMark mark={m} size={12} />
        </span>
      ))}
      {marks.length > shown.length ? <span className={s.logoMore}>+{marks.length - shown.length}</span> : null}
    </span>
  );
}

/** The models that did not take the majority position, each with its brand, position and its own answer ("View Disagrees"). */
function DissentPanel({ id, models, disagreements, onClose }: { id: string; models: KeplarAnswer["models"]; disagreements: KeplarAnswer["disagreements"]; onClose: () => void }) {
  const summaryOf = (stance?: string) => disagreements.flatMap((d) => d.positions).find((p) => p.stance === stance)?.summary;
  return (
    <section id={id} className={s.dissentPanel} aria-label="What the disagreeing models said">
      <div className={s.dissentHead}>
        <p>{models.length === 1 ? "The model that disagreed" : `The ${models.length} models that disagreed`}, in their own words. Keplar weighed these against the others; a minority can still be right.</p>
        <button type="button" className={s.splitLink} onClick={onClose}>Close</button>
      </div>
      <ul className={s.dissentList}>
        {models.map((m) => {
          const mark = modelMark(m.id, m.name);
          const text = m.excerpt ?? summaryOf(m.stance);
          return (
            <li key={m.id} className={s.dissentItem}>
              <div className={s.dissentWho}>
                <span className={s.dissentLogo}><BrandMark mark={mark} size={18} /></span>
                <strong>{mark.family}</strong>
                {m.name !== mark.family ? <span className={s.dissentModel}>{m.name}</span> : null}
              </div>
              {m.stance ? <p className={s.dissentStance}>Position: {m.stance}</p> : null}
              {text ? <div className={s.dissentText}><Markdown source={text} /></div> : <p className={s.dissentModel}>This model&rsquo;s answer wasn&rsquo;t saved with this chat.</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConsensusBadge({ c, models = [] }: { c: KeplarAnswer["consensus"]; models?: KeplarAnswer["models"] }) {
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
  const sides = c.level === "none" ? { agree: [], dissent: [] } : consensusSides(models, c);
  return (
    // role="img": the badge is a graphic whose visible parts are all aria-hidden, so its label is the text equivalent (aria-label is
    // not allowed on a plain div).
    <div className={s.consensus} data-level={c.level} role="img" aria-label={`${label}. ${asSentence(c.summary)}${sides.agree.length ? ` Agree: ${answerBrands(sides.agree).map((m) => m.family).join(", ")}.` : ""}${sides.dissent.length ? ` Disagree: ${answerBrands(sides.dissent).map((m) => m.family).join(", ")}.` : ""}${c.missing ? ` ${c.responded} of ${c.consulted} responded.` : ""} Agreement is not proof the answer is right.`}>
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
            <span><i className={s.agreeDot} />{c.agree} agree<LogoStack models={sides.agree} /></span>
            {c.disagree > 0 ? <span><i className={s.dissentDot} />{c.disagree} {c.disagree === 1 ? "disagrees" : "disagree"}<LogoStack models={sides.dissent} /></span> : null}
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
    <article className={`${s.answer} ${s.plainReply}`} data-o="KeplarTurn answer" data-plain="" data-last={isLast || undefined}>
      <header className={s.answerHead}><AnswerTitle models={a.models} /></header>
      <Markdown source={a.markdown} />
      {a.clarify ? <ClarifyChips clarify={a.clarify} onAsk={onAsk} enabled={isLast} /> : null}
      <AnswerFooter answer={a} onRetry={onRetry} onSignal={onSignal} isLast={isLast} meta={<span className={s.compute}>{a.durationMs && a.durationMs > 2500 ? `Replied in ${(a.durationMs / 1000).toFixed(1)}s` : "Quick reply"}</span>} />
    </article>
  );
}

/** The footer every answer card shares: a meta line, then copy, (rating when offered), share, and ask again on the latest one. */
function AnswerFooter({ answer: a, meta, onRetry, onRefreshResearch, onSignal, isLast }: { answer: KeplarAnswer; meta: ReactNode; onRetry: () => void; onRefreshResearch?: () => void; onSignal?: (kind: "up" | "down" | "copy") => void; isLast: boolean }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const live = a.research?.live;
  // Live Research: the desktop app saves a self-contained report with the sources; without it (a browser, an expired run) a Markdown file.
  const save = async () => {
    const bridge = researchBridge();
    const r = bridge && live ? await safe(() => bridge.export(live.runId, a.markdown, "html")) : null;
    if (r?.ok) { if (r.result.saved) setSaved(true); }
    else { downloadText(`keplar-research-${new Date().toISOString().slice(0, 10)}.md`, liveCopyText(a)); setSaved(true); }
    window.setTimeout(() => setSaved(false), 1600);
  };
  const copy = async () => {
    try {
      // Live Research answers are copied with their numbered sources, so the citations still mean something when pasted.
      await navigator.clipboard.writeText(live ? liveCopyText(a) : a.markdown);
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
      <div className={s.footActions} data-o="KeplarTurn footActions">
        {/* Quiet kit IconButtons; the name is the tooltip, and a longer note (what a vote does) is the tooltip of its own. */}
        <IconButton size="sm" className={s.footAct} onClick={copy} label={copied ? "Copied answer" : "Copy answer"} icon={<MorphIcon icon="copy" state={copied ? "copied" : "idle"} size={15} />} />
        {onSignal ? (
          <>
            <Tooltip content="Good answer. This helps Keplar choose better next time (the models themselves are not retrained).">
              <IconButton size="sm" className={s.footAct} tooltip={false} pressed={vote === "up"} onClick={() => { setVote("up"); onSignal("up"); }} label="Good answer" icon={<IconThumb size={15} up />} />
            </Tooltip>
            <Tooltip content="Not a good answer. This helps Keplar choose better next time (the models themselves are not retrained).">
              <IconButton size="sm" className={s.footAct} tooltip={false} pressed={vote === "down"} onClick={() => { setVote("down"); onSignal("down"); }} label="Not a good answer" icon={<IconThumb size={15} />} />
            </Tooltip>
          </>
        ) : null}
        <ListenButton id={a.id} markdown={a.markdown} isLast={isLast} className={s.footAct} />
        {live ? (
          <Tooltip content="Save the answer with its sources">
            <IconButton size="sm" className={s.footAct} tooltip={false} onClick={() => void save()} label={saved ? "Saved research" : "Save research with its sources"} icon={saved ? <IconCheck size={15} /> : <IconSave size={15} />} />
          </Tooltip>
        ) : null}
        {live && isLast && onRefreshResearch ? (
          <Tooltip content="Research again, reading every page afresh">
            <IconButton size="sm" className={s.footAct} tooltip={false} onClick={() => { growthTrack("answer_action", { action: "retry" }); onRefreshResearch(); }} label="Refresh research" icon={<IconWeb size={15} />} />
          </Tooltip>
        ) : null}
        <ShareAnswer answer={a} triggerClass={s.footAct} />
        <ReportAnswer answerId={a.id} excerpt={a.markdown} triggerClass={s.footAct} />
        {isLast ? (
          <IconButton size="sm" className={s.footAct} onClick={() => { growthTrack("answer_action", { action: "retry" }); onRetry(); }} label="Ask again" icon={<IconRetry size={15} />} />
        ) : null}
      </div>
    </footer>
  );
}

const slotLabel = { panel: "Panel", verifier: "Verifier", judge: "Judge" } as const;
const statusLabel = { responded: "Responded", failed: "No response", refused: "Declined", "not-needed": "Not needed" } as const;

/**
 * The one-line summary on the "How Keplar answered" row: who answered and what is inside, in plain words
 * ("3 of 3 models · agreed · 4 sources"), so the row says something useful before anyone opens it.
 */
export function howMeta(a: KeplarAnswer): string {
  const c = a.consensus;
  const who = c.level === "single" ? a.models.find((m) => m.status === "responded")?.name ?? "1 model" : `${c.responded} of ${c.consulted} models`;
  const agreement = c.level === "consensus" ? "agreed" : c.level === "partial" ? "mostly agreed" : c.level === "none" ? "no majority" : null;
  const sources = a.sources.length ? `${a.sources.length} source${a.sources.length === 1 ? "" : "s"}` : null;
  const split = a.disagreements.length ? `${a.disagreements.length} disagreement${a.disagreements.length === 1 ? "" : "s"}` : null;
  return [who, agreement, split, sources].filter(Boolean).join(" · ");
}

function Answer({ answer: a, onRetry, onRefreshResearch, onSignal, isLast, continued, quizProgress, onQuizProgress, onAsk }: { answer: KeplarAnswer; onRetry: () => void; onRefreshResearch?: () => void; onSignal?: (kind: "up" | "down" | "copy") => void; isLast: boolean; continued?: boolean; quizProgress?: QuizProgress; onQuizProgress?: (progress: QuizProgress) => void; onAsk?: (text: string) => void }) {
  const uid = useId();
  const [open, setOpen] = useState<string | null>(null);
  // The detail rows (consensus, models, sources, disagreements, verification, reasoning) sit behind one row: the answer leads,
  // the working is one click away. Opening a section from elsewhere (the comparison's "Open the full comparison") opens this too.
  const [howOpen, setHowOpen] = useState(false);
  const [dissentOpen, setDissentOpen] = useState(false);
  const c = a.consensus;
  const dissenters = c.level === "consensus" || c.level === "partial" ? consensusSides(a.models, c).dissent : [];
  const checkedOnWeb = a.sourcing?.state === "checked" || a.sourcing?.state === "no_sources";
  const toggle = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    if (next && (id === "consensus" || id === "models" || id === "disagreements" || id === "verification" || id === "reasoning")) growthTrack("answer_action", { action: `open_${id}` as AnswerAction });
  };
  const modelStatus = summarizeModels(a.models);

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
              <span className={s.modelName}>{m.name}</span>
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
    <article className={s.answer} data-o="KeplarTurn answer" aria-labelledby={`${uid}-title`} data-level={c.level} data-continued={continued || undefined} data-last={isLast || undefined}>
      <header className={s.answerHead}>
        <AnswerBrand id={`${uid}-title`} models={a.models} />
        <div className={s.headSide}>
          <ConsensusBadge c={c} models={a.models} />
          {dissenters.length ? (
            <button type="button" className={s.viewDissent} aria-expanded={dissentOpen} aria-controls={`${uid}-dissent`} onClick={() => setDissentOpen((v) => !v)}>
              {dissentOpen ? "Hide Disagrees" : "View Disagrees"}
            </button>
          ) : null}
        </div>
      </header>
      {dissentOpen && dissenters.length ? <DissentPanel id={`${uid}-dissent`} models={dissenters} disagreements={a.disagreements} onClose={() => setDissentOpen(false)} /> : null}

      {a.research ? <ResearchHead research={a.research} /> : null}
      {a.quiz ? <QuizCard quiz={a.quiz} progress={quizProgress} onProgress={onQuizProgress} onNew={onAsk} /> : <StructuredAnswer source={a.markdown} cite={citeRenderer(a.research?.sources)} rich={a.rich} consensus={a.consensus} />}

      {modelStatus.missing.length && c.level !== "single" ? (
        <p className={s.missingNote} role="note" data-missing-models={modelStatus.missing.length}>
          {modelStatus.missing.length === 1 ? "One model didn't answer." : `${modelStatus.missing.length} models didn't answer.`}
          {isLast ? (
            <>
              {" "}
              <button type="button" className={s.splitLink} onClick={onRetry}>Retry</button>
            </>
          ) : null}
        </p>
      ) : null}

      {a.research ? <ResearchSources research={a.research} /> : null}
      {a.research?.live ? <LiveChecks live={a.research.live} /> : a.research?.check ? <ResearchChecks check={a.research.check} /> : null}
      {a.sourcing ? <SourceChecks sourcing={a.sourcing} /> : null}

      <div className={s.how} data-open={howOpen || undefined}>
        <button
          type="button"
          className={s.howBtn}
          aria-expanded={howOpen}
          aria-controls={`${uid}-how`}
          onClick={() => { const next = !howOpen; setHowOpen(next); if (next) growthTrack("answer_action", { action: "open_how" }); }}
          data-section="how"
        >
          <span className={s.sectionTitle}>How Keplar answered</span>
          <span className={s.sectionMeta}>{howMeta(a)}</span>
          <span className={s.chev} data-open={howOpen || undefined} aria-hidden="true"><IconChevron size={12} /></span>
        </button>
      <ul id={`${uid}-how`} className={s.sections} hidden={!howOpen}>
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
      </div>

      <AnswerFooter answer={a} onRetry={onRetry} onRefreshResearch={onRefreshResearch} onSignal={onSignal} isLast={isLast} meta={<span className={s.compute}>{brand.usage} · {computeLevelLabel[a.compute.level]}</span>} />
    </article>
  );
}
