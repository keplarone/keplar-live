"use client";

import { useEffect, useState } from "react";
import { INSERT_PREF_EVENT, INSERT_PREF_KEY, insertEnabled } from "@/lib/typing/insert-mode";
import { Switch } from "@/components/kit";
import s from "./account.module.css";

/** Settings -> Typing. Device-local (localStorage), default off. */
export function TypingSettings() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { setOn(insertEnabled(localStorage.getItem(INSERT_PREF_KEY))); } catch { setOn(true); }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    try { if (next) localStorage.removeItem(INSERT_PREF_KEY); else localStorage.setItem(INSERT_PREF_KEY, "0"); } catch { /* storage blocked: keeps the default (on) */ }
    window.dispatchEvent(new Event(INSERT_PREF_EVENT));
  };
  return (
    <div className={s.panel}>
      <div className={s.prefRow}>
        <div className={s.prefText}><span className={s.prefLabel} id="insert-setting" aria-hidden="true">Insert key (overtype)</span></div>
        <Switch className={s.kSwitch} checked={on === true} onCheckedChange={toggle} label="Insert key (overtype)" hideLabel describedBy="insert-setting-d" disabled={on === null} />
      </div>
      <p className={s.note} id="insert-setting-d">
        The Insert key switches the Ask box and other text fields between INS and OVR. In OVR a typed character replaces the next one, a block caret and a small OVR badge show, and Enter, paste, undo and IME work as usual. On by default; typing stays normal insert until you press Insert. Turn this off and the Insert key does nothing special. Saved on this device. Nothing shows in normal insert mode; while OVR is on, click its badge to switch back.
      </p>
    </div>
  );
}
