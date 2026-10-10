/**
 * Password + email rules shared by the server (authoritative) and the sign-up form (instant hints).
 * Pure: no DOM, no node APIs, so it can run in the browser on every keystroke.
 *
 * Policy (NIST 800-63B style): length over composition. 10 to 128 characters, nothing from a short list of
 * very common passwords, and not built from the person's own email or name. No forced symbol/case rules.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const EMAIL_MAX = 254;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Shape check only (the real proof is the email we send). Trims; never throws. */
export function validEmail(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const v = input.trim();
  return v.length > 0 && v.length <= EMAIL_MAX && EMAIL.test(v) && !v.includes("..");
}

const COMMON = [
  "password", "passw0rd", "p@ssword", "123456789", "1234567890", "12345678910", "qwertyuiop", "qwerty123", "qwertyuiopasdfghjkl", "1q2w3e4r5t",
  "iloveyou", "letmein", "welcome", "admin", "administrator", "abc123", "monkey", "dragon", "football", "baseball", "master", "sunshine",
  "princess", "shadow", "superman", "batman", "trustno1", "changeme", "default", "login", "starwars", "whatever", "freedom", "hello123",
  "zaq12wsx", "asdfghjkl", "zxcvbnm", "keplar", "keplarone", "openai", "chatgpt", "secret", "access", "computer", "internet", "michael",
  "jennifer", "charlie", "donald", "mustang", "cheese", "pokemon", "minecraft", "summer", "winter", "spring", "autumn", "google", "samsung",
];

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba", "0123456789", "9876543210", "qwertyuiopasdfghjklzxcvbnm", "qwertzuiopasdfghjklyxcvbnm"];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Common substitutions people use to dress up a bad password (p@ssw0rd). */
const unleet = (s: string) => s.toLowerCase().replace(/0/g, "o").replace(/[1!|]/g, "i").replace(/3/g, "e").replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/7/g, "t");

function isCommon(pw: string): boolean {
  const a = squash(pw);
  const b = squash(unleet(pw));
  for (const c of COMMON) {
    for (const v of [a, b]) {
      if (v === c) return true;
      // a common word with a few characters tacked on ("password2026!") is still a guessable password
      if (v.includes(c) && v.length <= c.length + 4) return true;
    }
  }
  return false;
}

function isSimplePattern(pw: string): boolean {
  const s = pw.toLowerCase();
  if (new Set(s).size <= 2) return true; // aaaaaaaaaa, ababababab
  for (const seq of SEQUENCES) if (seq.includes(s) && s.length >= 8) return true;
  // one short unit repeated over and over ("abcabcabcabc")
  for (let n = 1; n <= 4; n++) if (s.length >= n * 3 && s === s.slice(0, n).repeat(Math.ceil(s.length / n)).slice(0, s.length)) return true;
  return false;
}

function containsPersonal(pw: string, ctx: { email?: string; name?: string }): boolean {
  const p = squash(pw);
  const parts: string[] = [];
  if (ctx.email) parts.push(squash(ctx.email.split("@")[0] ?? ""));
  if (ctx.name) for (const w of ctx.name.split(/\s+/)) parts.push(squash(w));
  if (ctx.name) parts.push(squash(ctx.name));
  return parts.some((x) => x.length >= 4 && p.includes(x));
}

/** Rough guessing-entropy estimate in bits: charset size, length, discounting repeats and runs. */
function entropyBits(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 28;
  if (!pool) return 0;
  let effective = 0;
  let prev = "";
  let run = 0;
  for (const ch of pw) {
    const step = ch.charCodeAt(0) - (prev ? prev.charCodeAt(0) : 0);
    if (ch === prev || (prev && Math.abs(step) === 1)) run += 1;
    else run = 0;
    // repeated or sequential characters add little
    effective += run >= 1 ? 0.25 : 1;
    prev = ch;
  }
  return effective * Math.log2(pool);
}

export type PasswordScore = 0 | 1 | 2 | 3 | 4;
export type PasswordCheck = {
  /** Meets the policy: the server will accept it. */
  ok: boolean;
  score: PasswordScore;
  label: "Too short" | "Very weak" | "Weak" | "Fair" | "Good" | "Strong";
  /** One short sentence: what to fix, or confirmation. */
  hint: string;
  /** First blocking problem (null when ok). */
  problem: string | null;
};

export function checkPassword(pw: string, ctx: { email?: string; name?: string } = {}): PasswordCheck {
  const len = [...pw].length;
  const bits = entropyBits(pw);
  let score: PasswordScore = bits < 30 ? 0 : bits < 42 ? 1 : bits < 54 ? 2 : bits < 68 ? 3 : 4;
  const fail = (problem: string, label: PasswordCheck["label"], cap: PasswordScore): PasswordCheck => ({ ok: false, score: Math.min(score, cap) as PasswordScore, label, hint: problem, problem });
  if (len === 0) return { ok: false, score: 0, label: "Too short", hint: `Use at least ${PASSWORD_MIN} characters. A few unrelated words works well.`, problem: `Use at least ${PASSWORD_MIN} characters.` };
  if (len < PASSWORD_MIN) return fail(`${PASSWORD_MIN - len} more character${PASSWORD_MIN - len === 1 ? "" : "s"} to go (minimum ${PASSWORD_MIN}).`, "Too short", 1);
  if (len > PASSWORD_MAX) return fail(`Use at most ${PASSWORD_MAX} characters.`, "Weak", 1);
  if (isCommon(pw)) return fail("That's a very common password. Try a few unrelated words instead.", "Very weak", 0);
  if (isSimplePattern(pw)) return fail("Avoid repeated or sequential characters.", "Very weak", 0);
  if (containsPersonal(pw, ctx)) return fail("Don't build it from your name or email.", "Weak", 1);
  if (score < 1) score = 1;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;
  const hints = ["Add more words or characters.", "Add another word or a few more characters.", "Okay. One more word makes it much stronger.", "Hard to guess.", "Very hard to guess."];
  return { ok: true, score, label: labels[score], hint: hints[score], problem: null };
}
