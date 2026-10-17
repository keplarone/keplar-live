import { brand } from "@/lib/site";
import { COMPANY_NAME, CONTACT_EMAIL, PRODUCT_NAME } from "./contact";
import type { LegalDoc } from "./types";

/**
 * Privacy at Keplar. Written from how the product actually works (Neon database, Resend email, Whop
 * payments, Google/email sign-in, OpenRouter/OpenAI/NVIDIA model providers). Do not add a claim here that
 * the code does not do: no certifications, no retention periods we do not enforce, no analytics beyond the optional, consent-gated Vercel Web Analytics and Speed Insights Keplar's own cookie-free visit counts and online-now signal (anonymous daily code, page, referring site; no IP stored) and Keplar's own first-party funnel counts (page, source type, milestone; never question text), and the Whop Pixel for ad measurement on public marketing pages (src/lib/whop-pixel.ts).
 * The only open item is the legal entity name and postal address (a marked review note in Contact). Drafted by the Keplar team; not reviewed by an attorney (the page says so).
 */
export const privacy: LegalDoc = {
  slug: "privacy",
  title: "Privacy at Keplar",
  subline: "What Keplar collects, where it goes, and how to see or delete it.",
  lastUpdated: "October 17, 2026",
  intro: [
    "Keplar sends your question to more than one AI model, compares what they say, and gives you one answer. That means your data moves through more systems than a single chatbot. This page explains which data is involved, where it goes, and the choices you have.",
    "It describes how Keplar works today. If that changes in a way that matters, we update this page and its date.",
  ],
  sections: [
    {
      id: "summary",
      title: "The short version",
      blocks: [
        {
          type: "list",
          items: [
            "Your prompts. When you ask a question, the text (and any image or video frames you attach) is sent to the AI model providers Keplar picks for that request. Not every provider, every time.",
            "Free is different. Free-plan questions run on free open models. Free model hosts may log prompts, and some may use them to improve their models. On Free, Keplar does not send your saved memory or the text of attached documents to those models, and no model learns new memory from your Free chats. Plus and Pro requests are sent only to endpoints that say they do not train on prompts.",
            "Your account. Signed in, your chats, study sets, slide decks and (if on) memory are stored in Keplar's database under your account. Signed out, chats stay in your browser only.",
            "You are in control. You can delete chats, study sets, decks and individual memory items in the app, turn memory off, erase all memory and chat history, delete your whole account from Account, or email us.",
            "No ads. Keplar does not sell your personal data and does not show ads. On its public marketing pages (never in the app, your account, checkout or sign-in) Keplar uses the Whop Pixel to measure how its own ads perform (see Cookies and local storage).",
          ],
        },
      ],
    },
    {
      id: "data-flow",
      title: "How a request moves through Keplar",
      blocks: [
        { type: "p", text: "Every question follows the same path. Understanding it makes the rest of this policy easier to follow." },
        { type: "flow" },
        {
          type: "list",
          items: [
            "You. You send a prompt, and optionally attached files, images or video, from the Keplar app.",
            `Keplar. ${brand.engineName} classifies the request and decides which models are needed. Simple questions may go to one model; complex ones go to several.`,
            "Selected model providers. Only the providers chosen for that request receive what they need to answer it: your prompt, the recent conversation for context, any attached content, and (if memory is on) a few short notes about you that are relevant to the question. On Free, saved notes and the text of attached documents are not part of that.",
            `${brand.engineName} synthesis. Keplar compares the responses, weighs the reasoning behind each, looks into disagreements and writes one answer.`,
            "You. You receive the answer along with its consensus, the models consulted, any sources the models cited and disagreements.",
          ],
        },
        { type: "p", text: "Your account email and name are not sent to model providers." },
      ],
    },
    {
      id: "information-you-provide",
      title: "Information you provide",
      blocks: [
        { type: "p", text: "This is information you choose to give Keplar directly." },
        { type: "list", items: ["Account details", "Prompts and conversations", "Files, images and video you attach", "Study guides and slide material you upload", "Memory notes", "Payment details, when you subscribe", "Messages you send us, including inquiries and support emails"] },
      ],
    },
    {
      id: "account-information",
      title: "Account information",
      blocks: [
        { type: "p", text: "To create and run your account, Keplar needs your email address and, if you sign in with Google or Microsoft, the name and verified email they share with us. You can also sign in with a one-time link sent to your email, so no password is stored. We use your email to identify your account, send sign-in links and billing messages, and reply to you." },
        { type: "p", text: "Sign-in emails are sent through Resend. Sign-in with Google or Microsoft is handled by that company under its own privacy policy; Keplar receives only the profile details you approve." },
      ],
    },
    {
      id: "prompts-and-conversations",
      title: "Prompts and conversations",
      blocks: [
        { type: "p", text: "When you are signed in, your prompts, Keplar's answers and the details shown with them (consensus, models consulted, sources, disagreements) are saved to your account in Keplar's database so you can reopen, rename and delete your chats on any device. Images and video you attach are used for that request only and are not saved with the chat." },
        { type: "p", text: "When you are signed out, chats are kept only in your browser's local storage on that device. Clearing your browser data removes them." },
        { type: "p", text: "Don't include information in a prompt that you aren't comfortable sharing with the model providers selected to answer it." },
      ],
    },
    {
      id: "memory",
      title: "Saved chats and memory",
      blocks: [
        { type: "p", text: "Memory is on by default for signed-in accounts and you can turn it off at any time in Account or by saying \"turn memory off\" in a chat. It is not available when you are signed out." },
        { type: "p", text: "When it is on, after an answer a free model reads your own message and may save short, durable facts about you, such as your name, goals, preferences or ongoing projects. It skips small talk and messages that look like pasted documents, it never reads files you upload, it does not use your credits, and it will not save instructions, links or sensitive items such as passwords or card numbers. Because the free models that do this may be hosted by companies that log prompts, your message is shared with such a host when extraction runs." },
        { type: "p", text: "With memory on, a free model also writes a one or two sentence summary of each chat you have while signed in, and Keplar keeps the last few question and answer pairs of that chat in a short digest so it can answer \"what did we talk about last time?\" and find relevant earlier chats. For a message with an attached file or image only your question is kept, never the answer. New chats start with your saved notes and short summaries of your last few chats, and later questions may include a few relevant passages from earlier chats. Summaries are deleted with the chat, and erased with your memory. On the Free plan no model reads your chats for this: summaries stay extractive and the only notes are the ones you add yourself." },
        { type: "p", text: "Within a chat, the recent messages of that conversation (older ones shortened) are always sent along with your question so follow-ups work, signed in or not." },
        { type: "p", text: "Saved items that are relevant to a later question are sent along with it to the models answering, so they are covered by the same provider handling as the rest of your prompt. Nothing is sent when memory is off or after you delete it. The Free plan is the exception: because Free model hosts may log prompts and use them to improve their models, your saved items, summaries and snippets of past chats are not sent in Free requests at all." },
        { type: "p", text: "You can see every item in Account, add your own, delete any one, or erase all memory, optionally together with your saved chat history. You can also say \"forget that\", \"erase my memory\" or \"remember that...\" in a chat. Deleting removes the data from Keplar's database. Keplar does not train models on your memory or chats." },
      ],
    },
    {
      id: "files",
      title: "Files, study guides and slide decks",
      blocks: [
        { type: "p", text: "When you attach a file to a question, Keplar reads its contents to answer you and may send relevant parts to the selected model providers." },
        { type: "p", text: "Study mode reads the text of a PDF, text file or pasted notes and sends parts of it to the model that builds your outline, flashcards, quizzes and answers. The extracted text, the study set Keplar builds, and your progress are stored in your account so you can keep studying, until you delete the set. Deleting it removes the text and your progress. The original file itself is not kept. Scanned PDFs are not read." },
        { type: "p", text: "The slideshow creator (Plus and Pro) sends your topic, outline and any source text to the model that writes the deck. The finished deck is stored in your account until you delete it. The source file is not kept." },
        { type: "p", text: "Text inside a document is treated as material to read, never as instructions to Keplar." },
      ],
    },
    {
      id: "voice",
      title: "Voice dictation and voice mode (beta)",
      blocks: [
        { type: "p", text: "The microphone button in the Ask box uses your browser's built-in speech recognition (Web Speech API), only when you click it, and only in browsers that provide it. Your browser asks for microphone permission at that moment. In Chrome, Edge and Safari the browser itself may send your voice to its vendor's speech service to turn it into text; that is governed by your browser vendor's policy, not Keplar's. Keplar never receives, records or stores audio. It receives only the text that appears in the message box, which you can edit before sending, and which is then handled like any other prompt. In browsers without this feature (for example Firefox) the button is not shown." },
        { type: "p", text: "Voice mode (beta) adds a Talk button and a Listen button on answers. Talk uses the same browser speech recognition: hold the button to speak and release to send, or tap once to keep listening and tap again to send. The text it produces is sent as your question like any typed question. Listen reads an answer aloud with your browser's own text-to-speech voices (speechSynthesis); the answer text is already on your screen and Keplar sends it to no speech service. Some browsers use on-device voices and some use online voices run by the browser vendor, under the vendor's policy. Keplar never receives, records or stores audio, and keeps no voice recordings or voiceprints. Your browser asks for microphone permission when you first press Talk, and you can withdraw it in your browser's site settings at any time. If your browser has no speech recognition (for example Firefox), Talk explains that and you can keep typing; if it has no read-aloud voices, the Listen button is not shown." },
      ],
    },
    {
      id: "optional-learning",
      title: "Optional: Help improve Keplar and common questions",
      blocks: [
        { type: "p", text: "Keplar learns at the system level, not by retraining models. After each answer it records content-free results, such as the type of question, which models answered, whether they agreed, speed, credits used and whether you rated, copied or regenerated the answer. These records contain no question text and are deleted after 45 days." },
        { type: "p", text: "Two settings are off by default and only apply when you are signed in and turn them on:" },
        { type: "list", items: [
          "Help improve Keplar. If you turn it on, a question that failed (no model answered, a thumbs-down, an ask-again or a correction) is kept as a shortened, cleaned copy in your own account, with emails, links, long numbers and key-like text removed. Copies that look sensitive are dropped. They are used to check Keplar's routing before changes go live, and Keplar's administrators can see them without your account details. They appear in your data export and can be deleted in Settings; turning the setting off, or deleting your account, deletes them. No AI model is trained on them.",
          "Count my questions. If you turn it on, general questions you ask may be counted toward a public \"most frequently asked\" list. A question is stored only as a keyed hash until at least five different people have asked the same thing, and only then is its text shown, with a count and nothing about who asked. Questions with personal details, links or numbers are never counted. Turning the setting off removes you from the counts.",
        ] },
      ],
    },
    {
      id: "creation-media",
      title: "Images, video and creation tools",
      blocks: [
        { type: "p", text: "When you ask Keplar to create an image or video, your prompt and any reference images or video you add are sent to the generation provider for that request, currently Higgsfield. Keplar then saves a copy of the result in your account, and you can delete it there. The provider may keep its own copy of a finished output for at least 7 days, and handles it under its own terms. Prompts and results are also checked by automated safety filters, which can include a moderation service from OpenAI." },
        { type: "p", text: "Sites, apps and code you build are stored in your account until you delete them. If you publish a site, what you publish is public." },
        { type: "p", text: "Templates (beta). A site becomes a public template only if your email is verified and you press Share as template and tick the box that says it will be public and copyable. Keplar then stores a separate snapshot of the pages, text, layout and styles of your latest version, shows it at an address on keplar.one/templates that search engines may index, and shows the title, description and category you wrote, plus a name only if you type one. It never includes form messages, contacts, bookings, orders, members, analytics, chat history, uploaded photos or contact links, and Keplar refuses to share a site where it detects an email address, phone number, card number or key, or a members-only page. When someone presses Remix, a copy of the snapshot is made in their workspace; it is theirs and is not linked to yours, and we count remixes on the template. You can withdraw a template at any time, and deleting the site or your account removes the snapshot; copies other people already made, and cached copies at search engines, are not recalled. Reports of a template are stored for the Keplar team to review by hand, and Keplar can hide a template." },
      ],
    },
    {
      id: "feedback-and-sharing",
      title: "Feedback and shared answer links",
      blocks: [
        { type: "p", text: "If you send feedback through Keplar, we store your message, the page or campaign it came from and your plan. We store your email address only if you tick the box that lets us contact you. A copy of each message is also emailed to the Keplar team at team@keplar.one (through our email provider, Resend). Feedback you send while signed in is part of your account data and is deleted with your account; the copy in the team\u2019s inbox is deleted when you ask us to at team@keplar.one." },
        { type: "p", text: "A shared answer link is created only when you press Create link. It shows one answer, how many models agreed and which were consulted, and your question only if you leave it ticked. It never includes your name, email, history or memory. You can revoke it at any time, it expires after 90 days, search engines are told not to index it, and viewing it only adds to a counter, with no IP address or browser details stored." },
        { type: "p", text: "Separately, if your email is verified you can choose Make public on a link you created. That is a second, explicit choice. It publishes your question and the answer at an address on keplar.one/answers that search engines may index, and lists it there. It never includes your name, email, history or memory, and Keplar refuses to publish a page where it detects an email address, phone number, card number or key. Anyone can copy a public page, and search engines may keep a cached copy for a while after you turn it off. Making it private, revoking the link, or deleting your account removes the page from keplar.one at once. Keplar can take down a public page that is reported or breaks the Terms." },
      ],
    },
    {
      id: "usage-information",
      title: "Usage information",
      blocks: [
        { type: "p", text: "Keplar records how much of your plan you use so it can enforce limits and show your meter: the type of action, the number of credits, the cost and the time. It also keeps short-lived counters for rate limiting and abuse prevention, and error logs on our hosting provider." },
      ],
    },
    {
      id: "device-information",
      title: "Device and connection information",
      blocks: [
        { type: "p", text: "Like any website, our servers and hosting provider receive your IP address, browser type and the pages you request. We use this to deliver the site, apply rate limits (including per-IP limits for signed-out Free use) and protect against abuse. The page background uses the approximate area our host attaches to the request, rounded to about 11 km, only to ask for the current weather. That area is not stored or logged." },
      ],
    },
    {
      id: "cookies",
      title: "Cookies and local storage",
      blocks: [
        { type: "p", text: "Essential cookies and storage are always on, because Keplar cannot work or stay secure without them. The only optional category is analytics, and it stays off until you allow it (the Whop Pixel for ad measurement, described after the list, is separate and is not part of that choice):" },
        {
          type: "list",
          items: [
            "Sign-in session. A secure, signed cookie that keeps you signed in.",
            "Plan. A signed, HttpOnly cookie that records your paid plan and billing period after a verified payment.",
            "Free usage count. A signed, HttpOnly cookie that counts a signed-out or Free browser's questions for the day.",
            "Theme. Your light, dark or system choice, in a cookie and local storage.",
            "Invite link (only if you open one). kp_ref (HttpOnly, 30 days) holds the invite code until your new account claims it, kp_ref_p is a flag saying an invite is waiting, and kp_dev (HttpOnly, 12 months) is a random browser id used only to stop one browser claiming many referral rewards. See the Referral Terms.",
            "Your cookie choice. A first-party cookie (keplar_consent, 12 months) and a copy in local storage recording what you allowed, the date, and the version of the categories. You are asked again after 12 months or if the categories change.",
            "Campaign tags. If you arrive from a link with utm_ tags, Keplar keeps them in this tab's session storage (cleared when you close the tab) so it can tell which campaign led to a sign-up.",
            "App data in your browser. Your chats while signed out, your settings, your \"what will you use Keplar for\" choice and upgrade-note dismissals, in local storage on your device.",
          ],
        },
        { type: "p", text: "Analytics (optional, off by default). If you choose Accept all or turn on Analytics, the public marketing pages (not the app) load Vercel Web Analytics and Speed Insights. They count page views, button clicks and page speed without cookies and without following you across sites. Events carry the page, the button's placement and campaign tags, never your questions, email or account details. With Analytics on, Keplar also records in its own database which public page a visit started on, a coarse source type (for example search, social or direct), campaign tags, and whether that same browser later signed up, asked a question or received an answer. It uses a random identifier kept on your device, with no link to your account, and never records your questions, files, email, IP address or the address of the page you came from. These records are deleted after 180 days, and browsers that send Global Privacy Control or Do Not Track are left out. If you reject them, no analytics script is loaded and no events are sent. Change your choice any time with Cookie settings in the site footer or on your Account page; scripts already loaded stop on your next page load." },
        { type: "p", text: "Ad measurement (Whop Pixel). Keplar uses the Whop Pixel, a script from Whop, to measure how its own advertising performs. It loads on the public marketing pages only: not in the app, on your account, in checkout, or on sign-in, sign-up, contact and other form pages. It records page views, so Whop learns which page was opened, the page you came from, your browser, device, language and time zone, and a random identifier it keeps in a first-party cookie and local storage on keplar.one. Keplar has turned off the pixel's automatic capture of email, phone and name entries, and sends it nothing else: not your questions, files, email or account details. Whop uses this to link visits to ad clicks and purchases, under its own privacy policy." },
        { type: "p", text: "Who is on the site right now (no cookies, always on). While a Keplar page is open and visible in your browser, it sends a small signal about every 15 seconds, and one more when you close or leave the page. The server keeps only the same kind of anonymous daily code described below and the time of the last signal, and treats the code as present for about 40 seconds after it. It stores no IP address, no page, no referrer, no account and no cookie, and it deletes the entry when you leave and clears old ones within minutes. The signal does not start until the page has finished loading and the browser is idle, it pauses when the tab is hidden, and it is never sent from admin pages, for Do Not Track or Global Privacy Control, or by bots. Only the Keplar team sees the resulting count." },
        { type: "p", text: "Visit counts (no cookies, always on). Keplar counts visits to its own pages on its server so we know roughly how many people use it. It stores a daily anonymous code made from your IP address and browser details plus a secret, so the code cannot be linked across days or turned back into your IP address, and the IP address and browser details themselves are never stored. We keep the code, the day, the first part of the page path (for example /pricing), and the website you came from (the site name only, never the full address). We do not count bots, prefetches, or visits that send Do Not Track or Global Privacy Control. Only the Keplar team sees the totals. Per-visit rows are rolled up into daily totals after 35 days." },
        { type: "p", text: "Checkout. When you open checkout to buy a plan, the payment form is loaded from Whop, our payment processor, and Whop handles your card details and its own cookies. It loads only because you asked to pay." },
        { type: "p", text: "Apart from the Whop Pixel described above, Keplar does not use advertising cookies, cross-site tracking or session replay. If that ever changes, we will update this page and ask for consent where the law requires it." },
      ],
    },
    {
      id: "payment-information",
      title: "Payment information",
      blocks: [
        { type: "p", text: "Subscriptions are processed by Whop, which handles your card details and shows you the checkout page. Keplar never sees your full card number. We receive and store the billing details we need to run your plan: your plan, its status, the billing period, whether it renews or cancels, and a link to manage your subscription." },
        { type: "p", text: "If you use Keplar Business commerce tools, payments from your own customers are processed by Stripe under your connected Stripe account." },
      ],
    },
    {
      id: "how-we-use-information",
      title: "How Keplar uses information",
      blocks: [
        {
          type: "list",
          items: [
            "To answer your requests, including routing them to model providers and synthesizing the result.",
            "To run your account, save your chats, study sets and decks, measure Keplar Usage and process payments.",
            "To keep Keplar secure, prevent abuse and enforce our Terms.",
            "To support you when you contact us.",
            "To fix problems and understand overall usage, using the counters and logs described above.",
            "To meet legal obligations.",
          ],
        },
        { type: "p", text: "Keplar does not use your prompts, files, memory or chats to train AI models, and does not sell your personal data." },
      ],
    },
    {
      id: "model-providers",
      title: "AI model providers",
      blocks: [
        { type: "p", text: `Keplar is an intelligence layer above AI models from several providers. For each request, ${brand.engineName} selects the models it needs based on the task, quality, reliability, speed and cost. Requests reach models through OpenRouter, and directly through OpenAI and NVIDIA for some models. The Models consulted section of every answer shows which models were used, and that set changes as models are added or retired. Images and video are generated by Higgsfield, as described under Images, video and creation tools.` },
        { type: "list", items: [
          "Free plan. Free requests use free open models served by hosts on OpenRouter. These hosts may log prompts and may use them to improve their models. Do not put sensitive information in a Free question. Keplar never sends saved memory or the text of attached documents to these hosts (a Free question with an attached document is refused with an explanation); images and video you attach to a Free question are sent, because the question needs them.",
          "Plus and Pro. Requests sent through OpenRouter are restricted to endpoints that state they do not collect or train on prompts, and models are not routed to the first-party DeepSeek API. Requests sent directly to OpenAI or NVIDIA are handled under their API terms. Providers may still keep requests for a limited time, for example to detect abuse.",
        ] },
        { type: "p", text: "Each provider handles data under its own terms and privacy policy, which we don't control. Data a provider keeps under those terms may persist after you delete it from Keplar." },
      ],
    },
    {
      id: "infrastructure-providers",
      title: "Infrastructure and service providers",
      blocks: [
        { type: "p", text: "Keplar relies on other companies to run the service. They process data on Keplar's behalf only to provide their service:" },
        { type: "list", items: [
          "Vercel. Hosts the website and application, and provides Vercel Web Analytics and Speed Insights on the public marketing pages (see Cookies and local storage).",
          "Neon. Hosts the Postgres database that stores accounts, chats, study sets, decks, memory and usage records.",
          "Resend. Sends sign-in and account emails.",
          "Whop. Processes subscription payments, and provides the Whop Pixel used to measure Keplar's ads on the public marketing pages (see Cookies and local storage).",
          "Google and Microsoft. Provide optional sign-in with your Google or Microsoft account.",
          "OpenRouter, OpenAI and NVIDIA. Provide AI models, as described above. OpenAI also provides content moderation for the creation tools.",
          "Higgsfield. Generates images and video from your prompt and reference files.",
          "Upstash. Stores short-lived rate-limit counters, keyed by hashes rather than names or emails, when it is configured.",
          "Stripe. Used only for Keplar Business sellers: payments from your own customers go through your connected Stripe account. Stripe is not used to bill Keplar plans.",
        ] },
        { type: "p", text: "We do not sell this data and give these companies only what they need to do their job. If we add or replace a provider that handles your personal data, we will update this list and the date at the top." },
      ],
    },
    {
      id: "sharing",
      title: "When else information is shared",
      blocks: [
        { type: "list", items: ["With your organization, if you use a Keplar Business account under its agreement.", "When you ask us to, for example by publishing a site you built with Keplar.", "To comply with law or protect people's safety and Keplar's rights.", "As part of a merger, acquisition or sale of assets, subject to this policy."] },
      ],
    },
    {
      id: "retention",
      title: "How long data is kept",
      blocks: [
        { type: "list", items: [
          "Chats, study sets, decks and memory. Kept in your account until you delete them. Deleting in the app, or using the erase options, removes them from the database.",
          "Signed-out chats. Only in your browser, until you clear it.",
          "Account and billing records. Kept while your account exists and as long as needed to meet legal and accounting duties.",
          "Usage records and logs. Kept as long as needed to run limits, billing and security. Rate-limit counts expire after 60 days.",
          "Who is on the site now. A code and a last-seen time, gone about 40 seconds after your last signal (or when you leave) and cleared within minutes. No IP address, page or account.",
          "Visit counts. Anonymous daily codes are kept 35 days, then only daily totals remain. They hold no IP address, no account and no question text.",
          "Product and funnel events. If you allowed analytics, deleted after 180 days. They hold no account details and no question text.",
          "Learning records. Content-free routing results are deleted after 45 days. Failed-question copies exist only if you turned on Help improve Keplar, and are kept until you delete them, turn it off or delete your account.",
          "Shared answer links. Expire after 90 days, or sooner if you revoke them. Public answer pages stay up until you make them private, revoke the link or delete your account.",
          "Images and video. The copy in your account stays until you delete it. The generation provider may keep its own copy for at least 7 days.",
          "Feedback. Kept with your account, and deleted with it.",
          "Email. Messages you send us are kept as long as needed to help you.",
        ] },
        { type: "p", text: "Our database host may keep backups for a limited time after deletion. Deleted data is not restored into the product. Model providers may keep data under their own terms, as described above." },
      ],
    },
    {
      id: "security",
      title: "Security",
      blocks: [
        { type: "p", text: "Traffic to Keplar is encrypted in transit with HTTPS. Sessions and plan cookies are signed, and the application keeps each account's data separate so that one account cannot read another's chats, study sets, decks or memory. Payment card details never touch Keplar's servers." },
        { type: "p", text: "No system is perfectly secure. Keplar does not currently hold a security certification or audit, and we'll tell you if a breach affects your data as the law requires. To report a security issue, email the address below." },
      ],
    },
    {
      id: "business-data",
      title: "Keplar Business and agents",
      blocks: [
        { type: "p", text: "When your organization uses Keplar Business, its agreement with Keplar governs the content its users submit, and its administrators may be able to access and manage that content." },
        { type: "p", text: "Agents can keep working after you close the tab. To do that safely, Keplar records what each agent does: the tools it used, the actions it took, approvals requested and granted, and spend against its cap. This record is the audit log you see in the product." },
      ],
    },
    {
      id: "teams-api-extension",
      title: "Team workspaces, API keys and the browser extension (beta)",
      blocks: [
        { type: "p", text: "Team workspaces (beta, Business plan). A team is a separate workspace that its members share. Projects, chats and sites created while working in the team belong to the team, not to the person who made them, and every member can see what their role allows. Your personal chats, memory, files and other sites are never shared with a team. The team keeps its member list with their email addresses, the roles, pending invites, and an audit log of who changed membership, roles and exports (the newest 500 entries, visible to admins and the owner). An invite is a draft until the owner or an admin presses Send: the email goes through our email provider only then, or the person copies a one-time link themselves. Invite links are stored only as a hash, expire after 7 days, and work once, for that email address only. When a member is removed, or leaves, their access stops on the very next request. Deleting a team deletes its shared projects, chats and sites; deleting your account removes you from every team you joined. The team owner can download an export of the team's data." },
        { type: "p", text: "API keys (beta). A key you create is shown once and stored only as a hash, with its name, scopes, expiry, and counters for requests, credits and last use. Questions sent through the API are processed like questions from a paid account in the app, by the AI model providers described above, and are not saved to your memory or chats. Keys are exported without their hash, and deleting your account deletes your keys. Revoking a key takes effect on the next request." },
        { type: "p", text: "Browser extension (Keplar One). The extension reads the selected text, the text of the page you are on, or the area you drag over or click with Search with Keplar One, only when you press a button or choose a context-menu item, and only on that browser tab, never the rest of your screen. Text is sent to Keplar only when you press Ask. To use the extension you connect it to your account: you press Connect, approve it on keplar.one while signed in (after checking the code it shows), and Keplar gives the extension a key for your account that only that extension can collect. Its questions and searches spend your plan's credits like a question in the app, it is listed as a browser extension in Account → Developer API, and it works until you disconnect it (in the extension or in Account) or for a year. You can paste an API key you made instead. Search with Keplar One asks you once before its first search: after you agree, each search sends the words inside the area you dragged over or clicked and a picture of that area (a JPEG of that part of the tab only), plus your earlier questions in that search for follow-ups. The picture is answered only by AI models that can read images, is processed like an image you attach in the app, and is not saved by the extension or by Keplar. Copy as image keeps the picture on your device. The only things the extension stores on your device are its connection key (or the API key you pasted), the email address of the connected account, and that you agreed to Search with Keplar One, in the extension's own storage. It has no analytics, no advertising and no remote code, and it labels a page to Keplar by its host name only. Removing the extension or pressing Disconnect stops it; disconnect it in Account → Developer API to cut off access at once." },
      ],
    },
    {
      id: "international-processing",
      title: "International processing",
      blocks: [
        { type: "p", text: "Keplar's hosting, database, email and model providers operate in several countries, including the United States, so your data may be processed outside the country where you live. Keplar does not currently offer region-restricted processing." },
      ],
    },
    {
      id: "your-rights",
      title: "Your rights and choices",
      blocks: [
        { type: "p", text: "Depending on where you live, you may have the right to access, correct, export or delete your personal data, to object to or restrict certain processing, and to withdraw consent." },
        {
          type: "list",
          items: [
            "In the app. Delete any chat, study set, slide deck or memory item. Turn memory off. Erase all memory and, optionally, all saved chat history, in Account. In Account > Your data you can download a copy of your data (JSON) and delete your account. Deletion starts a 14-day grace period that you can cancel, after which everything is removed; you can also choose to delete immediately. Deleting removes your chats, memory, sites, images, decks, study sets, business data and sign-in. We keep payment records, usage counters and abuse reports, which hold ids and amounts but no chat, memory or site content, as the law and the integrity of billing and abuse protection require. An active paid subscription must be canceled first.",
            "By email. Ask us to export or delete your account and its data, or to correct it, at the address below. We may need to confirm it is you. We'll reply as soon as we can and within any time the law requires.",
          ],
        },
        { type: "p", text: "You can change theme or clear browser storage at any time in your browser." },
      ],
    },
    {
      id: "children",
      title: "Children",
      blocks: [
        { type: "p", text: "Keplar accounts are for people who are at least 13 years old. People under 18 may use Keplar only with the permission of a parent or legal guardian, as the Terms of Service explain. Keplar is not directed at children under 13, and we don't knowingly collect personal data from them. If you are a parent or guardian and believe a child under 13 has given us personal data, email us and we will delete the account and its data. Where the law sets a higher minimum age for consent to data processing, that age applies." },
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      blocks: [
        { type: "p", text: "When this policy changes, the date at the top changes too. If a change is significant, we'll tell you in the app or by email before it takes effect." },
      ],
    },
    {
      id: "contact",
      title: "Contact",
      blocks: [
        { type: "p", text: `${PRODUCT_NAME} is provided by ${COMPANY_NAME}.` },
        { type: "email", label: "Questions about privacy, or requests to access, export or delete your data:", email: CONTACT_EMAIL },
        { type: "p", text: "You can also reach us through the Inquire page." },
        { type: "review", text: "The legal entity name and postal address have not been supplied yet and will be added here once the founders confirm them." },
      ],
    },
  ],
};
