/**
 * Embeddable site features. The generator never writes server code: it writes an empty placeholder such as
 *   <div data-k-feature="form" data-k-id="contact" data-k-fields="name,email,message"></div>
 * and Keplar's server turns that into real, sanitized markup (and the routes behind it) when the page is served.
 * Every attribute value is validated here, so model output can carry a choice but never a script, a URL or a secret.
 */
export type FeatureId = "form" | "newsletter" | "booking" | "data" | "search" | "blog" | "members" | "analytics" | "checkout" | "embeds";
/** live: works on published sites. beta: works but limited, labelled in the UI. soon: not built; the builder refuses to add it. */
export type FeatureStatus = "live" | "beta" | "soon";

export type FeatureInfo = {
  id: FeatureId;
  label: string;
  status: FeatureStatus;
  summary: string;
  /** What is missing for a "soon" feature, or the limit of a "beta" one. Shown to the owner. */
  note?: string;
  /** Example placeholder the generator is taught. */
  example: string;
  /** Sample request a user can click in the Add-feature panel. */
  prompt: string;
};

export const FEATURES: FeatureInfo[] = [
  { id: "form", label: "Contact and lead form", status: "live", summary: "Visitors send a message; it lands in your Leads and CRM. Spam traps, rate limits, optional email to you.", example: '<div data-k-feature="form" data-k-id="contact" data-k-title="Get in touch" data-k-fields="name,email,message" data-k-button="Send"></div>', prompt: "Add a contact form to the Contact page that saves to my leads." },
  { id: "newsletter", label: "Newsletter or waitlist signup", status: "live", summary: "Collects email addresses into your CRM with double-entry protection. Sending newsletters is not included.", example: '<div data-k-feature="newsletter" data-k-id="news" data-k-kind="waitlist" data-k-title="Join the waitlist" data-k-button="Join"></div>', prompt: "Add a waitlist signup to the home page." },
  { id: "booking", label: "Bookings and appointments", status: "live", summary: "Visitors pick a free time slot; double bookings are blocked; you see every booking.", example: '<div data-k-feature="booking" data-k-id="consult" data-k-title="Book a call" data-k-days="mon-fri" data-k-hours="09:00-17:00" data-k-slot="30" data-k-tz="America/New_York"></div>', prompt: "Add a booking section where people can book a 30 minute call on weekdays 9 to 5." },
  { id: "data", label: "Data collections", status: "live", summary: "A table of rows you edit (menu, team, events). The site shows it, and anyone can read it as JSON. Only you can change it.", example: '<div data-k-feature="data" data-k-id="menu" data-k-title="Menu" data-k-fields="item,price,notes" data-k-view="table" data-k-seed="Sourdough loaf;$7;Baked daily|Rye;$8;Fridays only"></div>', prompt: "Show my menu as an editable table I can update later." },
  { id: "search", label: "Site search", status: "live", summary: "A search box that finds words across your published pages and shows matches with a snippet. Members-only pages are never searched.", example: '<div data-k-feature="search" data-k-id="find" data-k-title="Search this site" data-k-button="Search"></div>', prompt: "Add a search box to the home page." },
  { id: "blog", label: "Blog with owner editing", status: "live", summary: "A list of posts on the page and a page per post. You write, edit, publish and delete posts in this panel; changes are live at once. Posts are plain text (## heading, - list).", example: '<div data-k-feature="blog" data-k-id="posts" data-k-title="Latest posts" data-k-seed="Hello from the bakery;We opened our doors this week.|Why we use a slow rise;Twenty hours of fermentation gives the flavor."></div>', prompt: "Add a blog where I can write posts." },
  { id: "members", label: "Visitor accounts", status: "beta", summary: "Visitors create an account (email and password) and log in. Add data-k-gate=\"page\" and the whole page is members-only: its content is never sent to anyone who isn't signed in.", note: "BETA: no email verification and no password reset yet (you can remove a member in this panel).", example: '<div data-k-feature="members" data-k-id="area" data-k-gate="page" data-k-title="Members only"></div>', prompt: "Add a members-only page that visitors can sign up and log in to see." },
  { id: "analytics", label: "Owner analytics", status: "live", summary: "Page views, daily visitors, top pages and where visitors came from, on this tab. No cookies, no scripts, no IP addresses stored; bots and Do Not Track visitors are not counted. It is on for every published site; you can switch it off.", example: "", prompt: "Show me how many people visit." },
  { id: "checkout", label: "Checkout and payments", status: "beta", summary: "Buy buttons for up to 12 products. Visitors pay on a Stripe page; the money goes to your own Stripe account; orders appear in Business after Stripe confirms them. Needs Plus and a connected Stripe account.", note: "BETA: runs in Stripe test mode unless live keys are set, no cart yet (one product per purchase), and it has only been exercised with a simulated Stripe so far.", example: '<div data-k-feature="checkout" data-k-id="shop" data-k-title="Shop" data-k-currency="usd" data-k-products="Sourdough loaf;7.00;Baked daily|Rye loaf;8.50;Fridays only"></div>', prompt: "Add a shop where people can buy my three products." },
  { id: "embeds", label: "Video, map, calendar and chat cards", status: "beta", summary: "A card that opens a YouTube or Vimeo video, a map for an address, your Calendly / Cal.com booking page, or a WhatsApp chat. Real links, no setup, nothing to configure.", note: "BETA: these open the provider in a new tab. Players, interactive maps and live-chat widgets can't run inside the secure site sandbox yet (COMING SOON).", example: '<div data-k-feature="embeds" data-k-id="find" data-k-kind="map" data-k-title="Visit us" data-k-address="12 Mill Lane, Brooklyn NY"></div> or data-k-kind="video" data-k-src="https://www.youtube.com/watch?v=VIDEOID" or data-k-kind="calendar" data-k-src="https://calendly.com/yourname/30min" or data-k-kind="chat" data-k-phone="+15551234567"', prompt: "Add a map card with our address on the contact page." },
];

export const featureInfo = (id: string) => FEATURES.find((f) => f.id === id);
export const FEATURE_IDS = new Set<string>(FEATURES.map((f) => f.id));
/** Features the generator may place right now. A "soon" feature is never offered, so it can never be faked. */
export const usableFeatures = () => FEATURES.filter((f) => f.status !== "soon");
/** Features the generator places as a placeholder. (Analytics has none: it is a setting.) */
export const placeable = (f: FeatureInfo) => f.example !== "";

const SLUG = /^[a-z][a-z0-9-]{0,29}$/;
const TEXT = /^[^<>"`\\{}]{1,120}$/;
const FIELD_LIST = /^[a-z][a-z0-9_]{0,19}(,[a-z][a-z0-9_]{0,19}){0,7}$/;
const DAYS = /^(mon|tue|wed|thu|fri|sat|sun)(-(mon|tue|wed|thu|fri|sat|sun))?(,(mon|tue|wed|thu|fri|sat|sun)(-(mon|tue|wed|thu|fri|sat|sun))?){0,3}$/;
const HOURS = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

function validTz(tz: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validators for every data-k-* attribute. Return the clean value or null (the attribute is dropped). */
export const FEATURE_ATTRS: Record<string, (v: string) => string | null> = {
  "data-k-feature": (v) => (FEATURE_IDS.has(v) ? v : null),
  "data-k-id": (v) => (SLUG.test(v) ? v : null),
  "data-k-title": (v) => (TEXT.test(v) ? v : null),
  "data-k-button": (v) => (TEXT.test(v) && v.length <= 30 ? v : null),
  "data-k-note": (v) => (TEXT.test(v) ? v : null),
  "data-k-seed": (v) => (/^[^<>"`\\{}]{1,1500}$/.test(v) ? v : null),
  "data-k-fields": (v) => (FIELD_LIST.test(v) ? v : null),
  "data-k-kind": (v) => (["newsletter", "waitlist", "video", "map", "calendar", "chat"].includes(v) ? v : null),
  "data-k-address": (v) => (TEXT.test(v) ? v : null),
  "data-k-phone": (v) => (/^\+?[0-9 ()-]{7,20}$/.test(v) ? v : null),
  "data-k-src": (v) => (/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]{0,180}$/.test(v) ? v : null),
  "data-k-view": (v) => (v === "table" || v === "cards" ? v : null),
  "data-k-days": (v) => (DAYS.test(v) ? v : null),
  "data-k-hours": (v) => (HOURS.test(v) && v.slice(0, 5) < v.slice(6) ? v : null),
  "data-k-slot": (v) => (["15", "20", "30", "45", "60", "90"].includes(v) ? v : null),
  "data-k-tz": (v) => (validTz(v) ? v : null),
  "data-k-gate": (v) => (v === "page" ? v : null),
  "data-k-currency": (v) => (["usd", "eur", "gbp", "cad", "aud"].includes(v) ? v : null),
  "data-k-products": (v) => (/^[^<>"`\\{}]{1,1500}$/.test(v) ? v : null),
};

/** The part of the generator prompt that teaches the placeholders. Only features that work (live or beta) are listed, so the model can't promise the rest. */
export function featureDoc(): string {
  const unavailable = [...FEATURES.filter((f) => f.status === "soon").map((f) => f.label.toLowerCase()), "live-chat widgets", "inline video players", "interactive maps", "shopping carts"].join(", ");
  const list = usableFeatures().filter((f) => f.example).map((f) => `- ${f.id}: ${f.summary}${f.status === "beta" ? " (BETA)" : ""}\n  ${f.example}`).join("\n");
  return `REAL FEATURES (server-backed; Keplar builds the markup and the backend, you only place an empty placeholder). When the brief or request needs one of these, put exactly one empty <div> with these data-k-* attributes where it belongs. Use only the attributes shown, nothing else on the div, no children, no script. For contact, newsletter, waitlist and booking use the placeholder instead of writing your own <form>. Add a heading and a sentence of copy around it. Never promise or fake a capability that is not listed (${unavailable} not available yet: leave them out and say so in <summary>).\n${list}\nOptional attributes: data-k-title, data-k-button, data-k-fields (comma list from name,email,phone,company,subject,message), data-k-days (mon-fri), data-k-hours (09:00-17:00), data-k-slot (15,20,30,45,60,90 minutes), data-k-tz (IANA zone), data-k-view (table|cards), data-k-seed (rows separated by | and cells by ;), data-k-products (checkout: products separated by |, each as name;price;short description, price in dollars like 7.50), data-k-kind (embeds: video, map, calendar or chat, with data-k-src for a YouTube/Vimeo/Calendly/Cal.com link, data-k-address for a map, data-k-phone for WhatsApp; use only values the user gave you, never invent a link, address or number), data-k-seed on a blog (first posts: title;text|title;text), data-k-currency (usd, eur, gbp, cad, aud), data-k-gate="page" (members: put the placeholder on a page and everything else on that page becomes members-only; put the placeholder without data-k-gate on a public page for a sign-in box). Checkout sells one product per purchase: do not write a cart, prices or Buy buttons yourself.`;
}
