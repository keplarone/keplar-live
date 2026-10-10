import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { site } from "@/lib/site";
import { API_ASK_LIMITS, API_POLICY, API_SCOPES, SCOPE_BLURB } from "@/lib/api/policy";
import { CURL_ASK, CURL_STREAM, ERRORS, JS_SAMPLE, PY_SAMPLE, RESPONSE_SAMPLE, STREAM_SAMPLE } from "@/lib/api/docs";
import { EMBED_POLICY } from "@/lib/embed/config";
import { ROLE_BLURB, TEAM_POLICY } from "@/lib/team/policy";
import { referralConfig } from "@/lib/referrals/config";
import { CodeTabs } from "@/components/developers/CodeTabs";
import { EmbedConfigurator } from "@/components/developers/EmbedConfigurator";
import s from "@/components/developers/Developers.module.css";

export const metadata = pageMeta(
  "/developers",
  "Keplar for developers: API, embeddable Ask, Teams",
  "Ask Keplar from your own code with a Bearer API key, or drop the Ask widget on your site with one script tag. Free tier on OpenRouter :free models, paid tiers on your plan. OpenAPI spec, streaming, per-plan limits stated plainly.",
);

const fmt = (n: number) => n.toLocaleString("en-US");
const range = (a: number, b: number) => (a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`);

/** Free / Pro / Enterprise, mapped onto the real plans (Pro = Lite, Plus and Pro; Enterprise = Business). Numbers come from the policy modules. */
const TIERS = [
  { id: "free", name: "Free", plans: "free", note: "OpenRouter :free models only. Good for prototypes and a small site widget.", api: API_POLICY.free, embed: EMBED_POLICY.free, cta: { href: "/signup?next=/account%23api", label: "Create a free key" } },
  { id: "pro", name: "Pro", plans: "lite · plus · pro", note: "Premium models and Keplar consensus, metered from your plan's credits exactly like the app.", api: { maxKeys: [API_POLICY.lite.maxKeys, API_POLICY.pro.maxKeys], keyPerMinute: [API_POLICY.lite.keyPerMinute, API_POLICY.pro.keyPerMinute], keyPerDay: [API_POLICY.lite.keyPerDay, API_POLICY.pro.keyPerDay] }, embed: { maxWidgets: [EMBED_POLICY.lite.maxWidgets, EMBED_POLICY.pro.maxWidgets] }, cta: { href: "/pricing", label: "See plans" }, featured: true },
  { id: "enterprise", name: "Enterprise", plans: "business", note: "Highest limits, Team workspaces with roles, and a contract-set credit pool.", api: API_POLICY.business, embed: EMBED_POLICY.business, cta: { href: "/enterprise", label: "Talk to us" } },
] as const;

const val = (v: number | readonly number[]) => (Array.isArray(v) ? range(v[0]!, v[1]!) : fmt(v as number));

const NODE_SAMPLE = `import { setTimeout as wait } from "node:timers/promises";

async function ask(question, tries = 3) {
  const res = await fetch("${site.url}/api/v1/ask", {
    method: "POST",
    headers: { Authorization: \`Bearer \${process.env.KEPLAR_API_KEY}\`, "Content-Type": "application/json" },
    body: JSON.stringify({ question, routing: { strategy: "balanced" } }),
  });
  if (res.status === 429 && tries > 1) {
    await wait(Number(res.headers.get("retry-after") ?? 5) * 1000);
    return ask(question, tries - 1);
  }
  const body = await res.json();
  if (!res.ok) throw new Error(\`\${body.error.code}: \${body.error.message}\`);
  return body;
}`;

export default function DevelopersPage() {
  const ref = referralConfig();
  const team = TEAM_POLICY.business;
  return (
    <div className={s.page}>
      <header className={s.hero}>
        <p className={s.kicker}><span>Developers</span><span>API v1</span><span>Embed</span><span>Teams</span></p>
        <h1 className={s.title}>Build with Keplar.</h1>
        <p className={s.lede}>
          One request sends a question to several models, compares them, and returns one answer with a plain record of where they disagreed.
          Call it from your server with an API key, or put the same Ask on your own site with one script tag.
        </p>
        <div className={s.endpoint} aria-label="Primary endpoint"><span className={s.method}>POST</span>{site.url.replace(/^https?:\/\//, "")}/api/v1/ask</div>
        <div className={s.heroActions}>
          <Link className={s.btn} href="/account#api">Get an API key</Link>
          <Link className={`${s.btn} ${s.btnGhost}`} href="/account#embed">Create a widget</Link>
          <a className={`${s.btn} ${s.btnGhost}`} href="/api/v1/openapi.json">OpenAPI spec</a>
        </div>
      </header>

      <nav className={s.products} aria-label="Platform">
        <a className={s.product} href="#quickstart"><span className={s.productTag}>REST · SSE</span><p className={s.productName}>Public API</p><p className={s.productText}>Bearer keys, JSON or streaming answers, agreement and disagreement in every response.</p><span className={s.productLink}>Quickstart</span></a>
        <a className={s.product} href="#embed"><span className={s.productTag}>script · iframe</span><p className={s.productName}>Embeddable Ask</p><p className={s.productText}>A themeable Ask box for your docs or product. Origin allowlist and rate limits included.</p><span className={s.productLink}>Configure</span></a>
        <a className={s.product} href="#teams"><span className={s.productTag}>Business</span><p className={s.productName}>Keplar for Teams</p><p className={s.productText}>Shared workspaces with admin, editor and viewer roles, invites by email or link.</p><span className={s.productLink}>Roles</span></a>
        <a className={s.product} href="#referrals"><span className={s.productTag}>credits</span><p className={s.productName}>Referrals</p><p className={s.productText}>Share your link. You and a friend each get {fmt(ref.referrerCredits)} usage credits when they join.</p><span className={s.productLink}>How it works</span></a>
      </nav>

      <div className={s.layout}>
        <nav className={s.toc} aria-label="On this page">
          <p>On this page</p>
          <a href="#tiers">Tiers and limits</a>
          <a href="#quickstart">Quickstart</a>
          <a href="#ask">POST /v1/ask</a>
          <a href="#stream">Streaming</a>
          <a href="#embed">Embed widget</a>
          <a href="#teams">Teams</a>
          <a href="#referrals">Referrals</a>
          <a href="#errors">Errors</a>
          <a href="#security">Security and privacy</a>
          <a href="#roadmap">Not yet</a>
        </nav>

        <div className={s.main}>
          <section className={s.section} id="tiers" aria-labelledby="tiers-h">
            <div className={s.sectionHead}><span className={s.num}>01</span><h2 id="tiers-h" className={s.h2}>Tiers and limits</h2></div>
            <p className={s.p}>Every answer through the API or a widget is metered exactly like an answer in the app: same credits, rolling windows and spend caps. The per-key and per-widget limits below only ever make things stricter.</p>
            <div className={s.tiers}>
              {TIERS.map((t) => (
                <div key={t.id} className={s.tier} data-featured={"featured" in t ? "" : undefined}>
                  <h3 className={s.tierName}>{t.name} <span className={s.tierPlans}>{t.plans}</span></h3>
                  <dl className={s.tierRows}>
                    <div className={s.tierRow}><dt>Active keys</dt><dd>{val(t.api.maxKeys)}</dd></div>
                    <div className={s.tierRow}><dt>Requests / min / key</dt><dd>{val(t.api.keyPerMinute)}</dd></div>
                    <div className={s.tierRow}><dt>Requests / day / key</dt><dd>{val(t.api.keyPerDay)}</dd></div>
                    <div className={s.tierRow}><dt>Embed widgets</dt><dd>{val(t.embed.maxWidgets)}</dd></div>
                  </dl>
                  <p className={s.tierNote}>{t.note}</p>
                  <Link className={`${s.btn} ${"featured" in t ? "" : s.btnGhost}`} href={t.cta.href}>{t.cta.label}</Link>
                </div>
              ))}
            </div>
            <div className={s.tableWrap} tabIndex={0} role="region" aria-label="Per-plan key limits table">
              <table className={s.table}>
                <caption className={s.srOnly}>Per-plan API key limits</caption>
                <thead><tr><th scope="col">Plan</th><th scope="col">Models</th><th scope="col">Keys</th><th scope="col">Per min</th><th scope="col">Per day</th></tr></thead>
                <tbody>
                  {(["free", "lite", "plus", "pro", "business"] as const).map((id) => (
                    <tr key={id}><th scope="row" style={{ textTransform: "capitalize" }}>{id}</th><td>{id === "free" ? <code className={s.cell}>:free</code> : "plan roster"}</td><td className={s.cell}>{API_POLICY[id].maxKeys}</td><td className={s.cell}>{API_POLICY[id].keyPerMinute}</td><td className={s.cell}>{fmt(API_POLICY[id].keyPerDay)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={s.section} id="quickstart" aria-labelledby="qs-h">
            <div className={s.sectionHead}><span className={s.num}>02</span><h2 id="qs-h" className={s.h2}>Quickstart</h2></div>
            <ol className={s.steps}>
              <li className={s.step}><div><strong>Create a key</strong><p>Sign in, open <Link href="/account#api">Account → Developer API</Link>, name the key and pick an expiry. It is shown once; we keep only a hash.</p></div></li>
              <li className={s.step}><div><strong>Keep it on a server</strong><p>Store it as <code>KEPLAR_API_KEY</code>. Never ship it in a web page or a repository. For a public page, use a widget instead.</p></div></li>
              <li className={s.step}><div><strong>Ask</strong><p>Send <code>Authorization: Bearer kpl_…</code> with a JSON body. Requests are stateless, so pass earlier turns in <code>history</code>.</p></div></li>
            </ol>
            <CodeTabs label="Quickstart samples" samples={[{ label: "curl", code: CURL_ASK }, { label: "JavaScript", code: JS_SAMPLE }, { label: "Python", code: PY_SAMPLE }, { label: "Node, with retry", code: NODE_SAMPLE }]} />
            <p className={s.p}>Scopes: {API_SCOPES.map((x) => <span key={x}><code>{x}</code> {SCOPE_BLURB[x]} </span>)}</p>
          </section>

          <section className={s.section} id="ask" aria-labelledby="ask-h">
            <div className={s.sectionHead}><span className={s.num}>03</span><h2 id="ask-h" className={s.h2}>POST /api/v1/ask</h2></div>
            <div className={s.tableWrap} tabIndex={0} role="region" aria-label="Request fields">
              <table className={s.table}>
                <thead><tr><th scope="col">Field</th><th scope="col">Type</th><th scope="col">Notes</th></tr></thead>
                <tbody>
                  <tr><td className={s.cell}>question</td><td className={s.cell}>string</td><td>Required. Up to {fmt(API_ASK_LIMITS.questionChars)} characters.</td></tr>
                  <tr><td className={s.cell}>history</td><td className={s.cell}>array</td><td>Optional. Up to {API_ASK_LIMITS.historyTurns} turns of <code>{"{role, content}"}</code>, each up to {fmt(API_ASK_LIMITS.historyTurnChars)} characters.</td></tr>
                  <tr><td className={s.cell}>routing.strategy</td><td className={s.cell}>enum</td><td><code>auto</code>, <code>fast</code>, <code>balanced</code> or <code>deep</code>.</td></tr>
                  <tr><td className={s.cell}>stream</td><td className={s.cell}>boolean</td><td>Server-Sent Events instead of one JSON body.</td></tr>
                  <tr><td className={s.cell}>tools</td><td className={s.cell}>array</td><td>Optional built-in tools: <code>reason</code>, <code>debate</code>, <code>web_search</code>, <code>deep_research</code>, <code>{"{type: \"read_url\", urls}"}</code> (up to 3 public links) and <code>{"{type: \"x_search\", query?}"}</code>. Web search and deep research run only where retrieval is switched on; search on X only where it is connected. The answer&apos;s <code>tools</code> list says what each one did: <code>used</code>, <code>requested</code>, <code>unavailable</code> or <code>failed</code>.</td></tr>
                </tbody>
              </table>
            </div>
            <pre className={`${s.code} ${s.pre}`} tabIndex={0} aria-label="Response sample"><code>{RESPONSE_SAMPLE}</code></pre>
            <p className={s.callout}><strong>Read <code>sources</code> carefully.</strong> They are what the models cited. Keplar has not checked them unless <code>source_check</code> is present, and agreement between models is not proof.</p>
          </section>

          <section className={s.section} id="stream" aria-labelledby="stream-h">
            <div className={s.sectionHead}><span className={s.num}>04</span><h2 id="stream-h" className={s.h2}>Streaming</h2></div>
            <p className={s.p}>Set <code>&quot;stream&quot;: true</code> or send <code>Accept: text/event-stream</code>. Events arrive as <code>progress</code>, <code>delta</code> (a live preview), <code>answer</code> (the result), then <code>done</code> or <code>error</code>. Refusals such as limits come back as a normal HTTP status before any event.</p>
            <pre className={`${s.code} ${s.pre}`} tabIndex={0} aria-label="Streaming request"><code>{CURL_STREAM}</code></pre>
            <pre className={`${s.code} ${s.pre}`} tabIndex={0} aria-label="Streaming events"><code>{STREAM_SAMPLE}</code></pre>
          </section>

          <section className={s.section} id="embed" aria-labelledby="embed-h">
            <div className={s.sectionHead}><span className={s.num}>05</span><h2 id="embed-h" className={s.h2}>Embeddable Ask widget</h2></div>
            <p className={s.p}>Create a widget in <Link href="/account#embed">Account → Embed Ask</Link>. You get a public id (<code>emb_…</code>) and a snippet. Paste it where the box should appear. Questions are answered by Keplar and spend the publisher&apos;s credits. Free publishers always run on OpenRouter <code>:free</code> models, and paid publishers choose free models or their plan&apos;s models for each widget.</p>
            <EmbedConfigurator origin={site.url} />
            <ul className={s.list}>
              <li className={s.li}><strong>Allowlist.</strong> Add up to 10 origins such as <code>https://docs.example.com</code>. Other sites get a refusal from the server, not only a hidden box.</li>
              <li className={s.li}><strong>Rate limits.</strong> Each widget has its own per-minute and per-day limit by plan, plus a per-visitor limit.</li>
              <li className={s.li}><strong>Revoke any time.</strong> A revoked widget stops answering on the next question.</li>
              <li className={s.li}><strong>The id is public by design.</strong> It can only ask through that widget&apos;s limits. Never put an API key in a page.</li>
            </ul>
          </section>

          <section className={s.section} id="teams" aria-labelledby="teams-h">
            <div className={s.sectionHead}><span className={s.num}>06</span><h2 id="teams-h" className={s.h2}>Keplar for Teams</h2></div>
            <p className={s.p}>A team is its own workspace. Projects, chats and sites created while you work in it belong to the team, not to anyone personally. Switch between personal and team workspaces from the account menu in the app. Up to {team.maxMembers} members, with one shared pool of {fmt(team.poolUnits)} credits a month. Business plan.</p>
            <div className={s.tableWrap} tabIndex={0} role="region" aria-label="Team roles">
              <table className={s.table}>
                <thead><tr><th scope="col">Role</th><th scope="col">Can</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Owner</th><td>{ROLE_BLURB.owner}</td></tr>
                  <tr><th scope="row">Admin</th><td>{ROLE_BLURB.admin}</td></tr>
                  <tr><th scope="row">Editor</th><td>{ROLE_BLURB.member.replace(/^Editor:\s*/, "")}</td></tr>
                  <tr><th scope="row">Viewer</th><td>{ROLE_BLURB.viewer}</td></tr>
                </tbody>
              </table>
            </div>
            <p className={s.p}>Invites are drafts until you send them, by email or as a one-time link that expires in 7 days and works only for the invited address. The server checks every action against your role on every request. <Link href="/account#team">Open Team workspace</Link>.</p>
          </section>

          <section className={s.section} id="referrals" aria-labelledby="ref-h">
            <div className={s.sectionHead}><span className={s.num}>07</span><h2 id="ref-h" className={s.h2}>Referrals</h2></div>
            <p className={s.p}>Your link looks like <code>{site.url.replace(/^https?:\/\//, "")}/?ref=yourcode</code>. When a friend opens it, creates a new account and verifies their email, you get {fmt(ref.referrerCredits)} and they get {fmt(ref.friendCredits)} usage credits. Credits only, never cash. Up to {ref.perMonth} rewarded friends a month and {ref.lifetime} in total. Self-referrals and throwaway addresses earn nothing.</p>
            <p className={s.p}><Link href="/account#invite">Copy your link</Link> · <Link href="/referral-terms">Referral terms</Link></p>
          </section>

          <section className={s.section} id="errors" aria-labelledby="err-h">
            <div className={s.sectionHead}><span className={s.num}>08</span><h2 id="err-h" className={s.h2}>Errors</h2></div>
            <p className={s.p}>Every error has the shape <code>{"{\"error\": {\"code\", \"message\", \"retry_after\"?}}"}</code>. Widget errors use the same shape.</p>
            <div className={s.tableWrap} tabIndex={0} role="region" aria-label="Error codes">
              <table className={s.table}>
                <thead><tr><th scope="col">Status</th><th scope="col">Code</th><th scope="col">Meaning</th></tr></thead>
                <tbody>{ERRORS.map(([st, code, m]) => <tr key={code}><td className={s.cell}>{st}</td><td className={s.cell}>{code}</td><td>{m}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className={s.section} id="security" aria-labelledby="sec-h">
            <div className={s.sectionHead}><span className={s.num}>09</span><h2 id="sec-h" className={s.h2}>Security and privacy</h2></div>
            <ul className={s.list}>
              <li className={s.li}>Keys are stored only as SHA-256 hashes and shown once. Revoking a key takes effect on the next request.</li>
              <li className={s.li}>The API reads the <code>Authorization</code> header only. Browser cookies are never accepted, so a key can&apos;t use a session and a session can&apos;t call v1.</li>
              <li className={s.li}>API and widget calls are stateless. They don&apos;t read or write memory, save chats, or train on your questions. We keep per-key and per-widget counters so you can see usage.</li>
              <li className={s.li}>Exporting your account includes your keys and widgets, but never a secret. Deleting your account removes them. See the <Link href="/privacy">privacy policy</Link>.</li>
            </ul>
          </section>

          <section className={s.section} id="roadmap" aria-labelledby="road-h">
            <div className={s.sectionHead}><span className={s.num}>10</span><h2 id="road-h" className={s.h2}>Not available yet</h2></div>
            <ul className={s.list}>
              <li className={s.li}>Team-level API keys, per-key credit caps, webhooks and an official SDK.</li>
              <li className={s.li}>Separate usage-based billing for API and widget traffic. Today it draws on your plan&apos;s credits.</li>
              <li className={s.li}>Tool use, file or image input, and Create through the API. No stated uptime figure during the beta.</li>
            </ul>
            <p className={s.p}>Need one of these? <Link href="/inquire">Tell us</Link>. The machine-readable spec is at <a href="/api/v1/openapi.json">/api/v1/openapi.json</a> (OpenAPI 3.1).</p>
          </section>
        </div>
      </div>
      <p className={s.credit}>Built by Hassen and Hussain Keder. Keplar was created by two co-founders, Hassen and Hussain Keder.</p>
    </div>
  );
}
