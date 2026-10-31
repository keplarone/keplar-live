import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composerEnter } from "../src/lib/composer-keys";

const send = { canSend: true, sendKey: "enter" as const };

test("Enter sends, Shift+Enter is a newline, and Command/Ctrl+Enter also sends", () => {
  assert.equal(composerEnter({ key: "Enter" }, send), "send");
  assert.equal(composerEnter({ key: "Enter", shiftKey: true }, send), "newline");
  assert.equal(composerEnter({ key: "Enter", metaKey: true }, send), "send");
  assert.equal(composerEnter({ key: "Enter", ctrlKey: true }, send), "send");
  assert.equal(composerEnter({ key: "Enter", metaKey: true, shiftKey: true }, send), "send");
  assert.equal(composerEnter({ key: "a" }, send), "newline");
});

test("IME composition does not send (isComposing or keyCode 229)", () => {
  assert.equal(composerEnter({ key: "Enter", isComposing: true }, send), "newline");
  assert.equal(composerEnter({ key: "Enter", keyCode: 229 }, send), "newline");
  assert.equal(composerEnter({ key: "Enter", isComposing: true, keyCode: 229 }, send), "newline");
});

test("an empty message or a streaming reply does not send and does not insert a newline", () => {
  assert.equal(composerEnter({ key: "Enter" }, { canSend: false }), "swallow");
  assert.equal(composerEnter({ key: "Enter", shiftKey: true }, { canSend: false }), "newline");
});

test("the Ctrl/⌘+Enter preference keeps plain Enter as a newline", () => {
  const mod = { canSend: true, sendKey: "mod-enter" as const };
  assert.equal(composerEnter({ key: "Enter" }, mod), "newline");
  assert.equal(composerEnter({ key: "Enter", shiftKey: true }, mod), "newline");
  assert.equal(composerEnter({ key: "Enter", metaKey: true }, mod), "send");
  assert.equal(composerEnter({ key: "Enter", ctrlKey: true }, mod), "send");
  assert.equal(composerEnter({ key: "Enter", metaKey: true }, { canSend: false, sendKey: "mod-enter" }), "swallow");
});

test("composer focus is the container border, and the agree dot is not blue", () => {
  const graphite = readFileSync("src/styles/graphite.css", "utf8");
  const orbit = readFileSync("src/styles/orbit/app.css", "utf8");
  assert.match(graphite, /\[class\*="composer"\] textarea:focus-visible \{\s*outline: none !important;/);
  // Orbit (docs/design/keplar-orbit.md): the composer's edge turns accent with a soft accent halo while focused.
  assert.match(orbit, /form:is\(\[class\*="__composer"\], \[class\*="_composer__"\]\):focus-within \{\s*border-color: rgb\(var\(--o-accent-rgb\) \/ 0\.55\) !important;/);
  assert.match(graphite, /scale: var\(--ofx-ps, 0\.97\) !important;/);
  const turn = readFileSync("src/components/app-ui/KeplarTurn.module.css", "utf8");
  assert.match(turn, /\.agreeDot,\s*\.dissentDot \{[^}]*background: var\(--c-ink-2\)/);
  assert.doesNotMatch(turn, /\.agreeDot,\s*\.dissentDot \{[^}]*background: var\(--c-agree\)/);
});

test("chat composers share useEnterToSend", () => {
  for (const file of [
    "src/components/app-ui/Composer.tsx",
    "src/components/create/SiteBuilder.tsx",
    "src/components/create/apps/PromptField.tsx",
    "src/components/create/ImageStudio.tsx",
    "src/components/create/video/VideoStudio.tsx",
    "src/components/study/StudyMode.tsx",
    "src/components/app-ui/studio-mode/workspace/Composer.tsx",
    "src/components/embed/EmbedAsk.tsx",
    "src/components/growth/TryBox.tsx",
    "src/components/growth/BuildBox.tsx",
    "src/components/business-app/Home.tsx",
    "src/components/business-app/Ask.tsx",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /useEnterToSend/, file);
    assert.match(src, /enterKeyHint/, file);
  }
});
