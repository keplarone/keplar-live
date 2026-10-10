"use client";
import { useState } from "react";
import { imageSlotPrompt, listImageSlots, listSections, regeneratePrompt } from "@/lib/site-builder/sections";
import s from "./create.module.css";
import b from "./builder.module.css";

/** Pick one block of one page and ask for just that block again. It sends a scoped change request through the normal edit path (same credits as any edit). */
export function SectionsPane({ files, disabled, onRegenerate }: { files: Record<string, string>; disabled: boolean; onRegenerate: (prompt: string) => void }) {
  const pages = Object.keys(files).filter((f) => f.endsWith(".html")).sort((a, c) => (a === "index.html" ? -1 : c === "index.html" ? 1 : a.localeCompare(c)));
  const [page, setPage] = useState(pages[0] ?? "");
  const active = pages.includes(page) ? page : pages[0] ?? "";
  const sections = active ? listSections(files[active] ?? "") : [];
  const slots = active ? listImageSlots(files[active] ?? "") : [];
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState("");
  if (!pages.length) return <div className={b.pane}><p className={s.muted} data-testid="sections-empty">Nothing to regenerate yet. Build the site first, then you can redo one section at a time.</p></div>;
  return (
    <div className={b.pane} data-testid="sections-pane">
      <div className={b.row}>
        <label className={b.field}><span>Page</span>
          <select className={s.input} value={active} onChange={(e) => { setPage(e.target.value); setOpen(null); }} aria-label="Page">
            {pages.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      {sections.length === 0 ? (
        <p className={s.muted} data-testid="sections-none">This page has no separate sections I can find. Ask for the change in chat instead.</p>
      ) : (
        <ul className={b.card} style={{ listStyle: "none", margin: 0, display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
          {sections.map((sec) => (
            <li key={sec.index} data-testid="section-row" style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
              <div className={b.row} style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{sec.title}</div>
                  <div className={b.hint}>{sec.tag}{sec.id ? ` #${sec.id}` : ""} · {sec.chars.toLocaleString("en-US")} characters of text</div>
                </div>
                <button type="button" className={s.iconBtn} disabled={disabled} aria-expanded={open === sec.index} onClick={() => { setOpen(open === sec.index ? null : sec.index); setNote(""); }}>Regenerate</button>
              </div>
              {open === sec.index ? (
                <div className={b.field}>
                  <span>What should change? (optional)</span>
                  <textarea className={s.textarea} rows={2} maxLength={400} placeholder="Leave empty for a fresh take, or say what you want." value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className={b.row}>
                    <button type="button" className={s.btn} disabled={disabled} onClick={() => { onRegenerate(regeneratePrompt(active, sec, note)); setOpen(null); setNote(""); }}>Regenerate this section</button>
                    <span className={b.hint}>Only this block is meant to change. It counts as one edit, and you can undo it in History.</span>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className={b.card} data-testid="image-slots">
        <strong>Pictures on this page</strong>
        {slots.length === 0 ? (
          <p className={b.hint} data-testid="slots-none">No pictures or photo placeholders on this page.</p>
        ) : (
          <ul className={b.list}>
            {slots.map((sl, i) => (
              <li key={i} className={b.item} data-testid="slot-row">
                <div className={b.itemMain}>
                  <strong style={{ overflowWrap: "anywhere" }}>{sl.label}</strong>
                  <small>{sl.kind === "placeholder" ? "Photo placeholder" : "Image"}{sl.issue ? ` · ${sl.issue}` : " · looks fine"}</small>
                </div>
                {sl.issue || sl.kind === "placeholder" ? <button type="button" className={s.iconBtn} disabled={disabled} onClick={() => onRegenerate(imageSlotPrompt(active, sl, i))}>Make a better visual</button> : null}
              </li>
            ))}
          </ul>
        )}
        <p className={b.hint}>Keplar draws these as inline SVG or geometric art so the site never depends on another website. Real photos can be made in the Images tab; placing them into a site is not built yet.</p>
      </div>
    </div>
  );
}
