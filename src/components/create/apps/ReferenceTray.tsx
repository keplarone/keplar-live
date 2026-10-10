"use client";
/**
 * Create: references. A site, screenshot or document the person wants the app to take cues from. Keplar reads each one
 * into a short design brief (section flow, palette, type, tone) that rides with the build prompt as inspiration only;
 * text, logos and layouts are never copied (REFERENCE_RULES). Links are read server-side through the SSRF-safe reader,
 * images by a vision model (free models on Free), documents by the same extractor chat uses.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AttachTray, type TrayItem } from "@/components/app-ui/AttachTray";
import { GlyphLink, GlyphUpload } from "@/components/app-ui/attach-glyphs";
import { readDocument, readLink } from "@/components/app-ui/doc-client";
import { prepareImage } from "@/components/app-ui/media-client";
import { hostOf, kindOfFile, urlsIn, type AttachKind } from "@/lib/attachments/kinds";
import { linkBrief, referenceBlock } from "@/lib/attachments/reference-brief";
import css from "./ReferenceTray.module.css";

const MAX_REFS = 4;
/** Mirrors the server's per-plan prompt cap (lib/app-builder/pipeline.ts PROMPT_MAX). */
const PROMPT_CAP: Record<string, number> = { free: 2_000, lite: 4_000, plus: 8_000, pro: 12_000, business: 16_000 };
const REF_SHARE: Record<string, number> = { free: 700, lite: 1_400, plus: 2_400, pro: 3_000, business: 3_000 };

/** The build prompt with the reference briefs appended, kept inside the plan's prompt cap. */
export function withReferences(prompt: string, briefs: string[], plan = "free"): string {
  if (!briefs.length) return prompt;
  const cap = PROMPT_CAP[plan] ?? PROMPT_CAP.free;
  const budget = Math.min(REF_SHARE[plan] ?? REF_SHARE.free, cap - prompt.length - 16);
  return prompt + referenceBlock(briefs, budget);
}

type Ref = TrayItem & { brief?: string };

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const FILE_ACCEPT = `${IMAGE_ACCEPT},.pdf,.docx,.pptx,.txt,.md,.rtf`;

function docBrief(name: string, text: string): string {
  const clean = text.replace(/\[Page \d+\]\s*/g, "").replace(/\s+/g, " ").trim();
  return `Reference document: ${name}\nKey content (paraphrase, don't copy): ${clean.slice(0, 520)}`;
}

export function ReferenceTray({ onChange, disabled, plan, className, labelClass }: { onChange: (briefs: string[]) => void; disabled?: boolean; plan?: string; className?: string; labelClass?: string }) {
  const uid = useId();
  const [refs, setRefs] = useState<Ref[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const aborts = useRef(new Map<string, AbortController>());
  const free = !plan || plan === "free";

  useEffect(() => { onChange(refs.filter((r) => r.status !== "processing" && r.status !== "error" && r.brief).map((r) => r.brief!)); }, [refs, onChange]);
  useEffect(() => { const a = aborts.current; return () => a.forEach((c) => c.abort()); }, []);

  const patch = (id: string, p: Partial<Ref>) => setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const room = useCallback((n = 1) => {
    if (refs.length + n > MAX_REFS) { setError(`Up to ${MAX_REFS} references.`); return false; }
    setError(null);
    return true;
  }, [refs.length]);

  const addLink = useCallback((raw: string) => {
    const url = urlsIn(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`, 1)[0];
    if (!url) { setError("That doesn't look like a web address."); return; }
    if (refs.some((r) => r.href === url)) { setDraft(""); return; }
    if (!room()) return;
    const id = `ref-${Math.random().toString(36).slice(2)}`;
    const host = hostOf(url);
    const ctrl = new AbortController();
    aborts.current.set(id, ctrl);
    setRefs((p) => [...p, { id, name: host, kind: "link", host, href: url, status: "processing", sub: "Reading the site…" }]);
    setDraft("");
    readLink(url, { purpose: "reference", signal: ctrl.signal })
      .then(({ read }) => {
        const palette = read.design?.palette ?? [];
        const brief = read.kind === "page" || read.kind === "youtube" ? linkBrief(read.title, read.host, read.design, read.description) : docBrief(read.title || read.host, read.text);
        const bits = [read.design?.sections.length ? `${read.design.sections.length} sections` : "", read.design?.fonts[0] ?? "", palette.length ? `${palette.length} colors` : ""].filter(Boolean);
        patch(id, { name: read.title || read.host, host: read.host, favicon: read.favicon, href: read.finalUrl, status: "ready", sub: bits.length ? `${read.host} · ${bits.join(" · ")}` : read.host, swatches: palette.slice(0, 6), brief, note: "Used as inspiration for structure, palette and tone. Text and logos aren't copied." });
      })
      .catch((e: Error) => { if (!ctrl.signal.aborted) patch(id, { status: "error", sub: e.message }); })
      .finally(() => aborts.current.delete(id));
  }, [refs, room]);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length || !room(files.length)) return;
    for (const file of files) {
      const kind = kindOfFile(file) as AttachKind | null;
      const id = `ref-${Math.random().toString(36).slice(2)}`;
      if (kind === "image") {
        setRefs((p) => [...p, { id, name: file.name, kind: "image", status: "processing", sub: "Reading the design…" }]);
        prepareImage(file, 2_400_000)
          .then(async (img) => {
            patch(id, { thumb: img.thumb });
            const res = await fetch("/api/keplar/reference", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: img.images[0] }) });
            const data = (await res.json().catch(() => null)) as { brief?: string; error?: string } | null;
            if (!res.ok || !data?.brief) throw new Error(res.status === 401 ? "Sign in to use image references." : data?.error ?? "Couldn't read that image.");
            const palette = [...new Set(data.brief.match(/#[0-9a-f]{6}\b/gi) ?? [])].slice(0, 6);
            patch(id, { status: "ready", sub: `Screenshot · ${palette.length ? `${palette.length} colors` : "layout and mood"}`, swatches: palette, brief: `Reference image (${file.name}):\n${data.brief}`, note: data.brief });
          })
          .catch((e: Error) => patch(id, { status: "error", sub: e.message }));
      } else if (kind && kind !== "video" && kind !== "audio") {
        setRefs((p) => [...p, { id, name: file.name, kind, status: "processing", sub: "Reading…" }]);
        readDocument(file)
          .then((d) => patch(id, { status: "ready", sub: d.summary || "Read", brief: docBrief(d.title || file.name, d.text), note: free ? "On Free, only a short excerpt goes into the build prompt." : undefined }))
          .catch((e: Error) => patch(id, { status: "error", sub: e.message }));
      } else {
        setError("Add a site link, a screenshot or a document (PDF, Word, PowerPoint, text).");
      }
    }
  }, [free, room]);

  const remove = (id: string) => {
    aborts.current.get(id)?.abort();
    setRefs((p) => p.filter((r) => r.id !== id));
  };

  return (
    <section
      className={`${className ?? ""} ${css.refs}`}
      aria-labelledby={`${uid}-label`}
      data-dragging={dragging || undefined}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
    >
      <div className={css.head}>
        <h3 id={`${uid}-label`} className={labelClass}>References <span className={css.optional}>optional</span></h3>
        <p className={css.hint} id={`${uid}-hint`}>A site, screenshot or doc to take cues from: structure, palette, tone. Never copied.</p>
      </div>
      <div className={css.controls}>
        <label className={css.linkField}>
          <GlyphLink size={15} />
          <input
            type="url"
            inputMode="url"
            enterKeyHint="go"
            className={css.linkInput}
            placeholder="Paste a site you like"
            value={draft}
            disabled={disabled}
            aria-describedby={`${uid}-hint`}
            aria-label="Reference site address"
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) { e.preventDefault(); addFiles(files); }
            }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) addLink(draft); } }}
          />
          <button type="button" className={css.add} disabled={disabled || !draft.trim()} onClick={() => addLink(draft)}>Read</button>
        </label>
        <button type="button" className={css.upload} disabled={disabled} onClick={() => fileRef.current?.click()}>
          <GlyphUpload size={15} />
          <span>Screenshot or file</span>
        </button>
        <input ref={fileRef} type="file" hidden multiple accept={FILE_ACCEPT} tabIndex={-1} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {error ? <p className={css.error} role="alert">{error}</p> : null}
      <AttachTray items={refs} onRemove={remove} label="References" />
    </section>
  );
}
