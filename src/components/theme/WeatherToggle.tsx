"use client";

import { useSyncExternalStore } from "react";
import { PRECIP_MODES, type PrecipMode } from "@/lib/sky/journey";
import { setWeatherChoice, shownPrecip, subscribeWeather, weatherChoice } from "@/lib/sky/weather-mode";

const LABEL: Record<PrecipMode, string> = {
  snow: "Snow",
  rain: "Rain",
  none: "Clear",
};

function Icon({ mode }: { mode: PrecipMode }) {
  if (mode === "snow") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3v18M6.5 6.2l11 11.6M17.5 6.2l-11 11.6M4 9.2h16M4 14.8h16" />
      </svg>
    );
  }
  if (mode === "rain") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M7 15.5l-1.2 3M12 15.5l-1.2 3M17 15.5l-1.2 3" />
        <path d="M6.5 15h11a4.2 4.2 0 0 0 .4-8.3A5.5 5.5 0 0 0 7.2 8 3.6 3.6 0 0 0 6.5 15z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="10" r="3.2" />
      <path d="M9 4.2v1.4M9 14.4V16M4.4 10H5.8M12.2 10h1.4M5.6 6.6l1 1M11.4 12.4l1 1M5.6 13.4l1-1M11.4 7.6l1-1" />
      <path d="M14 16.5h5.2a3 3 0 0 0 .2-6 4 4 0 0 0-7.4-.4" />
    </svg>
  );
}

/**
 * Snow, rain, or clear, beside the theme switch. Arrow keys move the selection.
 * Nothing is saved until the visitor picks; until then the mark follows live weather.
 */
export function WeatherToggle({ className }: { className?: string }) {
  const mode = useSyncExternalStore(subscribeWeather, shownPrecip, () => "none" as PrecipMode);
  const picked = useSyncExternalStore(subscribeWeather, weatherChoice, () => null);
  const onKey = (e: React.KeyboardEvent) => {
    const i = PRECIP_MODES.indexOf(mode);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setWeatherChoice(PRECIP_MODES[(i + 1) % PRECIP_MODES.length]!);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setWeatherChoice(PRECIP_MODES[(i + PRECIP_MODES.length - 1) % PRECIP_MODES.length]!);
    }
  };
  return (
    <div className={className} role="radiogroup" aria-label="Weather" onKeyDown={onKey} data-glass-pill="" data-distort="" data-picked={picked ? "" : undefined}>
      {PRECIP_MODES.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          aria-label={LABEL[id]}
          title={LABEL[id]}
          tabIndex={mode === id ? 0 : -1}
          onClick={() => setWeatherChoice(id)}
        >
          <Icon mode={id} />
        </button>
      ))}
    </div>
  );
}
