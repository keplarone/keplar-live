"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { IconEdit, IconPlus } from "./icons";
import type { AppState, Project, Thread } from "./state/types";
import { SiteProjects } from "./SiteProjects";
import { ProjectTimeline } from "./ProjectTimeline";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { AgentsPanel } from "./AgentsPanel";
import { activeScopeHeaders } from "./state/scope";
import s from "./views.module.css";
import { Button, IconButton, SegmentedControl } from "@/components/kit";
import { DeleteConfirm, DeleteTrigger } from "./delete/DeleteChat";

function Header({ title, lede, children }: { title: string; lede: string; children?: React.ReactNode }) {
  return (
    <header className={s.viewHead}>
      <div>
        <h1 className={s.viewTitle}>{title}</h1>
        <p className={s.viewLede}>{lede}</p>
      </div>
      {children ? <div className={s.viewActions}>{children}</div> : null}
    </header>
  );
}

function groupByDate(threads: Thread[]) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: { label: string; items: Thread[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const t of threads) {
    const g = t.updatedAt >= start ? 0 : t.updatedAt >= start - day ? 1 : t.updatedAt >= start - 7 * day ? 2 : 3;
    groups[g].items.push(t);
  }
  return groups.filter((g) => g.items.length);
}

const preview = (t: Thread) => {
  const k = [...t.messages].reverse().find((m) => m.role === "keplar" && m.answer);
  const md = k && k.role === "keplar" ? k.answer!.markdown : "";
  return md.replace(/[#*`|>_-]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
};

export function HistoryView({ state, signedIn, onRename, onOpen, onDelete, onMove, initialQuery }: { state: AppState; signedIn: boolean; onRename: (id: string, title: string) => void; onOpen: (id: string) => void; onDelete: (id: string) => void; onMove: (id: string, projectId: string | null) => void; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [askId, setAskId] = useState<string | null>(null);
  const uid = useId();
  const project = state.projects.find((p) => p.id === state.projectFilter) ?? null;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.threads.filter(
      (t) =>
        (!project || t.projectId === project.id) &&
        (!needle || t.title.toLowerCase().includes(needle) || t.messages.some((m) => (m.role === "user" ? m.text : m.answer?.markdown ?? "").toLowerCase().includes(needle))),
    );
  }, [q, state.threads, project]);
  const groups = groupByDate(filtered);

  return (
    <div className={s.view} data-hue="reasoning">
      <Header title={project ? project.name : "All chats"} lede={project ? "Chats in this project." : signedIn ? "Your chats are saved to your account. Rename or delete any of them." : "Every chat on this device, stored locally in your browser. Sign in to save them to your account."}>
        <div className={s.viewSearch}>
          <label htmlFor={`${uid}-q`} className="visually-hidden">Filter threads</label>
          <input id={`${uid}-q`} className={s.textInput} placeholder="Filter threads" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        </div>
      </Header>
      {groups.length === 0 ? (
        <p className={s.viewEmpty}>{q ? "No threads match." : "No threads yet. Ask Keplar something to start one."}</p>
      ) : (
        groups.map((g) => (
          <section key={g.label} className={s.group} aria-labelledby={`${uid}-${g.label}`}>
            <h2 id={`${uid}-${g.label}`} className={s.groupLabel}>{g.label}</h2>
            <ul className={s.rows}>
              {g.items.map((t) => (
                <li key={t.id} className={s.rowItem}>
                  {askId === t.id ? (
                    <DeleteConfirm
                      title={t.title}
                      onCancel={() => { setAskId(null); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-delete-for="${CSS.escape(t.id)}"]`)?.focus()); }}
                      onConfirm={() => { setAskId(null); onDelete(t.id); }}
                    />
                  ) : (<>
                  {editing === t.id ? (
                    <form className={s.rowMain} onSubmit={(e) => { e.preventDefault(); const n = draft.trim(); if (n) onRename(t.id, n); setEditing(null); }}>
                      <label htmlFor={`${uid}-rn`} className="visually-hidden">Chat name</label>
                      <input id={`${uid}-rn`} className={s.textInput} value={draft} maxLength={120} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} onBlur={() => setEditing(null)} />
                    </form>
                  ) : (
                    <button type="button" className={s.rowMain} onClick={() => onOpen(t.id)}>
                      <span className={s.rowTitle}>{t.title}</span>
                      <span className={s.rowMeta}>{t.remote ? "Saved in your account" : preview(t) || `${t.messages.filter((m) => m.role === "user").length} questions`}</span>
                    </button>
                  )}
                  <IconButton size="sm" className={s.rowAction} label={`Rename ${t.title}`} tooltip={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { setDraft(t.title); setEditing(t.id); }} icon={<IconEdit size={15} />} />
                  {state.projects.length ? (
                    <select
                      className={s.rowSelect}
                      aria-label={`Project for ${t.title}`}
                      value={t.projectId ?? ""}
                      onChange={(e) => onMove(t.id, e.target.value || null)}
                    >
                      <option value="">No project</option>
                      {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : null}
                  <DeleteTrigger title={t.title} id={t.id} onClick={() => setAskId(t.id)} />
                  </>)}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function ProjectsView({ state, signedIn, onCreate, onMerge, onRemoved, onChatsCleared, onOpenProject, onNewInProject, onOpenThread, onResumeSite, initialOpenId }: { state: AppState; signedIn: boolean; onCreate: (p: Project) => void; onMerge: (projects: Project[]) => void; onRemoved: (id: string, chats: "keep" | "delete") => void; onChatsCleared: (id: string) => void; onOpenProject: (id: string) => void; onNewInProject: (id: string) => void; onOpenThread: (id: string) => void; onResumeSite?: (id: string) => void; initialOpenId?: string }) {
  // "Open in Projects" from a chat card opens that project's workspace.
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  // Signed in: projects saved on the account show up on this device too (the server list is merged into the local one).
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void fetch("/api/projects", { cache: "no-store", headers: activeScopeHeaders() })
      .then(async (r) => (r.ok ? ((await r.json()) as { projects: { id: string; name: string; createdAt: string }[] }) : null))
      .then((j) => { if (live && j?.projects.length) onMerge(j.projects.map((p) => ({ id: p.id, name: p.name, createdAt: Date.parse(p.createdAt) || Date.now() }))); })
      .catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- merge once per sign-in
  }, [signedIn]);
  const openProject = state.projects.find((p) => p.id === openId);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"list" | "timeline">("list");
  const [error, setError] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const uid = useId();
  const needle = find.trim().toLowerCase();
  const projects = needle ? state.projects.filter((p) => p.name.toLowerCase().includes(needle)) : state.projects;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError("Name the project.");
    if (state.projects.some((p) => p.name.toLowerCase() === n.toLowerCase())) return setError("A project with that name exists.");
    const project = { id: `prj_${Date.now().toString(36)}`, name: n.slice(0, 60), createdAt: Date.now() };
    onCreate(project);
    if (signedIn) void fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json", ...activeScopeHeaders() }, body: JSON.stringify({ id: project.id, name: project.name }) }).catch(() => undefined);
    setName("");
    setError(null);
  };
  if (openProject) {
    return (
      <div className={s.view} data-hue="memory">
        <ProjectWorkspace
          projectId={openProject.id}
          name={openProject.name}
          signedIn={signedIn}
          onBack={() => setOpenId(null)}
          onNewChat={() => onNewInProject(openProject.id)}
          onOpenChat={onOpenThread}
          onOpenAllChats={() => onOpenProject(openProject.id)}
          onRemoved={(chats) => onRemoved(openProject.id, chats)}
          onChatsCleared={() => onChatsCleared(openProject.id)}
        />
      </div>
    );
  }
  return (
    <div className={s.view} data-hue="memory">
      <Header title="Projects" lede="Your sites, and workspaces that keep a project's chats, files, instructions and memory together.">
        <form className={s.inlineForm} onSubmit={submit} noValidate>
          <label htmlFor={`${uid}-name`} className="visually-hidden">Project name</label>
          <input
            id={`${uid}-name`}
            className={s.textInput}
            placeholder="New project name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            aria-invalid={!!error}
            aria-describedby={error ? `${uid}-err` : undefined}
            maxLength={60}
          />
          <Button type="submit" variant="primary" leadingIcon={<IconPlus size={14} />} data-orbit-icon="plus">
            Create project
          </Button>
          {error ? <p id={`${uid}-err`} className={s.fieldError}>{error}</p> : null}
        </form>
      </Header>
      <div className={s.toolbar}>
        <div className={s.viewSearch}>
          <label htmlFor={`${uid}-find`} className="visually-hidden">Search projects and sites</label>
          <input id={`${uid}-find`} type="search" className={s.textInput} placeholder="Search projects and sites" value={find} onChange={(e) => setFind(e.target.value)} />
        </div>
        {state.projects.length === 0 ? null : (
          <SegmentedControl label="View" size="sm" className={s.viewToggle} value={mode} onValueChange={setMode} options={[{ value: "list", label: "List" }, { value: "timeline", label: "Timeline" }]} />
        )}
      </div>
      {state.projects.length === 0 ? (
        <p className={s.viewEmpty}>No projects yet. Name one above to keep its chats, files and memory in one place.</p>
      ) : null}
      {state.projects.length > 0 && mode === "timeline" ? <ProjectTimeline state={state} onOpenThread={onOpenThread} /> : null}
      {state.projects.length === 0 || mode === "timeline" ? null : (
        <ul className={s.rows}>
          {projects.map((p) => {
            const n = state.threads.filter((t) => t.projectId === p.id).length;
            return (
              <li key={p.id} className={s.rowItem}>
                <button type="button" className={s.rowMain} onClick={() => onOpenProject(p.id)}>
                  <span className={s.rowTitle}>{p.name}</span>
                  <span className={s.rowMeta}>{n === 1 ? "1 thread" : `${n} threads`}</span>
                </button>
                <Button size="sm" variant="ghost" onClick={() => onNewInProject(p.id)}>New chat</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpenId(p.id)} aria-label={`Open the ${p.name} workspace: memory, files and instructions`}>Workspace</Button>
              </li>
            );
          })}
        </ul>
      )}
      {onResumeSite ? <SiteProjects query={find} onResume={onResumeSite} /> : null}
    </div>
  );
}

export function AgentsView({ onStart, signedIn, onOpenApprovals }: { onStart: () => void; signedIn: boolean; onOpenApprovals: () => void }) {
  return (
    <div className={s.view} data-hue="creation">
      <Header title="Agents" lede="Agents keep working after you close the tab, on a schedule you set, inside the limits of your plan. Anything that would leave Keplar waits for your approval.">
        <Button variant="primary" onClick={onStart} trailingIcon={<span aria-hidden="true">→</span>}>
          Draft an agent task
        </Button>
      </Header>
      <AgentsPanel signedIn={signedIn} onOpenApprovals={onOpenApprovals} />
    </div>
  );
}
