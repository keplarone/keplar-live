/**
 * The first name for "Name, try your first question". Only a clean, name-looking first word is used (letters, with an
 * apostrophe, dot or hyphen inside); anything else (digits, handles, e-mail pieces, a single letter, symbols) gives null so
 * the heading falls back to "Try your first question" instead of greeting someone with garbage.
 */
export function greetName(raw: string | null | undefined): string | null {
  const first = (raw ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}[\p{L}'’.-]{1,23}$/u.test(first)) return null;
  return first;
}
