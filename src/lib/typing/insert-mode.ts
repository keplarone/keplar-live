/**
 * Insert / overtype typing mode (pure logic, no DOM writes) so it can be unit-tested.
 *
 * On by default (the Insert key works out of the box; typing is still plain insert until Insert is pressed). Settings can turn the
 * feature off, stored as "0". When enabled, the Insert key toggles overtype in text inputs and textareas:
 * a typed character replaces the character after the caret. Everything else stays native (selection replace, IME, undo,
 * paste, Enter). The DOM side lives in src/components/glass/InsertMode.tsx.
 */
export const INSERT_PREF_KEY = "kp-insert-key";
export const INSERT_PREF_EVENT = "kp:insert-key";

/** The stored preference -> is the feature enabled? Absent (never chosen) = enabled; only an explicit "0" turns it off. */
export function insertEnabled(stored: string | null): boolean {
  return stored !== "0";
}

/** `input` types that hold free text and expose a caret (email/number/etc. return null selection in browsers). */
const TEXT_TYPES = new Set(["text", "search", "url", "tel", "password", ""]);

export function isTextTarget(el: unknown): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || typeof el !== "object") return false;
  const tag = (el as { tagName?: string }).tagName;
  if (tag === "TEXTAREA") return !(el as HTMLTextAreaElement).readOnly && !(el as HTMLTextAreaElement).disabled;
  if (tag === "INPUT") {
    const i = el as HTMLInputElement;
    return TEXT_TYPES.has((i.getAttribute("type") ?? "").toLowerCase()) && !i.readOnly && !i.disabled;
  }
  return false;
}

export type KeyInfo = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing?: boolean; keyCode?: number; altGraph?: boolean };

/** Is this the bare Insert key (Shift+Insert paste and Ctrl+Insert copy stay native)? */
export function isInsertKey(k: KeyInfo & { shiftKey?: boolean }): boolean {
  return k.key === "Insert" && !k.ctrlKey && !k.metaKey && !k.altKey && !k.shiftKey;
}

/**
 * How many UTF-16 units to overwrite for this keystroke, or 0 to let the browser insert normally
 * (not a single printable character, a selection exists, caret at the end, next char is a line break, IME composing).
 */
export function overtypeSpan(k: KeyInfo, value: string, start: number | null, end: number | null): number {
  if (k.isComposing || k.keyCode === 229) return 0;
  if ((k.ctrlKey || k.metaKey || k.altKey) && !k.altGraph) return 0;
  if ([...k.key].length !== 1) return 0;
  if (start === null || end === null || start !== end) return 0;
  if (start >= value.length) return 0;
  const c = value.charCodeAt(start);
  if (c === 10 || c === 13) return 0; // never swallow a line break
  const next = value.charCodeAt(start + 1);
  return c >= 0xd800 && c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 2 : 1; // surrogate pair = one character
}
