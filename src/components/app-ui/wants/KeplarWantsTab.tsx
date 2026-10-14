"use client";
/**
 * Keplar Wants (/app/wants): a chat whose every message starts with "I want". Keplar asks the follow-up questions that matter
 * (tappable rows, or type your own), then does it right here: builds the app (the same in-chat Create pipeline), builds the
 * Roblox game (Keplar Studio inline, desktop app), finds places near you and takes the order through to checkout after you
 * confirm, plans big goals with 2–3 of its 128 experts and hands the first steps to Palmo, or searches and books.
 *
 * The conversation state lives in the page (and this browser's storage, so a reload keeps it); every turn goes to
 * POST /api/keplar/wants/orchestrate, which streams progress and the next card.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "../Markdown";
import { CreateTurn } from "../create/CreateTurn";
import type { ChatCreate, KeplarMessage, Ledger } from "../state/types";
import { Workspace } from "../studio-mode/workspace/Workspace";
import { offerDraft } from "../studio-mode/workspace/draft";
import { acceptChange, clampSel, onKey, P, PREFIX, replaceSel, userText } from "./prefix-input";
import { checkPin, hasPin, launchPalmo, palmo, saveDelivery, savedDelivery, setPin, studioBridge, type DeliveryService } from "./palmo";
import s from "./wants.module.css";

/* ── wire types (mirror src/lib/wants/engine.ts; kept loose: the server re-validates everything) ── */
type Option = { label: string; value?: string; hint?: string; other?: boolean };
type Place = { id: string; name: string; address?: string; distanceKm: number; priceLevel: number; priceNote: string; url?: string };
type Card =
  | { kind: "question"; slot: string; question: string; options: Option[]; multi?: boolean; placeholder?: string; step: number; total: number }
  | { kind: "location"; question: string }
  | { kind: "places"; places: Place[]; note: string }
  | { kind: "fulfilment"; place: Place }
  | { kind: "address"; suggestion?: string }
  | { kind: "connect_delivery"; place: Place }
  | { kind: "confirm_order"; item: string; place: Place; fulfilment: "delivery" | "pickup"; address?: string; delivery?: DeliveryService; confirmWith?: "pin" | "are_you_sure"; feeNote?: string }
  | { kind: "place_order"; goal: string; link: string; service?: string; place: Place; item: string; note?: string; connector?: Connector }
  /** Swarm backend: generated source files written to the person's contained workspace (services/keplar-wants-swarm). */
  | { kind: "workspace"; name: string; platform: "web" | "roblox"; root: string; files: { path: string; bytes: number }[]; prompt: string }
  | { kind: "build_app"; prompt: string }
  | { kind: "roblox"; prompt: string }
  | { kind: "browse"; goal: string; url: string; site: string; bookGoal: string }
  | { kind: "ride"; url: string; to: string }
  | { kind: "answer"; markdown: string; nextSteps: string[]; experts: { n: number; name: string }[]; verified: boolean; palmoGoal?: string }
  | { kind: "refuse"; reply: string }
  | { kind: "error"; message: string };
type Connector = { id: string; name: string; status: "available" | "needs_credentials" | "placeholder"; how?: string };
type Trace =
  | { stage: "gate"; experts: { n: number; id: string; name: string; matched: string[] }[]; asleep: number }
  | { stage: "plan"; subtasks: { expert: string; task: string }[] }
  | { stage: "expert"; expert: string; status: "working" | "done" | "failed" }
  | { stage: "verify"; ok: boolean; issues: number }
  | { stage: "revise"; expert: string }
  | { stage: "final" };
type WantsState = Record<string, unknown> & { want: string; intent: string };
type Input = Record<string, unknown>;

type Entry =
  | { id: string; who: "you"; text: string }
  | { id: string; who: "keplar"; card?: Card; say?: string[]; trace?: Trace[]; busy?: boolean; done?: boolean };

const STORE = "keplar:wants:thread";
const STARTERS = ["to build an app", "to build a Roblox game", "a coffee", "a million dollars", "to book an Airbnb this weekend", "a new laptop under $1,000", "a ride to the airport", "to learn to code in 30 days"];
let seq = 0;
const nid = () => `w${Date.now().toString(36)}${(++seq).toString(36)}`;

function load(): { entries: Entry[]; state: WantsState | null; label: string } {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const v = JSON.parse(raw) as { entries: Entry[]; state: WantsState | null; label: string };
      // A turn that was still running when the page closed can't resume: show it as finished.
      return { ...v, entries: v.entries.map((e) => (e.who === "keplar" && e.busy ? { ...e, busy: false, card: e.card ?? { kind: "error", message: "This step was interrupted. Send it again." } } : e)) };
    }
  } catch { /* storage off: start fresh */ }
  return { entries: [], state: null, label: "" };
}

export function KeplarWantsTab({ ledger, onSettled, onOpenCreate }: { ledger: Ledger; onSettled: () => void; onOpenCreate?: (t: { id?: string; prompt?: string }) => void }) {
  // The app shell is client-only (AppLoader, ssr: false), so the saved thread can be read on the first render.
  const [saved] = useState(load);
  const [entries, setEntries] = useState<Entry[]>(saved.entries);
  const [state, setState] = useState<WantsState | null>(saved.state);
  const [label, setLabel] = useState(saved.label);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ entries: entries.slice(-60), state, label })); } catch { /* full or off */ }
  }, [entries, state, label]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [entries.length]);

  // The card waiting for the person (the newest Keplar card): typing answers it.
  const active = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) { const e = entries[i]!; if (e.who === "keplar") return e.card ?? null; }
    return null;
  }, [entries]);
  const answering = active && !busy && (active.kind === "question" || active.kind === "location" || active.kind === "address") ? active : null;

  const patch = (id: string, f: (e: Entry & { who: "keplar" }) => Entry) => setEntries((all) => all.map((e) => (e.id === id && e.who === "keplar" ? f(e) : e)));

  const turn = useCallback(async (input: Input, shown: string | null, from: WantsState | null) => {
    if (busy) return;
    setBusy(true);
    const kid = nid();
    setEntries((all) => [...all, ...(shown ? [{ id: nid(), who: "you" as const, text: shown }] : []), { id: kid, who: "keplar", busy: true, trace: [], say: [] }]);
    try {
      const res = await fetch("/api/keplar/wants/orchestrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: input.want ? null : from, input }) });
      if (!res.ok || !res.body) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        const message = res.status === 401 ? "Sign in to use Keplar Wants." : d.error ?? "Keplar couldn't be reached. Try again.";
        patch(kid, (e) => ({ ...e, busy: false, card: { kind: "error", message } }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: { type: string; [k: string]: unknown };
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "state") { setState(ev.state as WantsState); setLabel(String(ev.label ?? "")); }
          else if (ev.type === "trace") patch(kid, (e) => ({ ...e, trace: [...(e.trace ?? []), ev.event as Trace] }));
          else if (ev.type === "say") patch(kid, (e) => ({ ...e, say: [...(e.say ?? []), String(ev.text)] }));
          else if (ev.type === "card") patch(kid, (e) => ({ ...e, card: ev.card as Card }));
          else if (ev.type === "billed") onSettled();
        }
      }
      patch(kid, (e) => ({ ...e, busy: false, card: e.card ?? { kind: "error", message: "Keplar didn't finish that step. Try again." } }));
    } catch {
      patch(kid, (e) => ({ ...e, busy: false, card: { kind: "error", message: "The connection dropped. Try again." } }));
    } finally {
      setBusy(false);
    }
  }, [busy, onSettled]);

  const send = (raw?: string) => {
    const v = (raw ?? text).replace(/\s+/g, " ").trim();
    if (!v || busy) return;
    setText("");
    if (answering?.kind === "question") return void turn({ slot: answering.slot, answer: v }, v, state);
    if (answering?.kind === "location") return void turn({ location: { query: v } }, v, state);
    if (answering?.kind === "address") return void turn({ address: v }, v, state);
    // The whole sentence goes to the orchestrator with the prefix intact ("I want a coffee"); it strips it itself.
    const full = `${PREFIX}${v.replace(/^i\s+want\s+/i, "")}`;
    void turn({ want: full }, full, null);
  };

  /* ── the fixed "I want " prefix (prefix-input.ts): the box always holds PREFIX + text, the caret never enters it ── */
  const value = PREFIX + text;
  const place = (caret: number) => requestAnimationFrame(() => { const el = inputRef.current; if (el) el.setSelectionRange(caret, caret); });
  const commit = (v: string, caret?: number) => { setText(userText(v)); if (caret !== undefined) place(caret); };
  const clampNow = () => {
    const el = inputRef.current;
    if (!el) return;
    const c = clampSel({ start: el.selectionStart ?? P, end: el.selectionEnd ?? P });
    if (c.start !== el.selectionStart || c.end !== el.selectionEnd) el.setSelectionRange(c.start, c.end, el.selectionDirection ?? "none");
  };
  const sel = () => ({ start: inputRef.current?.selectionStart ?? value.length, end: inputRef.current?.selectionEnd ?? value.length });

  const reset = () => { setEntries([]); setState(null); setLabel(""); setText(""); inputRef.current?.focus(); };

  const placeholder = answering?.kind === "question" ? (answering.options.some((o) => o.other) ? (answering.placeholder ?? "Type your own answer…") : "Type your answer…")
    : answering?.kind === "location" ? "type an address, city or ZIP…"
    : answering?.kind === "address" ? "type the delivery address…"
    : "anything. Keplar gets it done.";

  return (
    <div className={s.view}>
      <div className={s.thread} aria-live="polite">
        {!entries.length ? (
          <section className={s.empty}>
            <h1 className={s.title}><span className={s.iWant}>I want</span> <span className={s.blank}>______</span></h1>
            <p className={s.lede}>Say what you want. Keplar asks what it needs, then does it: builds it, finds it, orders it, books it, or plans it and starts it with Palmo.</p>
            <ul className={s.rows} aria-label="Try one">
              {STARTERS.map((x) => (
                <li key={x}><button type="button" className={s.row} onClick={() => send(x)}><span>I want {x}</span><span aria-hidden="true" className={s.arrow}>→</span></button></li>
              ))}
            </ul>
          </section>
        ) : null}
        {entries.map((e, i) =>
          e.who === "you" ? (
            <p key={e.id} className={s.you}>{e.text}</p>
          ) : (
            <div key={e.id} className={s.keplar}>
              {e.trace?.length ? <TraceView trace={e.trace} busy={Boolean(e.busy)} /> : null}
              {e.say?.map((x, j) => <p key={j} className={s.note}>{x}</p>)}
              {e.busy && !e.card && !e.trace?.length ? <p className={s.thinking}>Keplar is on it…</p> : null}
              {e.card ? (
                <CardView
                  card={e.card}
                  live={i === entries.length - 1 && !busy}
                  id={e.id}
                  ledger={ledger}
                  onSettled={onSettled}
                  onOpenCreate={onOpenCreate}
                  act={(input, shown) => void turn(input, shown, state)}
                  want={(w) => send(w)}
                  focusComposer={() => inputRef.current?.focus()}
                />
              ) : null}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form className={s.dock} onSubmit={(ev) => { ev.preventDefault(); send(); }}>
        {label && state ? (
          <div className={s.dockHead}>
            <span className={s.badge}>{label}</span>
            <span className={s.dockWant}>I want {state.want}</span>
            <button type="button" className={s.link} onClick={reset}>New want</button>
          </div>
        ) : null}
        {!text ? <p id="wants-hint" className={s.hint}>{answering ? `Answer above, or type: ${placeholder}` : "Type what you want. Keplar gets it done."}</p> : <span id="wants-hint" hidden>{placeholder}</span>}
        <div className={s.composer}>
          <textarea
            ref={inputRef}
            className={s.input}
            rows={1}
            value={value}
            maxLength={600 + P}
            spellCheck
            aria-label={answering ? `Your answer (${placeholder})` : "I want…"}
            aria-describedby="wants-hint"
            onChange={(ev) => {
              const next = acceptChange(value, ev.target.value);
              commit(next, next === ev.target.value ? undefined : Math.max(P, Math.min(ev.target.selectionStart ?? next.length, next.length)));
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) { ev.preventDefault(); send(); return; }
              const r = onKey(value, sel(), { key: ev.key, ctrl: ev.ctrlKey, alt: ev.altKey, meta: ev.metaKey, shift: ev.shiftKey });
              if (!r.prevent) return;
              ev.preventDefault();
              if (r.value !== undefined) commit(r.value, r.caret);
              else if (r.caret !== undefined) {
                const el = inputRef.current;
                if (el && ev.shiftKey) el.setSelectionRange(r.caret, Math.max(el.selectionEnd ?? r.caret, r.caret), "backward");
                else place(r.caret);
              }
            }}
            onSelect={clampNow}
            onFocus={() => requestAnimationFrame(clampNow)}
            onMouseUp={clampNow}
            onTouchEnd={() => requestAnimationFrame(clampNow)}
            onPaste={(ev) => {
              ev.preventDefault();
              const r = replaceSel(value, sel(), ev.clipboardData.getData("text/plain").replace(/\s+/g, " ").slice(0, 600));
              commit(r.value, r.caret);
            }}
            onCut={(ev) => {
              const c = clampSel(sel());
              ev.preventDefault();
              ev.clipboardData.setData("text/plain", value.slice(c.start, c.end));
              const r = replaceSel(value, c, "");
              commit(r.value, r.caret);
            }}
            onDrop={(ev) => ev.preventDefault()}
          />
          <button type="submit" className={s.send} disabled={busy || !text.trim()} aria-label="Send">↑</button>
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────── live expert trace ───────────────────────── */

function TraceView({ trace, busy }: { trace: Trace[]; busy: boolean }) {
  const gate = trace.find((t): t is Extract<Trace, { stage: "gate" }> => t.stage === "gate");
  const plan = trace.find((t): t is Extract<Trace, { stage: "plan" }> => t.stage === "plan");
  const status = new Map<string, string>();
  for (const t of trace) if (t.stage === "expert") status.set(t.expert, t.status); else if (t.stage === "revise") status.set(t.expert, "revising");
  const verify = trace.find((t): t is Extract<Trace, { stage: "verify" }> => t.stage === "verify");
  const final = trace.some((t) => t.stage === "final");
  // Open while the experts work, folded once the answer is in, unless the person toggled it.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? !final;
  return (
    <details className={s.trace} open={open} onToggle={(e) => { const v = (e.target as HTMLDetailsElement).open; if (v !== open) setChosen(v); }}>
      <summary>{final ? `${gate?.experts.length ?? 0} of 128 experts worked on this` : busy ? "Keplar's experts are working…" : "How Keplar worked on this"}</summary>
      <ol className={s.traceList}>
        {gate ? <li><b>Routing gate</b> woke {gate.experts.map((x) => `#${x.n} ${x.name}`).join(", ")}; {gate.asleep} stayed asleep.</li> : null}
        {plan ? <li><b>Master Planner</b> split it into {plan.subtasks.length} sub-task{plan.subtasks.length === 1 ? "" : "s"}.</li> : null}
        {plan?.subtasks.map((x) => (
          <li key={x.expert} className={s.sub} data-status={status.get(x.expert) ?? "waiting"}>
            <b>{x.expert}</b> <span className={s.muted}>{status.get(x.expert) ?? "waiting"}</span>
            <span className={s.task}>{x.task}</span>
          </li>
        ))}
        {verify ? <li><b>Verifier</b> {verify.ok ? "checked the work: no problems found." : verify.issues ? `found ${verify.issues} issue${verify.issues === 1 ? "" : "s"}; the experts fixed them.` : "couldn't run a full check."}</li> : null}
        {final ? <li><b>Master Planner</b> wrote the answer.</li> : null}
      </ol>
    </details>
  );
}

/* ───────────────────────── cards ───────────────────────── */

type CardProps = {
  card: Card;
  live: boolean;
  id: string;
  ledger: Ledger;
  onSettled: () => void;
  onOpenCreate?: (t: { id?: string; prompt?: string }) => void;
  act: (input: Input, shown: string | null) => void;
  want: (w: string) => void;
  focusComposer: () => void;
};

function CardView(p: CardProps) {
  const c = p.card;
  switch (c.kind) {
    case "question": return <QuestionCard {...p} card={c} />;
    case "location": return <LocationCard {...p} card={c} />;
    case "places":
      return (
        <section className={s.card}>
          <h2 className={s.h}>Places near you</h2>
          <p className={s.muted}>{c.note}</p>
          <ul className={s.rows}>
            {c.places.map((pl) => (
              <li key={pl.id}>
                <button type="button" className={s.row} disabled={!p.live} onClick={() => p.act({ placeId: pl.id }, pl.name)}>
                  <span className={s.place}>
                    <span className={s.placeName}>{pl.name}</span>
                    <span className={s.muted}>{pl.priceNote} · {pl.distanceKm < 1 ? `${Math.round(pl.distanceKm * 1000)} m` : `${pl.distanceKm.toFixed(1)} km`}{pl.address ? ` · ${pl.address}` : ""}</span>
                  </span>
                  <span aria-hidden="true" className={s.arrow}>→</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      );
    case "fulfilment":
      return (
        <section className={s.card}>
          <h2 className={s.h}>Delivery or pickup from {c.place.name}?</h2>
          <div className={s.actions}>
            <button type="button" className={s.primary} disabled={!p.live} onClick={() => p.act({ fulfilment: "delivery" }, "Delivery")}>Delivery</button>
            <button type="button" className={s.ghost} disabled={!p.live} onClick={() => p.act({ fulfilment: "pickup" }, "Pickup")}>Pickup</button>
          </div>
        </section>
      );
    case "address":
      return (
        <section className={s.card}>
          <h2 className={s.h}>Where should it be delivered?</h2>
          {c.suggestion ? <ul className={s.rows}><li><button type="button" className={s.row} disabled={!p.live} onClick={() => p.act({ address: c.suggestion }, c.suggestion!)}><span>{c.suggestion}</span><span aria-hidden="true" className={s.arrow}>→</span></button></li></ul> : null}
          <p className={s.muted}>{c.suggestion ? "That's near where you are now. Or type the full address below." : "Type the full address below (street, apartment, city)."}</p>
        </section>
      );
    case "connect_delivery": return <ConnectDeliveryCard {...p} card={c} />;
    case "confirm_order": return <ConfirmCard {...p} card={c} />;
    case "place_order": return <PlaceOrderCard {...p} card={c} />;
    case "build_app": return <BuildAppCard {...p} card={c} />;
    case "workspace": return <WorkspaceCard {...p} card={c} />;
    case "roblox": return <RobloxCard {...p} card={c} />;
    case "browse": return <BrowseCard {...p} card={c} />;
    case "ride":
      return (
        <section className={s.card}>
          <h2 className={s.h}>Your ride to {c.to}</h2>
          <p className={s.muted}>Uber opens with the destination filled in. Check the price, then confirm the ride in Uber.</p>
          <div className={s.actions}>
            <a className={s.primary} href={c.url} target="_blank" rel="noreferrer">Open in Uber</a>
            {palmo() ? <PalmoButton goal={`Open ${c.url} in the browser and set up a ride to ${c.to}. Stop at the final "Request" button and let the person confirm.`} label="Let Palmo set it up" /> : null}
          </div>
        </section>
      );
    case "answer":
      return (
        <section className={s.answer}>
          <Markdown source={c.markdown} />
          <p className={s.meta}>
            {c.experts.map((e) => <span key={e.n} className={s.chip}>#{e.n} {e.name}</span>)}
            {c.verified ? <span className={s.chip} data-ok="">Verified</span> : null}
          </p>
          {c.palmoGoal ? <PalmoOffer goal={c.palmoGoal} /> : null}
          {c.nextSteps.length ? (
            <ul className={s.rows} aria-label="Next">
              {c.nextSteps.map((x) => <li key={x}><button type="button" className={s.row} onClick={() => p.want(x)}><span>{x}</span><span aria-hidden="true" className={s.arrow}>→</span></button></li>)}
            </ul>
          ) : null}
        </section>
      );
    case "refuse": return <section className={s.card}><p>{c.reply}</p></section>;
    case "error": return <section className={s.card} data-tone="warn" role="alert"><p>{c.message}</p></section>;
  }
}

function QuestionCard({ card: c, live, act, focusComposer }: CardProps & { card: Extract<Card, { kind: "question" }> }) {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <section className={s.card}>
      <p className={s.step}>{c.step} of {c.total}</p>
      <h2 className={s.h}>{c.question}</h2>
      <ul className={s.rows}>
        {c.options.map((o) => {
          const on = picked.includes(o.label);
          return (
            <li key={o.label}>
              <button
                type="button"
                className={s.row}
                data-on={on || undefined}
                aria-pressed={c.multi ? on : undefined}
                disabled={!live}
                onClick={() => {
                  if (o.other) return focusComposer();
                  if (c.multi) return setPicked((v) => (on ? v.filter((x) => x !== o.label) : [...v, o.label]));
                  act({ slot: c.slot, answer: o.value ?? o.label }, o.label);
                }}
              >
                <span>{o.label}{o.hint ? <span className={s.muted}> · {o.hint}</span> : null}</span>
                <span aria-hidden="true" className={s.arrow}>{c.multi ? (on ? "✓" : "+") : o.other ? "✎" : "→"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {c.multi && live ? (
        <div className={s.actions}>
          <button type="button" className={s.primary} disabled={!picked.length} onClick={() => act({ slot: c.slot, answer: picked.join(", ") }, picked.join(", "))}>Continue</button>
        </div>
      ) : null}
    </section>
  );
}

function LocationCard({ card: c, live, act }: CardProps & { card: Extract<Card, { kind: "location" }> }) {
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);
  const locate = () => {
    if (!("geolocation" in navigator)) return setErr("This browser can't share your location. Type an address below.");
    setAsking(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setAsking(false); act({ location: { lat: pos.coords.latitude, lon: pos.coords.longitude } }, "Use my location"); },
      () => { setAsking(false); setErr("Location wasn't shared. Type an address, city or ZIP below instead."); },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  };
  return (
    <section className={s.card}>
      <h2 className={s.h}>{c.question}</h2>
      <div className={s.actions}>
        <button type="button" className={s.primary} disabled={!live || asking} onClick={locate}>{asking ? "Finding you…" : "Use my location"}</button>
      </div>
      <p className={s.muted}>Or type an address, city or ZIP below. Your location is used for this search only.</p>
      {err ? <p className={s.warn} role="alert">{err}</p> : null}
    </section>
  );
}

const SERVICES: { id: DeliveryService; name: string }[] = [{ id: "doordash", name: "DoorDash" }, { id: "ubereats", name: "Uber Eats" }, { id: "grubhub", name: "Grubhub" }];

function ConnectDeliveryCard({ card: c, live, act }: CardProps & { card: Extract<Card, { kind: "connect_delivery" }> }) {
  const [saved] = useState(savedDelivery);
  const [remember, setRemember] = useState(true);
  const pick = (id: DeliveryService) => { saveDelivery(remember ? id : null); act({ delivery: id }, SERVICES.find((x) => x.id === id)!.name); };
  return (
    <section className={s.card}>
      <h2 className={s.h}>Connect a delivery app</h2>
      <p className={s.muted}>Keplar orders from {c.place.name} through your own account on one of these, so your saved payment, address and deals apply. You stay signed in to it; Keplar never sees your password or card.</p>
      <ul className={s.rows}>
        {[...SERVICES].sort((a, b) => Number(b.id === saved) - Number(a.id === saved)).map((x) => (
          <li key={x.id}><button type="button" className={s.row} disabled={!live} onClick={() => pick(x.id)}><span>{x.name}{x.id === saved ? <span className={s.muted}> · saved</span> : null}</span><span aria-hidden="true" className={s.arrow}>→</span></button></li>
        ))}
      </ul>
      <label className={s.check}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={!live} /> Save for future purchases</label>
    </section>
  );
}

function ConfirmCard({ card: c, live, act }: CardProps & { card: Extract<Card, { kind: "confirm_order" }> }) {
  // The swarm backend keeps the PIN on the server (confirmWith "pin"): the PIN is sent and checked there.
  const serverPin = c.confirmWith === "pin";
  const [localPin] = useState(hasPin);
  const pinOn = serverPin || localPin;
  const [pin, setPinValue] = useState("");
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState("");
  const [newPin, setNewPin] = useState("");
  const [settingPin, setSettingPin] = useState(false);
  const service = SERVICES.find((x) => x.id === c.delivery)?.name;
  const confirm = async () => {
    if (serverPin) return act({ confirm: true, pin }, "Confirmed with PIN");
    if (pinOn) {
      if (!(await checkPin(pin))) { setErr("That PIN isn't right."); return; }
    } else if (!sure) { setSure(true); return; }
    act({ confirm: true }, "Confirmed");
  };
  return (
    <section className={s.card} data-tone="confirm">
      <h2 className={s.h}>Confirm your order</h2>
      <dl className={s.summary}>
        <dt>Order</dt><dd>{c.item}</dd>
        <dt>From</dt><dd>{c.place.name}{c.place.address ? `, ${c.place.address}` : ""} <span className={s.muted}>({c.place.priceNote})</span></dd>
        <dt>{c.fulfilment === "delivery" ? "Deliver to" : "Pickup"}</dt><dd>{c.fulfilment === "delivery" ? c.address : "At the store"}</dd>
        {service ? <><dt>Through</dt><dd>{service}</dd></> : null}
      </dl>
      <p className={s.muted}>{c.feeNote ?? `The final price (with fees, tax and tip) shows at checkout${service ? ` on ${service}` : ""}. Nothing is charged until checkout is placed.`}</p>
      {live ? (
        <>
          {pinOn ? <input className={s.pin} inputMode="numeric" autoComplete="off" maxLength={6} placeholder="Purchase PIN" aria-label="Purchase PIN" value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))} /> : null}
          <div className={s.actions}>
            <button type="button" className={s.primary} data-sure={sure || undefined} disabled={pinOn && pin.length < 4} onClick={() => void confirm()}>{pinOn ? "Confirm with PIN" : sure ? "Yes, I'm sure. Order it" : "Place order"}</button>
            {sure ? <button type="button" className={s.ghost} onClick={() => setSure(false)}>Not yet</button> : null}
          </div>
          {err ? <p className={s.warn} role="alert">{err}</p> : null}
          {!pinOn && !serverPin ? (
            settingPin ? (
              <div className={s.actions}>
                <input className={s.pin} inputMode="numeric" maxLength={6} placeholder="4–6 digits" aria-label="New purchase PIN" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
                <button type="button" className={s.ghost} disabled={newPin.length < 4} onClick={() => void setPin(newPin).then((ok) => { if (ok) location.reload(); })}>Save PIN</button>
              </div>
            ) : <button type="button" className={s.link} onClick={() => setSettingPin(true)}>Use a PIN for purchases on this device instead</button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function PlaceOrderCard({ card: c, live }: CardProps & { card: Extract<Card, { kind: "place_order" }> }) {
  const desktop = Boolean(palmo());
  const [state, setState] = useState<"idle" | "started" | "failed">("idle");
  const [err, setErr] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (!live || !desktop || started.current) return;
    started.current = true;
    void launchPalmo(c.goal).then((r) => { if (r.ok) setState("started"); else { setState("failed"); setErr(r.error); } });
  }, [live, desktop, c.goal]);
  return (
    <section className={s.card}>
      <h2 className={s.h}>{desktop ? (state === "started" ? "Palmo is placing your order" : "Starting Palmo…") : "Finish your order"}</h2>
      {desktop ? (
        <p className={s.muted}>Palmo opened {c.service ?? "the store"} on your screen and is adding {c.item} from {c.place.name}. It asks you on its bar before the final payment step. Stop it any time from Palmo&apos;s bar.</p>
      ) : (
        <p className={s.muted}>{c.service ?? c.place.name} opens with {c.place.name} found for you; add {c.item} and place the order there. In the Keplar desktop app, Palmo does these steps for you on your screen.</p>
      )}
      {c.note ? <p className={s.muted}>{c.note}</p> : null}
      {c.connector && c.connector.status !== "available" ? <p className={s.muted}>{c.connector.status === "placeholder" ? c.connector.how : `${c.connector.name} ordering isn't connected on Keplar's side yet, so this order goes through your own ${c.connector.name} app.`}</p> : null}
      {err ? <p className={s.warn} role="alert">{err}</p> : null}
      <div className={s.actions}>
        {c.link ? <a className={desktop ? s.ghost : s.primary} href={c.link} target="_blank" rel="noreferrer">Open {c.service ?? c.place.name}</a> : null}
        {desktop && state === "failed" ? <PalmoButton goal={c.goal} label="Try Palmo again" /> : null}
        {!desktop ? <Link className={s.ghost} href="/download">Get the desktop app (Palmo)</Link> : null}
      </div>
    </section>
  );
}

function WorkspaceCard(p: CardProps & { card: Extract<Card, { kind: "workspace" }> }) {
  const c = p.card;
  const [live, setLive] = useState(false);
  if (live) return c.platform === "roblox" ? <RobloxCard {...p} card={{ kind: "roblox", prompt: c.prompt }} /> : <BuildAppCard {...p} card={{ kind: "build_app", prompt: c.prompt }} />;
  return (
    <section className={s.card}>
      <h2 className={s.h}>{c.name}: {c.files.length} files written</h2>
      <p className={s.muted}>Keplar&apos;s swarm wrote the source into your workspace <code>{c.root}</code>.</p>
      <ul className={s.traceList}>{c.files.map((f) => <li key={f.path}><code>{f.path}</code> <span className={s.muted}>{f.bytes.toLocaleString()} bytes</span></li>)}</ul>
      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={() => setLive(true)}>{c.platform === "roblox" ? "Build it in Roblox Studio here" : "Build it live here, with preview"}</button>
      </div>
    </section>
  );
}

function BuildAppCard({ card: c, id, ledger, onSettled, onOpenCreate }: CardProps & { card: Extract<Card, { kind: "build_app" }> }) {
  const [create, setCreate] = useState<ChatCreate>({ phase: "waiting", prompt: c.prompt });
  const message = useMemo(() => ({ id: `wants-${id}`, role: "keplar", replyTo: "wants", status: "done", stages: [], capabilities: [], models: [], draft: "", create }) as unknown as KeplarMessage, [id, create]);
  return (
    <div className={s.embed}>
      <CreateTurn message={message} ledger={ledger} onPatch={(patch) => setCreate((v) => ({ ...v, ...patch }))} onOpen={(t) => onOpenCreate?.(t)} onSettled={onSettled} />
    </div>
  );
}

function RobloxCard({ card: c, live }: CardProps & { card: Extract<Card, { kind: "roblox" }> }) {
  const desktop = Boolean(studioBridge());
  // Opens at once on the newest card; the brief goes into Studio's composer (offerDraft) when the workspace opens.
  const [open, setOpen] = useState(() => live && desktop);
  const start = () => setOpen(true);
  useEffect(() => { if (open) offerDraft("roblox", c.prompt); }, [open, c.prompt]);
  if (!desktop) {
    return (
      <section className={s.card}>
        <h2 className={s.h}>Your Roblox game is ready to build</h2>
        <p className={s.muted}>Keplar builds Roblox games inside Roblox Studio on your computer, through the Keplar desktop app (a web page can&apos;t reach Studio). Open this page in the desktop app and Keplar connects to Studio and starts building it right here.</p>
        <pre className={s.brief}>{c.prompt}</pre>
        <div className={s.actions}>
          <Link className={s.primary} href="/download">Get the desktop app</Link>
          <button type="button" className={s.ghost} onClick={() => void navigator.clipboard?.writeText(c.prompt)}>Copy the game brief</button>
        </div>
      </section>
    );
  }
  return (
    <section className={s.card}>
      <h2 className={s.h}>Building your Roblox game</h2>
      <p className={s.muted}>Connect Roblox Studio below (open a place in Studio first). The game brief is in the box: press Build and Keplar builds it in your place, step by step.</p>
      {open ? <div className={s.studio}><Workspace env="roblox" /></div> : <button type="button" className={s.primary} onClick={start}>Open Keplar Studio here</button>}
    </section>
  );
}

type BrowserTask = { id: string; status: string; steps: { n: number; note: string; url: string }[]; answer?: string; reason?: string };

function BrowseCard({ card: c, live }: CardProps & { card: Extract<Card, { kind: "browse" }> }) {
  const [task, setTask] = useState<BrowserTask | null>(null);
  const [err, setErr] = useState("");
  const started = useRef(false);
  useEffect(() => {
    if (!live || started.current) return;
    started.current = true;
    void (async () => {
      const r = await fetch("/api/browser/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ goal: c.goal.slice(0, 600), url: c.url }) });
      const d = (await r.json().catch(() => ({}))) as { task?: BrowserTask; error?: string };
      if (!r.ok || !d.task) { setErr(d.error ?? "Keplar Browser couldn't start."); return; }
      setTask(d.task);
    })();
  }, [live, c.goal, c.url]);
  useEffect(() => {
    if (!task || task.status !== "running") return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/browser/tasks/${task.id}`, { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as { task?: BrowserTask };
      if (d.task) setTask(d.task);
    }, 2000);
    return () => clearTimeout(t);
  }, [task]);
  const what = c.site === "airbnb" ? "stays" : c.site === "flights" ? "flights" : "options";
  return (
    <section className={s.card}>
      <h2 className={s.h}>{task?.status === "running" || (!task && !err) ? `Keplar is searching ${what}…` : `Best ${what} Keplar found`}</h2>
      {task?.steps.length ? <ol className={s.traceList}>{task.steps.slice(-4).map((x) => <li key={x.n}>{x.note}</li>)}</ol> : null}
      {task?.answer ? <Markdown source={task.answer} /> : null}
      {task && task.status !== "running" && !task.answer && task.reason ? <p className={s.muted}>{task.reason}</p> : null}
      {err ? <p className={s.warn} role="alert">{err}</p> : null}
      <div className={s.actions}>
        <a className={s.ghost} href={c.url} target="_blank" rel="noreferrer">Open the search</a>
        {task && task.status !== "running" ? (palmo() ? <PalmoButton goal={c.bookGoal} label="Book it with Palmo" confirm /> : <Link className={s.ghost} href="/download">Book it with Palmo (desktop app)</Link>) : null}
      </div>
    </section>
  );
}

function PalmoButton({ goal, label, confirm }: { goal: string; label: string; confirm?: boolean }) {
  const [sure, setSure] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <button type="button" className={s.ghost} onClick={() => {
        if (confirm && !sure) { setSure(true); return; }
        void launchPalmo(goal).then((r) => setMsg(r.ok ? "Palmo is on it. Watch its bar on your screen." : r.error));
      }}>{confirm && sure ? "Yes, start Palmo" : label}</button>
      {msg ? <span className={s.muted} role="status">{msg}</span> : null}
    </>
  );
}

function PalmoOffer({ goal }: { goal: string }) {
  const desktop = Boolean(palmo());
  const [step, setStep] = useState<"offer" | "terms" | "running" | "error">("offer");
  const [err, setErr] = useState("");
  return (
    <div className={s.palmo}>
      <div className={s.palmoHead}>
        <span className={s.palmoFace} aria-hidden="true">◕‿◕</span>
        <div>
          <p className={s.h}>Would you like to activate Palmo?</p>
          <p className={s.muted}>Palmo takes over your screen and starts this for you: {goal}</p>
        </div>
      </div>
      {!desktop ? (
        <div className={s.actions}><Link className={s.primary} href="/download">Get the desktop app to use Palmo</Link></div>
      ) : step === "offer" ? (
        <div className={s.actions}><button type="button" className={s.primary} onClick={() => setStep("terms")}>Sure, activate Palmo</button></div>
      ) : step === "terms" ? (
        <div className={s.terms}>
          <p>While Palmo works, it reads your screen and uses your mouse and keyboard. It pauses and asks you on its bar before anything that spends money, signs you in, sends or publishes. Stop it any time from its bar.</p>
          <div className={s.actions}>
            <button type="button" className={s.primary} onClick={() => void launchPalmo(goal).then((r) => { if (r.ok) setStep("running"); else { setErr(r.error); setStep("error"); } })}>I agree, start</button>
            <button type="button" className={s.ghost} onClick={() => setStep("offer")}>Not now</button>
          </div>
        </div>
      ) : step === "running" ? (
        <p className={s.muted} role="status">Palmo is working on your screen now.</p>
      ) : (
        <p className={s.warn} role="alert">{err}</p>
      )}
    </div>
  );
}
