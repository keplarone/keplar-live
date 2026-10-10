import { faq } from "./faq";
import { abs } from "./seo";
import { brand, PRODUCTION_URL, site } from "./site";
import { tiers } from "./tiers";
import { CREATOR_LINE, FOUNDERS } from "./identity";

/**
 * The two co-founders as two separate schema.org Person nodes, each with its own @id, so crawlers and answer engines never
 * merge them into one person. Names, given/family names and the Co-founder title only: never birthDate, age or other
 * personal details, and no sameAs until real, owned profiles exist.
 */
export function founderPersons() {
  return FOUNDERS.map((f) => ({
    "@type": "Person",
    "@id": abs(`/about#${f.id}`),
    name: f.name,
    givenName: f.givenName,
    familyName: f.familyName,
    jobTitle: f.jobTitle,
    worksFor: { "@id": abs("/#organization") },
  }));
}

/** The Organization node (rendered site-wide in the root layout and again inside the About page graph). */
export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": abs("/#organization"),
    name: brand.companyName,
    alternateName: brand.name,
    url: PRODUCTION_URL,
    logo: { "@type": "ImageObject", url: abs("/icons/icon-512.png"), width: 512, height: 512 },
    slogan: site.tagline,
    foundingDate: "2026",
    founder: founderPersons(),
    description:
      `${brand.name} is the intelligence layer above AI models. ${brand.engineName} asks the models a question needs, investigates where they disagree, weighs the evidence and reasoning behind each response, and synthesizes one answer. ${CREATOR_LINE}`,
    email: brand.contactEmail,
    // Real, verified profiles only (checked 4 Oct 2026). Add others here only once they exist and are owned by the co-founders.
    sameAs: ["https://github.com/keplarone"],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: brand.contactEmail,
      url: abs(brand.contactPath),
    },
  };
}

/** /about: AboutPage + Organization (with both co-founders). */
export function aboutGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": abs("/about#page"),
        url: abs("/about"),
        name: "About Keplar One",
        description: CREATOR_LINE,
        isPartOf: { "@id": abs("/#website") },
        about: { "@id": abs("/#organization") },
        mainEntity: { "@id": abs("/#organization") },
        inLanguage: "en",
      },
      organizationNode(),
    ],
  };
}

/** Organization + WebSite graph, rendered once in the root layout. */
export function siteGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(),
      {
        "@type": "WebSite",
        "@id": abs("/#website"),
        name: site.name,
        url: abs("/"),
        publisher: { "@id": abs("/#organization") },
        inLanguage: "en",
      },
    ],
  };
}

/** SoftwareApplication with public offers (Business has no public price, so it is omitted). */
export function softwareApp() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": abs("/#app"),
    name: site.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Multi-model AI assistant",
    operatingSystem: "Web",
    url: abs("/"),
    description:
      `${brand.name} routes one question to multiple AI models, detects where they agree and disagree, weighs the evidence and reasoning behind each response, and synthesizes one answer with the agreement and disagreements shown.`,
    publisher: { "@id": abs("/#organization") },
    // Made by the two co-founders: two separate Person nodes (same @ids as the Organization's founder array).
    creator: founderPersons(),
    author: founderPersons().map((p) => ({ "@id": p["@id"] })),
    featureList: [
      `${brand.engineName} selects only the AI models each question needs (quality, reliability, latency, cost)`,
      "Disagreement detection across models",
      "Weighs the evidence and reasoning behind each response: evaluation, not voting",
      "One synthesized answer with consensus shown",
      "Everyday use: studying, health questions (not medical advice), money decisions, travel, writing, personal projects",
      "Create personal sites, apps, images, and video",
      "Autonomous agents with spend caps, approval gates, and audit logs (Business)",
    ],
    offers: tiers
      .filter((t) => t.price !== null)
      .map((t) => ({
        "@type": "Offer",
        name: t.name,
        price: String(t.price),
        priceCurrency: "USD",
        url: abs("/pricing"),
        ...(t.price && t.price > 0
          ? {
              priceSpecification: {
                "@type": "UnitPriceSpecification",
                price: String(t.price),
                priceCurrency: "USD",
                billingDuration: "P1M",
                unitCode: "MON",
              },
            }
          : {}),
      })),
  };
}

/** FAQPage generated from the same array the visible FAQ renders. */
export function faqPage(items: { q: string; a: string }[] = faq) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** /download: a WebPage plus the desktop SoftwareApplication. Version, date and file URLs appear only when a real release exists. */
export function downloadPageGraph(state: import("./desktop/releases").ReleaseState) {
  const release = state.status === "ok" ? state.release : null;
  const urls = release?.files.map((f) => f.url) ?? [];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": abs("/download#page"),
        url: abs("/download"),
        name: `Download the ${brand.name} desktop app`,
        isPartOf: { "@id": abs("/#website") },
        about: { "@id": abs("/download#desktop") },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": abs("/download#desktop"),
        name: `${brand.name} desktop`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Windows, macOS, Linux",
        url: abs("/download"),
        publisher: { "@id": abs("/#organization") },
        description: `Desktop client for the ${brand.name} cloud service. Your account and data stay in the cloud.`,
        ...(release
          ? {
              softwareVersion: release.version,
              ...(release.publishedAt ? { datePublished: release.publishedAt } : {}),
              ...(urls.length ? { downloadUrl: urls.length === 1 ? urls[0] : urls } : {}),
              releaseNotes: release.notesUrl,
            }
          : {}),
      },
    ],
  };
}
