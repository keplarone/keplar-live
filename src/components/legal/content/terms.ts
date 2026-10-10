import { COMPANY_NAME, CONTACT_EMAIL, ENGINE_NAME, PRODUCT_NAME } from "./contact";
import type { LegalDoc } from "./types";

/**
 * Keplar Terms of Service. Written from how the product actually works (Whop billing, billing-period Keplar Usage,
 * the fixed "Are you human? No." reply, opt-in learning, 90-day share links). Do not state anything here the code does not do.
 * Only three facts are left open, as marked `review` blocks / `[[placeholders]]`: the contracting legal entity, its postal
 * address, and the named governing jurisdiction. The founders have not chosen them, so they are never guessed.
 * Drafted by the Keplar team; not reviewed by an attorney (the page says so).
 */
export const terms: LegalDoc = {
  slug: "terms",
  title: "Keplar Terms of Service",
  subline: "The agreement for using Keplar, in plain language.",
  lastUpdated: "October 3, 2026",
  intro: [
    `This is the agreement between you and ${COMPANY_NAME} for using ${PRODUCT_NAME}, ${ENGINE_NAME}, creation tools, agents and the API.`,
    "These terms are written to be understood. Headings and summaries are here to help; the full text of each section is what applies.",
  ],
  sections: [
    {
      id: "agreement",
      title: "The agreement",
      blocks: [
        { type: "p", text: `${PRODUCT_NAME} is provided by ${COMPANY_NAME}.` },
        { type: "p", text: "By creating an account or using Keplar, you agree to these Terms and to the Privacy Policy. If you use Keplar on behalf of an organization, you confirm you're authorized to accept these Terms for it." },
        { type: "review", text: "The legal entity that users are agreeing with, and where it is registered, has not been supplied yet. It will be named here once the founders confirm it." },
      ],
    },
    {
      id: "eligibility",
      title: "Eligibility",
      blocks: [
        { type: "p", text: "You must be at least 13 years old to have a Keplar account. If you are under 18 (or under the age of majority where you live), you may use Keplar only with the permission of a parent or legal guardian, who agrees to these Terms on your behalf and is responsible for your use. In some places the minimum age is higher, and then that higher age applies." },
        { type: "p", text: "You must not be barred from using the service under applicable law. Keplar is not offered where U.S. export controls or sanctions laws prohibit it, or to anyone on a U.S. government list of prohibited parties." },
      ],
    },
    {
      id: "accounts",
      title: "Your account",
      blocks: [
        { type: "p", text: "Keep your sign-in details secure and tell us promptly if you think your account has been accessed without permission. You're responsible for activity under your account, including activity by agents you authorize." },
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      blocks: [
        { type: "p", text: "Use Keplar lawfully and respectfully. Don't use it to harm people, break the law, infringe others' rights, or interfere with the service. The Prohibited uses section is Keplar's acceptable use policy and lists specific examples." },
        { type: "p", text: "Keplar sends your requests to AI models run by other companies. The usage policies of those providers also apply to what you do through Keplar, and we may block a request that would break them." },
      ],
    },
    {
      id: "ai-outputs",
      title: "AI outputs and their limits",
      blocks: [
        { type: "p", text: "Keplar asks multiple AI models, compares their answers, weighs the evidence and reasoning behind each response and synthesizes one answer. This is designed to make answers more reliable than asking a single model. It does not make them always right." },
        {
          type: "list",
          items: [
            "You are talking to an AI. Keplar is an AI system, not a person. If you ask whether Keplar is human, it answers \"No.\"",
            "Consensus can be wrong. Several models can agree on something that is false, and a disagreeing model can be right. The consensus figure measures agreement after Keplar weighs the evidence and reasoning behind each response. It is not a measure of accuracy.",
            "Verify high-stakes decisions. Keplar is not a doctor, lawyer, financial adviser or other licensed professional, and its answers are not medical, legal, financial or safety advice. Don't rely on Keplar alone for decisions where a mistake could cause harm. Check with a qualified professional, and in an emergency contact your local emergency services.",
            "Cited sources have limits. Sources shown with an answer are the ones the models cited. Keplar does not retrieve or check them, and a model can cite a source inaccurately or miss relevant information.",
            "Model availability changes. The models Keplar consults can change at any time as providers add, update or retire them, so the same question may be answered differently over time.",
            "Similar requests from different users can produce similar outputs.",
          ],
        },
      ],
    },
    {
      id: "your-content",
      title: "Your content",
      blocks: [
        { type: "p", text: "You keep your rights in the prompts, files and other material you submit (your input)." },
        { type: "p", text: `You give ${COMPANY_NAME} a worldwide, non-exclusive, royalty-free license to host, process, transmit and display your input and the outputs made from it, only as needed to run Keplar for you. That includes sending your input to the model providers selected for a request (who may act only as their terms allow), keeping the service secure, answering support requests, and meeting legal duties. The license lasts while your content is in your account and ends when you delete it, apart from the limited backup and legal-record cases described in the Privacy Policy.` },
        { type: "p", text: "The license does not allow Keplar to train AI models on your input, which matches the Privacy Policy. The one optional exception is Help improve Keplar, which is off by default: if you turn it on, a shortened, cleaned copy of a question that failed is kept in your own account and used to check Keplar's routing. You can turn it off or delete those copies at any time. No model is retrained with it." },
        { type: "p", text: "You're responsible for having the rights to what you submit." },
      ],
    },
    {
      id: "sharing",
      title: "Shared answer links",
      blocks: [
        { type: "p", text: "If you are signed in, you can create a link to one answer. Nothing is shared unless you create the link. You can revoke it at any time, and it stops working after 90 days. Don't share content that breaks these Terms. If you choose Make public, the page can be found through search engines; do not publish anything private, personal or that you do not have the right to publish. We can remove a shared link or public page that is reported or that breaks them." },
      ],
    },
    {
      id: "outputs-and-ip",
      title: "Outputs and intellectual property",
      blocks: [
        { type: "p", text: `As between you and ${COMPANY_NAME}, we assign to you whatever rights we have in the outputs ${PRODUCT_NAME} generates for you. Whether an output can be owned at all depends on the law where you live, and outputs can resemble what others receive, so we can't promise they are unique or free of third-party rights. ${PRODUCT_NAME}, ${ENGINE_NAME}, the ${PRODUCT_NAME} mark and the service itself remain the property of ${COMPANY_NAME}.` },
      ],
    },
    {
      id: "third-party-models",
      title: "Third-party models and services",
      blocks: [
        { type: "p", text: "Keplar uses AI models and other services operated by third parties. Keplar chooses which ones to use for each request. Their availability, behavior and terms are outside Keplar's full control." },
        { type: "p", text: "You agree to follow the usage policies and terms of the providers whose models or services handle your requests, as they apply to your use. In particular, don't use Keplar's outputs to develop or train a competing AI model unless the provider of the model that produced them allows it." },
      ],
    },
    {
      id: "plans",
      title: "Plans and subscriptions",
      blocks: [
        { type: "p", text: "Keplar offers a free plan and paid plans. What each plan includes, and its price, is described on the Pricing page, which is part of these Terms. Plan features and allowances may change." },
        { type: "p", text: "We will give you at least 30 days' notice before we raise the price of a plan you pay for or cut its allowance in a way that matters. The change applies from your next billing period, and you can cancel before then." },
      ],
    },
    {
      id: "keplar-usage",
      title: "Keplar Usage",
      blocks: [
        { type: "p", text: "Keplar measures usage in credits, shown as Keplar Usage, instead of raw tokens. Different work uses different amounts: a simple answer uses little, consensus across several models uses more, and Deep Research, video generation and agents use the most." },
        { type: "p", text: "Each paid plan includes a Keplar Usage allowance for every billing period, as shown on the Pricing page and in your Account. The allowance resets on your billing date. Unused Keplar Usage does not roll over to the next period, and extra Usage can't currently be bought. Keplar shows what you have left and when it resets, and gives an estimate before costly work such as Deep Research. If a request needs more than you have left, Keplar tells you before starting it." },
        { type: "p", text: "Keplar Usage has no cash value, can't be transferred, and is only used within Keplar." },
      ],
    },
    {
      id: "limits",
      title: "Usage limits",
      blocks: [
        { type: "p", text: "Every plan has limits, including on Keplar Usage, speed and concurrent requests. Plus and Pro also have rolling five-hour and weekly limits. Current limits are shown on the Pricing page and in the app, and they can change with notice as described under Plans and subscriptions." },
        { type: "p", text: "Free use on open models has no Usage allowance, but it is subject to fair use, speed limits and the availability of those models, and we may pause it to stop abuse. When you reach a limit, Keplar will tell you, and you can wait for your allowance to reset or change plans." },
      ],
    },
    {
      id: "billing",
      title: "Billing and taxes",
      blocks: [
        { type: "p", text: "Paid plans are billed monthly in advance, in U.S. dollars, through Whop, our payment processor. Whop shows the price and handles your payment details at checkout. Prices may not include taxes, which are added where required." },
      ],
    },
    {
      id: "renewals",
      title: "Automatic renewal",
      blocks: [
        { type: "p", text: "Paid plans renew automatically each month at the plan's current price until you cancel. The price and renewal terms are shown at checkout before you pay. You can see your plan, its renewal date and whether it is set to end in your Account." },
      ],
    },
    {
      id: "cancellation",
      title: "Cancellation",
      blocks: [
        { type: "p", text: "You can cancel a paid plan at any time from your Account with Manage billing, which opens your Whop billing page. Cancellation takes effect at the end of the current billing period, and you keep access until then." },
      ],
    },
    {
      id: "refunds",
      title: "Refunds",
      blocks: [
        { type: "p", text: "If you're new to a paid plan, email us within 7 days of your first payment for it and we will refund that payment in full. We may decline if it looks like abuse, such as using most of the period's allowance and then asking for the money back." },
        { type: "p", text: "After that, payments are not refunded, and a partly used billing period isn't prorated when you cancel, because you keep access until the period ends. We will refund a payment we charged by mistake. If we end your paid access for a reason other than a breach of these Terms, we will refund the unused part of the period." },
        { type: "p", text: "Where the law gives you a right to a refund or to withdraw from a purchase, that right applies and nothing here limits it. When a refund or a payment dispute is processed, your account moves to the Free plan." },
        { type: "email", label: "To ask for a refund:", email: CONTACT_EMAIL },
      ],
    },
    {
      id: "creation-tools",
      title: "Creation tools",
      blocks: [
        { type: "p", text: "Keplar can create websites, apps, code, images, video and documents. Review what Keplar creates before you publish, deploy or rely on it, including checking for security issues and third-party rights." },
        { type: "p", text: "Only upload images and videos you own or have permission to use. If a real person appears, they must have agreed. Don't create media that shows a real person without their permission, or that is meant to mislead people into thinking it is real. Keplar blocks requests that impersonate real people. Where the law requires it, or where it could mislead, say that media is AI-generated when you publish it." },
        { type: "p", text: "If you publish a site or media made with Keplar, you are responsible for it. We may unpublish or remove it if it breaks these Terms or the law." },
      ],
    },
    {
      id: "agents",
      title: "Agents and permissions",
      blocks: [
        { type: "p", text: "Agents can take actions for you and keep working after you close the tab. You decide what they're allowed to do. The controls for this live in the product: spend caps, tool-level permissions, human approval gates, production-deployment and payment approval, audit logs, rollback, escalation and an emergency stop." },
        { type: "p", text: "You're responsible for the permissions you grant and the actions you approve, including what an agent does within those permissions. Keplar will stop an agent that reaches a cap or needs approval, and wait for you. Whatever permissions you grant, agents can't take actions that Keplar's safety rules block or that these Terms prohibit." },
      ],
    },
    {
      id: "business",
      title: "Keplar Business",
      blocks: [
        { type: "p", text: "Keplar Business is provided under a separate agreement with your organization. If that agreement conflicts with these Terms, the Business agreement applies. Unless the Business agreement says otherwise, Keplar makes no service-level commitment." },
      ],
    },
    {
      id: "api",
      title: "API",
      blocks: [
        { type: "p", text: "If you use the Keplar API, these Terms apply to that use. Keep your keys secret, respect rate limits and documentation, and don't use the API to build a service that simply resells Keplar's answers without adding your own product. You don't have to credit Keplar, but you can't suggest that Keplar endorses your product." },
      ],
    },
    {
      id: "availability",
      title: "Availability and changes to the service",
      blocks: [
        { type: "p", text: "We work to keep Keplar available, but it may be interrupted for maintenance, by provider outages or for reasons outside our control. Features may change, and models may be added or removed." },
      ],
    },
    {
      id: "beta",
      title: "Beta and preview features",
      blocks: [
        { type: "p", text: "Some features are labeled beta or preview. They may be incomplete, change significantly or be withdrawn, and may have fewer protections than generally available features." },
      ],
    },
    {
      id: "prohibited",
      title: "Prohibited uses",
      blocks: [
        { type: "p", text: "This is Keplar's acceptable use policy. Don't use Keplar for any of the following:" },
        {
          type: "list",
          items: [
            "Breaking the law, or helping others to.",
            "Generating content that exploits or harms children.",
            "Harassing, threatening or impersonating people.",
            "Developing weapons capable of mass harm, or malware.",
            "Fraud, phishing or spam.",
            "Attempting to access other users' data or bypass Keplar's safeguards, limits or permissions.",
            "Using outputs to deceive people about their AI origin where that is harmful or unlawful.",
            "Scraping, reverse engineering or overloading the service.",
            "Anything the usage policy of a model provider handling your request forbids.",
          ],
        },
      ],
    },
    {
      id: "suspension",
      title: "Suspension",
      blocks: [
        { type: "p", text: "We may suspend access, including stopping running agents, if we reasonably believe an account is violating these Terms, putting others at risk or exposing Keplar to legal liability. Where appropriate, we'll tell you why and how to resolve it." },
      ],
    },
    {
      id: "termination",
      title: "Termination",
      blocks: [
        { type: "p", text: "You can stop using Keplar and delete your account at any time. We may end these Terms for serious or repeated violations. Sections that by their nature should survive termination, such as ownership, disclaimers and limitation of liability, will survive." },
        { type: "p", text: "In Account, under Your data, you can download a copy of your data and then delete your account. Deleting removes your content as described in the Privacy Policy. Download what you need first, because deletion can't be undone. An active paid plan must be canceled before the account can be deleted. Paid time that remains when you cancel stays available until the period ends, and refunds are covered under Refunds." },
      ],
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      blocks: [
        { type: "p", text: "Keplar is provided \"as is\" and \"as available.\" We don't promise that it will be uninterrupted or error-free, or that any output is accurate, complete or fit for your purpose. To the extent the law allows, we disclaim all other warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement. Some places don't allow some of these exclusions, so they apply only as far as the law permits, and legal rights you have as a consumer are not affected." },
      ],
    },
    {
      id: "liability",
      title: "Limitation of liability",
      blocks: [
        { type: "p", text: `To the extent the law allows, ${COMPANY_NAME} is not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data or goodwill, however caused.` },
        { type: "p", text: `To the extent the law allows, ${COMPANY_NAME}'s total liability for all claims relating to Keplar is limited to the greater of the amount you paid for Keplar in the 12 months before the event that gave rise to the claim, or US$100.` },
        { type: "p", text: "These limits do not apply to liability that the law does not allow to be limited, such as for fraud, willful misconduct, or death or personal injury caused by negligence." },
      ],
    },
    {
      id: "indemnification",
      title: "Indemnification",
      blocks: [
        { type: "p", text: `To the extent the law allows, you will cover ${COMPANY_NAME}'s reasonable losses from a third-party claim that arises from your input, from content you publish with Keplar, or from your breach of these Terms or the law. Keplar does not indemnify you for outputs, unless a separate Business agreement says so.` },
      ],
    },
    {
      id: "governing-law",
      title: "Governing law",
      blocks: [
        { type: "p", text: `These Terms are governed by the laws of [[governing jurisdiction: to be chosen by the founders]], without regard to its conflict-of-law rules. If you are a consumer, mandatory consumer-protection laws of the place where you live still apply to you.` },
        { type: "review", text: "The governing jurisdiction (and the court venue for disputes) is a choice only the founders can make. It is left unnamed on purpose." },
      ],
    },
    {
      id: "disputes",
      title: "Disputes",
      blocks: [
        { type: "p", text: "If you have a concern, contact us first. Most issues can be resolved quickly and informally. Before starting a formal claim, each side agrees to try in good faith to resolve it for at least 30 days after one side writes to the other describing the problem." },
        { type: "p", text: "If it isn't resolved, either side may bring the claim in the courts of the governing jurisdiction named above, which will also be the venue. These Terms do not require arbitration and do not waive your right to bring or join a class action where the law gives you that right. Nothing here limits any right you have under mandatory law to bring a claim where you live." },
      ],
    },
    {
      id: "changes",
      title: "Changes to these Terms",
      blocks: [
        { type: "p", text: "We may update these Terms. The date at the top shows when they last changed. For material changes, we'll give you at least 30 days' notice by email or in the app before they take effect. If you don't agree, you can cancel and stop using Keplar before then. Continuing to use Keplar after that means you accept the updated Terms." },
      ],
    },
    {
      id: "contact",
      title: "Contact",
      blocks: [
        { type: "p", text: `These Terms are offered by ${COMPANY_NAME}.` },
        { type: "email", label: "Questions about these Terms, and legal notices:", email: CONTACT_EMAIL },
        { type: "p", text: "You can also reach us through the Inquire page. Until a postal address is listed, send legal notices to the email address above." },
        { type: "review", text: "The legal entity name and postal address for legal notices have not been supplied yet and will be added here once the founders confirm them." },
      ],
    },
  ],
};
