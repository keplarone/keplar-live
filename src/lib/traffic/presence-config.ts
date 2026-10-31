/** Shared by the server (presence.ts) and the browser beacon; no server imports. */
/** A visitor counts as present this long after their last heartbeat (tolerates one missed beat plus batching). Was 40 s. */
export const PRESENCE_TTL_MS = 150_000;
/** The browser's heartbeat interval while the tab is visible (paused while hidden). Was 15 s: 4x fewer requests per open tab. */
export const HEARTBEAT_MS = 60_000;
