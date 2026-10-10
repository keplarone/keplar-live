import { body, errorResponse, json } from "@/lib/create/platform/http";
import { addOAuthServer, addServer, publicServer } from "@/lib/mcp/gateway";
import { mcpLimitsFor } from "@/lib/mcp/limits";
import { secretsAvailable } from "@/lib/mcp/crypto";
import { POPULAR_CONNECTORS } from "@/lib/mcp/popular";
import { isProduction } from "@/lib/mcp/ssrf";
import { mcpServers } from "@/lib/business/repo";
import { storeDurable } from "@/lib/create/platform/store";
import { mcpOwner } from "../_ctx";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const ws = await mcpOwner(req);
    const limits = mcpLimitsFor(ws.plan);
    const servers = limits.servers > 0 ? (await mcpServers().list(ws.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(publicServer) : [];
    return json({
      allowed: limits.servers > 0,
      plan: ws.plan,
      upgradeTo: limits.servers > 0 ? null : "plus",
      limits,
      ready: storeDurable(),
      secretsReady: secretsAvailable(),
      httpsOnly: isProduction(),
      servers,
      popular: POPULAR_CONNECTORS,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ws = await mcpOwner(req);
    const b = await body<{ name?: unknown; url?: unknown; authType?: unknown; secret?: unknown; headerName?: unknown }>(req);
    // OAuth (BETA): the connection is created, then the browser is sent to the app's sign-in page.
    if (b.authType === "oauth") return json(await addOAuthServer(ws, b), { status: 201 });
    return json({ server: await addServer(ws, b) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
