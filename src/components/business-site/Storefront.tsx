"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BUSINESS_TIERS, listPriceFor, priceFor, usd, type BusinessTier } from "@/lib/business/tiers";
import { companySizes, estimatedUsers } from "@/lib/inquire/schema";
import { BuildDemo } from "./BuildDemo";
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
const short = (tier: BusinessTier) => BUSINESS_TIERS[tier].name.replace("Keplar Business ", "").replace("Keplar ", "");

/** What the workspace does. Each line describes a module that exists in it today. */
const CAPABILITIES = [
  { title: "Coding agents", body: "Agents read the project, write the change, run it and open a live preview. Every edit arrives as a diff you can review." },
  { title: "Several models on every task", body: "Work is routed to the models suited to it, and research and reasoning are cross-checked across more than one." },
  { title: "Websites and apps", body: "Describe what you need and get a working project you can edit, version and deploy to your own domain." },
  { title: "Design canvas", body: "Design, code and AI modes on the same project, with previews and changes you approve." },
  { title: "Deep Research and Reason", body: "Research with every claim cited, and decisions worked through with the assumptions and math shown." },
  { title: "Agents that keep working", body: "Workflows that run on schedules within a budget, and ask before anything spends money or reaches a customer." },
  { title: "Images and video", body: "Generate and edit brand assets, then use them in the sites and campaigns you build." },
];

/** The guarantees behind agent work: each is enforced in the workspace, not a promise in copy. */
const CONTROLS = [
  { title: "Approval before it acts", body: "Payments, messages to customers and deploys wait for a person in Approvals." },
  { title: "A budget per agent", body: "Each agent has its own spending limit and stops when it reaches it." },
  { title: "One switch to pause", body: "Pause every agent in the workspace at once." },
  { title: "A complete audit log", body: "Who or what did each thing, when, and what it cost." },
];

const GUARD_STEPS = [
  { title: "Explore", body: "Agents walk signup, checkout, billing, cancellation and recovery in real browsers." },
  { title: "Screen", body: "Every report needs steps, screenshots and a network log. Guesses are dropped." },
  { title: "Reproduce", body: "A separate agent replays each report in a clean session." },
  { title: "Patch", body: "A proposed fix with a regression test that fails before and passes after." },
  { title: "Review", body: "A different reviewer checks it. Nothing merges without your approval." },
];

const TRUST = [
  { title: "Your approval gates every external action", body: "Agents prepare; people decide. Approvals are on by default." },
  { title: "Paid model requests stay out of training", body: "Requests go only to model endpoints that say they do not train on prompts." },
  { title: "Everything is recorded", body: "The audit log keeps each agent action with its time, actor and cost." },
  { title: "Your data leaves when you do", body: "Export your account's data at any time from Settings." },
  { title: "Payments handled by Whop", body: "Checkout runs in Whop's own form. Keplar never sees your card." },
  { title: "Testing only what you own", body: "Revenue Guard runs only against apps your company has verified." },
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

/**
 * Sections ease up as they enter the viewport. Content is visible by default: only blocks below the fold are hidden, and only
 * once this runs, so a page without JavaScript (or with reduced motion) shows everything at once.
 */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = [...el.querySelectorAll<HTMLElement>("[data-reveal]")].filter((x) => x.getBoundingClientRect().top > window.innerHeight * 0.92);
    for (const x of items) x.dataset.reveal = "out";
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).dataset.reveal = "in"; io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    for (const x of items) io.observe(x);
    return () => io.disconnect();
  }, [root]);
}

export function Storefront() {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [purchased] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("purchased") === "1");
  // A sign-in handoff that failed (src/lib/business/handoff.ts) lands here with ?signin=<reason>.
  const [signinFailed] = useState(() => typeof window !== "undefined" && Boolean(new URLSearchParams(window.location.search).get("signin")));
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  useReveal(root);

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

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const price = (tier: BusinessTier) => {
    if (tier === "enterprise") return null;
    const was = listPriceFor(tier);
    return { now: usd(priceFor(tier)), was: was === null ? null : usd(was) };
  };

  /** Where "Start Building" goes for this visitor: the workspace, setup, a plan, or the download. */
  const start = useMemo(() => {
    if (status.state === "loading" || status.state === "out") return { href: accountUrl(), sub: "" };
    if (status.active) return { href: "/work", sub: "" };
    if (!status.account) return { href: accountUrl(), sub: `Signed in as ${status.email ?? "you"}.` };
    return { href: "#pricing", sub: `${status.account.company} is set up. Choose a plan to start.` };
  }, [status]);

  const links = [
    { href: "#product", label: "Product" },
    { href: "#control", label: "Control" },
    { href: "#pricing", label: "Pricing" },
    { href: "#security", label: "Security" },
    { href: "#contact", label: "Contact sales" },
  ];

  return (
    <div className={s.frame} ref={root}>
      <header className={s.nav} data-scrolled={scrolled || undefined}>
        <div className={s.navInner}>
          <Link href="/" className={s.brand} aria-label="Keplar Business home">
            <BusinessMark size={24} />
            <span className={s.wordmark}>Keplar <span>Business</span></span>
          </Link>
          <nav className={s.navLinks} aria-label="Sections">
            {links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
          </nav>
          <div className={s.navEnd}>
            {status.state === "out" ? (
              <>
                <a href={`/signin?next=${encodeURIComponent("/work")}`} className={s.navLink}>Sign in</a>
                <a href={accountUrl()} className={s.btnPrimarySm}>Start Building</a>
              </>
            ) : status.state === "in" ? (
              <span className={s.navAccount}>
                {status.active ? <Link href="/work" className={s.btnPrimarySm}>Open workspace</Link> : <span className={s.who} title={status.email ?? undefined}>{status.account?.company ?? status.email}</span>}
                <span className={s.navSignOut}><SignOutButton email={status.email} /></span>
              </span>
            ) : <span className={s.navSkeleton} aria-hidden="true" />}
            <button type="button" className={s.menuBtn} aria-expanded={menu} aria-controls="business-menu" aria-label={menu ? "Close menu" : "Open menu"} onClick={() => setMenu((x) => !x)}>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d={menu ? "M4 4l10 10M14 4L4 14" : "M3 6h12M3 12h12"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        {menu ? (
          <nav id="business-menu" className={s.sheet} aria-label="Sections">
            {links.map((l) => <a key={l.href} href={l.href} onClick={() => setMenu(false)}>{l.label}</a>)}
            {status.state === "out" ? (
              <a href={`/signin?next=${encodeURIComponent("/work")}`}>Sign in</a>
            ) : status.state === "in" ? <div className={s.sheetAccount}><span>{status.email}</span><SignOutButton email={status.email} /></div> : null}
          </nav>
        ) : null}
      </header>

      <section className={s.hero} aria-labelledby="hero-h">
        <a href="#download-app" className={s.chip}><span className={s.chipTag}>Desktop app</span>Windows, macOS and Linux<span aria-hidden="true">→</span></a>
        <h1 id="hero-h" className={s.h1}>Build anything.{" "}<span className={s.h1Dim}>Let intelligence handle the complexity.</span></h1>
        <p className={s.lede}>Coding agents that plan, write, test and preview real software across several AI models, with research, design and automation in the same workspace. You review the result before anything ships.</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /signin is a route handler (the sign-in handoff from keplar.one): it needs a full page load */}
        {signinFailed && status.state === "out" ? <p className={s.notice} role="status">That sign-in didn&apos;t finish (the link expired or was opened in a different browser). <a href="/signin?next=%2Fwork" className={s.textLink}>Sign in again</a></p> : null}
        {purchased && !(status.state === "in" && status.active) ? <p className={s.notice} role="status">Thanks for your purchase. Your plan activates as soon as the payment confirms, usually within a minute. Refresh this page to see your download.</p> : null}
        <div className={s.heroActions}>
          {status.state === "loading" ? <span className={s.skeleton} aria-hidden="true" /> : <a href={start.href} className={s.btnPrimary}>Start Building<Arrow /></a>}
          <a href="#product" className={s.btnGhost}>Explore Keplar Business</a>
        </div>
        {start.sub ? <p className={s.heroSub}>{start.sub}</p> : null}
      </section>

      <div className={s.stage} data-reveal="">
        <BuildDemo />
      </div>

      {status.state === "in" && status.active ? (
        <section id="download" className={s.band} aria-labelledby="download-h">
          <div className={s.container}>
            <div className={s.activeBox}>
              <div>
                <h2 id="download-h" className={s.h4}>{status.plan?.name ?? "Keplar Business"} is active{status.account ? ` for ${status.account.company}` : ""}.</h2>
                <p className={s.muted}>Sign in to the desktop app with {status.email ?? "the same account"}.</p>
              </div>
              {status.download ? <DownloadPanel download={status.download} /> : <p className={s.muted}>The download is loading. If it does not appear, try again in a minute.</p>}
            </div>
          </div>
        </section>
      ) : null}

      <section id="product" className={s.section} aria-labelledby="product-h">
        <div className={s.split}>
          <div className={s.splitHead} data-reveal="">
            <p className={s.overline}>Product</p>
            <h2 id="product-h" className={s.h2}>One workspace, from idea to shipped.</h2>
            <p className={s.body}>Describe the outcome. Agents do the work in the open, and every step leaves something you can read, run or reject.</p>
          </div>
          <ol className={s.capabilities}>
            {CAPABILITIES.map((c, i) => (
              <li key={c.title} data-reveal="">
                <span className={s.index}>{String(i + 1).padStart(2, "0")}</span>
                <div><h3 className={s.h5}>{c.title}</h3><p>{c.body}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="control" className={s.section} aria-labelledby="control-h">
        <div className={s.container}>
          <div className={s.head} data-reveal="">
            <p className={s.overline}>Control</p>
            <h2 id="control-h" className={s.h2}>Agents do the work.<br /><span className={s.dim}>You decide what ships.</span></h2>
          </div>
          <ul className={s.columns} data-reveal="">
            {CONTROLS.map((g) => <li key={g.title}><h3 className={s.h5}>{g.title}</h3><p>{g.body}</p></li>)}
          </ul>

          <div id="revenue-guard" className={s.guard} data-reveal="">
            <div className={s.guardHead}>
              <div>
                <p className={s.overline}>Revenue Guard · Enterprise · Early access</p>
                <h3 className={s.h3}>A swarm that tests where money changes hands.</h3>
              </div>
              <p className={s.body}>For example: a customer cancels, reopens an old checkout tab and is charged again. Revenue Guard finds it, proves it, and proposes the fix with a test. Results depend on your product; we report what was found and fixed, never a promised amount.</p>
            </div>
            <ol className={s.guardSteps}>
              {GUARD_STEPS.map((x, i) => <li key={x.title}><span className={s.index}>{String(i + 1).padStart(2, "0")}</span><h4 className={s.h6}>{x.title}</h4><p>{x.body}</p></li>)}
            </ol>
            <a href="#contact" className={s.textLink}>Request early access <Arrow /></a>
          </div>
        </div>
      </section>

      <section id="pricing" className={s.section} aria-labelledby="pricing-h">
        <div className={s.container}>
          <div className={s.headRow} data-reveal="">
            <div>
              <p className={s.overline}>Pricing</p>
              <h2 id="pricing-h" className={s.h2}>Every module on every plan.</h2>
            </div>
            <p className={s.body}>Monthly plans. Higher plans add seats, agents and usage. Limits are shown in full and enforced in your account.</p>
          </div>
          <div className={s.plans} data-reveal="">
            {ORDER.map((id) => {
              const t = BUSINESS_TIERS[id];
              const p = price(id);
              const current = status.state === "in" && status.active && status.plan?.tier === id;
              return (
                <article key={id} className={s.plan} data-featured={id === "growth" || undefined} aria-labelledby={`plan-${id}`}>
                  <div className={s.planTop}>
                    <h3 id={`plan-${id}`} className={s.planName}>{short(id)}</h3>
                    <p className={s.planFor}>{t.audience}</p>
                  </div>
                  <p className={s.price}>
                    {p ? <>{p.was ? <s className={s.priceWas} aria-label={`Was ${p.was}`}>{p.was}</s> : null}<span className={s.priceBig}>{p.now}</span><span className={s.priceNote}>per month</span></>
                      : <><span className={s.priceBig}>Custom</span><span className={s.priceNote}>custom contract</span></>}
                  </p>
                  {current ? <span className={s.btnGhost} aria-current="true">Your plan</span>
                    : id === "enterprise" ? <a href="#contact" className={s.btnGhost}>Contact sales</a>
                    : <a href={accountUrl(id)} className={id === "growth" ? s.btnPrimary : s.btnGhost}>Choose {short(id)}</a>}
                  <dl className={s.planMetrics}>
                    <div><dt>Seats</dt><dd>{t.seats === null ? "Custom" : fmt(t.seats)}</dd></div>
                    <div><dt>Active agents</dt><dd>{t.activeAgents === null ? "Custom" : fmt(t.activeAgents)}</dd></div>
                    <div><dt>AI credits a month</dt><dd>{t.credits === null ? "Custom" : fmt(t.credits)}</dd></div>
                  </dl>
                  <ul className={s.planList}>{t.includes.filter((x) => !/^\d|seat|active agents|projects$/i.test(x)).slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul>
                </article>
              );
            })}
          </div>
          <details className={s.compare}>
            <summary>Compare every limit<Chevron /></summary>
            <div className={s.limitsWrap} role="region" aria-label="Compare Business plan limits" tabIndex={0}>
              <table className={s.limits}>
                <caption className={s.srOnly}>Plan limits</caption>
                <thead><tr><th scope="col">Included each month</th>{ORDER.map((id) => <th key={id} scope="col">{short(id)}</th>)}</tr></thead>
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
            <p className={s.fine}>An automation action is one step an agent takes, like sending a message or updating a record. The AI behind it uses credits. Images, video, research and deployments use credits at their listed rates.</p>
          </details>
        </div>
      </section>

      <section id="security" className={s.section} aria-labelledby="security-h">
        <div className={s.split}>
          <div className={s.splitHead} data-reveal="">
            <p className={s.overline}>Security</p>
            <h2 id="security-h" className={s.h2}>Trusted with real work.</h2>
            <p className={s.body}>How Keplar handles your data is written down in full.</p>
            <p className={s.inlineLinks}><a href={`${APP}/security`} className={s.textLink}>Security</a><a href={`${APP}/privacy`} className={s.textLink}>Privacy policy</a><a href={`${APP}/status`} className={s.textLink}>Status</a></p>
          </div>
          <ul className={s.trust} data-reveal="">
            {TRUST.map((x) => <li key={x.title}><h3 className={s.h5}>{x.title}</h3><p>{x.body}</p></li>)}
          </ul>
        </div>
      </section>

      <section id="download-app" className={s.section} aria-labelledby="desktop-h">
        <div className={s.container}>
          <div className={s.desktop} data-reveal="">
            <div>
              <p className={s.overline}>Desktop app</p>
              <h2 id="desktop-h" className={s.h3}>The workspace, in its own window.</h2>
              <p className={s.body}>Keplar Business runs in the browser at business.keplar.one/work and as a desktop app for Windows, macOS and Linux. The download unlocks with an active plan.</p>
            </div>
            <div className={s.heroActions}>
              {status.state === "in" && status.active ? <a href="#download" className={s.btnPrimary}>Get the download</a> : <a href={start.href} className={s.btnPrimary}>Start Building</a>}
              <a href="#pricing" className={s.btnGhost}>See plans</a>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className={s.section} aria-labelledby="contact-h">
        <div className={s.split}>
          <div className={s.splitHead} data-reveal="">
            <p className={s.overline}>Contact sales</p>
            <h2 id="contact-h" className={s.h2}>Talk to the team.</h2>
            <p className={s.body}>Enterprise plans, Revenue Guard early access, security reviews and custom terms. We reply by email, usually within one business day.</p>
          </div>
          <div className={s.formWrap} data-reveal="">
            <InquiryForm defaultEmail={status.state === "in" ? status.email ?? "" : ""} defaultCompany={status.state === "in" ? status.account?.company ?? "" : ""} />
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.footInner}>
          <div className={s.footBrand}>
            <span className={s.brand}><BusinessMark size={22} /><span className={s.wordmark}>Keplar <span>Business</span></span></span>
            <p>© Keplar</p>
          </div>
          <nav className={s.footCols} aria-label="Footer">
            <div><h2>Product</h2><Link href="/work">Workspace</Link><a href="#pricing">Pricing</a><a href="#download-app">Desktop app</a><a href="#revenue-guard">Revenue Guard</a></div>
            <div><h2>Company</h2><a href={APP}>Keplar One</a><a href="#contact">Contact sales</a><a href={`${APP}/status`}>Status</a></div>
            <div><h2>Legal</h2><a href={`${APP}/terms`}>Terms</a><a href={`${APP}/privacy`}>Privacy</a><a href={`${APP}/security`}>Security</a></div>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const Arrow = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Chevron = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 5.5L7 8.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

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
      <div className={s.wide}><button type="submit" className={s.btnPrimary} disabled={busy}>{busy ? "Sending…" : "Send message"}</button></div>
    </form>
  );
}
