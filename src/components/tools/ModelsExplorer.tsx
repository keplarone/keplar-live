"use client";

import { useMemo, useState } from "react";
import type { ModelRow } from "@/lib/free-tools/explorer";
import s from "./tools.module.css";

/** Filterable roster table. Rows come from the server (the live catalog at build time). */
export function ModelsExplorer({ rows }: { rows: ModelRow[] }) {
  const [lane, setLane] = useState<"both" | "free" | "paid">("both");
  const [provider, setProvider] = useState("all");
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState(false);
  const [ctx, setCtx] = useState(0);
  const providers = useMemo(() => [...new Set(rows.map((r) => r.provider))].sort(), [rows]);
  const list = rows.filter((r) => (lane === "both" || r.lane === lane) && (provider === "all" || r.provider === provider) && (!open || r.openWeights) && (!images || r.images) && r.context >= ctx);
  return (
    <div>
      <div className={s.filters} role="group" aria-label="Filters">
        <label>Lane <select value={lane} onChange={(e) => setLane(e.target.value as typeof lane)}><option value="both">Free and paid</option><option value="free">Free plan</option><option value="paid">Paid plans</option></select></label>
        <label>Provider <select value={provider} onChange={(e) => setProvider(e.target.value)}><option value="all">All</option>{providers.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label>Context at least <select value={ctx} onChange={(e) => setCtx(Number(e.target.value))}><option value={0}>Any</option><option value={32_000}>32k</option><option value={128_000}>128k</option><option value={1_000_000}>1M</option></select></label>
        <label><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Open weights</label>
        <label><input type="checkbox" checked={images} onChange={(e) => setImages(e.target.checked)} /> Reads images</label>
      </div>
      <p className={s.meta}><span>{list.length} of {rows.length} models</span></p>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th scope="col">Model</th><th scope="col">Provider</th><th scope="col">Lane</th><th scope="col">Used as</th><th scope="col">Weights</th><th scope="col">Context</th><th scope="col">Reads</th><th scope="col">Picked for</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                <td>{r.provider}</td>
                <td>{r.lane === "free" ? "Free" : "Paid"}</td>
                <td>{r.role}</td>
                <td>{r.openWeights ? "Open" : "Hosted only"}</td>
                <td>{r.contextLabel}</td>
                <td>{[r.images ? "images" : "", r.video ? "video" : ""].filter(Boolean).join(", ") || "text"}</td>
                <td>{r.strengths.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
