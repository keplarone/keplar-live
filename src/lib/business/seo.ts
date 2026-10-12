/**
 * Search and AI-discovery data for business.keplar.one, built from the real plan table (src/lib/business/tiers.ts), so prices
 * and features can never drift from what checkout sells. The storefront is the Business host's one indexable page; the
 * workspace, account setup and sign-in are noindex (src/proxy.ts) and behind authentication.
 */
import { BUSINESS_TIERS, SELF_SERVE_TIERS } from "@/lib/business/tiers";
import { BUSINESS_HOST, PRODUCTION_URL } from "@/lib/site";

export const BUSINESS_ORIGIN = `https://${BUSINESS_HOST}`;
/** When the storefront's content last changed (update with its copy or prices): the sitemap's lastmod. */
export const BUSINESS_LASTMOD = "2026-10-11";
export const BUSINESS_TITLE = "Keplar Business: AI agents, automation and an AI workspace for your business";
export const BUSINESS_DESCRIPTION =
  "One desktop workspace to research, design, build, automate and deploy: scheduled AI agents with approvals, website and app creation, images, video, Deep Research and a business dashboard. Plans from $199.99 a month.";

/** The features every Business plan includes (the first plan's own list, which the others build on). */
export const businessFeatures = (): string[] => BUSINESS_TIERS.starter.includes.filter((x) => !/^\d|seat|support|requests$/i.test(x));

/** JSON-LD for the storefront: the Business website and the Keplar Business application with its public monthly prices. */
export function businessGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${BUSINESS_ORIGIN}/#website`,
        name: "Keplar Business",
        url: `${BUSINESS_ORIGIN}/`,
        publisher: { "@id": `${PRODUCTION_URL}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${BUSINESS_ORIGIN}/#app`,
        name: "Keplar Business",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "AI agents and business automation",
        operatingSystem: "Windows, macOS, Linux",
        url: `${BUSINESS_ORIGIN}/`,
        description: BUSINESS_DESCRIPTION,
        publisher: { "@id": `${PRODUCTION_URL}/#organization` },
        featureList: [...businessFeatures(), ...BUSINESS_TIERS.growth.includes.filter((x) => /workflow|permission|workspace/i.test(x)), ...BUSINESS_TIERS.scale.includes.filter((x) => /audit|approval|routing|API/i.test(x))],
        offers: SELF_SERVE_TIERS.map((id) => {
          const t = BUSINESS_TIERS[id];
          const price = t.monthly!.toFixed(2);
          return {
            "@type": "Offer",
            name: t.name,
            price,
            priceCurrency: "USD",
            url: `${BUSINESS_ORIGIN}/account?tier=${id}`,
            priceSpecification: { "@type": "UnitPriceSpecification", price, priceCurrency: "USD", billingDuration: "P1M", unitCode: "MON" },
          };
        }),
      },
    ],
  };
}

export function businessRobots(): string {
  return [
    "# Keplar Business. The storefront is public; the workspace, account setup and sign-in are private (noindex, behind sign-in).",
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    `Sitemap: ${BUSINESS_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");
}

export function businessSitemap(lastmod: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${BUSINESS_ORIGIN}/</loc><lastmod>${lastmod}</lastmod></url>\n</urlset>\n`;
}

export function businessLlms(): string {
  const plans = Object.values(BUSINESS_TIERS).map((t) => `- ${t.name}: ${t.monthly === null ? "custom pricing" : `$${t.monthly.toFixed(2)} a month`}, for ${t.audience.toLowerCase()}. ${t.includes.filter((x) => !x.startsWith("Everything in")).slice(0, 8).join(", ")}.`);
  return [
    "# Keplar Business",
    "",
    `> ${BUSINESS_DESCRIPTION}`,
    "",
    "Keplar Business is a separate product from Keplar One (keplar.one), on the same Keplar account. It is a desktop app for Windows, macOS and Linux; business.keplar.one shows the plans, takes inquiries and business-account sign-up, and offers the download once a subscription is active.",
    "",
    "## What it does",
    `- ${businessFeatures().join("\n- ")}`,
    "- Scheduled agents (daily briefs, page monitors, lead follow-ups) with run history; anything an agent sends outside Keplar waits in Approvals.",
    "- Operations: orders, CRM, inbox and an audit log. Integrations: connectors and connected apps (MCP).",
    "",
    "## Plans",
    ...plans,
    "",
    "## More",
    `- [Keplar Business](${BUSINESS_ORIGIN}/): plans, inquiries and sign-up`,
    `- [Keplar One](${PRODUCTION_URL}/llms.txt): the consumer AI workspace and the full Keplar product reference`,
    "",
  ].join("\n");
}
