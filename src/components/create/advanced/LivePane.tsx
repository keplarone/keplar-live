"use client";
/**
 * Live: the shared session. Files (with who is in each, what changed, critic marks), the CodeMirror editor with everyone's
 * caret, the live preview, and the shared terminal. Click someone's avatar to follow their file and scroll position; Esc stops.
 * The instant critic pass (rules only, in this browser, no credits) re-runs as anyone types and marks lines in the gutter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Finding } from "@/lib/critic/types";
import { Editor } from "./Editor";
import { InviteDialog } from "./InviteDialog";
import { Terminal, type TermHooks } from "./Terminal";
import { siteSrcDoc } from "./live-preview";
import type { LiveSession, Peer } from "./useLiveSession";
import s from "./advanced.module.css";
import { Button, SegmentedControl } from "@/components/kit";

export type OpenRequest = { file: string; line?: number; at: number };

const STATUS_TEXT = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…", offline: "Offline" } as const;
const MAX_FACES = 6;

export function LivePane({ session, toast, request, onOpenCritic, onDeployed, onSaved, fullHref }: {
  session: LiveSession;
  toast: (t: string) => void;
  /** Open a file (and line) from outside, e.g. "Show in editor" on a critic finding. */
  request?: OpenRequest | null;
  onOpenCritic?: () => void;
  onDeployed?: () => void;
  onSaved?: (version: number) => void;
  /** When embedded in the App studio: link to the full-screen session. */
  fullHref?: string;
}) {
  const { info, status, synced, peers, doc, awareness, files, filesVer, following, follow, setLocal, can } = session;
  const [picked, setFile] = useState<string | null>(null);
  const [jump, setJump] = useState<{ line: number; at: number; select?: boolean } | null>(null);
  const [preview, setPreview] = useState(true);
  const [view, setView] = useState<"code" | "preview">("code");
  const [termOpen, setTermOpen] = useState(true);
  const [invite, setInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);

  // Small screens start with the terminal folded so the editor gets the height.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the viewport, which only exists after mount
  useEffect(() => { if (window.matchMedia("(max-width: 980px)").matches) setTermOpen(false); }, []);

  const readOnly = !can("edit");
  const isApp = info?.site.kind === "app";
  const changed = files.filter((f) => f.changed).length;

  // follow mode shows the leader's file; otherwise the file you picked (or the first one once the doc arrives)
  const leader = following !== null ? peers.find((p) => p.clientId === following) ?? null : null;
  const mine = picked && files.some((f) => f.path === picked) ? picked : files[0]?.path ?? null;
  const file = leader?.file && files.some((f) => f.path === leader.file) ? leader.file : mine;
  const leaderView = leader?.viewport ?? 0;
  const followJump = useMemo(() => (leaderView ? { line: leaderView, at: leaderView } : null), [leaderView]);

  useEffect(() => { if (file) setLocal({ file }); }, [file, setLocal]);

  const openFile = useCallback((path: string, line?: number, opts: { keepFollow?: boolean } = {}) => {
    if (!opts.keepFollow && following !== null) follow(null);
    setFile(path);
    if (line) setJump({ line, at: Date.now(), select: true });
    setView("code");
  }, [follow, following]);

  // requests from other tabs (critic "Show in editor")
  const lastReq = useRef(0);
  useEffect(() => {
    if (!request || request.at === lastReq.current) return;
    lastReq.current = request.at;
    openFile(request.file, request.line);
  }, [request, openFile]);

  useEffect(() => {
    if (following === null) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") follow(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [following, follow]);

  // instant critic pass over the live files, a moment after the typing stops
  useEffect(() => {
    if (!doc || !filesVer) return;
    let dead = false;
    const t = setTimeout(async () => {
      const { runRules } = await import("@/lib/critic/engine");
      if (dead) return;
      try { setFindings(runRules(session.liveFilesNow(), { kind: isApp ? "app" : "site", name: info?.site.name })); } catch { /* a rule crash never blocks editing */ }
    }, 900);
    return () => { dead = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesVer, doc]);

  // the preview follows the file contents: apps reload their signed live draft (not on the first sync, the frame just loaded
  // it), sites re-render in this browser
  const firstVer = useRef<number | null>(null);
  useEffect(() => {
    if (!doc || !filesVer) return;
    if (isApp && firstVer.current === null) { firstVer.current = filesVer; return; }
    const t = setTimeout(() => {
      if (isApp) setFrameKey((k) => k + 1);
      else setSrcDoc(siteSrcDoc(session.liveFilesNow(), file && /\.html?$/.test(file) ? file : "index.html"));
    }, isApp ? 1600 : 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesVer, doc, isApp]);

  const issuesBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of findings) if (f.severity === "critical" || f.severity === "major") m.set(f.file, (m.get(f.file) ?? 0) + 1);
    return m;
  }, [findings]);

  const others = peers.filter((p) => !p.me);
  const here = others.filter((p) => p.file === file);

  async function save() {
    setSaving(true);
    try {
      const r = await session.save();
      session.say([{ kind: "ok", text: `Saved v${r.version} · ${r.changed.length} file${r.changed.length === 1 ? "" : "s"}` }]);
      toast(`Saved as v${r.version}.`);
      onSaved?.(r.version);
    } catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  }
  async function pull() {
    try { const room = await session.pull(); toast(`The session is on v${room.base}.`); } catch (e) { toast((e as Error).message); }
  }

  const hooks: TermHooks = {
    open: (f, line) => openFile(f, line),
    preview: () => { setFrameKey((k) => k + 1); setSrcDoc(siteSrcDoc(session.liveFilesNow(), "index.html")); setView("preview"); },
    critic: () => onOpenCritic?.(),
    invite: () => setInvite(true),
    deployed: () => onDeployed?.(),
    toast,
  };

  if (!info) return null;
  const tone = status === "offline" ? "err" : undefined;

  return (
    <div className={s.root}>
      <div className={s.bar}>
        <span className={s.liveDot} data-s={status} role="status">{STATUS_TEXT[status]}{status === "live" && !synced ? " · catching up" : ""}</span>
        <Faces peers={peers} following={following} onFollow={(p) => follow(following === p.clientId ? null : p.clientId)} />
        <span className={s.roleTag}>{info.me.roleName}</span>
        <span className={s.baseTag}>On <b>v{session.base}</b>{changed ? ` · ${changed} unsaved file${changed === 1 ? "" : "s"}` : ""}</span>
        <span className={s.grow} />
        {fullHref ? <a className={s.linkBtn} href={fullHref}>Full screen</a> : null}
        <Button variant="secondary" size="sm" className={s.wideOnly} onClick={() => setPreview((p) => !p)} aria-pressed={preview}>{preview ? "Hide preview" : "Show preview"}</Button>
        {can("invite") ? <Button variant="secondary" size="sm" onClick={() => setInvite(true)}>Invite</Button> : null}
        {can("save") ? <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !changed || !synced}>{saving ? "Saving…" : "Save version"}</Button> : null}
      </div>

      {status === "offline" ? (
        <div className={s.banner} data-tone={tone} role="alert">
          <span className={s.grow}>The live connection is closed. Your edits stay in this tab until it reconnects.</span>
          <Button variant="secondary" size="sm" onClick={session.reconnect}>Reconnect</Button>
        </div>
      ) : null}
      {info.room.behind ? (
        <div className={s.banner}>
          <span className={s.grow}>v{info.room.head} was saved outside this session. Pull moves everyone onto it{changed ? " and replaces the unsaved live edits" : ""}.</span>
          {can("edit") ? <Button variant="secondary" size="sm" onClick={() => void pull()}>Pull v{info.room.head}</Button> : null}
        </div>
      ) : null}
      {leader ? (
        <div className={s.banner} data-tone="person" style={{ "--who": leader.color } as React.CSSProperties}>
          <span className={s.grow}>Following <b>{leader.name}</b>{leader.file ? ` in ${leader.file}` : ""}. Press Esc or open a file to stop.</span>
          <Button variant="secondary" size="sm" onClick={() => follow(null)}>Stop following</Button>
        </div>
      ) : null}
      {readOnly ? <div className={s.banner} data-tone="quiet"><span className={s.grow}>You are watching as a viewer: cursors, terminal and preview update live. Ask an owner for an editor link to type.</span></div> : null}

      <div className={s.mobileSwitch}>
        <SegmentedControl label="Show" size="sm" value={view} onValueChange={setView} options={[{ value: "code", label: "Code" }, { value: "preview", label: "Preview" }]} />
      </div>

      <div className={s.split} data-preview={preview ? "on" : "off"} data-view={view}>
        <nav className={s.tree} aria-label="Files">
          <div className={s.treeHead}><span>Files</span><span>{files.length}</span></div>
          {files.map((f) => {
            const inFile = others.filter((p) => p.file === f.path);
            const n = issuesBy.get(f.path);
            return (
              <button key={f.path} type="button" className={s.file} aria-current={f.path === file} onClick={() => openFile(f.path)} title={`${f.path}${f.changed ? " · changed since v" + session.base : ""}${n ? ` · ${n} critic issue${n === 1 ? "" : "s"}` : ""}`}>
                <span className={s.fileName}>{f.path}</span>
                {inFile.length ? <span className={s.dots} aria-label={`${inFile.map((p) => p.name).join(", ")} here`}>{inFile.slice(0, 3).map((p) => <i key={p.clientId} className={s.dot} style={{ background: p.color }} />)}</span> : null}
                {n ? <span className={s.fileIssues}>{n}</span> : null}
                {f.changed ? <span className={s.fileMod} aria-label="changed" /> : null}
              </button>
            );
          })}
        </nav>

        <section className={s.editorCol} aria-label="Editor">
          <div className={s.editorHead}>
            <span className={s.crumb}>{file ?? "…"}</span>
            {readOnly ? <span>read-only</span> : null}
            <span className={s.grow} />
            {here.length ? <span className={s.here}>{here.slice(0, 4).map((p) => <i key={p.clientId} className={s.dot} style={{ background: p.color }} title={`${p.name}${p.line ? `, line ${p.line}` : ""}`} />)}<span>{here.length === 1 ? `${here[0].name.split(/[\s@]/)[0]} is here` : `${here.length} people here`}</span></span> : null}
            {findings.length ? <Button variant="ghost" size="sm" onClick={() => onOpenCritic?.()}>{findings.filter((f) => f.file === file).length} in this file · Critic</Button> : null}
          </div>
          {doc && awareness && file ? (
            <Editor key={`${file}:${readOnly}`} doc={doc} awareness={awareness} path={file} readOnly={readOnly} findings={findings} jump={leader ? followJump : jump}
              onCursor={(line) => setLocal({ line })} onViewport={(viewport) => setLocal({ viewport })} />
          ) : <div className={s.editor}><p className={s.editorEmpty}>{status === "offline" ? "Not connected." : "Loading the session…"}</p></div>}
        </section>

        {preview || view === "preview" ? (
          <section className={s.previewCol} aria-label="Live preview">
            <div className={s.editorHead}>
              <span>Live preview</span>
              <span className={s.grow} />
              <Button variant="ghost" size="sm" onClick={hooks.preview}>Reload</Button>
              {isApp && info.livePreview ? <a className={s.quiet} href={info.livePreview} target="_blank" rel="noopener">Open</a> : null}
            </div>
            {isApp && info.livePreview ? (
              <iframe key={frameKey} className={s.previewFrame} src={info.livePreview} title="Live preview" sandbox="allow-scripts allow-forms allow-popups allow-modals" />
            ) : srcDoc !== null ? (
              <iframe className={s.previewFrame} srcDoc={srcDoc} title="Live preview" sandbox="allow-scripts allow-forms allow-popups allow-modals" />
            ) : <p className={s.editorEmpty}>The preview appears once the files arrive.</p>}
          </section>
        ) : null}
      </div>

      <Terminal session={session} hooks={hooks} open={termOpen} onToggle={() => setTermOpen((o) => !o)} readOnly={readOnly} />
      {invite ? <InviteDialog siteId={info.site.id} siteName={info.site.name} teamNote={info.me.via === "team" ? "People on your team already have access through their team role." : null} onClose={() => setInvite(false)} toast={toast} /> : null}
    </div>
  );
}

function Faces({ peers, following, onFollow }: { peers: Peer[]; following: number | null; onFollow: (p: Peer) => void }) {
  const shown = peers.slice(0, MAX_FACES);
  return (
    <div className={s.people} aria-label={`${peers.length} ${peers.length === 1 ? "person" : "people"} in this session`}>
      {shown.map((p) => (
        <button
          key={p.clientId}
          type="button"
          className={s.avatar}
          style={{ background: p.color }}
          data-me={p.me}
          data-following={following === p.clientId}
          disabled={p.me}
          onClick={() => onFollow(p)}
          title={`${p.name}${p.me ? " (you)" : ""} · ${p.role}${p.file ? ` · ${p.file}${p.line ? `:${p.line}` : ""}` : ""}${p.tab && p.tab !== "live" ? ` · on ${p.tab}` : ""}${p.me ? "" : following === p.clientId ? " · click to stop following" : " · click to follow"}`}
          aria-label={p.me ? `${p.name} (you)` : `${following === p.clientId ? "Stop following" : "Follow"} ${p.name}`}
        >
          {p.initials}
        </button>
      ))}
      {peers.length > MAX_FACES ? <span className={s.more}>+{peers.length - MAX_FACES}</span> : null}
    </div>
  );
}
