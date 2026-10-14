/**
 * Keplar Wants playbooks: what to ask, in what order, and what to do once Keplar knows enough. Pure (no network, no model),
 * so the whole conversation flow is unit-tested. The client keeps the WantsState and sends it back each turn; the server
 * (src/app/api/keplar/wants/orchestrate/route.ts) calls `nextStep` and does the work the step names (places search, the expert mesh, ...).
 *
 * Flow for every want:   detect intent -> ask the playbook's questions (skipping what the want already says)
 *                        -> the intent's action (build an app here, build the Roblox game here, find places and order,
 *                           plan + Palmo, search + book, or the expert mesh's answer).
 */
import type { WantsDomain } from "./experts";

export type IntentId = "build_app" | "roblox" | "food" | "money" | "stay" | "travel" | "ride" | "shopping" | "general";

export type Option = { label: string; value?: string; hint?: string; other?: boolean };

export type Question = {
  slot: string;
  question: string;
  options: Option[];
  /** Several options may be picked. */
  multi?: boolean;
  /** The free-text box's placeholder ("Other (be specific)" when it is an option). */
  placeholder?: string;
  /** Only asked when this returns true. */
  when?: (s: WantsState) => boolean;
  /** Not asked when the want already answers it. */
  skipIf?: RegExp;
};

export type Place = { id: string; name: string; address?: string; lat: number; lon: number; distanceKm: number; priceLevel: 1 | 2 | 3 | 4; priceNote: string; brand?: string; url?: string };

export type DeliveryService = "doordash" | "ubereats" | "grubhub";

export type WantsState = {
  /** The text after "I want". */
  want: string;
  intent: IntentId;
  answers: Record<string, string>;
  location?: { lat: number; lon: number; label?: string };
  /** Places found for this want, cheapest first. */
  places?: Place[];
  placeId?: string;
  fulfilment?: "delivery" | "pickup";
  address?: string;
  delivery?: DeliveryService;
  confirmed?: boolean;
  /** Follow-up questions the planner model wrote for this want (general wants), asked after the playbook's own. */
  extra?: Question[];
};

export type Step =
  | { kind: "ask"; question: Question }
  | { kind: "llm_questions" }
  | { kind: "location"; question: string }
  | { kind: "find_places" }
  | { kind: "pick_place" }
  | { kind: "fulfilment" }
  | { kind: "address" }
  | { kind: "connect_delivery" }
  | { kind: "confirm_order" }
  | { kind: "place_order" }
  | { kind: "build_app"; prompt: string }
  | { kind: "roblox"; prompt: string }
  | { kind: "money_plan" }
  | { kind: "search_and_book"; site: "airbnb" | "booking" | "flights" | "shop"; query: string; url: string }
  | { kind: "ride"; url: string }
  | { kind: "mesh" };

const other = (placeholder = "Other (be specific)"): Option => ({ label: placeholder, other: true });

/* ───────────────────────── intent ───────────────────────── */

const INTENTS: { id: IntentId; test: RegExp }[] = [
  { id: "roblox", test: /\broblox\b|\bobby\b|\brobux\b|\bluau\b/i },
  { id: "build_app", test: /\b(build|make|create|code|develop|design)\b.{0,40}\b(app|application|website|web ?site|site|saas|platform|tool|dashboard|landing page|game|portfolio|store|chatbot|bot|extension|calculator)\b|^(an? )?(app|website|web app|landing page)\b/i },
  { id: "money", test: /\b(million|millionaire|billionaire|rich|wealthy|\$\s?\d[\d,.]*\s?(k|m|million|thousand)?|\d+\s?(k|thousand|million) dollars|make money|earn money|more money|passive income|financial freedom|side hustle)\b/i },
  { id: "stay", test: /\b(airbnb|vrbo|hotel|motel|stay|place to stay|room for|lodging|cabin|resort|book a (room|place|house))\b/i },
  { id: "ride", test: /\b(uber|lyft|a ride|ride to|taxi|cab to|get to the airport|drive me)\b/i },
  { id: "travel", test: /\b(flight|fly to|plane ticket|trip to|vacation|travel to|go to (paris|london|tokyo|japan|italy|mexico|hawaii|europe|new york))\b/i },
  { id: "food", test: /\b(coffee|latte|espresso|cappuccino|mocha|frappuccino|cold brew|americano|tea|boba|smoothie|pizza|burger|burgers|sushi|tacos?|burrito|wings|food|lunch|dinner|breakfast|brunch|snack|donuts?|ice cream|dessert|something to eat|takeout|chinese food|thai food|indian food|fries|sandwich|salad|chicken)\b/i },
  { id: "shopping", test: /\b(buy|new|a pair of|shoes|sneakers|laptop|phone|iphone|ps5|xbox|headphones|tv|watch|gift|jacket|hoodie|dress|bag|camera|bike|car|console|gpu|keyboard|monitor)\b/i },
];

export function detectIntent(want: string): IntentId {
  const w = want.trim();
  for (const i of INTENTS) if (i.test.test(w)) return i.id;
  return "general";
}

export const INTENT_DOMAINS: Record<IntentId, WantsDomain[]> = {
  build_app: ["software"],
  roblox: ["games"],
  food: ["food"],
  money: ["money", "business"],
  stay: ["travel"],
  travel: ["travel"],
  ride: ["travel"],
  shopping: ["commerce"],
  general: [],
};

export const INTENT_LABEL: Record<IntentId, string> = {
  build_app: "Build it",
  roblox: "Roblox game",
  food: "Order it",
  money: "Make money",
  stay: "Find a stay",
  travel: "Plan the trip",
  ride: "Get a ride",
  shopping: "Buy it",
  general: "Get it done",
};

/* ───────────────────────── questions ───────────────────────── */

const isCoffee = (s: WantsState) => /\b(coffee|latte|espresso|cappuccino|mocha|frappuccino|cold brew|americano|macchiato|flat white)\b/i.test(s.want);
const genericFood = (s: WantsState) => /^(a |an |some )?(coffee|food|something to eat|lunch|dinner|breakfast|a snack|snack|dessert|takeout|drink|a drink)\s*[.!]?$/i.test(s.want.trim());

const BUSINESS_NICHES = [
  "My idea", "Online store / e-commerce", "Local service (cleaning, lawn care, detailing)", "App or SaaS", "Food & drinks", "Digital products & courses",
  "Marketing / creative agency", "Real estate", "Fitness & wellness", "Beauty & skincare", "Pets", "Clothing brand", "Tutoring & education",
  "Reselling (sneakers, electronics)", "Vending machines", "Content studio", "AI automation services",
];

export const PLAYBOOKS: Record<IntentId, Question[]> = {
  build_app: [
    { slot: "kind", question: "What are you building?", options: [{ label: "Website" }, { label: "Web app with accounts & data" }, { label: "Online store" }, { label: "Browser game" }, { label: "Tool or calculator" }, { label: "Mobile-friendly app (works on phones)" }, other()] },
    { slot: "purpose", question: "Who is it for, and what's the one thing it has to do?", options: [{ label: "For my business: show what I offer and get customers" }, { label: "For me: track something (habits, money, workouts)" }, { label: "For a group: share, chat or plan together" }, other("Describe it")] },
    { slot: "features", multi: true, question: "Which of these does it need?", options: [{ label: "Sign-in & accounts" }, { label: "Saving data" }, { label: "Payments" }, { label: "Booking / scheduling" }, { label: "AI features" }, { label: "Admin dashboard" }, { label: "Chat / messaging" }, { label: "None of these" }] },
    { slot: "look", question: "How should it look?", options: [{ label: "Clean & minimal" }, { label: "Bold & colorful" }, { label: "Dark & techy" }, { label: "Playful" }, { label: "Let Keplar pick" }] },
  ],
  roblox: [
    { slot: "genre", question: "What kind of Roblox game?", skipIf: /\b(obby|tycoon|simulator|horror|roleplay|rpg|pvp|battle|tower defense|racing)\b/i, options: [{ label: "Obby" }, { label: "Tycoon" }, { label: "Simulator" }, { label: "Horror" }, { label: "Roleplay / RPG" }, { label: "Battle / PvP" }, { label: "Tower defense" }, other()] },
    { slot: "loop", question: "What do players do every minute of it?", options: [{ label: "Jump through levels and checkpoints" }, { label: "Collect, upgrade and rebirth" }, { label: "Build and earn from a base" }, { label: "Fight other players or enemies" }, other("Describe the gameplay")] },
    { slot: "players", question: "How many players per server?", options: [{ label: "Solo or small (1–8)" }, { label: "Medium (10–20)" }, { label: "Big servers (30+)" }] },
    { slot: "monetize", question: "Do you want it to make Robux?", options: [{ label: "Yes: gamepasses (VIP, 2x coins)" }, { label: "Yes: developer products (boosts, currency)" }, { label: "Not yet" }] },
  ],
  food: [
    { slot: "item", when: (s) => isCoffee(s) && genericFood(s), question: "What type of coffee do you want?", options: [{ label: "Latte" }, { label: "Cappuccino" }, { label: "Iced coffee / cold brew" }, { label: "Americano" }, { label: "Mocha" }, { label: "Frappuccino" }, { label: "Espresso" }, other()] },
    { slot: "item", when: (s) => !isCoffee(s) && genericFood(s), question: "What are you craving?", options: [{ label: "Pizza" }, { label: "Burgers" }, { label: "Mexican" }, { label: "Chinese" }, { label: "Sushi" }, { label: "Healthy / salads" }, { label: "Breakfast" }, other()] },
    { slot: "details", when: isCoffee, question: "How do you take it?", options: [{ label: "Medium, regular milk" }, { label: "Large, oat milk" }, { label: "Small, black" }, { label: "Extra shot, sweet" }, other("Size, milk, sugar…")] },
    { slot: "source", question: "Do you want it from a specific place?", options: [{ label: "Closest to me" }, { label: "Cheapest" }, { label: "Best rated" }, { label: "A specific place", other: true, value: "" }] },
  ],
  money: [
    { slot: "path", question: "Which way do you want to get there?", options: [{ label: "Business" }, { label: "Content creation" }, { label: "Investing" }, { label: "Freelancing / services" }, { label: "Higher-paying career" }, { label: "Real estate" }, other()] },
    { slot: "niche", when: (s) => /business/i.test(s.answers.path ?? ""), question: "Pick a niche", options: [...BUSINESS_NICHES.map((n) => (n === "My idea" ? { label: n, other: true, value: "" } : { label: n })), other()], placeholder: "Describe your idea" },
    { slot: "platform", when: (s) => /content/i.test(s.answers.path ?? ""), question: "Where will you post?", multi: true, options: [{ label: "YouTube" }, { label: "TikTok" }, { label: "Instagram" }, { label: "Podcast" }, { label: "Twitch" }, { label: "X" }] },
    { slot: "topic", when: (s) => /content/i.test(s.answers.path ?? ""), question: "What will your content be about?", options: [{ label: "Gaming" }, { label: "Money & business" }, { label: "Fitness" }, { label: "Comedy" }, { label: "Tech & AI" }, { label: "Beauty & fashion" }, { label: "Food" }, other()] },
    { slot: "capital", question: "How much money can you start with?", options: [{ label: "$0" }, { label: "Under $500" }, { label: "$500 – $2,000" }, { label: "$2,000 – $10,000" }, { label: "$10,000+" }] },
    { slot: "time", question: "How much time can you put in each week?", options: [{ label: "Under 5 hours" }, { label: "5–15 hours" }, { label: "15–30 hours" }, { label: "Full time" }] },
    { slot: "skills", multi: true, question: "What are you already good at?", options: [{ label: "Talking to people / sales" }, { label: "Design" }, { label: "Coding" }, { label: "Writing" }, { label: "Video" }, { label: "Organizing" }, { label: "Nothing yet" }] },
    { slot: "timeline", question: "By when?", options: [{ label: "1 year" }, { label: "3 years" }, { label: "5 years" }, { label: "10 years" }, { label: "As fast as possible" }] },
  ],
  stay: [
    { slot: "where", question: "Where do you want to stay?", options: [other("City, neighborhood or area")] },
    { slot: "dates", question: "When?", options: [{ label: "This weekend" }, { label: "Next weekend" }, other("Check-in – check-out dates")] },
    { slot: "guests", question: "How many guests?", options: [{ label: "1" }, { label: "2" }, { label: "3–4" }, { label: "5–8" }, { label: "9+" }] },
    { slot: "budget", question: "Budget per night?", options: [{ label: "Under $100" }, { label: "$100 – $200" }, { label: "$200 – $400" }, { label: "$400+" }, { label: "Doesn't matter" }] },
    { slot: "musts", multi: true, question: "Must-haves?", options: [{ label: "Entire place" }, { label: "Pool" }, { label: "Free parking" }, { label: "Pet friendly" }, { label: "Kitchen" }, { label: "Workspace" }, { label: "None" }] },
  ],
  travel: [
    { slot: "from", question: "Where are you leaving from?", options: [other("City or airport")] },
    { slot: "where", question: "Where to?", skipIf: /\bto\s+[A-Z]/, options: [other("City or country")] },
    { slot: "dates", question: "When, and for how long?", options: [{ label: "A weekend" }, { label: "One week" }, { label: "Two weeks" }, other("Exact dates")] },
    { slot: "who", question: "Who's going?", options: [{ label: "Just me" }, { label: "Two of us" }, { label: "Family with kids" }, { label: "Group of friends" }] },
    { slot: "budget", question: "Total budget?", options: [{ label: "Under $1,000" }, { label: "$1,000 – $3,000" }, { label: "$3,000 – $7,000" }, { label: "$7,000+" }] },
  ],
  ride: [
    { slot: "to", question: "Where to?", options: [other("Address or place")] },
    { slot: "when", question: "When?", options: [{ label: "Now" }, { label: "In 30 minutes" }, other("Time")] },
    { slot: "kind", question: "What kind of ride?", options: [{ label: "Cheapest" }, { label: "Comfort" }, { label: "XL (6 seats)" }] },
  ],
  shopping: [
    { slot: "specifics", question: "Anything specific? Brand, model, size, color?", options: [{ label: "Best value" }, { label: "Top of the line" }, { label: "Most popular" }, other("Brand, model, size…")] },
    { slot: "budget", question: "Budget?", options: [{ label: "Under $50" }, { label: "$50 – $200" }, { label: "$200 – $1,000" }, { label: "$1,000+" }, other("Exact amount")] },
    { slot: "when", question: "When do you need it?", options: [{ label: "Today" }, { label: "In 2 days" }, { label: "This week" }, { label: "No rush" }] },
    { slot: "where", question: "Where do you want to buy it?", options: [{ label: "Amazon" }, { label: "Best Buy" }, { label: "Walmart" }, { label: "Target" }, { label: "Wherever is cheapest" }] },
  ],
  general: [],
};

/** The questions still to ask, in order. */
export function pendingQuestions(s: WantsState): Question[] {
  return [...PLAYBOOKS[s.intent], ...(s.extra ?? [])].filter((q) => !(q.slot in s.answers) && (!q.when || q.when(s)) && !(q.skipIf && q.skipIf.test(s.want)));
}

/* ───────────────────────── prompts for the actions ───────────────────────── */

const facts = (s: WantsState) => Object.entries(s.answers).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");

export function appPrompt(s: WantsState): string {
  const a = s.answers;
  const feat = (a.features ?? "").replace(/None of these/i, "").trim();
  return [
    `Build ${s.want.replace(/^(to )?(build|make|create)\s+/i, "")}.`,
    a.kind ? `Type: ${a.kind}.` : "",
    a.purpose ? `Who it's for and what it must do: ${a.purpose}.` : "",
    feat ? `Features: ${feat}.` : "",
    a.look && !/let keplar pick/i.test(a.look) ? `Look: ${a.look}.` : "",
    /mobile/i.test(a.kind ?? "") ? "It must work great on phones (responsive, installable)." : "",
  ].filter(Boolean).join(" ").slice(0, 1500);
}

export function robloxPrompt(s: WantsState): string {
  const a = s.answers;
  return [
    `Build a Roblox game: ${s.want.replace(/^(to )?(build|make|create)\s+(an?\s+)?/i, "")}.`,
    a.genre ? `Genre: ${a.genre}.` : "",
    a.loop ? `Core loop: ${a.loop}.` : "",
    a.players ? `Players per server: ${a.players}.` : "",
    a.monetize && !/not yet/i.test(a.monetize) ? `Monetization: ${a.monetize}.` : "",
    "Make it playable end to end: spawn, the core loop, UI, saving progress with DataStores, and a short tutorial.",
  ].filter(Boolean).join(" ").slice(0, 1500);
}

export function orderSummary(s: WantsState): { item: string; place?: Place } {
  const item = [s.answers.item ?? s.want, s.answers.details].filter(Boolean).join(", ");
  return { item, place: s.places?.find((p) => p.id === s.placeId) };
}

/** Deep links that open the order on the person's chosen delivery service, signed in as themselves. */
export function deliveryLink(service: DeliveryService, placeName: string, address?: string): string {
  const q = encodeURIComponent(placeName);
  if (service === "doordash") return `https://www.doordash.com/search/store/${q}/`;
  if (service === "ubereats") return `https://www.ubereats.com/search?q=${q}${address ? `&pl=${encodeURIComponent(address)}` : ""}`;
  return `https://www.grubhub.com/search?queryText=${q}`;
}

export const DELIVERY_NAME: Record<DeliveryService, string> = { doordash: "DoorDash", ubereats: "Uber Eats", grubhub: "Grubhub" };

/** Palmo's goal for placing the confirmed order in the person's own browser. */
export function orderGoal(s: WantsState): string {
  const { item, place } = orderSummary(s);
  if (!place) return "";
  if (s.fulfilment === "pickup" || !s.delivery) return `Open ${place.name}'s ordering page (or its listing on a pickup app) and order ${item} for pickup at ${place.name}${place.address ? `, ${place.address}` : ""}. The person has already confirmed this order in Keplar Wants.`;
  return `In the web browser, open ${DELIVERY_NAME[s.delivery]} (${deliveryLink(s.delivery, place.name, s.address)}), find ${place.name}${place.address ? ` at ${place.address}` : ""}, add ${item} to the cart, set the delivery address to ${s.address ?? "the person's saved address"}, go to checkout and place the order. The person has already confirmed this exact order in Keplar Wants.`;
}

export function stayUrl(s: WantsState): string {
  const where = encodeURIComponent((s.answers.where ?? s.want).replace(/\s+/g, " ").trim());
  const guests = Number((s.answers.guests ?? "").match(/\d+/)?.[0] ?? 2);
  return `https://www.airbnb.com/s/${where}/homes?adults=${guests}`;
}

export function rideUrl(s: WantsState): string {
  const to = s.answers.to ?? s.want.replace(/^(an? )?(uber|lyft|ride|taxi)\s*(to)?\s*/i, "");
  const pickup = s.location ? `&pickup[latitude]=${s.location.lat}&pickup[longitude]=${s.location.lon}` : "&pickup=my_location";
  return `https://m.uber.com/ul/?action=setPickup${pickup}&dropoff[formatted_address]=${encodeURIComponent(to)}`;
}

/* ───────────────────────── the flow ───────────────────────── */

export function nextStep(s: WantsState): Step {
  if (s.intent === "general" && !s.extra) return { kind: "llm_questions" };
  const ask = pendingQuestions(s)[0];
  if (ask) return { kind: "ask", question: ask };
  switch (s.intent) {
    case "build_app": return { kind: "build_app", prompt: appPrompt(s) };
    case "roblox": return { kind: "roblox", prompt: robloxPrompt(s) };
    case "money": return { kind: "money_plan" };
    case "ride": return { kind: "ride", url: rideUrl(s) };
    case "stay": return { kind: "search_and_book", site: "airbnb", query: `${s.want}. ${facts(s)}`, url: stayUrl(s) };
    case "travel": return { kind: "search_and_book", site: "flights", query: `Flights from ${s.answers.from ?? "?"} to ${s.answers.where ?? s.want}, ${s.answers.dates ?? ""}, ${s.answers.who ?? ""}`, url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`flights from ${s.answers.from ?? ""} to ${s.answers.where ?? s.want}`)}` };
    case "shopping": return { kind: "search_and_book", site: "shop", query: `${s.want}. ${facts(s)}`.trim(), url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${s.want} ${s.answers.specifics ?? ""}`)}` };
    case "food": {
      if (!s.location) return { kind: "location", question: "Where are you? Keplar looks for places near you." };
      if (!s.places) return { kind: "find_places" };
      if (!s.placeId) return { kind: "pick_place" };
      if (!s.fulfilment) return { kind: "fulfilment" };
      if (s.fulfilment === "delivery" && !s.address) return { kind: "address" };
      if (s.fulfilment === "delivery" && !s.delivery) return { kind: "connect_delivery" };
      if (!s.confirmed) return { kind: "confirm_order" };
      return { kind: "place_order" };
    }
  }
  return { kind: "mesh" };
}

/** A fresh state for a new want. */
export function startState(want: string): WantsState {
  const clean = want.replace(/^\s*i\s+want\s+/i, "").replace(/\s+/g, " ").trim().slice(0, 600);
  return { want: clean, intent: detectIntent(clean), answers: {} };
}
