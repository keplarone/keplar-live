---
title: What is AI "deep research", and when is it worth using?
description: Deep research modes run many searches and read many pages to produce a report. What they do, what they cost, where they fail, and how to judge a report.
category: How AI works
published: 2026-10-03
updated: 2026-10-03
keywords: deep research AI, ChatGPT deep research, Gemini deep research, AI research report, agentic research
related: /docs/using-keplar/deep-research, /blogs/how-to-check-an-ai-answer, /blogs/what-is-an-ai-agent
---

Several major assistants now offer a "deep research" mode. ChatGPT and Gemini, for example, list a research feature along these lines on their public pages (accessed October 3, 2026), under different names and with different limits, and other assistants have similar modes. The idea is to go beyond a single reply: the system plans a set of sub-questions, searches or reads many sources, and writes a longer report, often with citations.

## How it works in general

1. **Plan.** The system breaks your topic into questions to investigate.
2. **Gather.** It searches the web or other sources, opens pages and extracts relevant passages.
3. **Reason.** It reads what it found, notes conflicts and decides what else to look for.
4. **Write.** It assembles a structured report, usually with source links.

Different products implement each step differently, and details are rarely published. The runtime can be minutes rather than seconds, and usage limits are tighter than for ordinary chat because the work is much heavier.

## What it is good for

- Surveying a topic you are new to, to find the main positions and key sources.
- Comparing products or approaches across many pages.
- Gathering background before writing, interviewing or buying.
- Finding primary documents and starting points for your own reading.

## Where it falls short

- **Source quality.** It may rely on low-quality pages, marketing copy or forums if they rank well.
- **Misreading.** A report can attribute a claim to a source that does not say it.
- **Thin coverage.** It might miss paywalled, offline or non-English material.
- **False completeness.** A long, polished report looks authoritative.
- **Stale or conflicting data.** Different pages disagree and the report may pick one silently.
- **Inventing connections.** The synthesis step can make smooth links between facts that do not belong together.
- **Cost.** It uses far more compute, hence the limits. A research run that goes wrong costs more to repeat than a chat that goes wrong, so scope the question carefully before you start.

## Judging a deep research report

1. Open a handful of the cited sources, especially for the claims that carry the argument.
2. Check that quotes and numbers match.
3. Look at the mix of sources: primary documents, reputable outlets, or only blogs?
4. Check dates. Is "latest" actually latest?
5. Look for what is missing: counterarguments, limitations, uncertainty.
6. Ask the tool what it could not find or access.
7. For decisions, treat the report as a reading list.

## When it is not worth it

- Simple factual questions, where a normal answer is faster and cheaper.
- Subjective or creative requests.
- Topics where you already know the key sources: read them.
- When you cannot spend time checking the output. An unchecked report is only a more elaborate guess.

## A realistic example

Imagine you are choosing between two ways of heating a home and want a balanced picture. A normal chat answer gives you a tidy comparison from memory. A deep research run would instead split the job into parts, such as installation cost ranges, running costs in your climate, incentives that exist where you live, maintenance, and common complaints, and read pages on each. The result is a longer document with links. The useful part is the links: they are your reading list. The risky part is the confident summary on top, which compresses disagreements between sources. If incentive rules matter to your decision, open the program's own page and check the date on it. If a number in the report differs from the number on the official page, the official page wins.

## Questions to ask before you start

- What exactly do I want to know, and what would change my decision?
- Which sources would I trust most? Can I tell the tool to prefer them?
- How current does the information need to be?
- How will I check the result, and how much time do I have for that?

Writing these down first makes the report easier to judge and the run cheaper to repeat.

## FAQ

### Is deep research always more accurate than regular chat?

No. It can find more information, and it can also make errors at larger scale.

### How long does it take?

Minutes, typically, depending on the product and topic.

## How Keplar approaches this

Keplar has a Deep Research option on Plus and above. It is one of the heaviest things you can run: a typical run is estimated at about 1,200 credits, and the composer shows how many runs your remaining allowance covers. Because it is costly, a run that does not fit your allowance stops before any model is called.

Keplar's other live-web behavior is limited: normal questions do not use live web lookups. In Deep Research, models cite sources, and those citations are shown labeled "Cited by <model>; Keplar didn't open or check." Keplar does not open the pages to verify them, and has no accuracy score, so the judging steps above remain yours. Read [Deep Research](/docs/using-keplar/deep-research) for what it does and what it costs.
