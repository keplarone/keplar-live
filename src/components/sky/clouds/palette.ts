/** Day is a blue sky, darker at the top (#5d9be8) and paler toward the horizon (#b9d8f5),
 * with white cumulus and light-grey undersides. Night is the same composition in graphite-navy.
 * Light ink (#f4f4f6) on the brightest night cloud (#65707e) is about 4.6:1, and on the
 * horizon (#2a3848) about 12:1. Near-black light ink is what keeps the headline AA on #5d9be8. */
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
    return { zenith: "#161e2c", horizon: "#2a3848", lit: "#65707e", shadow: "#3a4658", body: "#d5def2" };
  }
  return { zenith: "#5d9be8", horizon: "#b9d8f5", lit: "#ffffff", shadow: "#b4c0ce", body: "#fff6e4" };
}
