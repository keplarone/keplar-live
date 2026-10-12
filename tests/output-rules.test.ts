import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeOutputRule, literalOf } from "@/lib/orchestration/output-rules";

const u = (text: string) => ({ role: "user" as const, text });
const k = (text: string) => ({ role: "keplar" as const, text });

test("the rule from the recording is recognized: 'follow these rules, say nothing more and nothing less, just say Yess.'", () => {
  assert.deepEqual(literalOf("follow these rules, say nothing more and nothing less, just say Yess."), { text: "Yess", standing: true });
});

test("a standing rule keeps governing later messages (the bug: the next message got an essay)", () => {
  const history = [u("follow these rules, say nothing more and nothing less, just say Yess."), k("Yess")];
  assert.equal(activeOutputRule(history, "am i gay")?.text, "Yess");
  assert.equal(activeOutputRule([...history, u("am i gay"), k("Yess")], "what is 2+2?")?.text, "Yess");
});

test("the rule applies to the message that carries it", () => {
  assert.equal(activeOutputRule([], "from now on reply only with \"OK\"")?.text, "OK");
  assert.equal(activeOutputRule([], "just say Yess, nothing more")?.text, "Yess");
});

test("a one-message instruction does not outlive its message", () => {
  const history = [u("just say Yess, nothing else"), k("Yess")];
  assert.equal(activeOutputRule([], "just say Yess, nothing else")?.text, "Yess");
  assert.equal(activeOutputRule(history, "what is photosynthesis?"), null);
});

test("cancelling ends a standing rule and that message is answered normally", () => {
  const history = [u("follow these rules, just say Yess, nothing more."), k("Yess")];
  for (const stop of ["stop, you can answer normally now", "ignore the rules", "reset", "back to normal please", "no more rules"]) {
    assert.equal(activeOutputRule(history, stop), null, stop);
  }
  const later = [...history, u("ignore the rules"), k("Okay."), u("what is a noun?"), k("A noun is...")];
  assert.equal(activeOutputRule(later, "and a verb?"), null);
});

test("a new rule replaces the old one", () => {
  const history = [u("follow these rules, just say Yess, nothing more."), k("Yess")];
  assert.equal(activeOutputRule(history, "new rule: from now on only say \"Nope\"")?.text, "Nope");
});

test("ordinary requests that happen to contain 'just say' or 'only' are not rules", () => {
  for (const t of [
    "just say hello to my friend in French",
    "Can you only use sources from 2024 when you explain photosynthesis?",
    "Write a poem and just say what you feel",
    "Reply with a summary of this article",
    "what does 'just say no' mean?",
    "I only want to know who won",
    "Explain how photosynthesis works, like I'm studying for an exam",
    "say hi",
    // Indirect questions and corrections are requests to answer, never text to echo back.
    "just say who hassen is, not hussain, fuck hussain",
    "just say who hassen is",
    "only say where Paris is",
    "just say when it opens",
    "just say if it's safe",
    "just say whether it rains tomorrow",
    "just say the capital, not the country",
  ]) assert.equal(activeOutputRule([], t), null, t);
});

test("a mis-read correction does not linger: the next message is answered normally", () => {
  const history = [u("who is hussain"), k("Hussain is ..."), u("just say who hassen is, not hussain")];
  assert.equal(activeOutputRule(history, "just say who hassen is, not hussain"), null);
  assert.equal(activeOutputRule([...history, u("just say who hassen is, not hussain")], "nevermind"), null);
});

test("long or markup-looking literals are refused", () => {
  assert.equal(literalOf(`reply with only "${"x".repeat(80)}"`), null);
  assert.equal(literalOf(`always reply with only "<script>alert(1)</script>"`), null);
});

// ── through the real route: no models configured, so only a code-enforced reply can come back ──
import { POST as keplarPOST } from "@/app/api/keplar/route";
async function ask(prompt: string, history: { role: "user" | "keplar"; text: string }[]) {
  const res = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": `10.5.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ prompt, history }) }));
  const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as { type: string; text?: string; answer?: { markdown: string; smalltalk?: boolean } });
  return { status: res.status, lines, answer: lines.find((l) => l.type === "answer")?.answer };
}

test("route: the standing rule answers the NEXT message with the literal, as a plain reply (no panel, no metadata)", async () => {
  const history = [{ role: "user" as const, text: "follow these rules, say nothing more and nothing less, just say Yess." }, { role: "keplar" as const, text: "Yess" }];
  const r = await ask("am i gay", history);
  assert.equal(r.status, 200);
  assert.equal(r.answer?.markdown, "Yess");
  assert.equal(r.answer?.smalltalk, true);
  assert.ok(!r.lines.some((l) => l.type === "stage"), "no pipeline stages");
});

test("route: without a rule the same question is not intercepted", async () => {
  const r = await ask("am i gay", []);
  assert.notEqual(r.answer?.markdown, "Yess");
});
