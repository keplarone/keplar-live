import { dayOf } from "./srs";

/** An exam date (YYYY-MM-DD) from today to about two years out, else null. */
export const validExamDate = (v: unknown, today = dayOf()): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && v >= today && t < Date.parse(`${today}T00:00:00Z`) + 800 * 86_400_000 ? v : null;
};
