/**
 * Runtime verification in a real headless Chromium. The generated project is served in-process (no deploy, no network hop):
 * the browser's requests to a private test host are answered by the same serveApp() that serves real apps, including the real
 * API on an isolated "qa" data environment and the real CSP sandbox. We visit every route, follow links to parameterised
 * screens, sign up as a test user, create records in every writable collection, call each AI action once, and check that the
 * data shows up in the UI. Page errors, console errors, failed requests, empty screens, sideways scroll (at 390 and 540 px) and
 * text drawn over other text are reported, with file and line where the stack trace has them. The runtime scripts (/fx) are
 * served with the same headers as in production, so a header that would blank the real preview fails here too.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, Page } from "playwright-core";
import { launchBrowser } from "@/lib/site-builder/qa/browser";
import type { PlanId } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import type { Site, SiteVersion } from "@/lib/site-builder/types";
import { serveApp } from "@/lib/app-runtime/serve";
import { getPublicImage } from "@/lib/images/blob";
import { appCtx } from "@/lib/app-runtime/context";
import { deleteAppData } from "@/lib/app-runtime/db";
import { seedDraft } from "@/lib/app-runtime/data";
import type { AppMeta, AppSpec, CheckResult, CollectionSpec } from "../types";
import { FX_HEADERS } from "@/lib/security/headers";
import { LAYOUT_PROBE, type LayoutProbeResult } from "./layout-probe";

export const QA_HOST = "https://app.keplar.test";
const BASE = "/app";
export const QA_EMAIL = "qa-runner@keplar.test";

export type RuntimeIssue = { route: string; message: string; file?: string; line?: number };
export type Shot = { route: string; viewport: "desktop" | "mobile"; png: Buffer };
export type SmokeResult = { checks: CheckResult[]; issues: RuntimeIssue[]; shots: Shot[]; texts: Record<string, string>; skipped: string | null };

const isSite = (spec: AppSpec) => spec.kind === "site" && !spec.uses.includes("ui");

async function fxFile(p: string): Promise<string | null> {
  if (!/^\/fx\/[a-z0-9.-]+\.js$/.test(p)) return null;
  try {
    return await readFile(path.join(process.cwd(), "public", p), "utf8");
  } catch {
    return null;
  }
}

const fileOfStack = (stack: string): { file?: string; line?: number } => {
  const m = new RegExp(`${QA_HOST.replace(/[.]/g, "\\.")}${BASE}/([a-z0-9_./-]+\\.m?js):(\\d+)`).exec(stack);
  return m ? { file: m[1], line: Number(m[2]) } : {};
};

function sampleValue(f: CollectionSpec["fields"][number], ctx: { userId: string; refIds: Record<string, string> }, n: number): unknown {
  switch (f.type) {
    case "text": return `QA sample ${f.name} ${n}`.slice(0, f.max ?? 200);
    case "longtext": return `QA sample ${f.name}: a short paragraph written by the Keplar test run to check this screen end to end.`;
    case "number": return Math.min(f.max ?? 1e6, 3);
    case "boolean": return true;
    case "date": return new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    case "datetime": return new Date(Date.now() + 2 * 86_400_000).toISOString();
    case "email": return "qa-guest@keplar.test";
    case "url": return "https://keplar.one";
    case "image": return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    case "file": return "https://keplar.one/robots.txt";
    case "ref": return f.ref === "users" ? ctx.userId : ctx.refIds[f.ref ?? ""] ?? null;
    case "select": return f.options?.[0] ?? null;
    case "tags": return ["qa"];
    case "json": return {};
  }
}

function sampleInput(spec: AppSpec, a: AppSpec["ai"][number]): Record<string, string> {
  const topic = `${spec.name}: ${spec.summary}`.slice(0, 300);
  const out: Record<string, string> = {};
  for (const i of a.input) out[i.name] = `Sample for testing (${i.name}). ${topic} Photosynthesis turns light, water and carbon dioxide into glucose and oxygen inside chloroplasts; chlorophyll absorbs mostly red and blue light.`.slice(0, i.max);
  return out;
}

export async function smokeTest(o: {
  site: Site;
  meta: AppMeta;
  files: Record<string, string>;
  plan: PlanId;
  deadline: number;
  onCheck?: (c: CheckResult) => void;
  aiCalls?: boolean;
  shots?: boolean;
  workspace?: Workspace;
}): Promise<SmokeResult> {
  const spec = o.meta.spec;
  const site: Site = { ...o.site, app: { ...o.meta, admins: [...new Set([...(o.meta.admins ?? []), QA_EMAIL])] } };
  const version = { version: 0, files: o.files } as unknown as SiteVersion;
  const ctx = appCtx(site, "qa", o.plan);
  const checks: CheckResult[] = [];
  const issues: RuntimeIssue[] = [];
  const shots: Shot[] = [];
  const texts: Record<string, string> = {};
  const add = (c: CheckResult) => {
    checks.push(c);
    o.onCheck?.(c);
  };
  if (ctx?.limits.backend) {
    await deleteAppData(site.id, "qa");
    await seedDraft(ctx);
  }

  const imageUrls = new Set(Object.values(o.meta.images ?? {}));
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { checks, issues, shots, texts, skipped: e instanceof Error ? e.message : "The test browser could not start." };
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
    await context.route("**/*", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") return route.continue();
      // Generated images (public /i/<id> URLs on Keplar) load for real.
      if (imageUrls.has(url.href)) {
        const id = url.pathname.split("/").pop() ?? "";
        const img = await getPublicImage(id).catch(() => null);
        return img ? route.fulfill({ status: 200, body: img.bytes, headers: { "content-type": img.contentType } }) : route.continue();
      }
      if (url.origin !== QA_HOST) return route.abort();
      if (url.pathname.startsWith("/fx/")) {
        const js = await fxFile(url.pathname);
        return js === null ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ status: 200, body: js, headers: { ...Object.fromEntries(FX_HEADERS.map((h) => [h.key.toLowerCase(), h.value])), "content-type": "text/javascript; charset=utf-8" } });
      }
      if (url.pathname === "/i/" || url.pathname.startsWith("/i/")) return route.fulfill({ status: 404, body: "" });
      if (!url.pathname.startsWith(`${BASE}/`) && url.pathname !== BASE) return route.fulfill({ status: 404, body: "" });
      const parts = url.pathname.slice(BASE.length + 1).split("/").filter(Boolean);
      const body = req.postDataBuffer();
      const headers = req.headers();
      const res = await serveApp(new Request(url.toString(), { method: req.method(), headers, body: body && req.method() !== "GET" && req.method() !== "HEAD" ? new Uint8Array(body) : undefined }), { site, version, env: "qa", parts, base: BASE, origin: QA_HOST, plan: o.plan, reportHref: null, workspace: o.workspace });
      const out: Record<string, string> = {};
      res.headers.forEach((v, k) => (out[k] = v));
      return route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
    });

    const page = await context.newPage();
    let current = "/";
    page.on("pageerror", (err) => issues.push({ route: current, message: `Uncaught error: ${err.message.split("\n")[0].slice(0, 300)}`, ...fileOfStack(err.stack ?? "") }));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text();
      if (/favicon|Failed to load resource: the server responded with a status of (401|404)/i.test(t)) return;
      if (/Content Security Policy/i.test(t)) return issues.push({ route: current, message: `Blocked by the sandbox: ${t.slice(0, 240)}` });
      issues.push({ route: current, message: `Console error: ${t.slice(0, 300)}`, ...fileOfStack(m.location()?.url ? `${m.location().url}:${m.location().lineNumber + 1}` : "") });
    });
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.origin !== QA_HOST) return;
      if (r.status() >= 500) issues.push({ route: current, message: `Server error ${r.status()} on ${u.pathname.replace(BASE, "")}` });
      if (r.status() === 404 && !u.pathname.includes("/_api/") && !/favicon/.test(u.pathname)) issues.push({ route: current, message: `Missing file: ${u.pathname.replace(`${BASE}/`, "")}` });
      if ((r.status() === 400 || r.status() === 404) && u.pathname.includes("/_api/")) {
        r.text().then((t) => issues.push({ route: current, message: `API refused ${r.request().method()} ${u.pathname.replace(`${BASE}/_api`, "")}${u.search.slice(0, 120)}: ${t.slice(0, 200)}` })).catch(() => undefined);
      }
    });

    const settle = async () => {
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    };
    const probe = () => page.evaluate(LAYOUT_PROBE) as Promise<LayoutProbeResult>;
    const overlapIssue = (p: LayoutProbeResult) =>
      `Layout: text is drawn over other text at ${p.viewport}px (${p.overlaps.slice(0, 3).join("; ")}). Usually an absolutely positioned label or a negative margin: put it in the normal flow (e.g. a flex row with space-between) or reserve room for it, and hide decorative labels when there is no room.`;
    const measure = () =>
      page.evaluate(() => {
        const root = document.getElementById("app") ?? document.body;
        const text = (document.body.innerText || "").replace(/\s+/g, " ").trim();
        return {
          text: text.slice(0, 4000),
          textLen: text.length,
          kids: root.childElementCount,
          canvas: document.querySelectorAll("canvas").length,
          links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") || "").filter((h) => h.startsWith("#/") || /^[a-z0-9_-]+\.html$/i.test(h)),
          h1: document.querySelectorAll("h1").length,
          // Headings/paragraphs squeezed into a sliver on a wide screen (e.g. a grid-column-start that cancels a span). Never flags 320px+
          // (a big display headline over several short lines is a design choice).
          cramped: window.innerWidth >= 1000
            ? [...document.querySelectorAll("h1, h2, h3, p, figcaption, blockquote")]
                .filter((el) => {
                  const t = (el.textContent || "").trim();
                  const r = el.getBoundingClientRect();
                  const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
                  return t.length > 40 && r.width > 0 && r.height > 0 && r.width < Math.max(180, Math.min(fs * 9, 320)) && r.height > fs * 4;
                })
                .slice(0, 3)
                .map((el) => `<${el.tagName.toLowerCase()}${el.className ? ` class="${String(el.className).slice(0, 60)}"` : ""}> is ${Math.round(el.getBoundingClientRect().width)}px wide`)
            : [],
        };
      });

    const routes: string[] = isSite(spec) ? Object.keys(o.files).filter((f) => f.endsWith(".html")).sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b))) : spec.pages.map((p) => p.route);
    const plain = routes.filter((r) => !r.includes(":"));
    const param = routes.filter((r) => r.includes(":"));
    const seenLinks = new Set<string>();
    const urlFor = (r: string) => (isSite(spec) ? `${QA_HOST}${BASE}/${r === "index.html" ? "" : r}` : `${QA_HOST}${BASE}/#${r}`);

    const visit = async (r: string, label: string, first: boolean) => {
      current = label;
      const before = issues.length;
      if (first || isSite(spec)) await page.goto(urlFor(r), { waitUntil: "load", timeout: 20_000 }).catch((e) => issues.push({ route: label, message: `Page did not load: ${String(e.message).split("\n")[0]}` }));
      else await page.evaluate((h) => { location.hash = h; }, r);
      await settle();
      const m = await measure().catch(() => null);
      if (!m) return null;
      for (const l of m.links) seenLinks.add(l);
      texts[label] = m.text;
      const lp = await probe().catch(() => null);
      if (lp?.overlaps.length) issues.push({ route: label, message: overlapIssue(lp) });
      if (m.cramped.length) issues.push({ route: label, message: `Layout: text is squeezed into a narrow column on a 1360px screen (${m.cramped.join("; ")}). Check grid-column/flex rules for that element and its container (a grid-column-start after "grid-column: span N" resets the span to 1).` });
      const empty = m.textLen < 25 && m.canvas === 0;
      if (empty) issues.push({ route: label, message: "The screen rendered (almost) nothing." });
      const errs = issues.slice(before).filter((i) => i.route === label);
      add({ id: `route:${label}`, label: `Opens ${label}`, ok: !errs.length && !empty, detail: errs.length ? errs[0].message : empty ? "Empty screen" : `${m.textLen} characters of content`, route: label });
      return m;
    };

    let first = true;
    for (const r of plain) {
      if (Date.now() > o.deadline - 25_000) break;
      await visit(r, r, first);
      first = false;
      if (o.shots !== false && shots.length < 6) shots.push({ route: r, viewport: "desktop", png: await page.screenshot({ type: "jpeg", quality: 72 }) });
    }
    for (const r of param) {
      if (Date.now() > o.deadline - 25_000) break;
      const re = new RegExp(`^#${r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[a-zA-Z_]+/g, "[^/?#]+")}(?:\\?.*)?$`);
      const hit = [...seenLinks].find((l) => re.test(l));
      if (!hit) {
        add({ id: `route:${r}`, label: `Reaches ${r}`, ok: true, detail: "No link to this screen on the pages tested (checked by the reviewer instead)", route: r });
        continue;
      }
      await visit(hit.slice(1), r, false);
      if (o.shots !== false && shots.length < 7) shots.push({ route: r, viewport: "desktop", png: await page.screenshot({ type: "jpeg", quality: 72 }) });
    }

    // Phone (390) and large-phone / small-tablet (540) passes on the first screen. Sideways overflow is measured on the elements, so
    // `html, body { overflow-x: hidden }` cannot hide it (layout-probe.ts).
    const narrow: string[] = [];
    for (const width of [390, 540]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
      current = `${routes[0]} (${width}px)`;
      await page.goto(urlFor(routes[0]), { waitUntil: "load", timeout: 20_000 }).catch(() => undefined);
      await settle();
      const lp = await probe().catch(() => null);
      if (!lp) continue;
      if (lp.overflow) {
        narrow.push(`${width}px`);
        issues.push({ route: current, message: `At ${width}px wide the page is wider than the screen (content reaches ${lp.contentWidth}px${lp.wide.length ? `: ${lp.wide.join(", ")}` : ""}). Constrain that element: a horizontal scroller needs max-width: 100% and min-width: 0 and must not be shrink-wrapped (align-items: flex-start in a column, inline-block, float); long words need overflow-wrap. Do not hide it with overflow-x: hidden on html or body.` });
      }
      if (lp.overlaps.length) issues.push({ route: current, message: overlapIssue(lp) });
      if (width === 390 && o.shots !== false) shots.push({ route: routes[0], viewport: "mobile", png: await page.screenshot({ type: "jpeg", quality: 72 }) });
    }
    add({ id: "mobile", label: "Phone layout (390 and 540 px)", ok: !narrow.length, detail: narrow.length ? `The page is wider than the screen at ${narrow.join(" and ")}` : "No sideways overflow" });
    await page.setViewportSize({ width: 1360, height: 860 });

    if (!isSite(spec) && ctx?.limits.backend && Date.now() < o.deadline - 30_000) await flows(page, spec, o, add, issues, texts, (r) => (current = r), settle, urlFor);
  } finally {
    await browser.close().catch(() => undefined);
  }
  return { checks, issues: dedupe(issues), shots, texts, skipped: null };
}

async function flows(
  page: Page,
  spec: AppSpec,
  o: { deadline: number; aiCalls?: boolean },
  add: (c: CheckResult) => void,
  issues: RuntimeIssue[],
  texts: Record<string, string>,
  setCurrent: (r: string) => void,
  settle: () => Promise<void>,
  urlFor: (r: string) => string,
) {
  setCurrent("flow");
  await page.goto(urlFor("/"), { waitUntil: "load", timeout: 20_000 }).catch(() => undefined);
  await settle();
  let userId = "";
  if (spec.auth.enabled) {
    const r = await page.evaluate(async (email) => {
      try {
        const k = (window as unknown as { keplar: { ready: Promise<unknown>; auth: { signUp: (o: unknown) => Promise<{ id: string }> } } }).keplar;
        await k.ready;
        const u = await k.auth.signUp({ email, password: "qa-pass-12345", name: "Quinn Tester" });
        return { ok: true, id: u.id };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }, QA_EMAIL).catch((e) => ({ ok: false, error: String(e) }));
    add({ id: "flow:signup", label: "Sign up", ok: r.ok, detail: r.ok ? "Test account created and signed in" : `Sign-up failed: ${"error" in r ? r.error : ""}` });
    if (r.ok && "id" in r) userId = r.id as string;
    await page.reload({ waitUntil: "load" }).catch(() => undefined);
    await settle();
  }
  const refIds: Record<string, string> = {};
  const created: string[] = [];
  const order = [...spec.collections].sort((a, b) => a.fields.filter((f) => f.type === "ref" && f.ref !== "users").length - b.fields.filter((f) => f.type === "ref" && f.ref !== "users").length);
  for (const c of order) {
    if (Date.now() > o.deadline - 20_000) break;
    if (c.create === "none" || (!spec.auth.enabled && c.create !== "public")) continue;
    const first = await page.evaluate(async (name) => {
      try {
        const k = (window as unknown as { keplar: { db: { collection: (n: string) => { all: (q: unknown) => Promise<{ id: string }[]> } } } }).keplar;
        const items = await k.db.collection(name).all({ limit: 1 });
        return items[0]?.id ?? null;
      } catch {
        return null;
      }
    }, c.name);
    if (first) refIds[c.name] = first;
    const data: Record<string, unknown> = {};
    for (const f of c.fields) {
      const v = sampleValue(f, { userId, refIds }, 1);
      if (v !== null && v !== undefined) data[f.name] = v;
    }
    const res = await page.evaluate(async ({ name, data }) => {
      try {
        const k = (window as unknown as { keplar: { db: { collection: (n: string) => { create: (d: unknown) => Promise<{ id: string }>; get: (id: string) => Promise<unknown> } } } }).keplar;
        const it = await k.db.collection(name).create(data);
        const back = await k.db.collection(name).get(it.id);
        return { ok: Boolean(back), id: it.id };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }, { name: c.name, data }).catch((e) => ({ ok: false, error: String(e) }));
    if (res.ok && "id" in res) {
      refIds[c.name] = res.id as string;
      if (c.fields.some((f) => f.type === "text" || f.type === "longtext")) created.push(c.name);
    }
    // A unique rule refusing the sample (e.g. a one-row settings collection that is already seeded) is the rule working.
    const dup = !res.ok && (c.unique?.length ?? 0) > 0 && /already exists/i.test("error" in res ? String(res.error) : "");
    add({ id: `flow:create:${c.name}`, label: `Save to ${c.label}`, ok: res.ok || dup, detail: res.ok ? "Created and read back through the API" : dup ? "Refused as a duplicate (its unique rule holds)" : `Failed: ${"error" in res ? res.error : ""}` });
    if (!res.ok && !dup) issues.push({ route: "flow", message: `Creating a ${c.name} record with ${JSON.stringify(data).slice(0, 200)} failed: ${"error" in res ? res.error : ""}. The UI must send fields that match the collection.` });
  }
  if (created.length) {
    // The created records should appear somewhere in the UI.
    const routes = spec.pages.filter((p) => !p.route.includes(":")).map((p) => p.route);
    let seen = false;
    for (const r of routes) {
      if (Date.now() > o.deadline - 12_000) break;
      setCurrent(`${r} (after saving)`);
      await page.evaluate((h) => { location.hash = h; }, r);
      await settle();
      const t = await page.evaluate(() => document.body.innerText || "").catch(() => "");
      texts[`${r} (after saving)`] = t.slice(0, 3000);
      if (/QA sample/.test(t)) {
        seen = true;
        break;
      }
    }
    add({ id: "flow:shows-data", label: "Saved data shows up in the app", ok: seen, detail: seen ? "A record created by the test appeared on screen" : `Records created in ${created.join(", ")} did not appear on any screen` });
  }
  if (o.aiCalls !== false) {
    for (const a of spec.ai.slice(0, 2)) {
      if (Date.now() > o.deadline - 30_000) break;
      const input = sampleInput(spec, a);
      const r = await page.evaluate(async ({ name, input }) => {
        try {
          const k = (window as unknown as { keplar: { ai: { run: (n: string, i: unknown) => Promise<unknown> } } }).keplar;
          const out = await k.ai.run(name, input);
          return { ok: out !== null && out !== undefined && String(typeof out === "string" ? out : JSON.stringify(out)).length > 10, sample: (typeof out === "string" ? out : JSON.stringify(out)).slice(0, 300) };
        } catch (e) {
          return { ok: false, sample: e instanceof Error ? e.message : String(e) };
        }
      }, { name: a.name, input }).catch((e) => ({ ok: false, sample: String(e) }));
      add({ id: `flow:ai:${a.name}`, label: `AI: ${a.label}`, ok: r.ok, detail: r.ok ? `Answered: ${r.sample.slice(0, 140)}` : `Failed: ${r.sample}` });
    }
  }
  void issues;
}

function dedupe(list: RuntimeIssue[]): RuntimeIssue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.message}|${i.file ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 40);
}
