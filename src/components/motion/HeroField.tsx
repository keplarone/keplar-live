export type FieldVariant = "how" | "pricing" | "foryou";

/**
 * Retired: every page now gets the page-wide particle layer (src/components/field/PageField.tsx), so the per-page
 * hero canvas (soft sprites) is gone. Kept as a no-op so existing page markup stays valid.
 */
export function HeroField({ variant }: { variant: FieldVariant }) {
  void variant;
  return null;
}
