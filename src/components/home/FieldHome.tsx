"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ACTS, actOn, fieldState, type ActId } from "@/field/path";
import { probeCaps } from "@/field/caps";
import { fxDebug, fxDebugClear } from "@/field/debug";
import { resolveTier } from "@/lib/spatial/policy";
import { convergenceCopy, disagreementCopy, distributionCopy, questionCopy, responsesCopy, verificationCopy } from "@/lib/narrative";
import { tryHref } from "@/lib/site";
import { FieldFigure } from "./FieldFigure";
import s from "./FieldHome.module.css";

/** Field progress at which this section begins (the "hero" act lives in OrbHero). */
const STORY_FROM = 0.16;

type Mode = "pending" | "webgl" | "static";

const RAIL_LABELS: Record<ActId, string> = {
  hero: "Start",
  question: "Question",
  distribution: "Routing",
  responses: "Responses",
  disagreement: "Disagreement",
  verification: "Verification",
  convergence: "Answer",
};

/** The closing prompt: same hand-off, shown at the end of the story. */
function Handoff() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <form
      className={`${s.handoff} lg lg-strong`}
      onSubmit={(e) => {
        e.preventDefault();
        const text = (ref.current?.value ?? "").trim().slice(0, 600);
        window.location.href = text ? `${tryHref}#q=${encodeURIComponent(text)}` : tryHref;
      }}
    >
      <label htmlFor="field-q" className="visually-hidden">Your question</label>
      <input ref={ref} id="field-q" className={`${s.handoffInput} type-input`} placeholder={questionCopy.prompt} maxLength={600} autoComplete="off" enterKeyHint="go" />
      <button type="submit" className={s.handoffGo}>Ask Keplar</button>
    </form>
  );
}

export function FieldHome() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("pending");
  const [ready, setReady] = useState(false);
  const [act, setAct] = useState<ActId>("hero");
  const [form, setForm] = useState<"desktop" | "mobile">("desktop");
  const [nonce, setNonce] = useState(0); // bumped when the GPU context is lost for good: a fresh canvas and renderer

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const sync = () => setForm(mq.matches ? "mobile" : "desktop");
    const id = window.setTimeout(sync, 0);
    mq.addEventListener("change", sync);
    return () => {
      window.clearTimeout(id);
      mq.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!section || !stage || !canvas) return;
    const caps = probeCaps();
    // QA hook: ?fq=low|medium|high forces a tier (software-GL screenshots, budget comparisons).
    const fq = new URLSearchParams(window.location.search).get("fq");
    // Never off, never frozen: weak devices / data saver / reduced motion only lower the tier or slow the drift.
    const tier = resolveTier("immersive", caps);
    const quality = fq === "low" || fq === "medium" || fq === "high" ? fq : tier.quality;
    const speed = tier.speed;
    fxDebug({ layer: "home", tier: quality, mode: "main", reason: tier.reason });
    let cancelled = false;
    let dispose = () => {};
    (async () => {
      let engine: typeof import("@/field/engine");
      try {
        engine = await import("@/field/engine");
      } catch {
        if (!cancelled) setMode("static");
        return;
      }
      if (cancelled) return;
      let field: InstanceType<typeof engine.ConvergenceField>;
      try {
        field = new engine.ConvergenceField({
          canvas,
          quality,
          speed,
          form,
          theme: "light",
          onFirstFrame: () => setReady(true),
          onStats: (st) => fxDebug({ layer: "home", fps: st.fps, dpr: st.dpr, count: st.count }),
          onLost: () => setNonce((n) => n + 1),
          onAnchors: (a) => {
            stage.style.setProperty("--ox", `${a.ox.toFixed(1)}px`);
            stage.style.setProperty("--oy", `${a.oy.toFixed(1)}px`);
            stage.style.setProperty("--fx", `${a.fx.toFixed(1)}px`);
            stage.style.setProperty("--fy", `${a.fy.toFixed(1)}px`);
            stage.style.setProperty("--ix", `${a.ix.toFixed(1)}px`);
            stage.style.setProperty("--iy", `${a.iy.toFixed(1)}px`);
            stage.style.setProperty("--bx", `${a.bx.toFixed(1)}px`);
          },
        });
      } catch {
        if (!cancelled) setMode("static");
        return;
      }
      setMode("webgl");
      const acts = new Map<ActId, HTMLElement>();
      section.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => acts.set(el.dataset.act as ActId, el));
      let lastAct: ActId = "hero";
      const update = () => {
        const r = section.getBoundingClientRect();
        const span = r.height - window.innerHeight;
        const raw = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
        const p = STORY_FROM + (1 - STORY_FROM) * raw; // the orb hero above is the first act; the story starts at the question
        field.setProgress(p);
        stage.style.setProperty("--tone", fieldState(p).dark.toFixed(3));
        stage.style.setProperty("--p", p.toFixed(3));
        for (const a of ACTS) {
          const el = acts.get(a.id);
          if (!el) continue;
          const on = actOn(a.id, p);
          el.style.setProperty("--on", on.toFixed(3));
          el.toggleAttribute("data-live", on > 0.5);
        }
        const cur = ACTS.find((a) => p >= a.from && p < a.to)?.id ?? "convergence";
        if (cur !== lastAct) {
          lastAct = cur;
          setAct(cur);
          window.dispatchEvent(new CustomEvent("keplar:act", { detail: { id: cur } }));
        }
      };
      update();
      const onScroll = () => update();
      window.addEventListener("scroll", onScroll, { passive: true });
      const ro = new ResizeObserver(() => {
        field.resize();
        update();
      });
      ro.observe(canvas);
      const io = new IntersectionObserver(([e]) => {
        field.setVisible(e.isIntersecting);
        if (e.isIntersecting && section.getBoundingClientRect().top <= window.innerHeight * 0.5) window.dispatchEvent(new CustomEvent("keplar:act", { detail: { id: lastAct === "hero" ? "question" : lastAct } }));
      }, { rootMargin: "20% 0px" });
      io.observe(section);
      const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      const onMove = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        field.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), true);
      };
      const onLeave = () => field.setPointer(0, 0, false);
      if (fine) {
        window.addEventListener("pointermove", onMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
      }
      field.start();
      dispose = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        ro.disconnect();
        io.disconnect();
        field.dispose();
      };
    })();
    return () => {
      cancelled = true;
      dispose();
      fxDebugClear("home");
      setReady(false);
    };
  }, [form, nonce]);

  return (
    <section ref={sectionRef} className={s.field} data-mode={mode} data-form={form} data-act-now={act} aria-label="Keplar">
      <span id="how" className={s.anchor} aria-hidden="true" />
      <div ref={stageRef} className={s.stage}>
        <div className={s.wash} aria-hidden="true" />

        <div className={s.art} aria-hidden="true">
          <FieldFigure upTo={mode === "static" ? 1 : 0.9} className={s.figureHero} />
          <canvas key={nonce} ref={canvasRef} className={s.canvas} data-ready={ready || undefined} aria-hidden="true" />
        </div>

        <div className={s.copy}>
          <div className={`${s.act} ${s.card} lg`} data-act="question">
            <p className={s.kicker}>{questionCopy.label}</p>
            <p className={s.promptBig}>{questionCopy.prompt}<i className={s.caret} aria-hidden="true" /></p>
            <p className={s.cap}>{questionCopy.caption}</p>
          </div>

          <div className={`${s.act} ${s.card} ${s.cardR} lg`} data-act="distribution">
            <p className={s.kicker}>{distributionCopy.label}</p>
            <h2 className={s.title}>{distributionCopy.title}</h2>
            <p className={s.body}>{distributionCopy.body}</p>
          </div>

          <div className={`${s.act} ${s.card} lg`} data-act="responses">
            <p className={s.kicker}>{responsesCopy.label}</p>
            <h2 className={s.title}>{responsesCopy.title}</h2>
            <p className={s.body}>{responsesCopy.body}</p>
          </div>

          <div className={`${s.act} ${s.card} ${s.cardR} lg`} data-act="disagreement">
            <p className={s.kicker} data-k="disagree">{disagreementCopy.detected}</p>
            <h2 className={s.huge}>
              <span>{disagreementCopy.agree}</span>
              <span className={s.hugeDissent}>{disagreementCopy.dissent}</span>
            </h2>
            <p className={s.follow}>{disagreementCopy.follow}</p>
            <p className={s.cap}>{disagreementCopy.note}</p>
          </div>

          <div className={`${s.act} ${s.card} lg`} data-act="verification">
            <p className={s.kicker}>{verificationCopy.label}</p>
            <h2 className={s.title}>{verificationCopy.title}</h2>
            <p className={s.body}>{verificationCopy.body}</p>
          </div>

          <div className={`${s.act} ${s.conv}`} data-act="convergence">
            <p className={s.kicker}>{convergenceCopy.label}</p>
            <h2 className={s.one}>One answer.</h2>
            <p className={s.body}>{convergenceCopy.body}</p>
            <Handoff />
            <p className={s.cap}>
              Illustrative animation, not a live result. <Link href="/how-it-works">How Keplar-One works</Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
