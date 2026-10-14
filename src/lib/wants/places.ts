/**
 * Places near the person for Keplar Wants (coffee, food): OpenStreetMap through the public Overpass API, and Nominatim to
 * turn a typed address into coordinates. No key needed. OpenStreetMap has no prices or ratings, so the price level is an
 * estimate (a known chain's typical prices, otherwise the kind of place) and is labelled as one; the person sees "est." on it.
 * The parse / rank parts are pure and unit-tested.
 */
import type { Place, WantsState } from "./playbooks";

const UA = "KeplarWants/1.0 (+https://keplar.one)";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org";

/** Typical price level for well-known chains (1 = $, 4 = $$$$). */
const CHAINS: [RegExp, 1 | 2 | 3 | 4][] = [
  [/mcdonald|burger king|wendy|taco bell|dunkin|tim hortons|7-eleven|wawa|sheetz|subway|kfc|little caesars|domino|papa john|jack in the box|sonic|dairy queen|krispy kreme|popeyes|arby|white castle|whataburger|del taco|circle k/i, 1],
  [/starbucks|peet|caribou|dutch bros|costa|panera|chipotle|chick-fil-a|five guys|shake shack|in-n-out|panda express|qdoba|jersey mike|jimmy john|pizza hut|wingstop|raising cane|culver|moe's|noodles|potbelly|einstein|tropical smoothie|smoothie king|jamba|honeygrow|sweetgreen|cava/i, 2],
  [/blue bottle|intelligentsia|stumptown|la colombe|philz|verve|joe coffee|ralph's coffee|cheesecake factory|p\.f\. chang|olive garden|red lobster|texas roadhouse|outback/i, 3],
  [/nobu|ruth's chris|morton|capital grille|del frisco|mastro/i, 4],
];

const DOLLARS = ["", "$", "$$", "$$$", "$$$$"];

export function priceFor(name: string, kind: string, cuisine?: string): { level: 1 | 2 | 3 | 4; note: string; brand?: string } {
  for (const [re, level] of CHAINS) if (re.test(name)) return { level, note: `${DOLLARS[level]} · est. from the chain's usual prices`, brand: name };
  const level: 1 | 2 | 3 | 4 = kind === "fast_food" || kind === "ice_cream" ? 1 : kind === "restaurant" ? (/sushi|steak|french|seafood|fine/i.test(cuisine ?? "") ? 3 : 2) : 2;
  return { level, note: `${DOLLARS[level]} · est. (independent ${kind === "cafe" ? "café" : kind.replace("_", " ")})` };
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
}

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** What to look for, from the want and the answers. */
export function searchSpec(s: WantsState): { amenities: string[]; cuisine?: string; name?: string } {
  const text = `${s.want} ${s.answers.item ?? ""}`.toLowerCase();
  const source = s.answers.source ?? "";
  const named = source && !/^(closest to me|cheapest|best rated)$/i.test(source) ? source : undefined;
  if (/coffee|latte|espresso|cappuccino|mocha|frappuccino|cold brew|americano|tea|boba/.test(text)) return { amenities: ["cafe"], name: named };
  const cuisine = text.match(/pizza|burger|sushi|mexican|taco|chinese|thai|indian|chicken|sandwich|salad|breakfast|donut|ice cream|wings|ramen|italian|kebab/)?.[0];
  return { amenities: ["restaurant", "fast_food", "cafe", ...(/ice cream|dessert/.test(text) ? ["ice_cream"] : [])], cuisine: cuisine === "taco" ? "mexican" : cuisine === "burger" ? "burger" : cuisine, name: named };
}

export function overpassQuery(at: { lat: number; lon: number }, spec: ReturnType<typeof searchSpec>, radiusM = 2500): string {
  const esc = (v: string) => v.replace(/[\\"]/g, "").replace(/[.*+?^${}()|[\]]/g, "\\$&");
  const filters = spec.amenities.map((a) => {
    const nm = spec.name ? `["name"~"${esc(spec.name)}",i]` : "";
    const cu = !spec.name && spec.cuisine && a !== "cafe" ? `["cuisine"~"${esc(spec.cuisine)}",i]` : "";
    return `nwr["amenity"="${a}"]${nm}${cu}(around:${radiusM},${at.lat},${at.lon});`;
  }).join("");
  return `[out:json][timeout:20];(${filters});out center 60;`;
}

export function parsePlaces(els: OsmEl[], at: { lat: number; lon: number }): Place[] {
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const e of els) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!t.name || lat === undefined || lon === undefined) continue;
    const key = `${t.name.toLowerCase()}@${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const price = priceFor(t.brand ?? t.name, t.amenity ?? "", t.cuisine);
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const address = [street, t["addr:city"]].filter(Boolean).join(", ") || undefined;
    out.push({ id: `${e.type}/${e.id}`, name: t.name, ...(address ? { address } : {}), lat, lon, distanceKm: distanceKm(at, { lat, lon }), priceLevel: price.level, priceNote: price.note, ...(price.brand ? { brand: price.brand } : {}), ...(t.website ? { url: t.website } : {}) });
  }
  return out;
}

/** Cheap to expensive (closest first within a level), or by the person's choice. */
export function rankPlaces(places: Place[], source?: string, max = 8): Place[] {
  const byDistance = (a: Place, b: Place) => a.distanceKm - b.distanceKm;
  const sorted = /closest/i.test(source ?? "") ? [...places].sort(byDistance) : [...places].sort((a, b) => a.priceLevel - b.priceLevel || byDistance(a, b));
  // Keep a spread across price levels so "cheap to expensive" is a real choice, not eight of the same chain.
  const picked: Place[] = [];
  const perName = new Map<string, number>();
  for (const p of sorted) {
    const n = (p.brand ?? p.name).toLowerCase();
    if ((perName.get(n) ?? 0) >= 1) continue;
    perName.set(n, (perName.get(n) ?? 0) + 1);
    picked.push(p);
    if (picked.length >= max) break;
  }
  return /closest/i.test(source ?? "") ? picked : picked.sort((a, b) => a.priceLevel - b.priceLevel || byDistance(a, b));
}

export async function findPlaces(s: WantsState, signal?: AbortSignal): Promise<Place[]> {
  if (!s.location) return [];
  const spec = searchSpec(s);
  for (const radius of [2500, 8000]) {
    const r = await fetch(OVERPASS, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA }, body: `data=${encodeURIComponent(overpassQuery(s.location, spec, radius))}`, signal });
    if (!r.ok) throw new Error(`places ${r.status}`);
    const d = (await r.json()) as { elements?: OsmEl[] };
    const places = rankPlaces(parsePlaces(d.elements ?? [], s.location), s.answers.source);
    if (places.length >= 3 || radius === 8000) return places;
  }
  return [];
}

/** A typed address or place name to coordinates (first match), or null. */
export async function geocode(q: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; label: string } | null> {
  const r = await fetch(`${NOMINATIM}/search?format=json&limit=1&q=${encodeURIComponent(q.slice(0, 200))}`, { headers: { "user-agent": UA, "accept-language": "en" }, signal });
  if (!r.ok) return null;
  const d = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  const hit = d[0];
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name.split(",").slice(0, 3).join(",") } : null;
}

/** Coordinates to a short street address, or null. */
export async function reverseGeocode(at: { lat: number; lon: number }, signal?: AbortSignal): Promise<string | null> {
  const r = await fetch(`${NOMINATIM}/reverse?format=json&lat=${at.lat}&lon=${at.lon}`, { headers: { "user-agent": UA, "accept-language": "en" }, signal });
  if (!r.ok) return null;
  const d = (await r.json()) as { display_name?: string };
  return d.display_name ? d.display_name.split(",").slice(0, 4).join(",").trim() : null;
}
