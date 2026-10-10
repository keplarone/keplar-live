# Keplar growth marketing: research, chosen methods, changes, channel plan

Owner: growth marketing + front end. Written Oct 6, 2026 (ET). Local repo only; nothing was emailed or posted.
Related: `docs/growth/*` (earlier growth workstream: positioning, activation, sharing, dashboards), `docs/seo/*` (SEO workstream).

---

## 1. Research (2024–2026 sources)

What the evidence says, in the order it matters for Keplar. Figures are the sources' own; treat vendor/blog numbers as directional.

| Method | What the evidence says | Source |
|---|---|---|
| Product-led growth, intentional free tier | Freemium converts visitors to sign-ups at a 12% median; free→paid averages ~9% across models (B2B PLG). Companies with a deliberately designed free model report 57% better free→paid conversion. | ProductLed, *PLG Benchmarks* (productled.com/blog/product-led-growth-benchmarks); ProductLed, *State of B2B SaaS 2025* (446 companies, Oct 2024–Mar 2025) |
| Free→paid bands for AI products | Freemium "good" 3–5%, "great" 8–12%; AI-native "good" 6–8%, "great" 15–20% (Growth Unhinged 2026, as summarised); OpenView's older product benchmark median 2.6%. | productgrowth.blog freemium calculator citing Kyle Poyar, *Growth Unhinged 2026 Free-to-Paid report*, and OpenView 2025 |
| Time-to-value | Top-quartile time-to-value companies report 62% better conversion; TTV correlates 0.69 with overall performance. Median trial TTFV ~22 min; elite < 3 min. | ProductLed *State of B2B SaaS 2025*; 1Capture, *Free Trial Conversion Benchmarks 2025* |
| No-signup demo for launches | Show HN rules: "make it easy for users to try your thing out, ideally without barriers such as signups"; front-page Show HN for a dev tool ≈ 5k–30k visits, 50–400 sign-ups. | news.ycombinator.com/showhn (quoted in DEV, *Product Hunt and Show HN Launch Rules*, 2025); Causo, *Show HN playbook 2026* |
| Contextual upgrade at limit / feature moments | Capability-based paywalls shown at the moment of need reach ~12% median conversion vs ~2% for generic freemium flows (100+ flows analysed); gain framing ("more usage") beats loss framing. | DEV / PaywallPro, *Why top AI apps convert at 12%* (2025) |
| Hybrid pricing + overage transparency | 43% of companies combine subscription with usage pricing; make overage transparent with alerts and caps to avoid bill shock. AI sold as separate add-ons is adopted by only 8% of new customers: embed AI in plans. | Chargebee, *State of Subscriptions & Revenue Growth 2025*; Lago, *Usage-based pricing playbook*; SBI/Price Intelligently, *State of SaaS Pricing 2025* |
| Pricing page structure | 7/10 SaaS pricing pages use 3 plans; 5/10 include a comparison table; group rows, lead with what buyers care about, show specific limits, 15–20 rows max. Annual discount median ≈ 20% ("2 months free"); one test saw annual sign-ups +342% after adding 20% off. | Tenet, *SaaS pricing page study*; Girard Media, *Pricing page CRO*; G. Barner, *Monthly vs yearly 2025* (50 products); Remery, *17 pricing experiments* |
| Comparison / alternatives SEO | Alternatives keywords converted at 7.5%+ and "vs" keywords at 5%+ in a 95-article study; honest trade-offs and a clear fit verdict convert best. | Grow and Convert, *Competitor comparison landing pages*; Backstage SEO, *B2B comparison pages 2026* |
| AI-search referrals (GEO) | ChatGPT referrals converted at 15.9% vs 1.76% for Google organic on one site; Perplexity 10.5%. Pages LLMs cite: clear product, pricing and comparison pages with schema. llms.txt not a proven ranking factor. | Seer Interactive, *How traffic from ChatGPT converts*; TripleDart, *Which pages LLMs cite* |
| Showcase / remix loops, community, creators | Lovable: public projects + one-click remix + "Launched" gallery (weekly winners get credits), 87k-member Discord with weekly build events, YouTube/TikTok creators; $100M ARR in 8 months. | TechCrunch (Jul 23, 2025); libraryofllm *Lovable case study*; High Output, *Lovable $0→$100M*; Elena Verna, *Growth lessons behind Lovable* |
| Launch tactics | Product Hunt: launch 12:01 am PT from a personal account, ask for visits and comments, never votes. Show HN: plain title "Show HN: X, does Y", first comment within a minute, answer every comment for 2 hours, Tuesday 8–10 am ET window. | producthunt.com/launch; Lenny's Newsletter, *How to launch on Product Hunt*; Causo *Show HN playbook 2026* |
| Lifecycle email | 5–8 emails over 14 days, behaviour-triggered beats calendar drips; activation benchmark ~37.5%; judge by clicks/activation, not opens (Apple MPP inflates opens). | Userpilot, *SaaS product metrics*; Mailsoftly / Digital Applied onboarding playbooks 2026 |
| Trust pages | 52% of buyers choose on privacy/security posture; trust centres shorten conversion ~32%; AI buyers want clarity on training use and third-party models. | Software Finder, *SaaS Security Report 2026*; G2, *2025 Buyer Behavior Report* |

## 2. Ranking for Keplar (impact ÷ effort)

Scored 1–5 for Keplar specifically (current traffic is small, product is broad, two founders, no ad budget set). Status = what already existed before this pass.

| # | Method | Impact | Effort | Score | Status before | Decision |
|---|---|---|---|---|---|---|
| 1 | Contextual upgrade prompts at limit / gate moments | 5 | 1 | 5.0 | Limit cards, credits-low, upsell note existed in /app | **Chosen**: closed the loop, each prompt now lands on a pricing page that explains *why* |
| 2 | Pricing page: value-based chooser, comparison table, pricing FAQ with overage transparency | 5 | 2 | 2.5 | Plan cards + general FAQ only | **Chosen, built** |
| 3 | No-signup live demo / time-to-value | 5 | 2 | 2.5 | Live demo on home, TryBox on landings, onboarding checklist in /app | Owned by landing / app executors. Kept; measured |
| 4 | High-intent SEO landings (Create = "AI app builder") | 4 | 2 | 2.0 | Ask-side landings existed; no Create landing | **Chosen, built `/ai-app-builder`** |
| 5 | Comparison pages ("Keplar vs ChatGPT/Claude/Gemini") | 4 | 2 | 2.0 | `/vs/chatgpt`, `/vs/claude`, `/vs/gemini` approved; `/compare/*` noindex pending | **Chosen**: linked from pricing; no duplicate `/compare/keplar-vs-*` routes (would split ranking). Legal review needed |
| 6 | Lifecycle email (behaviour-triggered) | 4 | 2 | 2.0 | None | **Chosen**: 8 drafts in code, not wired, not sent |
| 7 | Community launch (Show HN, Product Hunt, Reddit, Discord) | 4 | 3 | 1.3 | Drafts in docs/growth & docs/seo | **Chosen as channel plan** (§5), dates need founders |
| 8 | Creator / UGC short video of Create builds | 4 | 3 | 1.3 | — | **Chosen as channel plan** (§5) |
| 9 | Showcase / remix loop | 5 | 4 | 1.25 | "Build like this" on curated showcase | Owned by showcase executor |
| 10 | UTM-aware signup attribution | 3 | 1 | 3.0 | **Already live**: consent-gated first-touch landing + utm (30 days) attached to `signup_complete` (`src/lib/seo-events.ts`) | Verified, no change; BuildBox and pricing CTAs keep tags |
| 11 | Referral loop | 3 | 3 | 1.0 | `?ref=` links live | Owned by referral executor |
| 12 | Developer marketing (API, embed) | 3 | 3 | 1.0 | `/developers`, embed, API beta | Owned by API executor |
| 13 | Programmatic SEO | 3 | 4 | 0.75 | Topics / answers / templates sitemaps exist | Not now: thin-content risk; revisit with Search Console data |
| 14 | Annual discount | 4 | 3 | 1.3 | No annual price in Whop/Stripe | **Left out** (no annual price to sell). Needs decision |

**Top methods chosen (8):** contextual upgrade loop; pricing page conversion; Create landing for high-intent search; honest comparison pages surfaced; lifecycle email drafts; Show HN + Product Hunt launch; creator short video of real builds; attribution kept intact across new CTAs.

Why these: Keplar already has the hard parts of PLG (free tier, no-signup demo, onboarding checklist, metered plans). The leaks are at the **decision points** (limit hit → pricing page that didn't explain why; pricing page with no comparison or pricing FAQ) and at **discovery** for its most demo-able feature (Create had no search landing). Those are cheap to fix and compound with every channel.

## 3. What changed (files and routes)

All edits are additive; files owned by other executors were changed only where noted, by a single line each.

| Change | Route | Files |
|---|---|---|
| "Which plan fits?" value-based chooser (Free, Plus, Pro, Business; no "most popular" badge, no urgency) | `/pricing` | `src/components/growth/pricing/PlanFit.tsx` |
| Full plan comparison table (5 plans × 16 rows, grouped). Every number is read from the module that enforces it: `PLAN_ALLOWANCES`, `PLAN_LIMITS`, `ENTITLEMENTS`, `IMAGE_LIMITS`, `SLIDES_LIMITS`, `STUDY_LIMITS`, `API_POLICY`. Pay-as-you-go and web lookups shown as *Coming soon*. Real `<table>` with caption and row/column headers, keyboard-scrollable on narrow screens with the feature column pinned | `/pricing` | `src/components/growth/pricing/PlanCompare.tsx`, `src/lib/growth/pricing-page.ts`, `pricing.module.css` |
| Pricing FAQ (credits, limits, pay-as-you-go **Coming soon** with how it will work, annual **not yet**, cancel + 7-day refund per Terms, Whop, Free caveats incl. prompt logging by free hosts, teams) merged with 3 general questions into one FAQPage JSON-LD block | `/pricing` | `src/lib/growth/pricing-page.ts` (`pricingFaq`), `src/app/(marketing)/pricing/page.tsx` |
| Context note for arrivals from the app: `?from=daily-limit | credits | feature | upsell` (unknown values render nothing; tracked as `pricing_context`) | `/pricing?from=…` | `PricingContext.tsx`; `src/lib/analytics.ts` (+1 event name) |
| In-app upgrade links now carry their context | `/app` | `src/components/app-ui/KeplarTurn.tsx` (5 hrefs), `src/components/app-ui/AgentsPanel.tsx` (1 href) |
| Quiet closing CTA "Ask Keplar anything" + "How Keplar compares" (→ `/vs`). No pop-ups or exit intent | `/pricing` | `PricingClosing.tsx` |
| BreadcrumbList JSON-LD on pricing | `/pricing` | `pricing/page.tsx` |
| New Create landing for "AI app builder / website builder" search intent: plan → build → test in a real browser → fix → save, "Not vibe-coded", voice, publish, honest limits, FAQ, OG image, WebPage + Breadcrumb JSON-LD, sticky mobile CTA | `/ai-app-builder` | `src/app/(marketing)/ai-app-builder/{page,opengraph-image}.tsx`, `src/lib/growth/create-landing.ts` |
| BuildBox: describe → hands the brief to Create (same handoff as the showcase) → `/app/create`, keeps UTM tags (or tags `utm_source=ai-app-builder`) | `/ai-app-builder` | `src/components/growth/BuildBox.tsx` |
| Sitemap + lastmod + prod smoke route for the new page; pricing lastmod bumped | — | `src/app/sitemap.ts`, `src/lib/content/lastmod.ts`, `scripts/smoke-routes.json` |
| Lifecycle email drafts (8, behaviour-triggered, signed "Hassen and Hussain Keder, co-founders of Keplar", reason + unsubscribe in every footer, campaign-tagged CTAs). **Not imported anywhere; a test fails if anything imports it** | — | `src/lib/growth/lifecycle-emails.ts` |
| Tests: table matches enforcing modules, Coming-soon rules, no annual claims, no fake-proof words, context keys, sitemap, email drafts unsent | — | `tests/growth-conversion.test.ts` |
| Screenshot tool (desktop 1440 + 375, section crops, overflow check) | — | `scripts/growth/shots.mjs` → `screenshots/growth/` |

Not changed (owned elsewhere): landing sections, live demo, home hero, nav/footer, Cmd-K, showcase, referral, API, cost metering and flags.

### Lifecycle drafts (summary)
| id | Trigger | CTA |
|---|---|---|
| welcome | sign-up | Ask your first question → `/app` |
| first-question-nudge | 24 h, no question | Open Keplar |
| first-disagreement | first split answer | Why AI models disagree (guide) |
| discover-create | ≥3 questions, Create unused, day 3+ | `/ai-app-builder` |
| free-daily-limit | first Free daily limit | `/pricing?from=daily-limit` |
| credits-low | paid, 80% of credits | `/account` |
| win-back | 21 days inactive after 3 active days | `/changelog` |
| cancellation | plan canceled | optional `/feedback?kind=cancel` |

### Proposed copy edits (not applied: landing files are owned by another executor and had uncommitted edits)
- Home closing chapter: keep "Ask Keplar anything." Add one line under it: "Free, no card. See where the models agree and where they split."
- Create chapter title, if it reads as generic: "Describe it. Keplar builds it, then tests it." (matches `/ai-app-builder`, gives the anti-vibe-code claim a concrete mechanism).
- Pricing lede (`pricingCopy.lede` in `src/lib/sections.ts`): "Start free on free models. Upgrade when you want premium models, Deep Research, and room to build. Credits show exactly what each task costs."

## 4. Measurement
- Funnel already in place: `landing_view → cta_click → signup_complete → first_prompt → synthesis_success` per landing page and source (`/admin/growth`, `seo_events`), consent-gated.
- New: `pricing_context` (which in-app moment sent people to pricing) and CTA placements `pricing:fit-*`, `pricing:compare-*`, `pricing:closing*`, `ai-app-builder:*`.
- Weekly: pricing view → checkout click rate by `from`; `/ai-app-builder` landing → Create open → first build; Show HN / PH days by utm.

## 5. Channel strategy

Principles: one message per channel; every post links to something people can *try* without signing up (`/` live demo) or a page that answers the query (`/ai-app-builder`, `/vs/*`); utm on every link (`utm_source=<channel>&utm_campaign=<launch|weekly>`); never ask for votes; no paid amplification until the free funnel converts.

| Channel | Why | Cadence | Owner |
|---|---|---|---|
| Hacker News (Show HN) | Technical credibility; the "models disagree" demo and the build-then-test pipeline are interesting to builders | One Show HN, then only genuinely new technical write-ups | Founders |
| Product Hunt | Early adopters, backlinks, review page | One launch for Keplar One; a second later for Create when it is a significant iteration | Founders |
| Reddit (r/SideProject, r/ChatGPT, r/artificial, r/learnprogramming, r/studytips; follow each sub's self-promo rules) | Problem-led threads: "how do you check an AI answer?", "AI app builders that break" | 2–3 helpful comments/week; 1 own post per sub per month max | Growth |
| Short video (YouTube Shorts, TikTok, Reels, X) | Create builds are visual; real screen recordings of a build being tested and fixed | 3/week | Growth + creators |
| Creators (micro, dev/student/founder niches) | Lovable/Bolt grew through YouTube/TikTok creators | 2–4 paid or credit-for-review partnerships/month after budget approval; disclosed as #ad | Growth |
| SEO / AI search | `/vs/*`, `/ai-app-builder`, guides, pricing table (LLMs cite pricing and comparison pages) | 1 new high-intent page/week; refresh comparisons monthly | SEO + growth |
| Lifecycle email | Activation and upgrade timing | Behaviour-triggered (drafts above) once a provider is approved | Growth |
| Discord (community) | Build-sharing, weekly build event, support | Open after launch; weekly "Build Friday" | Founders + growth |
| X / LinkedIn (build in public) | Founder voice, changelog moments | X 1/day, LinkedIn 2/week | Founders |

### First 30 days (dates relative to an approved Day 0 launch)
- **Days −14 to −1 (prep):** get five strangers to use the no-signup demo and Create; fix what they hit. Record 6 real build videos (no staged results). Prepare PH assets (gallery, 60-s video, first comment). Draft Show HN text (plain title: "Show HN: Keplar – asks several AI models and shows where they disagree"). Legal review of `/vs/*` and `/compare/*`. Approve lifecycle provider and copy.
- **Day 0 (Tuesday):** Show HN 8–10 am ET; founders answer every comment for the first 2 hours. Post the build-in-public thread on X/LinkedIn.
- **Day 2–3:** Product Hunt at 12:01 am PT from a founder's personal account; ask people to visit and comment, not upvote.
- **Week 1:** 3 short videos (Create: describe → tested app; Ask: a disagreement caught). 2 Reddit contributions per target sub. Publish one guide answering a launch-thread question.
- **Week 2:** Turn the top HN/PH questions into FAQ entries and a guide. Start lifecycle emails (welcome, first-question nudge) if approved. Open Discord; first Build Friday.
- **Week 3:** First creator partnerships (if budget approved). One new high-intent page (e.g. "AI website builder for small business" or a `/vs/` page once approved). Review pricing `from=` funnel and adjust context copy.
- **Week 4:** Retrospective on utm data: keep the two channels with the best sign-up → first answer rate; drop the rest. Decide Create's own PH launch date.

## 6. Needs human decision
1. **Displayed vs billed prices.** The site shows Plus $45 and Pro $99; Whop bills $44.99 and **$99.99** (`BILLED_USD` in `src/lib/growth/dashboard.ts`, verified Oct 3). Pro is billed more than displayed. Align Whop or the site before any launch.
2. **Final prices and Lite.** Lite ($20) is in the grid and table and shows "Checkout opens soon" until its Whop plan id is set. Launch it, or hide it.
3. **Annual plan and discount** (none exists; market median ≈ 20% / "2 months free"). Requires Whop/Stripe annual prices before a toggle is added.
4. **Pay-as-you-go overage**: launch date, multiplier (config default 1.5× provider cost), default cap ($20) and max cap ($500), alert thresholds (50/80/100%). Pricing FAQ says "Coming soon" until the flag is on.
5. **Free daily per-feature limits** (flag `freeDailyLimits`, off): values before turning on; pricing copy currently states only the live 50-question limit.
6. **Launch dates**: Show HN day, Product Hunt day, Create's separate launch.
7. **Budgets**: creator partnerships, any paid social; credits for community build events.
8. **Comparison claims legal review**: `/vs/*` (approved by owner earlier) and `/compare/*` (noindex) before promotion; re-check competitor prices on publish day.
9. **Testimonials and logos**: none are used. Collect only with written consent (name, quote, permission scope) before any appear.
10. **Lifecycle email**: approve copy, triggers, sending provider, unsubscribe handling, and sender name.
11. **Landing copy proposals** in §3 (owned by the landing workstream).
12. **Discord / community moderation** owner and rules.
