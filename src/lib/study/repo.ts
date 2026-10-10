/** Study sets, their text and progress per user, in the store (Neon in production). Every row is scoped by workspaceId. */
import { collection } from "@/lib/create/platform/store";
import type { Progress, StudySet } from "./types";

export const sets = () => collection<StudySet>("study_sets");
/** The guide's text, one row per set (kept apart from the set so lists stay small). */
export type GuideRow = { id: string; workspaceId: string; pages: string[] };
export const guides = () => collection<GuideRow>("study_guides");
export const progressRows = () => collection<Progress>("study_progress");

export async function deleteSet(workspaceId: string, setId: string) {
  await sets().remove(workspaceId, setId);
  await guides().remove(workspaceId, setId);
  await progressRows().remove(workspaceId, setId);
}

/** Upsert progress. (The file store's insert appends, so an existing row is updated instead; Postgres upserts either way.) */
export async function saveProgress(p: Progress) {
  if (await progressRows().get(p.workspaceId, p.id)) await progressRows().update(p.workspaceId, p.id, p);
  else await progressRows().insert(p);
}
