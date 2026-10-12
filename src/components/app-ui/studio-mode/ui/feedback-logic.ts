/** Pure helpers behind <Progress> and the toast stack (unit tested in tests/studio-ui-logic.test.ts). */

/** Clamped completion ratio in 0..1, or null when there is no real total (nothing determinate to show). */
export function progressRatio(value: number, max: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  return Math.min(1, Math.max(0, value / max));
}

export type ToastTone = "neutral" | "success" | "warning" | "danger" | "info";

/** Default auto-dismiss in ms for a tone: errors stay until dismissed (0), everything else 5s. */
export function defaultToastDuration(tone: ToastTone): number {
  return tone === "danger" ? 0 : 5000;
}
