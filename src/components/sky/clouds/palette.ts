/** Day is a soft blue sky with white sunlit clouds. Night is a deep blue-black.
 * Dark highlights stay under the AA ceiling for light nav ink (#e4e6ea on #5c6066 is about 5:1). */
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
    return { zenith: "#070b16", horizon: "#1c2a44", lit: "#5c6066", shadow: "#141820", body: "#d5def2" };
  }
  return { zenith: "#4f86c8", horizon: "#d5e6f5", lit: "#f7f9fb", shadow: "#7e8c9c", body: "#fff6e4" };
}
