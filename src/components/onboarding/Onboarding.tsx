"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeplarSymbol } from "@/components/brand";
import { POPULAR_CONNECTORS } from "@/lib/mcp/popular";
import { INSERT_PREF_EVENT, INSERT_PREF_KEY, insertEnabled } from "@/lib/typing/insert-mode";
import { readThemePref, saveThemePref, type ThemePref } from "@/lib/theme";
import { LAST_STEP, STEPS, THEMES, USES, USE_HINT, USE_LABEL, legacyUseFor, type Answers, type Use } from "@/lib/onboarding/model";
import { writeUseFor } from "@/components/app-ui/use-for";
import type { SceneId } from "@/field/scenes";
import { AuthLost, finishOnboarding, saveStep, type Payload } from "./api";
import { boomFrom, fieldPersonalize, fieldScene, reducedMotion } from "./field-bus";
import s from "./onboarding.module.css";

const SCENES: SceneId[] = ["onb-welcome", "onb-purpose", "onb-prefs", "onb-connect", "onb-ready"];
const TITLES = ["Welcome", "What will you use Keplar for?", "Make it yours", "Connect an app", "You're set"];
const THEME_LABEL: Record<ThemePref, string> = { dark: "Dark", light: "Light", auto: "Auto" };
const PERSONALIZE_MS = 1100;
const PERSONALIZE_MS_REDUCED = 260;

type Keys = keyof Answers;
const first = (n: string) => n.trim().split(/\s+/)[0] ?? "";
const picksOf = (u: Use[] | undefined) => (u ?? []).map((x) => USES.indexOf(x)).filter((i) => i >= 0);

function Switch({ id, label, on, onChange, children }: { id: string; label: string; on: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className={s.row}>
      <div className={s.rowText}>
        <span id={`${id}-l`} className={s.rowLabel}>{label}</span>
        {children ? <p id={`${id}-d`} className={s.note}>{children}</p> : null}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={`${id}-l`} aria-describedby={children ? `${id}-d` : undefined} className={s.switch} onClick={(e) => { onChange(!on); boomFrom(e.currentTarget, 0.55); }}>
        <span className={s.knob} aria-hidden="true" />
        <span className={s.switchText}>{on ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

export function Onboarding({ initial, next, accountName }: { initial: Payload; next: string; accountName: string }) {
  const router = useRouter();
  const startStep = Math.min(LAST_STEP, Math.max(0, initial.state.step));
  const saved = initial.state.answers;
  const [step, setStep] = useState(startStep);
  const [uses, setUses] = useState<Use[]>(saved.uses ?? []);
  const [role, setRole] = useState(saved.role ?? "");
  const [name, setName] = useState(saved.name ?? accountName);
  const [theme, setTheme] = useState<ThemePref>(saved.theme ?? "dark");
  const [insertKey, setInsertKey] = useState(saved.insertKey ?? true);
  const [memory, setMemory] = useState(saved.memory ?? true);
  const [pers, setPers] = useState(false);
  const [note, setNote] = useState("");
  const [leaving, setLeaving] = useState(false);
  const touched = useRef(new Set<Keys>(Object.keys(saved) as Keys[]));
  const timer = useRef<number | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const live = initial.plan;

  // This device's real settings are the starting point (the server only knows what was answered before).
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (saved.theme === undefined) setTheme(readThemePref());
      if (saved.insertKey === undefined) { try { setInsertKey(insertEnabled(localStorage.getItem(INSERT_PREF_KEY))); } catch { /* keep default on */ } }
      if (saved.theme !== undefined) saveThemePref(saved.theme);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // The field follows the step; on a refresh it goes straight to the saved step's scene.
  useEffect(() => {
    fieldScene(SCENES[startStep], picksOf(saved.uses));
    return () => { fieldPersonalize(false); if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // Keyboard and screen-reader users land on the new step's heading.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const touch = (k: Keys) => touched.current.add(k);
  /** Only what the person actually answered is saved (a prefilled suggestion is not an answer until they continue past it). */
  const collect = useCallback((): Answers => {
    const all: Answers = { uses, role: role.trim(), name: name.trim(), theme, insertKey, memory };
    const out: Answers = {};
    for (const k of touched.current) {
      const v = all[k];
      if (v === undefined || (typeof v === "string" && !v)) continue;
      (out as Record<string, unknown>)[k] = v;
    }
    return out;
  }, [uses, role, name, theme, insertKey, memory]);

  const persist = useCallback((to: number, answers: Answers) => {
    queue.current = queue.current
      .then(() => saveStep(to, answers))
      .then(() => setNote(""))
      .catch((e) => {
        if (e instanceof AuthLost) { router.push(`/signin?next=${encodeURIComponent("/welcome")}`); return; }
        setNote("Couldn't save your progress just now. You can keep going.");
      });
  }, [router]);

  const advance = useCallback((to: number, answers: Answers) => {
    setPers(false);
    fieldPersonalize(false);
    setStep(to);
    fieldScene(SCENES[to], picksOf(answers.uses ?? uses));
    persist(to, answers);
  }, [persist, uses]);

  /** Move on. With `personalize`, the field turns inward for a moment ("Personalizing your experience…") before the next step. */
  const go = useCallback((to: number, o: { personalize?: boolean; save?: boolean } = {}) => {
    if (timer.current) return; // already moving; Skip still works
    const answers = o.save === false ? {} : collect();
    if (!o.personalize) return advance(to, answers);
    setPers(true);
    fieldPersonalize(true);
    fieldScene(SCENES[step], picksOf(uses));
    timer.current = window.setTimeout(() => {
      timer.current = null;
      advance(to, answers);
    }, reducedMotion() ? PERSONALIZE_MS_REDUCED : PERSONALIZE_MS);
  }, [advance, collect, step, uses]);

  const finish = useCallback(async (how: "complete" | "skip") => {
    if (leaving) return;
    setLeaving(true);
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    const answers = collect();
    try {
      await queue.current.catch(() => undefined);
      if (how === "complete" && touched.current.has("memory")) {
        await fetch("/api/memory", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: memory }), credentials: "same-origin" }).catch(() => undefined);
      }
      await finishOnboarding(how, answers);
    } catch (e) {
      if (e instanceof AuthLost) { router.push("/signin"); return; }
      // Never trap anyone here: the app opens either way, and the flow can be replayed from Settings.
    }
    const useFor = legacyUseFor({ uses });
    if (useFor) writeUseFor(useFor);
    fieldPersonalize(false);
    router.push(next);
  }, [collect, leaving, memory, next, router, uses]);

  const toggleUse = (u: Use, el: Element) => {
    touch("uses");
    setUses((cur) => (cur.includes(u) ? cur.filter((x) => x !== u) : [...cur, u]));
    boomFrom(el, 0.9);
  };
  const chooseTheme = (t: ThemePref, el: Element) => {
    touch("theme");
    setTheme(t);
    saveThemePref(t);
    boomFrom(el, 0.7);
  };
  const toggleInsert = (v: boolean) => {
    touch("insertKey");
    setInsertKey(v);
    try { if (v) localStorage.removeItem(INSERT_PREF_KEY); else localStorage.setItem(INSERT_PREF_KEY, "0"); } catch { /* storage blocked: the default (on) stays */ }
    window.dispatchEvent(new Event(INSERT_PREF_EVENT));
  };
  const toggleMemory = (v: boolean) => { touch("memory"); setMemory(v); };

  const submitWith = (e: FormEvent, fn: () => void) => { e.preventDefault(); fn(); };
  const display = first(name) || first(accountName);
  const goingToApp = /^\/app(?:[/?#]|$)/.test(next);
  const busy = pers || leaving;

  return (
    <div className={s.root} data-step={step} data-pers={pers || undefined}>
      <header className={s.top}>
        <span className={s.brand}><KeplarSymbol size={22} /> <span>Keplar One</span></span>
        <ol className={s.progress} aria-label="Setup progress">
          {STEPS.map((id, i) => (
            <li key={id} className={s.seg} data-state={i < step ? "done" : i === step ? "now" : "todo"} aria-current={i === step ? "step" : undefined}>
              <span className={s.srOnly}>{`Step ${i + 1}: ${TITLES[i]}${i < step ? ", done" : i === step ? ", current" : ""}`}</span>
            </li>
          ))}
        </ol>
        <button type="button" className={s.skipAll} onClick={() => void finish("skip")} disabled={leaving}>Skip setup</button>
      </header>

      <section className={s.card} aria-labelledby="ob-h" aria-busy={busy || undefined}>
        <div key={step} className={s.stepBody}>
          <p className={s.eyebrow}>Step {step + 1} of {STEPS.length}</p>
          <h1 id="ob-h" ref={heading} tabIndex={-1} className={s.title}>
            {step === 0 ? (display ? `Welcome, ${display}.` : "Welcome to Keplar.") : TITLES[step]}
          </h1>

          {step === 0 ? (
            <form onSubmit={(e) => submitWith(e, () => go(1))}>
              <p className={s.lead}>Keplar sends your question to several AI models, notices where they disagree, checks the disputed parts, and gives you one answer.</p>
              <p className={s.tagline}>One question. Multiple intelligences. One answer.</p>
              <p className={s.note}>Four short steps, about a minute. Every step can be skipped, and you can replay this from Settings.</p>
              <div className={s.actions}>
                <button type="submit" className={`${s.btn} ${s.primary}`} autoFocus data-testid="ob-start">Set up Keplar</button>
                <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => void finish("skip")} disabled={leaving}>Skip for now</button>
              </div>
            </form>
          ) : null}

          {step === 1 ? (
            <form onSubmit={(e) => submitWith(e, () => (uses.length ? (touch("uses"), go(2, { personalize: true })) : go(2)))}>
              <p className={s.lead}>Pick any that fit. Keplar uses this to suggest first questions, nothing else.</p>
              <div role="group" aria-labelledby="ob-h" className={s.chips}>
                {USES.map((u) => (
                  <button key={u} type="button" className={s.chip} aria-pressed={uses.includes(u)} onClick={(e) => toggleUse(u, e.currentTarget)} data-use={u}>
                    <span className={s.chipLabel}>{USE_LABEL[u]}</span>
                    <span className={s.chipHint}>{USE_HINT[u]}</span>
                  </button>
                ))}
              </div>
              <div className={s.field}>
                <label htmlFor="ob-role" className={s.label}>Your role <span className={s.optional}>(optional)</span></label>
                <input id="ob-role" className={s.input} value={role} maxLength={60} autoComplete="organization-title" placeholder="e.g. founder, student, nurse" onChange={(e) => { setRole(e.target.value); touch("role"); }} />
              </div>
              <div className={s.actions}>
                <button type="submit" className={`${s.btn} ${s.primary}`} disabled={busy} data-testid="ob-next">{uses.length ? "Continue" : "Continue without choosing"}</button>
                <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go(0, { save: false })} disabled={busy}>Back</button>
              </div>
            </form>
          ) : null}

          {step === 2 ? (
            <form onSubmit={(e) => submitWith(e, () => { (["name", "theme", "insertKey", "memory"] as Keys[]).forEach(touch); go(3, { personalize: true }); })}>
              <div className={s.field}>
                <label htmlFor="ob-name" className={s.label}>What should Keplar call you?</label>
                <input id="ob-name" className={s.input} value={name} maxLength={60} autoComplete="given-name" placeholder="Your first name" onChange={(e) => { setName(e.target.value); touch("name"); }} />
              </div>
              <fieldset className={s.fieldset}>
                <legend className={s.label}>Theme</legend>
                <div className={s.seg3}>
                  {THEMES.map((t) => (
                    <label key={t} className={s.radio} data-on={theme === t || undefined}>
                      <input type="radio" name="ob-theme" value={t} checked={theme === t} onChange={(e) => chooseTheme(t, e.currentTarget.parentElement ?? e.currentTarget)} />
                      <span>{THEME_LABEL[t]}</span>
                    </label>
                  ))}
                </div>
                <p className={s.note}>Auto follows your device. Saved on this device.</p>
              </fieldset>
              <Switch id="ob-insert" label="Insert key (overtype)" on={insertKey} onChange={toggleInsert}>
                The Insert key switches text fields between INS and OVR. Typing stays normal insert until you press it. Saved on this device.
              </Switch>
              <Switch id="ob-memory" label="Memory" on={memory} onChange={toggleMemory}>
                {memory
                  ? "On: after an answer, a free model picks out lasting things you told Keplar (like your name or goals) from your own messages, and uses them in later chats on any device you sign in on. It never reads files you upload and spends no credits. See, edit or erase it any time in Settings."
                  : "Off: nothing new is remembered and nothing saved is used. Each chat starts fresh. You can turn it on later in Settings."}
              </Switch>
              <div className={s.actions}>
                <button type="submit" className={`${s.btn} ${s.primary}`} disabled={busy} data-testid="ob-next">Continue</button>
                <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go(1, { save: false })} disabled={busy}>Back</button>
                <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go(3, { save: false })} disabled={busy}>Skip this step</button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <form onSubmit={(e) => submitWith(e, () => go(4))}>
              <p className={s.lead}>Optional. Connected apps let Keplar use tools you approve, like looking things up in documentation. You stay in control of every call.</p>
              {live.connectorsAllowed ? (
                <ul className={s.apps} aria-label="Apps you can connect">
                  {POPULAR_CONNECTORS.slice(0, 5).map((c) => (
                    <li key={c.id} className={s.app}>
                      <span className={s.appName}>{c.name.replace(" (BETA)", "")}</span>
                      <span className={s.badge} data-kind={c.auth === "oauth" ? "beta" : undefined}>{c.auth === "oauth" ? "Beta · OAuth" : c.auth === "bearer" ? "Needs a token" : "No sign-in"}</span>
                      <span className={s.appWhat}>{c.what.replace(/ Signs in with your .*$/, "")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={s.callout}>
                  <p><strong>Not available on your plan.</strong> Connected apps are part of Plus and above. You&apos;re on {live.id === "free" ? "Free" : "Lite"}, so this step is just a preview.</p>
                  <Link href="/pricing" target="_blank" rel="noopener" className={`${s.btn} ${s.secondary} ${s.small}`}>See plans (opens in a new tab)</Link>
                </div>
              )}
              <p className={s.note}>Signing in with Google or Microsoft doesn&apos;t give Keplar access to your mail, files or calendar.</p>
              <div className={s.divider} />
              <p className={s.sub}>Desktop app</p>
              <p className={s.note}>Keplar for Windows, macOS and Linux. The Download page lists only files that are actually published.</p>
              <Link href="/download" target="_blank" rel="noopener" className={`${s.btn} ${s.secondary} ${s.small}`}>Open the Download page (new tab)</Link>
              <div className={s.actions}>
                <button type="submit" className={`${s.btn} ${s.primary}`} disabled={busy} data-testid="ob-next">Continue</button>
                {live.connectorsAllowed ? <button type="button" className={`${s.btn} ${s.secondary}`} onClick={() => { try { sessionStorage.setItem("keplar.onboarding.open", "apps"); } catch { /* optional */ } void finish("complete"); }} disabled={busy}>Finish and open Connected apps</button> : null}
                <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go(2, { save: false })} disabled={busy}>Back</button>
                <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go(4, { save: false })} disabled={busy}>Skip this step</button>
              </div>
            </form>
          ) : null}

          {step === 4 ? (
            <form onSubmit={(e) => submitWith(e, () => void finish("complete"))}>
              <p className={s.lead}>{goingToApp ? "Next you'll land in Keplar with a first question ready to try." : "You can open Keplar any time from the menu."}</p>
              <dl className={s.summary}>
                {name.trim() ? (<><dt>Name</dt><dd>{name.trim()}</dd></>) : null}
                {uses.length ? (<><dt>Using it for</dt><dd>{uses.map((u) => USE_LABEL[u]).join(", ")}</dd></>) : null}
                <dt>Theme</dt><dd>{THEME_LABEL[theme]}</dd>
                <dt>Memory</dt><dd>{memory ? "On" : "Off"}</dd>
              </dl>
              <p className={s.note}>{live.line}</p>
              <div className={s.actions}>
                <button type="submit" className={`${s.btn} ${s.primary}`} disabled={leaving} aria-busy={leaving || undefined} data-testid="ob-finish">{leaving ? "Opening Keplar…" : goingToApp ? "Open Keplar" : "Continue"}</button>
                <button type="button" className={`${s.btn} ${s.ghost}`} onClick={() => go(3, { save: false })} disabled={busy}>Back</button>
              </div>
            </form>
          ) : null}
        </div>

        <div className={s.status} role="status" aria-live="polite">
          {pers ? <span className={s.personalizing}><span className={s.dots} aria-hidden="true"><i /><i /><i /></span>Personalizing your experience…</span> : note}
        </div>
      </section>
    </div>
  );
}
