/**
 * English chrome strings (nav, footer, language picker, language banner). The source every other locale translates.
 * Nav and footer labels come straight from src/lib/site.ts so English has one source; other locales map them by href.
 */
import { footerNav, primaryNav } from "@/lib/site";

const navItems: Record<string, string> = {};
const navHints: Record<string, string> = {};
for (const l of primaryNav) for (const c of l.children ?? [l]) {
  navItems[c.href] = c.label;
  if (c.hint) navHints[c.href] = c.hint;
}
const footerLinks: Record<string, string> = {};
for (const col of footerNav) for (const l of col.links) footerLinks[l.href] = l.label;

const en = {
  /** The credit: Keplar's two co-founders, Hassen and Hussain Keder (two different people). Names are never translated; never add ages or birthdates. */
  credit: "Hassen and Hussain Keder",
  nav: {
    product: "Product",
    resources: "Resources",
    items: navItems,
    hints: navHints,
    signIn: "Sign in",
    account: "Account",
    try: "Try Keplar",
    open: "Open Keplar",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    siteMenu: "Site menu",
    search: "Search pages, features and docs",
    home: "Keplar, home",
    primary: "Primary",
  },
  footer: {
    label: "Footer",
    theme: "Theme",
    headings: { Product: "Product", "Use Keplar": "Use Keplar", Learn: "Learn", Company: "Company", Legal: "Legal" } as Record<string, string>,
    links: footerLinks,
  },
  picker: {
    label: "Language",
    choose: "Choose a language",
    search: "Search languages",
    none: "No language matches that search.",
    beta: "Beta",
    betaNote: "Beta languages are partly translated; the rest of the page stays in English.",
    close: "Close",
    regions: {
      europe: "Europe",
      middleEast: "Middle East",
      africa: "Africa",
      southAsia: "South Asia",
      eastAsia: "East Asia",
      southeastAsia: "Southeast Asia",
      centralAsia: "Central Asia and the Caucasus",
      americas: "Americas",
    },
  },
  banner: {
    text: "Keplar is available in English.",
    switch: "Switch to English",
    dismiss: "No thanks",
  },
};

export default en;
