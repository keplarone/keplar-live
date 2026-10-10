"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { QaSummary } from "@/lib/site-builder/types";
import type { ForgeFile, ForgeState } from "./forgeState";
import s from "./ws.module.css";

const WorkingHard = dynamic(() => import("@/components/loader/WorkingHard").then((m) => m.WorkingHard), { ssr: false });
const Forge = dynamic(() => import("./Forge").then((m) => m.Forge), { ssr: false });

export type ShotView = { id: string; page: string; viewport: string; width: number; height: number; label: string; version: number };
export type StageTab = "preview" | "library" | "more";

const VP_ORDER = ["mobile", "tablet", "desktop"];
const pageLabel = (p: string) => (p === "index.html" ? "Home" : p.replace(/\.html$/, "").replace(/[-_]/g, " "));

// The preview is a REAL viewport (Desktop 1920x1080, Phone 390x844) laid out at its true size and scaled down with a CSS transform to fit the
// stage area (aspect ratio kept, never upscaled). The browser chrome / phone bezel stays at natural size around the scaled screen.
// Bezel padding, bar height and border width live here and reach the CSS as custom properties, so the scale maths and the frame always agree.
const VIEWPORT = { desktop: { w: 1920, h: 1080, pad: 0, bar: 28 }, phone: { w: 390, h: 844, pad: 7, bar: 0 } } as const;
const BW = 1;

function Device(p: { device: "phone" | "desktop"; morph: number; name: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // Re-measure the parent (the stage area, or the build frame) whenever it resizes: scale follows the container, the iframe is never touched.
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const cs = getComputedStyle(parent);
      const w = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = parent.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setBox((b) => (b && Math.abs(b.w - w) < 0.25 && Math.abs(b.h - h) < 0.25 ? b : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);
  // Size transitions only run for the toggle itself; while the window is being resized the frame must track the container with no lag.
  const [prevMorph, setPrevMorph] = useState(p.morph);
  const [animating, setAnimating] = useState(false);
  if (prevMorph !== p.morph) { setPrevMorph(p.morph); setAnimating(true); }
  useEffect(() => {
    if (!animating) return;
    const t = setTimeout(() => setAnimating(false), 600);
    return () => clearTimeout(t);
  }, [animating, p.morph]);
  const v = VIEWPORT[p.device];
  const k = box ? Math.max(0.02, Math.min(1, (box.w - 2 * (BW + v.pad)) / v.w, (box.h - v.bar - 2 * (BW + v.pad)) / v.h)) : 1;
  const style = { "--pad": `${v.pad}px`, "--bar": `${v.bar}px`, "--bw": `${BW}px`, "--fw": `${v.w}px`, "--fh": `${v.h}px`, "--k": k, "--vw": `${v.w * k}px`, "--vh": `${v.h * k}px` } as CSSProperties;
  return (
    <div ref={ref} className={`${s.device} ${p.className ?? ""}`} style={style} data-device={p.device} data-scale={k.toFixed(4)} data-ready={box ? "1" : "0"} data-animating={animating ? "1" : "0"} data-morph={p.morph ? (p.morph % 2 ? "a" : "b") : undefined}>
      <span className={s.notch} aria-hidden="true" />
      <span className={s.deskBar} aria-hidden="true"><i /><i /><i /><b>{p.name}</b></span>
      <div className={s.screen}>{p.children}</div>
    </div>
  );
}

export function StagePanel(p: {
  tab: StageTab; onTab: (t: StageTab) => void; siteId?: string; name: string; hasSite: boolean; previewSrc: string | null; fx: boolean;
  device: "phone" | "desktop"; onDevice: (d: "phone" | "desktop") => void; pages: string[]; page: string; onPage: (f: string) => void;
  building: { active: boolean; label: string; progress: number; lines: string[]; forge: { current: ForgeState }; files: ForgeFile[]; partialDoc: string | null; finished: boolean; pulseKey: number; testProgress?: number };
  shots: ShotView[]; qa: QaSummary | null; testing: boolean; browserNote: string | null; onTest: () => void;
  onChat: () => void; viewing: number | null; headVersion: number; exportHref: string | null; more: ReactNode; leadCount: number; focusShot: string | null; onFocusShot: (id: string | null) => void;
}) {
  const { tab, building } = p;
  // After a finished build the blocks dissolve upward over the real preview for a moment instead of the view snapping.
  const [dissolving, setDissolving] = useState(false);
  const [prevActive, setPrevActive] = useState(building.active);
  if (prevActive !== building.active) {
    setPrevActive(building.active);
    setDissolving(!building.active && building.finished);
  }
  useEffect(() => {
    if (!dissolving) return;
    const t = setTimeout(() => setDissolving(false), 1300);
    return () => clearTimeout(t);
  }, [dissolving]);
  // One frame element for both devices: CSS transitions its size/radius/bezel, so toggling morphs instead of swapping boxes.
  // morph counts toggles (0 = none yet); its parity picks which crossfade keyframes run so the fade restarts every time.
  const [morph, setMorph] = useState(0);
  const pick = (d: "phone" | "desktop") => { if (d === p.device) return; setMorph((m) => m + 1); p.onDevice(d); };
  const chrome = (inner: ReactNode, cls = "") => <Device device={p.device} morph={morph} name={p.name} className={cls}>{inner}</Device>;
  const realFrame = p.previewSrc ? (
    <iframe
      key={p.previewSrc}
      title={`Preview of ${p.name}`}
      src={p.previewSrc}
      className={s.iframe}
      sandbox={p.fx ? "allow-forms allow-popups allow-scripts" : "allow-forms allow-popups"}
      referrerPolicy="no-referrer"
    />
  ) : null;
  const showBuild = building.active || dissolving;
  const liveFrame = building.partialDoc ? <iframe title="Live preview of the page being written (not saved yet)" srcDoc={building.partialDoc} sandbox="" className={s.iframe} referrerPolicy="no-referrer" /> : null;
  const buildInner = dissolving && realFrame ? realFrame : liveFrame;
  return (
    <section className={s.stage} aria-label="Preview and library">
      <div className={s.stageBar}>
        <button type="button" className={s.backChat} onClick={p.onChat}>← Chat</button>
        <div className={s.seg} role="tablist" aria-label="Preview, Screen Library, more">
          <button type="button" role="tab" aria-selected={tab === "preview"} className={s.segBtn} onClick={() => p.onTab("preview")}>Preview</button>
          <button type="button" role="tab" aria-selected={tab === "library"} className={s.segBtn} onClick={() => p.onTab("library")}>Screen Library <span className={s.count}>{p.shots.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === "more"} className={s.segBtn} onClick={() => p.onTab("more")}>More{p.leadCount ? ` (${p.leadCount})` : ""}</button>
        </div>
        <span className={s.grow} />
        {p.viewing !== null && p.viewing !== p.headVersion ? <span className={s.tag}>Viewing v{p.viewing}</span> : null}
      </div>

      {tab === "preview" ? (
        <>
          <div className={s.previewBar}>
            <div className={`${s.seg} ${s.segSlide}`} role="group" aria-label="Frame" data-active={p.device === "desktop" ? 1 : 0}>
              <button type="button" className={s.segBtn} aria-pressed={p.device === "phone"} onClick={() => pick("phone")}>Phone</button>
              <button type="button" className={s.segBtn} aria-pressed={p.device === "desktop"} onClick={() => pick("desktop")}>Desktop</button>
            </div>
            {p.pages.length > 1 ? (
              <>
                <label htmlFor="ws-page" className="visually-hidden">Page</label>
                <select id="ws-page" className={s.select} value={p.page} onChange={(e) => p.onPage(e.target.value)}>
                  {p.pages.map((f) => <option key={f} value={f}>{pageLabel(f)}</option>)}
                </select>
              </>
            ) : null}
            <span className={s.grow} />
            {p.previewSrc ? <a className={s.linkBtn} href={p.previewSrc} target="_blank" rel="noreferrer">Open</a> : null}
            {p.exportHref ? <a className={s.linkBtn} href={p.exportHref}>Download ZIP</a> : null}
          </div>
          {p.testing && !showBuild ? (
            <div className={s.testStrip} data-testid="testing-strip">
              <WorkingHard stage="Testing in a real browser" pulseKey={building.pulseKey} progress={building.testProgress} height={110} />
            </div>
          ) : null}
          <div className={s.frameArea}>
            {showBuild ? (
              <div className={s.building} role="status" aria-live="polite" data-testid="building" data-phase={dissolving ? "dissolving" : "building"} data-live={buildInner ? "1" : "0"}>
                {buildInner ? <div className={s.buildFrame}>{chrome(buildInner, s.rise)}</div> : null}
                <div className={`${s.forgeWrap} ${buildInner ? s.forgeLow : ""} ${dissolving ? s.forgeOut : ""}`}>
                  {building.files.length === 0 && !buildInner && !dissolving ? (
                    <WorkingHard progress={building.progress || undefined} pulseKey={building.pulseKey} stage={building.lines[building.lines.length - 1] ?? building.label} height={240} />
                  ) : (
                    <Forge state={building.forge} />
                  )}
                </div>
                {building.active ? (
                  <div className={s.buildText}>
                    <strong>{building.label}</strong>
                    <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(building.progress * 100)} aria-label={building.label}><span style={{ width: `${Math.round(building.progress * 100)}%` }} /></div>
                    {building.files.length ? (
                      <ul className={s.files} aria-label="Files">
                        {building.files.map((f) => <li key={f.path} data-done={f.done ? "1" : "0"}><i aria-hidden="true" />{f.path}</li>)}
                      </ul>
                    ) : null}
                    <small className={s.muted}>{building.lines[building.lines.length - 1] ?? "Starting"}</small>
                  </div>
                ) : null}
              </div>
            ) : p.previewSrc ? (
              chrome(realFrame)
            ) : (
              <div className={s.placeholder}>
                <strong>No preview yet</strong>
                <span>Describe what you want in the chat. The preview builds here, then the browser tests it.</span>
              </div>
            )}
          </div>
          <p className={s.fine}>{p.fx ? "Only Keplar\u2019s own effects script runs, and only because effects are on. Your code never runs scripts." : "No scripts run in a Keplar site unless you turn on effects."}</p>
        </>
      ) : null}

      {tab === "library" ? <Library {...p} /> : null}
      {tab === "more" ? <div className={s.more}>{p.more}</div> : null}
    </section>
  );
}

function Library(p: Parameters<typeof StagePanel>[0]) {
  const { shots, qa, siteId } = p;
  const dlg = useRef<HTMLDialogElement>(null);
  const [local, setOpen] = useState<string | null>(null);
  const open = local ?? p.focusShot;
  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const byPage = new Map<string, ShotView[]>();
  for (const x of shots) byPage.set(x.page, [...(byPage.get(x.page) ?? []), x]);
  const cur = shots.find((x) => x.id === open);
  return (
    <div className={s.library}>
      <div className={s.libHead}>
        <div>
          <strong>{shots.length ? `${shots.length} screenshot${shots.length === 1 ? "" : "s"}${qa ? ` · v${qa.version}` : ""}` : "No screenshots yet"}</strong>
          <p className={s.muted}>{qa ? `${qa.errors} issue${qa.errors === 1 ? "" : "s"}, ${qa.warnings} note${qa.warnings === 1 ? "" : "s"}${qa.repaired ? " · one repair pass was applied" : ""}${qa.score !== null ? ` · design score ${qa.score}/10 (a model\u2019s opinion, not a measurement)` : ""}` : "Taken by a real headless browser at phone, tablet and desktop widths after each build."}</p>
        </div>
        <button type="button" className={s.btn} disabled={!p.hasSite || p.testing} onClick={p.onTest}>{p.testing ? "Testing…" : shots.length ? "Test again" : "Run the test"}</button>
      </div>
      {p.browserNote ? <p className={s.notice} role="status">{p.browserNote}</p> : null}
      {qa?.issues.length ? (
        <details className={s.fold}>
          <summary>What the test found ({qa.issues.length})</summary>
          <ul className={s.issues}>{qa.issues.slice(0, 30).map((i, k) => <li key={k} data-sev={i.severity}><strong>{i.severity === "error" ? "Issue" : "Note"}</strong> {i.message} <small>({pageLabel(i.page)}, {i.viewport})</small></li>)}</ul>
        </details>
      ) : null}
      {[...byPage.entries()].map(([pg, list]) => (
        <section key={pg} className={s.libPage}>
          <h4>{pageLabel(pg)}</h4>
          <div className={s.libRow}>
            {[...list].sort((a, b) => VP_ORDER.indexOf(a.viewport) - VP_ORDER.indexOf(b.viewport)).map((x) => (
              <button key={x.id} type="button" className={s.shot} data-vp={x.viewport} onClick={() => setOpen(x.id)} aria-label={`${pageLabel(pg)}, ${x.label}: open larger`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/sites/${siteId}/shots/${x.id}`} alt={`${pageLabel(pg)} at ${x.label}`} loading="lazy" />
                <small>{x.label}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
      <dialog ref={dlg} className={s.lightbox} onClose={() => { setOpen(null); p.onFocusShot(null); }} onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
        {cur ? (
          <div className={s.lbBody}>
            <div className={s.row}><strong>{pageLabel(cur.page)} · {cur.label}</strong><span className={s.grow} /><a className={s.linkBtn} href={`/api/sites/${siteId}/shots/${cur.id}`} download={`${pageLabel(cur.page)}-${cur.viewport}.jpg`}>Download</a><button type="button" className={s.btnGhost} onClick={() => dlg.current?.close()}>Close</button></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/sites/${siteId}/shots/${cur.id}`} alt={`${pageLabel(cur.page)} at ${cur.label}`} />
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
