/** A tiny event bus so any answer card can open or update the one side draft without threading props through the app. */
export type DraftOpen = { kind: "open"; markdown: string; title: string } | { kind: "apply"; draftId: string; markdown: string };
const EVT = "keplar:draft";
export const openDraft = (d: DraftOpen) => window.dispatchEvent(new CustomEvent<DraftOpen>(EVT, { detail: d }));
export function onDraft(fn: (d: DraftOpen) => void) {
  const h = (e: Event) => fn((e as CustomEvent<DraftOpen>).detail);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}
