/** Data collections: a small table the owner edits and the site shows. Anyone can read it as JSON; only the signed-in owner can write. */
import { HttpError } from "@/lib/create/platform/http";
import type { Site } from "../types";
import { findPlaceholders, type Placeholder } from "./placeholders";
import { addRecord, listRecords, records, type FeatureRecord } from "./records";

export const MAX_ROWS = 200;
export const MAX_CELL = 500;

export type Collection = { key: string; title: string; fields: string[]; view: "table" | "cards"; seed: string };

export function collectionsIn(files: Record<string, string>): Collection[] {
  const out = new Map<string, Collection>();
  for (const [file, html] of Object.entries(files)) {
    if (!file.endsWith(".html")) continue;
    for (const p of findPlaceholders(html)) {
      if (p.feature !== "data" || out.has(p.key)) continue;
      out.set(p.key, toCollection(p));
    }
  }
  return [...out.values()];
}

export function toCollection(p: Placeholder): Collection {
  return { key: p.key, title: p.attrs.title || p.key, fields: (p.attrs.fields || "item,details").split(","), view: p.attrs.view === "cards" ? "cards" : "table", seed: p.attrs.seed || "" };
}

/** "Name;Price|Name;Price" -> rows keyed by the collection's fields. */
export function parseSeed(seed: string, fields: string[]): Record<string, string>[] {
  return seed.split("|").slice(0, 60).map((line) => {
    const cells = line.split(";");
    return Object.fromEntries(fields.map((f, i) => [f, (cells[i] ?? "").trim().slice(0, MAX_CELL)]).filter(([, v]) => v));
  }).filter((r) => Object.keys(r).length);
}

export const cleanRow = (row: Record<string, unknown>, fields: string[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = typeof row[f] === "string" ? (row[f] as string) : typeof row[f] === "number" ? String(row[f]) : "";
    const c = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, MAX_CELL);
    if (c) out[f] = c;
  }
  return out;
};

const rowsOf = (all: FeatureRecord[]) => all.filter((r) => r.status === "row").sort((a, b) => Number(a.data._o ?? 0) - Number(b.data._o ?? 0) || a.createdAt.localeCompare(b.createdAt));

export async function listRows(site: Pick<Site, "id" | "workspaceId">, key: string) {
  return rowsOf(await listRecords(site.workspaceId, site.id, "data", key));
}

/** First time a collection exists: add the rows the site was generated with. Once only, even if the owner deletes them all. */
export async function seedCollections(site: Site, files: Record<string, string>) {
  for (const c of collectionsIn(files)) {
    if (!c.seed) continue;
    const { inserted } = await addRecord({ id: `rec_${site.id}_data_${c.key}_seed`, workspaceId: site.workspaceId, siteId: site.id, feature: "data", key: c.key, data: {}, status: "marker" });
    if (!inserted) continue;
    const rows = parseSeed(c.seed, c.fields);
    for (let i = 0; i < rows.length; i++) await addRecord({ workspaceId: site.workspaceId, siteId: site.id, feature: "data", key: c.key, data: { ...rows[i], _o: String(i + 1) }, status: "row" });
  }
}

async function must(site: Site, files: Record<string, string>, key: string) {
  const c = collectionsIn(files).find((x) => x.key === key);
  if (!c) throw new HttpError(404, "That table isn't on the site (yet). Ask the builder to add it, then try again.", "not_found");
  return c;
}

export async function addRow(site: Site, files: Record<string, string>, key: string, input: Record<string, unknown>) {
  const c = await must(site, files, key);
  const data = cleanRow(input, c.fields);
  if (!Object.keys(data).length) throw new HttpError(400, "Fill in at least one column.");
  const rows = await listRows(site, key);
  if (rows.length >= MAX_ROWS) throw new HttpError(409, `A table holds up to ${MAX_ROWS} rows.`, "limit");
  const next = Math.max(0, ...rows.map((r) => Number(r.data._o ?? 0))) + 1;
  return (await addRecord({ workspaceId: site.workspaceId, siteId: site.id, feature: "data", key, data: { ...data, _o: String(next) }, status: "row" })).row;
}

export async function updateRow(site: Site, files: Record<string, string>, key: string, rowId: string, input: Record<string, unknown>) {
  const c = await must(site, files, key);
  const row = await records().get(site.workspaceId, rowId);
  if (!row || row.siteId !== site.id || row.key !== key || row.status !== "row") throw new HttpError(404, "That row doesn't exist.", "not_found");
  const data = cleanRow(input, c.fields);
  if (!Object.keys(data).length) throw new HttpError(400, "Fill in at least one column.");
  return records().update(site.workspaceId, rowId, { data: { ...data, _o: row.data._o ?? "0" } });
}

export async function deleteRow(site: Site, key: string, rowId: string) {
  const row = await records().get(site.workspaceId, rowId);
  if (!row || row.siteId !== site.id || row.key !== key || row.status !== "row") throw new HttpError(404, "That row doesn't exist.", "not_found");
  await records().remove(site.workspaceId, rowId);
}

/** What the public JSON shows: only the declared columns, no ids or order numbers. */
export const publicRows = (rows: FeatureRecord[], fields: string[]) => rows.map((r) => Object.fromEntries(fields.filter((f) => r.data[f] !== undefined).map((f) => [f, r.data[f]])));
