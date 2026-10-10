import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useVoice } from "../src/components/app-ui/useVoice";
import { VoiceTalk } from "../src/components/app-ui/VoiceTalk";

// Regression: the Voice and Talk buttons used to be added by an effect after the first paint, which shoved the rest of the composer's
// tool row ~190px sideways on every /app load (a layout shift). The Ask app is client-only, so support is known on the first render.
function Probe() {
  const voice = useVoice({ getText: () => "", setText: () => {} });
  return createElement("div", { "data-voice": String(voice.supported) }, createElement(VoiceTalk, { voice, className: "t", labelClass: "l", onNote: () => {}, onAsk: () => {} }));
}

test("the first render already includes the voice buttons when the browser supports speech", () => {
  const g = globalThis as unknown as { window?: unknown };
  const before = g.window;
  g.window = { SpeechRecognition: class {}, speechSynthesis: {}, SpeechSynthesisUtterance: class {} };
  try {
    const html = renderToStaticMarkup(createElement(Probe));
    assert.match(html, /data-voice="true"/);
    assert.match(html, /data-talk/);
  } finally {
    if (before === undefined) delete g.window;
    else g.window = before;
  }
});

test("with no window (server render) nothing is drawn", () => {
  const html = renderToStaticMarkup(createElement(Probe));
  assert.match(html, /data-voice="false"/);
  assert.doesNotMatch(html, /data-talk/);
});
