/** A real signed session cookie (magic-link flow, nothing mocked) and a stored plan for that user. */
import { updateWorkspace, ensureWorkspaceForUser } from "@/lib/accounts/workspaces";

process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";
process.env.BETTER_AUTH_URL ||= "https://keplar.one";
process.env.KEPLAR_DEV_TOOLS = "1";

const origin = "https://keplar.one";
let n = 0;
const ip = () => `10.${(++n >> 8) & 255}.${n & 255}.${(n * 7) % 250}`;
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

export async function signIn(email: string, plan: "free" | "lite" | "plus" | "pro" | "business" = "free"): Promise<{ cookie: string; workspaceId: string }> {
  const { auth } = await import("@/lib/accounts/auth");
  const { listOutbox } = await import("@/lib/accounts/outbox");
  const send = await auth.handler(new Request(`${origin}/api/auth/sign-in/magic-link`, { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": ip() }, body: JSON.stringify({ email, callbackURL: "/account" }) }));
  if (send.status !== 200) throw new Error(`magic link request failed: ${send.status}`);
  const mail = (await listOutbox()).filter((m) => m.to.toLowerCase() === email.toLowerCase()).sort((a, b) => b.at.localeCompare(a.at))[0]; // newest first (a repeat sign-in must use its own link)
  const link = mail?.text.match(/https:\/\/\S+/)?.[0];
  if (!link) throw new Error("no magic link");
  const token = new URL(link).searchParams.get("token") as string;
  const ok = await auth.handler(new Request(`${origin}/api/auth/magic-link/confirm`, { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": ip() }, body: JSON.stringify({ token }) }));
  if (ok.status !== 200) throw new Error(`confirm failed: ${ok.status}`);
  const cookie = cookieOf(ok);
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!session) throw new Error("no session");
  const row = await ensureWorkspaceForUser({ id: session.user.id, email: session.user.email, name: session.user.name });
  if (plan !== "free") await updateWorkspace(row.id, { plan });
  return { cookie, workspaceId: row.id };
}

export const call = (cookie: string | null, url: string, init: RequestInit = {}) =>
  new Request(`${origin}${url}`, { ...init, headers: { ...(cookie ? { cookie } : {}), origin, ...(init.headers as Record<string, string> | undefined) } });

export const jsonReq = (cookie: string | null, url: string, method: string, body?: unknown) =>
  call(cookie, url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
