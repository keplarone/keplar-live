import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The app's CSP connect-src does not allow data: URLs, so fetch(dataUrl) is refused in production and Studio screenshots
// would go to the model unscaled (and cost more). Screenshots must be decoded in the page instead.
test("Studio screenshots are scaled without fetch(data:), which the app CSP blocks", () => {
  const src = readFileSync("src/components/app-ui/studio-mode/references.ts", "utf8");
  const body = src.slice(src.indexOf("export async function scaleDataUrl"));
  assert.ok(body.length > 0, "scaleDataUrl exists");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\bfetch\s*\(/, "no fetch() call in references.ts");
  assert.match(body, /createImageBitmap\(dataUrlBlob\(dataUrl\)\)/, "decodes the data URL in the page");
});
