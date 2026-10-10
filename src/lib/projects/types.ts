/** Saved projects: one workspace per project holding chats (chat_threads.projectId), files, instructions and its own memory. */
export type ProjectRow = {
  id: string;
  workspaceId: string;
  name: string;
  /** The person's own instructions/context for this project ("we sell handmade candles; keep answers short"). Sent as fenced data, never as system text. */
  instructions: string;
  /** Per-project switch. Off = nothing of this project (notes, files, instructions) reaches a model. */
  memoryOn: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ProjectNote = { id: string; workspaceId: string; projectId: string; text: string; createdAt: string; updatedAt: string };
export type ProjectFile = { id: string; workspaceId: string; projectId: string; name: string; text: string; chars: number; truncated: boolean; createdAt: string };

export const PROJECT_LIMITS = {
  projects: 50,
  name: 60,
  instructions: 1500,
  notes: 50,
  noteChars: 220,
  files: 10,
  fileChars: 40_000,
  totalFileChars: 150_000,
  /** What one chat request may carry of a project, in characters (about 4 per token). */
  contextChars: { notes: 2400, instructions: 1500, files: 6000 },
} as const;
