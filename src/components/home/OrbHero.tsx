"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeplarSymbol } from "@/components/brand";
import { probeCaps } from "@/field/caps";
import { fxDebug, fxDebugClear } from "@/field/debug";
import { NODE_NAMES } from "@/field/orb/math";
import type { OrbScene } from "@/field/orb/scene";
import { resolveTier } from "@/lib/spatial/policy";
import { runScramble, scrambleAt } from "@/lib/typing/scramble";
import { heroCopy, orbHeroCopy } from "@/lib/narrative";
import { tryHref } from "@/lib/site";
import s from "./OrbHero.module.css";

type Mode = "pending" | "webgl" | "still" | "static";

const GLYPHS: React.ReactNode[] = [
  <circle key="0" cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />,
  <path key="1" d="M12 3.5 20.5 12 12 20.5 3.5 12Z" fill="none" stroke="currentColor" strokeWidth="2" />,
  <path key="2" d="M12 2c.8 5.2 4.8 9.2 10 10-5.2.8-9.2 4.8-10 10-.8-5.2-4.8-9.2-10-10 5.2-.8 9.2-4.8 10-10Z" fill="currentColor" />,
  <path key="3" d="M4 8h16M4 16h10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  <path key="4" d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
  <g key="5" fill="currentColor"><circle cx="5" cy="12" r="2.3" /><circle cx="12" cy="12" r="2.3" /><circle cx="19" cy="12" r="2.3" /></g>,
];

const CHIP_ICONS: React.ReactNode[] = [
  /* Multiple Models — 2×2 tiles */
  <g key="0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.2" /></g>,
  /* Compares Answers — two columns joined */
  <g key="1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 5v14M17 5v14" /><path d="M7 12h10" /></g>,
  /* Finds Disagreements — split fork */
  <path key="2" d="M12 3v8M12 11 6 19M12 11l6 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  /* One Clear Result — circle + check */
  <g key="3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="m8.2 12.2 2.4 2.4 5.2-5.2" /></g>,
];

function Headline() {
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
    // runScramble ends the run with a timeout even if animation frames are throttled, so data-scr can never stay on.
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
  }, []);
  return (
    <h1 ref={ref} className={s.h1}>
      {heroCopy.lead.map((l, i) => (
        <span key={l} className={s.line} data-line="" data-text={l} data-n={i}>
          <span className={s.sizer}>{l}</span>
          <span className={s.scr} aria-hidden="true" data-scr-out="" />
        </span>
      ))}
    </h1>
  );
}

/** The composer. A plain uncontrolled <textarea>: native typing, caret, selection, undo/redo and IME are untouched; the scene is told with one number per keystroke. */
function HeroPrompt({ scene }: { scene: React.RefObject<OrbScene | null> }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const go = () => {
    if (busy.current) return;
    busy.current = true;
    const t = (ref.current?.value ?? "").trim().slice(0, 600);
    const href = t ? `${tryHref}#q=${encodeURIComponent(t)}` : tryHref;
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
    window.setTimeout(run, 1700);
  };
  const fit = () => {
    const el = ref.current;
    if (!el || (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content"))) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };
  return (
    <form
      className={s.composer}
      data-lit=""
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <label htmlFor="hero-q" className="visually-hidden">Your question</label>
      <textarea
        ref={ref}
        id="hero-q"
        className={`${s.input} type-input`}
        rows={1}
        maxLength={600}
        placeholder="Ask anything..."
        autoComplete="off"
        enterKeyHint="go"
        spellCheck
        onInput={() => {
          scene.current?.agitate(0.12);
          fit();
        }}
        onFocus={() => scene.current?.setFocus(true)}
        onBlur={() => scene.current?.setFocus(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            go();
          }
        }}
      />
      <button type="submit" className={s.go} aria-label="Ask Keplar" disabled={sending}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
    </form>
  );
}

export function OrbHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const floodRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);
  const nodeRefs = useRef<(HTMLLIElement | null)[]>([]);
  const sceneRef = useRef<OrbScene | null>(null);
  const [mode, setMode] = useState<Mode>("pending");
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<"desktop" | "mobile">("desktop");
  const [nonce, setNonce] = useState(0);

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

  const stageRect = useCallback(() => {
    const c = canvasRef.current!.getBoundingClientRect();
    const r = stageRef.current!.getBoundingClientRect();
    return { cx: r.left - c.left + r.width / 2, cy: r.top - c.top + r.height / 2, w: r.width, h: r.height };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const caps = probeCaps();
    if (!caps.webgl) {
      setMode("static");
      return;
    }
    const fq = new URLSearchParams(window.location.search).get("fq");
    const tier = resolveTier("immersive", caps);
    const quality = fq === "low" || fq === "medium" || fq === "high" ? fq : tier.quality;
    const still = caps.reducedMotion;
    fxDebug({ layer: "orb", tier: quality, mode: still ? "still" : "main", reason: tier.reason });
    let cancelled = false;
    let dispose = () => {};
    (async () => {
      let mod: typeof import("@/field/orb/scene");
      try {
        mod = await import("@/field/orb/scene");
      } catch {
        if (!cancelled) setMode("static");
        return;
      }
      if (cancelled) return;
      let sc: OrbScene;
      try {
        sc = new mod.OrbScene({
          canvas,
          quality,
          mobile: form === "mobile" || caps.mobile,
          still,
          getStage: stageRect,
          onFirstFrame: () => setReady(true),
          onLost: () => setNonce((n) => n + 1),
          onFrame: (f) => {
            const st = stageRef.current;
            const cv = canvas.getBoundingClientRect();
            const sr = st?.getBoundingClientRect();
            if (!sr) return;
            const ox = sr.left - cv.left;
            const oy = sr.top - cv.top;
            const logo = logoRef.current;
            if (logo) {
              const k = (f.orb.r * 1.15) / 24;
              logo.style.transform = `translate3d(${(f.orb.x - ox).toFixed(1)}px, ${(f.orb.y - oy).toFixed(1)}px, 0) translate(-50%, -50%) scale(${Math.max(0.1, k).toFixed(3)})`;
            }
            f.nodes.forEach((n, i) => {
              const el = nodeRefs.current[i];
              if (el) el.style.transform = `translate3d(${(n.x - ox).toFixed(1)}px, ${(n.y - oy).toFixed(1)}px, 0) translate(-50%, 0)`;
            });
            section.style.setProperty("--tile", `${(f.nodes[0]?.size ?? 56).toFixed(0)}px`);
            const ct = contentRef.current;
            if (ct) {
              ct.style.setProperty("--copy", f.copy.toFixed(3));
              ct.toggleAttribute("data-away", f.copy < 0.35);
            }
            floodRef.current?.style.setProperty("--flood", f.flood.toFixed(3));
          },
        });
      } catch {
        if (!cancelled) setMode("static");
        return;
      }
      sceneRef.current = sc;
      setMode(still ? "still" : "webgl");
      const update = () => {
        const r = section.getBoundingClientRect();
        const span = r.height - window.innerHeight;
        sc.setScroll(span > 0 && !still ? Math.min(1, Math.max(0, -r.top / span)) : 0);
      };
      update();
      const onScroll = () => update();
      window.addEventListener("scroll", onScroll, { passive: true });
      const ro = new ResizeObserver(() => {
        sc.resize();
        update();
      });
      ro.observe(canvas);
      if (stageRef.current) ro.observe(stageRef.current);
      const io = new IntersectionObserver(([e]) => {
        sc.setVisible(e.isIntersecting);
        window.dispatchEvent(new CustomEvent("keplar:act", { detail: { id: e.isIntersecting ? "hero" : null } }));
      }, { rootMargin: "10% 0px" });
      io.observe(section);
      const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      const onMove = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        sc.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), true);
      };
      const onLeave = () => sc.setPointer(0, 0, false);
      if (fine && !still) {
        window.addEventListener("pointermove", onMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", onLeave);
      }
      // fonts load after the first layout: re-measure so the orb sits where the stage ended up
      void document.fonts?.ready.then(() => !cancelled && sc.resize());
      sc.start();
      dispose = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        ro.disconnect();
        io.disconnect();
        sc.dispose();
        sceneRef.current = null;
      };
    })();
    return () => {
      cancelled = true;
      dispose();
      fxDebugClear("orb");
      setReady(false);
    };
  }, [form, nonce, stageRect]);

  return (
    <section ref={sectionRef} className={s.hero} data-mode={mode} data-form={form} data-live={ready || undefined} aria-label="Keplar">
      <div ref={pinRef} className={s.pin}>
        <canvas key={nonce} ref={canvasRef} className={s.canvas} data-ready={ready || undefined} aria-hidden="true" />
        <div className={s.cssOrb} aria-hidden="true" style={{ top: "42%" }} />
        <div ref={contentRef} className={s.content}>
          <div className={s.top}>
            <p className={s.pill}>{orbHeroCopy.pill}</p>
            <Headline />
            <p className={s.sub}>{orbHeroCopy.sub}</p>
          </div>
          <div ref={stageRef} className={s.stage}>
            <ul className={s.nodes} aria-label="Model families Keplar can route to">
              {NODE_NAMES.map((n, i) => (
                <li key={n} ref={(el) => { nodeRefs.current[i] = el; }} className={s.node}>
                  <svg className={s.glyph} viewBox="0 0 24 24" aria-hidden="true">{GLYPHS[i]}</svg>
                  <span className={s.name}>{n}</span>
                </li>
              ))}
            </ul>
            <span ref={logoRef} className={s.logo} aria-hidden="true">
              <KeplarSymbol size={48} />
            </span>
          </div>
          <div className={s.bottom}>
            <HeroPrompt scene={sceneRef} />
            <ul className={s.chips} aria-label="What Keplar does">
              {orbHeroCopy.chips.map((c, i) => (
                <li key={c} className={s.chipItem}>
                  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">{CHIP_ICONS[i]}</svg>
                  {c}
                </li>
              ))}
            </ul>
            <p className={s.note}>{orbHeroCopy.note}</p>
          </div>
        </div>
        <div ref={floodRef} className={s.flood} aria-hidden="true" />
      </div>
    </section>
  );
}
