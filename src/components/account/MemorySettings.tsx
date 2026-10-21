"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LearningConsent } from "./LearningConsent";
import { CorePrefs } from "./CorePrefs";
import { FaqConsent } from "./FaqConsent";
import { Switch } from "@/components/kit";
import s from "./account.module.css";

const MemoryConstellation = dynamic(() => import("@/components/spatial/MemoryConstellation").then((m) => m.MemoryConstellation), { ssr: false });

type Item = { id: string; text: string; kind: string; source: "auto" | "user"; createdAt: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

export function MemorySettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [withChats, setWithChats] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    api<{ enabled: boolean; items: Item[] }>("/api/memory").then((r) => { if (on) { setEnabled(r.enabled); setItems(r.items); } }).catch((e: Error) => on && setError(e.message));
    return () => { on = false; };
  }, []);

  const toggle = async () => {
    if (enabled === null) return;
    setError(""); setNote("");
    try { const r = await api<{ enabled: boolean }>("/api/memory", { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) }); setEnabled(r.enabled); } catch (e) { setError((e as Error).message); }
  };
  const remove = async (id: string) => {
    setError("");
    try { await api(`/api/memory/items/${id}`, { method: "DELETE" }); setItems((v) => v.filter((i) => i.id !== id)); setNote("Deleted."); } catch (e) { setError((e as Error).message); }
  };
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const saveEdit = async () => {
    if (!editing) return;
    setError(""); setNote("");
    try { const r = await api<{ item: Item }>(`/api/memory/items/${editing.id}`, { method: "PATCH", body: JSON.stringify({ text: editing.text }) }); setItems((v) => v.map((i) => (i.id === r.item.id ? r.item : i))); setEditing(null); setNote("Saved."); } catch (e) { setError((e as Error).message); }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setNote("");
    try {
      const r = await api<{ item: Item | null }>("/api/memory", { method: "POST", body: JSON.stringify({ text }) });
      setText("");
      // null: the server already had it. Saving can also replace or drop older notes, so the list is read again.
      setNote(r.item ? "Saved." : "Already saved.");
      const fresh = await api<{ enabled: boolean; items: Item[] }>("/api/memory").catch(() => null);
      if (fresh) setItems(fresh.items);
      else if (r.item) setItems((v) => [r.item!, ...v.filter((i) => i.id !== r.item!.id)]);
    } catch (er) { setError((er as Error).message); }
  };
  const erase = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const r = await api<{ memory: number; chats: number }>("/api/memory/erase", { method: "POST", body: JSON.stringify({ confirm: true, chats: withChats }) });
      setItems([]); setConfirming(false);
      setNote(`Deleted ${r.memory} remembered ${r.memory === 1 ? "item" : "items"}${withChats ? ` and ${r.chats} saved ${r.chats === 1 ? "chat" : "chats"}` : ""}. This is permanent.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className={s.panel} id="memory" aria-labelledby="memory-h">
      <div className={s.prefRow}>
        <h2 id="memory-h" className={s.cardTitle}>Memory</h2>
        <Switch className={s.kSwitch} checked={enabled ?? false} onCheckedChange={() => void toggle()} label="Memory" hideLabel describedBy="memory-h-d" disabled={enabled === null} />
      </div>
      <p className={s.note} id="memory-h-d">When memory is on, Keplar can remember durable things you tell it, such as your name, goals and preferences, and use them to answer better. A free model picks them out of your own messages after an answer; it never reads documents you upload, and it doesn&rsquo;t use your credits. It never saves passwords, card numbers, birthdates or other secrets, and it only uses what you actually told it. You can edit or delete any note. Signed-out chats use no memory at all. When it&rsquo;s off, nothing new is saved and nothing saved is used. Notes also cover how you like answers written and things you correct, so Keplar can adapt from your next message on; the AI models themselves are not retrained. On the Free plan, saved memory is not sent to the free models and no model learns new memory from Free chats, because the hosts of free models may log prompts and use them to improve their models; it is used again on a paid plan.</p>
      {error ? <p className={`${s.note} ${s.err}`} role="alert">{error}</p> : null}
      {note ? <p className={`${s.note} ${s.ok}`} role="status">{note}</p> : null}
      <form className={s.form} onSubmit={add}>
        <label className={s.fieldLabel} htmlFor="mem-add">Add something for Keplar to remember</label>
        <input id="mem-add" className={s.input} value={text} maxLength={220} onChange={(e) => setText(e.target.value)} placeholder="e.g. I prefer short answers" />
        <div className={s.actions}><button type="submit" className={`${s.btn} ${s.btnGhost}`} disabled={text.trim().length < 4 || enabled === false}>Save</button></div>
      </form>
      {items.length ? <MemoryConstellation items={items} /> : null}
      {items.length ? (
        <ul style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", listStyle: "none", padding: 0, margin: 0 }} aria-label="Remembered items">
          {items.map((i) => (
            <li key={i.id} className={s.row} style={{ alignItems: "center", borderTop: "1px solid var(--hairline)", paddingTop: "var(--s-2)" }}>
              {editing?.id === i.id ? (
                <>
                  <input className={s.input} style={{ flex: 1, minWidth: 0 }} value={editing.text} maxLength={220} aria-label="Edit this note" onChange={(e) => setEditing({ id: i.id, text: e.target.value })} />
                  <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => void saveEdit()} disabled={editing.text.trim().length < 4}>Save</button>
                  <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{i.text} <span className={s.badge}>{i.source === "user" ? "You added" : "Learned"}</span></span>
                  <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setEditing({ id: i.id, text: i.text })} aria-label={`Edit: ${i.text}`}>Edit</button>
                  <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => void remove(i.id)} aria-label={`Delete: ${i.text}`}>Delete</button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : <p className={s.note}>{enabled === null ? "Loading…" : "Nothing remembered yet."}</p>}
      {!confirming ? (
        <div className={s.actions}><button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setConfirming(true)}>Erase all memory</button></div>
      ) : (
        <div className={s.panel} role="alertdialog" aria-labelledby="mem-erase-h">
          <p id="mem-erase-h" className={s.v}>Permanently delete everything Keplar remembers about you?</p>
          <label className={s.note} style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
            <input type="checkbox" checked={withChats} onChange={(e) => setWithChats(e.target.checked)} /> Also delete my saved chat history
          </label>
          <p className={s.note}>This removes the data from our servers. It can&rsquo;t be undone.</p>
          <div className={s.actions}>
            <button type="button" className={s.btn} onClick={() => void erase()} disabled={busy}>{busy ? "Deleting…" : "Yes, erase"}</button>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
      <p className={s.note}>You can also say &ldquo;forget that&rdquo;, &ldquo;erase my memory&rdquo; or &ldquo;remember that&hellip;&rdquo; in a chat.</p>
      <LearningConsent />
      <CorePrefs />
      <FaqConsent />
    </div>
  );
}
