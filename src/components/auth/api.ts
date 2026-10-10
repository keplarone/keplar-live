/** Tiny client for our /api/auth/password/* endpoints (same-origin JSON; the server enforces origin, limits and validation). */
export type AuthResult = { ok: boolean; status: number; code?: string; message: string; redirectTo?: string };

const FALLBACK: Record<number, string> = {
  400: "Check the details and try again.",
  401: "Incorrect email or password.",
  403: "That request was refused. Reload the page and try again.",
  429: "Too many attempts. Wait a few minutes and try again, or email yourself a sign-in link.",
  502: "We couldn't send the email just now. Try again in a minute.",
  503: "That isn't available on this server right now.",
};

export async function postAuth(path: string, body: Record<string, unknown>): Promise<AuthResult> {
  try {
    const res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { code?: string; message?: string; redirectTo?: string };
    if (res.ok) return { ok: true, status: res.status, message: "", redirectTo: json.redirectTo };
    return { ok: false, status: res.status, code: json.code, message: json.message || FALLBACK[res.status] || "Something went wrong. Try again." };
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Keplar. Check your connection and try again." };
  }
}

/** Mail a sign-in link (the existing magic-link endpoint). */
export const sendMagicLink = (body: { email: string; name?: string; callbackURL: string; remember: boolean }) => postAuth("sign-in/magic-link", body);
