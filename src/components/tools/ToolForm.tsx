"use client";

import { useId, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Markdown } from "@/components/app-ui/Markdown";
import { track } from "@/lib/analytics";
import { buildPrompt, validateInput, type ToolInput } from "@/lib/free-tools/prompts";
import { TOOL_RUN_LIMITS, type Tool } from "@/lib/free-tools/registry";
import s from "./tools.module.css";

type Result = { answer: string; agreement: string; models: string[] };
type Failure = { error?: string; code?: string; retryAfterSec?: number };

const initial = (tool: Tool): ToolInput => Object.fromEntries(tool.fields.map((f) => [f.id, f.kind === "select" ? f.options?.[0]?.value ?? "" : ""]));

/** The form, run button and result panel of a model-backed tool. Posts to /api/tools/run; shows the answer as Markdown. */
export function ToolForm({ tool }: { tool: Tool }) {
  const id = useId();
  const [values, setValues] = useState<ToolInput>(() => initial(tool));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }));

  const run = async () => {
    if (busy) return;
    const v = validateInput(tool, values);
    if (!v.ok) { setError(v.error); return; }
    setBusy(true); setError(""); setResult(null); setCopied(false);
    try {
      const r = await fetch("/api/tools/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool: tool.slug, input: v.input }) });
      const j = (await r.json().catch(() => ({}))) as Partial<Result> & Failure;
      if (!r.ok) {
        if (r.status === 401) setError("Sign in to use this tool here, or open it in Keplar.");
        else if (r.status === 429 || r.status === 402) setError(j.error ?? "You have used the free allowance for now. Try again later, or ask the same thing in Keplar.");
        else setError(j.error ?? "That did not work. Try again in a minute.");
        return;
      }
      setResult({ answer: j.answer ?? "", agreement: j.agreement ?? "", models: j.models ?? [] });
      track("tool_run", { where: tool.slug });
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  };

  const openHref = (() => {
    const v = validateInput(tool, values);
    const q = v.ok ? buildPrompt(tool, v.input) : "";
    return q ? `/app#q=${encodeURIComponent(q.slice(0, 6000))}` : "/app";
  })();

  return (
    <div>
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); void run(); }} aria-describedby={`${id}-note`}>
        {tool.fields.map((f) => (
          <div key={f.id} className={s.field}>
            <label htmlFor={`${id}-${f.id}`}>{f.label}{f.required ? "" : ""}</label>
            {f.kind === "textarea" ? (
              <textarea id={`${id}-${f.id}`} rows={f.rows ?? 4} maxLength={f.max} placeholder={f.placeholder} required={f.required} value={values[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} />
            ) : f.kind === "select" ? (
              <select id={`${id}-${f.id}`} value={values[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)}>
                {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input id={`${id}-${f.id}`} type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"} maxLength={f.max} placeholder={f.placeholder} required={f.required} value={values[f.id] ?? ""} onChange={(e) => set(f.id, e.target.value)} />
            )}
            {f.help ? <span className={s.help}>{f.help}</span> : null}
          </div>
        ))}
        {tool.examples.length ? (
          <ul className={s.examples} aria-label="Examples to try">
            {tool.examples.map((ex) => (
              <li key={ex.title}><button type="button" className={s.chip} onClick={() => setValues({ ...initial(tool), ...ex.input })}>Try: {ex.title}</button></li>
            ))}
          </ul>
        ) : null}
        <div className={s.actions}>
          <Button type="submit" variant="primary" size="md" loading={busy} arrow>{tool.action}</Button>
          <ButtonLink href={openHref} variant="secondary" size="md">Open in Keplar instead</ButtonLink>
        </div>
        {error ? <p className={s.error} role="alert">{error}</p> : null}
        <p id={`${id}-note`} className={s.note}>
          Free, no account. Runs on free open models, whose hosts may log what you send, so keep private details out. Up to {TOOL_RUN_LIMITS.perDay} runs a day per visitor. The result can be wrong; check it against your material.
        </p>
      </form>
      {result ? (
        <section className={s.result} aria-live="polite" aria-label="Result">
          <p className={s.meta}>
            {result.agreement ? <span>{result.agreement}</span> : null}
            {result.models.length ? <span>Models: {result.models.join(", ")}</span> : null}
          </p>
          <Markdown source={result.answer} />
          <div className={s.actions} style={{ marginTop: "var(--s-5)" }}>
            <Button type="button" variant="secondary" size="sm" state={copied ? "done" : undefined} onClick={async () => { try { await navigator.clipboard.writeText(result.answer); setCopied(true); } catch { /* clipboard blocked */ } }}>{copied ? "Copied" : "Copy result"}</Button>
            <ButtonLink href={tool.product.href} variant="secondary" size="sm" arrow>{tool.product.label}</ButtonLink>
          </div>
        </section>
      ) : null}
    </div>
  );
}
