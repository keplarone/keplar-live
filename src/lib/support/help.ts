/**
 * Help centre content. Every answer here describes something the product actually does today (checked against the code and the
 * Terms/Privacy pages). When a feature changes, change the answer in the same commit. Plan limits come from tiers.ts at render time.
 */
import { brand } from "@/lib/site";

export type HelpItem = { id: string; q: string; a: string[] };
export type HelpGroup = { id: string; title: string; items: HelpItem[] };

export const HELP: HelpGroup[] = [
  {
    id: "using",
    title: "Using Keplar",
    items: [
      { id: "what-is", q: "What does Keplar do?", a: [`${brand.engineName} sends your question to several AI models, compares their answers, looks into where they disagree, and writes one answer. Under the answer you can open the consensus, the models consulted, any disagreements, verification and a reasoning summary.`, "Agreement is not proof. Models can agree and still be wrong, so check anything important."] },
      { id: "slow", q: "Why is an answer slow or short?", a: ["On the Free plan Keplar uses free open models, which can be slower when they are busy. Casual messages get a quick single reply.", "If no model responds, the answer says so and you are not charged (Free: the question is given back)."] },
      { id: "wrong", q: "An answer was wrong, unsafe or inappropriate. What do I do?", a: ["Use the flag button in the footer of the answer card (Report this answer). Pick a reason and send it. Reports are stored for the Keplar team to review by hand. Nothing is posted publicly and no email is sent automatically.", "The thumbs up/down buttons teach Keplar which models to route to next time; they do not retrain any model."] },
      { id: "advice", q: "Can I use Keplar for medical, legal or money decisions?", a: ["Keplar can help you understand a topic and prepare questions, but it is not a doctor, lawyer or financial adviser and can be wrong. For decisions that matter, check with a qualified professional.", "If you are under 18, involve a parent or guardian in any legal, medical or money decision."] },
      { id: "crisis", q: "I'm struggling. Can Keplar help?", a: ["Keplar will listen and answer kindly, but it is not a crisis service. If you might hurt yourself, please contact someone you trust or a crisis line now. In the US, call or text 988. Elsewhere, call your local emergency number."] },
    ],
  },
  {
    id: "account",
    title: "Account and plans",
    items: [
      { id: "age", q: "How old do I need to be?", a: ["You must be at least 13 to have a Keplar account. If you are under 18 (or under the age of majority where you live), you may use Keplar only with the permission of a parent or legal guardian, who agrees to the Terms on your behalf."] },
      { id: "signin", q: "I can't sign in.", a: ["Use the email you signed up with. If you forgot your password, use Forgot password on the sign-in page. Sign-in with a provider (such as Google) appears only when that provider is switched on; otherwise the button says Coming soon.", "Check your spam folder for verification and link emails. Still stuck? Contact us and pick \"My account or sign-in\"."] },
      { id: "free-limit", q: "What are the Free plan limits?", a: ["Free is up to 50 questions a day (fair use) on free open models, with saved chats and optional memory when signed in. The Usage card in the app shows how many are left. Compare plans on the Pricing page."] },
      { id: "cancel", q: "How do I cancel a paid plan?", a: ["Cancel from your Account page or from your Whop billing page. Canceling is never affected by anything you send us. Billing is handled by Whop."] },
      { id: "billing", q: "I was charged wrongly or my plan did not change.", a: ["Open Account and use the plan refresh. If it still looks wrong, contact us with the email on the payment and choose Billing or plans. Keep your payment receipt handy."] },
    ],
  },
  {
    id: "data",
    title: "Your data and privacy",
    items: [
      { id: "export", q: "How do I download or delete my data?", a: ["Go to Account, then Your data. You can download a copy of your data as JSON and delete your account. Deleting starts a 14-day grace period you can cancel from the same place; you can also delete immediately. An active paid subscription must be cancelled first. Payment records, usage counters and abuse reports are kept because the law and billing integrity need them; they hold ids and amounts, not your chats."] },
      { id: "memory", q: "How do I turn off or erase memory?", a: ["In Account you can turn memory off, erase memory, and optionally erase saved chat history. You can also delete any single chat from the sidebar."] },
      { id: "free-logs", q: "Do model providers see my questions?", a: ["Yes. Keplar sends your question to AI models run by other companies. On Free, the free model hosts may log prompts. The Privacy page lists what is sent and kept."] },
    ],
  },
  {
    id: "apps",
    title: "Connected apps and the desktop app",
    items: [
      { id: "connectors", q: "Which connected apps work?", a: ["Connected apps are in beta. The code is tested against simulated provider responses, but it has not been verified end-to-end with real provider accounts, and apps only appear when they are set up. Anything that sends or changes data asks for your approval first. If a connection fails, it tells you; it never pretends to succeed."] },
      { id: "desktop", q: "The desktop app shows a security warning.", a: ["The installers are not code-signed yet, so Windows SmartScreen or macOS Gatekeeper may warn that the app is from an unidentified developer. Download only from keplar.one/download, compare the checksum shown there, and only continue if it matches. We will remove this warning when we have signing certificates."] },
    ],
  },
  {
    id: "contact",
    title: "Still need help?",
    items: [
      { id: "contact", q: "How do I reach a person?", a: [`Use the Contact page, or email ${brand.feedbackEmail}. A person reads every message; there is no guaranteed reply time, and we never send automatic emails about your message.`, "Service problems: the Status page shows live checks."] },
    ],
  },
];

export const allHelpItems = (): HelpItem[] => HELP.flatMap((g) => g.items);
