/**
 * Store credentials for the mobile app creator (BETA). Encrypted with the workspace-bound key (sealSecret), never returned by any
 * API, never sent to a model. "Verify" talks to the stores' own APIs and reports exactly what they answered.
 */
import { createSign, sign as cryptoSign, createPrivateKey } from "node:crypto";
import { now } from "@/lib/create/platform/ids";
import { HttpError } from "@/lib/create/platform/http";
import { collection, type Row } from "@/lib/create/platform/store";
import { openSecret, scrub, sealSecret, secretsAvailable } from "@/lib/mcp/crypto";

export type CredKind = "apple" | "google" | "expo";
export type CredRow = Row & { kind: CredKind; enc: string; hint: string; status: "saved" | "verified" | "failed"; detail: string; checkedAt: string | null; savedAt: string };
export const credStore = () => collection<CredRow>("mobile_creds");
export const publicCred = (r: CredRow) => ({ kind: r.kind, hint: r.hint, status: r.status, detail: r.detail, checkedAt: r.checkedAt, savedAt: r.savedAt });

const fx = (): typeof fetch => globalThis.fetch;
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"; // fixed: a key file cannot point us somewhere else
const PUBLISHER = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export type AppleInput = { issuerId: string; keyId: string; privateKey: string };
export type GoogleInput = { serviceAccountJson: string; packageName?: string };

export function parseApple(raw: Partial<AppleInput>): AppleInput {
  const issuerId = String(raw.issuerId ?? "").trim();
  const keyId = String(raw.keyId ?? "").trim();
  const privateKey = String(raw.privateKey ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId)) throw new HttpError(400, "Issuer ID should look like 69a6de7e-xxxx-xxxx-xxxx-xxxxxxxxxxxx (App Store Connect > Users and Access > Integrations).");
  if (!/^[A-Z0-9]{10}$/.test(keyId)) throw new HttpError(400, "Key ID is 10 letters and numbers.");
  if (!/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(privateKey)) throw new HttpError(400, "Paste the whole contents of the .p8 file, including the BEGIN and END lines.");
  try {
    createPrivateKey(privateKey);
  } catch {
    throw new HttpError(400, "That .p8 text isn't a readable private key.");
  }
  return { issuerId, keyId, privateKey };
}

export function parseGoogle(raw: Partial<GoogleInput>): { email: string; privateKey: string; packageName?: string } {
  let j: { client_email?: string; private_key?: string; type?: string };
  try {
    j = JSON.parse(String(raw.serviceAccountJson ?? ""));
  } catch {
    throw new HttpError(400, "Paste the service account JSON file contents.");
  }
  if (j.type !== "service_account" || !j.client_email || !j.private_key) throw new HttpError(400, "That JSON isn't a service account key (it needs type, client_email and private_key).");
  try {
    createPrivateKey(j.private_key);
  } catch {
    throw new HttpError(400, "The private key in that file isn't readable.");
  }
  const packageName = raw.packageName?.trim() || undefined;
  if (packageName && !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) throw new HttpError(400, "Package name should look like com.yourname.appname.");
  return { email: j.client_email, privateKey: j.private_key, packageName };
}

export function appleJwt(a: AppleInput, at = Math.floor(Date.now() / 1000)): string {
  const head = b64u(JSON.stringify({ alg: "ES256", kid: a.keyId, typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: a.issuerId, iat: at, exp: at + 600, aud: "appstoreconnect-v1" }));
  const sig = cryptoSign("sha256", Buffer.from(`${head}.${body}`), { key: a.privateKey, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

export function googleAssertion(email: string, privateKey: string, at = Math.floor(Date.now() / 1000)): string {
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: GOOGLE_TOKEN, iat: at, exp: at + 3000 }));
  const s = createSign("RSA-SHA256");
  s.update(`${head}.${body}`);
  return `${head}.${body}.${b64u(s.sign(privateKey))}`;
}

export type Verdict = { ok: boolean; detail: string };

export async function verifyApple(a: AppleInput): Promise<Verdict> {
  const jwt = appleJwt(a);
  const res = await fx()("https://api.appstoreconnect.apple.com/v1/apps?limit=1", { headers: { authorization: `Bearer ${jwt}` } }).catch(() => null);
  if (!res) return { ok: false, detail: "Couldn't reach Apple. Try again in a minute." };
  if (res.status === 200) {
    const j = (await res.json().catch(() => ({}))) as { meta?: { paging?: { total?: number } } };
    const n = j.meta?.paging?.total;
    return { ok: true, detail: `Apple accepted the key${typeof n === "number" ? ` (${n} app record${n === 1 ? "" : "s"} visible)` : ""}. The app record itself must be created in the App Store Connect website.` };
  }
  if (res.status === 401) return { ok: false, detail: "Apple rejected the key (401). Check the Issuer ID, Key ID and that the .p8 matches that Key ID." };
  if (res.status === 403) return { ok: false, detail: "Apple accepted the key but it has no access (403). Give the key the App Manager or Admin role, or accept the latest agreement." };
  return { ok: false, detail: `Apple answered ${res.status}.` };
}

export async function verifyGoogle(g: { email: string; privateKey: string; packageName?: string }): Promise<Verdict> {
  const tok = await fx()(GOOGLE_TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: googleAssertion(g.email, g.privateKey) }) }).catch(() => null);
  if (!tok) return { ok: false, detail: "Couldn't reach Google. Try again in a minute." };
  const tj = (await tok.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!tok.ok || !tj.access_token) return { ok: false, detail: `Google rejected the service account key${tj.error_description ? `: ${scrub(tj.error_description, g.privateKey).slice(0, 120)}` : ""}.` };
  if (!g.packageName) return { ok: true, detail: "Google accepted the service account key. Add the app's package name to check access to the app itself." };
  const auth = { authorization: `Bearer ${tj.access_token}` };
  const ed = await fx()(`${PUBLISHER}/${g.packageName}/edits`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: "{}" }).catch(() => null);
  if (!ed) return { ok: false, detail: "Couldn't reach the Google Play API." };
  if (ed.status === 404) return { ok: false, detail: `Google doesn't know ${g.packageName}. Create the app in Play Console and upload its first bundle there; the API can't create apps.` };
  if (ed.status === 401 || ed.status === 403) return { ok: false, detail: "The key works, but this service account hasn't been given access to the app in Play Console (Users and permissions)." };
  if (!ed.ok) return { ok: false, detail: `Google Play answered ${ed.status}.` };
  const id = ((await ed.json().catch(() => ({}))) as { id?: string }).id;
  if (id) await fx()(`${PUBLISHER}/${g.packageName}/edits/${encodeURIComponent(id)}`, { method: "DELETE", headers: auth }).catch(() => null); // leave nothing open
  return { ok: true, detail: `Google Play lets this service account edit ${g.packageName}.` };
}

async function put(workspaceId: string, kind: CredKind, secret: unknown, hint: string, v: Verdict | null): Promise<ReturnType<typeof publicCred>> {
  if (!secretsAvailable()) throw new HttpError(503, "Secure storage isn't configured on this server, so keys can't be saved.", "not_configured");
  const existing = await credStore().get(workspaceId, kind);
  const row: CredRow = {
    id: kind, workspaceId, kind, enc: sealSecret(JSON.stringify(secret), workspaceId, kind), hint,
    status: v ? (v.ok ? "verified" : "failed") : "saved", detail: v?.detail ?? "Saved. Keplar can't check this one; it is used by your GitHub workflow.",
    checkedAt: v ? now() : null, savedAt: now(),
  };
  if (existing) await credStore().update(workspaceId, kind, row);
  else await credStore().insert(row);
  return publicCred(row);
}

export async function saveApple(workspaceId: string, raw: Partial<AppleInput>) {
  const a = parseApple(raw);
  return put(workspaceId, "apple", a, `Key ${a.keyId}`, await verifyApple(a));
}
export async function saveGoogle(workspaceId: string, raw: Partial<GoogleInput>) {
  const g = parseGoogle(raw);
  return put(workspaceId, "google", g, `${g.email}${g.packageName ? ` · ${g.packageName}` : ""}`, await verifyGoogle(g));
}
export async function saveExpo(workspaceId: string, token: string) {
  const t = token.trim();
  if (t.length < 20 || /\s/.test(t)) throw new HttpError(400, "That doesn't look like an Expo access token.");
  return put(workspaceId, "expo", { token: t }, `Token ending ${t.slice(-4)}`, null);
}
export async function listCreds(workspaceId: string) {
  return (await credStore().list(workspaceId)).map(publicCred);
}
export async function removeCred(workspaceId: string, kind: CredKind) {
  return credStore().remove(workspaceId, kind);
}
/** For the build/submit step (server side only). */
export async function readCred<T>(workspaceId: string, kind: CredKind): Promise<T | null> {
  const row = await credStore().get(workspaceId, kind);
  const raw = row ? openSecret(row.enc, workspaceId, kind) : null;
  return raw ? (JSON.parse(raw) as T) : null;
}
