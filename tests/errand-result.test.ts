import { test } from "node:test";
import assert from "node:assert/strict";
import { itemsSubtotal, parseAmount, parseErrandResult } from "@/lib/browser/errand-result";
import { parseAction } from "@/lib/browser/policy";
import { errandResultOf } from "@/lib/browser/errand-view";

test("errand result: an order keeps only what the page showed, prices as written", () => {
  const r = parseErrandResult({
    type: "order",
    merchant: "Domino's",
    items: [{ name: "Large pepperoni", qty: 2, price: "$25.98" }, { name: "Garlic bread", price: "$6.49" }, { name: "" }, "junk", { name: "Coke", price: "free!" }],
    fees: [{ label: "Delivery", amount: "$3.99", estimated: true }, { label: "Tip" }],
    total: "$36.46",
    url: "javascript:alert(1)",
  });
  assert.deepEqual(r, {
    type: "order",
    merchant: "Domino's",
    items: [{ name: "Large pepperoni", qty: 2, price: { text: "$25.98" } }, { name: "Garlic bread", price: { text: "$6.49" } }, { name: "Coke" }],
    fees: [{ label: "Delivery", amount: { text: "$3.99", estimated: true } }],
    total: { text: "$36.46" },
  });
  assert.equal(parseErrandResult({ type: "order", items: [] }), null);
  const est = parseErrandResult({ type: "order", items: [{ name: "x" }], total: "about $20", total_estimated: true });
  assert.deepEqual(est?.type === "order" ? est.total : null, { text: "about $20", estimated: true });
  assert.equal(parseErrandResult(null), null);
  assert.equal(parseErrandResult({ type: "receipt" }), null);
});

test("errand result: options need at least two, and links must be https", () => {
  const r = parseErrandResult({ type: "options", options: [{ name: "Hotel A", price: "€120 / night", detail: "4.6 stars", url: "https://a.example/h" }, { name: "Hotel B", url: "http://b.example" }] });
  assert.deepEqual(r, { type: "options", options: [{ name: "Hotel A", price: { text: "€120 / night" }, detail: "4.6 stars", url: "https://a.example/h" }, { name: "Hotel B" }] });
  assert.equal(parseErrandResult({ type: "options", options: [{ name: "Only one" }] }), null);
});

test("errand result: Keplar's own sum only when every item has one plain price in one currency", () => {
  assert.deepEqual(parseAmount("$1,234.5"), { symbol: "$", cents: 123450 });
  assert.deepEqual(parseAmount("12.00 EUR"), { symbol: "EUR", cents: 1200 });
  assert.equal(parseAmount("from $12"), null);
  assert.equal(parseAmount("$12 / night"), null);
  assert.equal(parseAmount("12.99"), null);
  const p = (text: string) => ({ text });
  // An item's price is its whole row, so quantity is not multiplied again.
  assert.equal(itemsSubtotal([{ name: "a", qty: 2, price: p("$25.98") }, { name: "b", price: p("$6.49") }]), "$32.47");
  assert.equal(itemsSubtotal([{ name: "a", price: p("$5") }, { name: "b", price: p("€5") }]), null);
  assert.equal(itemsSubtotal([{ name: "a", price: p("$5") }, { name: "b" }]), null);
  assert.equal(itemsSubtotal([]), null);
});

test("errand result: the browser's done action carries it, and the card re-checks it", () => {
  const a = parseAction(JSON.stringify({ action: "done", answer: "Cart ready", result: { type: "order", items: [{ name: "Pizza", price: "$12" }] } }));
  assert.deepEqual(a, { kind: "done", answer: "Cart ready", result: { type: "order", items: [{ name: "Pizza", price: { text: "$12" } }], fees: [] } });
  assert.deepEqual(parseAction(JSON.stringify({ action: "done", answer: "x", result: "nope" })), { kind: "done", answer: "x" });
  const task = { id: "t", goal: "g", steps: [], result: { type: "order", items: [{ name: "Pizza" }] } };
  assert.equal(errandResultOf({ ...task, status: "done" })?.type, "order");
  assert.equal(errandResultOf({ ...task, status: "needs_you" })?.type, "order");
  assert.equal(errandResultOf({ ...task, status: "running" }), null);
  assert.equal(errandResultOf({ ...task, status: "done", result: { type: "order", items: "x" } }), null);
});
