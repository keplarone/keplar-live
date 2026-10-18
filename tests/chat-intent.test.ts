import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_STYLES, CHAT_COMMANDS, appNameFrom, chatSlashToken, filterChatCommands, intentLabel, routeChat, slideIndexFrom, type LastCard } from "@/lib/chat-actions/intent";
import { STYLE_IDS } from "@/lib/app-builder/types";
import { SLASH_COMMANDS } from "@/lib/images/slash-commands";

const r = (text: string, last?: LastCard) => routeChat(text, { last });
const type = (text: string, last?: LastCard) => r(text, last)?.intent.type ?? null;

test("intent: natural requests open the right tool", () => {
  assert.deepEqual(r("make a slideshow about the water cycle")?.intent, { type: "slides.new", brief: "make a slideshow about the water cycle" });
  assert.equal(type("Can you create a 6-slide presentation on our Q3 results?"), "slides.new");
  assert.equal(type("please put together a pitch deck for my bakery"), "slides.new");
  assert.deepEqual(r("turn this into slides")?.intent, { type: "slides.new", brief: "" });
  assert.deepEqual(r("quiz me on photosynthesis")?.intent, { type: "study.new", topic: "photosynthesis", focus: "quiz" });
  assert.deepEqual(r("make flashcards about Spanish irregular verbs")?.intent, { type: "study.new", topic: "Spanish irregular verbs", focus: "cards" });
  assert.deepEqual(r("show my pending approvals")?.intent, { type: "workspace", card: "approvals" });
  assert.deepEqual(r("What are my pending approvals?")?.intent, { type: "workspace", card: "approvals" });
  assert.deepEqual(r("anything waiting for my approval?")?.intent, { type: "workspace", card: "approvals" });
  assert.deepEqual(r("edit my BikeFix app to add a dark mode")?.intent, { type: "create.edit", appName: "BikeFix", instruction: "add a dark mode" });
  assert.deepEqual(r("add a booking form to my BikeFix site")?.intent, { type: "create.edit", appName: "BikeFix", instruction: "add a booking form" });
  assert.deepEqual(r("switch my BikeFix app to dark mode")?.intent, { type: "create.theme", appName: "BikeFix", mode: "dark" });
  assert.deepEqual(r("change my Salon site to the brutalist style")?.intent, { type: "create.theme", appName: "Salon", style: "brutalist" });
  assert.deepEqual(r("publish my BikeFix app")?.intent, { type: "create.publish", appName: "BikeFix" });
  assert.deepEqual(r("take my BikeFix site down")?.intent, { type: "create.unpublish", appName: "BikeFix" });
  assert.equal(type("build me an app that tracks my running miles"), "create.new");
  assert.equal(type("make a website for my dog grooming business"), "create.new");
});

test("intent: business, agents, projects, deployments and history", () => {
  assert.deepEqual(r("show my leads")?.intent, { type: "workspace", card: "leads" });
  assert.deepEqual(r("did I get any new leads?")?.intent, { type: "workspace", card: "leads" });
  assert.deepEqual(r("open my CRM")?.intent, { type: "workspace", card: "crm" });
  assert.deepEqual(r("show me my deals")?.intent, { type: "workspace", card: "crm" });
  assert.deepEqual(r("how's my business doing?")?.intent, { type: "workspace", card: "dashboard" });
  assert.deepEqual(r("show my dashboard")?.intent, { type: "workspace", card: "dashboard" });
  assert.deepEqual(r("list my agents")?.intent, { type: "workspace", card: "agents" });
  assert.deepEqual(r("pause my lead follow-up agent")?.intent, { type: "workspace", card: "agents", act: { type: "pause", name: "lead follow-up" } });
  assert.deepEqual(r("run the weekly report agent now")?.intent, { type: "workspace", card: "agents", act: { type: "run", name: "weekly report" } });
  assert.deepEqual(r("resume my monitor agent")?.intent, { type: "workspace", card: "agents", act: { type: "resume", name: "monitor" } });
  assert.equal(type("set up an agent that emails new leads"), "agent.new");
  assert.deepEqual(r("show my projects")?.intent, { type: "workspace", card: "projects" });
  assert.deepEqual(r("create a project called Thesis")?.intent, { type: "workspace", card: "projects", act: { type: "create-project", name: "Thesis" } });
  assert.deepEqual(r("show my deployments")?.intent, { type: "workspace", card: "deployments" });
  assert.deepEqual(r("what's live?")?.intent, { type: "workspace", card: "deployments" });
  assert.deepEqual(r("list my apps")?.intent, { type: "workspace", card: "apps" });
  assert.deepEqual(r("find my chat about taxes")?.intent, { type: "workspace", card: "history", query: "taxes" });
  assert.deepEqual(r("show my chat history")?.intent, { type: "workspace", card: "history" });
});

test("intent: questions and ordinary messages are answered, not hijacked", () => {
  for (const q of [
    "How do I make a good presentation?",
    "What makes a slideshow engaging?",
    "Why do people use flashcards?",
    "explain how a CRM works",
    "what is a sales pipeline",
    "how should I edit my app's code?",
    "write a poem about the sea",
    "make a joke",
    "draw a picture of a cat",
    "make an image of a bike shop logo",
    "tell me about agents in AI",
    "is it worth publishing my app on the app store",
    "hi",
  ]) assert.equal(r(q), null, q);
});

test("intent: a bare topic that names a tool gets a choice card", () => {
  const c = r("presentation on climate change")?.intent;
  assert.equal(c?.type, "choose");
  if (c?.type !== "choose") return;
  assert.equal(c.choices[0].intent?.type, "slides.new");
  assert.equal(c.choices[1].intent, null, "the other option is a normal answer");
  assert.equal(type("flashcards for the French revolution"), "choose");
});

test("intent: follow-ups act on the most recent card", () => {
  const deck: LastCard = { kind: "slides", deckId: "dk_1", count: 8 };
  assert.deepEqual(r("make slide 3 shorter", deck)?.intent, { type: "slides.edit", deckId: "dk_1", index: 2, instruction: "make slide 3 shorter" });
  assert.deepEqual(r("Rewrite the last slide as a call to action", deck)?.intent, { type: "slides.edit", deckId: "dk_1", index: 7, instruction: "Rewrite the last slide as a call to action" });
  assert.equal(r("make slide 12 shorter", deck), null, "no such slide");
  assert.deepEqual(r("switch to the light theme", deck)?.intent, { type: "slides.theme", deckId: "dk_1", theme: "light" });
  assert.deepEqual(r("present it", deck)?.intent, { type: "slides.present", deckId: "dk_1" });
  assert.equal(r("make slide 3 shorter"), null, "no deck in the thread: answered normally");
  assert.equal(r("make slide 3 shorter", deck)?.via, "follow-up");

  const set: LastCard = { kind: "study", setId: "ss_1" };
  assert.deepEqual(r("quiz me again", set)?.intent, { type: "study.again", setId: "ss_1", focus: "quiz" });
  assert.deepEqual(r("show the flashcards", set)?.intent, { type: "study.again", setId: "ss_1", focus: "cards" });
  assert.deepEqual(r("how am I doing?", set)?.intent, { type: "study.again", setId: "ss_1", focus: "overview" });

  const app: LastCard = { kind: "create", appId: "sit_1", name: "BikeFix" };
  assert.deepEqual(r("add a contact form to the footer", app)?.intent, { type: "create.edit", appId: "sit_1", instruction: "add a contact form to the footer" });
  assert.deepEqual(r("make it dark", app)?.intent, { type: "create.theme", appId: "sit_1", mode: "dark" });
  assert.deepEqual(r("switch it to the luxury look", app)?.intent, { type: "create.theme", appId: "sit_1", style: "luxury" });
  assert.deepEqual(r("publish it", app)?.intent, { type: "create.publish", appId: "sit_1" });
  assert.deepEqual(r("take it down", app)?.intent, { type: "create.unpublish", appId: "sit_1" });
  assert.deepEqual(r("edit the app to add a dark mode toggle", app)?.intent, { type: "create.edit", appId: "sit_1", instruction: "add a dark mode toggle" }, "a toggle is a feature, not a look");
  assert.equal(r("make a joke", app), null, "a follow-up that isn't about the app is answered");
  assert.equal(r("what's the capital of France?", app), null);

  const agents: LastCard = { kind: "workspace", card: "agents" };
  assert.deepEqual(r("pause lead follow-up", agents)?.intent, { type: "workspace", card: "agents", act: { type: "pause", name: "lead follow-up" } });
});

test("intent: slash commands are explicit and always win", () => {
  assert.deepEqual(r("/slides the history of jazz")?.intent, { type: "slides.new", brief: "the history of jazz" });
  assert.equal(r("/slides the history of jazz")?.via, "slash");
  assert.deepEqual(r("/quiz cell biology")?.intent, { type: "study.new", topic: "cell biology", focus: "quiz" });
  assert.deepEqual(r("/quiz", { kind: "study", setId: "ss_9" })?.intent, { type: "study.again", setId: "ss_9", focus: "quiz" });
  assert.deepEqual(r("/flashcards French verbs")?.intent, { type: "study.new", topic: "French verbs", focus: "cards" });
  assert.deepEqual(r("/edit BikeFix: add a dark mode")?.intent, { type: "create.edit", appName: "BikeFix", instruction: "add a dark mode" });
  assert.deepEqual(r("/theme BikeFix dark")?.intent, { type: "create.theme", appName: "BikeFix", mode: "dark" });
  assert.deepEqual(r("/theme brutalist", { kind: "create", appId: "sit_2" })?.intent, { type: "create.theme", appId: "sit_2", style: "brutalist" });
  assert.deepEqual(r("/publish BikeFix")?.intent, { type: "create.publish", appName: "BikeFix" });
  assert.deepEqual(r("/approvals")?.intent, { type: "workspace", card: "approvals" });
  assert.deepEqual(r("/agents pause Weekly report")?.intent, { type: "workspace", card: "agents", act: { type: "pause", name: "Weekly report" } });
  assert.deepEqual(r("/projects new Thesis")?.intent, { type: "workspace", card: "projects", act: { type: "create-project", name: "Thesis" } });
  assert.deepEqual(r("/history taxes")?.intent, { type: "workspace", card: "history", query: "taxes" });
  for (const id of ["crm", "leads", "dashboard", "deployments", "apps"]) assert.deepEqual(r(`/${id}`)?.intent, { type: "workspace", card: id });
  assert.equal(r("/BTS red sneaker"), null, "image slash commands are not chat commands");
  assert.equal(r("/nope"), null);
});

test("intent: chat commands never clash with the image commands, and the menu filters by prefix", () => {
  const image = new Set(SLASH_COMMANDS.map((c) => c.id));
  for (const c of CHAT_COMMANDS) assert.ok(!image.has(c.id), c.id);
  assert.deepEqual(filterChatCommands("/sl").map((c) => c.id), ["slides"]);
  assert.equal(filterChatCommands("/").length, CHAT_COMMANDS.length);
  assert.deepEqual(chatSlashToken("/qu", 3), { query: "/qu", end: 3 });
  assert.equal(chatSlashToken("hello /qu", 9), null, "chat commands only lead a message");
});

test("intent: helpers", () => {
  assert.equal(slideIndexFrom("make slide 3 shorter"), 2);
  assert.equal(slideIndexFrom("the third slide needs a chart"), 2);
  assert.equal(slideIndexFrom("slide five: add a quote"), 4);
  assert.equal(slideIndexFrom("tighten the last slide", 6), 5);
  assert.equal(slideIndexFrom("the title slide is too long"), 0);
  assert.equal(slideIndexFrom("make it shorter"), null);
  assert.equal(appNameFrom("edit my BikeFix app"), "BikeFix");
  assert.equal(appNameFrom("edit my app"), null);
  assert.equal(appNameFrom("change the look of my BikeFix app to brutalist"), "BikeFix", "the name follows the last my/the/our");
  assert.equal(appNameFrom("publish the Mill Lane site"), "Mill Lane");
  assert.deepEqual(APP_STYLES.map((s) => s.id).sort(), [...STYLE_IDS].sort(), "every Create look can be asked for by name");
  assert.equal(intentLabel({ type: "study.new", topic: "x", focus: "quiz" }), "Quiz");
  assert.equal(intentLabel({ type: "workspace", card: "crm" }), "CRM");
});
