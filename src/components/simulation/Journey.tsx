"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { AGENT_DRAFT, AGENT_TASK, CHAPTERS, CHECKS, CREATE_BLOCKS, CREATE_CHECKLIST, CREATE_CHOICES, CREATE_IDEA, CREATE_UNDERSTOOD, FINAL, LANES, QUESTION, ROUTING, SPLIT } from "./script";
import s from "./journey.module.css";

const N = CHAPTERS.length;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** 0 before a, 1 after b, linear between */
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
/** Typed prefix of `text` at progress t; the rest is kept (invisible) so the box never changes size while typing. */
function Typed({ text, t, caret = true }: { text: string; t: number; caret?: boolean }) {
  const n = Math.round(text.length * t);
  return (
    <>
      <span>{text.slice(0, n)}</span>
      {caret && t > 0 && t < 1 ? <i className={s.caret} aria-hidden="true" /> : null}
      <span className={s.pending} aria-hidden="true">{text.slice(n)}</span>
    </>
  );
}
function Streamed({ text, t, mark, hi }: { text: string; t: number; mark?: string; hi?: boolean }) {
  const words = text.split(" ");
  const k = Math.round(words.length * t);
  const shown = words.slice(0, k).join(" ");
  const rest = words.slice(k).join(" ");
  const full = t >= 1;
  if (full && mark && hi && text.includes(mark)) {
    const [a, b] = text.split(mark);
    return <>{a}<mark className={s.mark}>{mark}</mark>{b}</>;
  }
  return (
    <>
      <span>{shown}</span>
      {!full && t > 0 ? <i className={s.caret} aria-hidden="true" /> : null}
      <span className={s.pending} aria-hidden="true">{rest ? " " + rest : ""}</span>
    </>
  );
}


export function Journey() {
  const wrap = useRef<HTMLDivElement>(null);
  const [f, setF] = useState(0); // 0..N: chapter index plus progress inside it
  const fRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(false);
  const lastSet = useRef(-1);
  const reduced = useRef(false);
  const [approved, setApproved] = useState<null | "approve" | "decline" | "edit">(null);
  const [choice, setChoice] = useState<number | null>(null);

  const total = useCallback(() => {
    const w = wrap.current;
    return w ? Math.max(1, w.offsetHeight - window.innerHeight) : 1;
  }, []);
  const top = useCallback(() => {
    const w = wrap.current;
    return w ? w.getBoundingClientRect().top + window.scrollY : 0;
  }, []);

  // scroll position is the single source of truth: progress follows it
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const read = () => {
      raf = 0;
      const p = clamp((window.scrollY - top()) / total());
      const v = p * N * 0.99999;
      fRef.current = v;
      setF(v);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, [top, total]);

  const goTo = useCallback((i: number) => {
    const idx = clamp(i, 0, N - 1);
    // land a little inside the chapter so its first state is showing
    const y = top() + ((idx + 0.02) / (N * 0.99999)) * total();
    window.scrollTo({ top: y, behavior: reduced.current ? "auto" : "smooth" });
  }, [top, total]);

  const pause = useCallback(() => { playRef.current = false; setPlaying(false); }, []);
  const play = useCallback(() => {
    if (fRef.current > N - 0.35) window.scrollTo({ top: top(), behavior: "auto" });
    playRef.current = true;
    setPlaying(true);
    lastSet.current = -1;
  }, [top]);

  // auto-play: scroll forward at a steady pace; any scroll the user makes themselves pauses it
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    let y = window.scrollY;
    const tick = (now: number) => {
      raf = 0;
      if (!playRef.current) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (lastSet.current >= 0 && Math.abs(window.scrollY - lastSet.current) > 6) { pause(); return; } // the user scrolled
      const speed = Math.max(60, (total() / N) / 8.5); // about 8.5 seconds per chapter
      y = Math.min(top() + total(), Math.max(y, window.scrollY) + speed * dt);
      window.scrollTo(0, y);
      lastSet.current = window.scrollY;
      if (y >= top() + total() - 2) { pause(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [playing, pause, top, total]);

  // start by itself shortly after the page opens (unless the visitor prefers reduced motion)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => { if (window.scrollY < 40) play(); }, 1600);
    return () => clearTimeout(t);
  }, [play]);

  const chapter = Math.min(N - 1, Math.floor(f));
  const p = f - chapter;
  const step = useCallback((d: number) => { pause(); goTo(Math.floor(fRef.current) + d); }, [goTo, pause]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Space / Enter keep their normal meaning on a focused button or link; the arrow keys always step
      if (e.key === " ") {
        if (t && t.closest("button, a")) return; e.preventDefault(); if (playRef.current) pause(); else play(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "Home") { e.preventDefault(); pause(); goTo(0); }
      else if (e.key === "End") { e.preventDefault(); pause(); goTo(N - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, play, step, goTo]);
  // reading or touching the page yourself also pauses the tour
  useEffect(() => {
    const stop = () => { if (playRef.current) pause(); };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    return () => { window.removeEventListener("wheel", stop); window.removeEventListener("touchstart", stop); };
  }, [pause]);

  const id = CHAPTERS[chapter].id;
  const lanesView = (t0: number, t1: number, o: { hi?: boolean; dim?: boolean } = {}) => (
    <div className={s.lanes}>
      {LANES.map((l, i) => {
        const t = seg(p, t0 + i * 0.05, t1);
        const odd = l.leans === "fine";
        return (
          <article key={l.name} className={s.lane} data-odd={o.hi && odd ? "1" : "0"} data-dim={o.dim && !odd ? "1" : "0"} style={{ opacity: 0.35 + 0.65 * seg(p, t0 - 0.2 + i * 0.04, t0 + i * 0.04) }}>
            <h3>{l.name}</h3>
            <p><Streamed text={l.text} t={t} mark={l.mark} hi={o.hi} /></p>
          </article>
        );
      })}
    </div>
  );

  return (
    <div ref={wrap} className={s.wrap} style={{ ["--n" as string]: N }} data-testid="simulation" data-chapter={id} data-playing={playing ? "1" : "0"}>
      <div className={s.stage}>
        <p className={s.banner} role="note"><strong>SIMULATION</strong><span>Pre-written sample. No model is called, nothing is measured.</span></p>

        <div className={s.slide} key={id === "create" || id === "agent" ? id : "x"}>
          {id === "intro" && (
            <div className={s.center} style={{ opacity: 1 - seg(p, 0.7, 1) }}>
              <p className={s.eyebrow} data-o="journey eyebrow">A guided walkthrough</p>
              <h1 className={s.h1}>Watch one question become one answer.</h1>
              <p className={s.lede}>One everyday question, several models, a disagreement, a check, and a single answer. Then an idea becoming a site, and an agent that waits for your approval.</p>
              <p className={s.hint}>It plays by itself. Scroll, or use the controls, to go at your own pace.</p>
            </div>
          )}
          {id === "ask" && (
            <div className={s.center}>
              <p className={s.eyebrow} data-o="journey eyebrow">1 · You ask once</p>
              <div className={s.ask}><Typed text={QUESTION} t={seg(p, 0.08, 0.7)} /></div>
              <p className={s.lede} style={{ opacity: seg(p, 0.75, 0.95) }}>In plain words, the way you would ask a person.</p>
            </div>
          )}
          {id === "route" && (
            <div className={s.col}>
              <p className={s.eyebrow} data-o="journey eyebrow">2 · Keplar chooses who to ask</p>
              <div className={s.askSm}>{QUESTION}</div>
              <p className={s.note} style={{ opacity: seg(p, 0.1, 0.35) }}>{ROUTING}</p>
              <div className={s.lanes}>
                {LANES.map((l, i) => (
                  <article key={l.name} className={s.lane} style={{ opacity: seg(p, 0.25 + i * 0.1, 0.4 + i * 0.1), transform: `translateY(${(1 - seg(p, 0.25 + i * 0.1, 0.4 + i * 0.1)) * 14}px)` }}>
                    <h3>{l.name}</h3>
                    <p className={s.dimText}>Asked</p>
                  </article>
                ))}
              </div>
            </div>
          )}
          {id === "answer" && (
            <div className={s.col}>
              <p className={s.eyebrow} data-o="journey eyebrow">3 · The answers arrive, side by side</p>
              {lanesView(0.05, 0.85)}
            </div>
          )}
          {id === "split" && (
            <div className={s.col}>
              <p className={s.eyebrow} data-o="journey eyebrow">4 · Where they disagree</p>
              <h2 className={s.h2}>{SPLIT.agree} of {SPLIT.total} agree</h2>
              {lanesView(-0.4, 0.01, { hi: true })}
              <p className={s.note} style={{ opacity: seg(p, 0.3, 0.55) }}>{SPLIT.summary} Keplar does not average them. It checks.</p>
            </div>
          )}
          {id === "verify" && (
            <div className={s.col}>
              <p className={s.eyebrow} data-o="journey eyebrow">5 · The disputed point is checked</p>
              <div className={s.verify}>
                <div className={s.claim}><span>Disputed claim</span><p>“Covered is fine.”</p></div>
                <ol className={s.checks}>
                  {CHECKS.map((c, i) => {
                    const t = seg(p, 0.1 + i * 0.2, 0.25 + i * 0.2);
                    return <li key={c} data-on={t >= 1 ? "1" : "0"} style={{ opacity: 0.35 + 0.65 * t }}><b aria-hidden="true">{t >= 1 ? "✓" : "·"}</b>{c}</li>;
                  })}
                </ol>
              </div>
              <p className={s.note} style={{ opacity: seg(p, 0.85, 1) }}>Scripted check. In the real app the source is shown with the answer.</p>
            </div>
          )}
          {id === "final" && (
            <div className={s.col}>
              <p className={s.eyebrow} data-o="journey eyebrow">6 · One answer</p>
              <div className={s.final} style={{ opacity: 0.2 + 0.8 * seg(p, 0, 0.25), transform: `translateY(${(1 - seg(p, 0, 0.25)) * 16}px)` }}>
                <h2 className={s.h2}><Typed text={FINAL.title} t={seg(p, 0.1, 0.4)} caret={false} /></h2>
                <p className={s.body} style={{ opacity: seg(p, 0.4, 0.6) }}>{FINAL.body}</p>
                <div className={s.split2} style={{ opacity: seg(p, 0.6, 0.8) }}>
                  <p><b>Agreed</b>{FINAL.agreed}</p>
                  <p><b>Differed</b>{FINAL.differed}</p>
                </div>
              </div>
            </div>
          )}
          {id === "create" && (
            <div className={s.col}>
              <p className={s.eyebrow} data-o="journey eyebrow">Create · from idea to site</p>
              <div className={s.createGrid}>
                <div className={s.chat}>
                  <div className={s.ask}><Typed text={CREATE_IDEA} t={seg(p, 0.02, 0.2)} /></div>
                  <div className={s.understand} style={{ opacity: seg(p, 0.2, 0.3) }}>
                    <h3>Understanding your idea</h3>
                    <dl>
                      {CREATE_UNDERSTOOD.map((u, i) => (<div key={u.k} style={{ opacity: seg(p, 0.22 + i * 0.05, 0.3 + i * 0.05) }}><dt>{u.k}</dt><dd>{u.v}</dd></div>))}
                    </dl>
                    <div className={s.choices} role="group" aria-label="Style direction (sample)" style={{ opacity: seg(p, 0.38, 0.46) }}>
                      {CREATE_CHOICES.map((c, i) => (
                        <button key={c} type="button" className={s.pill} aria-pressed={(choice ?? (p > 0.5 ? 0 : -1)) === i} onClick={() => { pause(); setChoice(i); }}>{c}</button>
                      ))}
                      <span className={s.skip}>Skip anytime</span>
                    </div>
                  </div>
                </div>
                <div className={s.browser} aria-label="Sample site being built">
                  <div className={s.bar}><i /><i /><i /></div>
                  <div className={s.blocks}>
                    {CREATE_BLOCKS.map((b, i) => {
                      const t = seg(p, 0.5 + i * 0.08, 0.6 + i * 0.08);
                      return (<div key={b.name} className={s.block} style={{ opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}><b>{b.name}</b><span>{b.note}</span></div>);
                    })}
                  </div>
                  <ul className={s.req} style={{ opacity: seg(p, 0.85, 0.95) }} aria-label="Requested versus built">
                    {CREATE_CHECKLIST.map((c) => (<li key={c.ask}><b aria-hidden="true">✓</b><span>{c.ask}</span><em>{c.built}</em></li>))}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {id === "agent" && (
            <div className={s.col}>
              <p className={s.eyebrow} data-o="journey eyebrow">Agents · they ask before they act</p>
              <div className={s.ask}><Typed text={AGENT_TASK} t={seg(p, 0.02, 0.25)} /></div>
              <p className={s.note} style={{ opacity: seg(p, 0.3, 0.4) }}>Plan: write the order from your usual quantities, then send it from your connected email, after you approve.</p>
              <div className={s.mail} style={{ opacity: seg(p, 0.4, 0.55), transform: `translateY(${(1 - seg(p, 0.4, 0.55)) * 12}px)` }}>
                <p><b>To</b>{AGENT_DRAFT.to}</p>
                <p><b>Subject</b>{AGENT_DRAFT.subject}</p>
                <p className={s.mailBody}>{AGENT_DRAFT.body}</p>
              </div>
              <div className={s.approval} style={{ opacity: seg(p, 0.6, 0.75), pointerEvents: p > 0.6 ? "auto" : "none" }} data-testid="approval">
                <p className={s.needs}>Needs your approval</p>
                <div className={s.row}>
                  <button type="button" className={s.btn} onClick={() => { pause(); setApproved("approve"); }}>Approve and send</button>
                  <button type="button" className={s.ghost} onClick={() => { pause(); setApproved("edit"); }}>Edit first</button>
                  <button type="button" className={s.ghost} onClick={() => { pause(); setApproved("decline"); }}>Decline</button>
                </div>
                <p className={s.result} role="status" aria-live="polite">
                  {approved === "approve" ? "Simulation: nothing was sent. In Keplar, approving sends it through your connected email, and only then." : approved === "edit" ? "Simulation: you would edit the draft here, and nothing is sent until you approve." : approved === "decline" ? "Declined. In Keplar, nothing is sent and the run is recorded as declined." : "Nothing is sent until you choose."}
                </p>
              </div>
            </div>
          )}
          {id === "end" && (
            <div className={s.center}>
              <p className={s.eyebrow} data-o="journey eyebrow">That was a simulation</p>
              <h2 className={s.h1}>Now ask your own question.</h2>
              <p className={s.lede}>The real Keplar asks real models, shows you where they disagree, and checks before it answers. It can be wrong, so check what matters.</p>
              <div className={s.row}>
                <ButtonLink href="/app" size="lg">Try Keplar</ButtonLink>
                <button type="button" className={s.ghost} onClick={() => { goTo(0); window.setTimeout(play, 700); }}>Replay</button>
              </div>
            </div>
          )}
        </div>

        <div className={s.controls} role="group" aria-label="Walkthrough controls">
          <button type="button" className={s.ghost} onClick={() => step(-1)} disabled={chapter === 0}>Back</button>
          <button type="button" className={s.btn} onClick={() => (playing ? pause() : play())} aria-pressed={playing}>{playing ? "Pause" : f > N - 0.35 ? "Replay" : "Play"}</button>
          <button type="button" className={s.ghost} onClick={() => step(1)} aria-label="Next step" disabled={chapter >= N - 1}>Next</button>
          <ol className={s.dots} aria-label="Chapters">
            {CHAPTERS.map((c, i) => (
              <li key={c.id}><button type="button" onClick={() => { pause(); goTo(i); }} aria-label={`Go to ${c.label}`} aria-current={i === chapter ? "step" : undefined} data-done={i < chapter ? "1" : "0"}><span>{c.label}</span></button></li>
            ))}
          </ol>
        </div>
        <div className={s.progress} aria-hidden="true"><span style={{ transform: `scaleX(${clamp(f / N)})` }} /></div>
      </div>
    </div>
  );
}
