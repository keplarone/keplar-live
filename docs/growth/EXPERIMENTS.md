# Experiment backlog

Rules: at most **two major acquisition experiments run at the same time** (X1 and X2). Thresholds below come from [keplar-model.xlsx](keplar-model.xlsx) and are **assumptions**, not evidence, until replaced by measurements. No winners from tiny samples: a result needs the minimum evidence listed; below it the answer is "too early". No experiment spends money, changes live prices or plans, sends unsolicited messages, or posts without a founder.

## Ranked backlog
Score = Impact (1-5) x Confidence (1-5) / (Cost + Effort), where cost (0 = $0, 1+ = needs spending) and effort (1 = hours, 5 = weeks). Confidence is low across the board because nothing has been measured with real users.

| # | Experiment | Type | Impact | Conf. | Cost | Effort | Score | Status |
|---|---|---|---|---|---|---|---|---|
| X3 | Async research form to 20-30 developers/founders the founders already know | learning | 4 | 4 | 0 | 1 | **16.0** | ready (founder sends) |
| X7 | Free-limit message names Lite; track upgrade_click | activation | 3 | 4 | 0 | 1 | 12.0 | needs file owner (KeplarApp/route) |
| X10 | Cancel reason link in account page | retention | 3 | 4 | 0 | 1 | 12.0 | needs file owner |
| X9 | Willingness-to-pay question in research form -> Lite vs Plus fit | pricing | 4 | 3 | 0 | 1 | 12.0 | in the form |
| X1 | **Channel A**: demo clips + dev-community/launch posts | acquisition | 5 | 2 | 0 | 2 | **5.0** | ready (founder posts) |
| X2 | **Channel B**: dated decision guides | acquisition | 4 | 3 | 0 | 3 | **4.0** | ready (drafts exist) |
| X4 | Decision-style starters vs old starters in `/welcome` | activation | 3 | 2 | 0 | 2 | 3.0 | shipped (no A/B); compare before/after only descriptively |
| X5 | Landing variants V1-V3 (campaign/LANDING-VARIANTS.md) | positioning | 3 | 2 | 0 | 2 | 3.0 | wait for >=500 visits per variant |
| X11 | Verifier from a different family than the panel | reliability | 3 | 3 | 0 | 3 | 3.0 | product change (not started) |
| X6 | Trial credits (P2 in OFFER.md) | conversion | 3 | 2 | ~$14 cap | 3 | 1.5 | proposal; needs approval |
| X8 | Referral reward test | acquisition | 3 | 2 | ~$50-341 | 4 | <1 | proposal; after 100 activated |
| X12 | Paid acquisition test | acquisition | ? | ? | needs budget | 3 | - | **proposal only** (the workbook's E11): no budget, loss limit or authorization |

(Ranked by score. X1 and X2 score lower than X3 because they are slow, but they are the only ones that create traffic. X3 is a learning experiment and does not count toward the two-acquisition limit.)

## Experiment cards

### X3. Async research (learning)
- **Hypothesis:** developers and solo founders make recurring technical decisions with AI help, distrust single-model answers, and would value a second opinion with the disagreement shown.
- **Audience/change:** 20-30 people the founders know personally who match the segment; send the research kit ([RESEARCH-KIT.md](RESEARCH-KIT.md)) with the form `/feedback?kind=research&from=<code>`. A person sends each message; nothing automated.
- **Primary metric:** completed forms; share answering the willingness-to-pay question.
- **Guardrails:** no payment promise, no hidden incentive, no pressure; opt-in; consent for quoting.
- **Observation period / minimum evidence:** 14 days; fewer than 10 completed responses = "too early"; do not report percentages under 10 responses.
- **Decision rule:** if >= 6 of the first 10 describe the job as recurring AND at least 3 would pay for it (any price) -> continue with segment; if < 3 recognise the job -> revisit the segment ([SEGMENT.md](SEGMENT.md) runner-up: researchers).

### X1. Channel A: demo clips and developer-community posts
- **Hypothesis:** a short, honest screen demo of a real split (and a real failure) from a decision question produces qualified visits that activate at >= 0.5%.
- **Audience/change:** developers on communities where the rules allow it; 6 clips + 2-3 posts over 6 weeks ([campaign/](campaign/)); destination `/for-developers`, utm-tagged.
- **Primary metric:** visit -> activated rate for utm-tagged visits (consented browsers).
- **Guardrails:** no vote-asking; follow each community's rules; no claims beyond DEMO-RUNS.md; answer every comment honestly; stop if any post is flagged as spam; Free capacity use < 70% of ~150 questions a day (alert before a launch day).
- **Observation / minimum evidence:** >= 500 qualified visits from the channel (or 6 pieces published), and >= 30 activated users before any rate is quoted.
- **Decision rule (assumption thresholds):** activated rate >= 1.1% = strong (Base); 0.5-1.1% = continue and improve; < 0.25% with >= 500 visits = stop or change the format; if < 100 visits per piece, fix the distribution not the message.

### X2. Channel B: dated decision guides
- **Hypothesis:** guides built on saved multi-model runs for specific developer decisions earn indexed impressions and qualified visits that activate at >= 0.5%.
- **Audience/change:** developers searching "X vs Y"; 1 guide every 1-2 weeks (first 5 are ready from R1-R5).
- **Primary metric:** qualified organic visits per guide and their activated rate; secondary: indexed pages and impressions (needs Search Console property verified by the owner).
- **Guardrails:** no thin variants; every guide has original run data with date/models; no unverified comparative claims; noindex nothing public by accident.
- **Observation / minimum evidence:** 8 weeks and >= 3 indexed guides; >= 500 organic visits before a rate is quoted.
- **Decision rule:** continue if monthly organic qualified visits grow for 3 consecutive weeks; stop adding guides if after 8 guides there are < 200 qualified visits a month.

### X7. Free-limit message names the right plan
- **Hypothesis:** naming Lite ($20) at the limit raises upgrade clicks relative to naming Plus ($45).
- **Primary metric:** `upgrade_click` per limit hit. **Guardrails:** message stays factual, shows the reset time, no countdowns. **Minimum evidence:** 100 limit hits. **Decision:** keep if clicks do not fall; no statistical claim below 100.

### X10. Cancellation reason (never blocking)
- **Hypothesis:** a one-click optional reason gives actionable churn causes. **Metric:** share of cancellers who leave a reason (target is information, not a high rate). **Guardrail:** cancel works with zero extra steps; the link is secondary. **Minimum evidence:** 10 cancellations before concluding any pattern.

### X4/X5. Message and starter tests
Sequential, not simultaneous with X1/X2 sources, and only after >= 500 visits per variant; otherwise record descriptively only.

### X6. Trial credits (proposal)
**Hypothesis:** letting a verified Free user try the premium panel (25 credits ~ 5 tasks, $0.046 each, cap $13.65 a month) lifts Free -> paid compared with no trial. **Metric:** paid conversion at 30 days. **Guardrails:** one grant per verified email, global cap. **Minimum evidence:** 100 trial users and 100 matched non-trial users; below that, descriptive only. **Needs approval before any build.**

## Cadence
Weekly review (Fridays, 30 minutes, both founders): dashboard numbers, each running experiment's minimum-evidence counter, a "too early / continue / stop" call, and a note in PROGRESS.md. Archive each finished experiment with its numbers (including negative results).
