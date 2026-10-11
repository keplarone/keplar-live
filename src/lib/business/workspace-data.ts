/**
 * Keplar Business workspace data that Keplar One doesn't have: project tasks, the person's dashboard layout, and the cached
 * executive summary. Stored per workspace.
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";

import { cleanLayout, DEFAULT_LAYOUT, type LayoutItem } from "./layout";

export { cleanLayout, DEFAULT_LAYOUT, WIDGETS, type LayoutItem, type WidgetId, type WidgetSize } from "./layout";

type LayoutRow = { id: string; workspaceId: string; items: LayoutItem[]; updatedAt: string };
const layouts = () => collection<LayoutRow>("business_layouts");

export async function getLayout(workspaceId: string): Promise<LayoutItem[]> {
  return cleanLayout((await layouts().get(workspaceId, workspaceId))?.items ?? DEFAULT_LAYOUT);
}
export async function saveLayout(workspaceId: string, items: unknown): Promise<LayoutItem[]> {
  const clean = cleanLayout(items);
  const now = new Date().toISOString();
  if (await layouts().get(workspaceId, workspaceId)) await layouts().update(workspaceId, workspaceId, { items: clean, updatedAt: now });
  else await layouts().insert({ id: workspaceId, workspaceId, items: clean, updatedAt: now });
  return clean;
}

export type TaskStatus = "todo" | "doing" | "done";
export type TaskRow = { id: string; workspaceId: string; projectId: string; title: string; status: TaskStatus; due: string | null; createdAt: string; updatedAt: string };
export const tasks = () => collection<TaskRow>("business_tasks");
export const MAX_TASKS_PER_PROJECT = 500;

const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const dueOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const statusOf = (v: unknown): TaskStatus | null => (v === "todo" || v === "doing" || v === "done" ? v : null);

export async function addTask(workspaceId: string, projectId: string, input: { title?: unknown; due?: unknown }): Promise<TaskRow> {
  const title = line(input.title, 200);
  if (!title) throw new HttpError(400, "Give the task a title.", "bad_title");
  if ((await tasks().list(workspaceId, (t) => t.projectId === projectId)).length >= MAX_TASKS_PER_PROJECT) throw new HttpError(409, `Up to ${MAX_TASKS_PER_PROJECT} tasks per project.`, "too_many");
  const now = new Date().toISOString();
  return tasks().insert({ id: `tk_${randomBytes(9).toString("base64url")}`, workspaceId, projectId, title, status: "todo", due: dueOf(input.due), createdAt: now, updatedAt: now });
}

export async function updateTask(workspaceId: string, id: string, input: { title?: unknown; status?: unknown; due?: unknown }): Promise<TaskRow> {
  const t = await tasks().get(workspaceId, id);
  if (!t) throw new HttpError(404, "Task not found.", "not_found");
  const patch: Partial<TaskRow> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) { const title = line(input.title, 200); if (!title) throw new HttpError(400, "Give the task a title.", "bad_title"); patch.title = title; }
  if (input.status !== undefined) { const s = statusOf(input.status); if (!s) throw new HttpError(400, "Status is todo, doing or done.", "bad_status"); patch.status = s; }
  if (input.due !== undefined) patch.due = input.due === null ? null : dueOf(input.due);
  return (await tasks().update(workspaceId, id, patch)) ?? { ...t, ...patch };
}

type SummaryRow = { id: string; workspaceId: string; day: string; text: string; createdAt: string };
export const summaries = () => collection<SummaryRow>("business_summaries");
