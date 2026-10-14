"use client";
/**
 * The shared terminal. Everyone in the session sees every command and its output, live, attributed and timestamped (it is a
 * Y.Array in the same CRDT document). Commands run with the permissions of whoever types them.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ndjson } from "../api";
import type { TermKind } from "@/lib/collab/doc";
import type { Deploy } from "@/lib/deploy/machine";
import type { LiveSession } from "./useLiveSession";
import s from "./advanced.module.css";
import { Button } from "@/components/kit";

type Out = { kind: TermKind; text: string };
export type TermHooks = { open: (file: string, line?: number) => void; preview: () => void; critic: () => void; invite: () => void; deployed: () => void; toast: (t: string) => void };

const HELP: [string, string][] = [
  ["help", "this list"],
  ["who", "who is here, where they are, who follows whom"],
  ["ls", "files in the session (● = changed since the base version)"],
  ["open <file>[:line]", "open a file for yourself"],
  ["grep <text>", "search every file"],
  ["follow <name> | unfollow", "follow someone's file and scroll position (Esc stops)"],
  ["check", "instant critic pass on the live files (rules only, no credits)"],
  ["critic", "full critic run: rules, axe-core in Chromium, design review"],
  ["diff", "what changed since the base version"],
  ["save [message]", "save the session as a new version, credited to everyone editing"],
  ["pull", "move the session onto the newest saved version"],
  ["split", "split off: your own copy of the session as it is now"],
  ["deploy [vN]", "deploy a version to the live URL (default: newest)"],
  ["rollback vN", "put a version that was live before back live, instantly"],
  ["preview", "reload the live preview"],
  ["invite", "invite someone by link"],
  ["clear", "clear your view of the log"],
];
const COMMANDS = HELP.map(([c]) => c.split(/[\s|]/)[0]).concat(["unfollow"]);

const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

export function Terminal({ session, hooks, open, onToggle, readOnly = false }: { session: LiveSession; hooks: TermHooks; open: boolean; onToggle: () => void; /** Viewers watch the log; they have no prompt (their writes would not reach anyone). */ readOnly?: boolean }) {
  const { term, info, peers, files } = session;
  const [cut, setCut] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => { const i = cut ? term.findIndex((l) => l.id === cut) : -1; return i >= 0 ? term.slice(i + 1) : term; }, [term, cut]);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [shown.length, open]);

  const me = info?.me;
  const who = me ? (me.name.split(/[\s@]/)[0] || "you").toLowerCase() : "you";
  const can = session.can;

  async function run(raw: string) {
    const line = raw.trim();
    if (!line) return;
    setHist((h) => [line, ...h.filter((x) => x !== line)].slice(0, 50));
    setHi(-1);
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(" ");
    const out: Out[] = [];
    const emit = (o: Out[] | Out) => session.say(Array.isArray(o) ? o : [o]);
    // Everyone sees the command line; personal commands (open, follow, clear) only change the typer's own view.
    if (cmd !== "clear") session.say([{ kind: "cmd", text: line }]);
    try {
      setBusy(true);
      switch (cmd) {
        case "help":
          for (const [c, d] of HELP) out.push({ kind: "out", text: `${c.padEnd(26)} ${d}` });
          break;
        case "who":
          for (const p of peers) {
            const f = p.following != null ? peers.find((x) => x.clientId === p.following) : null;
            out.push({ kind: "out", text: `${p.me ? "*" : " "} ${p.name} (${p.role})${p.file ? ` · ${p.file}${p.line ? `:${p.line}` : ""}` : ""}${p.tab && p.tab !== "live" ? ` · on ${p.tab}` : ""}${f ? ` · following ${f.name}` : ""}` });
          }
          if (!peers.length) out.push({ kind: "out", text: "Just you." });
          break;
        case "ls":
          for (const f of files) out.push({ kind: "out", text: `${f.changed ? "●" : " "} ${f.path.padEnd(32)} ${(f.size / 1024).toFixed(1).padStart(6)} KB` });
          break;
        case "open": {
          const [p, ln] = arg.split(":");
          const hit = files.find((f) => f.path === p) ?? files.find((f) => f.path.endsWith(p));
          if (!hit) { out.push({ kind: "err", text: `No file “${p}”. Try ls.` }); break; }
          hooks.open(hit.path, Number(ln) || undefined);
          break;
        }
        case "grep": {
          if (!arg) { out.push({ kind: "err", text: "Usage: grep <text>" }); break; }
          const all = session.liveFilesNow();
          let n = 0;
          for (const [p, text] of Object.entries(all)) {
            text.split("\n").forEach((l, i) => { if (n < 40 && l.toLowerCase().includes(arg.toLowerCase())) { n++; out.push({ kind: "out", text: `${p}:${i + 1}: ${l.trim().slice(0, 120)}` }); } });
          }
          out.push({ kind: n ? "ok" : "warn", text: n ? `${n}${n === 40 ? "+" : ""} match${n === 1 ? "" : "es"}` : "No matches." });
          break;
        }
        case "follow": {
          const p = peers.find((x) => !x.me && x.name.toLowerCase().startsWith(arg.toLowerCase()));
          if (!p) { out.push({ kind: "err", text: arg ? `Nobody called “${arg}” is here. Try who.` : "Usage: follow <name>" }); break; }
          session.follow(p.clientId);
          out.push({ kind: "sys", text: `following ${p.name}` });
          break;
        }
        case "unfollow":
          session.follow(null);
          break;
        case "check": {
          const { runRules, buildReport } = await import("@/lib/critic/engine");
          const live = session.liveFilesNow();
          const t = performance.now();
          const findings = runRules(live);
          const rep = buildReport({ id: "local", workspaceId: "", siteId: info?.site.id ?? "", version: session.base, createdAt: new Date().toISOString(), live: true }, live, findings, { static: { rules: 0, ms: Math.round(performance.now() - t) } });
          out.push({ kind: rep.score >= 85 ? "ok" : rep.score >= 70 ? "warn" : "err", text: `${rep.score}/100 · ${rep.grade} · ${rep.findings.length} finding${rep.findings.length === 1 ? "" : "s"} in ${Math.round(performance.now() - t)} ms` });
          for (const f of rep.findings.slice(0, 8)) out.push({ kind: f.severity === "critical" ? "err" : f.severity === "major" ? "warn" : "out", text: `${f.file}:${f.line}  ${f.title}` });
          if (rep.findings.length > 8) out.push({ kind: "out", text: `…and ${rep.findings.length - 8} more. Run critic for the full review with fixes.` });
          break;
        }
        case "critic":
          hooks.critic();
          out.push({ kind: "sys", text: "opened the Critic on the live session" });
          break;
        case "diff": {
          const r = await api<{ room: { changed: { path: string; added: number; removed: number; status: string }[]; base: number } }>(`/api/collab/${info!.site.id}`);
          if (!r.room.changed.length) out.push({ kind: "out", text: `No changes since v${r.room.base}.` });
          for (const c of r.room.changed) out.push({ kind: c.status === "removed" ? "err" : c.status === "added" ? "ok" : "out", text: `${c.status.padEnd(9)} ${c.path.padEnd(30)} +${c.added} −${c.removed}` });
          break;
        }
        case "save": {
          if (!can("save")) { out.push({ kind: "err", text: "Viewers can't save. Ask an editor." }); break; }
          const r = await session.save(arg || undefined);
          out.push({ kind: "ok", text: `Saved v${r.version} · ${r.changed.length} file${r.changed.length === 1 ? "" : "s"} · ${r.changed.map((c) => c.path).slice(0, 4).join(", ")}` });
          break;
        }
        case "pull": {
          if (!can("edit")) { out.push({ kind: "err", text: "Viewers can't pull." }); break; }
          const r = await session.pull();
          out.push({ kind: "ok", text: `Session is on v${r.base}.` });
          break;
        }
        case "split": {
          if (!can("split")) { out.push({ kind: "err", text: "Viewers can't split off." }); break; }
          const r = await session.split();
          out.push({ kind: "ok", text: `Split off as “${r.site.name}” → /app/create/live/${r.site.id}` });
          break;
        }
        case "deploy":
        case "rollback": {
          if (!can("deploy")) { out.push({ kind: "err", text: "Only owners and admins can deploy." }); break; }
          const n = Number(arg.replace(/^v/i, "")) || undefined;
          if (cmd === "rollback" && !n) { out.push({ kind: "err", text: "Usage: rollback vN" }); break; }
          if (session.files.some((f) => f.changed) && !n) emit({ kind: "warn", text: "Unsaved live edits are not part of a deploy. Run save first to include them." });
          const seen = new Map<string, string>();
          let last: Deploy | null = null;
          for await (const ev of ndjson(`/api/deploy/${info!.site.id}`, { version: n })) {
            if (ev.t === "error") { emit({ kind: "err", text: String(ev.error) }); break; }
            const d = ev.deploy as Deploy;
            last = d;
            for (const st of d.steps) {
              if (seen.get(st.id) === st.state || st.state === "pending") continue;
              seen.set(st.id, st.state);
              if (st.state === "running") continue;
              const tail = st.lines[st.lines.length - 1]?.text;
              emit({ kind: st.state === "ok" ? "ok" : st.state === "failed" ? "err" : st.state === "warn" ? "warn" : "out", text: `${st.label.padEnd(22)} ${st.state}${tail ? ` · ${tail}` : ""}` });
            }
          }
          if (last?.status === "live") { out.push({ kind: "ok", text: `v${last.version} is live → ${last.url}` }); hooks.deployed(); }
          else if (last?.error) out.push({ kind: "err", text: last.error });
          break;
        }
        case "preview":
          hooks.preview();
          break;
        case "invite":
          if (!can("invite")) { out.push({ kind: "err", text: "Only owners and admins can invite." }); break; }
          hooks.invite();
          break;
        case "clear":
          setCut(term[term.length - 1]?.id ?? null);
          break;
        default:
          out.push({ kind: "err", text: `Unknown command “${cmd}”. Type help.` });
      }
    } catch (e) {
      out.push({ kind: "err", text: (e as Error).message || "That didn't work." });
    } finally {
      setBusy(false);
    }
    if (out.length) emit(out);
  }

  function complete() {
    const parts = value.split(/\s+/);
    if (parts.length === 1) {
      const m = COMMANDS.filter((c) => c.startsWith(parts[0]));
      if (m.length === 1) setValue(`${m[0]} `);
      return;
    }
    const last = parts[parts.length - 1];
    const pool = parts[0] === "follow" ? peers.filter((p) => !p.me).map((p) => p.name.split(" ")[0]) : files.map((f) => f.path);
    const m = pool.filter((x) => x.toLowerCase().startsWith(last.toLowerCase()));
    if (m.length === 1) setValue([...parts.slice(0, -1), m[0]].join(" ") + " ");
  }

  return (
    <section className={s.term} data-open={open} aria-label="Shared terminal">
      <div className={s.termHead}>
        <strong>Terminal</strong>
        <span>shared · {peers.length} {peers.length === 1 ? "person" : "people"} see this</span>
        <span className={s.grow} />
        <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={open}>{open ? "Hide" : "Show"}</Button>
      </div>
      {open ? (
        <>
          <div className={s.termLog} ref={logRef} role="log" aria-live="polite">
            {shown.length === 0 ? <div className={s.tl} data-k="sys"><span className={s.tlAt} /><span /><span className={s.tlText}>{readOnly ? "Commands editors run appear here, live." : "Commands typed here run for everyone to see. Type help."}</span></div> : null}
            {shown.map((l) => (
              <div key={l.id} className={s.tl} data-k={l.kind}>
                <span className={s.tlAt}>{hhmm(l.at)}</span>
                <span className={s.tlBy} style={{ color: l.color }}>{l.kind === "cmd" ? l.by : ""}</span>
                <span className={s.tlText}>{l.text}</span>
              </div>
            ))}
          </div>
          {readOnly ? <p className={s.termIn}><span className={s.dim}>Viewers watch the terminal. Editors and owners can type commands.</span></p> : <form className={s.termIn} onSubmit={(e) => { e.preventDefault(); const v = value; setValue(""); void run(v); }}>
            <span className={s.prompt} style={{ color: me?.color }}>{who}</span>
            <span className={s.dim}>{busy ? "…" : "›"}</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab") { e.preventDefault(); complete(); }
                else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(hist.length - 1, hi + 1); if (n >= 0) { setHi(n); setValue(hist[n]); } }
                else if (e.key === "ArrowDown") { e.preventDefault(); const n = hi - 1; setHi(Math.max(-1, n)); setValue(n >= 0 ? hist[n] : ""); }
              }}
              placeholder="help · who · check · save · deploy"
              aria-label="Terminal command"
              autoComplete="off"
              spellCheck={false}
            />
          </form>}
        </>
      ) : null}
    </section>
  );
}
