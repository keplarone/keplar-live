import { Montserrat } from "next/font/google";
import { MODELS, PLANS, PRICING_NOTE, publicView } from "@/lib/space-studio/core";
import { pageMeta } from "@/lib/seo";
import s from "./space-studio.module.css";

// Montserrat is SIL OFL; next/font downloads it at build time and serves it from keplar.one.
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata = pageMeta(
  "/space-studio",
  "Space Studio by Keplar: AI for Roblox Studio and Blender",
  "Space Studio is Keplar's desktop app for Roblox Studio and Blender development, with four Claude-based models: Orbit 3.8, Nebula 4.2, Solar 5.4 and Nova 5.5.",
);

const RELEASES = "https://github.com/keplarone/space-studio/releases/latest";

export default function SpaceStudioPage() {
  const models = MODELS.map((m) => publicView(m, true));
  return (
    <div className={`${s.page} ${montserrat.className}`}>
      <section className={s.hero}>
        <p className={s.kicker}>Keplar · Space Studio</p>
        <h1 className={s.title}>Build Roblox games and Blender assets with AI that knows both.</h1>
        <p className={s.lede}>
          A desktop app for Roblox Studio and Blender development. You pick the model, review every proposed change before it lands, and can hand long jobs to Roblox Cloud and Blender Cloud.
        </p>
        <div className={s.actions}>
          <a className={s.primary} href={RELEASES}>Download for Windows, macOS or Linux</a>
          <a className={s.secondary} href="#models">See the models</a>
        </div>
        <p className={s.note}>
          Version 0.1 is an early release. Installers are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper will warn (on macOS: right-click the app, then Open). Each release lists SHA-256 checksums.
        </p>
      </section>

      <section id="models" className={s.section}>
        <h2 className={s.h2}>Four models, one job each</h2>
        <p className={s.sub}>
          Orbit, Nebula, Solar and Nova are Space Studio configurations built on Anthropic Claude: each has its own instructions, tools and budgets. They are not fine-tuned, and their version numbers are Space Studio&apos;s own, not Anthropic&apos;s.
        </p>
        <div className={s.grid}>
          {models.map((m) => (
            <article key={m.id} className={s.card}>
              <h3 className={s.cardTitle}>{m.name}</h3>
              <p className={s.tagline}>{m.tagline}</p>
              <ul className={s.list}>{m.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
              <p className={s.meta}>Runs on {m.underlyingModel} · {m.creditNote} · from {PLANS[m.minPlan].name.replace("Space Studio ", "")}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="plans" className={s.section}>
        <h2 className={s.h2}>Plans</h2>
        <p className={s.sub}>{PRICING_NOTE}</p>
        <div className={s.grid}>
          {(["free", "plus", "pro", "team", "enterprise"] as const).map((p) => (
            <article key={p} className={s.card}>
              <h3 className={s.cardTitle}>{PLANS[p].name}</h3>
              <ul className={s.list}>
                <li>Models: {PLANS[p].models.map((id) => MODELS.find((m) => m.id === id)!.name).join(", ")}</li>
                <li>{PLANS[p].cloud ? `Roblox Cloud and Blender Cloud: up to ${PLANS[p].maxConcurrentCloudJobs} jobs at once, ${PLANS[p].cloudMinutesMonthly.toLocaleString("en-US")} minutes a month` : "No Roblox Cloud or Blender Cloud (requires Pro or above)"}</li>
                {PLANS[p].team && <li>Shared team workspace</li>}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={s.section}>
        <h2 className={s.h2}>What 0.1 does today</h2>
        <ul className={s.list}>
          <li>Chat with Orbit, Nebula, Solar or Nova in Roblox and Blender workspaces. Each reply shows which model answered and what it cost.</li>
          <li>Connect your Roblox account through Roblox&apos;s official sign-in. Your password is never asked for or stored.</li>
          <li>Account &amp; Security: linked accounts, signed-in devices, data export and account deletion.</li>
          <li>Coming next: Solar Smart game research, the creator dashboard, a Studio plugin and a local Blender runner.</li>
        </ul>
      </section>
    </div>
  );
}
