/**
 * Deterministic safety net after the model wrote a product site (no model call): the owner's hero photo and the Buy button
 * must be on the page, and no picture may come from anywhere but the owner's stored images. Idempotent.
 */
import { formatPrice, type ProductInfo } from "./types";
import { productImageUrl } from "./prompt";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Removes <img> tags whose source is some other web address (the model sometimes reaches for stock photos). Returns the count removed. */
export function stripForeignImages(html: string, product: ProductInfo): { html: string; removed: number } {
  const own = new Set(product.images.map((i) => productImageUrl(i.id)));
  let removed = 0;
  const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
    if (!/^(https?:)?\/\//i.test(src)) return tag;
    if (own.has(src)) return tag;
    removed++;
    return "";
  });
  return { html: out, removed };
}

function figure(product: ProductInfo, id: string, alt: string, w: number, h: number): string {
  return `<figure class="k-figure"><img src="${productImageUrl(id)}" alt="${esc(alt || product.name)}" width="${w || 1200}" height="${h || 1200}" loading="eager" decoding="async" style="width:100%;height:auto;object-fit:contain"></figure>`;
}

export function productSection(product: ProductInfo, buyHref: string | null): string {
  const hero = product.images.find((i) => i.role === "hero") ?? product.images[0];
  const price = formatPrice(product.price, product.currency);
  const features = product.features.length ? `<ul class="k-stack">${product.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";
  const buy = buyHref ? `<p><a class="k-btn k-btn--accent" href="${esc(buyHref)}" rel="noopener">Buy now</a></p>` : product.buy === "later" ? `<p><a class="k-btn k-btn--accent" href="#contact">Buy now</a> <span class="k-todo">[Add: checkout link]</span></p>` : `<p><a class="k-btn k-btn--accent" href="#contact">Ask about this</a></p>`;
  return `<section class="k-section" id="product" aria-labelledby="product-title"><div class="k-wrap k-split">${hero ? figure(product, hero.id, hero.alt, hero.width, hero.height) : `<div class="k-ph" role="img" aria-label="Product photo placeholder">Product photo</div>`}<div class="k-stack">${product.brand ? `<p class="k-kicker">${esc(product.brand)}</p>` : ""}<h2 class="k-h2" id="product-title">${esc(product.name || "Product")}</h2>${product.description ? `<p class="k-lede">${esc(product.description)}</p>` : ""}${features}${price ? `<p class="k-num">${esc(price)}</p>` : ""}${buy}</div></div></section>`;
}

export function ensureProduct(files: Record<string, string>, product: ProductInfo): { files: Record<string, string>; changes: string[] } {
  const out = { ...files };
  const changes: string[] = [];
  const index = out["index.html"];
  if (index === undefined) return { files: out, changes };
  // Pictures only from the owner's storage.
  for (const [p, html] of Object.entries(out)) {
    if (!p.endsWith(".html")) continue;
    const r = stripForeignImages(html, product);
    if (r.removed) {
      out[p] = r.html;
      changes.push(`removed ${r.removed} picture${r.removed === 1 ? "" : "s"} from other websites in ${p}`);
    }
  }
  const all = () => Object.values(out).filter((_, i) => Object.keys(out)[i].endsWith(".html")).join("\n");
  const hero = product.images.find((i) => i.role === "hero") ?? product.images[0];
  const buyHref = product.buy === "link" && product.buyUrl ? product.buyUrl : product.buy === "contact" ? "#contact" : null;
  const hasSection = /\bid=["']product["']/i.test(out["index.html"]);
  if (!hasSection) {
    const sec = productSection(product, product.buy === "link" ? product.buyUrl : null);
    out["index.html"] = /<\/main>/i.test(out["index.html"]) ? out["index.html"].replace(/<\/main>/i, `${sec}\n</main>`) : out["index.html"].replace(/<\/body>/i, `${sec}\n</body>`);
    changes.push("added the product section");
    return { files: out, changes };
  }
  if (hero && !all().includes(`/i/${hero.id}`)) {
    out["index.html"] = out["index.html"].replace(/(<[a-z]+\b[^>]*\bid=["']product["'][^>]*>)/i, `$1${figure(product, hero.id, hero.alt, hero.width, hero.height)}`);
    changes.push("put the hero photo into the product section");
  }
  if (product.buy === "link" && product.buyUrl && !all().includes(`href="${product.buyUrl.replace(/&/g, "&amp;")}"`) && !all().includes(`href="${product.buyUrl}"`)) {
    const btn = `<p><a class="k-btn k-btn--accent" href="${esc(product.buyUrl)}" rel="noopener">Buy now</a></p>`;
    const m = /<[a-z]+\b[^>]*\bid=["']product["'][^>]*>/i.exec(out["index.html"]);
    if (m) {
      // End of that section: the first closing </section> after it.
      const start = m.index;
      const end = out["index.html"].indexOf("</section>", start);
      if (end > 0) out["index.html"] = out["index.html"].slice(0, end) + btn + out["index.html"].slice(end);
      else out["index.html"] = out["index.html"].replace(/<\/main>/i, `${btn}\n</main>`);
      changes.push("added the Buy button");
    }
  }
  void buyHref;
  return { files: out, changes };
}
