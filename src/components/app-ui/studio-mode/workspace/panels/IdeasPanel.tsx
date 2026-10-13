"use client";
/**
 * Game ideas (rendered inside the "Game ideas" dialog, Roblox Studio only). Three original, buildable Roblox game ideas per set
 * (server: src/lib/studio/ideas.ts), each tied to dated market signals from idea-market.ts. The evidence the page shows is
 * Keplar's own sourced data, never figures written by the model. "Build this" puts a build brief in the composer (draft.ts)
 * without sending it; Build stays the person's choice.
 */
import { useEffect, useId, useState } from "react";
import { IDEA_LIMITS, IDEA_SCOPES, ideaBuildPrompt, MARKET_AS_OF, MARKET_SIGNALS, MARKET_SOURCES, marketSignal, type GameIdea, type IdeaScope, type SignalKind } from "@/lib/studio/idea-market";
import { ActivityIndicator, Badge, Button, Icon, SegmentedControl, useToast } from "../../ui";
import { api } from "./panel-logic";
import s from "./panels.module.css";

const KIND_LABEL: Record<SignalKind, string> = { gap: "Gap", trend: "Trend", risk: "Risk" };
const KIND_TONE = { gap: "neutral", trend: "neutral", risk: "warning" } as const;

const asOf = new Date(`${MARKET_AS_OF}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export type IdeasPanelProps = { busy: boolean; onBuild: (prompt: string) => void };

export function IdeasPanel({ busy, onBuild }: IdeasPanelProps) {
  const [brief, setBrief] = useState("");
  const [scope, setScope] = useState<IdeaScope>("weekend");
  const [ideas, setIdeas] = useState<GameIdea[] | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ceiling, setCeiling] = useState<number | null>(null);
  const [lastUnits, setLastUnits] = useState<number | null>(null);
  const toast = useToast();
  const briefId = useId();

  useEffect(() => {
    let live = true;
    void api<{ maxCredits: number | null }>("/api/studio/ideas").then((r) => { if (live) setCeiling(r.maxCredits); }).catch(() => { /* the cost line is left out */ });
    return () => { live = false; };
  }, []);

  const generate = async () => {
    setError(null);
    setWorking(true);
    try {
      const r = await api<{ ideas: GameIdea[]; units: number }>("/api/studio/ideas", { method: "POST", body: JSON.stringify({ brief, scope }) });
      setIdeas(r.ideas);
      setLastUnits(r.units);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Solar couldn't make ideas right now. Try again in a moment.");
    } finally {
      setWorking(false);
    }
  };

  const copy = async (idea: GameIdea) => {
    try {
      await navigator.clipboard.writeText(ideaBuildPrompt(idea));
      toast.show({ title: "Copied the build brief", tone: "success", duration: 2500 });
    } catch {
      toast.show({ title: "Couldn't copy. Select the text instead.", tone: "warning" });
    }
  };

  return (
    <div className={s.stack}>
      <form className={s.form} data-single="" aria-label="Game idea brief" onSubmit={(e) => { e.preventDefault(); void generate(); }}>
        <label className={s.field} htmlFor={briefId}>
          <span className={s.fieldLabel}>What are you into? (optional)</span>
          <textarea id={briefId} className={s.control} rows={2} value={brief} maxLength={IDEA_LIMITS.briefChars} onChange={(e) => setBrief(e.target.value)} placeholder="Horror, pets, racing, something my friends and I can play together…" />
        </label>
        <div className={s.row}>
          <SegmentedControl size="sm" label="Scope" value={scope} onValueChange={(v) => setScope(v as IdeaScope)} options={IDEA_SCOPES.map((o) => ({ value: o.value, label: o.label }))} />
          <Button variant="primary" type="submit" loading={working} disabled={busy}>{ideas ? "New ideas" : "Generate ideas"}</Button>
          {ceiling ? <span className={`${s.meta} ${s.num}`}>Up to {ceiling.toLocaleString()} credits a set</span> : null}
        </div>
      </form>

      {working ? <ActivityIndicator label={`Matching your brief against ${MARKET_SIGNALS.length} market signals`} showLabel /> : null}
      {error ? <p className={s.notice} data-tone="danger" role="alert"><Icon name="error" size={14} />{error}</p> : null}

      {ideas ? (
        <section className={s.stack} aria-label="Game ideas" aria-busy={working || undefined}>
          {lastUnits != null ? <p className={`${s.meta} ${s.num}`} role="status">{ideas.length} ideas · {lastUnits.toLocaleString()} credits used</p> : null}
          <ul className={s.list} data-bordered="">
            {ideas.map((idea, i) => (
              <li key={`${i}:${idea.title}`} className={s.idea}>
                <h3 className={s.ideaTitle}>{idea.title}</h3>
                <p className={s.line}>{idea.hook}</p>
                <ul className={s.signals} aria-label="Why now">
                  {idea.signals.map((id) => {
                    const sig = marketSignal(id);
                    if (!sig) return null;
                    return (
                      <li key={id} className={s.signal}>
                        <Badge tone={KIND_TONE[sig.kind]} variant="outline">{KIND_LABEL[sig.kind]}</Badge>
                        <span className={s.signalText}><span className={s.strong}>{sig.label}</span> · <span className={s.num}>{sig.stat}</span></span>
                      </li>
                    );
                  })}
                </ul>
                <dl className={s.facts}>
                  <dt>Core loop</dt><dd>{idea.coreLoop}</dd>
                  <dt>Twist</dt><dd>{idea.twist}</dd>
                  {idea.session ? <><dt>Session</dt><dd>{idea.session}</dd></> : null}
                  {idea.monetization ? <><dt>Earns from</dt><dd>{idea.monetization}</dd></> : null}
                  <dt>First build</dt><dd>{idea.firstBuild}</dd>
                </dl>
                <div className={s.row}>
                  <Button size="sm" variant="primary" leadingIcon={<Icon name="arrow-right" size={14} />} disabled={busy} onClick={() => onBuild(ideaBuildPrompt(idea))}>Build this</Button>
                  <Button size="sm" variant="ghost" leadingIcon={<Icon name="copy" size={14} />} onClick={() => void copy(idea)}>Copy brief</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={s.meta}>
        Market data from{" "}
        <a className={s.inlineLink} href={MARKET_SOURCES.genres.url} target="_blank" rel="noreferrer">genre</a> and{" "}
        <a className={s.inlineLink} href={MARKET_SOURCES.mechanics.url} target="_blank" rel="noreferrer">mechanics</a> reports by creation.dev, read {asOf}.
        Ideas are written by Solar and may resemble games that already exist, so search Roblox before you commit to one.
      </p>
    </div>
  );
}
