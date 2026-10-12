"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BUSINESS_TIERS, listPriceFor, priceFor, usd, type BusinessTier } from "@/lib/business/tiers";
import { companySizes, estimatedUsers } from "@/lib/inquire/schema";
import { CommandDemo } from "./CommandDemo";
import { SignOutButton } from "./SignOutButton";
import { BusinessMark } from "./BusinessMark";
import s from "./business-site.module.css";

/** Keplar One (legal pages live there). Everything else is this app: the account API, /signin (the handoff from keplar.one), /account and /work. */
const APP = "https://keplar.one";
const ACCOUNT_API = "/api/business/account";

type DownloadFile = { os: string; arch: string; type: string; url: string; size: number };
type Status =
  | { state: "loading" }
  | { state: "out" }
  | { state: "in"; email: string | null; account: { company: string } | null; active: boolean; plan: { tier: BusinessTier | null; name: string } | null; download: { version: string; files: DownloadFile[]; notesUrl: string } | null };

const ORDER: BusinessTier[] = ["starter", "growth", "scale", "enterprise"];
const fmt = (n: number) => n.toLocaleString("en-US");
const accountUrl = (tier?: string) => `/account${tier ? `?tier=${tier}` : ""}`;

const MODULES = [
  { title: "Dashboard", body: "Revenue, agents, approvals, spend and team activity from the data you connect.", glyph: "▦" },
  { title: "Projects", body: "Workspaces with conversations, files, tasks, agents, research and creations together.", glyph: "▤" },
  { title: "Deep Research", body: "Multi-model research with sources, competitor and market analysis, exportable reports.", glyph: "◎" },
  { title: "Reason", body: "Upload documents and work through decisions with assumptions, calculations and risks shown.", glyph: "△" },
  { title: "Images and Videos", body: "Generate, edit and organize brand assets, then reuse them in sites and campaigns.", glyph: "◐" },
  { title: "Websites and apps", body: "Describe it, get a working project you can edit, version and deploy to your domain.", glyph: "⌘" },
  { title: "AI Design Canvas", body: "Design, code and AI modes on the same project, with previews and approved changes.", glyph: "◇" },
  { title: "Make an Agent", body: "Agents that run your workflows on a schedule, within budgets, asking before they act.", glyph: "◉" },
];

/** The capability strip under the hero: what the workspace does, not numbers about it. */
const TICKER = ["Deep Research · every claim cited", "Agents · schedules and budgets", "Approvals before anything goes out", "Create · sites and apps on your domain", "Reason · decisions with the math shown", "Audit log · every agent action recorded"];

/** How work moves through the workspace: from your data to an action you approved. */
const LOOP = [
  { n: "01", title: "Signal", body: "Your payments, site, inbox and connected apps feed the dashboard and the agents." },
  { n: "02", title: "Agents", body: "They run on schedules with a budget each, using several AI models on every task." },
  { n: "03", title: "Approval", body: "Anything that spends money or reaches customers waits for a person to approve it." },
  { n: "04", title: "Action", body: "Sent, published or deployed, and written to the audit log with what it cost." },
];

const GUARDRAILS = [
  { title: "Budgets per agent", body: "Each agent has its own spending limit; it stops when the limit is reached." },
  { title: "Approval before it acts", body: "Payments, emails to customers and deploys wait in Approvals." },
  { title: "One switch to pause", body: "Pause every agent at once from the workspace." },
  { title: "Full audit trail", body: "Who or what did each thing, when, and at what cost." },
];

const GUARD_STEPS = [
  { n: "01", title: "Explore", body: "Agents walk your app's signup, checkout, billing, cancellation and account recovery in real browsers." },
  { n: "02", title: "Screen", body: "Every report needs evidence: steps, screenshots and network log. Duplicates and guesses are dropped." },
  { n: "03", title: "Reproduce", body: "A separate agent replays each report in a clean session. Only failures it can repeat go forward." },
  { n: "04", title: "Patch", body: "For each confirmed bug, a proposed fix plus a regression test that fails before and passes after." },
  { n: "05", title: "Review", body: "A different reviewer checks every patch. Nothing merges or deploys without your approval." },
];

function osOf(ua: string): "windows" | "macos" | "linux" {
  if (/Mac/i.test(ua)) return "macos";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "windows";
}

function DownloadPanel({ download }: { download: NonNullable<Extract<Status, { state: "in" }>["download"]> }) {
  const [os] = useState(() => (typeof navigator === "undefined" ? "windows" : osOf(navigator.userAgent)));
  const label = (f: DownloadFile) => `${f.os === "windows" ? "Windows" : f.os === "macos" ? `macOS ${f.arch === "arm64" ? "(Apple silicon)" : "(Intel)"}` : `Linux (.${f.type})`}`;
  const sorted = [...download.files].sort((a, b) => Number(b.os === os) - Number(a.os === os));
  return (
    <div className={s.downloads}>
      {sorted.map((f, i) => (
        <a key={f.url} href={f.url} className={i === 0 ? s.btnPrimary : s.btnGhost} rel="noopener">
          Download for {label(f)}
          <span className={s.btnMeta}>{Math.round(f.size / 1048576)} MB</span>
        </a>
      ))}
      <a href={download.notesUrl} className={s.textLink} rel="noopener">Version {download.version} release notes</a>
    </div>
  );
}

/** The status strip at the very top: the product's name, its stage, the platforms and the visitor's own clock. */
function SystemBar() {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const show = () => setClock(new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }));
    show();
    const t = window.setInterval(show, 15_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className={s.sysbar}>
      <span className={s.sysItem}><span className={s.live} aria-hidden="true" />Keplar Business</span>
      <span className={s.sysItem} data-hide-sm="">Early access</span>
      <span className={s.sysItem} data-hide-sm="">Windows · macOS · Linux</span>
      <span className={s.grow} />
      <span className={s.sysItem} aria-hidden="true">{clock ? `Local ${clock}` : ""}</span>
    </div>
  );
}

export function Storefront() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [purchased] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("purchased") === "1");
  // A sign-in handoff that failed (src/lib/business/handoff.ts) lands here with ?signin=<reason>.
  const [signinFailed] = useState(() => typeof window !== "undefined" && Boolean(new URLSearchParams(window.location.search).get("signin")));

  useEffect(() => {
    let live = true;
    fetch(ACCOUNT_API, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { signedIn: false }))
      .then((d) => {
        if (!live) return;
        setStatus(d.signedIn ? { state: "in", email: d.email ?? null, account: d.account ?? null, active: Boolean(d.active), plan: d.plan ?? null, download: d.download ?? null } : { state: "out" });
      })
      .catch(() => { if (live) setStatus({ state: "out" }); });
    return () => { live = false; };
  }, []);

  const price = (tier: BusinessTier) => {
    if (tier === "enterprise") return null;
    const was = listPriceFor(tier);
    return { now: usd(priceFor(tier)), was: was === null ? null : usd(was), note: "per month" };
  };

  const hero = useMemo(() => {
    if (status.state === "loading") return null;
    if (status.state === "out") return { href: accountUrl(), label: "Create a business account", sub: "Sign in with your Keplar account, then add your company." };
    if (status.active && status.download) return null;
    if (status.active) return { href: "#download", label: "Download Keplar Business", sub: "" };
    if (!status.account) return { href: accountUrl(), label: "Create your business account", sub: `Signed in as ${status.email ?? "you"}.` };
    return { href: "#pricing", label: "Choose a plan", sub: `${status.account.company} is set up. Pick a plan to download the desktop app.` };
  }, [status]);

  return (
    <div className={s.frame}>
      <SystemBar />
      <div className={s.page}>
        <header className={s.nav}>
          <Link href="/" className={s.brand} aria-label="Keplar Business home">
            <BusinessMark size={26} />
            <span className={s.wordmark}>Keplar <span>Business</span></span>
          </Link>
          <nav className={s.navLinks} aria-label="Sections">
            <a href="#product">Product</a>
            <a href="#control">How it runs</a>
            <a href="#pricing">Pricing</a>
            <a href="#revenue-guard">Revenue Guard</a>
            <a href="#contact">Contact sales</a>
          </nav>
          {status.state === "out" ? <a href={`/signin?next=${encodeURIComponent("/work")}`} className={s.btnGhostSm}>Sign in</a>
            : status.state === "in" ? (
              <span className={s.navAccount}>
                {status.active ? <Link href="/work" className={s.btnGhostSm}>Open workspace</Link> : <span className={s.who} title={status.email ?? undefined}>{status.account?.company ?? status.email}</span>}
                <SignOutButton email={status.email} />
              </span>
            ) : <span />}
        </header>

        <section className={s.hero}>
          <div className={s.heroCopy}>
            <span className={s.overline}>{"The AI operating system for your business"}</span>
            <h1 className={s.h1}>Run the whole company <span className={s.glow}>from one command center.</span></h1>
            <p className={s.lede}>Research, design, build, automate and deploy from one workspace. Several AI models work on every task, your agents run on schedules and budgets, and nothing that spends money or ships to customers happens without approval.</p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /signin is a route handler (the sign-in handoff from keplar.one): it needs a full page load */}
            {signinFailed && status.state === "out" ? <p className={s.notice} role="status">That sign-in didn&apos;t finish (the link expired or was opened in a different browser). <a href="/signin?next=%2Fwork" className={s.textLink}>Sign in again</a></p> : null}
            {purchased && !(status.state === "in" && status.active) ? <p className={s.notice} role="status">Thanks for your purchase. Your plan activates as soon as the payment confirms, usually within a minute. Refresh this page to see your download.</p> : null}
            {status.state === "in" && status.active ? (
              <div id="download" className={s.downloadBox}>
                <p className={s.downloadTitle}><span className={s.live} aria-hidden="true" />{status.plan?.name ?? "Keplar Business"} is active{status.account ? ` for ${status.account.company}` : ""}.</p>
                <div className={s.heroActions}><Link href="/work" className={s.btnPrimary}>Open workspace</Link></div>
                {status.download ? <DownloadPanel download={status.download} /> : <p className={s.muted}>The download is loading. If it does not appear, try again in a minute.</p>}
                <p className={s.muted}>Sign in to the desktop app with {status.email ?? "the same account"}.</p>
              </div>
            ) : hero ? (
              <div className={s.heroActions}>
                <a href={hero.href} className={s.btnPrimary}>{hero.label} <span aria-hidden="true">→</span></a>
                <a href="#contact" className={s.btnGhost}>Talk to sales</a>
                {hero.sub ? <p className={s.muted}>{hero.sub}</p> : null}
              </div>
            ) : <div className={s.heroActions} aria-hidden="true"><span className={s.skeleton} /></div>}
            <dl className={s.heroFacts}>
              <div><dt>Plans</dt><dd>Monthly, from {usd(priceFor("starter"))}</dd></div>
              <div><dt>Desktop app</dt><dd>Windows, macOS, Linux</dd></div>
              <div><dt>Approvals</dt><dd>On by default</dd></div>
            </dl>
          </div>
          <CommandDemo />
        </section>
      </div>

      <div className={s.ticker}>
        <ul className={s.tickerTrack}>
          {TICKER.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>

      <div className={s.page}>
        <section id="product" className={s.section} aria-labelledby="product-h">
          <div className={s.sectionHead}>
            <div>
              <span className={s.overline}>{"System modules"}</span>
              <h2 id="product-h" className={s.h2}>Everything your team does with AI, <span className={s.dim}>in one place.</span></h2>
            </div>
            <span className={s.badge}><span className={s.live} aria-hidden="true" />{MODULES.length} modules in every plan</span>
          </div>
          <ul className={s.modules}>
            {MODULES.map((m, i) => (
              <li key={m.title} className={s.module}>
                <div className={s.moduleTop}><span className={s.moduleIndex}>{String(i + 1).padStart(2, "0")}</span><span className={s.moduleGlyph} aria-hidden="true">{m.glyph}</span></div>
                <h3>{m.title}</h3>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="control" className={s.section} aria-labelledby="control-h">
          <div className={s.sectionHead}>
            <div>
              <span className={s.overline}>{"The control loop"}</span>
              <h2 id="control-h" className={s.h2}>Agents do the work. <span className={s.dim}>You stay in command.</span></h2>
            </div>
          </div>
          <ol className={s.loop}>
            {LOOP.map((x) => <li key={x.n} className={s.loopNode}><span className={s.stepN}>{x.n}</span><h3>{x.title}</h3><p>{x.body}</p></li>)}
          </ol>
          <ul className={s.guardrails}>
            {GUARDRAILS.map((g) => <li key={g.title}><span className={s.guardMark} aria-hidden="true">✓</span><div><h3>{g.title}</h3><p>{g.body}</p></div></li>)}
          </ul>
        </section>

        <section id="pricing" className={s.section} aria-labelledby="pricing-h">
          <div className={s.sectionHead}>
            <div><span className={s.overline}>{"Plans for your next stage"}</span><h2 id="pricing-h" className={s.h2}>One workspace. Room to grow.</h2></div><a href="#plan-comparison" className={s.textLink}>Compare every limit <span aria-hidden="true">↓</span></a>
          </div>
          <p className={s.muted}>Every plan includes every Business module. Higher plans add seats, agents, usage and governance. Usage limits are shown in full and enforced in your account.</p>
          <div className={s.plans}>
            {ORDER.map((id) => {
              const t = BUSINESS_TIERS[id];
              const p = price(id);
              const current = status.state === "in" && status.active && status.plan?.tier === id;
              return (
                <article key={id} className={s.plan} data-featured={id === "growth" || undefined}>
                  <header className={s.planHeader}>
                    <div className={s.planLabel}><span className={s.planIndex} aria-hidden="true">{String(ORDER.indexOf(id) + 1).padStart(2, "0")}</span>{id === "growth" ? <span className={s.planPill}>For growing teams</span> : null}</div>
                    <h3 className={s.planName}>{t.name.replace("Keplar Business ", "")}</h3>
                    <p className={s.planFor}>{t.audience}</p>
                  </header>
                  <p className={s.price}>{p ? <>{p.was ? <s className={s.priceWas} aria-label={`Was ${p.was}`}>{p.was}</s> : null}<span className={s.priceBig}>{p.now}</span><span className={s.priceNote}>{p.note}</span></> : <><span className={s.priceBig}>Custom</span><span className={s.priceNote}>custom contract</span></>}</p>
                  {current ? <span className={s.btnGhost} aria-current="true">Your plan</span>
                    : id === "enterprise" ? <a href="#contact" className={s.btnGhost}>Contact sales</a>
                    : <a href={accountUrl(id)} className={id === "growth" ? s.btnPrimary : s.btnGhost}>Choose {t.name.replace("Keplar Business ", "")}</a>}
                  <dl className={s.planMetrics}>
                    <div><dt>Seats</dt><dd>{t.seats === null ? "Custom" : fmt(t.seats)}</dd></div>
                    <div><dt>AI credits / month</dt><dd>{t.credits === null ? "Custom" : fmt(t.credits)}</dd></div>
                    <div><dt>Active agents</dt><dd>{t.activeAgents === null ? "Custom" : fmt(t.activeAgents)}</dd></div>
                  </dl>
                  <details className={s.planDetails}><summary>Everything included <span aria-hidden="true">+</span></summary><ul className={s.planList}>{t.includes.map((x) => <li key={x}>{x}</li>)}</ul></details>
                </article>
              );
            })}
          </div>
          <div id="plan-comparison" className={s.limitsWrap} role="region" aria-label="Compare Business plan limits" tabIndex={0}>
            <table className={s.limits}>
              <caption className={s.srOnly}>Plan limits</caption>
              <thead><tr><th scope="col">Included each month</th>{ORDER.map((id) => <th key={id} scope="col">{BUSINESS_TIERS[id].name.replace("Keplar Business ", "").replace("Keplar ", "")}</th>)}</tr></thead>
              <tbody>
                <tr><th scope="row">Seats</th>{ORDER.map((id) => <td key={id}>{BUSINESS_TIERS[id].seats === null ? "Negotiated" : fmt(BUSINESS_TIERS[id].seats!)}</td>)}</tr>
                <tr><th scope="row">Active agents</th>{ORDER.map((id) => <td key={id}>{BUSINESS_TIERS[id].activeAgents === null ? "Negotiated" : fmt(BUSINESS_TIERS[id].activeAgents!)}</td>)}</tr>
                <tr><th scope="row">Automation actions</th>{ORDER.map((id) => <td key={id}>{BUSINESS_TIERS[id].actionsPerMonth === null ? "Negotiated" : fmt(BUSINESS_TIERS[id].actionsPerMonth!)}</td>)}</tr>
                <tr><th scope="row">AI credits</th>{ORDER.map((id) => <td key={id}>{BUSINESS_TIERS[id].credits === null ? "Negotiated" : fmt(BUSINESS_TIERS[id].credits!)}</td>)}</tr>
                <tr><th scope="row">Projects</th>{ORDER.map((id) => <td key={id}>{BUSINESS_TIERS[id].projects === null ? "Unlimited (fair use)" : fmt(BUSINESS_TIERS[id].projects!)}</td>)}</tr>
                <tr><th scope="row">Custom domains</th>{ORDER.map((id) => <td key={id}>{fmt(BUSINESS_TIERS[id].customDomains)}</td>)}</tr>
                <tr><th scope="row">Revenue Guard</th>{ORDER.map((id) => <td key={id}>{BUSINESS_TIERS[id].swarm ? "Included" : "—"}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className={s.muted}>An automation action is one step an agent takes, like sending a message or updating a record. The AI behind it uses credits. Images, video, research and deployments use credits at their listed rates.</p>
        </section>

        <section id="revenue-guard" className={s.section} aria-labelledby="guard-h">
          <div className={s.sectionHead}>
            <div><span className={s.overline}>{"Revenue Guard"}</span><h2 id="guard-h" className={s.h2}>A swarm that tests where money changes hands. <span className={s.dim}>For Enterprise.</span></h2></div>
            <span className={s.badge}>Early access</span>
          </div>
          <p className={s.lede}>A swarm of agents tests the parts of your product where money changes hands, and hands you evidence-backed fixes instead of guesses. Example: a customer cancels, reopens an old checkout tab, and is charged again. Revenue Guard finds it, proves it, and proposes the fix with a test.</p>
          <ol className={s.steps}>
            {GUARD_STEPS.map((x) => <li key={x.n}><span className={s.stepN}>{x.n}</span><h3>{x.title}</h3><p>{x.body}</p></li>)}
          </ol>
          <p className={s.muted}>Runs only against apps your company has verified it owns, inside the desktop app, with a credit budget per run. Results depend on your product; we report what was found and fixed, never a guaranteed amount of money.</p>
          <a href="#contact" className={s.btnGhost}>Request early access</a>
        </section>

        <section id="contact" className={s.section} aria-labelledby="contact-h">
          <div className={s.console}>
            <div className={s.consoleHead}><span className={s.live} aria-hidden="true" />Sales channel · replies by email</div>
            <div className={s.consoleBody}>
              <h2 id="contact-h" className={s.h2}>Talk to sales</h2>
              <p className={s.muted}>Enterprise plans, Revenue Guard early access, security reviews and custom terms. We reply by email, usually within one business day.</p>
              <InquiryForm defaultEmail={status.state === "in" ? status.email ?? "" : ""} defaultCompany={status.state === "in" ? status.account?.company ?? "" : ""} />
            </div>
          </div>
        </section>

        <footer className={s.footer}>
          <span className={s.footBrand}><span className={s.live} aria-hidden="true" />© Keplar</span>
          <a href={`${APP}/terms`}>Terms</a>
          <a href={`${APP}/privacy`}>Privacy</a>
          <a href={`${APP}/security`}>Security</a>
          <a href={`${APP}/status`}>Status</a>
          <a href={APP}>Keplar One</a>
        </footer>
      </div>
    </div>
  );
}

const TOPICS = [
  { id: "Enterprise", label: "Enterprise plan" },
  { id: "Autonomous Agents", label: "Revenue Guard early access" },
  { id: "Keplar Business", label: "Starter, Growth or Scale" },
  { id: "General Inquiry", label: "Something else" },
] as const;

function InquiryForm({ defaultEmail, defaultCompany }: { defaultEmail: string; defaultCompany: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const topic = String(f.get("topic") ?? "Enterprise");
    setBusy(true);
    setError("");
    setFields({});
    try {
      const res = await fetch("/api/inquire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"), email: f.get("email"), company: f.get("company"), companySize: f.get("companySize"),
          interests: ["Keplar Business", ...(topic === "Keplar Business" ? [] : [topic])],
          message: f.get("message"),
          business: { handle: "", estimatedUsers: f.get("estimatedUsers"), useCase: "", expectedUsage: "" },
          website: f.get("website"),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? "That didn't send. Please try again."); setFields(d.fields ?? {}); return; }
      setSent(true);
    } catch {
      setError("That didn't send. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <p className={s.notice} role="status">Thanks. We have your message and will reply by email.</p>;
  return (
    <form className={s.form} onSubmit={(e) => void submit(e)} noValidate>
      <label className={s.field}><span>Name</span><input name="name" required autoComplete="name" spellCheck={false} aria-invalid={Boolean(fields.name) || undefined} />{fields.name ? <em>{fields.name}</em> : null}</label>
      <label className={s.field}><span>Work email</span><input name="email" type="email" required autoComplete="email" defaultValue={defaultEmail} key={defaultEmail} aria-invalid={Boolean(fields.email) || undefined} />{fields.email ? <em>{fields.email}</em> : null}</label>
      <label className={s.field}><span>Company</span><input name="company" autoComplete="organization" spellCheck={false} defaultValue={defaultCompany} key={defaultCompany} aria-invalid={Boolean(fields.company) || undefined} />{fields.company ? <em>{fields.company}</em> : null}</label>
      <label className={s.field}><span>Company size</span><select name="companySize" defaultValue=""><option value="">Choose…</option>{companySizes.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className={s.field}><span>People who would use it</span><select name="estimatedUsers" defaultValue=""><option value="">Choose…</option>{estimatedUsers.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className={s.field}><span>About</span><select name="topic" defaultValue="Enterprise">{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label className={`${s.field} ${s.wide}`}><span>How can we help?</span><textarea name="message" rows={5} required aria-invalid={Boolean(fields.message) || undefined} />{fields.message ? <em>{fields.message}</em> : null}</label>
      <input name="website" tabIndex={-1} autoComplete="off" className={s.honeypot} aria-hidden="true" />
      {error ? <p className={`${s.formError} ${s.wide}`} role="alert">{error}</p> : null}
      <div className={s.wide}><button type="submit" className={s.btnPrimary} disabled={busy}>{busy ? "Sending…" : "Send"}</button></div>
    </form>
  );
}
