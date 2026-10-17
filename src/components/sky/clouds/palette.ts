/** Neutral skies. Light is a pale grey day; dark is graphite.
 * Dark highlights stay under the AA ceiling for light nav ink (#e4e6ea on #5c6066 is about 5:1).
 * The zenith is darker and the shadow is deeper so a cloud edge behind the glass is a real step. */
export type CloudPalette = {
  zenith: string;
  horizon: string;
  lit: string;
  shadow: string;
};

export function cloudPalette(dark: boolean): CloudPalette {
  if (dark) {
    return { zenith: "#090b10", horizon: "#2c3038", lit: "#5c6066", shadow: "#1a1d24" };
  }
  return { zenith: "#d5dae2", horizon: "#eef1f4", lit: "#fbfcfd", shadow: "#727a82" };
}
