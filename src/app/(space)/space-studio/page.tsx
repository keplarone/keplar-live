import { MODELS, PLANS, PRICING_NOTE, publicView } from "@/lib/space-studio/core";
import { DownloadButton } from "@/components/space/DownloadButton";
import { RotatingWord } from "@/components/space/SpaceChrome";
import { pageMeta } from "@/lib/seo";
import s from "@/components/space/space.module.css";

export const metadata = {
  ...pageMeta(
    "/space-studio",
    "Space Studio by Keplar: AI for Roblox Studio and Blender",
    "Space Studio is Keplar's desktop app for Roblox Studio and Blender development, with four AI models: Orbit 3.8, Nebula 4.2, Solar 5.4 and Nova 5.5.",
  ),
  icons: { icon: "/icons/space-studio.png", apple: "/icons/space-studio.png" },
};

const PLAN_IDS = ["free", "plus", "pro", "team", "enterprise"] as const;

export default function SpaceStudioPage() {
  const models = MODELS.map((m) => publicView(m, true));
  return (
    <>
      <section id="top" className={s.hero} aria-labelledby="space-title">
        <span className={`${s.badge} ${s.rise}`}><span className={s.badgeNew}>New</span>Space Studio 0.2 for Windows, macOS and Linux</span>
        <h1 id="space-title" className={`${s.title} ${s.rise}`} aria-label="Powerful AI made specifically for what you want.">
          <RotatingWord className={s.swap} wordClassName={s.swapWord} /> AI made specifically for what <em className={s.you}>YOU</em> want.
        </h1>
        <p className={`${s.lede} ${s.rise}`}>
          A desktop app for Roblox Studio and Blender development. You pick the model, review every proposed change before it lands, and can hand long jobs to Roblox Cloud and Blender Cloud.
        </p>
        <div className={`${s.actions} ${s.rise}`}>
          <DownloadButton className={s.btn} />
          <a className={s.btnGhost} href="#models">See the models</a>
        </div>
        <p className={`${s.note} ${s.rise}`}>
          Version 0.2 is an early release. Installers are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper will warn (on macOS: right-click the app, then Open). Each release lists SHA-256 checksums.
        </p>
        <span className={s.scrollCue} aria-hidden="true" />
      </section>

      <section id="models" className={s.section} aria-labelledby="models-title">
        <div className={s.wrap}>
          <div className={s.head} data-reveal>
            <div>
              <span className={s.label}>01 · Models</span>
              <h2 id="models-title" className={s.h2}>Four models, one job each</h2>
            </div>
            <p className={s.sub}>
              Orbit, Nebula, Solar and Nova each have their own instructions, tools and budgets, set up for a different kind of Roblox and Blender work.
            </p>
          </div>
          <div className={s.grid} data-reveal-stagger data-reveal>
            {models.map((m) => (
              <article key={m.id} className={s.cell}>
                <span className={s.cellVersion}>Version {m.version}</span>
                <h3 className={s.cellTitle}>{m.name}</h3>
                <p className={s.cellTag}>{m.tagline}</p>
                <ul className={s.plain}>{m.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className={s.cellMeta}>{m.creditNote} · from {PLANS[m.minPlan].name.replace("Space Studio ", "")}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className={s.section} aria-labelledby="plans-title">
        <div className={s.wrap}>
          <div className={s.head} data-reveal>
            <div>
              <span className={s.label}>02 · Plans</span>
              <h2 id="plans-title" className={s.h2}>Plans</h2>
            </div>
            <p className={s.sub}>{PRICING_NOTE}</p>
          </div>
          <div className={s.rows} data-reveal-stagger data-reveal>
            {PLAN_IDS.map((p) => (
              <div key={p} className={s.row}>
                <h3 className={s.rowName}>{PLANS[p].name}</h3>
                <p className={s.rowText}>
                  <span className={s.rowLabel}>Models</span>
                  {PLANS[p].models.map((id) => MODELS.find((m) => m.id === id)!.name).join(", ")}
                </p>
                <p className={s.rowText}>
                  <span className={s.rowLabel}>Cloud</span>
                  {PLANS[p].cloud
                    ? `Roblox Cloud and Blender Cloud: up to ${PLANS[p].maxConcurrentCloudJobs} jobs at once, ${PLANS[p].cloudMinutesMonthly.toLocaleString("en-US")} minutes a month`
                    : "No Roblox Cloud or Blender Cloud (requires Pro or above)"}
                  {PLANS[p].team ? ". Shared team workspace" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="today" className={s.section} aria-labelledby="today-title">
        <div className={s.wrap}>
          <div className={s.head} data-reveal>
            <div>
              <span className={s.label}>03 · Status</span>
              <h2 id="today-title" className={s.h2}>What 0.1 does today</h2>
            </div>
          </div>
          <ul className={s.status} data-reveal-stagger data-reveal>
            <li>Chat with Orbit, Nebula, Solar or Nova in Roblox and Blender workspaces. Each reply shows which model answered and what it cost.</li>
            <li>Connect your Roblox account through Roblox&apos;s official sign-in. Your password is never asked for or stored.</li>
            <li>Account &amp; Security: linked accounts, signed-in devices, data export and account deletion.</li>
            <li>Coming next: Solar Smart game research, the creator dashboard, a Studio plugin and a local Blender runner.</li>
          </ul>
        </div>
      </section>

      <section id="arrive" className={s.closing} aria-label="Download">
        <div className={s.wrap} data-reveal>
          <h2 className={s.closingTitle}>Space Studio</h2>
          <div className={s.actions}>
            <DownloadButton className={s.btn} />
          </div>
        </div>
      </section>
    </>
  );
}
