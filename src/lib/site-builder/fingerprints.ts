/**
 * The anti-sameness library: content-free structural fingerprints of recent builds (section structure, class vocabulary, recipe
 * option ids, direction). No text, no names, no account link (workspace "system"). Read across tenants to compare a new build with
 * what Keplar made recently; pruned after 120 days. Best effort: a store failure never blocks a build.
 */
import { keepAlive } from "@/lib/create/platform/after";
import { collection } from "@/lib/create/platform/store";
import { id as newId, now } from "@/lib/create/platform/ids";
import type { FingerprintRow, FingerprintTokens } from "./sameness";

const fp = () => collection<FingerprintRow>("sb_fingerprints");
const DAY = 86_400_000;

export async function loadLibrary(limit = 300): Promise<FingerprintRow[]> {
  try {
    return await fp().listSystemRange({ field: "createdAt", gte: new Date(Date.now() - 60 * DAY).toISOString() }, limit);
  } catch {
    return [];
  }
}

export async function rememberFingerprint(meta: { kind: string; direction: string; tokens: FingerprintTokens }): Promise<void> {
  try {
    await fp().insert({ id: newId("fp"), workspaceId: "system", createdAt: now(), kind: meta.kind, direction: meta.direction, tokens: meta.tokens });
    keepAlive(() => fp().purgeSystemBefore("createdAt", new Date(Date.now() - 120 * DAY).toISOString(), 200), "fingerprint prune");
  } catch {
    /* the library is an aid, not a requirement */
  }
}
