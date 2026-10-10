/**
 * Inngest serve endpoint. Inngest Cloud (or the Dev Server) syncs and invokes the
 * functions here; requests are signed with INNGEST_SIGNING_KEY. In mock mode (no
 * keys, no INNGEST_DEV) it answers 503 and agent schedules run in-process instead
 * (docs/business-os.md §7).
 */
import type { NextRequest } from "next/server";
import { serve } from "inngest/next";
import { json } from "@/lib/create/platform/http";
import { inngest, inngestEnabled } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const handler = serve({ client: inngest, functions });
const mock = () => json({ error: "Inngest isn't set up (INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY unset).", code: "not_configured" }, { status: 503 });

export const GET = (req: NextRequest, ctx: unknown) => (inngestEnabled() ? handler.GET(req, ctx) : mock());
export const POST = (req: NextRequest, ctx: unknown) => (inngestEnabled() ? handler.POST(req, ctx) : mock());
export const PUT = (req: NextRequest, ctx: unknown) => (inngestEnabled() ? handler.PUT(req, ctx) : mock());
