/**
 * How a weather variant is drawn on the procedural cloud sky.
 * Light and dark palettes stay as they are. Weather only changes coverage, greyness,
 * height, haze and precipitation. Time of day is not a factor.
 */
import { DEFAULT_SKY, isSkyVariant, type SkyVariant } from "@/lib/sky/variants";

export type PrecipKind = "none" | "rain" | "snow";

export interface SkyProfile {
  /** Fraction of the cloud deck that is drawn. Clear keeps a few wisps. */
  coverage: number;
  /** 0..1 mix of the lit cloud colour toward the shadow, so overcast and rain go greyer. */
  gray: number;
  /** World units to lower the deck. Overcast, fog and rain sit lower. */
  drop: number;
  /** 0..1 strength of the low-contrast haze in front of the sky gradient. */
  haze: number;
  /** Scale of each puff. Overcast is bulkier. */
  bulk: number;
  /** Vertical squash. Fog and stratus are flatter. */
  flat: number;
  /** 0..1 how hard the middle of the frame is kept clear of cloud. */
  clearing: number;
  precip: PrecipKind;
  /** 0..1 before the mobile cap. */
  precipAmount: number;
  /** A very brief dim brightening is allowed. Reduced motion turns it off. */
  flash: boolean;
}

const PROFILES: Record<SkyVariant, SkyProfile> = {
  clear: { coverage: 0.2, gray: 0, drop: 0, haze: 0, bulk: 0.72, flat: 1, clearing: 0.85, precip: "none", precipAmount: 0, flash: false },
  "partly-cloudy": { coverage: 1, gray: 0, drop: 0, haze: 0, bulk: 1, flat: 1, clearing: 0.55, precip: "none", precipAmount: 0, flash: false },
  cloudy: { coverage: 1, gray: 0.18, drop: 0.25, haze: 0.06, bulk: 1.12, flat: 0.9, clearing: 0.4, precip: "none", precipAmount: 0, flash: false },
  overcast: { coverage: 1, gray: 0.58, drop: 0.85, haze: 0.2, bulk: 1.4, flat: 0.7, clearing: 0.08, precip: "none", precipAmount: 0, flash: false },
  fog: { coverage: 0.85, gray: 0.28, drop: 1.05, haze: 0.62, bulk: 1.2, flat: 0.45, clearing: 0, precip: "none", precipAmount: 0, flash: false },
  drizzle: { coverage: 1, gray: 0.42, drop: 0.65, haze: 0.24, bulk: 1.25, flat: 0.62, clearing: 0.08, precip: "rain", precipAmount: 0.4, flash: false },
  rain: { coverage: 1, gray: 0.4, drop: 0.35, haze: 0.1, bulk: 1.2, flat: 0.78, clearing: 0.2, precip: "rain", precipAmount: 0.85, flash: false },
  thunderstorm: { coverage: 1, gray: 0.74, drop: 0.9, haze: 0.1, bulk: 1.45, flat: 0.78, clearing: 0.02, precip: "rain", precipAmount: 1, flash: true },
  snow: { coverage: 0.95, gray: 0.16, drop: 0.4, haze: 0.22, bulk: 1.15, flat: 0.8, clearing: 0.12, precip: "snow", precipAmount: 0.8, flash: false },
};

export function skyProfile(variant: SkyVariant): SkyProfile {
  return PROFILES[variant];
}

export function skyFromQuery(search: string): SkyVariant | null {
  const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("sky");
  return isSkyVariant(v) ? v : null;
}

/** Rain and snow counts. Reduced motion draws none. Phones draw a short cap. */
export function precipCount(profile: SkyProfile, opts: { reduce: boolean; phone: boolean }): number {
  if (opts.reduce || profile.precip === "none" || profile.precipAmount <= 0) return 0;
  const cap = opts.phone ? 16 : 48;
  return Math.max(1, Math.round(cap * Math.min(1, profile.precipAmount)));
}

/** The sky to paint before the lookup returns, and whenever the lookup cannot. */
export function fallbackProfile(): SkyProfile {
  return skyProfile(DEFAULT_SKY);
}
