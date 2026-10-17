// The weather sky (docs/design/space-ui.md, "The weather sky"): the visitor's current weather picks the sky behind the marketing
// pages. Server side: Vercel geo headers -> rounded cell -> Open-Meteo (cached) -> variant. Never stores or logs the location.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  cacheClear,
  cacheGet,
  cachePut,
  cellFromHeaders,
  cellKey,
  devOverride,
  FALLBACK_WEATHER,
  openMeteoUrl,
  resolveSky,
  roundCoord,
  skyFromWeather,
  weatherForCell,
  SKY_TTL_SECONDS,
} from "@/lib/sky/weather";
import { SKY_VARIANTS, skyLook, windFactor } from "@/lib/sky/variants";
import { GET } from "@/app/api/sky/route";

const read = (f: string) => readFileSync(f, "utf8");
const meteo = (current: Record<string, unknown>, ok = true) => async () => new Response(JSON.stringify({ current }), { status: ok ? 200 : 500 });
const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
const PROD = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

beforeEach(() => cacheClear());

test("WMO weather code (+ cloud cover) maps onto the sky variants", () => {
  const table: [number | null, number | null, string][] = [
    [0, 0, "clear"], [0, 40, "partly-cloudy"], [1, 10, "clear"], [1, 30, "partly-cloudy"],
    [2, 50, "partly-cloudy"], [2, 80, "cloudy"], [3, 100, "overcast"], [3, 60, "cloudy"], [3, null, "overcast"],
    [45, 100, "fog"], [48, 100, "fog"],
    [51, 100, "drizzle"], [53, 100, "drizzle"], [55, 100, "drizzle"], [56, 100, "drizzle"], [57, 100, "drizzle"],
    [61, 100, "rain"], [63, 100, "rain"], [65, 100, "rain"], [66, 100, "rain"], [67, 100, "rain"], [80, 90, "rain"], [81, 90, "rain"], [82, 90, "rain"],
    [71, 100, "snow"], [73, 100, "snow"], [75, 100, "snow"], [77, 100, "snow"], [85, 100, "snow"], [86, 100, "snow"],
    [95, 100, "thunderstorm"], [96, 100, "thunderstorm"], [99, 100, "thunderstorm"],
    // unknown codes fall back to the cloud cover, then to the neutral sky
    [42, 5, "clear"], [42, 30, "partly-cloudy"], [42, 70, "cloudy"], [42, 95, "overcast"], [null, 70, "cloudy"], [null, null, "partly-cloudy"],
  ];
  for (const [code, cc, want] of table) assert.equal(skyFromWeather(code, cc), want, `code ${code}, cover ${cc}`);
  for (const v of SKY_VARIANTS) for (const t of ["light", "dark"] as const) assert.ok(skyLook(v, t).zenith.startsWith("#"), `${v} ${t}`);
});

test("wind nudges the drift speed, within bounds", () => {
  assert.equal(windFactor(null), 1);
  assert.equal(windFactor(-3), 1);
  assert.ok(windFactor(0) < windFactor(20) && windFactor(20) < windFactor(40));
  assert.equal(windFactor(500), 2.5);
  assert.equal(windFactor(0), 0.6);
});

test("coordinates round to one decimal (~11 km) and make the cache key; junk is rejected", () => {
  assert.equal(roundCoord("48.8566", 90), 48.9);
  assert.equal(roundCoord("-33.8688", 90), -33.9);
  assert.equal(roundCoord("-0.04", 90), 0);
  assert.equal(Object.is(roundCoord("-0.04", 90), -0), false, "no negative zero in keys");
  assert.equal(roundCoord("2.35", 180), 2.4);
  for (const bad of [null, undefined, "", "abc", "1e3", "91", "NaN", "12.5;drop"]) assert.equal(roundCoord(bad as string, 90), null, String(bad));
  assert.equal(roundCoord("181", 180), null);
  assert.equal(cellKey(48.9, 2.4), "48.9,2.4");
  assert.equal(cellKey(0, -120), "0.0,-120.0");
  const h = new Headers({ "x-vercel-ip-latitude": "48.8566", "x-vercel-ip-longitude": "2.3522" });
  assert.deepEqual(cellFromHeaders(h), { lat: 48.9, lon: 2.4 });
  assert.equal(cellFromHeaders(new Headers({ "x-vercel-ip-latitude": "48.8" })), null);
  assert.match(openMeteoUrl(48.9, 2.4), /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=48\.9&longitude=2\.4&current=weather_code,cloud_cover,wind_speed_10m,precipitation$/);
});

test("weather is cached per rounded cell for 15 minutes (one Open-Meteo call per cell)", async () => {
  let calls = 0;
  const urls: string[] = [];
  const f = async (u: string) => {
    calls++;
    urls.push(u);
    return new Response(JSON.stringify({ current: { weather_code: 61, cloud_cover: 100, wind_speed_10m: 20 } }));
  };
  const a = await weatherForCell(48.9, 2.4, f);
  const b = await weatherForCell(48.9, 2.4, f);
  assert.equal(a.sky, "rain");
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  // two visitors a few km apart share the cell
  await resolveSky(req("https://keplar.one/api/sky", { "x-vercel-ip-latitude": "48.87", "x-vercel-ip-longitude": "2.36" }), f, PROD);
  assert.equal(calls, 1);
  assert.ok(urls.every((u) => /latitude=48\.9&longitude=2\.4/.test(u)), "only the rounded cell leaves the server");
  // expiry
  cachePut("1.0,1.0", { sky: "snow", wind: 1 }, 0);
  assert.equal(cacheGet("1.0,1.0", SKY_TTL_SECONDS * 1000 + 1), null);
});

test("fallbacks: no geo headers, timeout or error, bad body all give the neutral partly-cloudy sky", async () => {
  let called = false;
  const never = async () => {
    called = true;
    return new Response("{}");
  };
  assert.deepEqual(await resolveSky(req("https://keplar.one/api/sky"), never, PROD), FALLBACK_WEATHER);
  assert.equal(called, false, "no location, no lookup");
  assert.equal(FALLBACK_WEATHER.sky, "partly-cloudy");
  assert.deepEqual(await weatherForCell(10, 10, meteo({}, false)), FALLBACK_WEATHER);
  assert.deepEqual(await weatherForCell(11, 10, async () => new Response("not json")), FALLBACK_WEATHER);
  assert.deepEqual(await weatherForCell(12, 10, async () => new Response(JSON.stringify({ nope: 1 }))), FALLBACK_WEATHER);
  assert.deepEqual(await weatherForCell(13, 10, async () => { throw new DOMException("timed out", "TimeoutError"); }), FALLBACK_WEATHER);
  // the fetch is bounded (3 s) and uses Next's 15-minute cache
  let init: RequestInit & { next?: { revalidate?: number } } = {};
  await weatherForCell(14, 10, async (_u, i) => {
    init = i ?? {};
    return new Response(JSON.stringify({ current: { weather_code: 0, cloud_cover: 0 } }));
  });
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.next?.revalidate, 900);
  assert.match(read("src/lib/sky/weather.ts"), /AbortSignal\.timeout\(WEATHER_TIMEOUT_MS\)/);
  assert.match(read("src/lib/sky/weather.ts"), /WEATHER_TIMEOUT_MS = 3000/);
});

test("?sky=<variant> works only outside production or with KEPLAR_DEV_TOOLS=1", async () => {
  const u = new URL("https://keplar.one/api/sky?sky=thunderstorm");
  assert.equal(devOverride(u, PROD), null);
  assert.equal(devOverride(u, { NODE_ENV: "production", KEPLAR_DEV_TOOLS: "1" } as NodeJS.ProcessEnv), "thunderstorm");
  assert.equal(devOverride(u, { NODE_ENV: "development" } as NodeJS.ProcessEnv), "thunderstorm");
  assert.equal(devOverride(new URL("https://keplar.one/api/sky?sky=tornado"), { NODE_ENV: "development" } as NodeJS.ProcessEnv), null);
  const prod = await resolveSky(req("https://keplar.one/api/sky?sky=snow"), meteo({ weather_code: 0 }), PROD);
  assert.equal(prod.sky, "partly-cloudy", "production ignores the override (and, without headers, falls back)");
});

test("the location is never logged, stored or echoed", async () => {
  const logged: string[] = [];
  const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const k of Object.keys(orig) as (keyof typeof orig)[]) console[k] = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
  try {
    const headers = { "x-vercel-ip-latitude": "51.5072", "x-vercel-ip-longitude": "-0.1276", "x-vercel-ip-city": "London" };
    await resolveSky(req("https://keplar.one/api/sky", headers), meteo({ weather_code: 3, cloud_cover: 100 }), PROD);
    await resolveSky(req("https://keplar.one/api/sky", { ...headers, "x-vercel-ip-latitude": "40.7" }), async () => { throw new Error("network down 40.7"); }, PROD);
    await resolveSky(req("https://keplar.one/api/sky", { ...headers, "x-vercel-ip-latitude": "30.1" }), meteo({}, false), PROD);
  } finally {
    Object.assign(console, orig);
  }
  assert.deepEqual(logged, [], "nothing at all is logged");
  const src = read("src/lib/sky/weather.ts") + read("src/app/api/sky/route.ts");
  assert.doesNotMatch(src, /console\.|logger|captureException|cookies\(|set-cookie|db\.|kv\.|\.insert\(/i, "no logging or storage");
});

test("GET /api/sky: { sky, wind } only, private 15-minute cache, no cookies", async () => {
  const res = await GET(req("https://keplar.one/api/sky", { "x-vercel-ip-city": "Paris" }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, max-age=900");
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(res.headers.get("set-cookie"), null);
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["sky", "wind"]);
  assert.equal(body.sky, "partly-cloudy");
  assert.doesNotMatch(JSON.stringify(body), /Paris|lat|lon/i);
});

test("the weather backdrop is gone: nothing mounts it, and the navy sky gradient is gone", () => {
  assert.equal(existsSync("src/components/ui/space/WeatherSky.tsx"), false);
  assert.equal(existsSync("src/components/sky/SkyBackdrop.tsx"), false);
  assert.equal(existsSync("src/components/space/Starfield.tsx"), false);
  const css = read("src/styles/space.css");
  assert.doesNotMatch(css, /#0b1531|#3d84d5|\.sp-sky/);
  for (const f of ["src/app/layout.tsx", "src/app/(marketing)/layout.tsx", "src/app/(business)/layout.tsx", "src/app/not-found.tsx", "src/components/onboarding/Onboarding.tsx", "src/app/(space)/layout.tsx"]) {
    assert.doesNotMatch(read(f), /WeatherSky|SkyBackdrop|SpaceBackground|SpaceAura|Starfield/);
  }
  assert.match(read("src/app/layout.tsx"), /<SiteClouds \/>/);
});

test("privacy policy does not claim the background reads connection location for weather", () => {
  assert.doesNotMatch(read("src/components/legal/content/privacy.ts"), /local weather/);
  assert.match(read("src/components/legal/content/privacy.ts"), /page background does not read your location/);
});
