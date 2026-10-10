# 8 publish-ready educational posts

Each post is complete, uses only facts from [DEMO-RUNS.md](DEMO-RUNS.md) (runs on **3 Oct 2026, Keplar Free plan, free models**) plus clearly marked general engineering knowledge, and ends with one link. Publish on keplar.one first (canonical), then cross-post to DEV/Hashnode with the canonical URL set. A founder posts under their own account; nothing is auto-posted. Header lines show the user problem, capability demonstrated, and the measurable next step.

---
## P1. JSONB column or a normalized table for settings that keep changing?
*Problem: schema choice for evolving preferences. Capability: R1. Next step: visits to the example-1 prompt, copy action. Link: `/for-developers?utm_source=<platform>&utm_campaign=p1-jsonb`*

You have a `user_preferences` feature, the shape changes every sprint, and you are the only developer. JSONB or a table with one row per preference?

On 3 Oct 2026 I asked three free AI models through Keplar: *"I'm a solo developer. JSONB column or a normalized table for user preferences whose shape keeps changing? Pick one and say what would change your mind."* All three (Qwen3.8 27B, Nemotron 3 Super, Dots3-Note Preview, free versions) said JSONB. The combined answer: JSONB avoids migration overhead and handles evolving shapes; add GIN or expression indexes for keys you query; switch to a normalized table when you need joins across preferences, strict constraints such as foreign keys and rigid typing, or when large JSONB rows cause measured performance problems.

Three models agreeing is a good sign, not proof. So turn the answer into a test you can run on your own data:
1. Do you filter or join on individual preference keys in hot queries? If yes, index them, and measure.
2. Do any preferences need referential integrity or a strict type? Those belong in columns.
3. How big do the JSON documents get? Check row sizes after a week of real use.
4. Will analytics need to count by preference? A view or a generated column can help before you migrate.

If all four answers are "no", JSONB is fine. *(The checklist is general engineering practice, not from the models.)*

Ask your own version of this decision, free and without an account: keplar.one/for-developers

---
## P2. JWT in localStorage or httpOnly cookie?
*Problem: security decision. Capability: R2 (3 of 3, 9.5 s). Next step: guide visits -> checklist copy.*

Asked on 3 Oct 2026 (Keplar, Free plan): *"Is it safe to store JWTs in localStorage for a single-page app, or must I use httpOnly cookies? Give a definite answer."* All three free models answered httpOnly cookies, because any script on the page, including injected XSS, can read localStorage and exfiltrate the token, while an httpOnly cookie is not readable by JavaScript.

What the models did not stress (our addition, general practice): cookies change the risk rather than remove it. You then need CSRF protection (SameSite attributes, anti-CSRF tokens or checking the Origin header), `Secure`, and a short token lifetime with rotation. And an httpOnly cookie does not stop injected script from making requests while the user is on the page; it stops theft of the token itself. Decide with: where can untrusted script run in your app? Do you control the API domain (cookies) or is it third-party (tokens in headers)?

Agreement among three models told us the common advice. It did not tell us whether it fits your architecture. Try your own variant: keplar.one/for-developers

---
## P3. Should a two-person startup rewrite a working Node.js backend in Rust?
*Problem: premature rewrite. Capability: R3. Next step: example-3 prompt starts.*

Question asked on 3 Oct 2026: *"Is it a good idea for a two-person startup to rewrite a working Node.js backend in Rust before it has any paying customers? Give the strongest counterargument too."* Two of three free models responded (Gemma 4 31B failed; Keplar said so). Both said no: a rewrite consumes scarce capacity before product-market fit and destabilizes something that works. A reviewer pass then flagged that the first draft ignored a real case for rewriting, and the final answer added it: a rewrite can be justified if measured performance or operating-cost bottlenecks already stop the product from working.

The takeaway is a rule you can use: *do not rewrite for scale you do not have; do it when a measured bottleneck blocks the product.* Write down the measurement that would convince you before you start. (Note: the final text also contained a "where the models disagree" passage although both responding models agreed; we found that and tightened the synthesis prompt the same day; on a re-run the section now says the models do not disagree, but it can still appear.)

keplar.one/for-developers

---
## P4. Postgres, DynamoDB or MongoDB for a two-person multi-tenant app?
*Problem: database choice. Capability: R4 (3 of 3 PostgreSQL; 40.5 s, the slowest run).*

Asked 3 Oct 2026: *"Compare Postgres, DynamoDB and MongoDB for a multi-tenant app run by two people. Which would you pick?"* All three models picked PostgreSQL, citing row-level security for tenant isolation, ACID guarantees and less application-level code; they described DynamoDB as needing careful key design and MongoDB as needing extra logic for cross-tenant integrity. (The written answer also included a "where the models disagree" paragraph about managed NoSQL; the models did not disagree, so ignore it. We tightened the prompt the same day; the section can still appear but now says they agree.)

What to check yourself: how many tenants and how uneven they are (a few huge tenants behave differently from thousands of small ones), whether you need cross-tenant analytics, and what your team already operates. Row-level security is an isolation aid, not a substitute for testing that tenant A cannot read tenant B's data.

keplar.one/for-developers

---
## P5. Monorepo or separate repositories for a two-person Next.js SaaS?
*Problem: repo structure. Capability: R5 (3 of 3, 9.7 s).*

Asked 3 Oct 2026: *"Should a two-person team building a Next.js SaaS use a monorepo or separate repositories for the web app and the API? Pick one."* All three: monorepo, because atomic commits keep shared types in sync and there is one pipeline and one set of permissions to maintain. Questions to ask before you agree: do you need different deploy cadences or access control per part, and will an outside contractor need access to only one? If neither, one repo is less work.

keplar.one/for-developers

---
## P6. Three AI models agreed on the Node.js LTS version, and were all out of date
*Problem: trusting version facts. Capability: R6. Next step: essay reads -> `/for-developers`.*

On 3 Oct 2026 I asked three free models for the current Node.js LTS. Two said Node 22 (entered LTS October 2024); one said Node 20. Keplar flagged the 2-1 split, weighed it, and chose Node 22. The nodejs.org release list that day showed Node 24 as LTS, Node 22 also in LTS, Node 26 as Current, and Node 20 at end of life. So the *split* was the right signal and the *majority* was still wrong.

Two lessons. First, models have training cutoffs; questions about "current" versions, prices and APIs need a primary source. Keplar has no live web lookups yet and says "Keplar can be wrong, even when models agree." Second, a disagreement display is useful precisely because it makes you look at the part that is uncertain. Check the source. We saved the raw stream of that run.

---
## P7. How to read "3 of 3 models agree"
*Problem: over-trusting agreement. Capability: R1-R6. Next step: Disagreements/Verification opened.*

Keplar's badge reads "N of M models" and "Models agree", "Models split" or "No majority". It is a count of positions, not a score of correctness. In our 12 multi-model runs on 3 Oct 2026, ten ended in agreement and two in a visible split; in three runs one of the three models had failed or timed out, and the answer said so. Reading order: (1) the answer; (2) the count; (3) Disagreements, if any; (4) Verification: what the reviewer changed; (5) your own check for anything that changes weekly. Agreement is a good sign, never proof. Several models can share one mistake, as the Node LTS run showed.

---
## P8. What we tested before telling anyone (13 runs, one afternoon)
*Problem: unverified product claims. Capability: all runs. Next step: feedback form submissions.*

Before writing this, we ran 13 real questions through the live Free plan (free models, anonymous, 3 Oct 2026). Results: median time to an answer 18.8 s (range 9.5-40.5 s); two visible splits (Node LTS, mortgage prepay vs invest); three runs where one of three models failed or timed out; one single-model answer that was wrong (letter counting: 7 instead of 9); one run where the reviewer revised the draft; and a bug where the written answer invented a "where the models disagree" section when everyone agreed, which we then reduced. It is a small, informal test, not a benchmark. We saved the raw streams for the runs we quote and can share them on request. If you try Keplar and it gets something wrong, tell us: keplar.one/feedback?kind=problem
