"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/app-ui/Markdown";
import { citeRenderer } from "@/components/app-ui/research/Research";
import type { KeplarAnswer, KeplarEvent, ResearchSource } from "@/lib/orchestration/types";
import { REASON_FRAMEWORKS, reasonPrompt, RESEARCH_TEMPLATES, researchPrompt, titleFrom, type ReasonFrameworkId, type ResearchTemplateId } from "@/lib/business/prompts";
import { reportFile } from "@/lib/business/report-file";
import type { MediaInput } from "@/lib/orchestration/media";
import { readDocs, runEngine, type EngineDoc } from "./engine";
import s from "./workspace.module.css";

type Kind = "research" | "reason";
type Project = { id: string; name: string };
type Saved = { id: string; kind: Kind; title: string; template: string; projectId: string | null; sources: number; createdAt: string };
type Full = { id: string; title: string; markdown: string; sources: ResearchSource[]; queries: string[]; consensus: string; createdAt: string; kind: Kind; prompt: string };
type Live = { queries: string[]; steps: { id: string; status: string; detail?: string }[]; sources: ResearchSource[]; models: { name: string; status: string }[]; text: string; stage: string };

const EMPTY_LIVE: Live = { queries: [], steps: [], sources: [], models: [], text: "", stage: "" };
const TEXT_TYPES = ".txt,.md,.csv,.json,.html,.xml,.yaml,.yml,.log,.tsv";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error ?? "That didn't work. Try again.");
  return d as T;
}

/**
 * Deep Research and Reason in Keplar Business. Both run on Keplar's multi-model engine (/api/keplar): Deep Research with live
 * web research and citations to pages actually read; Reason with uploaded business documents and a decision-report structure
 * (assumptions, calculations, evidence, uncertainty, recommendation, next actions). Finished reports are kept in history and
 * can be downloaded or filed into a project.
 */
export function Analyst({ kind, seed, seedMedia, openId, projectSeed, onSaved }: { kind: Kind; seed?: string; seedMedia?: MediaInput; openId?: string; projectSeed?: string; onSaved?: () => void }) {
  const research = kind === "research";
  const [template, setTemplate] = useState<string>(research ? (seed ? "custom" : "competitors") : "decision");
  const [topic, setTopic] = useState(seed ?? "");
  const [extra, setExtra] = useState("");
  const [docs, setDocs] = useState<EngineDoc[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(projectSeed ?? "");
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<Live>(EMPTY_LIVE);
  const [report, setReport] = useState<Full | null>(null);
  const [history, setHistory] = useState<Saved[]>([]);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const abort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Images or video attached on the home composer go with the first run only.
  const firstMedia = useRef<MediaInput | undefined>(seedMedia);

  const loadHistory = useCallback(() => {
    call<{ reports: Saved[] }>(`/api/business/reports?kind=${kind}`).then((d) => setHistory(d.reports)).catch(() => undefined);
  }, [kind]);
  useEffect(() => {
    queueMicrotask(loadHistory);
    call<{ projects: Project[] }>("/api/projects").then((d) => setProjects(d.projects)).catch(() => undefined);
    return () => abort.current?.abort();
  }, [loadHistory]);

  const options = research ? RESEARCH_TEMPLATES : REASON_FRAMEWORKS;
  const current = options.find((o) => o.id === template) ?? options[0]!;

  const onEvent = (e: KeplarEvent) => {
    setLive((l) => {
      switch (e.type) {
        case "research":
          if (e.research.phase === "plan") return { ...l, queries: e.research.queries };
          if (e.research.phase === "source") return { ...l, sources: [...l.sources, e.research.source] };
          if (e.research.phase === "step") { const st = e.research; return { ...l, steps: [...l.steps.filter((x) => x.id !== st.step), { id: st.step, status: st.status, detail: st.detail }] }; }
          return e.research.phase === "off" ? { ...l, stage: e.research.reason } : l; // "live" is client-only Live Research progress, never sent here
        case "stage": return e.status === "active" ? { ...l, stage: e.detail ?? e.stage } : l;
        case "model": return { ...l, models: [...l.models.filter((m) => m.name !== e.name), { name: e.name, status: e.status }] };
        case "delta": return { ...l, text: l.text + e.text };
        default: return l;
      }
    });
    if (e.type === "error") setErr(e.message);
    if (e.type === "limit") setErr(e.window?.message ?? "You've reached your usage limit for now.");
  };

  const start = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!topic.trim() || running) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true);
    setErr("");
    setNote("");
    setReport(null);
    setLive(EMPTY_LIVE);
    const prompt = research ? researchPrompt(template as ResearchTemplateId, topic, extra) : reasonPrompt(template as ReasonFrameworkId, topic, docs.map((d) => d.name));
    try {
      const ans: KeplarAnswer | null = await runEngine({ prompt, mode: kind, projectId: projectId || null, docs: research ? undefined : docs, media: firstMedia.current }, onEvent, ctl.signal);
      firstMedia.current = undefined;
      if (!ans?.markdown?.trim()) { setErr((e) => e || "Keplar didn't return a report. Try again."); return; }
      const sources = ans.research?.sources ?? [];
      const full: Full = { id: "", kind, title: titleFrom(topic), markdown: ans.markdown, sources, queries: ans.research?.queries ?? [], consensus: ans.consensus?.summary ?? "", createdAt: new Date().toISOString(), prompt: topic };
      if (ans.research?.off) setNote(ans.research.off);
      const saved = await call<{ report: { id: string } }>("/api/business/reports", { method: "POST", body: JSON.stringify({ ...full, template, projectId: projectId || null }) }).catch(() => null);
      setReport({ ...full, id: saved?.report.id ?? "" });
      loadHistory();
      onSaved?.();
    } catch (e2) {
      if ((e2 as Error).name !== "AbortError") setErr(e2 instanceof Error ? e2.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  };

  const open = async (id: string) => {
    setErr("");
    try {
      const d = await call<{ report: Full }>(`/api/business/reports/${encodeURIComponent(id)}`);
      setLive(EMPTY_LIVE);
      setReport(d.report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open that report.");
    }
  };
  // Started from the home composer (seed) or opened from Recent (openId): run or open once, on arrival.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    if (openId) queueMicrotask(() => void open(openId));
    else if (seed?.trim()) queueMicrotask(() => void start());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const remove = async (id: string) => {
    await call(`/api/business/reports/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
    if (report?.id === id) setReport(null);
    loadHistory();
  };
  const fileToProject = async () => {
    if (!report || !projectId) return;
    const f = reportFile(report);
    try {
      await call(`/api/projects/${encodeURIComponent(projectId)}/files`, { method: "POST", body: JSON.stringify({ name: f.name, text: f.text }) });
      setNote(`Saved to ${projects.find((p) => p.id === projectId)?.name ?? "the project"}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save to the project.");
    }
  };
  const pickDocs = async (list: FileList | null) => {
    if (!list?.length) return;
    const { docs: next, skipped } = await readDocs(list, 12 - docs.length);
    setDocs((d) => [...d, ...next].slice(0, 12));
    if (skipped.length) setErr(`Not added: ${skipped.join(", ")}.`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const shownText = report?.markdown ?? live.text;
  const shownSources = report?.sources ?? live.sources;

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.h1}>{research ? "Deep Research" : "Reason"}</h1>
          <p className={s.muted}>{research ? "Several models plan the searches, read the pages and write one report. Every citation points to a page that was actually read." : "Work through a business decision with your own documents. The report shows its assumptions, calculations, evidence and uncertainty."}</p>
        </div>
      </header>

      <div className={s.analyst}>
        <form className={s.panel} onSubmit={(e) => void start(e)}>
          <div className={s.chips} role="radiogroup" aria-label={research ? "Research type" : "Analysis type"}>
            {options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={template === o.id} className={s.chip} onClick={() => setTemplate(o.id)}>{o.label}</button>)}
          </div>
          <label className={s.field}>
            <span>{research ? ("hint" in current ? current.hint : "Topic") : "The decision or question"}</span>
            <textarea className={s.textarea} rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={current.placeholder} maxLength={2000} required />
          </label>
          {research ? (
            <label className={s.field}><span>Context <small className={s.muted}>(optional)</small></span><textarea className={s.textarea} rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Who you are, what you sell, what you need to decide" maxLength={2000} /></label>
          ) : (
            <div className={s.field}>
              <span>Documents <small className={s.muted}>(text, CSV, Markdown; up to 12)</small></span>
              <input ref={fileRef} type="file" accept={TEXT_TYPES} multiple hidden onChange={(e) => void pickDocs(e.target.files)} />
              <div className={s.row}>
                <button type="button" className={s.btnGhost} data-orbit-fx="secondary" onClick={() => fileRef.current?.click()} disabled={docs.length >= 12}>Add documents</button>
                {docs.map((d) => <span key={d.name} className={s.tag}>{d.name}{d.truncated ? " (shortened)" : ""} <button type="button" className={s.tagX} onClick={() => setDocs((x) => x.filter((y) => y.name !== d.name))} aria-label={`Remove ${d.name}`}>×</button></span>)}
              </div>
            </div>
          )}
          <label className={s.field}>
            <span>Project <small className={s.muted}>(uses its instructions, notes and files)</small></span>
            <select className={s.input} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className={s.row}>
            <button type="submit" className={s.btnPrimary} data-orbit-fx="primary" disabled={running || !topic.trim()}>{running ? (research ? "Researching…" : "Reasoning…") : research ? "Start research" : "Analyse"}</button>
            {running ? <button type="button" className={s.btnGhost} data-orbit-fx="secondary" onClick={() => abort.current?.abort()}>Stop</button> : null}
          </div>
          <p className={s.muted}>{research ? "A full report usually takes one to three minutes and uses more credits than a normal question." : "Thorough analysis takes a minute or two. Documents stay in this request; nothing is shared."}</p>
          {history.length ? (
            <div className={s.history}>
              <h2 className={s.h2}>History</h2>
              <ul className={s.list}>
                {history.slice(0, 20).map((h) => (
                  <li key={h.id}>
                    <button type="button" className={s.linkBtn} onClick={() => void open(h.id)}>{h.title}</button>
                    <span className={s.muted}>{new Date(h.createdAt).toLocaleDateString()}</span>
                    <button type="button" className={s.iconBtn} onClick={() => void remove(h.id)} aria-label={`Delete ${h.title}`}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>

        <section className={s.panel} aria-live="polite" aria-busy={running}>
          {err ? <p className={s.error} role="alert">{err}</p> : null}
          {note ? <p className={s.muted} role="status">{note}</p> : null}
          {running && !live.text ? (
            <div className={s.progress}>
              <p className={s.h2}>{live.stage || (research ? "Planning the research…" : "Thinking it through…")}</p>
              {live.queries.length ? <ol className={s.queries}>{live.queries.map((q, i) => <li key={i}>{q}</li>)}</ol> : null}
              {live.models.length ? <p className={s.muted}>{live.models.map((m) => `${m.name} ${m.status}`).join(" · ")}</p> : null}
              {live.sources.length ? <p className={s.muted}>{live.sources.length} pages read</p> : null}
            </div>
          ) : null}
          {shownText ? (
            <article className={s.report}>
              {report ? (
                <header className={s.reportHead}>
                  <h2 className={s.reportTitle}>{report.title}</h2>
                  <div className={s.row}>
                    {report.id ? <a className={s.btnGhost} data-orbit-fx="secondary" href={`/api/business/reports/${encodeURIComponent(report.id)}?format=md`}>Download</a> : null}
                    {projectId ? <button type="button" className={s.btnGhost} data-orbit-fx="secondary" onClick={() => void fileToProject()}>Save to project</button> : null}
                  </div>
                </header>
              ) : null}
              <div className={s.prose}>
                <Markdown source={shownText} streaming={running} caret={running} cite={citeRenderer(shownSources)} />
              </div>
              {shownSources.length ? (
                <div className={s.sources}>
                  <h3 className={s.h2}>Sources</h3>
                  <ol>{shownSources.map((x) => <li key={x.n} value={x.n}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a> <span className={s.muted}>{x.host}</span></li>)}</ol>
                </div>
              ) : null}
              {report?.consensus ? <p className={s.muted}>{report.consensus}</p> : null}
            </article>
          ) : !running ? <p className={s.muted}>{research ? "Your report appears here, with the searches Keplar ran and every page it read." : "Your decision report appears here."}</p> : null}
        </section>
      </div>
    </div>
  );
}
