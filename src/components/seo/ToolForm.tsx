"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/kit";

type Item = { path: string; label: string; intent: string };
type Kind = "model" | "citation" | "browse";

export function ToolForm({ slug, kind, items = [] }: { slug: string; kind: Kind; items?: Item[] }) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [authors, setAuthors] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [container, setContainer] = useState("");
  const [url, setUrl] = useState("");
  const [style, setStyle] = useState("apa");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.label} ${item.intent}`.toLowerCase().includes(q));
  }, [items, query]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOutput("");
    setBusy(true);
    try {
      const payload = kind === "citation"
        ? { citation: { style, authors, title, year, container, url } }
        : { text };
      const res = await fetch(`/api/tools/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !data.text) setError(data.error || "The tool did not answer.");
      else setOutput(data.text);
    } catch {
      setError("The request did not finish. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (kind === "browse") {
    return (
      <form onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="tool-filter" style={{ display: "block", marginBottom: "var(--s-2)" }}>Filter by name</label>
        <input id="tool-filter" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ChatGPT, Poe, council" style={{ width: "100%", maxWidth: "28rem" }} />
        <ul style={{ listStyle: "disc", paddingLeft: "1.25em" }}>
          {shown.map((item) => (
            <li key={item.path}><a href={item.path}>{item.label}</a> — {item.intent}</li>
          ))}
        </ul>
        {shown.length === 0 ? <p>No page on this list matches that.</p> : null}
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {kind === "citation" ? (
        <div style={{ display: "grid", gap: "var(--s-3)", maxWidth: "36rem" }}>
          <label>Style
            <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ display: "block", marginTop: "var(--s-1)" }}>
              <option value="apa">APA</option>
              <option value="mla">MLA</option>
              <option value="chicago">Chicago</option>
            </select>
          </label>
          <label>Authors<input value={authors} onChange={(e) => setAuthors(e.target.value)} required style={{ display: "block", width: "100%", marginTop: "var(--s-1)" }} /></label>
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ display: "block", width: "100%", marginTop: "var(--s-1)" }} /></label>
          <label>Year<input value={year} onChange={(e) => setYear(e.target.value)} style={{ display: "block", width: "100%", marginTop: "var(--s-1)" }} /></label>
          <label>Site or publication<input value={container} onChange={(e) => setContainer(e.target.value)} style={{ display: "block", width: "100%", marginTop: "var(--s-1)" }} /></label>
          <label>URL<input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" style={{ display: "block", width: "100%", marginTop: "var(--s-1)" }} /></label>
        </div>
      ) : (
        <label htmlFor="tool-text" style={{ display: "block" }}>
          Your text
          <textarea id="tool-text" value={text} onChange={(e) => setText(e.target.value)} required rows={8} maxLength={4000} style={{ display: "block", width: "100%", marginTop: "var(--s-2)" }} />
        </label>
      )}
      <div style={{ marginTop: "var(--s-4)" }}>
        <Button type="submit" variant="primary" loading={busy}>{busy ? "Working" : "Run"}</Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {output ? <pre style={{ whiteSpace: "pre-wrap" }} aria-live="polite">{output}</pre> : null}
    </form>
  );
}
