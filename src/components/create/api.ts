"use client";
/** Tiny client for the Create APIs. */
export type Status = {
  workspace: { id: string; plan: string; verified: boolean };
  entitlements: { customDomains: number; video: boolean; maxVideoSeconds: number; projects: number; label: string };
  compute: { used: number; total: number | null; plan: string; resetsAt?: string | null };
  userContentDomain: string;
  /** False until site generation is set up on the server. */
  ready: boolean;
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

export async function* ndjson(path: string, bodyObj: unknown): AsyncGenerator<Record<string, unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(bodyObj) });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line);
    }
  }
}
