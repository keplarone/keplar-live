import { brand } from "./site";
/**
 * Marketing-approved FAQ (docs source: /workspace/marketing/faq-final.md).
 * Rendered visibly on /pricing; the FAQPage JSON-LD is generated from this
 * same array so the two never diverge.
 */
export const faq: { q: string; a: string }[] = [
  {
    q: `What is ${brand.companyName}?`,
    a: `${brand.companyName} is an AI company, and ${brand.name} is its AI workspace. Its engine sends your question to multiple AI models, finds where they agree, investigates where they don't, and gives you one synthesized answer with the agreement and disagreements shown. The same account also does Study mode (flashcards, quizzes and study plans from your notes), Deep Research, slideshows, image and video generation, building and publishing websites and apps, and building Roblox games in Roblox Studio from the desktop app. Keplar Business is a separate app for companies, with scheduled agents and approvals.`,
  },
  {
    q: "Who created Keplar?",
    a: "Keplar was created by two co-founders, Hassen and Hussain Keder (two different people). They founded Keplar in 2026. It sends your question to several AI models, checks where they disagree, and gives you one answer.",
  },
  {
    q: "Does Keplar ask every AI model every time?",
    a: `No. ${brand.engineName} picks only the models a question needs, weighed by quality, reliability, latency, and cost.`,
  },
  {
    q: "What happens when the models disagree?",
    a: "Keplar flags the disagreement instead of silently picking one answer. It evaluates the reasoning and evidence behind each response, because the minority can be right.",
  },
  {
    q: "Does agreement mean the answer is correct?",
    a: "Not always. Consensus can be wrong. That's why Keplar weighs the evidence and reasoning behind each response, and shows how strongly the models agreed rather than treating a majority as the truth.",
  },
  {
    q: "Can I see how Keplar reached its answer?",
    a: "Yes. Below every Keplar answer you can expand six sections: Consensus (the agreement percentage and how many models agreed and disagreed), Models consulted, Sources the models cite, Disagreements, Verification, and Reasoning summary.",
  },
  {
    q: "Is Keplar for personal use or for businesses?",
    a: "Both. Most people use Keplar for everyday questions: studying, health questions, money decisions, travel, writing, and personal projects, plus making a personal site, images, or video. If you run a business, Keplar Business adds optional tools such as commerce, a CRM, a dashboard, and agents with spend caps and approvals.",
  },
  {
    q: "Can I ask Keplar health or money questions?",
    a: "Yes, and seeing where several models disagree can help you know what to ask next. But Keplar's answers are general information, not medical, legal, or financial advice. For decisions about your health or money, talk to a qualified professional.",
  },
  {
    q: "What is the slideshow creator?",
    a: "Part of Keplar Plus and Pro. Give it a topic, an outline or your notes and it writes a deck with titles, bullet points, speaker notes and an image idea for each slide. You can edit it, present it full screen, and export to PowerPoint or PDF. The image ideas are text placeholders, not generated pictures. It isn't available on Free.",
  },
  {
    q: "What is Study mode, and is it on Free?",
    a: "Study mode is on every plan, Free included. Upload a text-based PDF (or paste your notes) and Keplar builds an outline, a plain-English summary, flashcards with spaced review, quizzes and a day-by-day plan to your exam date. You can ask questions and Keplar answers only from your material, with page references, and says so when something isn't in it. Free runs on free models with smaller limits; Plus and Pro use stronger models and allow longer documents. Scanned PDFs can't be read yet (there is no OCR), so use a PDF you can select text in.",
  },
  {
    q: "Does Keplar remember me between chats?",
    a: "Only if you're signed in, and you control it. Your chats are saved to your account so you can reopen, rename and delete them. With memory on, a free model picks out durable things you tell it about yourself, such as your name, goals and preferences, and Keplar can use them in later answers. It also keeps a short summary of each chat, so a new chat starts knowing roughly what your last few were about and you can ask \"what did we talk about last time?\" (answered from those summaries, at no cost). It never learns from documents you upload, and it doesn't use your credits. Turn memory off, delete single items, or erase everything (and optionally your chat history) from Account, or just say \"forget that\" or \"erase my memory\" in a chat. Deleting removes the data from our servers. Signed-out chats aren't remembered.",
  },
  {
    q: "How much does Keplar cost?",
    a: "Free is $0. Keplar Lite is $20 a month, Keplar Plus is $45 a month, and Keplar Pro is $99 a month. Keplar Business is custom, so talk to us through the Inquire form.",
  },
];
