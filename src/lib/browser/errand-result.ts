/**
 * The structured part of a finished Keplar Browser errand: an order summary (items, fees, total) or a list of options to compare
 * (hotels, flights, products). Pure and client-safe; used both where the task's answer is saved and where the card shows it.
 *
 * Only what the task read off real pages is kept. Prices stay exactly as the page wrote them ("$12.99", "€84 / night"). A value
 * the page itself called approximate is marked estimated, and the one number Keplar works out itself (the items added up when
 * the page showed no total) is labelled as Keplar's sum. Anything malformed is dropped rather than repaired.
 */

export type Money = { text: string; estimated?: boolean };
/** `price` is the row's price as the cart shows it (for all of that row's quantity). */
export type OrderItem = { name: string; qty?: number; price?: Money };
export type OrderFee = { label: string; amount: Money };
export type OrderResult = { type: "order"; merchant?: string; items: OrderItem[]; fees: OrderFee[]; total?: Money; url?: string };
export type OptionRow = { name: string; price?: Money; detail?: string; url?: string };
export type OptionsResult = { type: "options"; options: OptionRow[]; note?: string };
export type ErrandResult = OrderResult | OptionsResult;

export const MAX_ROWS = 12;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const https = (v: unknown) => {
  const u = str(v, 2048);
  try {
    return u && new URL(u).protocol === "https:" ? u : undefined;
  } catch {
    return undefined;
  }
};
/** A price as the page wrote it: has a digit, short, no markup. */
const money = (v: unknown, estimated: unknown): Money | undefined => {
  const text = str(v, 40);
  if (!text || !/\d/.test(text) || /[<>{}]/.test(text)) return undefined;
  return estimated === true ? { text, estimated: true } : { text };
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** The model's `result` object, validated, or null when it isn't a usable order or option list. */
export function parseErrandResult(raw: unknown): ErrandResult | null {
  const o = obj(raw);
  if (!o) return null;
  const type = str(o.type, 10).toLowerCase();
  if (type === "order") {
    const items: OrderItem[] = [];
    for (const it of Array.isArray(o.items) ? o.items.slice(0, MAX_ROWS) : []) {
      const r = obj(it);
      const name = r ? str(r.name, 120) : "";
      if (!r || !name) continue;
      const qty = typeof r.qty === "number" && Number.isInteger(r.qty) && r.qty > 0 && r.qty < 100 ? r.qty : undefined;
      const price = money(r.price, r.estimated);
      items.push({ name, ...(qty ? { qty } : {}), ...(price ? { price } : {}) });
    }
    const fees: OrderFee[] = [];
    for (const f of Array.isArray(o.fees) ? o.fees.slice(0, 6) : []) {
      const r = obj(f);
      const label = r ? str(r.label, 60) : "";
      const amount = r ? money(r.amount, r.estimated) : undefined;
      if (label && amount) fees.push({ label, amount });
    }
    if (!items.length) return null;
    const total = money(o.total, o.total_estimated ?? o.totalEstimated);
    const merchant = str(o.merchant, 80);
    const url = https(o.url);
    return { type: "order", ...(merchant ? { merchant } : {}), items, fees, ...(total ? { total } : {}), ...(url ? { url } : {}) };
  }
  if (type === "options") {
    const options: OptionRow[] = [];
    for (const it of Array.isArray(o.options) ? o.options.slice(0, MAX_ROWS) : []) {
      const r = obj(it);
      const name = r ? str(r.name, 120) : "";
      if (!r || !name) continue;
      const price = money(r.price, r.estimated);
      const detail = str(r.detail, 160);
      const url = https(r.url);
      options.push({ name, ...(price ? { price } : {}), ...(detail ? { detail } : {}), ...(url ? { url } : {}) });
    }
    if (options.length < 2) return null; // one option is an answer, not a comparison
    const note = str(o.note, 200);
    return { type: "options", options, ...(note ? { note } : {}) };
  }
  return null;
}

/** "$12.99" -> { symbol: "$", cents: 1299 }. Null when the text isn't one plain amount (ranges, "from", "/night", "12,50"). */
export function parseAmount(text: string): { symbol: string; cents: number } | null {
  const m = /^\s*([$€£¥]|[A-Z]{3}\s?)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*([A-Z]{3})?\s*$/.exec(text);
  if (!m) return null;
  const symbol = (m[1] ?? m[4] ?? "").trim();
  if (!symbol) return null;
  const whole = Number(m[2].replace(/,/g, ""));
  const frac = m[3] ? Number(m[3].padEnd(2, "0")) : 0;
  return { symbol, cents: whole * 100 + frac };
}

/**
 * The items added up, when the page showed no total and every item has one plain price in the same currency.
 * This is Keplar's own sum (shown as such): it never includes fees, tax or delivery the page didn't list.
 */
export function itemsSubtotal(items: OrderItem[]): string | null {
  if (!items.length) return null;
  let symbol: string | null = null;
  let cents = 0;
  for (const it of items) {
    const a = it.price ? parseAmount(it.price.text) : null;
    if (!a || (symbol !== null && a.symbol !== symbol)) return null;
    symbol = a.symbol;
    cents += a.cents;
  }
  const amount = (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return /^[A-Z]{3}$/.test(symbol!) ? `${amount} ${symbol}` : `${symbol}${amount}`;
}
