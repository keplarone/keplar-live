/**
 * English fallback for missing keys: a translated catalog laid over the English one. Objects merge key by key; a string
 * replaces only a string; a list replaces the English list only when it has the same length (so a half-translated list can
 * never drop or misalign items). Empty strings count as missing.
 */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function withFallback<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (typeof base === "string") return (typeof over === "string" && over.trim() !== "" ? over : base) as T;
  if (Array.isArray(base)) {
    if (!Array.isArray(over) || over.length !== base.length) return base;
    return base.map((b, i) => withFallback(b, over[i])) as T;
  }
  if (base && typeof base === "object") {
    if (typeof over !== "object" || Array.isArray(over)) return base;
    const out: Record<string, Json> = { ...(base as Record<string, Json>) };
    const o = over as Record<string, Json>;
    for (const k of Object.keys(o)) {
      if (k in out) out[k] = withFallback(out[k], o[k]);
      else if (typeof o[k] === "string" || (o[k] && typeof o[k] === "object")) out[k] = o[k]; // open maps (by href/id) may add keys
    }
    return out as T;
  }
  return base;
}

/** Dotted paths of every string leaf (list items included), for coverage checks. */
export function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => leafPaths(v, `${prefix}[${i}]`));
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
  return [];
}
