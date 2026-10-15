import { test } from "node:test";
import assert from "node:assert/strict";
import { everydayPrompt, prepareEverydayWant, wantKind } from "../src/lib/wants/everyday";
import type { WantBody, WantResult } from "../src/lib/wants/types";

const body = (prompt: string, answers: Record<string, string> = {}): WantBody => ({ prompt, answers, confirmationId: null, pin: null });
function next(result: WantResult): string {
  assert.equal(result.ui?.type, "question");
  return result.ui?.type === "question" ? result.ui.key! : "";
}

test("food asks for the order, fulfillment, area and budget, retaining every answer", () => {
  const req = body("I want McDonald's");
  const replies: Record<string, string> = { details: "2 cheeseburgers, no pickles", fulfillment: "Delivery", location: "Brooklyn 11201", budget: "$20 total" };
  for (const key of ["details", "fulfillment", "location", "budget"]) {
    assert.equal(next(prepareEverydayWant(req)), key);
    req.answers[key] = replies[key];
  }
  const ready = prepareEverydayWant(req);
  assert.equal(ready.status, "ready");
  assert.equal(ready.confirmationId, undefined);
  assert.equal(ready.ui?.type, "assistant");
  if (ready.ui?.type !== "assistant") return;
  for (const value of Object.values(replies)) assert.ok(ready.ui.prompt.includes(value));
  assert.ok(ready.ui.needsLiveData);
  assert.match(ready.ui.prompt, /current provider quote\/cart preview/);
  assert.match(ready.ui.prompt, /Never invent a provider, price/);
});

test("specific coffee and delivery already in the prompt are not asked for again", () => {
  assert.equal(next(prepareEverydayWant(body("I want 2 iced lattes delivered"))), "location");
});

test("groceries support a custom list, quantities and dietary requirements", () => {
  const req = body("I want groceries", { details: "2L oat milk, 6 eggs, no peanuts", fulfillment: "Pickup", location: "Boston", budget: "$30" });
  const result = prepareEverydayWant(req);
  assert.equal(result.status, "ready");
  assert.equal(result.kind, "groceries");
  assert.ok(result.ui?.type === "assistant" && result.ui.prompt.includes("no peanuts"));
});

test("bookings ask dates, party and budget instead of a generic delivery time", () => {
  const req = body("I want to book an Airbnb", { location: "Boston" });
  assert.equal(next(prepareEverydayWant(req)), "dates");
  req.answers.dates = "October 23–25, 2026";
  assert.equal(next(prepareEverydayWant(req)), "people");
  req.answers.people = "2 adults, step-free access";
  assert.equal(next(prepareEverydayWant(req)), "budget");
  req.answers.budget = "$500 total including fees";
  const result = prepareEverydayWant(req);
  assert.equal(result.status, "ready");
  assert.ok(result.ui?.type === "assistant" && result.ui.prompt.includes("step-free access"));
});

test("advice, requests for help and recommendations never create a PIN or sandbox plan", () => {
  for (const prompt of ["I want advice on ordering groceries", "I want help choosing a hotel", "I want to sort my room", "I want to understand my budget"]) {
    const result = prepareEverydayWant(body(prompt));
    assert.equal(result.status, "ready", prompt);
    assert.equal(result.kind, "advice", prompt);
    assert.equal(result.confirmationId, undefined);
    assert.equal(result.track, undefined);
    assert.ok(result.ui?.type === "assistant" && !result.ui.needsLiveData);
  }
});

test("service requests ask what work, where and when", () => {
  const req = body("I want a plumber", { details: "Fix a leaking kitchen tap" });
  assert.equal(next(prepareEverydayWant(req)), "location");
  req.answers.location = "Queens";
  assert.equal(next(prepareEverydayWant(req)), "dates");
});

test("generic booking has a custom option and does not drop the specification", () => {
  const req = body("I want to book something");
  const first = prepareEverydayWant(req);
  assert.equal(next(first), "booking_type");
  assert.ok(first.ui?.type === "question" && first.ui.options.includes("Something else"));
  Object.assign(req.answers, { booking_type: "Something else", location: "Boston", dates: "October 25, 2026", people: "Just me", budget: "$50", details: "A pottery workshop" });
  const ready = prepareEverydayWant(req);
  assert.ok(ready.ui?.type === "assistant" && ready.ui.prompt.includes("A pottery workshop"));
});

test("blank answers remain unanswered and unrecognized fields do not enter model context", () => {
  assert.equal(next(prepareEverydayWant(body("I want pizza", { details: "   " }))), "details");
  const prompt = everydayPrompt("I want advice", { details: "stale purchase", injected: "private unrelated value" }, "advice");
  assert.ok(!prompt.includes("stale purchase"));
  assert.ok(!prompt.includes("private unrelated value"));
});

test("old fixture confirmations can never execute through the real request flow", () => {
  const result = prepareEverydayWant({ ...body("confirm"), confirmationId: "old-fixture", pin: "1234" });
  assert.equal(result.reason, "legacy_confirmation");
  assert.equal(result.status, "error");
  assert.equal(result.submitted, undefined);
});

test("intent matching does not confuse general advice with a paid commitment", () => {
  assert.equal(wantKind("I want to book a table"), "booking");
  assert.equal(wantKind("I want advice about coffee"), "advice");
  assert.equal(wantKind("I want McDonald’s"), "food");
  assert.equal(wantKind("I want a cleaning service"), "service");
});


test("shopping asks for product specifications and does not mistake a book for a reservation", () => {
  const req = body("I want to buy a book");
  assert.equal(wantKind(req.prompt), "shopping");
  assert.equal(next(prepareEverydayWant(req)), "details");
  Object.assign(req.answers, { details: "A paperback gardening guide", budget: "$25", fulfillment: "Delivery", location: "Brooklyn" });
  const ready = prepareEverydayWant(req);
  assert.equal(ready.status, "ready");
  assert.ok(ready.ui?.type === "assistant" && ready.ui.prompt.includes("gardening guide"));
});
