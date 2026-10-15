/** UX-1 / UX-2 (docs/rebirth/AUDIT.md): connected apps, Keplar Browser and Keplar Wants are reachable inside the Keplar One app shell. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { oauthReturnView, pathForView, viewForPath } from "@/components/app-ui/app-paths";

const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
const side = readFileSync("src/components/app-ui/Sidebar.tsx", "utf8");

test("Browser, Wants and Connected apps are app views with their own /app paths, rendered by the shell", () => {
  assert.equal(pathForView("browser"), "/app/browser");
  assert.equal(pathForView("wants"), "/app/wants");
  assert.equal(pathForView("apps"), "/app/apps");
  for (const v of ["browser", "wants", "apps"] as const) {
    assert.equal(viewForPath(pathForView(v)), v);
    const page = readFileSync(`src/app/app/${v}/page.tsx`, "utf8");
    assert.match(page, new RegExp(`<TabPage view="${v}" />`), `/app/${v} opens inside the app shell`);
    assert.match(app, new RegExp(`state\\.view === "${v}"`), `the shell renders ${v}`);
  }
});

test("the sidebar's More lists Keplar Browser, Keplar Wants and Connected apps; search finds them too", () => {
  const block = side.slice(side.indexOf("const secondary"), side.indexOf("const LOW_AT"));
  const views = [...block.matchAll(/view: "([a-z]+)"/g)].map((m) => m[1]);
  for (const v of ["browser", "wants", "apps"]) assert.ok(views.includes(v), v);
  const search = readFileSync("src/components/app-ui/SearchDialog.tsx", "utf8");
  for (const v of ["browser", "wants", "apps"]) assert.match(search, new RegExp(`onView\\("${v}"\\)`));
});

test("Manage in Ask's Tools bar opens Connected apps in Keplar One, not the Business site", () => {
  assert.match(app, /onOpenApps=\{\(\) => goView\("apps"\)\}/);
  assert.doesNotMatch(app, /onOpenApps=\{\(\) => goView\("business"\)\}/);
  const view = readFileSync("src/components/app-ui/ConnectedAppsView.tsx", "utf8");
  assert.match(view, /<McpConnections /, "the real connected-apps screen (account-level /api/mcp)");
});

test("coming back from a sign-in opens the right place: MCP results to Connected apps, Business connectors, banks and Stripe to Business", () => {
  for (const r of ["ok", "denied", "state", "failed"]) assert.equal(oauthReturnView(r), "apps", r);
  for (const r of ["stripe", "conn_ok_gmail", "conn_no", "bank_done"]) assert.equal(oauthReturnView(r), "business", r);
});
