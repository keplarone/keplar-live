/**
 * Keyboard helpers for full-screen layers that are not the kit Dialog (Lightbox, the Slides presenter).
 * The pure parts are tested in tests/keyboard-layers.test.ts.
 */

/** Elements a keyboard user can Tab to inside a layer. */
export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where Tab (or Shift+Tab) goes in a trapped list of `count` controls when focus is at `current` (-1 = not on any of them):
 * the next one, wrapping from the last to the first and back. -1 when there is nothing to focus.
 */
export function nextTrapIndex(count: number, current: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}

/** Keep Tab inside `root`: moves focus to the next visible control, wrapping at either end. */
export function trapTab(e: KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== "Tab" || !root) return;
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
  e.preventDefault();
  const to = nextTrapIndex(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
  if (to >= 0) items[to].focus();
}

/** True when a key press lands on a control that has its own Enter/Space behaviour (a button, link, field or widget). */
export function isInteractive(el: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null | undefined): boolean {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "button" || tag === "a" || tag === "input" || tag === "select" || tag === "textarea" || tag === "summary") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role") ?? "";
  return /^(button|link|checkbox|radio|switch|tab|menuitem|option|slider|spinbutton|textbox|combobox)$/.test(role);
}
