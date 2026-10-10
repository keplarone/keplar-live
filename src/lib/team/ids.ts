import { createHash, randomBytes } from "node:crypto";
export const newTeamId = () => `tm_${randomBytes(8).toString("hex")}`;
/** Deterministic, so a membership is found by key (no scan) on every request. */
export const memberIdFor = (userId: string) => `mem_${createHash("sha256").update(userId).digest("hex").slice(0, 16)}`;
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
