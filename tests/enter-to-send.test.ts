import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyComposerBeforeInput,
  applyComposerInput,
  applyComposerKeyDown,
  stripInsertedBreak,
  type EnterDecision,
  type EnterKeyEvent,
  type EnterSendOpts,
} from "../src/lib/enter-to-send";

/** Every chat box on the site. Each one is wired to useEnterToSend and run through the same key cases. */
const COMPOSERS: { name: string; file: string; opts: EnterSendOpts }[] = [
  { name: "signed-out home", file: "src/components/app-ui/Composer.tsx", opts: { canSend: true } },
  { name: "signed-in home", file: "src/components/app-ui/Composer.tsx", opts: { canSend: true } },
  { name: "thread reply", file: "src/components/app-ui/Composer.tsx", opts: { canSend: true } },
  { name: "create mode", file: "src/components/app-ui/Composer.tsx", opts: { canSend: true } },
  { name: "study mode", file: "src/components/app-ui/Composer.tsx", opts: { canSend: true } },
  { name: "slides mode", file: "src/components/app-ui/Composer.tsx", opts: { canSend: true } },
  { name: "debate mode", file: "src/components/app-ui/Composer.tsx", opts: { canSend: true } },
  { name: "deep research", file: "src/components/app-ui/Composer.tsx", opts: { canSend: true } },
  { name: "create prompt", file: "src/components/create/apps/PromptField.tsx", opts: { canSend: true } },
  { name: "image studio", file: "src/components/create/ImageStudio.tsx", opts: { canSend: true } },
  { name: "video studio", file: "src/components/create/video/VideoStudio.tsx", opts: { canSend: true } },
  { name: "site builder", file: "src/components/create/SiteBuilder.tsx", opts: { canSend: true } },
  { name: "study ask", file: "src/components/study/StudyMode.tsx", opts: { canSend: true } },
  { name: "studio request", file: "src/components/app-ui/studio-mode/workspace/Composer.tsx", opts: { canSend: true } },
  { name: "embed ask", file: "src/components/embed/EmbedAsk.tsx", opts: { canSend: true } },
  { name: "marketing try", file: "src/components/growth/TryBox.tsx", opts: { canSend: true } },
  { name: "marketing build", file: "src/components/growth/BuildBox.tsx", opts: { canSend: true } },
  { name: "business home", file: "src/components/business-app/Home.tsx", opts: { canSend: true } },
  { name: "business reply", file: "src/components/business-app/Ask.tsx", opts: { canSend: true } },
];

function press(over: Partial<EnterKeyEvent> & { key?: string }, opts: EnterSendOpts) {
  let prevented = false;
  const pending: { decision: EnterDecision | null } = { decision: null };
  const decision = applyComposerKeyDown({
    key: over.key ?? "Enter",
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    repeat: false,
    preventDefault() { prevented = true; },
    ...over,
  }, opts, pending);
  return { decision, prevented, pending };
}

for (const composer of COMPOSERS) {
  test(`${composer.name}: Enter sends, Shift+Enter is a newline, IME does not send`, () => {
    assert.match(readFileSync(composer.file, "utf8"), /useEnterToSend/);

    const send = press({}, composer.opts);
    assert.equal(send.decision, "send");
    assert.equal(send.prevented, true);

    const shift = press({ shiftKey: true }, composer.opts);
    assert.equal(shift.decision, "newline");
    assert.equal(shift.prevented, false);

    const ime = press({ nativeEvent: { isComposing: true, keyCode: 229 } }, composer.opts);
    assert.equal(ime.decision, "newline");
    assert.equal(ime.prevented, false);

    const code = press({ nativeEvent: { isComposing: false, keyCode: 229 } }, composer.opts);
    assert.equal(code.decision, "newline");
    assert.equal(code.prevented, false);

    const empty = press({}, { ...composer.opts, canSend: false });
    assert.equal(empty.decision, "swallow");
    assert.equal(empty.prevented, true);

    const blank = press({ shiftKey: true }, { ...composer.opts, canSend: false });
    assert.equal(blank.decision, "newline");
    assert.equal(blank.prevented, false);
  });
}

test("an open slash or mode menu takes Enter for the highlighted item", () => {
  const menu = press({}, { canSend: true, menuOpen: true });
  assert.equal(menu.decision, "menu");
  assert.equal(menu.prevented, true);
  const shift = press({ shiftKey: true }, { canSend: true, menuOpen: true });
  assert.equal(shift.decision, "newline");
  const ime = press({ nativeEvent: { isComposing: true } }, { canSend: true, menuOpen: true });
  assert.equal(ime.decision, "newline");
});

test("Ctrl/⌘+Enter preference keeps plain Enter as a newline", () => {
  const plain = press({}, { canSend: true, sendKey: "mod-enter" });
  assert.equal(plain.decision, "newline");
  assert.equal(plain.prevented, false);
  const mod = press({ metaKey: true }, { canSend: true, sendKey: "mod-enter" });
  assert.equal(mod.decision, "send");
  assert.equal(mod.prevented, true);
});

test("a phone line break that skips keydown is removed and sent", () => {
  const el = { value: "hello\n", selectionStart: 6, selectionEnd: 6 };
  let sent = 0;
  const pending: { decision: EnterDecision | null } = { decision: null };
  let stopped = false;
  applyComposerInput(el, { inputType: "insertLineBreak", isComposing: false, stopPropagation: () => { stopped = true; } }, pending, () => { sent++; });
  assert.equal(el.value, "hello");
  assert.equal(sent, 1);
  assert.equal(stopped, true);

  const empty = { value: "\n", selectionStart: 1 };
  let emptySends = 0;
  applyComposerInput(empty, { inputType: "insertLineBreak" }, { decision: null }, () => { emptySends++; });
  assert.equal(empty.value, "");
  assert.equal(emptySends, 0);

  const shifted = { value: "hello\n", selectionStart: 6 };
  let shiftSends = 0;
  applyComposerInput(shifted, { inputType: "insertLineBreak" }, { decision: "newline" }, () => { shiftSends++; });
  assert.equal(shifted.value, "hello\n");
  assert.equal(shiftSends, 0);
});

test("beforeinput cancels a line break unless it is a newline or an IME commit", () => {
  let prevented = 0;
  const block = { inputType: "insertLineBreak", cancelable: true, preventDefault: () => { prevented++; } };
  applyComposerBeforeInput(block, { decision: "send" });
  applyComposerBeforeInput(block, { decision: null });
  applyComposerBeforeInput({ ...block, isComposing: true }, { decision: null });
  applyComposerBeforeInput(block, { decision: "newline" });
  applyComposerBeforeInput({ inputType: "insertText", cancelable: true, preventDefault: () => { prevented++; } }, { decision: "send" });
  assert.equal(prevented, 2);
  assert.deepEqual(stripInsertedBreak("a\r\nb", 3), { value: "ab", caret: 1 });
});
