/**
 * Lifecycle email templates: DRAFTS ONLY. Nothing imports this module to send mail, and nothing should until the co-founders
 * approve the copy, the triggers and the sending provider (docs/growth-marketing.md, "Needs human decision").
 *
 * Rules: triggered by what a person did (or didn't do), not by a calendar; one clear next step per email; no urgency,
 * countdowns, fake scarcity, statistics, testimonials or claims about accuracy; every email names why it was sent and
 * carries an unsubscribe link ({{unsubscribeUrl}}); signed "Hassen and Hussain Keder, co-founders of Keplar".
 */
export type LifecycleEmail = {
  id: string;
  /** Who gets it and when (the event and the condition). */
  trigger: string;
  audience: "free" | "paid" | "any";
  subject: string;
  preheader: string;
  /** Plain-text body. Placeholders: {{firstName}}, {{resetTime}}, {{renewDate}}, {{accessUntil}}, {{percentUsed}}. */
  body: string;
  cta: { label: string; path: string };
  /** Why the reader got this email (shown in the footer). */
  reason: string;
};

export const SIGN_OFF = "Hassen and Hussain Keder, co-founders of Keplar";
const UTM = (campaign: string) => `utm_source=lifecycle&utm_medium=email&utm_campaign=${campaign}`;

export const lifecycleEmails: LifecycleEmail[] = [
  {
    id: "welcome",
    trigger: "signup_complete, sent at once",
    audience: "any",
    subject: "Ask Keplar something you actually need to decide",
    preheader: "One question goes to several AI models. You see where they agree and where they split.",
    body: "Hi {{firstName}},\n\nThanks for signing up. The fastest way to see what Keplar does is to ask a question you care about: a decision, a trade-off, something you would normally check twice.\n\nKeplar sends it to several AI models, compares their answers, and gives you one answer. When the models disagree, it shows you where, instead of hiding it. Agreement is a good sign, not proof, so check anything important.",
    cta: { label: "Ask your first question", path: "/app" },
    reason: "You created a Keplar account.",
  },
  {
    id: "first-question-nudge",
    trigger: "24 hours after signup with no question asked; sent once",
    audience: "any",
    subject: "Three questions people start with",
    preheader: "Pick one, or ask your own.",
    body: "Hi {{firstName}},\n\nIf you're not sure where to start, try one of these:\n\n- \"Should I rent or buy if I might move in three years?\"\n- \"Explain this paragraph from my textbook like I'm new to the topic.\"\n- \"What are the risks of launching my product at $19 a month?\"\n\nYou'll see which models agreed and where they split.",
    cta: { label: "Open Keplar", path: "/app" },
    reason: "You signed up yesterday and haven't asked a question yet.",
  },
  {
    id: "first-disagreement",
    trigger: "first answer where the models disagreed; sent once, at most a day after",
    audience: "any",
    subject: "The models disagreed on your question. Here's how to read that",
    preheader: "A split is information, not an error.",
    body: "Hi {{firstName}},\n\nOn one of your questions, the models didn't all agree. Keplar showed you the split instead of picking a side quietly.\n\nA disagreement usually points at an assumption worth checking: a fact that changed recently, a judgment call, or missing context. Open the Disagreements section under the answer to see what each side said.",
    cta: { label: "Why AI models disagree", path: "/blogs/why-ai-models-disagree" },
    reason: "Your question got a split answer for the first time.",
  },
  {
    id: "discover-create",
    trigger: "3 or more questions asked, Create never opened, 3+ days after signup; sent once",
    audience: "any",
    subject: "You can build with Keplar too",
    preheader: "Describe a site or app. Keplar builds it and tests it before you see it.",
    body: "Hi {{firstName}},\n\nKeplar also builds sites and apps. Describe what you want, typed or spoken, and Create plans it, builds it, opens it in a real browser to test it, and fixes what fails before showing you.\n\nFree includes one project on free models.",
    cta: { label: "Start a build", path: "/ai-app-builder" },
    reason: "You've been asking questions and haven't tried Create yet.",
  },
  {
    id: "free-daily-limit",
    trigger: "first time a Free account reaches the daily question limit; sent at most once a month",
    audience: "free",
    subject: "Your Free questions come back at {{resetTime}}",
    preheader: "Nothing to buy on Free. Here's what changes on a paid plan, if you want it.",
    body: "Hi {{firstName}},\n\nYou used all of today's Free questions. They come back at {{resetTime}}, and nothing was charged.\n\nFree runs on free open models, so there are no extra credits to buy. If Keplar has become part of your day, paid plans run premium models on a monthly allowance and add Deep Research, Slides and more. If not, Free stays free.",
    cta: { label: "Compare plans", path: "/pricing?from=daily-limit" },
    reason: "You reached the Free daily limit for the first time.",
  },
  {
    id: "credits-low",
    trigger: "paid plan passes 80% of monthly credits; sent once per billing period",
    audience: "paid",
    subject: "You've used {{percentUsed}}% of this month's credits",
    preheader: "Your credits renew on {{renewDate}}.",
    body: "Hi {{firstName}},\n\nA heads-up so nothing surprises you: you've used {{percentUsed}}% of this month's credits. They renew on {{renewDate}}.\n\nSimple questions use very little; Deep Research, image and video use the most. You can see exactly where your credits went in your Account. Keplar never charges beyond your plan price unless you choose to.",
    cta: { label: "See your usage", path: "/account" },
    reason: "Your plan passed 80% of its monthly credits.",
  },
  {
    id: "win-back",
    trigger: "no visit for 21 days after at least 3 active days; sent once",
    audience: "any",
    subject: "What changed in Keplar since your last visit",
    preheader: "The changelog, in one place.",
    body: "Hi {{firstName}},\n\nIt's been a few weeks. The changelog lists every change to Keplar with the date it went live.\n\nIf something didn't work for you, tell us through the feedback page.",
    cta: { label: "Read the changelog", path: "/changelog" },
    reason: "You haven't visited Keplar in three weeks.",
  },
  {
    id: "cancellation",
    trigger: "paid plan set to end (canceled); sent at once",
    audience: "paid",
    subject: "Your plan ends on {{accessUntil}}",
    preheader: "You keep everything until then, and Free stays available after.",
    body: "Hi {{firstName}},\n\nYour paid plan is canceled and stays active until {{accessUntil}}. After that your account moves to Free.\n\nIf you have a minute, tell us why you left. It is optional and it goes straight to us.",
    cta: { label: "Tell us why (optional)", path: "/feedback?kind=cancel" },
    reason: "You canceled your paid plan.",
  },
];

/** Builds the CTA URL with lifecycle campaign tags. */
export function ctaUrl(e: LifecycleEmail, origin = "https://keplar.one"): string {
  const sep = e.cta.path.includes("?") ? "&" : "?";
  return `${origin}${e.cta.path}${sep}${UTM(e.id)}`;
}

/** Plain-text preview of an email with placeholders filled. Unknown placeholders are left visible so a missing value is caught in review. */
export function renderLifecycle(e: LifecycleEmail, vars: Record<string, string> = {}, origin = "https://keplar.one"): { subject: string; text: string } {
  const fill = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
  const text = [
    fill(e.body),
    `${e.cta.label}: ${ctaUrl(e, origin)}`,
    SIGN_OFF,
    `---\nWhy you got this: ${e.reason}\nUnsubscribe: ${fill("{{unsubscribeUrl}}")}`,
  ].join("\n\n");
  return { subject: fill(e.subject), text };
}
