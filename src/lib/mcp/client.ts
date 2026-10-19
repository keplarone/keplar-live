/**
 * Minimal MCP client over Streamable HTTP (2025-03-26 / 2025-06-18). A reply may be plain JSON or a short SSE stream;
 * both are handled, and the stream is cut as soon as the answer to our request id has arrived.
 * Not supported (reported honestly, never faked): the older two-endpoint "HTTP+SSE" transport, server-initiated requests
 * (sampling, elicitation), resources/prompts, and OAuth sign-in (BETA).
 * Every request goes through safeFetch (SSRF guard, pinned DNS, size + time caps).
 */
import { mcpCallBinding, permitMatches, type Permit } from "@/lib/security/authorize";
import { FetchError, SsrfError, safeFetch, type SafeFetchOpts } from "./ssrf";
import { scrub } from "./crypto";
import { LIMITS, parseToolDef, type ToolDef } from "./schema";

export const PROTOCOL = "2025-06-18";
export const TIMEOUTS = { initialize: 10_000, list: 15_000, call: 25_000, close: 3_000 };
export const CAPS = { listBytes: 512 * 1024, callBytes: 256 * 1024, listPages: 5 };

export type McpErrorKind = "auth" | "oauth_required" | "forbidden" | "not_found" | "unsupported_transport" | "protocol" | "http" | "rpc" | "timeout" | "network" | "too_large" | "blocked";
export class McpError extends Error {
  constructor(message: string, public kind: McpErrorKind, public status?: number) {
    super(message);
  }
  /** Worth retrying for an idempotent read. */
  get transient() {
    return this.kind === "timeout" || this.kind === "network" || (this.kind === "http" && (this.status === 429 || (this.status ?? 0) >= 500));
  }
}

export type McpTarget = { url: string; headers: Record<string, string>; secretHeaders: string[]; secret?: string | null };
type Session = { id: string | null; version: string };

type Rpc = { jsonrpc: "2.0"; id?: number; result?: unknown; error?: { code?: number; message?: string } };

function parseSse(text: string): Rpc[] {
  const out: Rpc[] = [];
  for (const block of text.replace(/\r\n?/g, "\n").split("\n\n")) {
    const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
    if (!data) continue;
    try {
      const j = JSON.parse(data) as Rpc | Rpc[];
      for (const m of Array.isArray(j) ? j : [j]) if (m && typeof m === "object") out.push(m);
    } catch {
      /* partial or non-JSON event: ignore */
    }
  }
  return out;
}

const answers = (id: number) => (m: Rpc) => m.id === id && ("result" in m || "error" in m);

function mapFetchError(e: unknown, secret?: string | null): McpError {
  if (e instanceof McpError) return e;
  if (e instanceof SsrfError) return new McpError(e.message, "blocked");
  if (e instanceof FetchError) return new McpError(scrub(e.message, secret), e.kind === "timeout" ? "timeout" : e.kind === "too_large" ? "too_large" : "network");
  return new McpError("Couldn't reach the server.", "network");
}

function statusError(status: number, www: string | undefined, hasAuth: boolean): McpError {
  if (status === 401) {
    const oauth = /resource_metadata|realm="?oauth/i.test(www ?? "");
    if (!hasAuth && oauth) return new McpError("This server needs OAuth sign-in. Use Sign in with OAuth (BETA) on this connection, or a token or API key if the server offers one.", "oauth_required", 401);
    if (hasAuth && oauth) return new McpError("The server rejected the credential. It may require OAuth sign-in (BETA), or the token is wrong or expired.", "auth", 401);
    return new McpError(hasAuth ? "The server rejected the credential (wrong or expired)." : "The server requires a credential. Add a bearer token or API key.", "auth", 401);
  }
  if (status === 403) return new McpError("The server refused access (403). Check the token's permissions.", "forbidden", 403);
  if (status === 404) return new McpError("Nothing is listening at that address (404), or the session expired.", "not_found", 404);
  if (status === 405 || status === 406 || status === 415) return new McpError("The server doesn't speak the Streamable HTTP transport. Servers that only offer the older SSE transport aren't supported yet.", "unsupported_transport", status);
  if (status === 429) return new McpError("The server is rate limiting requests (429).", "http", 429);
  return new McpError(`The server answered HTTP ${status}.`, "http", status);
}

async function post(t: McpTarget, session: Session | null, payload: unknown, opts: { id?: number; timeoutMs: number; maxBytes: number }): Promise<{ status: number; msgs: Rpc[]; sessionId: string | null; www?: string }> {
  const headers: Record<string, string> = {
    ...t.headers,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "user-agent": "Keplar-MCP/1.0 (+https://keplar.one)",
    "mcp-protocol-version": session?.version ?? PROTOCOL,
  };
  if (session?.id) headers["mcp-session-id"] = session.id;
  const o: SafeFetchOpts = { method: "POST", headers, secretHeaders: t.secretHeaders, body: JSON.stringify(payload), timeoutMs: opts.timeoutMs, maxBytes: opts.maxBytes };
  let res;
  try {
    // SSE replies are cut off as soon as the answer to our request id has arrived (a plain JSON reply never matches this).
    const stopWhen = opts.id === undefined ? undefined : (buf: Buffer) => { const s = buf.toString("utf8").trimStart(); return (s.startsWith("event:") || s.startsWith("data:")) && parseSse(s).some(answers(opts.id as number)); };
    res = await safeFetch(t.url, { ...o, stopWhen });
  } catch (e) {
    throw mapFetchError(e, t.secret);
  }
  const sessionId = res.headers["mcp-session-id"] ?? null;
  if (res.status >= 400) throw statusError(res.status, res.headers["www-authenticate"], Object.keys(t.headers).length > 0);
  const text = res.body.toString("utf8");
  if (res.status === 202 || text.trim() === "") return { status: res.status, msgs: [], sessionId };
  const ct = res.headers["content-type"] ?? "";
  let msgs: Rpc[];
  if (/text\/event-stream/i.test(ct) || text.trimStart().startsWith("event:") || text.trimStart().startsWith("data:")) msgs = parseSse(text);
  else {
    try {
      const j = JSON.parse(text) as Rpc | Rpc[];
      msgs = (Array.isArray(j) ? j : [j]).filter((m) => m && typeof m === "object");
    } catch {
      throw new McpError("The server's reply isn't valid MCP (not JSON). Check that the address is the MCP endpoint.", "protocol");
    }
  }
  return { status: res.status, msgs, sessionId };
}

async function rpc<T>(t: McpTarget, session: Session | null, id: number, method: string, params: unknown, opts: { timeoutMs: number; maxBytes: number }): Promise<{ result: T; sessionId: string | null }> {
  const r = await post(t, session, { jsonrpc: "2.0", id, method, params }, { id, ...opts });
  const m = r.msgs.find(answers(id));
  if (!m) throw new McpError("The server didn't answer the request.", "protocol");
  if (m.error) throw new McpError(`The server reported an error${typeof m.error.code === "number" ? ` (${m.error.code})` : ""}.`, "rpc");
  return { result: m.result as T, sessionId: r.sessionId };
}

export async function openSession(t: McpTarget): Promise<{ session: Session; serverInfo: { name: string; version: string } | null }> {
  const { result, sessionId } = await rpc<{ protocolVersion?: string; serverInfo?: { name?: string; version?: string }; capabilities?: { tools?: unknown } }>(
    t, null, 1, "initialize",
    { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "keplar", version: "1.0" } },
    { timeoutMs: TIMEOUTS.initialize, maxBytes: CAPS.listBytes },
  );
  if (!result || typeof result !== "object" || typeof result.protocolVersion !== "string") throw new McpError("The server's reply isn't a valid MCP handshake.", "protocol");
  if (!result.capabilities || !("tools" in result.capabilities)) throw new McpError("This server connected but doesn't offer any tools.", "protocol");
  const session: Session = { id: sessionId, version: /^\d{4}-\d{2}-\d{2}$/.test(result.protocolVersion) ? result.protocolVersion : PROTOCOL };
  await post(t, session, { jsonrpc: "2.0", method: "notifications/initialized" }, { timeoutMs: TIMEOUTS.initialize, maxBytes: 64 * 1024 }).catch(() => undefined);
  const info = result.serverInfo && typeof result.serverInfo.name === "string" ? { name: result.serverInfo.name.slice(0, 80), version: String(result.serverInfo.version ?? "").slice(0, 40) } : null;
  return { session, serverInfo: info };
}

/** Best effort: tell the server we're done. Never throws, never waits long. */
export async function closeSession(t: McpTarget, s: Session) {
  if (!s.id) return;
  await safeFetch(t.url, { method: "DELETE", headers: { ...t.headers, "mcp-session-id": s.id, "mcp-protocol-version": s.version }, secretHeaders: t.secretHeaders, timeoutMs: TIMEOUTS.close, maxBytes: 16 * 1024 }).catch(() => undefined);
}

export type Discovery = { serverInfo: { name: string; version: string } | null; tools: ToolDef[]; rejected: { name?: string; reason: string }[]; truncated: boolean };

export async function discoverTools(t: McpTarget): Promise<Discovery> {
  const { session, serverInfo } = await openSession(t);
  try {
    const tools: ToolDef[] = [];
    const rejected: Discovery["rejected"] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    let truncated = false;
    for (let page = 0; page < CAPS.listPages; page++) {
      const { result } = await rpc<{ tools?: unknown[]; nextCursor?: string }>(t, session, 10 + page, "tools/list", cursor ? { cursor } : {}, { timeoutMs: TIMEOUTS.list, maxBytes: CAPS.listBytes });
      if (!result || !Array.isArray(result.tools)) throw new McpError("The server's tool list isn't valid.", "protocol");
      for (const raw of result.tools) {
        const p = parseToolDef(raw);
        if (!p.ok) rejected.push({ name: p.name, reason: p.reason });
        else if (seen.has(p.tool.name)) rejected.push({ name: p.tool.name, reason: "duplicate name" });
        else if (tools.length >= LIMITS.toolsPerServer) truncated = true;
        else {
          seen.add(p.tool.name);
          tools.push(p.tool);
        }
      }
      cursor = typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
      if (!cursor) break;
      if (page === CAPS.listPages - 1) truncated = true;
    }
    return { serverInfo, tools, rejected, truncated };
  } finally {
    await closeSession(t, session);
  }
}

export type CallOutcome = { isError: boolean; text: string; bytes: number; parts: { text: number; other: number } };

/**
 * One tool call: handshake, call, close. Output is returned raw (untrusted); callers sanitize.
 * `permit` is the allow from `authorize` for this exact server, tool and arguments. A call without it never touches the network.
 */
export async function callTool(t: McpTarget, name: string, args: Record<string, unknown>, permit: Permit, timeoutMs = TIMEOUTS.call): Promise<CallOutcome> {
  if (!permitMatches(permit, { action: "mcp.call", binding: mcpCallBinding(t.url, name, args) })) {
    throw new McpError("This call was not authorized.", "forbidden");
  }
  const started = Date.now();
  const { session } = await openSession(t);
  try {
    const left = Math.max(Math.min(2000, timeoutMs), timeoutMs - (Date.now() - started));
    const { result } = await rpc<{ content?: unknown[]; structuredContent?: unknown; isError?: boolean }>(t, session, 100, "tools/call", { name, arguments: args }, { timeoutMs: left, maxBytes: CAPS.callBytes });
    if (!result || typeof result !== "object") throw new McpError("The server's reply isn't a valid tool result.", "protocol");
    const parts: string[] = [];
    let other = 0;
    for (const c of Array.isArray(result.content) ? result.content : []) {
      const cc = c as { type?: string; text?: unknown; resource?: { text?: unknown; uri?: unknown } };
      if (cc?.type === "text" && typeof cc.text === "string") parts.push(cc.text);
      else if (cc?.type === "resource" && typeof cc.resource?.text === "string") parts.push(cc.resource.text);
      else other++;
    }
    if (result.structuredContent !== undefined && parts.length === 0) {
      try {
        parts.push(JSON.stringify(result.structuredContent, null, 2));
      } catch {
        other++;
      }
    }
    const text = parts.join("\n\n");
    return { isError: result.isError === true, text, bytes: Buffer.byteLength(text), parts: { text: parts.length, other } };
  } finally {
    await closeSession(t, session);
  }
}
