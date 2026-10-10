/**
 * Primary and secondary sources cited on the editorial pages. Every entry was opened on the access date below
 * (or, where noted, its text was checked through a search excerpt). Add a source here before citing it with {{id}}.
 * Competitor and third-party facts must come from the owner's own page where one exists.
 */
export const ACCESSED = "2026-10-03";

export type Source = {
  id: string;
  title: string;
  /** Author or organization. */
  by: string;
  /** Publication date as printed on the source (free text: "22 May 2023"). */
  date: string;
  url: string;
  /** primary = the author's/owner's own text; secondary = reporting, summary or reference work. */
  kind: "primary" | "secondary";
  note?: string;
};

export const sources: Record<string, Source> = {
  bostrom2014: {
    id: "bostrom2014",
    title: "Superintelligence: Paths, Dangers, Strategies",
    by: "Nick Bostrom, Oxford University Press",
    date: "2014",
    url: "https://global.oup.com/academic/product/superintelligence-9780199678112",
    kind: "primary",
    note: "The definition quoted here is from chapter 2, \"Paths to superintelligence\". The publisher page blocks automated readers, so the passage was checked against an online excerpt of the chapter; check it against your own copy before quoting it.",
  },
  bostrom2009: {
    id: "bostrom2009",
    title: "Superintelligence (answer to the 2009 Edge question \"What will change everything?\")",
    by: "Nick Bostrom",
    date: "2009",
    url: "https://nickbostrom.com/views/superintelligence.pdf",
    kind: "primary",
  },
  deepmind2023: {
    id: "deepmind2023",
    title: "Position: Levels of AGI for Operationalizing Progress on the Path to AGI",
    by: "Meredith Ringel Morris and colleagues, Google DeepMind (arXiv:2311.02462)",
    date: "November 2023",
    url: "https://arxiv.org/abs/2311.02462",
    kind: "primary",
  },
  ibmAsi: {
    id: "ibmAsi",
    title: "What is artificial superintelligence?",
    by: "IBM Think (Tim Mucci and Cole Stryker)",
    date: "14 December 2023",
    url: "https://www.ibm.com/think/topics/artificial-superintelligence",
    kind: "secondary",
  },
  openaiGov: {
    id: "openaiGov",
    title: "Governance of superintelligence",
    by: "Sam Altman, Greg Brockman and Ilya Sutskever, OpenAI",
    date: "22 May 2023",
    url: "https://openai.com/index/governance-of-superintelligence/",
    kind: "primary",
    note: "Page text checked through search excerpts; the publication date comes from the same results.",
  },
  ssi: {
    id: "ssi",
    title: "Safe Superintelligence Inc.",
    by: "Safe Superintelligence Inc. (SSI)",
    date: "company home page (undated)",
    url: "https://ssi.inc/",
    kind: "primary",
  },
  meta2025: {
    id: "meta2025",
    title: "Personal Superintelligence",
    by: "Mark Zuckerberg, Meta",
    date: "30 July 2025",
    url: "https://www.meta.com/superintelligence/",
    kind: "primary",
  },
  msft2025: {
    id: "msft2025",
    title: "Towards Humanist Superintelligence",
    by: "Mustafa Suleyman, Microsoft AI",
    date: "6 November 2025",
    url: "https://microsoft.ai/story/towards-humanist-superintelligence/",
    kind: "primary",
  },
  fli2025: {
    id: "fli2025",
    title: "Statement on Superintelligence",
    by: "Future of Life Institute",
    date: "22 October 2025",
    url: "https://superintelligence-statement.org/",
    kind: "primary",
  },
  cnbcFli: {
    id: "cnbcFli",
    title: "Hundreds of public figures including 'AI godfathers' urge 'superintelligence' ban",
    by: "CNBC",
    date: "22 October 2025",
    url: "https://www.cnbc.com/2025/10/22/800-petition-signatures-apple-steve-wozniak-and-virgin-richard-branson-superintelligence-race.html",
    kind: "secondary",
  },
  aiImpacts2023: {
    id: "aiImpacts2023",
    title: "Thousands of AI Authors on the Future of AI",
    by: "Katja Grace and colleagues, AI Impacts (arXiv:2401.02843)",
    date: "January 2024 (survey run in 2023)",
    url: "https://arxiv.org/abs/2401.02843",
    kind: "primary",
  },
  eo14434: {
    id: "eo14434",
    title: "Inaugurating the Era of Super Intelligence (Executive Order 14434, 91 FR 63129)",
    by: "Executive Office of the President, published in the Federal Register",
    date: "signed 29 September 2026; published 2 October 2026",
    url: "https://www.federalregister.gov/documents/2026/10/02/2026-20321/inaugurating-the-era-of-super-intelligence",
    kind: "primary",
  },
  eo14434wh: {
    id: "eo14434wh",
    title: "Inaugurating the Era of Super Intelligence (White House presidential actions page)",
    by: "The White House",
    date: "September 2026",
    url: "https://www.whitehouse.gov/presidential-actions/2026/09/inaugurating-the-era-of-super-intelligence/",
    kind: "primary",
    note: "Opened to confirm the order is published there; the quoted text is from the Federal Register version.",
  },
  moa: {
    id: "moa",
    title: "Mixture-of-Agents Enhances Large Language Model Capabilities",
    by: "Junlin Wang and colleagues, Together AI and collaborators (arXiv:2406.04692)",
    date: "7 June 2024",
    url: "https://arxiv.org/abs/2406.04692",
    kind: "primary",
  },
  bipmSi: {
    id: "bipmSi",
    title: "The International System of Units (SI)",
    by: "Bureau International des Poids et Mesures (BIPM)",
    date: "current edition",
    url: "https://www.bipm.org/en/measurement-units",
    kind: "primary",
  },
  googleFaq: {
    id: "googleFaq",
    title: "FAQ (FAQPage, Question, Answer) structured data",
    by: "Google Search Central",
    date: "documentation change log, September 2023 entry",
    url: "https://developers.google.com/search/docs/appearance/structured-data/faqpage",
    kind: "primary",
  },
};
