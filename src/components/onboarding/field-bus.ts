import { FIELD_EVENT, type FieldDetail } from "@/field/profile";
import type { SceneId } from "@/field/scenes";

/** Tiny wrappers over the page-wide field's window event. No three.js here: the layer lives in a worker. */
const emit = (detail: FieldDetail) => window.dispatchEvent(new CustomEvent(FIELD_EVENT, { detail }));

export const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export const fieldScene = (scene: SceneId, picks?: number[]) => emit({ phase: "scene", scene, picks });
export const fieldPersonalize = (on: boolean) => emit({ phase: "personalize", on });

/** A shockwave + particle burst from the middle of `el` (reduced motion: the layer does a quick brightness fade instead). */
export function boomFrom(el: Element | null, strength = 1) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = ((r.left + r.width / 2) / window.innerWidth) * 2 - 1;
  const y = -(((r.top + r.height / 2) / window.innerHeight) * 2 - 1);
  emit({ phase: "boom", x, y, strength });
}
