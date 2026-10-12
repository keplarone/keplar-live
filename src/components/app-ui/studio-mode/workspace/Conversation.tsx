"use client";
/**
 * The Solar conversation: the run's feed (useStudioAgent `items`) on the design system. The person's messages, Keplar's
 * replies (a numbered plan renders as a checklist with live step states), the look Keplar takes before each request, notes
 * and warnings from the run loop, and one row per action with its risk, where it stands in the approval flow, Approve / Skip
 * while it waits, and "View code" for actions that have a code document. A thinking line shows only while the model is
 * really working. Empty: one line and idea chips that fill the composer (draft.ts); nothing is sent until Build.
 *
 * Approvals keep the run loop's rules exactly: reads run by themselves; changes wait unless auto-approve is on; destructive
 * steps and reverts always wait. Here: Enter never approves a destructive step (click or Space), "Approve all safe" never
 * includes a destructive step or a revert, and nothing takes focus by itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { describeAction, type Item, type PlanStep, type useStudioAgent } from "../useStudioAgent";
import { ActivityIndicator, Badge, Button, Icon, StatusDot, Switch, srOnly, useReducedMotion } from "../ui";
import {
  IDEAS,
  RISK_LABEL,
  STAGE_LABEL,
  actionDot,
  appName,
  approvalStage,
  approvals,
  codeActionKeys,
  inlineCode,
  planStates,
  safeWaiting,
  splitPlan,
  thinking,
  thinkingLabel,
  uploadUrls,
  type ActionItem,
  type Env,
} from "./conversation-model";
import { offerDraft } from "./draft";
import s from "./conversation.module.css";

type Agent = ReturnType<typeof useStudioAgent>;

export type ConversationProps = {
  a: Agent;
  env: Env;
  /** The overlay's single content area: tighter rows, no risk badges on reads. */
  compact?: boolean;
  /** Opens the code document of an action (the inspector's Code tab, or the overlay's Code view). */
  onOpenCode?: (actionKey: string) => void;
};

const RISK_TONE = { read: "neutral", change: "neutral", destructive: "danger" } as const;

/** Distance from the bottom (px) within which the feed keeps following new rows. */
const STICK_PX = 56;

export function Conversation({ a, env, compact = false, onOpenCode }: ConversationProps) {
  const feedRef = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  const reduced = useReducedMotion();
  const think = thinking(a);
  const granted = useMemo(() => approvals(a.events), [a.events]);
  const withCode = useMemo(() => codeActionKeys(a.code), [a.code]);
  const safe = safeWaiting(a.items);

  // Rows that just arrived enter with a short rise; a restored session (many rows at once) appears as is.
  const [prevItems, setPrevItems] = useState(a.items);
  const [entering, setEntering] = useState<ReadonlySet<string>>(() => new Set());
  if (prevItems !== a.items) {
    const old = new Set(prevItems.map((x) => x.key));
    const fresh = a.items.filter((x) => !old.has(x.key)).map((x) => x.key);
    setPrevItems(a.items);
    if (fresh.length) setEntering(new Set(prevItems.length && fresh.length <= 3 ? fresh : []));
  }

  // Follow the newest row unless the person scrolled up to read; sending a message always brings the feed back down.
  const last = a.items[a.items.length - 1];
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (last?.kind === "user") stick.current = true;
    if (stick.current) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [a.items, last, think, reduced]);
  const onScroll = useCallback(() => {
    const el = feedRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  }, []);

  return (
    <section className={s.conversation} data-compact={compact || undefined} aria-label={`Build with Keplar in ${appName(env)}`}>
      <ol ref={feedRef} className={s.feed} aria-live="polite" onScroll={onScroll}>
        {a.items.length === 0 ? <Empty env={env} /> : null}
        {a.items.map((it) => (
          <Row key={it.key} it={it} env={env} compact={compact} enter={entering.has(it.key)} plan={a.plan}
            auto={granted.get(it.key) === "auto-approve"} hasCode={withCode.has(it.key)}
            onDecide={a.decide} onOpenCode={onOpenCode} />
        ))}
        {think ? (
          <li className={s.thinking} aria-label={thinkingLabel(think, env)} data-enter="">
            <ActivityIndicator label="" size={12} />
            <span>{think === "looking" ? (env === "blender" ? "Reading the scene" : "Looking at your place") : "Thinking"}</span>
          </li>
        ) : null}
      </ol>

      {a.pending ? (
        <div className={s.approvalBar} role="region" aria-label="Approvals">
          <StatusDot status="warning" label={`${a.pending} waiting for you`} />
          <span className={s.grow} />
          {/* The full page has this switch in the composer; the overlay's compact composer has no room for it. */}
          {compact ? <Switch checked={a.autoApprove} onCheckedChange={a.setAuto} label="Auto-approve safe" /> : null}
          {safe.length > 1 ? (
            <Button size="sm" variant="secondary" onClick={() => { for (const x of safe) a.decide(x.key, true); }}>
              Approve all safe ({safe.length})
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Empty({ env }: { env: Env }) {
  return (
    <li className={s.empty}>
      <strong className={s.emptyTitle}>{env === "blender" ? "What should we make?" : "What should we build?"}</strong>
      <span className={s.emptyHint}>
        {env === "blender"
          ? "Keplar reads your scene, plans, then models it. Attach images to match a look."
          : "Keplar looks at your place, plans, then builds. Attach screenshots or a clip to match."}
      </span>
      <span className={s.ideas} role="group" aria-label="Ideas to start from">
        {IDEAS[env].map((idea) => (
          <button key={idea} type="button" className={s.idea} onClick={() => offerDraft(env, idea)}>{idea}</button>
        ))}
      </span>
    </li>
  );
}

type RowProps = {
  it: Item;
  env: Env;
  compact: boolean;
  enter: boolean;
  plan: readonly PlanStep[];
  auto: boolean;
  hasCode: boolean;
  onDecide: (key: string, ok: boolean) => void;
  onOpenCode?: (actionKey: string) => void;
};

function Row({ it, env, compact, enter, plan, auto, hasCode, onDecide, onOpenCode }: RowProps) {
  const e = enter ? "" : undefined;
  switch (it.kind) {
    case "user":
      return (
        <li className={s.user} data-enter={e}>
          {it.text ? <p className={s.text}>{it.text}</p> : null}
          {it.images.length ? (
            <span className={s.refs}>
              {it.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- a local reference preview (data URL)
                <img key={i} src={src} alt={`Reference ${i + 1}`} />
              ))}
            </span>
          ) : null}
        </li>
      );
    case "keplar":
      return (
        <li className={s.keplar} data-enter={e}>
          {splitPlan(it.text).map((part, i) =>
            part.type === "text" ? <p key={i} className={s.text}>{part.text}</p> : <PlanList key={i} steps={part.steps} plan={plan} />,
          )}
        </li>
      );
    case "look":
      return (
        <li className={s.look} data-enter={e}>
          {it.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio
            <img className={s.lookShot} src={it.image} alt="What Keplar saw in Studio" />
          ) : <span className={s.lookIcon}><Icon name={env === "blender" ? "cube" : "eye"} size={14} /></span>}
          <span className={s.lookText}>
            <strong>{env === "blender" ? "Read the scene" : "Looked at your place"}</strong>
            <span>{it.text}</span>
          </span>
        </li>
      );
    case "note": {
      const yourTurn = it.text.startsWith("Your turn");
      return (
        <li className={s.note} data-tone={it.tone ?? (yourTurn ? "turn" : undefined)} data-enter={e} role={it.tone === "warn" ? "status" : undefined}>
          <Icon name={it.tone === "warn" ? "warning" : yourTurn ? "arrow-right" : "info"} size={14} />
          <span className={s.text}>{it.text}</span>
        </li>
      );
    }
    case "action":
      return <ActionRow it={it} compact={compact} enter={enter} auto={auto} hasCode={hasCode} onDecide={onDecide} onOpenCode={onOpenCode} />;
  }
}

function PlanList({ steps, plan }: { steps: string[]; plan: readonly PlanStep[] }) {
  const states = planStates(steps, plan);
  const done = states ? states.filter((x) => x === "done").length : 0;
  return (
    <div className={s.plan}>
      <span className={s.planHead}>
        <Icon name="plan" size={14} />
        Plan
        {states ? <span className={s.planCount}>{done} of {steps.length}</span> : null}
      </span>
      <ol className={s.planSteps}>
        {steps.map((step, i) => {
          const st = states?.[i];
          return (
            <li key={i} data-state={st}>
              <span className={s.planMark} aria-hidden="true">
                {st === "done" ? <Icon name="check" size={12} /> : <span>{i + 1}</span>}
              </span>
              <span className={s.planText}>{step}</span>
              {st === "doing" ? <span className={s.planNow}>Now</span> : null}
              {st === "done" ? <span className={srOnly}> (done)</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ActionRow({ it, compact, enter, auto, hasCode, onDecide, onOpenCode }: { it: ActionItem; compact: boolean; enter: boolean; auto: boolean; hasCode: boolean; onDecide: (key: string, ok: boolean) => void; onOpenCode?: (actionKey: string) => void }) {
  const stage = approvalStage(it);
  const destructive = it.risk === "destructive";
  const waiting = it.status === "waiting";
  const code = inlineCode(it);
  const uploads = uploadUrls(it);
  const [showCode, setShowCode] = useState(false);
  const canView = hasCode && Boolean(onOpenCode);
  const title = describeAction(it.name, it.args);
  // A destructive step is approved by a deliberate press (click or Space), never by Enter from the keyboard.
  const guardEnter = (e: KeyboardEvent<HTMLButtonElement>) => { if (destructive && e.key === "Enter") e.preventDefault(); };
  return (
    <li className={s.action} data-status={it.status} data-risk={it.risk} data-enter={enter ? "" : undefined}>
      <div className={s.actionLine}>
        <StatusDot status={actionDot(it.status)} label={STAGE_LABEL[stage]} hideLabel />
        <span className={s.actionTitle}>{title}</span>
        <span className={s.actionMeta}>
          {it.origin ? <Badge variant="outline">{it.origin === "revert" ? "Revert" : "Retry"}</Badge> : null}
          {compact && it.risk === "read" ? null : <Badge tone={RISK_TONE[it.risk]} variant={destructive ? "subtle" : "outline"}>{RISK_LABEL[it.risk]}</Badge>}
          <span className={s.stage} data-stage={stage}>{STAGE_LABEL[stage]}{auto && it.status !== "waiting" ? " · auto" : ""}</span>
          {canView ? (
            <Button size="sm" variant="ghost" leadingIcon={<Icon name="code" size={14} />} onClick={() => onOpenCode?.(it.key)} aria-label={`View code: ${title}`}>
              {compact ? "Code" : "View code"}
            </Button>
          ) : null}
        </span>
      </div>

      {/* A read's raw result belongs to Activity; the row keeps what changed and every failure. */}
      {it.summary && !waiting && (it.risk !== "read" || it.status === "failed") ? <p className={s.summary} data-failed={it.status === "failed" || undefined}>{it.summary}</p> : null}

      {uploads.length && waiting ? (
        <ul className={s.uploads} aria-label="Images to upload">
          {uploads.map((src) => (
            <li key={src}><a href={src} target="_blank" rel="noreferrer noopener" title={src}>{src.replace(/^https:\/\//, "")}</a></li>
          ))}
        </ul>
      ) : null}

      {/* Without a code view (no inspector here) the script can be read inline before approving. */}
      {code && waiting && !canView && showCode ? <pre className={s.code}>{code.slice(0, 4000)}</pre> : null}

      {it.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL from Studio, shown as is
        <img className={s.shot} src={it.image} alt="Studio screenshot" />
      ) : null}

      {waiting ? (
        <div className={s.decide}>
          <Button size="sm" variant={destructive ? "danger" : "primary"} onClick={() => onDecide(it.key, true)} onKeyDown={guardEnter}
            leadingIcon={<Icon name={destructive ? "warning" : "check"} size={14} />}>
            {destructive ? "Approve this change" : "Approve"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onDecide(it.key, false)}>Skip</Button>
          {code && !canView ? (
            <Button size="sm" variant="ghost" aria-expanded={showCode} onClick={() => setShowCode((v) => !v)}>{showCode ? "Hide script" : "See script"}</Button>
          ) : null}
          {destructive ? <span className={s.decideHint}>Can remove or overwrite work</span> : null}
        </div>
      ) : null}
    </li>
  );
}

