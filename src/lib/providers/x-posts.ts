/**
 * Recent public posts on X, for questions about what people are saying right now. Provider: the X API v2 recent search
 * (https://api.x.com/2/tweets/search/recent), authenticated with an app bearer token:
 *   X_BEARER_TOKEN   (pay-per-use X developer account; not set = this feature reports "not configured", never fake results)
 * Results are public post text with author handle, time, metrics and a link. They are data for the panel, never instructions.
 */
export const X_LIMITS = { query: 256, results: 25 } as const;
export const X_RECENT_SEARCH = "https://api.x.com/2/tweets/search/recent";

export type XPost = { id: string; text: string; author: { handle: string; name: string } | null; createdAt: string | null; url: string; metrics: { likes: number; reposts: number; replies: number } | null };
export type XSearch = { ok: true; posts: XPost[] } | { ok: false; reason: "not_configured" | "invalid" | "rate_limited" | "upstream"; message: string };

export const xConfigured = (env: Record<string, string | undefined> = process.env) => Boolean(env.X_BEARER_TOKEN?.trim());

export function cleanXQuery(q: unknown): string | null {
  if (typeof q !== "string") return null;
  const t = q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, X_LIMITS.query);
  return t.length >= 2 ? t : null;
}

const STOP = new Set("the and for are but not you your with that this from what when where which who whom why how was were will would could should can does did doing have has had about into over than then them they their there these those its it's also just like more most some such only very much many any all our out get got let use using make made want need tell show give find best good new now today latest people say saying think".split(" "));

/** A starting search from a question: up to five distinctive words (the person can edit it before searching). */
export function xQueryFrom(question: string): string {
  const words = question.toLowerCase().replace(/https?:\/\/\S+/g, " ").match(/[#@]?[\p{L}\p{N}][\p{L}\p{N}_'-]*/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    const t = w.replace(/'s$/, "");
    if ((t.length >= 3 || /^[#@]/.test(t)) && !STOP.has(t) && !out.includes(t)) out.push(t);
    if (out.length === 5) break;
  }
  return out.join(" ");
}

type Raw = { data?: { id: string; text: string; author_id?: string; created_at?: string; public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number } }[]; includes?: { users?: { id: string; username: string; name: string }[] } };

export function mapXResponse(raw: Raw): XPost[] {
  const users = new Map((raw.includes?.users ?? []).map((u) => [u.id, u]));
  return (raw.data ?? []).filter((t) => /^\d{1,25}$/.test(t.id) && typeof t.text === "string").map((t) => {
    const found = t.author_id ? users.get(t.author_id) : undefined;
    const u = found && /^\w{1,15}$/.test(found.username) ? found : undefined; // links are built from these, so only real handles
    return {
      id: t.id,
      text: t.text,
      author: u ? { handle: u.username, name: u.name } : null,
      createdAt: t.created_at ?? null,
      url: u ? `https://x.com/${u.username}/status/${t.id}` : `https://x.com/i/web/status/${t.id}`,
      metrics: t.public_metrics ? { likes: t.public_metrics.like_count ?? 0, reposts: t.public_metrics.retweet_count ?? 0, replies: t.public_metrics.reply_count ?? 0 } : null,
    };
  });
}

export async function searchRecentPosts(query: unknown, opts: { max?: number; env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {}): Promise<XSearch> {
  const env = opts.env ?? process.env;
  if (!xConfigured(env)) return { ok: false, reason: "not_configured", message: "Posts from X aren't connected yet." };
  const q = cleanXQuery(query);
  if (!q) return { ok: false, reason: "invalid", message: "Give at least two characters to search for." };
  const max = Math.min(X_LIMITS.results, Math.max(10, opts.max ?? 10)); // the API accepts 10-100
  const url = `${X_RECENT_SEARCH}?${new URLSearchParams({ query: `${q} -is:retweet`, max_results: String(max), "tweet.fields": "created_at,author_id,public_metrics", expansions: "author_id", "user.fields": "username,name" })}`;
  try {
    const r = await (opts.fetchImpl ?? fetch)(url, { headers: { authorization: `Bearer ${env.X_BEARER_TOKEN!.trim()}` } });
    if (r.status === 429) return { ok: false, reason: "rate_limited", message: "X is limiting requests right now. Try again later." };
    if (!r.ok) return { ok: false, reason: "upstream", message: "X didn't return results." };
    return { ok: true, posts: mapXResponse((await r.json()) as Raw) };
  } catch {
    return { ok: false, reason: "upstream", message: "Couldn't reach X." };
  }
}
