import { Agents } from "@/components/sections/Agents";
import { FinalCta } from "@/components/sections/FinalCta";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import s from "@/components/sections/sections.module.css";

export const metadata = pageMeta(
  "/agents",
  "Autonomous AI agents with spend caps",
  "Keplar agents keep working after you close the tab, with hard spend caps, human approval gates, and a full audit log. Autonomy without losing control.",
);

export default function AgentsPage() {
  return (
    <>
      <div style={{ paddingTop: "var(--s-16)" }}>
        <Agents headingLevel="h1" />
      </div>
      <section className={s.section} aria-labelledby="agents-how">
        <div className={`${s.inner} ${s.prose}`}>
          <h2 id="agents-how">What an agent is allowed to do is up to you</h2>
          <p>
            An agent on Keplar Business is a long-running task with a goal, a budget, and a set of tools it is permitted to use.
            It researches, builds, and prepares changes on its own, and it stops at the limits you set.
          </p>
          <h2>Consequential actions wait for a person</h2>
          <p>
            Production deployments, payments, and anything irreversible sit behind approval gates. The agent prepares the change,
            explains it, and waits. If something looks wrong, escalate, roll back, or use the emergency stop.
          </p>
          <h2>Everything is on the record</h2>
          <p>
            Each action is written to an audit log with what was done and why. Secrets are isolated from models and prompts, and
            work runs in a sandbox. See <Link href="/enterprise">For business</Link> for company-wide controls, or{" "}
            <Link href="/pricing">compare plans</Link>. Agents are part of Business; for everyday questions, see{" "}
            <Link href="/for-you">for you</Link>.
          </p>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
