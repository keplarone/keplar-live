/** `style`: how the person likes answers written (tone, length, format). `correction`: something the person corrected, so it is not repeated. */
export type MemoryKind = "name" | "goal" | "preference" | "project" | "fact" | "style" | "correction";
export type MemoryItem = { id: string; workspaceId: string; text: string; kind: MemoryKind; source: "auto" | "user"; /** Items saved together (one turn) share a batch, so "forget that" removes exactly the last turn's notes. */ batch?: string; createdAt: string; updatedAt: string };
export type MemorySettings = { id: string; workspaceId: string; enabled: boolean; updatedAt: string };
/** A saved conversation. `messages` is the app's own thread payload (media and image data are never stored). */
export type ChatRow = { id: string; workspaceId: string; title: string; projectId: string | null; createdAt: number; updatedAt: number; messages: unknown[]; /** The Specialist picked for this chat (an id of one of this workspace's specialists), so it follows the chat to other devices. */ specialistId?: string | null };
