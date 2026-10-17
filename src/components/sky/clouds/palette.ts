/** Neutral skies. Light is a pale grey day; dark is graphite. Dark cloud highlights stay dim so light ink still clears WCAG AA. */
export type CloudPalette = {
  zenith: string;
  horizon: string;
  lit: string;
  shadow: string;
};

export function cloudPalette(dark: boolean): CloudPalette {
  if (dark) {
    return { zenith: "#121316", horizon: "#2a2c31", lit: "#5a5e66", shadow: "#34373d" };
  }
  return { zenith: "#e4e7eb", horizon: "#f7f8fa", lit: "#f4f6f8", shadow: "#9aa3af" };
}
