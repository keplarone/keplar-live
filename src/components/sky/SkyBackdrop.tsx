import { WeatherSky } from "@/components/ui/space/WeatherSky";

/**
 * The backdrop behind every marketing page (auth pages included) and the 404: the site's one sky, WeatherSky
 * (src/components/ui/space/WeatherSky.tsx), which shows the visitor's current local weather as a realistic sky (Light: by day,
 * Dark: a dimmed bluish almost-night with small stars). A pre-rendered still paints first; desktop cross-fades to the live
 * volumetric renderer after idle; phones and reduced motion keep the still.
 */
export function SkyBackdrop() {
  return <WeatherSky />;
}
