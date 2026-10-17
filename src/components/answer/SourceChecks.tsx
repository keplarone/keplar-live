import Link from "next/link";
import type { SourceClaim, Sourcing } from "@/lib/orchestration/types";
import s from "./SourceChecks.module.css";

const SUPPORT: Record<SourceClaim["support"], { glyph: string; label: string }> = {
  supported: { glyph: "✓", label: "Supported by pages found" },
  contradicted: { glyph: "✕", label: "Contradicted by pages found" },
  unsettled: { glyph: "~", label: "Pages found don't settle it" },
  no_source: { glyph: "–", label: "No source found" },
};

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/**
 * Verified answers (BETA). Shows a per-claim support state and links ONLY for a check that really ran and returned pages (state checked /
 * no_sources). Every other state is one quiet line saying why nothing was checked. No hooks: usable in server pages (shared answers) and the app.
 */
export function SourceChecks({ sourcing, shared = false }: { sourcing: Sourcing; shared?: boolean }) {
  const ran = sourcing.state === "checked" || sourcing.state === "no_sources";
  if (!ran) {
    return (
      <p className={s.quiet} data-source-checks={sourcing.state} role="note">
        <strong>Source check:</strong> {sourcing.note}
        {sourcing.state === "free_plan" && !shared ? <> <Link href="/pricing">See plans</Link></> : null}
      </p>
    );
  }
  return (
    <section className={s.root} aria-label="Source check" data-source-checks={sourcing.state}>
      <h4 className={s.head}>
        <span>Source check</span>
      </h4>
      <p className={s.note}>{sourcing.note}</p>
      {sourcing.claims.length ? (
        <ul className={s.claims}>
          {sourcing.claims.map((c, i) => (
            <li key={i} className={s.claim} data-support={c.support}>
              <span className={s.state}>
                <span aria-hidden="true" className={s.glyph}>{SUPPORT[c.support].glyph}</span> {SUPPORT[c.support].label}
                {c.sources.length && (c.support === "supported" || c.support === "contradicted") ? (
                  <span className={s.count}> · {c.sources.length} {c.sources.length === 1 ? "page" : "pages"}</span>
                ) : null}
              </span>
              <span className={s.text}>{c.text}</span>
              {c.finding ? <span className={s.finding}>{c.finding}</span> : null}
              {c.sources.length ? (
                <ul className={s.links} aria-label="Pages found">
                  {c.sources.map((x) => (
                    <li key={x.url}>
                      <a href={x.url} target="_blank" rel="nofollow ugc noopener noreferrer">{x.title}</a> <span className={s.host}>{host(x.url)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={s.foot}>
        Checked{sourcing.checkedAt ? ` ${sourcing.checkedAt.slice(0, 10)}` : ""} with live web search{sourcing.engine ? ` (${sourcing.engine})` : ""}. Keplar picks up to 3 key claims from the answer and a model judges each against the pages returned. A supporting page is evidence, not proof; other claims in the answer were not checked.
      </p>
    </section>
  );
}
