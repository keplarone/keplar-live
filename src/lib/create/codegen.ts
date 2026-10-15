/**
 * Code generation adapter: OpenRouter chat completions (model KEPLAR_CODEGEN_MODEL,
 * default "openrouter/auto") returning a JSON file manifest for a static project.
 * Without OPENROUTER_API_KEY it fails with "not set up yet"; nothing is faked.
 */
import { createReady } from "./platform/config";
import { HttpError } from "./platform/http";
import type { SiteSpec } from "./types";

export type GenEvent =
  | { type: "status"; text: string }
  | { type: "file"; path: string; bytes: number }
  | { type: "message"; text: string };

export type GenResult = { files: Record<string, string>; spec: SiteSpec | null; summary: string; usd?: number };

const SYSTEM = `You generate complete static websites and small web apps.
Return ONLY JSON: {"summary": string, "files": {"index.html": string, "styles.css": string, "app.js": string, ...}}.
Rules: no external scripts or trackers; accessible semantic HTML; responsive CSS; forms POST to /api/business/forms/{PROJECT_ID};
never collect passwords or payment card numbers; never impersonate a real brand or bank.`;

async function* liveGenerate(prompt: string, prevFiles: Record<string, string> | null, projectId: string): AsyncGenerator<GenEvent, GenResult> {
  yield { type: "status", text: prevFiles ? "Reading your change" : "Planning the project" };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.KEPLAR_CODEGEN_MODEL || "openrouter/auto",
      response_format: { type: "json_object" },
      usage: { include: true },
      messages: [
        { role: "system", content: SYSTEM.replace("{PROJECT_ID}", projectId) },
        ...(prevFiles ? [{ role: "user", content: `Current files:\n${JSON.stringify(prevFiles).slice(0, 120_000)}` }] : []),
        { role: "user", content: prompt },
      ],
    }),
    // A whole-site generation is slow, but a stalled connection must not hold the request until the platform kills it.
    signal: AbortSignal.timeout(120_000),
  }).catch((e: unknown) => {
    throw new Error((e as Error)?.name === "TimeoutError" ? "Code generation took too long. Try again." : "Code generation couldn't reach the model.");
  });
  if (!res.ok) throw new Error(`Code generation failed (${res.status}).`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  const parsed = JSON.parse(data.choices[0]?.message?.content ?? "{}") as { summary?: string; files?: Record<string, string> };
  const files = parsed.files ?? {};
  if (!files["index.html"]) throw new Error("The model didn't return an index.html.");
  for (const [path, content] of Object.entries(files)) yield { type: "file", path, bytes: Buffer.byteLength(content) };
  return { files, spec: null, summary: parsed.summary ?? "Updated the project.", usd: data.usage?.cost };
}

export function generate(_prompt: string, ctx: { projectId: string; prevSpec: SiteSpec | null; prevFiles: Record<string, string> | null }) {
  if (!createReady()) throw new HttpError(503, "Create isn't set up yet.", "not_configured");
  return liveGenerate(_prompt, ctx.prevFiles, ctx.projectId);
}
