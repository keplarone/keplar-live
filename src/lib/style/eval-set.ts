/**
 * Response-style eval set: 16 prompts (6 with attachments) and a reference answer for each, written to the target style
 * (answer first, plain words, short paragraphs, US grade ~8–10 for general questions). tests/response-style.test.ts
 * checks every reference with the readability meter; `scoreAnswers` scores real model answers the same way, so a live
 * run (answers collected from the API) can be compared against the target.
 */
import { checkPresence, checkStyle, type StyleVerdict } from "./readability";

export type StyleCase = {
  id: string;
  prompt: string;
  /** What is attached, when the case tests grounding in material. */
  attachments?: { kind: "pdf" | "csv" | "link" | "image" | "video" | "code" | "docx" | "audio"; name: string; about: string }[];
  /** General audience (grade ≤ 11) or expert/technical (grade ≤ 14). */
  general: boolean;
  /** Words or facts a good answer must include (grounding cases: things only the attachment says). */
  mustMention: string[];
  reference: string;
};

export const STYLE_EVAL: StyleCase[] = [
  {
    id: "why-sky-blue",
    prompt: "Why is the sky blue?",
    general: true,
    mustMention: ["scatter"],
    reference: `The sky looks blue because the molecules in air scatter short blue wavelengths of sunlight far more strongly than longer red ones.

Sunlight contains every visible color. When it passes through the atmosphere, nitrogen and oxygen molecules redirect blue light in every direction, an effect called Rayleigh scattering. Red and yellow light mostly continue in a straight line, so the blue reaches your eyes from every part of the sky.

At sunset, sunlight crosses much more atmosphere before it reaches you. Most of the blue is scattered away along that longer path, which leaves the reds and oranges you see near the horizon.`,
  },
  {
    id: "index-fund",
    prompt: "Should I put my savings in an index fund or a savings account?",
    general: true,
    mustMention: ["emergency"],
    reference: `Keep money you might need within a few years in a savings account, and invest long-term money in a low-cost index fund.

A savings account is safe and immediately available, but its interest rarely beats inflation by much. An index fund, a single investment that holds hundreds of companies, has historically grown much faster over decades. It can also fall 30% or more in a bad year, so it suits money you can leave alone.

A sensible order is to build an emergency fund covering three to six months of expenses first. After that, money you won't touch for at least five years usually belongs in the index fund. If you share your rough numbers, I can help you split them.`,
  },
  {
    id: "sleep-memory",
    prompt: "Does sleep actually help you remember things?",
    general: true,
    mustMention: ["deep sleep"],
    reference: `Yes. Sleep plays an active role in turning the day's experiences into lasting memories.

During deep sleep, the brain replays recent experiences and transfers them from short-term storage in the hippocampus to longer-term networks in the cortex. In controlled studies, people who sleep after learning remember noticeably more the next day than people who stay awake for the same amount of time.

Losing a single night of sleep also makes it harder to absorb new information the following day. Before an exam, a full night of sleep is usually worth more than two extra hours of late-night studying.`,
  },
  {
    id: "explain-inflation",
    prompt: "Explain inflation like I'm busy.",
    general: true,
    mustMention: ["prices"],
    reference: `Inflation is the general rise in prices over time, which means the same amount of money buys a little less each year.

It usually happens when demand for goods outpaces what the economy can produce, or when major costs such as energy suddenly increase. Most central banks aim to keep inflation around 2% a year. To slow it down, they raise interest rates, which makes borrowing more expensive and gradually cools spending.`,
  },
  {
    id: "rust-vs-go",
    prompt: "Rust or Go for a new backend service that has to handle a lot of traffic?",
    general: false,
    mustMention: ["garbage collector"],
    reference: `Choose Go unless you need maximum performance or precise control over memory; in that case, choose Rust.

Go is straightforward to learn, compiles quickly and lets a team ship a reliable service in weeks. Its garbage collector, the runtime component that frees unused memory automatically, introduces brief pauses, but they rarely matter for typical web traffic. Plenty of high-volume APIs run comfortably on Go.

Rust has no garbage collector, so tail latency, the slowest responses under heavy load, stays flat and memory usage stays low. The trade-off is a steeper learning curve and slower early development. It is the stronger choice for proxies, databases and other performance-critical components.`,
  },
  {
    id: "sql-index",
    prompt: "My Postgres query got slow after the table grew to 10 million rows. What should I check first?",
    general: false,
    mustMention: ["EXPLAIN ANALYZE", "index"],
    reference: `Start by running \`EXPLAIN ANALYZE\` on the slow query, because it shows exactly how Postgres executes it and where the time goes.

If the plan shows a sequential scan across the large table, create an index on the columns used in your \`WHERE\` and \`JOIN\` conditions. When a query filters and then sorts, a composite index that matches that order often removes most of the cost.

Next, confirm that table statistics are current by running \`ANALYZE\`, since outdated statistics lead the planner to choose poor strategies. If the plan already uses an index, compare estimated rows with actual rows; a large difference usually points directly at the underlying problem.`,
  },
  {
    id: "photosynthesis-kid",
    prompt: "How do plants eat?",
    general: true,
    mustMention: ["sunlight"],
    reference: `Plants make their own food from sunlight, water and carbon dioxide through a process called photosynthesis.

Their leaves contain chlorophyll, a green pigment that captures energy from sunlight. The plant uses that energy to combine water absorbed by its roots with carbon dioxide taken from the air, producing a sugar called glucose. The plant burns this sugar for energy and uses it to build new leaves, stems and roots.

Oxygen is released as a by-product. Photosynthesis is the source of nearly all the oxygen animals and people breathe.`,
  },
  {
    id: "learn-language",
    prompt: "What's the fastest way to get conversational in Spanish?",
    general: true,
    mustMention: ["speak"],
    reference: `Start speaking in your first week and practice a little every day, because regular conversation builds fluency faster than any app on its own.

Begin with the 500 most common words and a set of everyday phrases. Together they cover most ordinary conversation. Then book short sessions with a tutor or language partner, even 20 minutes three times a week, so you get used to replying in real time.

Fill the remaining time with listening you genuinely enjoy, such as Spanish podcasts or television series. Learners who follow this routine can usually hold simple conversations within three to six months.`,
  },
  {
    id: "climate-short",
    prompt: "Is climate change really caused by humans?",
    general: true,
    mustMention: ["carbon dioxide"],
    reference: `Yes. The scientific evidence that human activity is causing today's global warming is overwhelming.

Burning coal, oil and natural gas releases carbon dioxide, a gas that traps heat in the atmosphere. Its concentration has risen roughly 50% since the Industrial Revolution, and the warming pattern we measure matches that increase. Natural factors, such as changes in the sun's output, cannot explain the observed trend.

Every major scientific organization accepts this conclusion. The remaining debates concern how quickly warming will progress and which responses are most effective.`,
  },
  {
    id: "debug-react",
    prompt: "Why does my React component render twice in development?",
    general: false,
    mustMention: ["Strict Mode"],
    reference: `It's React Strict Mode, which deliberately renders components twice in development to expose unintended side effects.

The double render happens only in development builds; production renders each component once. If the second render causes a visible problem, your component probably performs a side effect during rendering, such as fetching data or updating a counter. Move that work into \`useEffect\` or an event handler.

Avoid disabling Strict Mode to make the symptom disappear. The duplicate render is revealing a genuine bug that could surface later in production.`,
  },
  {
    id: "pdf-lease",
    prompt: "Can I end this lease early, and what would it cost?",
    attachments: [{ kind: "pdf", name: "lease.pdf", about: "12-month lease; section 14 allows early end with 60 days' notice and a fee of two months' rent ($3,600)" }],
    general: true,
    mustMention: ["60 days", "$3,600", "section 14"],
    reference: `Yes. Section 14 of your lease allows you to end it early if you give 60 days' written notice.

The early termination fee is two months' rent, which comes to $3,600 under this agreement (page 6). The lease doesn't specify whether the landlord may also keep your security deposit in this situation, so confirm that before you give notice.

Send your notice in writing and keep a dated copy, since the 60-day period starts from the date the landlord receives it.`,
  },
  {
    id: "csv-sales",
    prompt: "Which region sold the most, and is anything odd in this data?",
    attachments: [{ kind: "csv", name: "sales.csv", about: "4 regions; West has the highest total (412 units); March has 3 missing values" }],
    general: true,
    mustMention: ["West", "412", "missing"],
    reference: `The West region sold the most, with 412 units in total across the period in the file.

One issue stands out: March has three missing values, which makes that month's totals artificially low. Fill in or exclude those rows before comparing months, or the trend will look worse than it really is.

These figures come directly from the statistics Keplar calculated on the full file, so they are exact rather than estimated.`,
  },
  {
    id: "link-article",
    prompt: "Summarize this article and tell me if the main claim holds up. https://example.com/four-day-week",
    attachments: [{ kind: "link", name: "example.com — The four-day week trial", about: "UK trial, 61 companies, 56 kept the four-day week; revenue roughly flat; self-reported data" }],
    general: true,
    mustMention: ["61", "56", "self-reported"],
    reference: `The article argues that a four-day week kept productivity steady, and the trial it describes supports that, with one important catch.

In the UK pilot, 61 companies reduced their schedules to four days, and 56 continued the arrangement after the trial ended. Revenue remained roughly unchanged, while employees reported lower stress and less burnout.

The catch is that most results were self-reported by companies that chose to take part. That makes the findings encouraging, but not proof that the idea works in every industry.`,
  },
  {
    id: "image-chart",
    prompt: "What does this chart show?",
    attachments: [{ kind: "image", name: "chart.png", about: "line chart of monthly signups, flat Jan–Apr near 200, jump to 900 in May after a launch annotation" }],
    general: true,
    mustMention: ["May", "900"],
    reference: `The chart shows monthly signups holding steady at about 200 from January to April, then jumping to roughly 900 in May.

The increase coincides with the product launch annotated on the chart, which suggests the launch drove the change. Before that point, the line barely moves at all.

A single month isn't enough to confirm a lasting trend. June's figure will show whether the launch produced sustained growth or a one-time spike.`,
  },
  {
    id: "video-talk",
    prompt: "What are the main points of this talk?",
    attachments: [{ kind: "video", name: "talk.mp4", about: "3-minute talk; key scenes plus transcript; points at 0:20 (ship small), 1:10 (measure), 2:30 (talk to users)" }],
    general: true,
    mustMention: ["0:20", "1:10", "2:30"],
    reference: `The talk makes three main points about building products: release small changes, measure their effect, and speak with users regularly.

At 0:20, the speaker argues for small, frequent releases, because mistakes in them are cheap and quick to reverse. At 1:10, she recommends choosing one metric that clearly shows whether a change helped. At 2:30, she closes by urging teams to talk with five users every week, since data reveals what happened but rarely explains why.`,
  },
  {
    id: "code-zip",
    prompt: "How is this project organized, and where should I add a new API route?",
    attachments: [{ kind: "code", name: "app.zip", about: "Next.js app; routes in src/app/api; shared helpers in src/lib; tests in tests/" }],
    general: false,
    mustMention: ["src/app/api", "src/lib"],
    reference: `It's a Next.js application. Add your new endpoint as a folder under \`src/app/api\` containing a \`route.ts\` file.

Pages and API routes live in \`src/app\`, while shared code such as the database client and authentication helpers sits in \`src/lib\`. Import from those helpers rather than duplicating their logic. Tests are in \`tests/\` and mirror the names of the files they cover.

Copy the structure of an existing route, including its validation and error handling, so the new endpoint behaves consistently with the rest of the application.`,
  },
];

/** Answers that break the style on purpose (the meter must catch them). */
export const STYLE_COUNTEREXAMPLES: { id: string; answer: string }[] = [
  {
    id: "preamble-jargon",
    answer: `Great question! In order to comprehensively address the multifaceted considerations inherent in determining the optimal allocation of discretionary capital between instruments characterized by heterogeneous volatility profiles, it is essential to contextualize the individual's idiosyncratic liquidity requirements, intertemporal consumption preferences, and overall risk tolerance within a holistic financial planning framework that incorporates macroeconomic variables.`,
  },
  {
    id: "wall-of-text",
    answer: `There are many factors. Each matters. Some matter more. Context is key. Timing also counts. Costs add up. Risks exist. Rewards vary. People differ. Goals change. Markets move. Plans adapt. Advice helps. Research pays. Patience wins.`,
  },
];

export type StyleScore = { id: string; verdict: StyleVerdict; missing: string[] };

/** Score answers (by case id) against the target style and the facts each case must mention. */
export function scoreAnswers(answers: Record<string, string>): { scores: StyleScore[]; pass: number; meanGrade: number } {
  const scores = STYLE_EVAL.filter((c) => answers[c.id]).map((c) => {
    const a = answers[c.id];
    return { id: c.id, verdict: checkStyle(a, { general: c.general }), missing: c.mustMention.filter((m) => !a.toLowerCase().includes(m.toLowerCase())) };
  });
  const general = scores.filter((s) => STYLE_EVAL.find((c) => c.id === s.id)?.general);
  return {
    scores,
    pass: scores.filter((s) => s.verdict.ok && !s.missing.length).length,
    meanGrade: +(general.reduce((a, s) => a + s.verdict.r.grade, 0) / Math.max(1, general.length)).toFixed(1),
  };
}

/* ── Presence: before/after cases (PRESENCE_STYLE in ./clarity.ts) ─────────────────────────────────────────────── */

export type PresenceBehavior = "acknowledge" | "reasoning" | "no-reasoning" | "uncertainty" | "context" | "create-narration";

export type PresenceCase = {
  id: string;
  behavior: PresenceBehavior;
  /** Earlier turns in the thread, when the case is about using context. */
  thread?: { role: "user" | "assistant"; text: string }[];
  /** Signals the pipeline had (e.g. the panel models disagreed). */
  signals?: string;
  prompt: string;
  general: boolean;
  /** Pattern-matched answer: generic, padded, blind to the person or context. */
  before: string;
  /** Attentive answer in Keplar's style. */
  after: string;
  /** Each must match the "after" answer; at least one must fail on "before" (or checkPresence must flag it). */
  expect: RegExp[];
  /** Must NOT match the "after" answer. */
  avoid?: RegExp[];
};

export const PRESENCE_EVAL: PresenceCase[] = [
  {
    id: "frustrated-build",
    behavior: "acknowledge",
    prompt: "this stupid build keeps failing with \"Module not found: Can't resolve 'fs'\" and I've wasted two hours on it",
    general: false,
    before: `Great question! The error "Module not found: Can't resolve 'fs'" is a common issue that many developers encounter. There are several possible causes for this error, and it's important to understand the differences between server and client environments. Here are some things you could try:

1. Check your imports.
2. Update your dependencies.
3. Clear your cache.

I hope this helps! Let me know if you have any other questions.`,
    after: `Two hours on one import error is rough, so here's the direct fix: a file that runs in the browser is importing \`fs\`, which only exists on the server.

Find the import chain. Usually a component marked \`"use client"\` imports a helper that reads files. Move the file reading into a server component, a route handler or a server action, and pass the result down as props.

If the import comes from a library, check whether it has a browser build. Mapping \`fs\` to \`false\` in the bundler config silences the error but breaks that code path, so treat it as a last resort.`,
    expect: [/rough|annoying|maddening|two hours/i, /server/i, /^[^\n]{0,200}fix/i],
  },
  {
    id: "urgent-meeting",
    behavior: "acknowledge",
    prompt: "meeting in 5 min — difference between gross margin and net margin??",
    general: true,
    before: `Certainly! Understanding the difference between gross margin and net margin is essential for anyone involved in business finance. Both metrics are important indicators of a company's profitability, but they measure different things. Let me explain each one in detail.

Gross margin is a financial metric that represents the percentage of revenue that exceeds the cost of goods sold. It is calculated by subtracting COGS from revenue and dividing by revenue. Net margin, on the other hand, is a more comprehensive measure that takes into account all expenses, including operating expenses, interest, taxes, and other costs. In summary, gross margin focuses on production efficiency while net margin reflects overall profitability. Feel free to ask if you need more details!`,
    after: `Quick version for your meeting:

**Gross margin** is what's left after the direct cost of making the product. **Net margin** is what's left after every cost, including salaries, rent, interest and taxes.

Example: sell for $100, it costs $60 to make, and all other costs are $30. Gross margin is 40%; net margin is 10%.`,
    expect: [/quick|short version/i, /after every cost|all (other )?costs/i, /40%/],
  },
  {
    id: "excited-first-users",
    behavior: "acknowledge",
    prompt: "I just got my first 100 users!! what should I focus on next?",
    general: true,
    before: `That's absolutely amazing!!! I'm so excited for you! Congratulations on this incredible milestone! You've got this!

There are many things you could focus on next, such as marketing, product development, customer feedback, fundraising, hiring, and partnerships. Each of these areas is important for growth. Ultimately, the right focus depends on your specific situation and goals. I hope this helps!`,
    after: `Congratulations, 100 real users is the point where you can finally learn from behavior instead of guesses.

Focus on retention before growth. Check how many of those 100 came back in their second week. If it's under about 20%, more sign-ups will mostly leak away, so talk to the ones who stayed and the ones who left and fix what you hear.

If retention looks healthy, double down on whichever channel brought your most active users, rather than adding new channels.`,
    expect: [/congratulations/i, /retention|came back/i, /\d+%/],
    avoid: [/!!/, /i'?m so excited/i],
  },
  {
    id: "job-offer-tradeoff",
    behavior: "reasoning",
    thread: [{ role: "user", text: "We just bought a house, so money is tight for the next couple of years." }],
    prompt: "Should I take the startup offer (lower salary + equity) or the big company one?",
    general: true,
    before: `Both options have pros and cons. Startups offer equity, a fast-paced environment and learning opportunities, while big companies offer stability, higher salaries and better benefits. Ultimately, the decision depends on your personal circumstances, risk tolerance and career goals. Consider making a pros and cons list to help you decide.`,
    after: `Given the new mortgage, I'd lean toward the big-company offer, unless the startup salary still covers your costs with room to spare.

I'm weighing two things: a steady income matters most for the next couple of years, and startup equity usually takes five or more years to be worth anything, if it ever is. Most startup equity ends up worth little, so treat it as a lottery ticket, not part of your budget.

What would change my answer: if the startup pays within about 10–15% of the other offer, or if this role would teach you something you can't get elsewhere. In that case the risk may be worth it.`,
    expect: [/mortgage|house/i, /i'?m weighing|because/i, /would change my answer|what would change/i],
  },
  {
    id: "trivial-no-reasoning",
    behavior: "no-reasoning",
    prompt: "What's the capital of Australia?",
    general: true,
    before: `I'm weighing a few possibilities here, because many people assume it's Sydney, the largest city, or Melbourne, which was the temporary capital. After considering the history, I believe the answer is Canberra, which was purpose-built as a compromise between those two cities.`,
    after: `Canberra. It was built as a compromise between Sydney and Melbourne, which both wanted the title.`,
    expect: [/^Canberra/],
    avoid: [/i'?m weighing|after considering|i believe/i],
  },
  {
    id: "rates-uncertain",
    behavior: "uncertainty",
    signals: "Panel split: two models expected cuts, one expected rates to hold. Confidence: low.",
    prompt: "Will interest rates drop next year?",
    general: true,
    before: `Yes, interest rates will drop next year. Inflation is cooling and the economy is slowing, so central banks will cut rates several times, which will make mortgages and loans cheaper.`,
    after: `Probably somewhat, but nobody can say for sure, and the models I consulted split on it.

Two expected cuts because inflation has been cooling. One expected rates to hold because wage growth is still strong. Both are reasonable readings of the same data.

What would settle it is the next few inflation reports: if prices keep rising more slowly, cuts become much more likely. If you're deciding on a mortgage, plan for rates staying where they are and treat a cut as a bonus.`,
    expect: [/nobody can say for sure|not (sure|certain)|uncertain/i, /models.*split|split on it|disagree/i, /would settle/i],
    avoid: [/\bwill drop\b/i],
  },
  {
    id: "car-cost-missing-detail",
    behavior: "uncertainty",
    prompt: "How much will it cost to fix my check engine light?",
    general: true,
    before: `Fixing a check engine light typically costs around $350.`,
    after: `It depends on what triggered the light, so the honest range is anywhere from about $0 to $1,500 or more.

A loose gas cap costs nothing to fix. An oxygen sensor usually runs $150–$400, and a catalytic converter can be $1,000–$2,500.

What would settle it is the error code. Many auto parts stores read it for free, and once you have the code (for example P0420), I can give you a much tighter estimate.`,
    expect: [/it depends|honest range/i, /would settle/i, /\$\d/],
  },
  {
    id: "dinner-uses-context",
    behavior: "context",
    thread: [
      { role: "user", text: "I'm vegetarian and I only have about 20 minutes on weeknights." },
      { role: "assistant", text: "Got it. Quick vegetarian meals it is." },
    ],
    prompt: "ok give me a dinner idea for tonight",
    general: true,
    before: `How about a classic chicken stir-fry? Marinate chicken breast in soy sauce and garlic for an hour, then cook it with vegetables and serve over rice. It takes about 45 minutes in total.`,
    after: `Chickpea and spinach curry, which fits your 20 minutes and is fully vegetarian.

Fry an onion with garlic and curry paste for 3 minutes. Add a drained can of chickpeas, a can of coconut milk and two handfuls of spinach, then simmer for 10 minutes. Serve it with microwave rice or naan.`,
    expect: [/20 minutes/i, /vegetarian|chickpea/i],
    avoid: [/chicken|beef|pork/i],
  },
  {
    id: "create-yoga-booking",
    behavior: "create-narration",
    prompt: "Build a booking site for my yoga studio",
    general: true,
    before: `I have built your yoga studio booking website. It includes a home page, a booking page, and an admin page. The site uses modern technologies and a responsive design. Enjoy your new website!`,
    after: `I built a booking site for your studio: a calm home page with this week's classes, a three-step booking flow, and an admin view for your schedule.

- **Booking flow first.** The class schedule sits on the home page, so a visitor can book in two taps. Most studio visitors arrive wanting to book a specific class, not to read about the studio.
- **Simple accounts.** People book with just a name and email, and a magic link lets them see their bookings later. That keeps booking quick, but it means no saved payment details yet.
- **Assumptions to check:** I guessed six class types, 60-minute sessions and opening hours of 7am–8pm. You can change all of these in the admin view.`,
    expect: [/because|so a visitor|that keeps/i, /but it means|trade|no saved/i, /assum|guessed/i],
  },
];

/** Score a presence answer: style, presence filters, expectations and avoid-list. */
export function scorePresence(c: PresenceCase, answer: string): { ok: boolean; problems: string[] } {
  const problems = [...checkPresence(answer).problems];
  const style = checkStyle(answer, { general: c.general });
  problems.push(...style.problems);
  c.expect.forEach((rx, i) => { if (!rx.test(answer)) problems.push(`misses expectation ${i + 1} (${rx.source.slice(0, 40)})`); });
  for (const rx of c.avoid ?? []) if (rx.test(answer)) problems.push(`contains avoided pattern (${rx.source.slice(0, 40)})`);
  return { ok: problems.length === 0, problems };
}
