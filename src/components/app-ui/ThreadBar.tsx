"use client";

import { useEffect, useState } from "react";
import { Button, Dialog } from "@/components/kit";
import type { Thread } from "./state/types";
import { downloadText, exportFileName, threadToMarkdown } from "./chat-export";
import { ShareChatDialog } from "./parity/ShareChatDialog";
import s from "./ThreadBar.module.css";

/** Share this chat as a redacted link, export it as a Markdown file, and the keyboard shortcuts list. */
export function ThreadBar({ thread, signedIn = false }: { thread: Thread; signedIn?: boolean }) {
  const [help, setHelp] = useState(false);
  const [share, setShare] = useState(false);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  useEffect(() => {
    // "?" anywhere outside a field opens the list; the kit Dialog closes it (Escape, backdrop, Close, Done).
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "?" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setHelp(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const has = thread.messages.some((m) => m.role === "keplar" && (m.answer || m.draft));
  return (
    <>
      <div className={s.bar}>
        {has && !thread.private ? (
          <Button size="sm" variant="ghost" className={s.act} data-share-chat-open="" onClick={() => setShare(true)} aria-haspopup="dialog">
            Share chat
          </Button>
        ) : null}
        {has ? (
          <Button size="sm" variant="ghost" className={s.act} data-export="" onClick={() => downloadText(exportFileName(thread), threadToMarkdown(thread))}>
            Export chat
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className={s.act} onClick={() => setHelp(true)} aria-haspopup="dialog">
          Shortcuts
        </Button>
      </div>
      <Shortcuts open={help} mac={mac} onClose={() => setHelp(false)} />
      {share ? <ShareChatDialog thread={thread} signedIn={signedIn} onClose={() => setShare(false)} /> : null}
    </>
  );
}

function Shortcuts({ open, mac, onClose }: { open: boolean; mac: boolean; onClose: () => void }) {
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Keyboard shortcuts" size="sm" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <ul className={s.list} data-shortcuts="">
        {rows.map(([what, keys]) => (
          <li key={what}><span>{what}</span><kbd className={s.keys}>{keys}</kbd></li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Put your message back in the box to change it and send it again. */
export function EditMessage({ onEdit }: { onEdit: () => void }) {
  return (
    <Button size="sm" variant="ghost" className={`${s.act} ${s.edit}`} data-edit-message="" onClick={onEdit} aria-label="Edit this message">
      Edit
    </Button>
  );
}
