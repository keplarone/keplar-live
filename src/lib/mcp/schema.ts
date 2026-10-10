/**
 * Tool definitions arrive from a remote server, so they are validated before anything is stored, and call arguments are
 * validated against the stored schema before anything is sent. The validator supports the JSON Schema subset MCP tools
 * actually use; `pattern` is deliberately NOT executed (a server-supplied regex is a ReDoS risk in our process).
 */
import { createHash } from "node:crypto";
import { sanitizeUntrusted } from "./sanitize";

export const LIMITS = {
  toolsPerServer: 100,
  nameMax: 128,
  descriptionMax: 600,
  schemaBytes: 16_384,
  schemaDepth: 8,
  argsBytes: 16_384,
  argsDepth: 8,
};

export type JsonSchema = Record<string, unknown>;
export type ToolDef = {
  name: string;
  description: string;
  descriptionFlagged: boolean;
  inputSchema: JsonSchema;
  /** The server's own claim (unverified): never used to grant anything, only shown as a hint. */
  serverHints: { readOnly?: boolean; destructive?: boolean; openWorld?: boolean };
  schemaHash: string;
};

const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function depthOk(v: unknown, max: number, d = 0): boolean {
  if (d > max) return false;
  if (Array.isArray(v)) return v.every((x) => depthOk(x, max, d + 1));
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (BAD_KEYS.has(k)) return false;
      if (!depthOk(x, max, d + 1)) return false;
    }
  }
  return true;
}

export const hashOf = (v: unknown) => createHash("sha256").update(stable(v)).digest("hex").slice(0, 32);
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

export type ParsedTool = { ok: true; tool: ToolDef } | { ok: false; reason: string; name?: string };

export function parseToolDef(raw: unknown): ParsedTool {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "not an object" };
  const r = raw as Record<string, unknown>;
  const name = r.name;
  if (typeof name !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(name)) return { ok: false, reason: "invalid tool name", name: typeof name === "string" ? name.slice(0, 40) : undefined };
  let schema: unknown = r.inputSchema ?? { type: "object", properties: {} };
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return { ok: false, name, reason: "inputSchema is not an object" };
  let json: string;
  try {
    json = JSON.stringify(schema);
  } catch {
    return { ok: false, name, reason: "inputSchema is not JSON" };
  }
  if (json.length > LIMITS.schemaBytes) return { ok: false, name, reason: "inputSchema is too large" };
  if (!depthOk(schema, LIMITS.schemaDepth)) return { ok: false, name, reason: "inputSchema is too deeply nested or has forbidden keys" };
  schema = JSON.parse(json);
  const s = schema as JsonSchema;
  if (s.type !== undefined && s.type !== "object") return { ok: false, name, reason: "inputSchema must describe an object" };
  const normalized: JsonSchema = { ...s, type: "object" };
  const d = sanitizeUntrusted(typeof r.description === "string" ? r.description : "", { maxChars: LIMITS.descriptionMax });
  const ann = r.annotations && typeof r.annotations === "object" ? (r.annotations as Record<string, unknown>) : {};
  const flag = (k: string) => (typeof ann[k] === "boolean" ? (ann[k] as boolean) : undefined);
  return {
    ok: true,
    tool: {
      name,
      description: d.text.trim(),
      descriptionFlagged: d.removedLines > 0 || d.redactions > 0,
      inputSchema: normalized,
      serverHints: { readOnly: flag("readOnlyHint"), destructive: flag("destructiveHint"), openWorld: flag("openWorldHint") },
      schemaHash: hashOf({ name, normalized }),
    },
  };
}

/* ---------- argument validation ---------- */

const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const isType = (v: unknown, t: string) => (t === "number" ? typeof v === "number" && Number.isFinite(v) : t === "integer" ? typeof v === "number" && Number.isInteger(v) : typeOf(v) === t);

function check(schema: unknown, value: unknown, path: string, errs: string[], root: JsonSchema, depth: number): void {
  if (errs.length >= 10 || depth > 12) return;
  if (schema === true || schema === undefined) return;
  if (schema === false) return void errs.push(`${path}: not allowed`);
  if (!schema || typeof schema !== "object") return;
  const s = schema as JsonSchema;
  if (typeof s.$ref === "string") {
    const m = /^#\/(\$defs|definitions)\/([\w.-]+)$/.exec(s.$ref);
    const target = m ? ((root[m[1]] as Record<string, unknown> | undefined) ?? {})[m[2]] : undefined;
    if (target) check(target, value, path, errs, root, depth + 1);
    return;
  }
  if (Array.isArray(s.allOf)) for (const x of s.allOf) check(x, value, path, errs, root, depth + 1);
  if (Array.isArray(s.anyOf) && !s.anyOf.some((x) => { const e: string[] = []; check(x, value, path, e, root, depth + 1); return e.length === 0; })) errs.push(`${path}: doesn't match any allowed shape`);
  if (Array.isArray(s.oneOf) && s.oneOf.filter((x) => { const e: string[] = []; check(x, value, path, e, root, depth + 1); return e.length === 0; }).length !== 1) errs.push(`${path}: must match exactly one allowed shape`);
  if ("const" in s && stable(s.const) !== stable(value)) errs.push(`${path}: must equal ${JSON.stringify(s.const)}`);
  if (Array.isArray(s.enum) && !s.enum.some((x) => stable(x) === stable(value))) errs.push(`${path}: must be one of ${s.enum.slice(0, 8).map((x) => JSON.stringify(x)).join(", ")}`);
  const types = typeof s.type === "string" ? [s.type] : Array.isArray(s.type) ? (s.type as string[]) : null;
  if (types && !types.some((t) => isType(value, t))) return void errs.push(`${path}: expected ${types.join(" or ")}`);
  if (typeof value === "string") {
    if (typeof s.minLength === "number" && value.length < s.minLength) errs.push(`${path}: too short`);
    if (typeof s.maxLength === "number" && value.length > s.maxLength) errs.push(`${path}: too long`);
  }
  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) errs.push(`${path}: below ${s.minimum}`);
    if (typeof s.maximum === "number" && value > s.maximum) errs.push(`${path}: above ${s.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === "number" && value.length < s.minItems) errs.push(`${path}: too few items`);
    if (typeof s.maxItems === "number" && value.length > s.maxItems) errs.push(`${path}: too many items`);
    if (s.items && !Array.isArray(s.items)) value.slice(0, 200).forEach((v, i) => check(s.items, v, `${path}[${i}]`, errs, root, depth + 1));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (s.properties && typeof s.properties === "object" ? s.properties : {}) as Record<string, unknown>;
    if (Array.isArray(s.required)) for (const k of s.required) if (typeof k === "string" && !(k in obj)) errs.push(`${path ? path + "." : ""}${k}: required`);
    for (const [k, v] of Object.entries(obj)) {
      if (k in props) check(props[k], v, `${path ? path + "." : ""}${k}`, errs, root, depth + 1);
      else if (s.additionalProperties === false) errs.push(`${path ? path + "." : ""}${k}: not an allowed field`);
      else if (s.additionalProperties && typeof s.additionalProperties === "object") check(s.additionalProperties, v, `${path ? path + "." : ""}${k}`, errs, root, depth + 1);
    }
  }
}

/** Returns a list of problems (empty = valid). Also enforces size/depth caps and forbidden keys on the arguments. */
export function validateArgs(schema: JsonSchema, args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return ["arguments must be an object"];
  let json: string;
  try {
    json = JSON.stringify(args);
  } catch {
    return ["arguments must be JSON"];
  }
  if (json.length > LIMITS.argsBytes) return ["arguments are too large"];
  if (!depthOk(args, LIMITS.argsDepth)) return ["arguments are too deeply nested or use a forbidden key"];
  const errs: string[] = [];
  check(schema, JSON.parse(json), "", errs, schema, 0);
  return errs.slice(0, 8).map((e) => e.replace(/^: /, ""));
}

/** Skeleton arguments for the "Run a tool" box: required fields with an empty value of the right type. */
export function skeletonArgs(schema: JsonSchema): Record<string, unknown> {
  const props = (schema.properties && typeof schema.properties === "object" ? schema.properties : {}) as Record<string, JsonSchema>;
  const req = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const out: Record<string, unknown> = {};
  for (const k of req) {
    const t = props[k]?.type;
    const ty = Array.isArray(t) ? t[0] : t;
    out[k] = ty === "number" || ty === "integer" ? 0 : ty === "boolean" ? false : ty === "array" ? [] : ty === "object" ? {} : "";
  }
  return out;
}
