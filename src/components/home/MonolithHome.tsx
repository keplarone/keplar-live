"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { probeCaps, softwareRenderer } from "@/field/caps";
import type { MonolithScene } from "@/field/monolith/scene";
import { scenePose } from "@/field/monolith/math";
import { tryHref } from "@/lib/site";
import { useClientText, useCommon, useLocale } from "@/lib/i18n/client";
import { localizedPath } from "@/lib/i18n/routing";
import { fmt } from "@/lib/i18n/format";
import { afterPaint } from "@/lib/perf/after-paint";
import { isPhone } from "@/lib/fx/lite";
import { currentTheme, onThemeChange } from "@/lib/theme";
import { runScramble, scrambleAt } from "@/lib/typing/scramble";
import s from "./MonolithHome.module.css";
import { SectionIndex } from "./SectionIndex";

const ACTS = ["hero", "question", "distribution", "responses", "disagreement", "verification", "convergence"] as const;

type Mode = "pending" | "webgl" | "static";

function Headline({ lead }: { lead: string[] }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const h = ref.current;
    if (!h || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lines = Array.from(h.querySelectorAll<HTMLElement>("[data-line]"));
    const STAGGER = 170, LINE = 1100;
    const total = LINE + (lines.length - 1) * STAGGER;
    const settle = () => {
      h.removeAttribute("data-scr");
      lines.forEach((el) => el.querySelector("[data-scr-out]")?.replaceChildren());
    };
    h.setAttribute("data-scr", "");
    const cancel = runScramble({
      duration: total,
      onFrame: (pAll) => {
        const elapsed = pAll * total;
        if (pAll >= 1) return;
        lines.forEach((el, i) => {
          const p = Math.min(1, Math.max(0, (elapsed - i * STAGGER) / LINE));
          const box = el.querySelector<HTMLElement>("[data-scr-out]");
          if (!box) return;
          box.replaceChildren(
            ...scrambleAt(el.dataset.text ?? "", p, i * 7).map((c) => {
              const e = document.createElement("i");
              e.textContent = c.ch;
              if (!c.settled) e.dataset.s = "";
              return e;
            }),
          );
        });
      },
      onDone: settle,
    });
    return () => { cancel(); settle(); };
  }, [lead]);
  return (
    <h1 ref={ref} className={s.h1}>
      {lead.map((l, i) => (
        <span key={l} className={s.line} data-line="" data-text={l} data-n={i}>
          <span className={s.sizer}>{l}</span>
          <span className={s.scr} aria-hidden="true" data-scr-out="" />
        </span>
      ))}
    </h1>
  );
}

/** One question, then the app. The particles pull together as it sends. Nothing is sent from this page. */
function HeroPrompt({ scene }: { scene: React.RefObject<MonolithScene | null> }) {
  const t = useClientText().home;
  const ref = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const go = () => {
    if (busy.current) return;
    busy.current = true;
    const text = (ref.current?.value ?? "").trim().slice(0, 600);
    const href = text ? `${tryHref}#q=${encodeURIComponent(text)}` : tryHref;
    const sc = scene.current;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      window.location.href = href;
    };
    if (!sc) return run();
    setSending(true);
    void sc.converge().then(run);
    window.setTimeout(run, 900);
  };
  return (
    <form className={s.composer} onSubmit={(e) => { e.preventDefault(); go(); }}>
      <label htmlFor="hero-q" className="visually-hidden">{t.questionLabel}</label>
      <textarea
        ref={ref}
        id="hero-q"
        className={`${s.input} type-input`}
        rows={1}
        maxLength={600}
        placeholder={t.ask}
        autoComplete="off"
        enterKeyHint="go"
        spellCheck
        onInput={() => scene.current?.agitate(0.12)}
        onFocus={() => scene.current?.setFocus(true)}
        onBlur={() => scene.current?.setFocus(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            go();
          }
        }}
      />
      <button type="submit" className={s.go} disabled={sending}>
        <span className={s.goText}>{t.ask}</span>
        <span className="visually-hidden">{t.ask}</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
    </form>
  );
}

/** One screen of copy, then a scroll that flies the planet scene through the story. */
export function MonolithHome() {
  const t = useClientText().home;
  const { credit } = useCommon();
  const locale = useLocale();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MonolithScene | null>(null);
  const [mode, setMode] = useState<Mode>("pending");
  const [ready, setReady] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const sky = skyRef.current;
    if (!section || !canvas || !sky) return;
    const caps = probeCaps();
    // Phones get the static composition: the acts read as a plain sequence of sections instead of a pinned seven-screen WebGL
    // story, and no scene code is fetched (src/lib/fx/lite.ts isPhone).
    if (!caps.webgl || softwareRenderer() || isPhone()) { setMode("static"); return; }
    const still = caps.reducedMotion;
    if (still) setMode("static");
    else setMode("webgl");
    const fq = new URLSearchParams(window.location.search).get("fq");
    const quality = fq === "low" || fq === "medium" || fq === "high" ? fq : caps.mobile ? "low" : "high";
    const sceneTheme = currentTheme();
    let cancelled = false;
    let dispose = () => {};
    const stopWait = afterPaint(() => void (async () => {
      let mod: typeof import("@/field/monolith/scene");
      try { mod = await import("@/field/monolith/scene"); } catch { if (!cancelled) setMode("static"); return; }
      if (cancelled) return;
      sky.setAttribute("data-on", "");
      let sc: MonolithScene;
      try {
        sc = new mod.MonolithScene({
          canvas, variant: "home", quality, mobile: caps.mobile, still, theme: sceneTheme, opaque: sceneTheme === "dark",
          getStage: () => {
            const el = stageRef.current;
            const box = canvas.getBoundingClientRect();
            if (!el || box.width < 1 || box.height < 1) return null;
            const r = el.getBoundingClientRect();
            return { cx: r.left + r.width / 2 - box.left, cy: r.top + r.height / 2 - box.top };
          },
          onFirstFrame: () => setReady(true),
          onLost: () => setNonce((n) => n + 1),
        });
      } catch { sky.removeAttribute("data-on"); if (!cancelled) setMode("static"); return; }
      sceneRef.current = sc;
      const scenes = Array.from(section.querySelectorAll<HTMLElement>("[data-act]"));
      const copy = section.querySelector<HTMLElement>("[data-copy]");
      let lastAct: (typeof ACTS)[number] | null = null;
      let scrollRaf = 0;
      const update = () => {
        scrollRaf = 0;
        const rect = section.getBoundingClientRect();
        const span = rect.height - window.innerHeight;
        const p = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
        sc.setProgress(p);
        const a = p * (ACTS.length - 1);
        const hero = scenePose(a);
        if (copy) {
          copy.style.setProperty("--copy", hero.opacity.toFixed(3));
          if (hero.opacity < 0.05) copy.setAttribute("data-away", "");
          else copy.removeAttribute("data-away");
        }
        scenes.forEach((el, i) => {
          const pose = scenePose(a - (i + 1));
          el.style.opacity = pose.opacity.toFixed(3);
          el.style.visibility = pose.opacity > 0.02 ? "visible" : "hidden";
          el.style.transform = `translate3d(0, calc(-50% + ${pose.y.toFixed(1)}px), 0) scale(${pose.scale.toFixed(3)})`;
          el.toggleAttribute("data-live", pose.opacity > 0.45);
        });
        const gone = rect.bottom < window.innerHeight * 0.45;
        const id = gone ? null : ACTS[Math.max(0, Math.min(ACTS.length - 1, Math.round(a)))];
        if (id !== lastAct) {
          lastAct = id;
          window.dispatchEvent(new CustomEvent("keplar:act", { detail: { id } }));
        }
      };
      const onScroll = () => { if (!scrollRaf) scrollRaf = requestAnimationFrame(update); };
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
      const ro = new ResizeObserver(() => { sc.resize(); update(); });
      ro.observe(canvas);
      const io = new IntersectionObserver(([e]) => sc.setVisible(e.isIntersecting));
      io.observe(section);
      const onMove = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        sc.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), true);
      };
      const onLeave = () => sc.setPointer(0, 0, false);
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      const stopTheme = onThemeChange((theme) => { if (theme !== sceneTheme) setNonce((n) => n + 1); });
      sc.start();
      dispose = () => {
        ro.disconnect();
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        stopTheme();
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        window.removeEventListener("scroll", onScroll);
        sky.removeAttribute("data-on");
        sc.dispose();
        sceneRef.current = null;
      };
    })());
    return () => { cancelled = true; stopWait(); dispose(); setReady(false); };
  }, [nonce]);

  return (
    <section ref={sectionRef} className={s.hero} data-mode={mode} data-live={ready || undefined} aria-label="Keplar">
      <div className={s.pin}>
        <div ref={skyRef} className={s.sky} aria-hidden="true">
          <canvas key={nonce} ref={canvasRef} className={s.canvas} data-ready={ready || undefined} />
        </div>
        <div className={s.cssOrb} aria-hidden="true"><KeplarSymbol size="100%" /></div>
        <div className={s.content} data-copy="">
          <div className={s.top}>
            <Headline lead={t.lead} />
            <p className={s.sub}>{t.sub}</p>
          </div>
          <div ref={stageRef} className={s.stage} aria-hidden="true" />
          <div className={s.bottom}>
            <HeroPrompt scene={sceneRef} />
            <p className={s.proof}>
              {fmt(t.builtBy, { credit })} · <a href="#demo">{t.tryDemo}</a> · <Link href={localizedPath("/features", locale)}>{t.everything}</Link>
            </p>
            <p className={s.note}>{t.note}</p>
          </div>
        </div>
        <div className={s.world}>
          <div className={s.scene} data-act="question">
            <p className={s.kicker}><b>01</b> {t.index[1]}</p>
            <p className={s.prompt}>{t.questionPrompt}<i className={s.caret} aria-hidden="true" /></p>
            <p className={s.body}>{t.questionCaption}</p>
          </div>
          <div className={s.scene} data-act="distribution">
            <p className={s.kicker}><b>02</b> {t.kickers[1]}</p>
            <h2 className={s.title}>{t.distributionTitle}</h2>
            <p className={s.body}>{t.distributionBody}</p>
            <ul className={s.nodes}>
              {["OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral"].map((name, i) => (
                <li key={name}><i style={{ ["--i" as string]: i }} />{name}</li>
              ))}
            </ul>
            <p className={s.fine}>{t.routeNote}</p>
          </div>
          <div className={s.scene} data-act="responses">
            <p className={s.kicker}><b>03</b> {t.kickers[2]}</p>
            <h2 className={s.title}>{t.responsesTitle}</h2>
            <p className={s.body}>{t.responsesBody}</p>
            <div className={s.cards} aria-hidden="true">
              {[0, 1, 2].map((k) => (
                <div key={k} className={s.card} style={{ ["--k" as string]: k }}><span /><span /><span /></div>
              ))}
            </div>
            <p className={s.fine}>{t.respondNote}</p>
          </div>
          <div className={s.scene} data-act="disagreement">
            <p className={s.kicker}><b>04</b> {t.kickers[3]}</p>
            <p className={s.huge}>{t.agree}<span className={s.dim}>{t.dissent}</span></p>
            <p className={s.body}>{t.follow}</p>
            <p className={s.fine}>{t.disagreeNote}</p>
          </div>
          <div className={s.scene} data-act="verification">
            <p className={s.kicker}><b>05</b> {t.kickers[4]}</p>
            <h2 className={s.title}>{t.verificationTitle}</h2>
            <p className={s.body}>{t.verificationBody}</p>
            <ol className={s.steps}>{t.verifySteps.map((step) => <li key={step}>{step}</li>)}</ol>
          </div>
          <div className={s.scene} data-act="convergence">
            <p className={s.kicker}><b>06</b> {t.kickers[5]}</p>
            <p className={s.one}>{t.closingTitle}</p>
            <p className={s.body}>{t.convergenceBody}</p>
            <p className={s.ctas}><Link className={s.link} href={localizedPath("/how-it-works", locale)}>{t.closingSecondary}</Link></p>
          </div>
        </div>
        <SectionIndex />
      </div>
    </section>
  );
}
