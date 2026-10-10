/** Shared by the server (presence.ts) and the browser beacon; no server imports. */
export const PRESENCE_TTL_MS = 40_000;
/** The browser's heartbeat interval; the TTL tolerates two missed beats. */
export const HEARTBEAT_MS = 15_000;
