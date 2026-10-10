"use client";

import { useEffect, useRef, useState } from "react";
import type { Thread } from "./state/types";
import { downloadText, exportFileName, threadToMarkdown } from "./chat-export";
import { ShareChatDialog } from "./parity/ShareChatDialog";
import s from "./ThreadBar.module.css";
import { usePresence } from "@/components/motion/usePresence";

/** Share this chat as a redacted link, export it as a Markdown file, and the keyboard shortcuts list. */
export function ThreadBar({ thread, signedIn = false }: { thread: Thread; signedIn?: boolean }) {
  const [help, setHelp] = useState(false);
  const [share, setShare] = useState(false);
  const helpBox = usePresence(help); // the shortcuts list fades and shrinks out on every close path (Escape, scrim, Close)
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "?" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setHelp(true); }
      else if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const has = thread.messages.some((m) => m.role === "keplar" && (m.answer || m.draft));
  return (
    <>
      <div className={s.bar}>
        {has && !thread.private ? (
          <button type="button" className={s.btn} data-share-chat-open onClick={() => setShare(true)} aria-haspopup="dialog">
            Share chat
          </button>
        ) : null}
        {has ? (
          <button type="button" className={s.btn} data-export onClick={() => downloadText(exportFileName(thread), threadToMarkdown(thread))}>
            Export chat
          </button>
        ) : null}
        <button type="button" className={s.btn} onClick={() => setHelp(true)} aria-haspopup="dialog">
          Shortcuts
        </button>
      </div>
      {helpBox.mounted ? <Shortcuts mac={mac} onClose={() => setHelp(false)} motion={helpBox.motion} /> : null}
      {share ? <ShareChatDialog thread={thread} signedIn={signedIn} onClose={() => setShare(false)} /> : null}
    </>
  );
}

function Shortcuts({ mac, onClose, motion }: { mac: boolean; onClose: () => void; motion: ReturnType<typeof usePresence>["motion"] }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const mod = mac ? "⌘" : "Ctrl";
  const rows: [string, string][] = [
    ["Search chats and go anywhere", `${mod} K`],
    ["New chat", `${mod} Shift O`],
    ["Focus the message box", "/"],
    ["Send", "Enter"],
    ["New line", "Shift Enter"],
    ["Stop an answer", "Esc"],
    ["Show this list", "?"],
  ];
  return (
    <div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} {...motion("fade")}>
      <div className={s.panel} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" data-shortcuts {...motion("pop", false)}>
        <h2>Keyboard shortcuts</h2>
        <ul className={s.list}>
          {rows.map(([what, keys]) => (
            <li key={what}><span>{what}</span><span className={s.keys}>{keys}</span></li>
          ))}
        </ul>
        <button type="button" ref={ref} className={s.btn} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Put your message back in the box to change it and send it again. */
export function EditMessage({ onEdit }: { onEdit: () => void }) {
  return (
    <button type="button" className={s.edit} data-edit-message onClick={onEdit} aria-label="Edit this message">
      Edit
    </button>
  );
}
