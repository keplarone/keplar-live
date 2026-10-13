"use client";
/**
 * Settings that live on this device (src/lib/prefs.ts): Appearance, Accessibility, Chat, Notifications and the keyboard
 * shortcut list. Each control saves at once and applies at once (no Save button), like the theme control.
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import { PREF_DEFAULTS, playDoneSound, resetPrefs, setPrefs, type Prefs } from "@/lib/prefs";
import { usePrefs } from "@/lib/use-prefs";
import s from "./account.module.css";

type BoolKey = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs];

function Switch({ k, label, hint }: { k: BoolKey; label: string; hint?: ReactNode }) {
  const p = usePrefs();
  const id = useId();
  const on = p[k];
  return (
    <div className={s.prefRow}>
      <div className={s.prefText}>
        <span className={s.prefLabel} id={id}>{label}</span>
        {hint ? <span className={s.prefHint}>{hint}</span> : null}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className={s.tk} onClick={() => setPrefs({ [k]: !on } as Partial<Prefs>)}>
        <span className={s.tkKnob} aria-hidden="true" />
        <span className={s.tkText}>{on ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

function Choice<K extends keyof Prefs>({ k, label, hint, options }: { k: K; label: string; hint?: ReactNode; options: { value: Prefs[K]; label: string }[] }) {
  const p = usePrefs();
  const id = useId();
  return (
    <div className={s.prefRow}>
      <div className={s.prefText}>
        <span className={s.prefLabel} id={id}>{label}</span>
        {hint ? <span className={s.prefHint}>{hint}</span> : null}
      </div>
      <div role="radiogroup" aria-labelledby={id} className={s.seg}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={p[k] === o.value} className={s.segOpt} onClick={() => setPrefs({ [k]: o.value } as Partial<Prefs>)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

const DEVICE_NOTE = <p className={s.note}>Saved on this device and applied right away.</p>;

export function AppearancePrefs() {
  return (
    <div className={s.panel}>
      <Choice k="textSize" label="Text size" hint="Scales text across Keplar." options={[{ value: "sm", label: "Small" }, { value: "md", label: "Default" }, { value: "lg", label: "Large" }, { value: "xl", label: "Larger" }]} />
      <Choice k="font" label="Font" hint="Readable uses Atkinson Hyperlegible if installed, otherwise Verdana." options={[{ value: "default", label: "Default" }, { value: "serif", label: "Serif" }, { value: "readable", label: "Readable" }]} />
      <Choice k="chatWidth" label="Chat width" hint="How wide conversations run on large screens." options={[{ value: "default", label: "Default" }, { value: "wide", label: "Wide" }, { value: "full", label: "Full" }]} />
      <Switch k="codeWrap" label="Wrap long lines in code" hint="Code blocks wrap instead of scrolling sideways." />
      {DEVICE_NOTE}
    </div>
  );
}

export function AccessibilityPrefs() {
  return (
    <div className={s.panel}>
      <Switch k="reduceMotion" label="Reduce motion" hint="Turns off animations and smooth scrolling, even if your device allows them." />
      <Switch k="contrast" label="Increase contrast" hint="Darker secondary text, stronger borders and solid instead of see-through surfaces." />
      <Switch k="underlineLinks" label="Underline links" hint="So links never rely on color alone." />
      <Switch k="focusRings" label="Always show focus rings" hint="A clear outline around whatever has keyboard focus." />
      {DEVICE_NOTE}
    </div>
  );
}

export function ChatPrefs() {
  return (
    <div className={s.panel}>
      <Choice k="sendKey" label="Send with" hint={<>With Ctrl/⌘ + Enter, plain Enter adds a new line.</>} options={[{ value: "enter", label: "Enter" }, { value: "mod-enter", label: "Ctrl/⌘ + Enter" }]} />
      <Switch k="followStream" label="Follow the answer as it’s written" hint="Keeps the newest text in view. Off: the page stays where you are while the answer arrives." />
      <Switch k="spellcheck" label="Spell check in the Ask box" hint="Your browser’s spell checker underlines typos as you type." />
      {DEVICE_NOTE}
    </div>
  );
}

type Perm = NotificationPermission | "unsupported" | null;

export function NotificationPrefs() {
  const p = usePrefs();
  const id = useId();
  const [perm, setPerm] = useState<Perm>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission), 0);
    return () => window.clearTimeout(t);
  }, []);

  const toggleNotify = async () => {
    if (p.notifyDone) { setPrefs({ notifyDone: false }); return; }
    if (typeof Notification === "undefined") return;
    const r = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setPerm(r);
    if (r === "granted") setPrefs({ notifyDone: true });
  };

  return (
    <div className={s.panel}>
      <div className={s.prefRow}>
        <div className={s.prefText}>
          <span className={s.prefLabel} id={id}>Notify me when an answer is ready</span>
          <span className={s.prefHint}>
            A desktop notification when a long answer finishes while Keplar is in another tab or window.
            {perm === "denied" ? " Notifications are blocked for this site; allow them in your browser’s site settings first." : perm === "unsupported" ? " This browser doesn’t support notifications." : ""}
          </span>
        </div>
        <button type="button" role="switch" aria-checked={p.notifyDone} aria-labelledby={id} className={s.tk} disabled={perm === null || perm === "unsupported" || (perm === "denied" && !p.notifyDone)} onClick={() => void toggleNotify()}>
          <span className={s.tkKnob} aria-hidden="true" />
          <span className={s.tkText}>{p.notifyDone ? "On" : "Off"}</span>
        </button>
      </div>
      <Switch k="soundDone" label="Play a sound when an answer is ready" hint={<>A short two-note chime. <button type="button" className={s.link} onClick={playDoneSound}>Preview</button></>} />
      <p className={s.note}>Security emails (new sign-ins, password and two-factor changes) are always sent and can’t be turned off.</p>
      {DEVICE_NOTE}
    </div>
  );
}

const MOD = "Ctrl/⌘";
const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: [MOD, "K"], what: "Search chats and commands" },
  { keys: [MOD, "Shift", "O"], what: "New chat" },
  { keys: [MOD, ","], what: "Open Settings" },
  { keys: ["/"], what: "Jump to the Ask box" },
  { keys: ["Enter"], what: "Send (or Ctrl/⌘ + Enter, see Chat)" },
  { keys: ["Shift", "Enter"], what: "New line in the Ask box" },
  { keys: ["Esc"], what: "Stop the answer, close a menu or this dialog" },
  { keys: ["Insert"], what: "Switch typing between insert and overtype" },
];

export function ShortcutList() {
  return (
    <div className={s.panel}>
      <ul className={s.keys}>
        {SHORTCUTS.map((x) => (
          <li key={x.what} className={s.keyRow}>
            <span>{x.what}</span>
            <span className={s.keyCombo}>{x.keys.map((k, i) => <kbd key={i} className={s.kbd}>{k}</kbd>)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResetDevicePrefs() {
  const p = usePrefs();
  const changed = (Object.keys(PREF_DEFAULTS) as (keyof Prefs)[]).filter((k) => p[k] !== PREF_DEFAULTS[k]).length;
  return (
    <div className={s.panel}>
      <div className={s.row}>
        <span className={s.k}>{changed ? `${changed} device setting${changed === 1 ? "" : "s"} changed from the default` : "All device settings are at their defaults"}</span>
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={!changed} onClick={resetPrefs}>Reset</button>
      </div>
      <p className={s.note}>Resets appearance, accessibility, chat and notification settings on this device. Your account, memory and chats are not touched.</p>
    </div>
  );
}
