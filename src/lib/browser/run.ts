/**
 * Keplar Browser: a real headless Chromium that Keplar drives for one task, step by step, and then throws away.
 *  - Isolated: a fresh browser context per task (no cookies, no saved sign-ins, no downloads, no service workers, one tab).
 *  - Public web only: every request (every redirect hop too) is checked like an MCP server address (mcp/ssrf.ts#checkUrl plus
 *    a DNS check that every address is public); private, loopback, link-local and metadata addresses are refused.
 *  - Every step is shown to the person as it happens (what was done, the address, a screenshot); nothing runs hidden.
 *  - It stops before anything that spends, sends, deletes or signs in (policy.ts#needsPerson) and hands that back to the person.
 * The browser and the model are injected so tests can drive it without a network or model.
 */
import dns from "node:dns";
import type { Browser, BrowserContext, Page, Route } from "playwright-core";
import { checkUrl, isPublicIp } from "@/lib/mcp/ssrf";
import { describe, MAX_ELEMENTS, MAX_STEPS, needsPerson, PAGE_TEXT_CHARS, parseAction, startUrl, stepPrompt, type Action, type El, type Snapshot } from "./policy";

const ACTION_MS = 15_000;

export type Step = { n: number; note: string; url: string; title: string; shot?: string };
export type Outcome = { status: "done" | "needs_you" | "failed" | "stopped"; answer?: string; reason?: string; steps: number };
export type Decide = (prompt: string) => Promise<string | null>;
export type Resolver = (host: string) => Promise<string[]>;
export type Fetched = { status: number; headers: Record<string, string>; body: Buffer };
/** Fetches one allowed address for a request WITHOUT following redirects (tests serve fixtures here instead of the network). */
export type Transport = (route: Route, url: string) => Promise<Fetched>;
const networkTransport: Transport = async (route, url) => {
  const res = await route.fetch({ url, maxRedirects: 0, timeout: ACTION_MS });
  return { status: res.status(), headers: res.headers(), body: await res.body() };
};
const MAX_HOPS = 5;
const attr = (u: string) => u.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const dnsResolve: Resolver = async (host) => (await dns.promises.lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** May the browser load this address? Public http(s) only, every resolved address public; data:/blob:/about: stay in the page. */
export async function allowedUrl(raw: string, resolve: Resolver = dnsResolve): Promise<boolean> {
  if (/^(data|blob|about):/i.test(raw)) return true;
  let u: URL;
  try {
    u = checkUrl(raw, { allowHttp: true });
  } catch {
    return false;
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  try {
    const ips = await resolve(host);
    return ips.length > 0 && ips.every(isPublicIp);
  } catch {
    return false;
  }
}

/**
 * Route every request through the guard. A redirect is never handed to Chromium (it would follow it without asking this
 * route again): each hop is checked here; a page redirect becomes a fresh navigation, which comes back through the guard.
 */
async function guardContext(ctx: BrowserContext, resolve: Resolver, transport: Transport, blocked: Set<string>) {
  await ctx.route("**/*", async (route: Route) => {
    const req = route.request();
    const type = req.resourceType();
    if (type === "media" || type === "websocket" || type === "eventsource") return route.abort("blockedbyclient");
    if (!(await allowedUrl(req.url(), resolve))) {
      if (type === "document") blocked.add(req.url().slice(0, 200));
      return route.abort("blockedbyclient");
    }
    if (/^(data|blob|about):/i.test(req.url())) return route.continue();
    try {
      let url = req.url();
      for (let hop = 0; hop <= MAX_HOPS; hop++) {
        const res = await transport(route, url);
        const loc = res.status >= 300 && res.status < 400 ? res.headers["location"] : undefined;
        if (!loc) {
          const headers = Object.fromEntries(Object.entries(res.headers).filter(([k]) => !/^(content-encoding|content-length|transfer-encoding|set-cookie)$/i.test(k)));
          return await route.fulfill({ status: res.status, headers, body: res.body });
        }
        const next = new URL(loc, url).toString();
        if (!(await allowedUrl(next, resolve))) {
          if (type === "document") blocked.add(next.slice(0, 200));
          return await route.abort("blockedbyclient");
        }
        if (type === "document") return await route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><meta http-equiv="refresh" content="0;url=${attr(next)}">` });
        url = next;
      }
      await route.abort("failed");
    } catch {
      await route.abort("failed").catch(() => undefined);
    }
  });
}

/** What the model sees: address, title, visible text and the numbered visible controls (marked in the page for clicking). */
async function snapshot(page: Page): Promise<Snapshot> {
  // A page that is still navigating destroys the script's context: wait for it to load and read it again.
  for (let tries = 0; ; tries++) {
    try {
      return await readPage(page);
    } catch (e) {
      if (tries >= 2) throw e;
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    }
  }
}

async function readPage(page: Page): Promise<Snapshot> {
  const data = await page.evaluate(
    ({ maxEl, maxText }) => {
      const els: { i: number; tag: string; text: string; type?: string; name?: string; href?: string }[] = [];
      document.querySelectorAll("[data-keplar-i]").forEach((e) => e.removeAttribute("data-keplar-i"));
      const nodes = document.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=searchbox], [contenteditable=true]");
      for (const n of Array.from(nodes)) {
        if (els.length >= maxEl) break;
        const r = n.getBoundingClientRect();
        const st = getComputedStyle(n);
        if (r.width < 2 || r.height < 2 || st.visibility === "hidden" || st.display === "none" || r.bottom < 0 || r.top > innerHeight * 2.5) continue;
        const i = els.length;
        n.setAttribute("data-keplar-i", String(i));
        const inp = n as HTMLInputElement;
        const text = (n.innerText || inp.value || n.getAttribute("aria-label") || inp.placeholder || n.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 80);
        const href = n instanceof HTMLAnchorElement ? n.href.slice(0, 160) : undefined;
        els.push({ i, tag: n.tagName.toLowerCase(), text, type: inp.type && n.tagName !== "BUTTON" ? inp.type : n.getAttribute("type") ?? undefined, name: (inp.name || n.id || n.getAttribute("autocomplete") || "").slice(0, 40) || undefined, href });
      }
      return { title: document.title.slice(0, 160), text: (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").slice(0, maxText), elements: els };
    },
    { maxEl: MAX_ELEMENTS, maxText: PAGE_TEXT_CHARS },
  );
  return { url: page.url(), ...data };
}

async function shot(page: Page): Promise<string | undefined> {
  try {
    const b = await page.screenshot({ type: "jpeg", quality: 45, timeout: 8000 });
    return `data:image/jpeg;base64,${b.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Resolves when the main frame navigates, a page load is refused, or after a short quiet period (a click that changes nothing). */
function settled(page: Page, ms = 4000): Promise<void> {
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(t);
      page.off("framenavigated", onNav);
      page.off("requestfailed", onFail);
      done();
    };
    const onNav = (f: import("playwright-core").Frame) => { if (f === page.mainFrame()) finish(); };
    const onFail = (r: import("playwright-core").Request) => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) finish(); };
    const t = setTimeout(finish, ms);
    page.on("framenavigated", onNav);
    page.on("requestfailed", onFail);
  });
}

async function act(page: Page, a: Action, resolve: Resolver): Promise<void> {
  const el = (i: number) => page.locator(`[data-keplar-i="${i}"]`).first();
  switch (a.kind) {
    case "goto": {
      const url = startUrl("", a.url);
      if (!(await allowedUrl(url, resolve))) throw new Error("That address is private or not allowed.");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: ACTION_MS });
      return;
    }
    case "click":
      await el(a.index).click({ timeout: ACTION_MS, noWaitAfter: true }); // a navigation the guard refuses must not hang the click
      return;
    case "type":
      await el(a.index).fill(a.text, { timeout: ACTION_MS });
      if (a.submit) await el(a.index).press("Enter", { timeout: ACTION_MS });
      return;
    case "scroll":
      await page.mouse.wheel(0, a.dir === "down" ? 700 : -700);
      return;
    case "back":
      await page.goBack({ waitUntil: "domcontentloaded", timeout: ACTION_MS });
      return;
    case "done":
      return;
  }
}

export async function runBrowserTask(
  input: { goal: string; url?: string },
  deps: { browser: Browser; decide: Decide; onStep: (s: Step) => void; signal?: AbortSignal; resolve?: Resolver; transport?: Transport; maxSteps?: number },
): Promise<Outcome> {
  const resolve = deps.resolve ?? dnsResolve;
  const maxSteps = Math.min(deps.maxSteps ?? MAX_STEPS, MAX_STEPS);
  const blocked = new Set<string>();
  const ctx = await deps.browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false, serviceWorkers: "block", javaScriptEnabled: true, locale: "en-US" });
  try {
    await guardContext(ctx, resolve, deps.transport ?? networkTransport, blocked);
    const page = await ctx.newPage();
    ctx.on("page", (p) => { if (p !== page) void p.close().catch(() => undefined); }); // one tab: popups are closed
    page.on("dialog", (d) => void d.dismiss().catch(() => undefined));

    const first = startUrl(input.goal, input.url);
    if (!(await allowedUrl(first, resolve))) return { status: "failed", reason: "That address is private or not allowed. Keplar Browser only opens public websites.", steps: 0 };
    try {
      await page.goto(first, { waitUntil: "domcontentloaded", timeout: ACTION_MS });
    } catch {
      return { status: "failed", reason: `Keplar couldn't open ${first}.`, steps: 0 };
    }
    deps.onStep({ n: 0, note: input.url ? `Opened ${first}` : "Searched the web for the task", url: page.url(), title: await page.title().catch(() => ""), shot: await shot(page) });

    const history: string[] = [];
    for (let n = 1; n <= maxSteps; n++) {
      if (deps.signal?.aborted) return { status: "stopped", reason: "Stopped.", steps: n - 1 };
      const snap = await snapshot(page);
      let action: Action | null = null;
      for (let tries = 0; tries < 2 && !action; tries++) action = parseAction((await deps.decide(stepPrompt(input.goal, snap, history, maxSteps - n + 1))) ?? "");
      if (!action) return { status: "failed", reason: "The model didn't choose a browser action. Nothing else was done.", steps: n - 1 };
      if (action.kind === "done") return { status: "done", answer: action.answer, steps: n - 1 };
      const el: El | undefined = "index" in action ? snap.elements.find((e) => e.i === action.index) : undefined;
      const stop = needsPerson(action, el);
      if (stop) return { status: "needs_you", reason: stop, answer: history.length ? `Done so far: ${history.join("; ")}.` : undefined, steps: n - 1 };
      let note = describe(action, el);
      blocked.clear();
      try {
        const moved = action.kind === "click" || (action.kind === "type" && action.submit) ? settled(page) : Promise.resolve();
        await act(page, action, resolve);
        await moved;
        await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
      } catch (e) {
        note += ` (didn't work: ${e instanceof Error ? e.message.split("\n")[0].slice(0, 100) : "error"})`;
      }
      if (blocked.size) note += " (a private or internal address was blocked)";
      history.push(note);
      deps.onStep({ n, note, url: page.url(), title: await page.title().catch(() => ""), shot: await shot(page) });
    }
    // Out of steps: one last chance to answer from the page as it is.
    const snap = await snapshot(page);
    const last = parseAction((await deps.decide(stepPrompt(input.goal, snap, history, 0))) ?? "");
    if (last?.kind === "done") return { status: "done", answer: last.answer, steps: maxSteps };
    return { status: "failed", reason: `Keplar used all ${maxSteps} steps without finishing. Try a more specific task or a starting address.`, steps: maxSteps };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
