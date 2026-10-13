import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  accountIsNewer, canDownload, canEnableTopUp, canRender, chosenOffer, defaultPicked, deviceSessions, downloadLabel, envOfKey, formFromReport, frameCount,
  INITIAL_FORM, jobTone, mergeSessions, missingText, nameFromKey, renderSettings, robloxActive, blenderActive, topUpConsent, topUpMonthly, topUpStatus, topUpSummary,
  type BlenderJob, type BlenderReport, type TopUpQuote,
} from "@/components/app-ui/studio-mode/workspace/panels/panel-logic";

const dir = "src/components/app-ui/studio-mode/workspace";
const read = (f: string) => readFileSync(`${dir}/${f}`, "utf8");

const quote: TopUpQuote = {
  quoteId: "q1",
  offers: [
    { pack: "small", label: "Small", credits: 1000, priceUsd: 10, validDays: 365 },
    { pack: "custom", label: "Custom", credits: 2500, priceUsd: 25, validDays: 365 },
  ],
  methods: [{ id: "m1", label: "Visa ending 4242" }],
  custom: { creditsPerUsd: 100, minUsd: 5, maxUsd: 500 },
};

test("top-up consent and monthly maximum keep the original wording", () => {
  const offer = quote.offers[0]!;
  assert.equal(topUpConsent(offer, 1), "I authorize Keplar to charge my selected saved card $10.00 USD, plus applicable tax and Whop fees, for 1,000 credits whenever Studio needs more credits, up to 1 time per month, until I turn this off.");
  assert.match(topUpConsent(offer, 3), /up to 3 times per month, until I turn this off\.$/);
  assert.equal(topUpMonthly(offer, 3), "At this setting: up to $30.00 USD in top-ups per calendar month (UTC), plus applicable tax and Whop fees. Credits expire after 365 days. Turning this off stops future charges; a payment already started can still complete.");
  assert.equal(topUpSummary({ credits: 1000, priceUsd: 10, monthlyLimit: 1, methodLabel: "Visa" }), "1,000 credits per top-up at $10.00 USD, plus applicable tax and Whop fees, using Visa. Up to 1 top-up per calendar month (UTC). You can turn this off at any time.");
});

test("top-up: a custom amount only counts once the quote matches it; enable needs explicit consent", () => {
  assert.equal(chosenOffer(quote, "small", "")?.pack, "small");
  assert.equal(chosenOffer(quote, "custom", "25")?.credits, 2500);
  assert.equal(chosenOffer(quote, "custom", "30"), undefined, "an amount not yet reviewed has no offer");
  assert.equal(chosenOffer(null, "small", ""), undefined);
  const chosen = quote.offers[0];
  assert.equal(canEnableTopUp({ consent: false, chosen, method: "m1", busy: false }), false);
  assert.equal(canEnableTopUp({ consent: true, chosen, method: "", busy: false }), false);
  assert.equal(canEnableTopUp({ consent: true, chosen: undefined, method: "m1", busy: false }), false);
  assert.equal(canEnableTopUp({ consent: true, chosen, method: "m1", busy: true }), false);
  assert.equal(canEnableTopUp({ consent: true, chosen, method: "m1", busy: false }), true);
  assert.deepEqual(topUpStatus(null, ""), { label: "Loading…", tone: "neutral" });
  assert.equal(topUpStatus(null, "boom").label, "Unavailable");
  assert.equal(topUpStatus({ enabled: true, choice: null }, "").label, "On");
  assert.equal(topUpStatus({ enabled: false, choice: null }, "").label, "Off");
});

test("top-up panel: every field change resets consent, and the submit only saves with consent", () => {
  const src = read("panels/TopUpPanel.tsx");
  assert.match(src, /const change = <T,>\(set: \(v: T\) => void\) => \(v: T\) => \{ set\(v\); setConsent\(false\); \}/);
  for (const field of ["setPack", "setAmount", "setMethod", "setLimit"]) assert.match(src, new RegExp(`change\\(${field}\\)`), field);
  assert.match(src, /if \(consent\) void save\(true\)/);
  assert.match(src, /window\.addEventListener\("focus", refresh\)/);
});

test("Roblox Cloud: deletions are never picked by default; active statuses poll", () => {
  const picked = defaultPicked([
    { path: "a", status: "changed", applied: false },
    { path: "b", status: "created", applied: false },
    { path: "c", status: "deleted", applied: false },
    { path: "d", status: "changed", applied: true },
  ]);
  assert.deepEqual([...picked].sort(), ["a", "b"]);
  for (const st of ["draft", "queued", "running"]) assert.equal(robloxActive({ status: st }), true);
  for (const st of ["paused", "done", "stopped", "blocked", "failed"]) assert.equal(robloxActive({ status: st }), false);
  const src = read("panels/RobloxCloudPanel.tsx");
  assert.match(src, /15_000/);
  assert.match(src, /label=\{`\$\{c\.status === "deleted" \? "Delete" : "Apply"\} \$\{c\.path\}`\} hideLabel/, "each change checkbox is named Apply/Delete <path>");
  assert.match(src, /Apply \{picked\.size\} in Studio/);
  assert.equal(jobTone("failed"), "danger");
  assert.equal(jobTone("done"), "success");
  assert.equal(jobTone("blocked"), "warning");
});

const rep: BlenderReport = { file: "scene.blend", blender: "4.2", engine: "BLENDER_EEVEE", frameStart: 1, frameEnd: 120, frameCurrent: 12, fps: 24, resX: 1920, resY: 1080, resPercent: 100, samples: 64, objects: 10, missing: [], warnings: [] };

test("Blender Cloud: form seeding, frame counts and the settings sent", () => {
  const f = formFromReport(INITIAL_FORM, rep);
  assert.equal(f.engine, "BLENDER_EEVEE");
  assert.equal(frameCount(f, rep), 1);
  assert.equal(frameCount({ ...f, range: "all" }, rep), 120);
  assert.equal(frameCount({ ...f, range: "custom", frameStart: 1, frameEnd: 10, frameStep: 3 }, rep), 4);
  assert.equal(frameCount({ ...f, range: "custom", frameStart: 10, frameEnd: 1 }, rep), 0);
  assert.equal(formFromReport(INITIAL_FORM, { ...rep, engine: "OCTANE" }).engine, "CYCLES");
  assert.equal(renderSettings({ ...f, video: true }, rep).video, false, "no video for a single frame");
  assert.equal(renderSettings({ ...f, range: "all", video: true }, rep).video, true);
  assert.equal(renderSettings({ ...f, range: "all" }, rep).frameStep, 1);
  assert.equal("samples" in renderSettings(f, rep), false);
  assert.equal(canRender(0, true), false);
  assert.equal(canRender(2501, true), false);
  assert.equal(canRender(10, false), false);
  assert.equal(canRender(10, true), true);
  assert.equal(missingText(["a", "b", "c", "d", "e", "f", "g", "h"]), "Missing on this computer, so they'll render pink: a, b, c, d, e, f and 2 more.");
  for (const st of ["uploading", "queued", "rendering"]) assert.equal(blenderActive({ status: st }), true);
  const job = { file: "Scene.blend", createdAt: "2026-10-12T21:05:00.000Z", frames: { done: 3 }, machine: { state: "running" }, status: "done" } as unknown as BlenderJob;
  assert.equal(downloadLabel(job), "Scene 2026-10-12 21.05");
  assert.equal(canDownload(job), true);
  assert.equal(canDownload({ ...job, status: "uploading" }), false);
  assert.equal(canDownload({ ...job, machine: { vcpus: 8, state: "deleted" } }), false);
  assert.equal(canDownload({ ...job, frames: { ...job.frames, done: 0 } }), false);
});

function storage(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => entries[k] ?? null };
}
const saved = (name: string, savedAt: number, items = 2) => JSON.stringify({ v: 1, savedAt, name, items: new Array(items).fill({ kind: "note" }), history: [], units: 40 });

test("sessions: device copies per environment, merged with the account and newest first", () => {
  const st = storage({
    "keplar-studio-chat:id:111": saved("Obby", 1000),
    "keplar-studio-chat:name:blender/scene.blend": saved("scene.blend", 3000),
    "keplar-studio-chat:name:bad": "{not json",
    "keplar-studio-chat:name:old": JSON.stringify({ v: 0, savedAt: 1, items: [] }),
    "other-key": "x",
  });
  const roblox = deviceSessions(st, "roblox");
  assert.deepEqual(roblox.map((e) => e.key), ["keplar-studio-chat:id:111"]);
  assert.equal(roblox[0]!.device?.items, 2);
  assert.deepEqual(deviceSessions(st, "blender").map((e) => e.name), ["scene.blend"]);
  assert.deepEqual(deviceSessions(null, "roblox"), []);
  const throwing = { get length(): number { throw new Error("blocked"); }, key: () => null, getItem: () => null };
  assert.deepEqual(deviceSessions(throwing, "roblox"), []);

  const merged = mergeSessions(roblox, [
    { key: "keplar-studio-chat:id:111", name: "Obby", savedAt: 5000 },
    { key: "keplar-studio-chat:name:tycoon", name: "Tycoon", savedAt: 2000 },
    { key: "keplar-studio-chat:name:blender/x.blend", name: "x.blend", savedAt: 9000 },
  ], "roblox");
  assert.deepEqual(merged.map((e) => e.key), ["keplar-studio-chat:id:111", "keplar-studio-chat:name:tycoon"]);
  assert.equal(accountIsNewer(merged[0]), true);
  assert.equal(accountIsNewer(merged[1]), true, "account-only copies are newer than nothing on this device");
  assert.equal(accountIsNewer(mergeSessions(roblox, [{ key: "keplar-studio-chat:id:111", name: "Obby", savedAt: 1000 }], "roblox")[0]), false);
  assert.equal(envOfKey("keplar-studio-chat:name:blender/a.blend"), "blender");
  assert.equal(nameFromKey("keplar-studio-chat:id:42"), "Place 42");
});

test("sessions panel: New session is a.reset after a confirmation; a newer account copy is loaded through the hook's own restore", () => {
  const src = read("panels/SessionsPanel.tsx");
  assert.match(src, /a\.reset\(\)/);
  assert.match(src, /setConfirm\("new"\)/);
  assert.match(src, /writeSaved\(currentKey, remote\);[\s\S]*a\.setPlace\(null\);\s*a\.setPlace\(place\);/);
  assert.match(src, /clearSaved\(key\);[\s\S]*await deleteRemote\(key\);/);
  assert.match(src, /disabled=\{a\.running/);
});

test("settings and status screens: truthful disclosure, real gates, no paragraphs of filler", () => {
  const settings = read("panels/SettingsDialog.tsx");
  assert.match(settings, /label="Auto-approve safe changes"/);
  assert.match(settings, /onCheckedChange=\{a\.setAuto\}/);
  const screens = read("StatusScreens.tsx");
  for (const name of ["NotInDesktop", "SignedOut", "PlanRequired", "Connecting", "NotConnected", "BlenderNotRunning", "StatusError", "GenericError"]) {
    assert.match(screens, new RegExp(`export (function|const) ${name}\\b`), name);
  }
  assert.match(screens, /0\.1\.8 or newer/);
  assert.match(screens, /st === "unsupported" \? null/, "no Connect button where Studio is unsupported");
  const blenderCloud = read("panels/BlenderCloudPanel.tsx");
  assert.match(blenderCloud, /needs the Keplar desktop app 0\.1\.10 or newer/);
});

test("panel CSS uses design-system tokens only: no raw colours, blur, gradients, glow, or shadow-forcing class names", () => {
  const css = read("panels/panels.module.css");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /rgba?\(|hsla?\(/i);
  assert.doesNotMatch(css, /blur\(|gradient\(|backdrop-filter|text-shadow/i);
  assert.doesNotMatch(css, /var\(--f-mono\)/, "font.test.ts pins the files that use --f-mono; use --ks-font-mono");
  const classes = [...css.matchAll(/^\s*\.([A-Za-z][\w-]*)/gm)].map((m) => m[1]!);
  for (const c of classes) assert.doesNotMatch(c, /btn|button|cta|primary|secondary|ghost|pill|^tab|Chip/i, c);
});
