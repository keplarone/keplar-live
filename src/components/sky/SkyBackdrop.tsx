import { CloudSky } from "@/components/ui/space/CloudSky";

/**
 * The backdrop behind every marketing page (and the 404): the site's one sky, CloudSky (src/components/ui/space/CloudSky.tsx).
 * Light: a bright day with realistic clouds drifting in three parallax layers. Dark: late dusk, a deep blue with small stars and
 * faint clouds. Static CSS on the first paint; drift starts when the page is idle; still on phones and under reduced motion.
 * (It replaced the light theme's auras, liquid layer and dot ribbons and the dark theme's star field.)
 */
export function SkyBackdrop() {
  return <CloudSky />;
}
