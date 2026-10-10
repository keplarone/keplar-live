import { agentsCopy } from "@/lib/sections";
import { SectionHeader } from "./SectionHeader";
import { AgentTimeline } from "./AgentTimeline";
import s from "./Agents.module.css";

/** Overnight timeline, then the controls that bound it. */
export function Agents({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  // One level under the section title, so /agents (title is the page h1) does not jump h1 -> h3.
  const Sub = headingLevel === "h1" ? "h2" : "h3";
  return (
    <section className={s.section} aria-labelledby="agents-title">
      <div className={s.inner}>
        <SectionHeader tone="attention" id="agents-title" as={headingLevel} label={agentsCopy.label} title={agentsCopy.title} lede={agentsCopy.lede} align="split" />

        <div className={s.night}>
          <AgentTimeline />
        </div>

        <div className={s.controls}>
          <div className={s.controlsCopy}>
            <Sub className={s.controlsTitle}>{agentsCopy.controlsTitle}</Sub>
            <p className={s.controlsLede}>{agentsCopy.controlsLede}</p>
            <ul className={s.list}>
              {agentsCopy.controls.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>

          <figure className={s.panel} aria-label="Example agent control panel">
            <figcaption className={s.panelHead}>
              <span className={s.panelTitle}>Competitor monitor</span>
              <span className={s.running}>
                <i aria-hidden="true" />
                Running
              </span>
            </figcaption>
            <dl className={s.panelRows}>
              {agentsCopy.panel.map((row) => (
                <div key={row.label} className={s.panelRow} data-status={"status" in row ? row.status : undefined}>
                  <dt>{row.label}</dt>
                  <dd>
                    <span className={s.value}>
                      {row.value}
                      {"of" in row ? <span className={s.of}> / {row.of}</span> : null}
                    </span>
                    {"ratio" in row && typeof row.ratio === "number" ? (
                      <span className={s.meter} aria-hidden="true">
                        <span style={{ width: `${Math.round(row.ratio * 100)}%` }} />
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
            <div className={s.panelActions} aria-hidden="true">
              <span className={s.approve}>Review deployment</span>
              <span className={s.stop}>Emergency stop</span>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
