/**
 * Landing-page sky journey and the weather-mode control.
 * Pure data: no DOM, so the scroll mapping and the weather override can be tested on their own.
 */
import { skyProfile, type SkyProfile } from "@/lib/sky/profile";
import type { SkyVariant } from "@/lib/sky/variants";

export const WEATHER_KEY = "keplar-weather-v1";

/** What the weather control can show. `none` is the Clear option (no precipitation). */
export type PrecipMode = "snow" | "rain" | "none";

export const PRECIP_MODES: readonly PrecipMode[] = ["snow", "rain", "none"];

/** Live weather, collapsed to the three control options. */
export function precipFromVariant(variant: string): PrecipMode {
  if (variant === "snow") return "snow";
  if (variant === "rain" || variant === "drizzle" || variant === "thunderstorm") return "rain";
  return "none";
}

export function isPrecipMode(v: unknown): v is PrecipMode {
  return v === "snow" || v === "rain" || v === "none";
}

/** The saved pick, or null when the visitor has not chosen and live weather should decide. */
export function readPrecipChoice(storage: { getItem(key: string): string | null } | null): PrecipMode | null {
  try {
    const v = storage?.getItem(WEATHER_KEY) ?? null;
    return isPrecipMode(v) ? v : null;
  } catch {
    return null;
  }
}

/** An explicit pick wins. Otherwise snow, rain (including drizzle and storms), or none. */
export function effectivePrecip(liveVariant: string, choice: PrecipMode | null): PrecipMode {
  return choice ?? precipFromVariant(liveVariant);
}

/**
 * The profile to draw. No pick keeps the live weather. Clear drops precipitation.
 * Rain and snow use those profiles so the sky, not only the particles, matches the pick.
 */
export function profileForChoice(live: SkyProfile, liveVariant: SkyVariant | string, choice: PrecipMode | null): SkyProfile {
  if (choice === null) return live;
  if (choice === "none") {
    if (precipFromVariant(liveVariant) === "none") return { ...live, precip: "none", precipAmount: 0, flash: false };
    return { ...skyProfile("partly-cloudy"), precip: "none", precipAmount: 0, flash: false };
  }
  if (choice === "rain") return skyProfile("rain");
  return skyProfile("snow");
}

/** 0 at the top of the page (high altitude), 1 at the bottom (the meadow). */
export function altitudeFromScroll(scrollY: number, scrollHeight: number, innerHeight: number): number {
  const max = Math.max(1, scrollHeight - innerHeight);
  const y = Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;
  return Math.min(1, y / max);
}

/**
 * How much faster precipitation falls while the page is moving.
 * `velocity` is a smoothed px/s. Still air is 1. A fast scroll tops out at 4, then eases back as velocity decays.
 */
export function fallMultiplier(velocity: number): number {
  const v = Number.isFinite(velocity) ? Math.max(0, velocity) : 0;
  return 1 + Math.min(3, v / 900);
}

/** Meadow at the bottom of the landing descent. */
export type Meadow = "day" | "night" | "rain" | "snow";

export function meadowKind(mode: PrecipMode, dark: boolean): Meadow {
  if (mode === "rain") return "rain";
  if (mode === "snow") return "snow";
  return dark ? "night" : "day";
}

export function meadowIndex(kind: Meadow): number {
  if (kind === "night") return 1;
  if (kind === "rain") return 2;
  if (kind === "snow") return 3;
  return 0;
}
