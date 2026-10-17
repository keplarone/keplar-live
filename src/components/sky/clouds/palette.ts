/** Day is a soft blue sky with white sunlit clouds. Night is a navy sky with grey clouds
 * that stay readable against the page: light ink (#f4f4f6) on the brightest night cloud
 * (#68707e) is about 4.5:1, and on the horizon (#3d5a8a) about 6:1. */
export type CloudPalette = {
  zenith: string;
  horizon: string;
  lit: string;
  shadow: string;
  /** Sun (day) or moon (night). A disc colour, not a glow. */
  body: string;
};

export function cloudPalette(dark: boolean): CloudPalette {
  if (dark) {
    return { zenith: "#2a4068", horizon: "#3d5a8a", lit: "#68707e", shadow: "#31425c", body: "#d5def2" };
  }
  // Top is the colour behind the headline, so it stays a light blue that clears AA for the lede.
  // The lower sky is a deeper blue. Neither is a white wash.
  return { zenith: "#b7d4ec", horizon: "#6ea0d4", lit: "#f7f9fb", shadow: "#7e8c9c", body: "#fff6e4" };
}
