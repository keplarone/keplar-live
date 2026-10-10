import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createPresence, exitFallbackMs, isMounted, phaseFor, presenceStep, EXIT_FALLBACK_MS, type PresencePhase } from "@/lib/ui/presence";

const read = (p: string) => readFileSync(p, "utf8");
const css = read("src/styles/motion.css");

/** Fake timers: run() fires whatever is due at `now`. */
function clock() {
  let now = 0;
  let seq = 0;
  const q = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: { set: (fn: () => void, ms: number) => { const id = ++seq; q.set(id, { at: now + ms, fn }); return id; }, clear: (id: unknown) => { q.delete(id as number); } },
    advance(ms: number) { now += ms; for (const [id, t] of [...q]) if (t.at <= now) { q.delete(id); t.fn(); } },
    pending: () => q.size,
  };
}

test("motion tokens: three durations, enter / exit / spring easings, distances, pop scale and press scale", () => {
  for (const [k, v] of [["--m-dur-1", "120ms"], ["--m-dur-2", "180ms"], ["--m-dur-3", "240ms"], ["--m-scale-in", "0.96"], ["--m-press", "0.98"], ["--m-loading-delay", "150ms"]]) {
    assert.match(css, new RegExp(`${k}: ${v};`), k);
  }
  for (const k of ["--m-ease-out", "--m-ease-in", "--m-ease-spring", "--m-dist-1", "--m-dist-2", "--m-dist-3"]) assert.match(css, new RegExp(`${k}: `), k);
  assert.match(read("src/styles/globals.css"), /@import "\.\/motion\.css";/, "loaded sitewide");
});

test("reduced motion: tokens collapse (no distance, no scale, no press, instant exits) and view transitions are instant", () => {
  const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 3, "reduced-motion blocks for tokens, overlays and pages");
  const tokens = blocks.find((b) => b.includes(":root"))!;
  assert.ok(tokens, "a :root token override");
  for (const k of ["--m-dist-1", "--m-dist-2", "--m-dist-3"]) assert.match(tokens, new RegExp(`${k}: 0px;`), k);
  assert.match(tokens, /--m-scale-in: 1;/);
  assert.match(tokens, /--m-press: 1;/);
  assert.match(tokens, /--m-dur-1: 1ms;/, "exits collapse to instant");
  assert.ok(blocks.some((b) => /\[data-motion\]\[data-state="closed"\] \{ animation: none; \}/.test(b)), "no exit animation at all");
  assert.ok(blocks.some((b) => /::view-transition-new\(\*\)[\s\S]*animation-duration: 0s !important/.test(b)), "page transitions are instant");
  assert.equal(exitFallbackMs(true), 0, "the hook does not wait for an exit under reduced motion");
  assert.equal(exitFallbackMs(false), EXIT_FALLBACK_MS);
});

test("motion css animates only opacity and transforms, never gradients", () => {
  for (const m of css.matchAll(/@keyframes ([\w-]+) \{([^\n]*)\}/g)) {
    const props = [...m[2].matchAll(/([a-z-]+):/g)].map((x) => x[1]);
    for (const p of props) assert.ok(["opacity", "scale", "translate", "rotate", "transform"].includes(p), `${m[1]} animates ${p}`);
  }
  assert.doesNotMatch(css, /gradient\(/);
  assert.doesNotMatch(css, /background-position/);
  // Hover never grows anything: no scale above 1 anywhere in the system.
  assert.doesNotMatch(css, /scale\(1\.\d|scale: 1\.\d/);
});

test("presence: exit keeps the overlay mounted until its own animation ends", () => {
  const c = clock();
  const seen: PresencePhase[] = [];
  const p = createPresence({ open: true, reduced: false, timers: c.timers, onChange: (x) => seen.push(x) });
  assert.equal(p.mounted, true);
  p.animationEnd("panel", "panel"); // the ENTER animation ending changes nothing
  assert.equal(p.phase, "open");
  p.close();
  assert.equal(p.phase, "closing");
  assert.equal(p.mounted, true, "still on screen while it animates out");
  p.animationEnd("child-row", "panel"); // a child's animation bubbling up does not end the overlay's exit
  assert.equal(p.mounted, true);
  p.animationEnd("panel", "panel");
  assert.equal(p.mounted, false, "unmounted at the end of the exit animation");
  assert.deepEqual(seen, ["closing", "closed"]);
  assert.equal(c.pending(), 0, "fallback timer cleared");
});

test("presence: the fallback timeout unmounts when no animationend ever arrives (nothing gets stuck open)", () => {
  const c = clock();
  const p = createPresence({ open: true, reduced: false, timers: c.timers });
  p.close();
  c.advance(EXIT_FALLBACK_MS - 1);
  assert.equal(p.mounted, true);
  c.advance(1);
  assert.equal(p.mounted, false);
  assert.ok(EXIT_FALLBACK_MS > 180 && EXIT_FALLBACK_MS < 400, "longer than the slowest exit token, short enough to never feel stuck");
});

test("presence: reopening during the exit cancels the unmount; reduced motion unmounts at once", () => {
  const c = clock();
  const p = createPresence({ open: true, reduced: false, timers: c.timers });
  p.close();
  p.open();
  c.advance(EXIT_FALLBACK_MS * 2);
  assert.equal(p.phase, "open");
  const r = createPresence({ open: true, reduced: true, timers: c.timers });
  r.close();
  assert.equal(r.mounted, false);
});

test("presence: render-time phase (usePresence mounts in the same render `open` turns true, so focus effects find the element)", () => {
  assert.equal(phaseFor("closed", true), "open");
  assert.equal(phaseFor("closing", true), "open");
  assert.equal(phaseFor("open", false), "closing");
  assert.equal(phaseFor("closing", false), "closing");
  assert.equal(phaseFor("closed", false), "closed");
  assert.equal(presenceStep("open", "timeout"), "open");
  assert.ok(isMounted("closing") && !isMounted("closed"));
});

test("hooks: usePresence / useExit wait for the element's own animationend with a fallback timeout", () => {
  const hook = read("src/components/motion/usePresence.ts");
  assert.match(hook, /e\.target === e\.currentTarget/);
  assert.equal((hook.match(/window\.setTimeout\(/g) ?? []).length, 2, "both hooks arm a fallback timer");
  assert.match(hook, /exitFallbackMs\(/);
  assert.match(hook, /export function Presence/);
});

test("overlays use the shared exit pattern at the source", () => {
  const uses: [string, RegExp][] = [
    ["src/components/nav/CommandPalette.tsx", /usePresence\(open\)[\s\S]*presence\.motion\("fade"\)[\s\S]*presence\.motion\("pop", false\)/],
    ["src/components/chrome/Nav.tsx", /usePresence\(open\)[\s\S]*panel\.motion\("drop"\)/],
    ["src/components/app-ui/AccountMenu.tsx", /menu\.motion\("pop"\)/],
    ["src/components/app-ui/SearchDialog.tsx", /useExit\(onClose, \{ parent: presence \}\)/],
    // The app shell: Cmd+K search closes from outside too, the undo toast sinks out, the drawer scrim fades out.
    ["src/components/app-ui/KeplarApp.tsx", /usePresence\(searchOpen\)[\s\S]*usePresence\(drawerOpen\)[\s\S]*drawerScrim\.motion\("fade"\)[\s\S]*<Presence value=\{del\.toast\}>[\s\S]*motion=\{p\.motion\("toast"\)\}[\s\S]*presence=\{search\}/],
    // Composer: attach, Modes and routing pop out of their buttons (usePopupOrigin) and close with an exit.
    ["src/components/app-ui/Composer.tsx", /usePresence\(attachOpen\)[\s\S]*usePresence\(moreOpen && overflow\.length > 0\)[\s\S]*usePresence\(routingOpen\)[\s\S]*usePopupOrigin\(attachOpen, attachBtnRef, attachMenuRef\)[\s\S]*usePopupOrigin\(moreOpen, moreBtnRef, moreMenuRef\)/],
    ["src/components/create/advanced/InviteDialog.tsx", /useExit\(onClose\)[\s\S]*exit\.motion\("fade"\)[\s\S]*exit\.motion\("pop", false\)/],
    ["src/components/create/advanced/PublishGate.tsx", /useExit\(onClose\)[\s\S]*exit\.motion\("fade"\)[\s\S]*exit\.motion\("pop", false\)/],
    ["src/components/create/advanced/LiveStudio.tsx", /usePresence\(Boolean\(text\)\)[\s\S]*toastBox\.motion\("toast"\)/],
    ["src/components/app-ui/Lightbox.tsx", /useExit\(onClose\)/],
    ["src/components/app-ui/ShareAnswer.tsx", /usePresence\(view !== "closed"\)/],
    ["src/components/app-ui/ThreadBar.tsx", /usePresence\(help\)/],
    ["src/components/app-ui/parity/ShareChatDialog.tsx", /useExit\(onClose\)/],
    ["src/components/consent/CookieBanner.tsx", /usePresence\(open\)/],
    ["src/components/create/delete/DeleteSiteDialog.tsx", /<Presence value=\{toast\}>/],
    ["src/components/app-ui/delete/DeleteChat.tsx", /"data-motion": "toast"/],
  ];
  for (const [f, re] of uses) assert.match(read(f), re, f);
  // Native <dialog> animates both ways in CSS; overlays that have not opted in still get an enter.
  assert.match(css, /@starting-style/);
  assert.match(css, /display var\(--m-dur-1\) allow-discrete/);
  assert.match(css, /:where\(\[role="menu"\], \[role="dialog"\]/);
  assert.match(css, /\[data-motion\]\[data-state="closed"\] \{ pointer-events: none; \}/);
});

test("pages: View Transitions on route templates, full page loads and the /app tabs; delayed route loading states", () => {
  assert.match(css, /@view-transition \{ navigation: auto; \}/);
  for (const f of ["src/app/(marketing)/template.tsx", "src/app/(marketing)/docs/template.tsx", "src/app/app/template.tsx"]) assert.match(read(f), /<RouteTransition>/, f);
  assert.match(read("src/components/motion/RouteTransition.tsx"), /<ViewTransition enter="kp-route-in" exit="kp-route-out" default="none">/);
  // /app tabs: goView and back/forward switch inside a view transition; the latest request wins over a pending one.
  const app = read("src/components/app-ui/KeplarApp.tsx");
  assert.match(app, /withViewTransition\(applyView\)/);
  assert.match(app, /const goView = useCallback[\s\S]*?switchView\(view, projectFilter \?\? null\)/);
  assert.match(app, /if \(v\) switchView\(v\);/);
  assert.match(app, /role="log"[^>]*data-motion="stream"/);
  // Cmd+K in /app opens only the app's search (the site palette defers to a shell that owns search).
  assert.match(app, /data-own-search=""/);
  assert.match(read("src/components/nav/CommandPalette.tsx"), /if \(!open && document\.querySelector\("\[data-own-search\]"\)\) return;/);
  assert.match(read("src/lib/ui/view-transition.ts"), /typeof doc\.startViewTransition !== "function"/, "unsupported browsers just update");
  for (const f of ["src/app/(marketing)/docs/loading.tsx", "src/app/app/loading.tsx"]) assert.match(read(f), /RouteLoading|m-delayed/, f);
  // No loading boundary over the reveal-animated marketing pages: RevealRoot would touch their HTML before it hydrates.
  assert.ok(!existsSync("src/app/(marketing)/loading.tsx"));
  assert.match(css, /\.m-delayed \{ animation: m-fade-in var\(--m-dur-3\) var\(--m-ease-out\) var\(--m-loading-delay\) both; \}/);
  assert.match(css, /\.m-skeleton \{[\s\S]*?animation: m-pulse/);
});

test("composer and create: menus have no keystroke-driven motion; no gradient shimmer keyframes; Create tab bars slide", () => {
  const composer = read("src/components/app-ui/Composer.tsx");
  // Presence and origin hooks are keyed on the open flags only (typing re-renders the composer but never re-runs them).
  for (const m of composer.matchAll(/usePopupOrigin\(([^)]*)\)/g)) assert.doesNotMatch(m[1], /text/);
  for (const m of composer.matchAll(/usePresence\(([^)]*)\)/g)) assert.doesNotMatch(m[1], /text/);
  for (const f of ["src/components/app-ui/Composer.module.css", "src/components/create/apps/studio.module.css", "src/components/create/create.module.css", "src/components/create/workspace/ws.module.css"]) {
    assert.doesNotMatch(read(f), /@keyframes[^{]*\{[^}]*background-position/, f);
  }
  assert.doesNotMatch(read("src/components/app-ui/Composer.module.css"), /panelIn/, "composer menus use the shared pop");
  for (const f of ["src/components/create/CreateStudio.tsx", "src/components/create/advanced/LiveStudio.tsx", "src/components/developers/CodeTabs.tsx"]) {
    const src = read(f);
    assert.match(src, /useTabIndicator\(/, f);
    assert.match(src, /className="m-tab-indicator" aria-hidden="true"/, f);
  }
  assert.match(css, /--ti-inset/);
});
