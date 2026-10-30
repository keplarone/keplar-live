"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./workspace.module.css";

type ProjectCard = { id: string; name: string; createdAt: string; counts: { notes: number; files: number; chats: number } };
type Detail = {
  project: { id: string; name: string; instructions: string; memoryOn: boolean; createdAt: string; updatedAt: string };
  notes: { id: string; text: string; updatedAt: string }[];
  files: { id: string; name: string; chars: number; truncated: boolean; createdAt: string }[];
  chats: { id: string; title: string; updatedAt: string }[];
};
type Task = { id: string; title: string; status: "todo" | "doing" | "done"; due: string | null; createdAt: string };

const STATUS_LABEL = { todo: "To do", doing: "Doing", done: "Done" } as const;
const NEXT = { todo: "doing", doing: "done", done: "todo" } as const;
const TEXT_TYPES = ".txt,.md,.csv,.json,.html,.css,.js,.ts,.tsx,.py,.sql,.yaml,.yml,.xml,.log";
const MAX_FILE_CHARS = 400_000;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error ?? "That didn't work. Try again.");
  return d as T;
}

function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<ProjectCard[] | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    call<{ projects: ProjectCard[] }>("/api/projects").then((d) => { if (live) setList(d.projects.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }).catch((e: Error) => { if (live) { setErr(e.message); setList([]); } });
    return () => { live = false; };
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const d = await call<{ project: { id: string } }>("/api/projects", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      onOpen(d.project.id);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't create the project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.h1}>Projects</h1>
          <p className={s.muted}>Workspaces for one piece of work: instructions, tasks, files and notes together.</p>
        </div>
      </header>
      <form className={s.inline} onSubmit={(e) => void create(e)}>
        <label className={s.srOnly} htmlFor="new-project">New project name</label>
        <input spellCheck={false} id="new-project" className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="New project, e.g. Q4 launch" maxLength={80} />
        <button type="submit" className={s.btnPrimary} data-orbit-fx="primary" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create project"}</button>
      </form>
      {err ? <p className={s.error} role="alert">{err}</p> : null}
      {list === null ? <span className={s.skel} /> : list.length === 0 ? <p className={s.muted}>No projects yet. Create one above.</p> : (
        <ul className={s.cards}>
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className={s.card} onClick={() => onOpen(p.id)}>
                <strong>{p.name}</strong>
                <span className={s.muted}>{p.counts.files} files · {p.counts.notes} notes · {p.counts.chats} chats</span>
                <span className={s.muted}>Created {new Date(p.createdAt).toLocaleDateString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectPage({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [detail, t] = await Promise.all([call<Detail>(`/api/projects/${encodeURIComponent(id)}`), call<{ tasks: Task[] }>(`/api/business/tasks?projectId=${encodeURIComponent(id)}`)]);
      setD(detail);
      setInstructions(detail.project.instructions);
      setTasks(t.tasks);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load this project.");
    }
  }, [id]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const saveInstructions = async () => {
    setSaved("saving");
    try {
      await call(`/api/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ instructions }) });
      setSaved("saved");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
      setSaved("idle");
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    try {
      const r = await call<{ task: Task }>("/api/business/tasks", { method: "POST", body: JSON.stringify({ projectId: id, title: taskTitle, due: taskDue || undefined }) });
      setTasks((t) => [...t, r.task]);
      setTaskTitle("");
      setTaskDue("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't add the task.");
    }
  };
  const cycleTask = async (t: Task) => {
    const status = NEXT[t.status];
    setTasks((xs) => xs.map((x) => (x.id === t.id ? { ...x, status } : x)));
    await call(`/api/business/tasks/${encodeURIComponent(t.id)}`, { method: "PATCH", body: JSON.stringify({ status }) }).catch(() => setTasks((xs) => xs.map((x) => (x.id === t.id ? t : x))));
  };
  const removeTask = async (t: Task) => {
    setTasks((xs) => xs.filter((x) => x.id !== t.id));
    await call(`/api/business/tasks/${encodeURIComponent(t.id)}`, { method: "DELETE" }).catch(() => setTasks((xs) => [...xs, t]));
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr("");
    for (const f of [...files].slice(0, 10)) {
      try {
        const raw = await f.text();
        const text = raw.slice(0, MAX_FILE_CHARS);
        await call(`/api/projects/${encodeURIComponent(id)}/files`, { method: "POST", body: JSON.stringify({ name: f.name, text, truncated: raw.length > MAX_FILE_CHARS }) });
      } catch (e) {
        setErr(`${f.name}: ${e instanceof Error ? e.message : "couldn't be added."}`);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
    void load();
  };
  const removeFile = async (fileId: string) => {
    await call(`/api/projects/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }).catch((e: Error) => setErr(e.message));
    void load();
  };

  if (!d) return <div className={s.page}>{err ? <p className={s.error} role="alert">{err}</p> : <span className={s.skel} />}</div>;
  const counts = { todo: tasks.filter((t) => t.status === "todo").length, doing: tasks.filter((t) => t.status === "doing").length, done: tasks.filter((t) => t.status === "done").length };

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <button type="button" className={s.linkBtn} onClick={onBack}>← All projects</button>
          <h1 className={s.h1}>{d.project.name}</h1>
          <p className={s.muted}>{counts.todo} to do · {counts.doing} doing · {counts.done} done · {d.files.length} files</p>
        </div>
      </header>
      {err ? <p className={s.error} role="alert">{err}</p> : null}
      <div className={s.cols}>
        <section className={s.panel} aria-labelledby="tasks-h">
          <h2 id="tasks-h" className={s.h2}>Tasks</h2>
          <form className={s.inline} onSubmit={(e) => void addTask(e)}>
            <label className={s.srOnly} htmlFor="task-title">New task</label>
            <input id="task-title" className={s.input} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Add a task" maxLength={200} />
            <label className={s.srOnly} htmlFor="task-due">Due date</label>
            <input id="task-due" className={s.input} data-narrow="" type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
            <button type="submit" className={s.btnGhost} data-orbit-fx="secondary" disabled={!taskTitle.trim()}>Add</button>
          </form>
          {tasks.length ? (
            <ul className={s.tasks}>
              {tasks.map((t) => (
                <li key={t.id} data-status={t.status}>
                  <button type="button" className={s.status} data-status={t.status} onClick={() => void cycleTask(t)} aria-label={`${t.title}: ${STATUS_LABEL[t.status]}. Change status`}>{STATUS_LABEL[t.status]}</button>
                  <span className={s.taskTitle}>{t.title}</span>
                  {t.due ? <span className={s.muted}>Due {new Date(`${t.due}T00:00:00`).toLocaleDateString()}</span> : null}
                  <button type="button" className={s.iconBtn} onClick={() => void removeTask(t)} aria-label={`Delete task ${t.title}`}>×</button>
                </li>
              ))}
            </ul>
          ) : <p className={s.muted}>No tasks yet.</p>}
        </section>
        <section className={s.panel} aria-labelledby="ins-h">
          <h2 id="ins-h" className={s.h2}>Instructions</h2>
          <p className={s.muted}>What Keplar should know when it works in this project.</p>
          <label className={s.srOnly} htmlFor="ins">Project instructions</label>
          <textarea id="ins" className={s.textarea} rows={6} value={instructions} onChange={(e) => { setInstructions(e.target.value); setSaved("idle"); }} maxLength={4000} />
          <div className={s.row}>
            <button type="button" className={s.btnGhost} data-orbit-fx="secondary" onClick={() => void saveInstructions()} disabled={saved === "saving" || instructions === d.project.instructions && saved !== "idle"}>{saved === "saving" ? "Saving…" : "Save"}</button>
            {saved === "saved" ? <span className={s.muted} role="status">Saved</span> : null}
          </div>
        </section>
        <section className={s.panel} aria-labelledby="files-h">
          <div className={s.panelHead}>
            <h2 id="files-h" className={s.h2}>Files</h2>
            <input ref={fileRef} type="file" accept={TEXT_TYPES} multiple hidden onChange={(e) => void upload(e.target.files)} />
            <button type="button" className={s.btnGhost} data-orbit-fx="secondary" onClick={() => fileRef.current?.click()}>Add files</button>
          </div>
          {d.files.length ? (
            <ul className={s.list}>{d.files.map((f) => <li key={f.id}><span>{f.name}</span><span className={s.muted}>{Math.round(f.chars / 1000)}k characters{f.truncated ? " (shortened)" : ""}</span><button type="button" className={s.iconBtn} onClick={() => void removeFile(f.id)} aria-label={`Remove ${f.name}`}>×</button></li>)}</ul>
          ) : <p className={s.muted}>Text files Keplar can read: documents, data, code.</p>}
        </section>
        <section className={s.panel} aria-labelledby="notes-h">
          <h2 id="notes-h" className={s.h2}>Notes</h2>
          {d.notes.length ? <ul className={s.list}>{d.notes.map((x) => <li key={x.id}><span className={s.note}>{x.text}</span></li>)}</ul> : <p className={s.muted}>Notes Keplar saves while you work appear here.</p>}
        </section>
      </div>
    </div>
  );
}

export function Projects({ projectId, onOpen }: { projectId: string | null; onOpen: (id: string | null) => void }) {
  return projectId ? <ProjectPage key={projectId} id={projectId} onBack={() => onOpen(null)} /> : <ProjectList onOpen={(id) => onOpen(id)} />;
}
