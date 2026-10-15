"use client";
/**
 * Keplar Business, AI Design Canvas: one website project, three ways to change it, one draft.
 *  - Design: click any element on the live canvas, then edit its text, colors, size and spacing.
 *  - Code: edit the project's HTML and CSS files directly.
 *  - AI: describe a change to the selected element; a cheap model proposes replacement HTML (sanitized on the server).
 * Every change lands in a draft shown on the canvas. Nothing is saved until "Approve and save", which stores the draft as a
 * new version through the same file checks as any edit (undo it in Create's History). "Discard" drops the draft.
 * The canvas renders the draft in a sandboxed frame with scripts, forms and navigation disabled.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmAction } from "@/components/kit";
import { diffFiles } from "@/lib/site-builder/diff";
import s from "./workspace.module.css";
import d from "./canvas.module.css";

type SiteRow = { id: string; name: string; kind: "site" | "app"; headVersion: number; updatedAt: string; archived: boolean };
type Open = { id: string; name: string; headVersion: number; files: Record<string, string>; pages: string[] };
type Mode = "design" | "code" | "ai";
type Box = { top: number; left: number; width: number; height: number };
type Picked = { el: Element; box: Box; label: string };

const MARK = "data-kcanvas";
const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "A", "BUTTON", "SPAN", "LI", "LABEL", "STRONG", "EM", "SMALL", "FIGCAPTION", "BLOCKQUOTE", "TD", "TH", "DT", "DD"]);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? `Request failed (${res.status})`));
  return data as T;
}

/** The page as the canvas shows it: the draft's CSS files inlined (srcdoc has no base URL), marked so they never get saved. */
export function canvasDocument(html: string, files: Record<string, string>): string {
  const css = Object.entries(files).filter(([p]) => p.endsWith(".css")).map(([p, c]) => `<style ${MARK}="${p}">${c.replace(/<\/style/gi, "<\\/style")}</style>`).join("\n");
  const guard = `<style ${MARK}="canvas">html{scroll-behavior:auto!important}*{animation-play-state:paused!important}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${css}\n${guard}\n</head>`) : `${css}${guard}${html}`;
}

/** The page as it is saved: the live DOM without anything the canvas added. */
export function serializeCanvas(doc: Document): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement;
  root.querySelectorAll(`[${MARK}]`).forEach((n) => n.remove());
  return `<!doctype html>\n${root.outerHTML}`;
}

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join("");
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32);
  return `${tag}${cls}${text ? ` “${text}${(el.textContent ?? "").trim().length > 32 ? "…" : ""}”` : ""}`;
}

/** DOM edits on the canvas frame (kept outside the component: the frame DOM is the draft, not React state). */
function setText(el: Element, text: string) { el.textContent = text; }

function toHex(rgb: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return "";
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Keyboard route to a selection: the page's landmarks and sections, in order. */
function SectionPicker({ doc, rev, onPick }: { doc: () => Document | null; rev: number; onPick: (el: Element) => void }) {
  const [list, setList] = useState<Element[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const dd = doc();
      setList(dd ? [...dd.querySelectorAll("header, nav, main > *, section, article, aside, footer, h1, h2")].filter((n, i, a) => a.indexOf(n) === i).slice(0, 60) : []);
    }, 300);
    return () => clearTimeout(t);
  }, [doc, rev]);
  if (!list.length) return null;
  return (
    <label className={s.field}>Or select a part of the page
      <select className={s.input} value="" onChange={(e) => { const el = list[Number(e.target.value)]; if (el) { el.scrollIntoView({ block: "center" }); onPick(el); } }}>
        <option value="">Choose…</option>
        {list.map((n, i) => <option key={i} value={i}>{describe(n)}</option>)}
      </select>
    </label>
  );
}

export function DesignCanvas() {
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [page, setPage] = useState("index.html");
  const [mode, setMode] = useState<Mode>("design");
  const [notes, setNotes] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ draft: Record<string, string>; notes: string[] }[]>([]);
  /** What the frame shows: a snapshot taken only when the canvas should reload (design edits change the live DOM instead). */
  const [shown, setShown] = useState<{ n: number; files: Record<string, string> }>({ n: 0, files: {} });
  const [hover, setHover] = useState<Box | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [codeFile, setCodeFile] = useState("index.html");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "load" | "ai" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [width, setWidth] = useState<"desktop" | "tablet" | "phone">("desktop");
  const frame = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const reloadWith = useCallback((files: Record<string, string>) => setShown((v) => ({ n: v.n + 1, files })), []);
  const rev = shown.n;

  useEffect(() => {
    call<{ sites: SiteRow[] }>("/api/sites")
      .then((r) => setSites(r.sites.filter((x) => !x.archived && x.kind !== "app" && x.headVersion > 0)))
      .catch((e: Error) => { setSites([]); setError(e.message); });
  }, []);

  const changed = useMemo(() => (open ? diffFiles(open.files, draft).filter((f) => f.status === "changed") : []), [open, draft]);
  const dirty = changed.length > 0;

  // Leaving with unsaved canvas changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function openSite(id: string) {
    if (dirty && !(await confirmAction({ title: "Discard the changes you haven't saved?", confirmLabel: "Discard", danger: true }))) return;
    setBusy("load"); setError(null); setStatus(null);
    try {
      const r = await call<{ site: { id: string; name: string; headVersion: number }; files: Record<string, string>; pages: string[] }>(`/api/sites/${id}`);
      setOpen({ id: r.site.id, name: r.site.name, headVersion: r.site.headVersion, files: r.files, pages: r.pages });
      setDraft(r.files); setNotes([]); setUndo([]); setPicked(null); setHover(null);
      setPage(r.pages.includes("index.html") ? "index.html" : (r.pages[0] ?? "index.html"));
      setCodeFile("index.html"); reloadWith(r.files);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const doc = useCallback(() => frame.current?.contentDocument ?? null, []);
  const boxOf = (el: Element): Box => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; };

  /** Records a change: snapshot for undo, the new draft, and a line for the approval summary. */
  const commit = useCallback((next: Record<string, string>, note: string, reload: boolean) => {
    const before = { draft: draftRef.current, notes }; // read now: the updater below runs later, after the ref moves on
    setUndo((u) => [...u.slice(-29), before]);
    draftRef.current = next;
    setDraft(next);
    setNotes((n) => (n[n.length - 1] === note ? n : [...n, note].slice(-40)));
    if (reload) { setPicked(null); setHover(null); reloadWith(next); }
  }, [notes, reloadWith]);

  /** A design edit already applied to the frame's DOM: write that page back into the draft without reloading the frame. */
  const fromDom = useCallback((note: string) => {
    const dd = doc();
    if (!dd) return;
    commit({ ...draftRef.current, [page]: serializeCanvas(dd) }, note, false);
    setPicked((p) => (p ? { ...p, box: boxOf(p.el), label: describe(p.el) } : p));
  }, [commit, doc, page]);

  const srcDoc = useMemo(() => canvasDocument(shown.files[page] ?? "", shown.files), [shown, page]);

  function pointAt(e: React.MouseEvent<HTMLDivElement>): Element | null {
    const dd = doc();
    if (!dd) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const el = dd.elementFromPoint(e.clientX - r.left, e.clientY - r.top);
    return el && el !== dd.documentElement && el !== dd.body ? el : null;
  }

  function refreshBoxes() {
    requestAnimationFrame(() => setPicked((p) => (p && p.el.isConnected ? { ...p, box: boxOf(p.el) } : null)));
    setHover(null);
  }

  function undoLast() {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    setDraft(last.draft); setNotes(last.notes); setPicked(null); reloadWith(last.draft);
  }

  async function discard() {
    if (!open || !(await confirmAction({ title: "Discard every change on the canvas?", body: "The saved version stays as it is.", confirmLabel: "Discard", danger: true }))) return;
    setDraft(open.files); setNotes([]); setUndo([]); setPicked(null); reloadWith(open.files); setStatus("Changes discarded.");
  }

  async function approve() {
    if (!open || !dirty) return;
    setBusy("save"); setError(null);
    try {
      const files = Object.fromEntries(changed.map((f) => [f.path, draft[f.path]]));
      const note = notes.length ? notes.slice(0, 6).join("; ") + (notes.length > 6 ? `; and ${notes.length - 6} more` : "") : `Edited ${changed.map((f) => f.path).join(", ")}`;
      const r = await call<{ version: number }>(`/api/sites/${open.id}/canvas`, { method: "PUT", body: JSON.stringify({ files, baseVersion: open.headVersion, note }) });
      const fresh = await call<{ files: Record<string, string>; pages: string[] }>(`/api/sites/${open.id}`);
      setOpen({ ...open, headVersion: r.version, files: fresh.files, pages: fresh.pages });
      setDraft(fresh.files); setNotes([]); setUndo([]); setPicked(null); reloadWith(fresh.files);
      setStatus(`Saved as version ${r.version}. Undo it any time from History in Create.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function askAi() {
    if (!open || !picked || instruction.trim().length < 3) return;
    setBusy("ai"); setError(null); setStatus(null);
    try {
      const dd = doc();
      const classes = dd ? [...new Set([...dd.querySelectorAll("[class]")].flatMap((n) => (n.getAttribute("class") ?? "").split(/\s+/)).filter(Boolean))].slice(0, 80) : [];
      const r = await call<{ html: string; note: string }>(`/api/sites/${open.id}/canvas`, { method: "POST", body: JSON.stringify({ element: picked.el.outerHTML, instruction: instruction.trim(), classes }) });
      if (!picked.el.isConnected || !dd) throw new Error("The selected element changed while the AI was working. Select it again.");
      const tpl = dd.createElement("template");
      tpl.innerHTML = r.html;
      const first = tpl.content.firstElementChild;
      picked.el.replaceWith(tpl.content);
      if (first) setPicked({ el: first, box: boxOf(first), label: describe(first) });
      fromDom(`AI: ${r.note}`);
      setInstruction("");
      setStatus("AI change added to the draft. Check it on the canvas, then approve or undo.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (sites === null) return <div className={s.center}><span className={s.spinner} aria-label="Loading projects" /></div>;

  if (!open) {
    return (
      <div className={d.pick}>
        <h1 className={d.title}>AI Design Canvas</h1>
        <p className={d.lede}>Open a website project and change it three ways on one canvas: click elements to restyle them, edit the code, or ask AI to rework a part. Changes stay in a draft until you approve them.</p>
        {error ? <p className={d.error} role="alert">{error}</p> : null}
        {sites.length ? (
          <ul className={d.sites}>
            {sites.map((x) => (
              <li key={x.id}>
                <button type="button" className={d.site} onClick={() => void openSite(x.id)} disabled={busy === "load"}>
                  <span className={d.siteName}>{x.name}</span>
                  <span className={d.siteMeta}>Version {x.headVersion} · updated {new Date(x.updatedAt).toLocaleDateString()}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={d.lede}>No website projects yet. Build one in Create first, then open it here.</p>
        )}
      </div>
    );
  }

  const el = picked?.el as HTMLElement | undefined;
  const cs = el ? el.ownerDocument.defaultView?.getComputedStyle(el) : undefined;
  const leafText = el && TEXT_TAGS.has(el.tagName) && [...el.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && ["B", "STRONG", "EM", "I", "SPAN", "BR"].includes((n as Element).tagName)));
  const setStyle = (prop: string, value: string, note: string) => { if (!el) return; el.style.setProperty(prop, value); fromDom(note); };

  return (
    <div className={d.root}>
      <header className={d.bar}>
        <button type="button" className={s.btnGhost} onClick={async () => { if (!dirty || await confirmAction({ title: "Leave without saving your changes?", confirmLabel: "Leave", danger: true })) { setOpen(null); setDraft({}); } }}>Projects</button>
        <strong className={d.name} title={open.name}>{open.name}</strong>
        <span className={d.meta}>v{open.headVersion}</span>
        <div className={d.seg} role="tablist" aria-label="Canvas mode">
          {(["design", "code", "ai"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={d.segBtn} onClick={() => { if (mode === "code" && m !== "code") reloadWith(draft); setMode(m); }}>{m === "ai" ? "AI" : m === "design" ? "Design" : "Code"}</button>
          ))}
        </div>
        <span className={d.grow} />
        {open.pages.length > 1 ? (
          <label className={d.inline}><span className={s.srOnly}>Page</span>
            <select className={s.input} data-narrow value={page} onChange={(e) => { setPage(e.target.value); setPicked(null); reloadWith(draft); }}>
              {open.pages.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        ) : null}
        <div className={d.seg} role="group" aria-label="Canvas width">
          {(["desktop", "tablet", "phone"] as const).map((w) => <button key={w} type="button" aria-pressed={width === w} className={d.segBtn} onClick={() => { setWidth(w); refreshBoxes(); }}>{w[0].toUpperCase() + w.slice(1)}</button>)}
        </div>
      </header>

      <div className={d.body}>
        <div className={d.stage}>
          <div className={d.frameWrap} data-width={width}>
            <iframe ref={frame} key={`${rev}-${page}`} title={`${open.name}: ${page} (draft)`} className={d.frame} sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={() => setPicked(null)} />
            {mode !== "code" ? (
              <div
                className={d.overlay}
                onMouseMove={(e) => { const t = pointAt(e); setHover(t ? boxOf(t) : null); }}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => { const t = pointAt(e); setPicked(t ? { el: t, box: boxOf(t), label: describe(t) } : null); }}
                onWheel={(e) => { frame.current?.contentWindow?.scrollBy(e.deltaX, e.deltaY); refreshBoxes(); }}
                aria-hidden="true"
              >
                {hover ? <div className={d.hover} style={hover} /> : null}
                {picked ? <div className={d.picked} style={picked.box}><span className={d.tag}>{picked.label}</span></div> : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className={d.panel} aria-label="Canvas tools">
          {mode === "design" ? (
            el ? (
              <div className={d.stack}>
                <p className={d.label}>Selected: <code>{picked!.label}</code></p>
                <div className={d.row}>
                  <button type="button" className={s.btnGhost} onClick={() => { const p = el.parentElement; if (p && p.tagName !== "BODY") setPicked({ el: p, box: boxOf(p), label: describe(p) }); }}>Select parent</button>
                  {/* Keyboard path through the page without the pointer: into the element and across its siblings. */}
                  {el.firstElementChild ? <button type="button" className={s.btnGhost} onClick={() => { const c = el.firstElementChild; if (c) { c.scrollIntoView({ block: "center" }); setPicked({ el: c, box: boxOf(c), label: describe(c) }); } }}>Select inside</button> : null}
                  {el.previousElementSibling ? <button type="button" className={s.btnGhost} onClick={() => { const c = el.previousElementSibling; if (c) { c.scrollIntoView({ block: "center" }); setPicked({ el: c, box: boxOf(c), label: describe(c) }); } }}>Previous</button> : null}
                  {el.nextElementSibling ? <button type="button" className={s.btnGhost} onClick={() => { const c = el.nextElementSibling; if (c) { c.scrollIntoView({ block: "center" }); setPicked({ el: c, box: boxOf(c), label: describe(c) }); } }}>Next</button> : null}
                  <button type="button" className={s.btnGhost} onClick={() => { const c = el.cloneNode(true) as Element; el.after(c); fromDom(`Duplicated ${el.tagName.toLowerCase()}`); }}>Duplicate</button>
                  <button type="button" className={s.btnGhost} onClick={() => { const t = el.tagName.toLowerCase(); el.remove(); setPicked(null); fromDom(`Removed ${t}`); }}>Remove</button>
                </div>
                {leafText ? (
                  <label className={s.field}>Text
                    <textarea className={s.textarea} rows={3} defaultValue={el.textContent ?? ""} key={`${rev}-${picked!.label}`} onBlur={(e) => { if (e.target.value !== el.textContent) { setText(el, e.target.value); fromDom(`Text of ${el.tagName.toLowerCase()} changed`); } }} />
                  </label>
                ) : null}
                {el.tagName === "A" ? (
                  <label className={s.field}>Link
                    <input className={s.input} defaultValue={el.getAttribute("href") ?? ""} key={`href-${picked!.label}`} onBlur={(e) => { if (e.target.value !== el.getAttribute("href")) { el.setAttribute("href", e.target.value); fromDom("Link changed"); } }} />
                  </label>
                ) : null}
                {el.tagName === "IMG" ? (
                  <label className={s.field}>Alt text
                    <input className={s.input} defaultValue={el.getAttribute("alt") ?? ""} key={`alt-${picked!.label}`} onBlur={(e) => { el.setAttribute("alt", e.target.value); fromDom("Image description changed"); }} />
                  </label>
                ) : null}
                <div className={d.grid}>
                  <label className={s.field}>Text color<input type="color" className={d.color} value={toHex(cs?.color ?? "") || "#000000"} onChange={(e) => setStyle("color", e.target.value, `Text color of ${el.tagName.toLowerCase()}`)} /></label>
                  <label className={s.field}>Background<input type="color" className={d.color} value={toHex(cs?.backgroundColor ?? "") || "#ffffff"} onChange={(e) => setStyle("background-color", e.target.value, `Background of ${el.tagName.toLowerCase()}`)} /></label>
                  <label className={s.field}>Font size (px)<input type="number" min={8} max={160} className={s.input} key={`fs-${picked!.label}`} defaultValue={Math.round(parseFloat(cs?.fontSize ?? "16"))} onBlur={(e) => setStyle("font-size", `${e.target.value}px`, `Font size of ${el.tagName.toLowerCase()}`)} /></label>
                  <label className={s.field}>Weight
                    <select className={s.input} value={String(cs?.fontWeight ?? "400")} onChange={(e) => setStyle("font-weight", e.target.value, `Weight of ${el.tagName.toLowerCase()}`)}>
                      {["300", "400", "500", "600", "700", "800"].map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </label>
                  <label className={s.field}>Padding (px)<input type="number" min={0} max={240} className={s.input} key={`pd-${picked!.label}`} defaultValue={Math.round(parseFloat(cs?.paddingTop ?? "0"))} onBlur={(e) => setStyle("padding", `${e.target.value}px`, `Padding of ${el.tagName.toLowerCase()}`)} /></label>
                  <label className={s.field}>Corner radius (px)<input type="number" min={0} max={200} className={s.input} key={`br-${picked!.label}`} defaultValue={Math.round(parseFloat(cs?.borderTopLeftRadius ?? "0"))} onBlur={(e) => setStyle("border-radius", `${e.target.value}px`, `Corners of ${el.tagName.toLowerCase()}`)} /></label>
                  <label className={s.field}>Align
                    <select className={s.input} value={cs?.textAlign ?? "start"} onChange={(e) => setStyle("text-align", e.target.value, `Alignment of ${el.tagName.toLowerCase()}`)}>
                      {["start", "left", "center", "right", "justify"].map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            ) : (
              <div className={d.stack}>
                <p className={d.hint}>Click anything on the canvas to select it, or choose a part of the page below. Scroll the canvas with your mouse wheel.</p>
                <SectionPicker doc={doc} rev={rev} onPick={(t) => setPicked({ el: t, box: boxOf(t), label: describe(t) })} />
              </div>
            )
          ) : null}

          {mode === "code" ? (
            <div className={d.stack}>
              <div className={d.files} role="tablist" aria-label="Files">
                {Object.keys(draft).filter((f) => f.endsWith(".html") || f.endsWith(".css")).sort().map((f) => (
                  <button key={f} type="button" role="tab" aria-selected={codeFile === f} className={d.segBtn} onClick={() => setCodeFile(f)}>{f}{changed.some((c) => c.path === f) ? " •" : ""}</button>
                ))}
              </div>
              <label className={s.srOnly} htmlFor="kc-code">Source of {codeFile}</label>
              <textarea id="kc-code" className={d.code} spellCheck={false} value={draft[codeFile] ?? ""} onChange={(e) => { const v = e.target.value; setDraft((cur) => ({ ...cur, [codeFile]: v })); setNotes((n) => (n.includes(`Edited ${codeFile}`) ? n : [...n, `Edited ${codeFile}`])); }} />
              <div className={d.row}>
                <button type="button" className={s.btnGhost} onClick={() => reloadWith(draft)}>Refresh canvas</button>
                <span className={d.hint}>Plain HTML and CSS. Scripts are removed when you save.</span>
              </div>
            </div>
          ) : null}

          {mode === "ai" ? (
            <div className={d.stack}>
              {picked ? <p className={d.label}>Change: <code>{picked.label}</code></p> : <p className={d.hint}>Click the part of the page you want changed (a section, a card, a button), or choose it below.</p>}
              <SectionPicker doc={doc} rev={rev} onPick={(t) => setPicked({ el: t, box: boxOf(t), label: describe(t) })} />
              <label className={s.field}>What should change?
                <textarea className={s.textarea} rows={4} maxLength={600} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Make this a two-column layout with the image on the right" disabled={!picked || busy === "ai"} />
              </label>
              <button type="button" className={s.btnPrimary} onClick={() => void askAi()} disabled={!picked || instruction.trim().length < 3 || busy === "ai"}>{busy === "ai" ? "Working…" : "Propose change"}</button>
              <p className={d.hint}>AI sees only the selected element. Its change goes into the draft for you to check, undo or approve. Uses a small amount of your plan&rsquo;s usage.</p>
            </div>
          ) : null}

          <div className={d.changes} aria-live="polite">
            {error ? <p className={d.error} role="alert">{error}</p> : null}
            {status ? <p className={d.ok}>{status}</p> : null}
            <p className={d.label}>{dirty ? `Draft: ${changed.length} file${changed.length === 1 ? "" : "s"} changed (${changed.map((f) => `${f.path} +${f.plus} −${f.minus}`).join(", ")})` : "No unsaved changes"}</p>
            {notes.length ? <ul className={d.notes}>{notes.slice(-8).map((n, i) => <li key={`${i}-${n}`}>{n}</li>)}</ul> : null}
            <div className={d.row}>
              <button type="button" className={s.btnPrimary} onClick={() => void approve()} disabled={!dirty || busy === "save"}>{busy === "save" ? "Saving…" : "Approve and save"}</button>
              <button type="button" className={s.btnGhost} onClick={undoLast} disabled={!undo.length}>Undo</button>
              <button type="button" className={s.btnGhost} onClick={discard} disabled={!dirty}>Discard</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
