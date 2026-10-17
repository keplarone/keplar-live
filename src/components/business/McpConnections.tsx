"use client";
/**
 * Connected apps (MCP). Add a remote MCP server, see what it can do, decide per tool what is allowed, and give agents
 * limited permission. Every state shown here is the server's real stored state; nothing is simulated. All policy is
 * enforced server-side (src/lib/mcp/gateway.ts); this screen only edits it. Secrets are write-only: they are never sent back.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/create/api";
import s from "./business.module.css";
import m from "./mcp.module.css";
import { UnverifiedNote } from "./UnverifiedNote";

type Server = {
  id: string; name: string; url: string; host: string; authType: "none" | "bearer" | "header" | "oauth"; headerName?: string; hasSecret: boolean;
  status: "connecting" | "connected" | "failed"; statusKind?: string; statusReason?: string; serverName?: string; serverVersion?: string;
  toolCount: number; rejectedTools: number; truncatedTools: boolean; lastCheckedAt: string | null;
};
type Popular = { id: string; name: string; url: string; auth: "none" | "bearer"; what: string; tokenHint?: string };
type List = { allowed: boolean; plan: string; upgradeTo: string | null; limits: { servers: number; callsPerDay: number; callsPerMin: number; concurrent: number }; ready: boolean; secretsReady: boolean; httpsOnly: boolean; servers: Server[]; popular: Popular[] };
type Tool = { id: string; name: string; description: string; descriptionFlagged: boolean; inputSchema: Record<string, unknown>; serverHints: { readOnly?: boolean; destructive?: boolean }; enabled: boolean; risk: "unknown" | "read" | "write"; autoRun: boolean; schemaChanged: boolean };
type Grant = { agentId: string; tools: string[]; maxCallsPerDay: number; maxUnitsPerMonth: number };
type Receipt = { id: string; tool: string; actor: string; via: string; status: string; error?: string; startedAt: string; durationMs: number; bytes: number; units: number; attempts: number };
type Detail = { server: Server; tools: Tool[]; grants: Grant[]; agents: { id: string; name: string; status: string }[]; receipts: Receipt[] };
type CallOut = { status: "completed"; result: { status: string; output: string; summary: string; units: number; durationMs: number; replayed: boolean } } | { status: "awaiting_approval"; approvalId: string; risk: string; reasons: string[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const errMsg = (e: unknown) => ((e as { status?: number })?.status === 401 ? "Sign in to use connected apps." : e instanceof Error ? e.message : "Something went wrong.");
const OAUTH_BACK: Record<string, string> = {
  denied: "Sign-in was declined, so nothing was connected.",
  state: "That sign-in link expired or was already used. Start it again.",
  failed: "Sign-in didn't finish. Try again, or use a token if the server offers one.",
};
const OAUTH_AGAIN = new Set(["oauth_required", "oauth_reauth", "oauth_expired", "oauth_denied", "oauth_failed"]);
const STATE: Record<Server["status"], string> = { connecting: "Connecting…", connected: "Connected", failed: "Failed" };

/** Ask (chat) account policy: may Ask run read-only tools you marked auto-run and granted to Ask without asking? Default off. */
function AskPolicy() {
  const [st, setSt] = useState<{ autoRun: boolean; apps: { id: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    api<{ autoRun: boolean; apps: { id: string }[] }>("/api/mcp/chat").then((d) => on && setSt(d)).catch(() => undefined);
    return () => { on = false; };
  }, []);
  if (!st) return null;
  async function set(v: boolean) {
    setBusy(true);
    setErr(null);
    try {
      setSt(await api("/api/mcp/chat", { method: "PUT", body: JSON.stringify({ autoRun: v }) }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.card}>
      <span className={s.label}>Ask (chat)</span>
      <p className={m.hint}>In Ask, switch Tools on for a conversation and the model may propose calls to apps you allow below (open a connection &gt; Agent permissions &gt; Ask). Anything that writes, sends or isn&apos;t marked read-only shows an approval card in the chat. App output is sent to the models answering that question.</p>
      <label className={m.check}>
        <input type="checkbox" checked={st.autoRun} disabled={busy} onChange={(e) => void set(e.target.checked)} /> Let Ask run read-only tools without asking
      </label>
      <p className={m.hint}>Only tools you marked read-only <em>and</em> set to run without asking, and gave to Ask, run on their own. Off by default.</p>
      {err ? <p className={m.reason} role="alert">{err}</p> : null}
    </div>
  );
}

function skeleton(schema: Record<string, unknown>): string {
  const props = (schema.properties ?? {}) as Record<string, { type?: string | string[] }>;
  const req = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const o: Record<string, unknown> = {};
  for (const k of req) {
    const t = Array.isArray(props[k]?.type) ? (props[k].type as string[])[0] : (props[k]?.type as string | undefined);
    o[k] = t === "number" || t === "integer" ? 0 : t === "boolean" ? false : t === "array" ? [] : t === "object" ? {} : "";
  }
  return JSON.stringify(o, null, 2);
}

export function McpConnections({ go, onChange }: { go: (tab: "approvals") => void; onChange: () => void }) {
  const [data, setData] = useState<List | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [draft, setDraft] = useState({ name: "", url: "", authType: "none", secret: "", headerName: "X-API-Key" });
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  // Result of an OAuth sign-in we were just redirected back from (stashed by the app shell as one short word).
  const [back] = useState<{ ok: boolean; text: string } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem("keplar.mcp.oauth");
      if (!raw) return null;
      const r = (JSON.parse(raw) as { result?: string }).result;
      return r === "ok" ? { ok: true, text: "Signed in. The app is connected; its tools start off until you allow them." } : { ok: false, text: OAUTH_BACK[r ?? ""] ?? OAUTH_BACK.failed };
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!back) return;
    try {
      sessionStorage.removeItem("keplar.mcp.oauth");
    } catch {
      /* storage unavailable */
    }
  }, [back]);

  useEffect(() => {
    let on = true;
    api<List>("/api/mcp/servers").then((d) => on && setData(d)).catch((e) => on && setErr(errMsg(e)));
    return () => {
      on = false;
    };
  }, [tick]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setErr(null);
    try {
      const r = await api<{ server: Server; authorizationUrl?: string }>("/api/mcp/servers", { method: "POST", body: JSON.stringify(draft) });
      if (r.authorizationUrl) {
        window.location.assign(r.authorizationUrl); // approve on the provider's own page; the callback returns to /app
        return;
      }
      setDraft({ name: "", url: "", authType: "none", secret: "", headerName: "X-API-Key" });
      setOpen(r.server.status === "connected" ? r.server.id : null);
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setAdding(false);
      reload();
    }
  }

  if (!data) return err ? <div className={`${s.notice} ${s.error}`} role="alert">{err}</div> : <p className={s.muted}>Loading…</p>;
  const used = data.servers.length;
  const needsSecret = draft.authType === "bearer" || draft.authType === "header";
  return (
    <div className={m.stack}>
      <UnverifiedNote className={s.notice} />
      <div className={s.notice}>
        <span className={s.grow}>
          Connect apps and data sources that speak the Model Context Protocol (MCP). Tools start off. Reading is yours to allow; anything that could write, send or change something always waits for your approval. What a connected app returns is treated as untrusted text.
        </span>
      </div>
      {err ? <div className={`${s.notice} ${s.error}`} role="alert">{err}</div> : null}
      {back ? <div className={`${s.notice} ${back.ok ? "" : s.error}`} role={back.ok ? "status" : "alert"}>{back.text}</div> : null}
      {!data.ready ? <div className={`${s.notice} ${s.error}`} role="alert">Connected apps need Keplar&apos;s database, which isn&apos;t set up on this server yet.</div> : null}
      {!data.allowed ? (
        <div className={s.notice}>
          <span className={s.grow}>Connected apps are available on Plus and up. Free accounts can&apos;t connect external servers.</span>
          <Link className={s.btn} href="/pricing">See plans</Link>
        </div>
      ) : (
        <p className={m.hint}>
          {used} of {data.limits.servers} connections · up to {data.limits.callsPerDay} calls a day · {data.limits.concurrent} at a time · each call costs about 1 credit.
        </p>
      )}

      {data.allowed ? <AskPolicy /> : null}

      <form className={s.card} onSubmit={add} aria-busy={adding}>
        <span className={s.label}>Add a connection</span>
        <div className={m.fields}>
          <div className={m.field}>
            <label htmlFor="mcp-name" className={m.hint}>Name</label>
            <input id="mcp-name" className={m.input} value={draft.name} maxLength={60} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Docs search" autoComplete="off" />
          </div>
          <div className={m.field}>
            <label htmlFor="mcp-url" className={m.hint}>Server address</label>
            <input id="mcp-url" className={m.input} type="url" inputMode="url" value={draft.url} required onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://example.com/mcp" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </div>
          <div className={m.field}>
            <label htmlFor="mcp-auth" className={m.hint}>Sign-in</label>
            <select id="mcp-auth" className={m.select2} value={draft.authType} onChange={(e) => setDraft({ ...draft, authType: e.target.value })}>
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="header">API key in a header</option>
              <option value="oauth">OAuth</option>
            </select>
          </div>
          {draft.authType === "header" ? (
            <div className={m.field}>
              <label htmlFor="mcp-header" className={m.hint}>Header name</label>
              <input id="mcp-header" className={m.input} value={draft.headerName} onChange={(e) => setDraft({ ...draft, headerName: e.target.value })} autoComplete="off" autoCapitalize="off" spellCheck={false} />
            </div>
          ) : null}
          {needsSecret ? (
            <div className={m.field}>
              <label htmlFor="mcp-secret" className={m.hint}>{draft.authType === "bearer" ? "Token" : "API key"} (stored encrypted, never shown again)</label>
              <input id="mcp-secret" className={m.input} type="password" value={draft.secret} required onChange={(e) => setDraft({ ...draft, secret: e.target.value })} autoComplete="new-password" autoCapitalize="off" spellCheck={false} />
            </div>
          ) : null}
        </div>
        <p className={m.hint}>
          {data.httpsOnly ? "Only https:// addresses on the public internet are allowed." : "Public addresses only."} Keplar never connects to private or internal networks. OAuth is for servers that only offer sign-in with an account: Keplar registers itself with the server, you approve access on the server&apos;s own page, and only encrypted tokens are kept. It&apos;s new and not yet proven with every provider; use a token or API key if the server offers one.
        </p>
        {needsSecret && !data.secretsReady ? <p className={m.reason} role="alert">Saving credentials isn&apos;t set up on this server yet, so only connections without sign-in can be added.</p> : null}
        <div className={s.row}>
          <button className={s.btn} type="submit" disabled={!data.allowed || !data.ready || adding || (needsSecret && !data.secretsReady)}>{adding ? "Connecting…" : "Add and test connection"}</button>
          {adding ? <span className={m.hint} role="status">Connecting and reading the tool list. This can take up to a few seconds.</span> : null}
        </div>
      </form>

      {data.servers.map((sv) => (
        <ServerCard key={`${sv.id}-${sv.status}-${sv.lastCheckedAt}`} server={sv} open={open === sv.id} onToggle={() => setOpen(open === sv.id ? null : sv.id)} onChanged={() => { reload(); onChange(); }} go={go} />
      ))}

      <div className={s.card}>
        <span className={s.label}>Popular connectors</span>
        <p className={m.hint}>Public MCP servers, checked on 2 Oct 2026. Keplar doesn&apos;t run or vouch for them; their tools start off and need your approval.</p>
        <div className={m.popular}>
          {data.popular.map((p) => (
            <div key={p.id} className={m.pop}>
              <strong style={{ fontWeight: 500 }}>{p.name}</strong>
              <span className={m.hint}>{p.what}</span>
              <span className={m.url}>{p.url}</span>
              {p.tokenHint ? <span className={m.hint}>Needs: {p.tokenHint}</span> : null}
              <button type="button" className={`${s.btn} ${s.ghost}`} disabled={!data.allowed} onClick={() => { setDraft({ name: p.name, url: p.url, authType: p.auth, secret: "", headerName: "X-API-Key" }); document.getElementById("mcp-name")?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>Use this</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ServerCard({ server: sv, open, onToggle, onChanged, go }: { server: Server; open: boolean; onToggle: () => void; onChanged: () => void; go: (t: "approvals") => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [local, setLocal] = useState<Server>(sv);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
      onChanged();
    }
  }
  const test = () => act("test", async () => {
    setLocal({ ...local, status: "connecting", statusReason: undefined });
    const r = await api<{ server: Server }>(`/api/mcp/servers/${sv.id}/test`, { method: "POST", body: "{}" });
    setLocal(r.server);
  });

  const signIn = () => act("oauth", async () => {
    const r = await api<{ authorizationUrl: string }>(`/api/mcp/servers/${sv.id}/oauth`, { method: "POST", body: "{}" });
    window.location.assign(r.authorizationUrl);
  });
  const oauthNeeded = local.authType === "oauth" && (local.status === "failed" ? !local.statusKind || OAUTH_AGAIN.has(local.statusKind) : local.statusKind === "oauth_pending");

  return (
    <div className={s.card}>
      <div className={s.row}>
        <strong style={{ fontWeight: 500 }} className={s.grow}>{local.name}</strong>
        <span className={m.state} data-state={local.status} role="status"><span className={m.dot} aria-hidden="true" />{STATE[local.status]}</span>
      </div>
      <span className={m.url}>{local.host}</span>
      {local.status === "failed" && local.statusReason ? <p className={m.reason} role="alert">{local.statusReason}</p> : null}
      <p className={m.hint}>
        {local.serverName ? `${local.serverName}${local.serverVersion ? ` ${local.serverVersion}` : ""} · ` : ""}
        {local.toolCount} tool{local.toolCount === 1 ? "" : "s"}
        {local.rejectedTools ? ` · ${local.rejectedTools} invalid definition${local.rejectedTools === 1 ? "" : "s"} ignored` : ""}
        {local.truncatedTools ? " · list cut at 100" : ""}
        {local.lastCheckedAt ? ` · checked ${when(local.lastCheckedAt)}` : ""}
        {local.authType === "none" ? " · no sign-in" : local.authType === "oauth" ? " · OAuth" : local.authType === "bearer" ? " · bearer token saved" : ` · ${local.headerName ?? "API key"} saved`}
      </p>
      {err ? <p className={m.reason} role="alert">{err}</p> : null}
      <div className={m.btnRow}>
        {oauthNeeded ? <button className={s.btn} disabled={busy !== null} onClick={signIn}>{busy === "oauth" ? "Opening…" : local.statusKind === "oauth_pending" ? "Finish signing in" : local.statusKind === "oauth_required" || !local.statusKind ? "Sign in with OAuth" : "Sign in again"}</button> : null}
        <button className={oauthNeeded ? `${s.btn} ${s.ghost}` : s.btn} disabled={busy !== null} onClick={test}>{busy === "test" ? "Testing…" : "Test connection"}</button>
        <button className={`${s.btn} ${s.ghost}`} onClick={onToggle} aria-expanded={open}>{open ? "Hide tools" : "Tools & permissions"}</button>
        {local.hasSecret ? <button className={`${s.btn} ${s.ghost}`} onClick={() => setNewSecret(newSecret === null ? "" : null)}>Replace {local.authType === "bearer" ? "token" : "key"}</button> : null}
        {confirm ? (
          <>
            <button className={`${s.btn} ${s.danger}`} disabled={busy !== null} onClick={() => act("rm", () => api(`/api/mcp/servers/${sv.id}`, { method: "DELETE" }))}>Yes, remove</button>
            <button className={`${s.btn} ${s.ghost}`} onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <button className={`${s.btn} ${s.danger}`} onClick={() => setConfirm(true)}>Remove</button>
        )}
      </div>
      {confirm ? <p className={m.hint}>Removing deletes its tools, agent permissions and the saved credential, and cancels anything waiting for approval.</p> : null}
      {newSecret !== null ? (
        <form className={m.field} onSubmit={(e) => { e.preventDefault(); void act("secret", async () => { await api(`/api/mcp/servers/${sv.id}`, { method: "PATCH", body: JSON.stringify({ secret: newSecret }) }); setNewSecret(null); await test(); }); }}>
          <label htmlFor={`sec-${sv.id}`} className={m.hint}>New {local.authType === "bearer" ? "token" : "API key"} (replaces the saved one)</label>
          <div className={s.row}>
            <input id={`sec-${sv.id}`} className={m.input} style={{ flex: 1 }} type="password" value={newSecret} required onChange={(e) => setNewSecret(e.target.value)} autoComplete="new-password" spellCheck={false} />
            <button className={s.btn} type="submit" disabled={busy !== null}>Save and test</button>
          </div>
        </form>
      ) : null}
      {open ? <Detail serverId={sv.id} connected={local.status === "connected"} go={go} onChanged={onChanged} /> : null}
    </div>
  );
}

function Detail({ serverId, connected, go, onChanged }: { serverId: string; connected: boolean; go: (t: "approvals") => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    api<Detail>(`/api/mcp/servers/${serverId}`).then((x) => on && setD(x)).catch((e) => on && setErr(errMsg(e)));
    return () => {
      on = false;
    };
  }, [serverId, tick, connected]);
  const refresh = () => setTick((t) => t + 1);
  if (!d) return err ? <p className={m.reason} role="alert">{err}</p> : <p className={s.muted}>Loading tools…</p>;
  return (
    <div className={m.stack}>
      {err ? <p className={m.reason} role="alert">{err}</p> : null}
      <ToolList d={d} serverId={serverId} onSaved={refresh} setErr={setErr} />
      <RunTool d={d} serverId={serverId} go={go} onDone={() => { refresh(); onChanged(); }} />
      <AgentPermissions d={d} serverId={serverId} onSaved={() => { refresh(); onChanged(); }} />
      <Receipts list={d.receipts} />
    </div>
  );
}

function ToolList({ d, serverId, onSaved, setErr }: { d: Detail; serverId: string; onSaved: () => void; setErr: (s: string | null) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function patch(t: Tool, body: Record<string, unknown>) {
    setBusy(t.id);
    setErr(null);
    try {
      await api(`/api/mcp/servers/${serverId}/tools/${t.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
      onSaved();
    }
  }
  if (d.tools.length === 0) return <p className={s.muted}>This server hasn&apos;t listed any tools. Test the connection to refresh.</p>;
  return (
    <div>
      <span className={s.label}>Tools · {d.tools.filter((t) => t.enabled).length} on of {d.tools.length}</span>
      {d.tools.map((t) => {
        const props = Object.entries((t.inputSchema.properties ?? {}) as Record<string, { type?: string | string[]; description?: string }>);
        const req = new Set(Array.isArray(t.inputSchema.required) ? (t.inputSchema.required as string[]) : []);
        return (
          <div key={t.id} className={m.tool}>
            <div className={s.row}>
              <span className={`${m.toolName} ${s.grow}`}>{t.name}</span>
              <span className={s.pill}>{t.risk === "read" ? "Read-only" : t.risk === "write" ? "Writes / sends" : "Unclassified"}</span>
            </div>
            {t.description ? <p className={m.desc}>{t.description}</p> : null}
            {t.descriptionFlagged ? <p className={m.noteLine}>Parts of this description looked like instructions or secrets and were removed.</p> : null}
            {t.schemaChanged ? <p className={m.warnLine}>The server changed this tool after you last reviewed it, so it was turned off. Check the inputs below and turn it on again.</p> : null}
            {t.serverHints.readOnly && t.risk !== "read" ? <p className={m.noteLine}>The server says this tool is read-only. Keplar doesn&apos;t take its word for it: it stays treated as one that can change things until you mark it read-only.</p> : null}
            <div className={m.controls}>
              <label className={m.check}><input type="checkbox" checked={t.enabled} disabled={busy === t.id} onChange={(e) => patch(t, { enabled: e.target.checked })} /> On</label>
              <label className={m.check}>
                <span className={m.hint}>Kind</span>
                <select className={m.select2} style={{ width: "auto" }} value={t.risk} disabled={busy === t.id} onChange={(e) => patch(t, { risk: e.target.value })} aria-label={`Kind of ${t.name}`}>
                  <option value="unknown">Unclassified (asks first)</option>
                  <option value="read">Read-only</option>
                  <option value="write">Writes or sends (asks first)</option>
                </select>
              </label>
              <label className={m.check} title="Only for tools you marked read-only. Applies to agents you gave permission.">
                <input type="checkbox" checked={t.autoRun} disabled={busy === t.id || t.risk !== "read" || !t.enabled} onChange={(e) => patch(t, { autoRun: e.target.checked })} /> Agents may run without asking
              </label>
            </div>
            <details>
              <summary className={m.hint} style={{ cursor: "pointer" }}>Inputs ({props.length})</summary>
              {props.length ? (
                <ul className={m.params}>
                  {props.map(([k, v]) => (
                    <li key={k}><code>{k}</code>{req.has(k) ? " (required)" : ""}: {Array.isArray(v?.type) ? v.type.join(" | ") : (v?.type ?? "any")}{v?.description ? ` — ${String(v.description).slice(0, 160)}` : ""}</li>
                  ))}
                </ul>
              ) : <p className={m.hint}>No inputs.</p>}
              <pre className={m.schema}>{JSON.stringify(t.inputSchema, null, 2)}</pre>
            </details>
          </div>
        );
      })}
    </div>
  );
}

function RunTool({ d, serverId, go, onDone }: { d: Detail; serverId: string; go: (t: "approvals") => void; onDone: () => void }) {
  const enabled = useMemo(() => d.tools.filter((t) => t.enabled), [d.tools]);
  const [pick, setPick] = useState("");
  const tool = enabled.find((t) => t.name === pick) ?? enabled[0];
  const [args, setArgs] = useState<Record<string, string>>({});
  const text = tool ? (args[tool.name] ?? skeleton(tool.inputSchema)) : "";
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<CallOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (enabled.length === 0) return <p className={m.hint}>Turn a tool on to run it here or give it to an agent.</p>;
  async function run() {
    if (!tool) return;
    setBusy(true);
    setErr(null);
    setOut(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text || "{}");
    } catch {
      setBusy(false);
      return setErr("The arguments must be valid JSON.");
    }
    try {
      setOut(await api<CallOut>(`/api/mcp/servers/${serverId}/call`, { method: "POST", body: JSON.stringify({ tool: tool.name, args: parsed, idempotencyKey: `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }) }));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
      onDone();
    }
  }
  return (
    <div className={m.stack}>
      <span className={s.label}>Run a tool</span>
      <div className={m.field}>
        <label htmlFor={`run-${serverId}`} className={m.hint}>Tool</label>
        <select id={`run-${serverId}`} className={m.select2} value={tool?.name ?? ""} onChange={(e) => { setPick(e.target.value); setOut(null); }}>
          {enabled.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      </div>
      <div className={m.field}>
        <label htmlFor={`args-${serverId}`} className={m.hint}>Arguments (JSON)</label>
        <textarea id={`args-${serverId}`} className={m.area} spellCheck={false} value={text} onChange={(e) => tool && setArgs({ ...args, [tool.name]: e.target.value })} />
      </div>
      {tool && tool.risk !== "read" ? <p className={m.noteLine}>This tool is {tool.risk === "write" ? "marked as one that writes or sends" : "unclassified"}, so running it waits for your approval first.</p> : null}
      <div className={s.row}>
        <button className={s.btn} onClick={run} disabled={busy}>{busy ? "Running…" : tool && tool.risk === "read" ? "Run" : "Request run"}</button>
      </div>
      {err ? <p className={m.reason} role="alert">{err}</p> : null}
      {out?.status === "awaiting_approval" ? (
        <div className={s.notice}>
          <span className={s.grow}>Waiting for your approval ({out.risk} risk{out.reasons.length ? `: ${out.reasons.join("; ")}` : ""}). Nothing was sent.</span>
          <button className={s.btn} onClick={() => go("approvals")}>Review</button>
        </div>
      ) : null}
      {out?.status === "completed" ? (
        <div className={m.stack}>
          <p className={m.hint} role="status">{out.result.status === "ok" ? "Done" : "The tool reported an error"} in {out.result.durationMs} ms{out.result.replayed ? " (repeat of an earlier identical request)" : ""}. Untrusted output from this server, shown as plain text:</p>
          <pre className={m.out}>{out.result.output}</pre>
        </div>
      ) : null}
    </div>
  );
}

function AgentPermissions({ d, serverId, onSaved }: { d: Detail; serverId: string; onSaved: () => void }) {
  const names = d.tools.filter((t) => t.enabled).map((t) => t.name);
  const [edit, setEdit] = useState<Record<string, Grant>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [task, setTask] = useState({ tool: "", args: "{}", name: "" });
  const grantOf = (agentId: string): Grant => edit[agentId] ?? d.grants.find((g) => g.agentId === agentId) ?? { agentId, tools: [], maxCallsPerDay: agentId === "chat" ? 30 : 10, maxUnitsPerMonth: agentId === "chat" ? 200 : 100 };
  async function save(g: Grant) {
    setBusy(g.agentId);
    setErr(null);
    try {
      await api(`/api/mcp/servers/${serverId}/grants`, { method: "PUT", body: JSON.stringify(g) });
      setEdit((e) => { const { [g.agentId]: _x, ...rest } = e; void _x; return rest; });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  async function create() {
    setBusy("new");
    setErr(null);
    try {
      const t = d.tools.find((x) => x.name === (task.tool || names[0]));
      await api("/api/business/agents", { method: "POST", body: JSON.stringify({ template: "mcp-task", name: task.name || undefined, mcp: { serverId, tool: t?.name, args: JSON.parse(task.args || "{}") } }) });
      setTask({ tool: "", args: "{}", name: "" });
      onSaved();
    } catch (e) {
      setErr(e instanceof SyntaxError ? "The arguments must be valid JSON." : errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className={m.stack}>
      <span className={s.label}>Agent permissions (and Ask)</span>
      <p className={m.hint}>An agent can only use the tools you tick here, within its own daily call and monthly credit budget. Reads you allow may run on their own; everything else waits for your approval.</p>
      {err ? <p className={m.reason} role="alert">{err}</p> : null}
      {d.agents.every((a) => a.id === "chat") ? <p className={s.muted}>No agents yet (Ask above is built in). Add one below, or in Agents.</p> : null}
      {d.agents.map((a) => {
        const g = grantOf(a.id);
        return (
          <div key={a.id} className={m.grantRow}>
            <strong style={{ fontWeight: 500 }}>{a.name} <span className={m.hint}>({a.status})</span></strong>
            {names.length === 0 ? <span className={m.hint}>Turn on a tool first.</span> : (
              <div className={m.controls}>
                {names.map((n) => (
                  <label key={n} className={m.check}>
                    <input type="checkbox" checked={g.tools.includes(n)} onChange={(e) => setEdit({ ...edit, [a.id]: { ...g, tools: e.target.checked ? [...g.tools, n] : g.tools.filter((x) => x !== n) } })} /> <span className={m.toolName}>{n}</span>
                  </label>
                ))}
              </div>
            )}
            <div className={m.controls}>
              <label className={m.check}><span className={m.hint}>Calls / day</span><input className={`${m.input} ${m.num}`} type="number" min={0} max={1000} value={g.maxCallsPerDay} onChange={(e) => setEdit({ ...edit, [a.id]: { ...g, maxCallsPerDay: Number(e.target.value) } })} /></label>
              <label className={m.check}><span className={m.hint}>Credits / month</span><input className={`${m.input} ${m.num}`} type="number" min={0} max={100000} value={g.maxUnitsPerMonth} onChange={(e) => setEdit({ ...edit, [a.id]: { ...g, maxUnitsPerMonth: Number(e.target.value) } })} /></label>
              <button className={`${s.btn} ${s.ghost}`} disabled={busy !== null || !edit[a.id]} onClick={() => save(g)}>{busy === a.id ? "Saving…" : "Save"}</button>
            </div>
          </div>
        );
      })}
      {names.length ? (
        <div className={m.stack}>
          <span className={s.label}>New agent task</span>
          <div className={m.fields}>
            <div className={m.field}><label htmlFor={`tn-${serverId}`} className={m.hint}>Name (optional)</label><input id={`tn-${serverId}`} className={m.input} value={task.name} maxLength={80} onChange={(e) => setTask({ ...task, name: e.target.value })} /></div>
            <div className={m.field}>
              <label htmlFor={`tt-${serverId}`} className={m.hint}>Tool</label>
              <select id={`tt-${serverId}`} className={m.select2} value={task.tool || names[0]} onChange={(e) => { const t = d.tools.find((x) => x.name === e.target.value); setTask({ ...task, tool: e.target.value, args: t ? skeleton(t.inputSchema) : "{}" }); }}>
                {names.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className={m.field}><label htmlFor={`ta-${serverId}`} className={m.hint}>Fixed arguments (JSON)</label><textarea id={`ta-${serverId}`} className={m.area} spellCheck={false} value={task.args} onChange={(e) => setTask({ ...task, args: e.target.value })} /></div>
          <div className={s.row}><button className={`${s.btn} ${s.ghost}`} disabled={busy !== null} onClick={create}>{busy === "new" ? "Adding…" : "Add agent"}</button><span className={m.hint}>Runs when you press Run now in Agents. Scheduled runs always ask first.</span></div>
        </div>
      ) : null}
    </div>
  );
}

function Receipts({ list }: { list: Receipt[] }) {
  return (
    <div>
      <span className={s.label}>Recent calls · receipts</span>
      {list.length === 0 ? <p className={s.muted}>No calls yet.</p> : null}
      {list.map((r) => (
        <div key={r.id} className={m.rcpt}>
          <span><code>{r.tool}</code> · {r.actor === "owner" ? "you" : r.actor.replace("agent:", "agent ")} · {r.via}</span>
          <span>{r.status === "ok" ? "ok" : r.status === "tool_error" ? "tool error" : r.status}</span>
          <span className={m.hint}>{when(r.startedAt)} · {r.durationMs} ms · {r.bytes} B · {r.units} credit{r.units === 1 ? "" : "s"}{r.attempts > 1 ? ` · ${r.attempts} tries` : ""}</span>
          <span className={m.hint}>{r.id.slice(0, 12)}</span>
          {r.error ? <span className={m.reason} style={{ gridColumn: "1 / -1" }}>{r.error}</span> : null}
        </div>
      ))}
    </div>
  );
}
