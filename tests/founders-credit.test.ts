import "./setup";
import "./helpers/indexable-env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { aboutGraph, faqPage, siteGraph, softwareApp } from "@/lib/structuredData";
import { CREATOR_CREDIT, CREATOR_LINE, FOUNDERS } from "@/lib/identity";
import { aboutPage } from "@/lib/content/about-page";
import { faq } from "@/lib/faq";
import { footerNav } from "@/lib/site";
import { SIGN_OFF } from "@/lib/growth/lifecycle-emails";
import { creatorAnswers } from "@/lib/orchestration/creator";
import { sitemapPaths } from "../src/app/sitemap";
import { blogPosting } from "@/lib/kb/jsonld";
import { abs } from "@/lib/seo";
import { GET as llms } from "../src/app/llms.txt/route";
import { GET as llmsFull } from "../src/app/llms-full.txt/route";

/**
 * Keplar was created by two co-founders, Hassen and Hussain Keder: two different people. Every public signal must say so, so
 * crawlers and answer engines never merge them into one person ("alternate spellings", "sole owner"). Never an age or birth date.
 */

type Person = { "@type": string; "@id": string; name: string; givenName: string; familyName: string; jobTitle: string };
const org = (g: { "@graph": unknown[] }) => g["@graph"].find((n) => (n as { "@type": string })["@type"] === "Organization") as { founder: Person[] };

function assertTwoFounders(founder: Person[], where: string) {
  assert.ok(Array.isArray(founder), `${where}: founder is an array`);
  assert.equal(founder.length, 2, `${where}: two founders`);
  assert.deepEqual(founder.map((p) => p["@type"]), ["Person", "Person"], where);
  assert.deepEqual(founder.map((p) => p.name), ["Hassen Keder", "Hussain Keder"], where);
  assert.deepEqual(founder.map((p) => p.givenName), ["Hassen", "Hussain"], where);
  assert.deepEqual(founder.map((p) => p.familyName), ["Keder", "Keder"], where);
  assert.deepEqual(founder.map((p) => p.jobTitle), ["Co-founder", "Co-founder"], where);
  assert.ok(founder[0]["@id"] && founder[1]["@id"] && founder[0]["@id"] !== founder[1]["@id"], `${where}: each Person has its own @id`);
}

test("JSON-LD: the Organization founder array is two separate Person entries, Hassen Keder and Hussain Keder", () => {
  assertTwoFounders(org(siteGraph()).founder, "siteGraph (every page, incl. home and pricing)");
  assertTwoFounders(org(aboutGraph()).founder, "aboutGraph (/about)");
  assertTwoFounders((softwareApp() as unknown as { creator: Person[] }).creator, "softwareApp.creator (home, pricing)");
  assert.equal((aboutGraph()["@graph"][0] as { "@type": string })["@type"], "AboutPage");
  assert.equal(FOUNDERS.length, 2);
});

const NO_AGE = /birth|\bborn\b|\bage\b|"age"|\baged\b|years old|\bteen|\bminor\b|2011/i;

test("no birthDate, age or birth year anywhere in the public output or copy", async () => {
  for (const [name, data] of [["siteGraph", siteGraph()], ["aboutGraph", aboutGraph()], ["softwareApp", softwareApp()], ["faqPage", faqPage()]] as const) {
    const json = JSON.stringify(data);
    assert.doesNotMatch(json, /birthDate|birthPlace|"age"|deathDate|gender|nationality|sameAs":\["https:\/\/(?!github\.com\/keplarone)/i, name);
    assert.doesNotMatch(json, NO_AGE, name);
  }
  const llmsTxt = await (await llms()).text();
  const full = await (await llmsFull()).text();
  const creditBits = full.split("\n").filter((l) => /Hassen|Hussain|Keder/.test(l)).join("\n");
  for (const [name, text] of [
    ["llms.txt", llmsTxt],
    ["llms-full.txt credit lines", creditBits],
    ["about page", JSON.stringify(aboutPage)],
    ["faq", JSON.stringify(faq.filter((f) => /Hassen|Hussain|creat/i.test(f.q + f.a)))],
    ["creator answers", creatorAnswers().join("\n")],
    ["footer", readFileSync("src/components/chrome/Footer.tsx", "utf8")],
  ] as const) assert.doesNotMatch(text, NO_AGE, name);
  for (const f of readdirSync("src/lib/i18n/messages/common")) {
    const credit = /"?credit"?: "([^"]*)"/.exec(readFileSync(`src/lib/i18n/messages/common/${f}`, "utf8"))?.[1] ?? "";
    assert.doesNotMatch(credit, /\d/, f);
  }
});

/** Singular or merging phrasings that let a reader collapse the two co-founders into one person. */
const SINGULAR = /\bthe founder\b|\bour founder\b|\bfounder is\b|\bsole (?:owner|founder|developer|creator)\b|(?<!\bby )\bone (?:founder|owner|person)\b(?! name)|\bHassen\s*\/\s*Hussain\b|\bHussain\s*\/\s*Hassen\b|\b(?:he|she|his|her|him)\b|\bHassen, Hussain\b|Keplar Team/;

test("credit copy is always the two co-founders, plural, one spelling, never a singular founder", async () => {
  assert.equal(CREATOR_CREDIT, "Hassen and Hussain Keder");
  assert.equal(CREATOR_LINE, "Keplar was created by two co-founders, Hassen and Hussain Keder.");
  const llmsTxt = await (await llms()).text();
  assert.ok(llmsTxt.includes("Keplar was created by two co-founders, Hassen and Hussain Keder (two different people)."), "plain llms.txt line");
  assert.ok((await (await llmsFull()).text()).includes("Keplar was created by two co-founders, Hassen and Hussain Keder (two different people)."));
  const who = aboutPage.sections.find((s) => s.id === "who")!;
  assert.equal(who.h2, "Who made Keplar");
  assert.ok(who.p?.includes(CREATOR_LINE), "About states the plain line");
  assert.match(who.p!.join(" "), /two different people/);

  const copy: [string, string][] = [
    ["llms.txt credit", llmsTxt.split("\n").filter((l) => /Hassen|Hussain/.test(l)).join("\n")],
    ["about", [aboutPage.metaDescription, aboutPage.answer, ...(who.p ?? []), ...aboutPage.faq.map((f) => f.a)].join("\n")],
    ["faq", faq.filter((f) => /Hassen|Hussain/.test(f.a)).map((f) => f.a).join("\n")],
    ["footer", readFileSync("src/components/chrome/Footer.tsx", "utf8").split("\n").filter((l) => /CREATOR_LINE|Hassen/.test(l)).join("\n")],
    ["developers", readFileSync("src/app/(marketing)/developers/page.tsx", "utf8").split("\n").filter((l) => /Hassen/.test(l)).join("\n")],
    ["feedback", readFileSync("src/app/(marketing)/feedback/page.tsx", "utf8").split("\n").filter((l) => /Hassen/.test(l)).join("\n")],
    ["en catalogs", ["common", "client", "marketing"].map((n) => readFileSync(`src/lib/i18n/messages/${n}/en.ts`, "utf8")).join("\n").split("\n").filter((l) => /credit/i.test(l) && !/^\s*(\/\*|\*)/.test(l)).join("\n")],
    ["sign-off", SIGN_OFF],
    ["assistant", creatorAnswers().join("\n")],
  ];
  for (const [name, text] of copy) {
    assert.ok(text.trim(), `${name}: has credit copy`);
    assert.doesNotMatch(text, SINGULAR, name);
    for (const m of text.match(/Hass[a-z]+|Huss[a-z]+/g) ?? []) assert.ok(m === "Hassen" || m === "Hussain", `${name}: one spelling (${m})`);
  }
  // every locale credit names both co-founders with the shared family name, untranslated, and no team
  for (const f of readdirSync("src/lib/i18n/messages/common")) {
    const credit = /"?credit"?: "([^"]*)"/.exec(readFileSync(`src/lib/i18n/messages/common/${f}`, "utf8"))?.[1] ?? "";
    assert.match(credit, /^Hassen\b.*\bHussain Keder\b/, f);
    assert.doesNotMatch(credit, /Keplar|\//, f);
  }
});

test("/about is in the sitemap and linked from the footer", () => {
  assert.ok(sitemapPaths.includes("/about"));
  assert.ok(footerNav.some((c) => c.links.some((l) => l.href === "/about")));
});

test("blog bylines and article JSON-LD credit the two co-founders; topics say 'Published by' with the Organization as author; publisher stays the Organization", () => {
  const blog = readFileSync("src/app/(marketing)/blogs/[slug]/page.tsx", "utf8");
  assert.match(blog, /<span>\{`By \$\{CREATOR_CREDIT\}`\}<\/span>/);
  assert.match(blog, /authors: FOUNDERS\.map\(\(f\) => f\.name\)/); // og article:author = Hassen Keder, Hussain Keder
  assert.doesNotMatch(blog, /Keplar Team/);
  // topic pages are assembled ("Not written by a person"), so no personal authorship: "Published by", Organization as author
  const topic = readFileSync("src/app/(marketing)/topics/[slug]/page.tsx", "utf8");
  assert.match(topic, /<span>\{`Published by \$\{CREATOR_CREDIT\}`\}<\/span>/);
  assert.doesNotMatch(topic, /`By \$\{CREATOR_CREDIT\}`|founderPersons|FOUNDERS|Keplar Team/);
  assert.match(topic, /author: orgNode, publisher: orgNode/);
  assert.match(topic, /const orgNode = \{ "@type": "Organization", \.\.\.org, name: brand\.companyName, url: PRODUCTION_URL \}/);
  assert.match(topic, /authors: \[brand\.companyName\]/);
  assert.match(topic, /Not written by a person on this topic/);
  // guides are hand-written evergreen content (src/lib/content/guides.ts), so their share image carries the byline too
  assert.match(readFileSync("src/app/og/guides/[slug]/route.tsx", "utf8"), /subtitle: "By Hassen and Hussain Keder"/);
  const post = blogPosting({ path: "/blogs/x", title: "T", description: "D", published: "2026-10-01", updated: "2026-10-01" }) as unknown as { author: Person[]; publisher: { "@id": string } };
  assertTwoFounders(post.author, "BlogPosting.author");
  assert.deepEqual(post.author.map((p) => p["@id"]), [abs("/about#hassen-keder"), abs("/about#hussain-keder")]);
  assert.equal(post.publisher["@id"], abs("/#organization"));
  assert.doesNotMatch(JSON.stringify(post), NO_AGE);
  assert.doesNotMatch(JSON.stringify(post), /Keplar Team/);
});
