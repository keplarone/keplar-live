/**
 * The weather control's saved pick, and the live weather it falls back to.
 * The sky scene and the nav toggle share this so a click and a weather lookup stay in step.
 */
import { effectivePrecip, readPrecipChoice, WEATHER_KEY, type PrecipMode } from "@/lib/sky/journey";
import { skyProfile } from "@/lib/sky/profile";
import type { SkyVariant } from "@/lib/sky/variants";

type Listener = () => void;

let choice: PrecipMode | null = null;
let live: SkyVariant = "partly-cloudy";
let booted = false;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn();
}

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  choice = readPrecipChoice(window.localStorage);
}

export function weatherChoice(): PrecipMode | null {
  boot();
  return choice;
}

export function liveVariant(): SkyVariant {
  return live;
}

export function shownPrecip(): PrecipMode {
  boot();
  return effectivePrecip(live, choice);
}

export function setWeatherChoice(next: PrecipMode) {
  boot();
  choice = next;
  try { window.localStorage.setItem(WEATHER_KEY, next); } catch { /* private mode */ }
  document.documentElement.setAttribute("data-weather", next);
  emit();
}

export function setLiveVariant(next: SkyVariant) {
  const changed = live !== next;
  live = next;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.cloudCover = skyProfile(next).gray >= 0.16 ? "more" : "few";
    if (changed && choice === null) {
      document.documentElement.setAttribute("data-weather", effectivePrecip(next, null));
    }
  }
  if (changed) emit();
}

export function subscribeWeather(fn: Listener) {
  boot();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
