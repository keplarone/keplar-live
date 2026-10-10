/**
 * Site discovery directions (editorial, swiss, noir, …) mapped onto the app studio's style presets.
 * Choosing a direction in the brief sets both the written art direction and the real design tokens.
 */
const DIRECTION_STYLE: Record<string, string> = {
  editorial: "editorial",
  swiss: "swiss",
  noir: "luxury",
  organic: "organic",
  technical: "terminal",
  raw: "brutalist",
  craft: "retro",
  clear: "minimal",
};

export function styleForDirection(id: string): string {
  return DIRECTION_STYLE[id] ?? "editorial";
}
