/**
 * One Keplar Wants turn: apply what the person just did (a new want, an answer, their location, a place, an address, a
 * delivery service, a confirmation) to the state, then produce the next card. The model, places and geocoding are injected
 * so the flow is tested without a network (tests/wants.test.ts).
 */
import { parseJson } from "@/lib/core/llm";
import { screenPrompt } from "@/lib/safety/screen";
import { KEPLAR_WANTS_CHARACTER, runMesh, type MeshCall, type MeshEvent } from "./mesh";
import {
  DELIVERY_NAME, INTENT_DOMAINS, INTENT_LABEL, deliveryLink, nextStep, orderGoal, orderSummary, pendingQuestions, startState,
  type DeliveryService, type IntentId, type Option, type Place, type Question, type WantsState,
} from "./playbooks";

export type WantsInput = {
  want?: string;
  slot?: string;
  answer?: string;
  location?: { lat: number; lon: number } | { query: string };
  placeId?: string;
  fulfilment?: "delivery" | "pickup";
  address?: string;
  delivery?: DeliveryService;
  confirm?: boolean;
  /** A purchase PIN checked by the backend (the swarm service keeps PINs per account). */
  pin?: string;
};

export type WantsCard =
  | { kind: "question"; slot: string; question: string; options: Option[]; multi?: boolean; placeholder?: string; step: number; total: number }
  | { kind: "location"; question: string }
  | { kind: "places"; places: Place[]; note: string }
  | { kind: "fulfilment"; place: Place }
  | { kind: "address"; suggestion?: string }
  | { kind: "connect_delivery"; place: Place }
  | { kind: "confirm_order"; item: string; place: Place; fulfilment: "delivery" | "pickup"; address?: string; delivery?: DeliveryService }
  | { kind: "place_order"; goal: string; link: string; service?: string; place: Place; item: string }
  | { kind: "build_app"; prompt: string }
  | { kind: "roblox"; prompt: string }
  | { kind: "browse"; goal: string; url: string; site: string; bookGoal: string }
  | { kind: "ride"; url: string; to: string }
  | { kind: "answer"; markdown: string; nextSteps: string[]; experts: { n: number; name: string }[]; verified: boolean; palmoGoal?: string }
  | { kind: "refuse"; reply: string }
  | { kind: "error"; message: string };

export type TurnEvent = { type: "state"; state: WantsState; label: string } | { type: "trace"; event: MeshEvent } | { type: "card"; card: WantsCard } | { type: "say"; text: string };

export type TurnDeps = {
  call: MeshCall | null;
  models: number;
  findPlaces: (s: WantsState) => Promise<Place[]>;
  geocode: (q: string) => Promise<{ lat: number; lon: number; label: string } | null>;
  reverseGeocode: (at: { lat: number; lon: number }) => Promise<string | null>;
};

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const INTENTS: IntentId[] = ["build_app", "roblox", "food", "money", "stay", "travel", "ride", "shopping", "general"];

/** The state the client sent back, re-validated (it is the person's browser's copy, so nothing in it is trusted). */
export function cleanState(raw: unknown): WantsState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const want = clip(o.want, 600);
  if (!want) return null;
  const intent = INTENTS.includes(o.intent as IntentId) ? (o.intent as IntentId) : startState(want).intent;
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries((o.answers as Record<string, unknown>) ?? {}).slice(0, 30)) if (/^[a-z_0-9]{1,24}$/.test(k)) answers[k] = clip(v, 400);
  const s: WantsState = { want, intent, answers };
  const loc = o.location as Record<string, unknown> | undefined;
  if (loc && Number.isFinite(num(loc.lat)) && Number.isFinite(num(loc.lon)) && Math.abs(num(loc.lat)) <= 90 && Math.abs(num(loc.lon)) <= 180) s.location = { lat: num(loc.lat), lon: num(loc.lon), ...(loc.label ? { label: clip(loc.label, 120) } : {}) };
  if (Array.isArray(o.places)) s.places = (o.places as Place[]).slice(0, 8).filter((p) => p && typeof p.id === "string" && typeof p.name === "string").map((p) => ({ id: clip(p.id, 40), name: clip(p.name, 120), ...(p.address ? { address: clip(p.address, 160) } : {}), lat: num(p.lat), lon: num(p.lon), distanceKm: num(p.distanceKm), priceLevel: ([1, 2, 3, 4].includes(p.priceLevel) ? p.priceLevel : 2) as Place["priceLevel"], priceNote: clip(p.priceNote, 80), ...(p.brand ? { brand: clip(p.brand, 80) } : {}), ...(typeof p.url === "string" && /^https?:\/\//.test(p.url) ? { url: clip(p.url, 300) } : {}) }));
  if (typeof o.placeId === "string" && s.places?.some((p) => p.id === o.placeId)) s.placeId = o.placeId;
  if (o.fulfilment === "delivery" || o.fulfilment === "pickup") s.fulfilment = o.fulfilment;
  if (o.address) s.address = clip(o.address, 200);
  if (o.delivery === "doordash" || o.delivery === "ubereats" || o.delivery === "grubhub") s.delivery = o.delivery;
  if (o.confirmed === true) s.confirmed = true;
  if (Array.isArray(o.extra)) s.extra = (o.extra as Question[]).slice(0, 3).map(cleanQuestion).filter((q): q is Question => Boolean(q));
  return s;
}

function cleanQuestion(q: unknown, i = 0): Question | null {
  const o = (q ?? {}) as Record<string, unknown>;
  const question = clip(o.question, 200);
  if (!question) return null;
  const options = (Array.isArray(o.options) ? o.options : []).slice(0, 6).map((x) => (typeof x === "string" ? { label: clip(x, 80) } : { label: clip((x as Option)?.label, 80), ...((x as Option)?.other ? { other: true } : {}) })).filter((x) => x.label);
  if (!options.some((x) => x.other)) options.push({ label: "Other (be specific)", other: true });
  const slot = typeof o.slot === "string" && /^q_\d$/.test(o.slot) ? o.slot : `q_${i + 1}`;
  return { slot, question, options, ...(o.multi === true ? { multi: true } : {}) };
}

/** Apply the person's input. Returns a message for them when the input couldn't be used. */
export async function applyInput(state: WantsState | null, input: WantsInput, deps: Pick<TurnDeps, "geocode" | "reverseGeocode">): Promise<{ state: WantsState | null; problem?: string }> {
  if (input.want) return { state: startState(clip(input.want, 600)) };
  if (!state) return { state: null, problem: "Say what you want first." };
  const s: WantsState = { ...state, answers: { ...state.answers } };
  if (input.slot && typeof input.answer === "string") {
    const q = pendingQuestions(s).find((x) => x.slot === input.slot);
    if (q) s.answers[q.slot] = clip(input.answer, 400) || "No preference";
  }
  if (input.location) {
    if ("query" in input.location) {
      const hit = await deps.geocode(clip(input.location.query, 200)).catch(() => null);
      if (!hit) return { state: s, problem: "Keplar couldn't find that address. Try a street and city, or a ZIP code." };
      s.location = hit;
    } else if (Number.isFinite(input.location.lat) && Number.isFinite(input.location.lon)) {
      s.location = { lat: input.location.lat, lon: input.location.lon };
    }
    delete s.places;
    delete s.placeId;
  }
  if (input.placeId && s.places?.some((p) => p.id === input.placeId)) s.placeId = input.placeId;
  if (input.fulfilment) s.fulfilment = input.fulfilment;
  if (input.address) s.address = clip(input.address, 200);
  if (input.delivery) s.delivery = input.delivery;
  if (input.confirm === true && s.placeId && (s.fulfilment === "pickup" || (s.address && s.delivery))) s.confirmed = true;
  return { state: s };
}

const QUESTIONS_SYSTEM = `${KEPLAR_WANTS_CHARACTER}
Before doing it, you ask the few follow-up questions that change the result most (like a great concierge: budget, specifics, timing, preferences). Ask 0 to 3 questions; ask none when the want is already clear enough to act on.
Reply with ONLY JSON: {"questions":[{"question":"...","options":["short option","short option","short option"],"multi":false}]} with 3 to 5 options each.`;

/** Runs one turn, emitting events as it goes. Never throws: failures become an error card. */
export async function runTurn(state: WantsState | null, input: WantsInput, deps: TurnDeps, emit: (e: TurnEvent) => void): Promise<WantsState | null> {
  const applied = await applyInput(state, input, deps);
  let s = applied.state;
  if (!s) { emit({ type: "card", card: { kind: "error", message: applied.problem ?? "Say what you want first." } }); return null; }
  if (applied.problem) emit({ type: "say", text: applied.problem });

  if (input.want) {
    const screen = screenPrompt(`I want ${s.want}`);
    if (screen.action !== "allow") { emit({ type: "card", card: { kind: "refuse", reply: screen.reply } }); return null; }
  }

  const step = nextStep(s);
  const publish = () => emit({ type: "state", state: s!, label: INTENT_LABEL[s!.intent] });
  const needModels = (): MeshCall | null => {
    if (!deps.call) emit({ type: "card", card: { kind: "error", message: "Keplar isn't connected to its models right now. Please try again soon." } });
    return deps.call;
  };

  try {
    switch (step.kind) {
      case "ask": {
        const all = pendingQuestions({ ...s, answers: {} }).length || 1;
        const left = pendingQuestions(s).length;
        publish();
        emit({ type: "card", card: { kind: "question", slot: step.question.slot, question: step.question.question, options: step.question.options, ...(step.question.multi ? { multi: true } : {}), ...(step.question.placeholder ? { placeholder: step.question.placeholder } : {}), step: Math.max(1, all - left + 1), total: Math.max(all, all - left + 1) } });
        return s;
      }
      case "llm_questions": {
        const call = needModels();
        if (!call) return s;
        let extra: Question[] = [];
        try {
          const raw = await call({ system: QUESTIONS_SYSTEM, prompt: `The person said: "I want ${s.want}"`, maxOutputTokens: 600, modelIndex: 0 });
          extra = (parseJson<{ questions?: unknown[] }>(raw)?.questions ?? []).slice(0, 3).map((q, i) => cleanQuestion(q, i)).filter((q): q is Question => Boolean(q));
        } catch { /* no questions: go straight to work */ }
        s = { ...s, extra };
        return runTurn(s, {}, deps, emit);
      }
      case "location":
        publish();
        emit({ type: "card", card: { kind: "location", question: step.question } });
        return s;
      case "find_places": {
        let places: Place[] = [];
        try { places = await deps.findPlaces(s); } catch { /* shown below */ }
        if (!places.length) {
          publish();
          emit({ type: "say", text: "Keplar couldn't find matching places near that location. Try a nearby address, or name a specific place." });
          emit({ type: "card", card: { kind: "location", question: "Try another address or a nearby city" } });
          return { ...s, location: undefined };
        }
        s = { ...s, places };
        publish();
        emit({ type: "card", card: { kind: "places", places, note: /closest/i.test(s.answers.source ?? "") ? "Closest first. Prices are estimates (OpenStreetMap has no menus or ratings)." : "Cheapest to most expensive. Prices are estimates (OpenStreetMap has no menus or ratings)." } });
        return s;
      }
      case "pick_place":
        publish();
        emit({ type: "card", card: { kind: "places", places: s.places ?? [], note: "Pick a place." } });
        return s;
      case "fulfilment":
        publish();
        emit({ type: "card", card: { kind: "fulfilment", place: orderSummary(s).place! } });
        return s;
      case "address": {
        const suggestion = s.location ? await deps.reverseGeocode(s.location).catch(() => null) : null;
        publish();
        emit({ type: "card", card: { kind: "address", ...(suggestion ? { suggestion } : {}) } });
        return s;
      }
      case "connect_delivery":
        publish();
        emit({ type: "card", card: { kind: "connect_delivery", place: orderSummary(s).place! } });
        return s;
      case "confirm_order": {
        const { item, place } = orderSummary(s);
        publish();
        emit({ type: "card", card: { kind: "confirm_order", item, place: place!, fulfilment: s.fulfilment!, ...(s.address ? { address: s.address } : {}), ...(s.delivery ? { delivery: s.delivery } : {}) } });
        return s;
      }
      case "place_order": {
        const { item, place } = orderSummary(s);
        const link = s.fulfilment === "delivery" && s.delivery ? deliveryLink(s.delivery, place!.name, s.address) : place!.url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place!.name} ${place!.address ?? ""}`)}`;
        publish();
        emit({ type: "card", card: { kind: "place_order", goal: orderGoal(s), link, ...(s.delivery ? { service: DELIVERY_NAME[s.delivery] } : {}), place: place!, item } });
        return s;
      }
      case "build_app":
        publish();
        emit({ type: "card", card: { kind: "build_app", prompt: step.prompt } });
        return s;
      case "roblox":
        publish();
        emit({ type: "card", card: { kind: "roblox", prompt: step.prompt } });
        return s;
      case "ride":
        publish();
        emit({ type: "card", card: { kind: "ride", url: step.url, to: s.answers.to ?? s.want } });
        return s;
      case "search_and_book": {
        publish();
        const what = step.site === "airbnb" ? "stays" : step.site === "flights" ? "flights" : "the best options to buy";
        emit({ type: "card", card: { kind: "browse", site: step.site, url: step.url, goal: `Find ${what} for: ${step.query}. List the 3–5 best matches with price, key details and the exact page address of each.`, bookGoal: `In the web browser, open the option the person picked and take it to the final checkout/booking page for: ${step.query}. The person has confirmed in Keplar Wants.` } });
        return s;
      }
      case "money_plan":
      case "mesh": {
        const call = needModels();
        if (!call) return s;
        publish();
        const r = await runMesh({ want: s.want, answers: s.answers, domains: INTENT_DOMAINS[s.intent], call, models: deps.models, palmo: s.intent === "money" || s.intent === "general", onEvent: (event) => emit({ type: "trace", event }) });
        emit({ type: "card", card: { kind: "answer", markdown: r.markdown, nextSteps: r.nextSteps, experts: r.experts.map((e) => ({ n: e.n, name: e.name })), verified: r.verified, ...(r.palmoGoal ? { palmoGoal: r.palmoGoal } : {}) } });
        return s;
      }
    }
  } catch {
    emit({ type: "card", card: { kind: "error", message: "Keplar hit a problem on that step. Try again." } });
  }
  return s;
}
