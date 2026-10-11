/**
 * Command palette catalogue: every major destination in one flat, searchable list.
 * Paths are real routes in the tree; anything without its own page links to a section anchor on a page that exists.
 */
import { footerNav, paletteOnlyPages, primaryNav, brand, BUSINESS_HOST } from "@/lib/site";

export type Command = { id: string; label: string; href: string; group: "Go to" | "Features" | "Learn" | "Account" | "Docs" | "On this page"; hint?: string; keywords?: string };

export const FEATURE_COMMANDS: Command[] = [
  { id: "ask", label: "Ask Keplar", href: "/app/ask", group: "Features", hint: "Live demo — no sign-up needed", keywords: "demo try chat question answer" },
  { id: "create", label: "Create", href: "/app/create", group: "Features", hint: "Build sites and apps", keywords: "builder site app studio make" },
  { id: "slides", label: "Slides", href: "/app/slides", group: "Features", hint: "Decks from a prompt or file", keywords: "presentation deck" },
  { id: "study", label: "Study", href: "/app/study", group: "Features", hint: "Flashcards and quizzes", keywords: "learn exam cards quiz" },
  { id: "gallery", label: "Community gallery", href: "/templates", group: "Features", hint: "Templates people built and shared — remix one", keywords: "showcase examples community templates remix starter" },
  { id: "api", label: "API docs", href: "/developers", group: "Features", hint: "Keys, endpoints, OpenAPI", keywords: "developer api key rest openapi" },
  // Agents, approvals and team workspaces are part of Keplar Business, on its own site (the old /agents and /enterprise URLs only redirect there).
  { id: "business", label: "Keplar Business", href: `https://${BUSINESS_HOST}`, group: "Features", hint: "Agents, approvals and team workspaces", keywords: "agents automation approvals teams seats business enterprise" },
  { id: "changelog", label: "Changelog", href: "/changelog", group: "Learn", hint: "Release notes", keywords: "release notes updates new roadmap" },
  { id: "docs", label: "Docs", href: "/docs", group: "Learn", hint: "How everything works", keywords: "help documentation guide" },
  { id: "status", label: "Status", href: "/status", group: "Learn", hint: "Live system checks", keywords: "uptime health" },
];

export const ACCOUNT_COMMANDS: Command[] = [
  { id: "account", label: "Account and settings", href: "/account", group: "Account", keywords: "settings profile billing plan password" },
  { id: "pricing", label: "Plans and pricing", href: "/pricing", group: "Account", keywords: "upgrade price cost plan" },
  { id: "signin", label: "Sign in", href: "/signin", group: "Account", keywords: "log in login" },
  { id: "signup", label: `Create a ${brand.name} account`, href: "/signup", group: "Account", keywords: "register join" },
  { id: "history", label: "Chat history", href: "/app/history", group: "Account", keywords: "past chats threads" },
  { id: "projects", label: "Projects", href: "/app/projects", group: "Account", keywords: "folders files" },
];

/** Everything static, deduped by href (feature entries win over footer duplicates). */
export function staticCommands(): Command[] {
  const seen = new Set<string>();
  const out: Command[] = [];
  const add = (c: Command) => {
    if (seen.has(c.href)) return;
    seen.add(c.href);
    out.push(c);
  };
  FEATURE_COMMANDS.forEach(add);
  ACCOUNT_COMMANDS.forEach(add);
  for (const l of primaryNav) for (const c of l.children ?? [l]) add({ id: `nav:${c.href}`, label: c.label, href: c.href, group: "Go to", hint: c.hint });
  for (const col of footerNav) for (const l of col.links) add({ id: `foot:${l.href}`, label: l.label, href: l.href, group: col.heading === "Learn" ? "Learn" : "Go to" });
  // Pages outside the nav and footer (minimal pass): still one search away.
  for (const l of paletteOnlyPages) add({ id: `page:${l.href}`, label: l.label, href: l.href, group: "Learn", hint: l.hint });
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/** Simple ranked match: label prefix > word prefix > substring in label > keywords/hint. Empty query keeps order. */
export function rankCommands(list: Command[], query: string, limit = 40): Command[] {
  const q = norm(query.trim());
  if (!q) return list.slice(0, limit);
  const scored: { c: Command; s: number }[] = [];
  for (const c of list) {
    const label = norm(c.label);
    const extra = norm(`${c.hint ?? ""} ${c.keywords ?? ""} ${c.href}`);
    let s = 0;
    if (label.startsWith(q)) s = 100;
    else if (label.split(/[\s/-]+/).some((w) => w.startsWith(q))) s = 80;
    else if (label.includes(q)) s = 60;
    else if (q.split(/\s+/).every((t) => label.includes(t) || extra.includes(t))) s = 30;
    if (s) scored.push({ c, s: s - (c.group === "Docs" ? 5 : 0) });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.c);
}

export const OPEN_PALETTE_EVENT = "keplar:palette";
/** Opens the /app shell's own search (your chats), which takes the place of the site palette inside the app. */
export const OPEN_APP_SEARCH_EVENT = "keplar:app-search";

/** Search from shared chrome (the desktop title bar): the app's chat search inside /app, else the site palette. */
export function openSearch(): void {
  window.dispatchEvent(new Event(document.querySelector("[data-own-search]") ? OPEN_APP_SEARCH_EVENT : OPEN_PALETTE_EVENT));
}
