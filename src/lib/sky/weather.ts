/**
 * The visitor's current local weather, for the cloud sky behind every page.
 *
 * Server side only, no permission prompt and no client geolocation: Vercel's edge adds the approximate location of the
 * connection as request headers (`x-vercel-ip-latitude` / `-longitude`). We round it to one decimal (a cell about 11 km
 * across), ask Open-Meteo (no key) for the current weather in that cell, and map it onto one of the sky variants. The location
 * is used once for that lookup and never stored, logged or returned; the only thing kept is the rounded cell's weather, in a
 * small in-memory cache for 15 minutes (plus Next's fetch cache with the same lifetime). Any failure (no headers, timeout, bad
 * response, local dev) falls back to the neutral partly-cloudy sky.
 */
import { DEFAULT_SKY, isSkyVariant, windFactor, type SkyVariant } from "@/lib/sky/variants";

export const SKY_TTL_SECONDS = 900;
export const WEATHER_TIMEOUT_MS = 2000;
const LRU_MAX = 512;

export interface SkyWeather {
  sky: SkyVariant;
  /** Drift speed multiplier (1 = calm). */
  wind: number;
}

export const FALLBACK_WEATHER: SkyWeather = { sky: DEFAULT_SKY, wind: 1 };

/**
 * WMO weather interpretation code (+ total cloud cover %, 0..100) to a sky variant. Codes per Open-Meteo's docs:
 * 0 clear, 1 mainly clear, 2 partly cloudy, 3 overcast, 45/48 fog, 51-57 drizzle, 61-67 and 80-82 rain, 71-77 and 85-86 snow,
 * 95-99 thunderstorm. Cloud cover refines the dry codes (a "mainly clear" hour at 60% cover looks partly cloudy).
 */
export function skyFromWeather(code: number | null | undefined, cloudCover?: number | null): SkyVariant {
  const cc = typeof cloudCover === "number" && Number.isFinite(cloudCover) ? Math.min(100, Math.max(0, cloudCover)) : null;
  const byCover = (c: number): SkyVariant => (c < 15 ? "clear" : c < 55 ? "partly-cloudy" : c < 85 ? "cloudy" : "overcast");
  if (typeof code !== "number" || !Number.isFinite(code)) return cc === null ? DEFAULT_SKY : byCover(cc);
  if (code === 0) return cc !== null && cc >= 30 ? "partly-cloudy" : "clear";
  if (code === 1) return cc !== null && cc >= 25 ? "partly-cloudy" : "clear";
  if (code === 2) return cc !== null && cc >= 75 ? "cloudy" : "partly-cloudy";
  if (code === 3) return cc !== null && cc < 75 ? "cloudy" : "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "thunderstorm";
  return cc === null ? DEFAULT_SKY : byCover(cc);
}

/** Round a coordinate to one decimal (about 11 km); `null` when it is missing or out of range. */
export function roundCoord(raw: string | null | undefined, limit: 90 | 180): number | null {
  if (typeof raw !== "string" || !/^\s*-?\d+(\.\d+)?\s*$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r; // no "-0"
}

/** The cache key for a rounded cell, e.g. "48.9,2.3". */
export function cellKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

/** The rounded cell for a request, from Vercel's geo headers; `null` without them (local dev, other hosts). */
export function cellFromHeaders(h: Headers): { lat: number; lon: number } | null {
  const lat = roundCoord(h.get("x-vercel-ip-latitude"), 90);
  const lon = roundCoord(h.get("x-vercel-ip-longitude"), 180);
  return lat === null || lon === null ? null : { lat, lon };
}

/** A tiny LRU of rounded cell -> weather (Map keeps insertion order; a hit moves the entry to the end). */
const cache = new Map<string, { at: number; value: SkyWeather }>();

export function cacheGet(key: string, now = Date.now()): SkyWeather | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > SKY_TTL_SECONDS * 1000) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

export function cachePut(key: string, value: SkyWeather, now = Date.now()) {
  cache.delete(key);
  cache.set(key, { at: now, value });
  while (cache.size > LRU_MAX) cache.delete(cache.keys().next().value as string);
}

export function cacheClear() {
  cache.clear();
}

export function cacheSize() {
  return cache.size;
}

export function openMeteoUrl(lat: number, lon: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(1)}&longitude=${lon.toFixed(1)}&current=weather_code,cloud_cover,wind_speed_10m,precipitation`;
}

type Fetch = (input: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

/** Current weather for a rounded cell. Never throws and never logs (the cell is a location). */
export async function weatherForCell(lat: number, lon: number, fetcher: Fetch = fetch as Fetch): Promise<SkyWeather> {
  const key = cellKey(lat, lon);
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const res = await fetcher(openMeteoUrl(lat, lon), {
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
      next: { revalidate: SKY_TTL_SECONDS },
      headers: { accept: "application/json" },
    });
    if (!res.ok) return FALLBACK_WEATHER;
    const body = (await res.json()) as { current?: { weather_code?: unknown; cloud_cover?: unknown; wind_speed_10m?: unknown } };
    const cur = body?.current;
    if (!cur || typeof cur !== "object") return FALLBACK_WEATHER;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const value: SkyWeather = { sky: skyFromWeather(num(cur.weather_code), num(cur.cloud_cover)), wind: windFactor(num(cur.wind_speed_10m)) };
    cachePut(key, value);
    return value;
  } catch {
    return FALLBACK_WEATHER;
  }
}

/** `?sky=<variant>` for testing the variants: honoured only outside production or with KEPLAR_DEV_TOOLS=1. */
export function devOverride(url: URL, env: NodeJS.ProcessEnv = process.env): SkyVariant | null {
  const allowed = env.NODE_ENV !== "production" || env.KEPLAR_DEV_TOOLS === "1";
  if (!allowed) return null;
  const v = url.searchParams.get("sky");
  return isSkyVariant(v) ? v : null;
}

/** The sky for a request: the dev override, else the weather at the connection's rounded location, else the fallback. */
export async function resolveSky(req: Request, fetcher?: Fetch, env: NodeJS.ProcessEnv = process.env): Promise<SkyWeather> {
  const forced = devOverride(new URL(req.url), env);
  if (forced) return { sky: forced, wind: 1 };
  const cell = cellFromHeaders(req.headers);
  if (!cell) return FALLBACK_WEATHER;
  return weatherForCell(cell.lat, cell.lon, fetcher);
}
