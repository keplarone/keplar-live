import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { businessHost } from "@/proxy";
import { BUSINESS_TIERS } from "@/lib/business/tiers";

const req = (url: string) => new NextRequest(url);

test("business host: its own pages rewrite into the Business app; any other page goes to keplar.one (temporary)", () => {
  const rewritten = (p: string) => businessHost(req(`https://business.keplar.one${p}`))?.headers.get("x-middleware-rewrite");
  for (const [p, to] of [["/", "/biz"], ["/work", "/biz/work"], ["/account", "/biz/account"], ["/signin", "/biz/signin"]]) assert.equal(new URL(rewritten(p)!).pathname, to, p);
  // Links inside Create and the Business OS modules (/pricing, /terms, /showcase, /app/create) used to land on a Business 404.
  for (const p of ["/pricing", "/terms", "/privacy", "/showcase", "/app/create?tab=images"]) {
    const r = businessHost(req(`https://business.keplar.one${p}`))!;
    assert.equal(r.status, 307, p);
    assert.equal(r.headers.get("location"), `https://keplar.one${p}`, p);
  }
  assert.equal(businessHost(req("https://business.keplar.one/api/business/agents")), null, "the API is served on the Business host");
});

test("business workspace: Create, Agents, Approvals, Operations and Integrations are real modules, not placeholders", () => {
  const ws = readFileSync("src/components/business-app/BusinessWorkspace.tsx", "utf8");
  for (const label of ["Create", "Agents", "Approvals", "Operations", "Integrations", "Deep Research", "Reason", "Dashboard"]) assert.match(ws, new RegExp(`label: "${label}"`), label);
  assert.match(ws, /import\("@\/components\/business\/BusinessOS"\)/);
  assert.match(ws, /import\("@\/components\/create\/CreateStudio"\)/);
  assert.match(ws, /tab: "agents"/);
  assert.match(ws, /tab: "approvals"/);
  assert.match(ws, /tab: "connectors"/);
  // Every Business plan promises these; each now has a place in the workspace.
  for (const promised of ["Website and app creation", "Make an Agent", "Images", "Videos", "Knowledge and integrations"]) assert.ok(BUSINESS_TIERS.starter.includes.includes(promised), promised);
  assert.doesNotMatch(ws, /study|skill/i, "no Study or Skills in Business");
});
