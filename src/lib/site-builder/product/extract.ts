/**
 * Reads a product page's HTML into structured fields. Pure and defensive: the HTML is untrusted, nothing is executed,
 * every string is bounded, every URL is resolved against the page and must be http(s). Sources, best first:
 * JSON-LD (schema.org Product / ProductGroup / Book / offers), then Open Graph + product:* tags, then microdata
 * (itemprop), then plain markup (<h1>, <select> options, feature lists, <img>).
 * Page text is returned only as an excerpt for the owner to read; it is never sent to a model as instructions.
 */
import { decodeEntities as baseDecode } from "../sanitize";
import { cleanHttpUrl, normalizeCurrency, normalizePrice, type ProductVariant } from "./types";

export type ExtractedImage = { url: string; alt: string; source: "jsonld" | "og" | "twitter" | "microdata" | "img" };
export type Extracted = {
  isProduct: boolean;
  title: string;
  brand: string;
  description: string;
  price: string;
  currency: string;
  availability: string;
  sku: string;
  images: ExtractedImage[];
  variants: ProductVariant[];
  features: string[];
  text: string;
  canonical: string;
  siteName: string;
  /** The page asks not to be used for AI, or not for images. */
  noai: boolean;
  noimageai: boolean;
};

const attrRe = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const inner = tag.replace(/^<\s*[a-zA-Z0-9:-]+/, "").replace(/\/?>$/, "");
  for (const m of inner.matchAll(attrRe)) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

const NAMED: Record<string, string> = { pound: "£", euro: "€", yen: "¥", cent: "¢", copy: "©", reg: "®", trade: "™", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", times: "×", deg: "°", middot: "·", bull: "•", laquo: "«", raquo: "»" };
const decodeEntities = (s: string) => baseDecode(s).replace(/&([a-z]{2,8});/gi, (m, n: string) => NAMED[n.toLowerCase()] ?? m);

const T = (s: string, max: number) => decodeEntities(s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const stripTags = (s: string) => decodeEntities(s.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "));

function abs(u: string | undefined, base: string): string {
  if (!u) return "";
  const v = u.trim();
  if (!v || /^(data|javascript|blob|about|mailto|tel):/i.test(v)) return "";
  try {
    const u = new URL(v.startsWith("//") ? `https:${v}` : v, base);
    // Pages still write http:// image addresses; every real CDN answers on https, and published sites need https.
    if (u.protocol === "http:" && !u.port) u.protocol = "https:";
    return cleanHttpUrl(u.toString());
  } catch {
    return "";
  }
}

/* ───────── JSON-LD ───────── */

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const arr = <X,>(v: X | X[] | undefined | null): X[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const typesOf = (n: J) => arr(n["@type"] as string | string[]).map((t) => String(t).replace(/^.*[/#]/, "").toLowerCase());
const str = (v: unknown, max = 600): string => {
  if (typeof v === "string") return T(v, max);
  if (typeof v === "number") return String(v);
  if (isObj(v)) return str(v.name ?? v["@value"] ?? v.value ?? "", max);
  if (Array.isArray(v)) return str(v[0], max);
  return "";
};

function jsonLdNodes(html: string): J[] {
  const nodes: J[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/ld\+json/i.test(m[1])) continue;
    const body = m[2].replace(/^\s*<!--/, "").replace(/-->\s*$/, "").replace(/^\s*\/\/<!\[CDATA\[|\/\/\]\]>\s*$/g, "").trim();
    if (!body || body.length > 800_000) continue;
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      try {
        data = JSON.parse(body.replace(/[\u0000-\u001f]+/g, " "));
      } catch {
        continue;
      }
    }
    const walk = (v: unknown, depth: number) => {
      if (depth > 6) return;
      if (Array.isArray(v)) return v.slice(0, 200).forEach((x) => walk(x, depth + 1));
      if (!isObj(v)) return;
      nodes.push(v);
      if (v["@graph"]) walk(v["@graph"], depth + 1);
      if (v.mainEntity) walk(v.mainEntity, depth + 1);
    };
    walk(data, 0);
  }
  return nodes;
}

const PRODUCT_TYPES = new Set(["product", "productgroup", "individualproduct", "book", "softwareapplication", "mobileapplication", "webapplication", "vehicle", "car", "course", "event", "productmodel", "someproducts"]);

function offersOf(n: J): J[] {
  const out: J[] = [];
  for (const o of arr(n.offers as J | J[])) {
    if (!isObj(o)) continue;
    out.push(o);
    for (const s of arr(o.offers as J | J[])) if (isObj(s)) out.push(s);
  }
  return out;
}

function imagesOf(v: unknown, base: string, alt: string): ExtractedImage[] {
  const out: ExtractedImage[] = [];
  for (const x of arr(v as unknown)) {
    const url = abs(typeof x === "string" ? x : isObj(x) ? str(x.url ?? x.contentUrl ?? x["@id"], 1000) : "", base);
    if (url) out.push({ url, alt: isObj(x) ? str(x.caption ?? x.name ?? x.description, 160) || alt : alt, source: "jsonld" });
  }
  return out;
}

/* ───────── main ───────── */

export function extractProduct(rawHtml: string, pageUrl: string): Extracted {
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, "").slice(0, 3_000_000);
  const metas = new Map<string, string[]>();
  const addMeta = (k: string, v: string) => {
    if (!v) return;
    const key = k.toLowerCase();
    metas.set(key, [...(metas.get(key) ?? []), v]);
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    const key = a.property ?? a.name ?? a.itemprop;
    if (key && a.content !== undefined) addMeta(key, a.content);
  }
  const meta = (...keys: string[]) => {
    for (const k of keys) {
      const v = metas.get(k.toLowerCase())?.find((x) => x.trim());
      if (v) return v;
    }
    return "";
  };
  const robots = [...(metas.get("robots") ?? []), ...(metas.get("googlebot") ?? []), ...(metas.get("keplarbot") ?? [])].join(",").toLowerCase();
  const noai = /\bnoai\b/.test(robots);
  const noimageai = noai || /\bnoimageai\b/.test(robots);

  const titleTag = T(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "", 300);
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrsOf(m[0])).find((a) => /\bcanonical\b/i.test(a.rel ?? ""));
  const canonical = abs(canonicalTag?.href, pageUrl);
  const siteName = T(meta("og:site_name", "application-name"), 80);

  /* JSON-LD product */
  const nodes = jsonLdNodes(html);
  const prods = nodes.filter((n) => typesOf(n).some((t) => PRODUCT_TYPES.has(t)));
  // Prefer a node that has offers and a name; a ProductGroup comes with variants.
  const main = [...prods].sort((a, b) => Number(offersOf(b).length > 0) - Number(offersOf(a).length > 0) || Number(Boolean(str(b.name))) - Number(Boolean(str(a.name))))[0];
  let title = "", brand = "", description = "", price = "", currency = "", availability = "", sku = "";
  const images: ExtractedImage[] = [];
  const variants: ProductVariant[] = [];
  let isProduct = false;

  if (main) {
    isProduct = true;
    title = str(main.name, 200);
    brand = str(main.brand, 60) || str((main as J).manufacturer, 60) || str(main.author, 60);
    description = T(str(main.description, 1500), 1200);
    sku = str(main.sku ?? main.mpn ?? main.gtin13 ?? main.isbn, 40);
    images.push(...imagesOf(main.image, pageUrl, title));
    const offers = offersOf(main);
    const variantOffers = nodes.filter((n) => typesOf(n).includes("product") && n !== main && (n.isVariantOf || n.inProductGroupWithID)).flatMap(offersOf);
    for (const o of [...offers, ...variantOffers]) {
      const p = normalizePrice(o.price ?? (isObj(o.priceSpecification) ? o.priceSpecification.price : undefined) ?? o.lowPrice);
      if (p && !price) {
        price = p;
        currency = normalizeCurrency(o.priceCurrency ?? (isObj(o.priceSpecification) ? o.priceSpecification.priceCurrency : undefined));
      }
      if (!availability) availability = str(o.availability, 80).replace(/^.*[/#]/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
    }
    // Variants from a ProductGroup (colour / size values) or sibling variant products.
    const members = [...arr(main.hasVariant as J | J[]), ...nodes.filter((n) => n !== main && (n.isVariantOf || n.inProductGroupWithID))].filter(isObj);
    const attr = (name: string) => [...new Set(members.map((v) => str(v[name], 40)).filter((x) => x && !/^(n\/a|none|null|undefined)$/i.test(x)))].slice(0, 12);
    for (const name of ["color", "size", "material", "pattern"]) {
      const vals = attr(name);
      if (vals.length > 1 || (vals.length === 1 && members.length > 1)) variants.push({ name: name[0].toUpperCase() + name.slice(1), values: vals });
    }
    if (!variants.length && isObj(main) && (main.color || main.size)) {
      for (const name of ["color", "size"]) {
        const vals = arr(main[name] as string | string[]).map((x) => str(x, 40)).filter((x) => x && !/^(n\/a|none|null|undefined)$/i.test(x)).slice(0, 12);
        if (vals.length) variants.push({ name: name[0].toUpperCase() + name.slice(1), values: vals });
      }
    }
    for (const v of members) images.push(...imagesOf(v.image, pageUrl, title).slice(0, 1));
  }

  /* Open Graph / product tags */
  const ogType = meta("og:type").toLowerCase();
  if (/\/(?:products?|p|dp|item|items|listing|shop\/[^/]+)\/[^/?#]+/i.test(new URL(pageUrl).pathname) && !/\/(?:category|collections?|archive|search)\//i.test(pageUrl)) isProduct = true;
  if (/product|book/.test(ogType) || metas.has("product:price:amount") || metas.has("og:price:amount")) isProduct = true;
  title = title || T(meta("og:title", "twitter:title", "title"), 200);
  description = description || T(meta("og:description", "twitter:description", "description"), 1200);
  if (!price) {
    price = normalizePrice(meta("product:price:amount", "og:price:amount", "product:sale_price:amount", "price"));
    currency = currency || normalizeCurrency(meta("product:price:currency", "og:price:currency", "priceCurrency"));
  }
  brand = brand || T(meta("product:brand", "og:brand"), 60);
  availability = availability || T(meta("product:availability", "og:availability"), 40);
  for (const k of ["og:image", "og:image:url", "og:image:secure_url"]) {
    for (const v of metas.get(k) ?? []) {
      const url = abs(v, pageUrl);
      if (url) images.push({ url, alt: T(meta("og:image:alt"), 160) || title, source: "og" });
    }
  }
  for (const v of metas.get("twitter:image") ?? []) {
    const url = abs(v, pageUrl);
    if (url) images.push({ url, alt: T(meta("twitter:image:alt"), 160) || title, source: "twitter" });
  }

  /* Microdata */
  const itemprops = (name: string) => {
    const out: string[] = [];
    for (const m of html.matchAll(new RegExp(`<(meta|link|img|span|div|p|h1|h2|h3|a|data|time)\\b[^>]*\\bitemprop\\s*=\\s*["']${name}["'][^>]*>(?:([\\s\\S]{0,400}?)</\\1>)?`, "gi"))) {
      const a = attrsOf(m[0]);
      const v = a.content ?? a.src ?? a.href ?? a.value ?? (m[2] ? T(stripTags(m[2]), 400) : "");
      if (v) out.push(v);
    }
    return out;
  };
  if (/itemtype\s*=\s*["'][^"']*schema\.org\/(?:Product|Book)/i.test(html)) isProduct = true;
  if (isProduct || /itemtype\s*=/.test(html)) {
    title = title || T(itemprops("name")[0] ?? "", 200);
    description = description || T(itemprops("description")[0] ?? "", 1200);
    if (!price) {
      price = normalizePrice(itemprops("price")[0]);
      currency = currency || normalizeCurrency(itemprops("priceCurrency")[0]);
    }
    brand = brand || T(itemprops("brand")[0] ?? "", 60);
    for (const v of itemprops("image")) {
      const url = abs(v, pageUrl);
      if (url) images.push({ url, alt: title, source: "microdata" });
    }
  }

  /* Plain markup fallbacks */
  if (!title) title = T(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ? stripTags(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)![1]) : "", 200) || titleTag.split(/\s[|\u2013\u2014-]\s/)[0].slice(0, 200);
  if (!currency && price) {
    const sym = /(?:^|[^\w])(US\$|\$|€|£|¥|CA\$|A\$)\s?\d/.exec(stripTags(html.slice(0, 400_000)))?.[1];
    if (sym && !currency) currency = ({ "US$": "USD", $: "", "€": "EUR", "£": "GBP", "¥": "JPY" } as Record<string, string>)[sym] ?? "";
  }
  const body = /<body\b[\s\S]*$/i.exec(html)?.[0] ?? html;
  // <select> menus named like options (size, colour...).
  if (variants.length < 3) {
    for (const m of body.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
      const a = attrsOf(`<select ${m[1]}>`);
      const label = T(a["aria-label"] ?? a.name ?? a.id ?? "", 40).replace(/^(product|options?|attributes?)[\s_\[\]-]*/i, "").replace(/[\[\]_-]+/g, " ").trim();
      if (!/size|colou?r|style|variant|flavou?r|scent|material|model|capacity|storage|length|width/i.test(label)) continue;
      const values = [...m[2].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => T(stripTags(o[1]), 40)).filter((v) => v && !/^(choose|select|pick|please|n\/a)/i.test(v) && !/^-+$/.test(v)).slice(0, 12);
      if (values.length > 1 && !variants.some((v) => v.name.toLowerCase() === label.toLowerCase())) variants.push({ name: label[0].toUpperCase() + label.slice(1), values });
      if (variants.length >= 4) break;
    }
  }

  // Feature bullets: lists inside blocks that look like highlights / details / description, never navigation or FAQs.
  const features: string[] = [];
  const main2 = body.replace(/<(nav|header|footer|aside|form|script|style|noscript|svg|template|iframe|select|button)\b[\s\S]*?<\/\1>/gi, " ");
  const pushFeature = (s: string) => {
    const f = T(stripTags(s), 140);
    if (f.length >= 8 && f.length <= 110 && !/[?]/.test(f) && !/^(home|shop|cart|sign in|log in|menu|search|contact|about|help|returns?|shipping|privacy|terms|new arrivals|best ?sellers|view all|see all)\b/i.test(f) && !features.includes(f)) features.push(f);
  };
  const okList = (inner: string) => {
    const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    const anchors = (inner.match(/<a\b/gi) ?? []).length;
    return items.length >= 2 && items.length <= 14 && anchors <= Math.max(1, items.length / 4) ? items : [];
  };
  for (const m of main2.matchAll(/<(?:div|section|ul|article|details)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:feature|highlight|benefit|spec|bullet|key-?points|product[-_]?(?:details|description|info))[^"']*["'][^>]*>([\s\S]{0,6000}?)(?=<\/(?:div|section|article|details)>)/gi)) {
    for (const li of okList(m[1])) pushFeature(li[1]);
    if (features.length >= 8) break;
  }
  if (features.length < 3 && isProduct) {
    for (const l of [...main2.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi)].slice(0, 8)) {
      for (const li of okList(l[1])) pushFeature(li[1]);
      if (features.length >= 3) break;
    }
  }

  // Plain <img> candidates: product-looking, big enough hints, not tracking pixels or logos.
  if (images.length < 6) {
    for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
      const a = attrsOf(m[0]);
      const srcset = a.srcset ?? a["data-srcset"] ?? "";
      let best = "";
      if (srcset) {
        const cands = srcset.split(",").map((c) => c.trim().split(/\s+/)).filter((c) => c[0]);
        cands.sort((x, y) => (parseFloat(y[1] ?? "0") || 0) - (parseFloat(x[1] ?? "0") || 0));
        best = cands[0]?.[0] ?? "";
      }
      const url = abs(best || a["data-zoom-image"] || a["data-large-image"] || a["data-src"] || a.src, pageUrl);
      if (!url || /\.(svg|gif)(\?|$)/i.test(url) || /(logo|sprite|icon|pixel|tracking|avatar|badge|flag|placeholder|spinner|loading|payment|star)/i.test(url + " " + (a.class ?? "") + " " + (a.alt ?? ""))) continue;
      const w = Number(a.width), h = Number(a.height);
      if ((w && w < 200) || (h && h < 200)) continue;
      const hint = `${a.class ?? ""} ${a.id ?? ""} ${a.alt ?? ""} ${a.itemprop ?? ""}`.toLowerCase();
      const titleWords = title.toLowerCase().split(/\W+/).filter((x) => x.length > 3);
      if (!(/product|gallery|zoom|main|primary|hero|featured/.test(hint) || titleWords.some((x) => hint.includes(x)))) continue;
      images.push({ url, alt: T(a.alt ?? "", 160) || title, source: "img" });
      if (images.length >= 14) break;
    }
  }

  // De-duplicate images by URL ignoring size-only query noise, keep best-source order, cap.
  const seen = new Set<string>();
  const uniq: ExtractedImage[] = [];
  const rank = { jsonld: 0, og: 1, microdata: 2, twitter: 3, img: 4 } as const;
  for (const im of [...images].sort((a, b) => rank[a.source] - rank[b.source])) {
    const key = im.url.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/[_-](?:\d{2,4}x\d{0,4}|small|medium|thumb|thumbnail|large|grande|pico|icon)(?=\.\w+$)/i, "");
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(im);
    if (uniq.length >= 10) break;
  }

  const textSource = body.replace(/<(nav|header|footer|aside|form|script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  const text = T(stripTags(textSource), 3000);

  let cleanTitle = title.replace(/\s*[|\u2013\u2014-]\s*(?:Buy|Shop)\b.*$/i, "").trim() || title;
  if (siteName) {
    const esc = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleanTitle = cleanTitle.replace(new RegExp(`\\s*[|\\u2013\\u2014:-]\\s*${esc}\\s*$`, "i"), "").trim() || cleanTitle;
  }
  return {
    isProduct: isProduct || Boolean(price),
    title: cleanTitle.slice(0, 200),
    brand: brand.slice(0, 60),
    description: description.slice(0, 1200),
    price,
    currency: price ? currency : "",
    availability: availability.slice(0, 40),
    sku: sku.slice(0, 40),
    images: uniq,
    variants: variants.slice(0, 4),
    features: features.slice(0, 8),
    text,
    canonical,
    siteName,
    noai,
    noimageai,
  };
}

/**
 * Many shops list a thumbnail address (…?width=100, …_100x100.jpg) in their markup while serving the full image from the same
 * path. Returns the address to try first (a larger size) followed by the original. Never changes host or path structure.
 */
export function imageCandidates(url: string): string[] {
  try {
    const u = new URL(url);
    let changed = false;
    for (const k of ["width", "w", "maxwidth", "max_width"]) {
      const v = u.searchParams.get(k);
      if (v && /^\d{2,4}$/.test(v) && Number(v) < 1000) {
        u.searchParams.set(k, "1600");
        changed = true;
      }
    }
    for (const k of ["height", "h"]) {
      const v = u.searchParams.get(k);
      if (changed && v && /^\d{2,4}$/.test(v)) u.searchParams.delete(k);
    }
    const stripped = u.pathname.replace(/_(?:\d{2,4}x\d{0,4}|\d{0,4}x\d{2,4}|small|medium|thumb|thumbnail|compact|pico|icon)(?=\.\w{3,4}$)/i, "");
    if (stripped !== u.pathname) {
      u.pathname = stripped;
      changed = true;
    }
    return changed ? [u.toString(), url] : [url];
  } catch {
    return [url];
  }
}
