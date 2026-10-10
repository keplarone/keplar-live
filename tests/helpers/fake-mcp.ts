/** An in-process MCP server and DNS, plugged into the SSRF-safe fetch seam. Nothing touches the real network. */
import { createHash, randomBytes } from "node:crypto";
import { FetchError, setNetworkForTests, type RawRequest, type RawResponse } from "../../src/lib/mcp/ssrf";

export type FakeTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  /** What the tool returns. Throwing is not used; set `isError` instead. */
  run?: (args: Record<string, unknown>) => { text?: string; isError?: boolean; bytes?: number };
};
export type SeenRequest = { host: string; method: string; rpc?: string; headers: Record<string, string>; ip: string; body?: string };

type Host = { host: string; handle(r: RawRequest): Promise<RawResponse> };

export class FakeMcp {
  requests: SeenRequest[] = [];
  /** Number of upcoming tools/call requests that fail at the network level before succeeding. */
  failCalls = 0;
  callDelayMs = 0;
  inflight = 0;
  maxInflight = 0;
  constructor(public host: string, public opts: { tools: FakeTool[]; bearer?: string; headerAuth?: [string, string]; sse?: boolean; oauth?: boolean; notJson?: boolean; redirectTo?: string; status?: number; /** OAuth-protected: accepts only bearer tokens this check approves; the 401 challenge points at the protected-resource metadata. */ oauthCheck?: (token: string) => boolean; oauthAs?: string; prmResource?: string } = { tools: [] }) {}

  get calls() {
    return this.requests.filter((r) => r.rpc === "tools/call");
  }

  authorized(h: Record<string, string>) {
    if (this.opts.oauthCheck) return this.opts.oauthCheck((h["authorization"] ?? "").replace(/^Bearer /, ""));
    if (this.opts.bearer) return h["authorization"] === `Bearer ${this.opts.bearer}`;
    if (this.opts.headerAuth) return h[this.opts.headerAuth[0].toLowerCase()] === this.opts.headerAuth[1];
    return !this.opts.oauth;
  }

  async handle(r: RawRequest): Promise<RawResponse> {
    let rpc: string | undefined;
    let msg: { id?: number; method?: string; params?: Record<string, unknown> } = {};
    if (r.body) {
      try {
        msg = JSON.parse(r.body);
        rpc = msg.method;
      } catch {
        /* ignore */
      }
    }
    this.requests.push({ host: this.host, method: r.method, rpc, headers: r.headers, ip: r.ip, body: r.body });
    const reply = (status: number, body: unknown, extra: Record<string, string> = {}): RawResponse => {
      if (this.opts.sse && status === 200) return { status, headers: { "content-type": "text/event-stream", ...extra }, body: Buffer.from(`event: message\ndata: ${JSON.stringify(body)}\n\n`) };
      return { status, headers: { "content-type": "application/json", ...extra }, body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)) };
    };
    if (this.opts.oauthCheck && r.method === "GET" && r.url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      return reply(200, { resource: this.opts.prmResource ?? `https://${this.host}/mcp`, authorization_servers: [`https://${this.opts.oauthAs ?? "auth." + this.host}`] });
    }
    if (this.opts.redirectTo) return { status: 307, headers: { location: this.opts.redirectTo }, body: Buffer.alloc(0) };
    if (this.opts.status) return { status: this.opts.status, headers: {}, body: Buffer.from("nope") };
    if (r.method === "DELETE") return { status: 200, headers: {}, body: Buffer.alloc(0) };
    if (!this.authorized(r.headers)) return { status: 401, headers: this.opts.oauthCheck ? { "www-authenticate": `Bearer resource_metadata="https://${this.host}/.well-known/oauth-protected-resource"` } : this.opts.oauth ? { "www-authenticate": 'Bearer realm="OAuth", resource_metadata="https://x/.well-known/oauth-protected-resource"' } : {}, body: Buffer.from(`unauthorized ${r.headers["authorization"] ?? ""}`) };
    if (this.opts.notJson) return { status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html>hello</html>") };
    switch (msg.method) {
      case "initialize":
        return reply(200, { jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: `fake-${this.host}`, version: "1.0" } } }, { "mcp-session-id": "sess-1" });
      case "notifications/initialized":
        return { status: 202, headers: {}, body: Buffer.alloc(0) };
      case "tools/list":
        return reply(200, { jsonrpc: "2.0", id: msg.id, result: { tools: this.opts.tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema ?? { type: "object", properties: {} }, annotations: t.annotations })) } });
      case "tools/call": {
        this.inflight++;
        this.maxInflight = Math.max(this.maxInflight, this.inflight);
        try {
          if (this.callDelayMs) {
            if (this.callDelayMs > r.timeoutMs) {
              await new Promise((res) => setTimeout(res, r.timeoutMs));
              throw new FetchError("The server took too long to respond.", "timeout");
            }
            await new Promise((res) => setTimeout(res, this.callDelayMs));
          }
          if (this.failCalls > 0) {
            this.failCalls--;
            throw new FetchError("The connection was reset by the server.", "network");
          }
          const tool = this.opts.tools.find((t) => t.name === (msg.params as { name?: string }).name);
          if (!tool) return reply(200, { jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "Unknown tool" } });
          const out = tool.run?.((msg.params as { arguments?: Record<string, unknown> }).arguments ?? {}) ?? { text: "ok" };
          const text = out.bytes ? "x".repeat(out.bytes) : (out.text ?? "ok");
          if (Buffer.byteLength(text) > r.maxBytes) throw new FetchError("The server's response was too large.", "too_large");
          return reply(200, { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text }], isError: out.isError === true } });
        } finally {
          this.inflight--;
        }
      }
      default:
        return reply(200, { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "no such method" } });
    }
  }
}

/** Route requests by host name. Hosts not listed in `dns` resolve to a public address. */
export function installFakeNetwork(servers: Host[], dns: Record<string, string[]> = {}) {
  const byHost = new Map(servers.map((s) => [s.host, s]));
  const resolves: string[] = [];
  setNetworkForTests({
    resolver: async (host) => {
      resolves.push(host);
      if (dns[host]) return dns[host];
      return ["93.184.216.34"];
    },
    transport: async (r) => {
      const s = byHost.get(r.url.hostname);
      if (!s) throw new FetchError("Couldn't connect to the server.", "network");
      return s.handle(r);
    },
  });
  return { resolves };
}
export const restoreNetwork = () => setNetworkForTests();


/** An in-process OAuth authorization server: discovery, dynamic client registration, PKCE-checked code exchange, rotating refresh tokens. */
export class FakeOAuth {
  clients = new Map<string, { redirectUris: string[] }>();
  codes = new Map<string, { clientId: string; challenge: string; redirect: string; resource: string }>();
  tokens = new Set<string>();
  refresh = new Map<string, string>(); // refresh token -> client id
  requests: { path: string; body: string; headers: Record<string, string> }[] = [];
  expiresIn = 3600;
  n = 0;
  constructor(public host: string, public opts: { noS256?: boolean; noRegistration?: boolean; issuer?: string; tokenEndpoint?: string; authorizationEndpoint?: string; tokenRedirect?: string; noRefresh?: boolean } = {}) {}
  valid = (t: string) => this.tokens.has(t);
  revokeAccess() { this.tokens.clear(); }
  revokeRefresh() { this.refresh.clear(); }
  /** What the user's browser would do at the sign-in page: returns the callback URL. */
  approve(authUrl: string, deny = false): string {
    const u = new URL(authUrl);
    const p = u.searchParams;
    const clientId = p.get("client_id") ?? "";
    const redirect = p.get("redirect_uri") ?? "";
    if (!this.clients.get(clientId)?.redirectUris.includes(redirect)) throw new Error("unknown client or redirect_uri");
    if (p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) throw new Error("PKCE S256 required");
    const cb = new URL(redirect);
    cb.searchParams.set("state", p.get("state") ?? "");
    if (deny) cb.searchParams.set("error", "access_denied");
    else {
      const code = `code-${++this.n}-${randomBytes(4).toString("hex")}`;
      this.codes.set(code, { clientId, challenge: p.get("code_challenge") as string, redirect, resource: p.get("resource") ?? "" });
      cb.searchParams.set("code", code);
    }
    return cb.toString();
  }
  private issue(clientId: string, withRefresh: boolean) {
    const access = `acc-${++this.n}-${randomBytes(6).toString("hex")}`;
    this.tokens.add(access);
    const out: Record<string, unknown> = { access_token: access, token_type: "Bearer", expires_in: this.expiresIn };
    if (withRefresh && !this.opts.noRefresh) {
      const r = `ref-${++this.n}-${randomBytes(6).toString("hex")}`;
      this.refresh.set(r, clientId);
      out.refresh_token = r;
    }
    return out;
  }
  async handle(r: RawRequest): Promise<RawResponse> {
    const path = r.url.pathname;
    this.requests.push({ path, body: r.body ?? "", headers: r.headers });
    const json = (status: number, body: unknown): RawResponse => ({ status, headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify(body)) });
    const base = `https://${this.host}`;
    if (r.method === "GET" && (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration")) {
      return json(200, {
        issuer: this.opts.issuer ?? base,
        authorization_endpoint: this.opts.authorizationEndpoint ?? `${base}/authorize`,
        token_endpoint: this.opts.tokenEndpoint ?? `${base}/token`,
        ...(this.opts.noRegistration ? {} : { registration_endpoint: `${base}/register` }),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: this.opts.noS256 ? ["plain"] : ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    }
    if (r.method === "POST" && path === "/register") {
      const b = JSON.parse(r.body ?? "{}") as { redirect_uris?: string[] };
      const id = `client-${++this.n}`;
      this.clients.set(id, { redirectUris: b.redirect_uris ?? [] });
      return json(201, { client_id: id, token_endpoint_auth_method: "none" });
    }
    if (r.method === "POST" && path === "/token") {
      if (this.opts.tokenRedirect) return { status: 307, headers: { location: this.opts.tokenRedirect }, body: Buffer.alloc(0) };
      const f = new URLSearchParams(r.body ?? "");
      if (f.get("grant_type") === "authorization_code") {
        const c = this.codes.get(f.get("code") ?? "");
        this.codes.delete(f.get("code") ?? "");
        const verifier = f.get("code_verifier") ?? "";
        const ok = c && c.clientId === f.get("client_id") && c.redirect === f.get("redirect_uri") && createHash("sha256").update(verifier).digest("base64url") === c.challenge && c.resource === f.get("resource");
        if (!ok) return json(400, { error: "invalid_grant" });
        return json(200, this.issue(c.clientId, true));
      }
      if (f.get("grant_type") === "refresh_token") {
        const old = f.get("refresh_token") ?? "";
        const client = this.refresh.get(old);
        if (!client || client !== f.get("client_id")) return json(400, { error: "invalid_grant" });
        this.refresh.delete(old); // rotating refresh tokens
        return json(200, this.issue(client, true));
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    return { status: 404, headers: {}, body: Buffer.from("not found") };
  }
}
