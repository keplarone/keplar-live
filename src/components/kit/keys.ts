/** Keyboard shortcut formatting for <Kbd>. Pure; tested in tests/studio-ui-logic.test.ts. */

export type KeyPlatform = "mac" | "other";

const MAC: Record<string, string> = { mod: "⌘", cmd: "⌘", meta: "⌘", ctrl: "⌃", alt: "⌥", option: "⌥", shift: "⇧" };
const OTHER: Record<string, string> = { mod: "Ctrl", cmd: "Ctrl", meta: "Win", ctrl: "Ctrl", alt: "Alt", option: "Alt", shift: "Shift" };
const COMMON: Record<string, string> = {
  enter: "↵",
  return: "↵",
  escape: "Esc",
  esc: "Esc",
  tab: "Tab",
  space: "Space",
  backspace: "⌫",
  delete: "Del",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

/** Display text for one key. "Mod" is Command on macOS and Ctrl elsewhere. */
export function formatKey(key: string, platform: KeyPlatform): string {
  const k = key.trim().toLowerCase();
  const mod = (platform === "mac" ? MAC : OTHER)[k];
  if (mod) return mod;
  if (COMMON[k]) return COMMON[k];
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

/** Accessible spoken form for a key ("Command", "Control"...), used in aria-label. */
export function spokenKey(key: string, platform: KeyPlatform): string {
  const k = key.trim().toLowerCase();
  if (k === "mod" || k === "cmd" || k === "meta") return platform === "mac" ? "Command" : k === "meta" ? "Windows" : "Control";
  if (k === "ctrl") return "Control";
  if (k === "alt" || k === "option") return platform === "mac" ? "Option" : "Alt";
  if (k === "esc") return "Escape";
  return formatKey(key, "other");
}

export function detectPlatform(nav: { platform?: string; userAgent?: string } | undefined): KeyPlatform {
  const s = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`;
  return /Mac|iPhone|iPad|iPod/i.test(s) ? "mac" : "other";
}
