import { json } from "@/lib/create/platform/http";
import { higgsfieldPresence } from "@/lib/higgsfield/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Is the Higgsfield key present on this deployment? Booleans and env var NAMES only, never a value. */
export async function GET() {
  const p = higgsfieldPresence();
  return json({ provider: "higgsfield", configured: p.configured && !p.killSwitch, source: p.source, shape: p.shape, switchedOff: p.killSwitch }, { headers: { "cache-control": "no-store" } });
}
