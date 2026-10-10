/**
 * An imported product: what the owner reviewed and approved in the "Imported product" card. It rides on the site brief
 * (so it is stored per site) and is the only source of product facts the generator may use. Pure types and normalizers
 * (no server imports) so the client can share them.
 */

export const BLOB_RE = /^[a-f0-9]{32}$/;

export type ProductBuy = "link" | "contact" | "later";
export type ProductImageRole = "hero" | "gallery";
export type ProductImageRef = { id: string; alt: string; role: ProductImageRole; width: number; height: number };
export type ProductVariant = { name: string; values: string[] };

export type ProductInfo = {
  /** How the data got here. Everything is editable either way. */
  via: "link" | "image" | "manual";
  sourceUrl: string;
  sourceHost: string;
  name: string;
  brand: string;
  description: string;
  features: string[];
  /** Decimal as listed ("49.00"), empty when unknown. Never guessed. */
  price: string;
  /** ISO 4217 ("USD"), empty when unknown. */
  currency: string;
  availability: string;
  variants: ProductVariant[];
  images: ProductImageRef[];
  /** What the Buy button does. */
  buy: ProductBuy;
  buyUrl: string;
  /** The owner confirmed they have the rights to the images. Without it no image is used. */
  rightsConfirmed: boolean;
  importedAt: string;
};

export const PRODUCT_TEXT = { name: 120, brand: 60, description: 1200, feature: 140, features: 8, price: 14, variants: 4, variantValues: 12, variantName: 30, alt: 160, images: 20, url: 600 } as const;

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

const oneLine = (v: unknown, max: number) => clean(v, max * 2).replace(/\s*\n\s*/g, " ").trim().slice(0, max);

/** A public web address the owner may link to. Returns "" for anything else (javascript:, data:, credentials, junk). */
export function cleanHttpUrl(v: unknown): string {
  const raw = String(v ?? "").trim();
  if (!raw || raw.length > PRODUCT_TEXT.url || /[\u0000-\u0020\u007f]/.test(raw)) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (u.username || u.password) return "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

/** "1,299.00", "$49", "49,90 €" → "1299.00" / "49" / "49.90"; "" when it is not a plain amount. */
export function normalizePrice(v: unknown): string {
  if (/^\s*[-\u2212\u2013(]/.test(String(v ?? ""))) return ""; // a negative amount is not a price
  let s = String(v ?? "").replace(/[^\d.,]/g, "");
  if (!s) return "";
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // The later separator is the decimal mark.
    s = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) && s.indexOf(",") === lastComma ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0 || n > 999_999_999) return "";
    s = n.toFixed(2);
  }
  return Number(s) > 0 ? s : "";
}

export const normalizeCurrency = (v: unknown) => {
  const c = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : "";
};

export function formatPrice(price: string, currency: string): string {
  if (!price) return "";
  if (!currency) return price;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: price.includes(".") ? 2 : 0 }).format(Number(price));
  } catch {
    return `${currency} ${price}`;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Bounded, safe product from untrusted client input. Returns null when there is nothing worth keeping. */
export function normalizeProduct(input: unknown, prev?: ProductInfo | null): ProductInfo | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const sourceUrl = cleanHttpUrl(o.sourceUrl);
  const buyUrl = cleanHttpUrl(o.buyUrl);
  const buy: ProductBuy = o.buy === "contact" || o.buy === "later" || o.buy === "link" ? o.buy : buyUrl ? "link" : "contact";
  const images: ProductImageRef[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(o.images) ? o.images : []) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const id = String(r.id ?? "");
    if (!BLOB_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    images.push({ id, alt: oneLine(r.alt, PRODUCT_TEXT.alt), role: r.role === "hero" ? "hero" : "gallery", width: Math.max(0, Math.min(20_000, Math.round(Number(r.width) || 0))), height: Math.max(0, Math.min(20_000, Math.round(Number(r.height) || 0))) });
    if (images.length >= PRODUCT_TEXT.images) break;
  }
  // Exactly one hero when there is any image.
  if (images.length) {
    const first = images.findIndex((i) => i.role === "hero");
    images.forEach((i, n) => (i.role = n === (first >= 0 ? first : 0) ? "hero" : "gallery"));
  }
  const variants: ProductVariant[] = [];
  for (const v of Array.isArray(o.variants) ? o.variants : []) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const name = oneLine(r.name, PRODUCT_TEXT.variantName);
    const values = (Array.isArray(r.values) ? r.values : []).map((x) => oneLine(x, 40)).filter(Boolean).slice(0, PRODUCT_TEXT.variantValues);
    if (name && values.length) variants.push({ name, values });
    if (variants.length >= PRODUCT_TEXT.variants) break;
  }
  const featuresRaw = Array.isArray(o.features) ? o.features : typeof o.features === "string" ? o.features.split("\n") : [];
  const features = featuresRaw.map((x) => oneLine(x, PRODUCT_TEXT.feature)).filter(Boolean).slice(0, PRODUCT_TEXT.features);
  const p: ProductInfo = {
    via: o.via === "link" || o.via === "image" || o.via === "manual" ? o.via : prev?.via ?? "manual",
    sourceUrl,
    sourceHost: hostOf(sourceUrl),
    name: oneLine(o.name, PRODUCT_TEXT.name),
    brand: oneLine(o.brand, PRODUCT_TEXT.brand),
    description: clean(o.description, PRODUCT_TEXT.description),
    features,
    price: normalizePrice(o.price),
    currency: normalizeCurrency(o.currency),
    availability: oneLine(o.availability, 40),
    variants,
    images,
    buy: buy === "link" && !buyUrl ? "contact" : buy,
    buyUrl,
    rightsConfirmed: o.rightsConfirmed === true,
    importedAt: typeof o.importedAt === "string" && !Number.isNaN(Date.parse(o.importedAt)) ? new Date(o.importedAt).toISOString() : prev?.importedAt ?? new Date().toISOString(),
  };
  if (!p.name && !p.description && !p.images.length && !p.features.length) return null;
  if (!p.price) p.currency = "";
  return p;
}

/** The product's text facts as plain lines (used as the "owner-provided content" the lint treats as given). */
export function productFacts(p: ProductInfo): string {
  return [p.name, p.brand, p.description, ...p.features, p.price ? `${p.currency} ${p.price} ${formatPrice(p.price, p.currency)}` : "", ...p.variants.map((v) => `${v.name}: ${v.values.join(", ")}`)].filter(Boolean).join("\n");
}
