"use client";
/**
 * Solar 5.8 mode selector. Closed: "Solar 5.8 · <Mode>". Open: Light, Medium, High, Max, Ultimate+ with a one-line summary
 * and the real worst-case output credits per step from GET /api/studio/modes (computed from the prices a step is charged
 * with; nothing is hard-coded here). The choice is persisted (localStorage, try/catch) and the shell sends it with every
 * turn (useStudioAgent options.solarMode → body.mode). Ultimate+ uses UltimateMark's signature sequence.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { DEFAULT_SOLAR_MODE, isSolarModeId, SOLAR_MODES, type SolarModeCredits, type SolarModeId } from "@/lib/studio/solar-modes";
import { MorphIcon, Popover, UltimateMark } from "../ui";
import s from "./shell.module.css";

/* ── Persisted choice ──────────────────────────────────────────────────────────────────────────────────────────── */

export const SOLAR_MODE_KEY = "keplar.studio.solar-mode";
const EVENT = "ks-solar-mode";

function readMode(): SolarModeId {
  try {
    const v = window.localStorage.getItem(SOLAR_MODE_KEY);
    return isSolarModeId(v) ? v : DEFAULT_SOLAR_MODE;
  } catch {
    return DEFAULT_SOLAR_MODE;
  }
}

function subscribeMode(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function writeMode(m: SolarModeId): void {
  try {
    window.localStorage.setItem(SOLAR_MODE_KEY, m);
  } catch {
    /* storage blocked: the event below still updates this page */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The Solar mode, persisted per browser (and shared live between the page and the overlay window through `storage`). */
export function useSolarMode(): [SolarModeId, (m: SolarModeId) => void] {
  const mode = useSyncExternalStore(subscribeMode, readMode, () => DEFAULT_SOLAR_MODE);
  return [mode, writeMode];
}

/* ── Real credit figures (GET /api/studio/modes) ───────────────────────────────────────────────────────────────── */

type ModesResponse = { modes: { studio: SolarModeCredits[] | null; blender: SolarModeCredits[] | null } };
let modesRequest: Promise<ModesResponse | null> | null = null;

function loadModes(): Promise<ModesResponse | null> {
  modesRequest ??= fetch("/api/studio/modes", { credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<ModesResponse>) : null))
    .catch(() => null)
    .then((d) => {
      if (!d) modesRequest = null; // try again next time a selector mounts
      return d;
    });
  return modesRequest;
}

/** The mode table for one surface, or null while loading / when the server has no price right now (never a guess). */
function useModeCredits(surface: "studio" | "blender"): { table: SolarModeCredits[] | null; failed: boolean } {
  const [state, setState] = useState<{ data: ModesResponse | null; done: boolean }>({ data: null, done: false });
  useEffect(() => {
    let live = true;
    void loadModes().then((d) => { if (live) setState({ data: d, done: true }); });
    return () => { live = false; };
  }, []);
  return { table: state.data?.modes[surface] ?? null, failed: state.done && !state.data?.modes[surface] };
}

/* ── One-line summaries (accurate to the budgets in solar-modes.ts: thinking requested relative to Medium) ─────── */

const LINE: Record<SolarModeId, string> = {
  low: "Least thinking, lowest ceiling",
  medium: "Standard thinking budget",
  high: "About twice Medium's thinking",
  max: "About four times Medium's thinking",
  ultracode: "Deepest thinking, largest output cap",
};

const label = (m: SolarModeId) => SOLAR_MODES.find((x) => x.id === m)?.label ?? m;

export type SolarSelectorProps = {
  value: SolarModeId;
  onChange: (m: SolarModeId) => void;
  compact?: boolean;
  disabled?: boolean;
  /** Which surface's credit figures to show (Studio and Blender price steps differently). Default Roblox Studio. */
  env?: "roblox" | "blender";
};

export function SolarSelector({ value, onChange, compact, disabled, env = "roblox" }: SolarSelectorProps) {
  const [open, setOpen] = useState(false);
  const [selections, setSelections] = useState(0);
  const anchor = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { table, failed } = useModeCredits(env === "blender" ? "blender" : "studio");
  const index = Math.max(0, SOLAR_MODES.findIndex((m) => m.id === value));
  const ultimate = value === "ultracode";

  // Focus lands on the selected mode when the menu opens (after the popover is shown).
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const choose = (m: SolarModeId) => {
    if (m !== value) {
      onChange(m);
      setSelections((n) => n + 1);
    }
    setOpen(false);
    anchor.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus({ preventScroll: true }); };
    if (e.key === "ArrowDown") go(at < 0 ? 0 : at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={s.solarTrigger}
        data-compact={compact ? "" : undefined}
        data-ultimate={ultimate ? "" : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Solar 5.8 mode: ${label(value)}`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) { e.preventDefault(); setOpen(true); } }}
      >
        <UltimateMark active={ultimate} animateKey={selections} size={compact ? 14 : 16} label="" aria-hidden="true" />
        <span className={s.solarName}>Solar 5.8</span>
        <span className={s.solarSep} aria-hidden="true">·</span>
        <span className={s.solarMode}>{label(value)}</span>
        <span className={s.solarChevron}><MorphIcon icon="chevron" state={open ? "collapsed" : "expanded"} size={14} /></span>
      </button>
      <Popover open={open} onOpenChange={setOpen} anchorRef={anchor} label="Solar 5.8 mode" role="menu" initialFocus="none" align="start" onKeyDown={onKeyDown} className={s.solarMenu}>
        <div ref={list} className={s.solarList} style={{ ["--i" as string]: index }}>
          <span className={s.solarIndicator} aria-hidden="true" />
          {SOLAR_MODES.map((m) => {
            const row = table?.find((r) => r.id === m.id);
            const checked = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className={s.solarItem}
                title={row ? `${m.description} Up to ${row.outputCreditsMax.toLocaleString("en-US")} credits per step for the model's output, plus input, which grows with the conversation. Needs ${row.reserveCredits.toLocaleString("en-US")} credits available to start a step.` : m.description}
                onClick={() => choose(m.id)}
              >
                <span className={s.solarItemHead}>
                  <span className={s.solarItemLabel}>
                    {m.id === "ultracode" ? <UltimateMark active={checked} animateKey={selections} size={14} label="" aria-hidden="true" /> : null}
                    {m.label}
                  </span>
                  <span className={s.solarCredits}>
                    {row ? <>≤ {row.outputCreditsMax.toLocaleString("en-US")} cr</> : failed ? "—" : ""}
                  </span>
                </span>
                <span className={s.solarLine}>{LINE[m.id]}</span>
              </button>
            );
          })}
        </div>
        <div className={s.solarFoot}>
          <p className={s.solarNote}>{table ? "Output ceiling per step. Input is extra and grows with the conversation." : failed ? "Credit figures are unavailable right now." : "Loading credit figures…"}</p>
        </div>
      </Popover>
    </>
  );
}

/** For other shell parts: the mode's label ("Medium"). */
export const solarLabel = label;
