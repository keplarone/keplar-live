import { categories, themes } from "./types";
export class InputError extends Error {}
export function parseEvent(input: unknown) {
  if (!input || typeof input !== "object") throw new InputError("Enter your event details.");
  const v = input as Record<string, unknown>;
  function text(key: string, min: number, max: number) {
    const value = typeof v[key] === "string" ? v[key].trim() : "";
    if (value.length < min || value.length > max) throw new InputError(`${key === "hostName" ? "Host name" : key[0].toUpperCase() + key.slice(1)} must be ${min}–${max} characters.`);
    return value;
  }
  const title = text("title", 3, 100), description = text("description", 10, 4000);
  const venue = text("venue", 2, 200), city = text("city", 2, 100), hostName = text("hostName", 2, 80);
  const category = text("category", 1, 40), theme = text("theme", 1, 20), timezone = text("timezone", 1, 80);
  if (!(categories as readonly string[]).includes(category)) throw new InputError("Choose an event category.");
  if (!(themes as readonly string[]).includes(theme)) throw new InputError("Choose a cover style.");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { throw new InputError("Choose a valid time zone."); }
  const starts = new Date(String(v.startsAt)), ends = new Date(String(v.endsAt));
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime())) throw new InputError("Enter valid start and end dates.");
  if (starts.getTime() <= Date.now()) throw new InputError("Choose a start time in the future.");
  if (ends <= starts) throw new InputError("The end time must be after the start time.");
  const capacity = Number(v.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) throw new InputError("Capacity must be a whole number from 1 to 10,000.");
  return { title, description, category, venue, city, hostName, theme, timezone, capacity, startsAt: starts.toISOString(), endsAt: ends.toISOString() };
}
