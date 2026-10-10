import type { Direction } from "./flow";

/** Three directions to offer right after the idea is read: the one Keplar would pick, one that differs in mode (light/dark), and one more that differs in feel. Never more than three, never repeats. */
export function pickChoices(directions: Direction[], recommended: string): Direction[] {
  const rec = directions.find((d) => d.id === recommended) ?? directions[0];
  if (!rec) return [];
  const rest = directions.filter((d) => d.id !== rec.id);
  const second = rest.find((d) => d.mode !== rec.mode) ?? rest[0];
  const third = rest.find((d) => d.id !== second?.id && d.display !== rec.display && d.display !== second?.display) ?? rest.find((d) => d.id !== second?.id);
  return [rec, second, third].filter((d): d is Direction => Boolean(d));
}
