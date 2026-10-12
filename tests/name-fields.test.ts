import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Names are proper nouns ("Keplar Extension", "Acme Studio", a first name): the browser's spell checker underlines them in
// red while people type, so name fields turn it off. Titles, tasks and messages keep it (a typo there is worth flagging).
const NAME_FIELDS: Array<[string, RegExp]> = [
  ["src/components/account/ApiKeysPanel.tsx", /<input spellCheck=\{false\} id="key-name"/],
  ["src/components/account/EmbedPanel.tsx", /<input spellCheck=\{false\} id="emb-name"/],
  ["src/components/account/PasskeySettings.tsx", /<input spellCheck=\{false\} id="pk-new-name"/],
  ["src/components/account/TeamPanel.tsx", /<input spellCheck=\{false\} id="team-name"/],
  ["src/components/app-ui/workspace/WorkspaceTurn.tsx", /<input spellCheck=\{false\} id="crm-name"/],
  ["src/components/app-ui/workspace/WorkspaceTurn.tsx", /<input spellCheck=\{false\} id=\{`pj-\$\{m\.id\}`\}/],
  ["src/components/business-app/Projects.tsx", /<input spellCheck=\{false\} id="new-project"/],
  ["src/components/create/SiteBuilder.tsx", /<span>Site name<\/span><input spellCheck=\{false\} className=\{w\.input\}/],
  ["src/components/create/SiteBuilder.tsx", /<span>Site name<\/span><input spellCheck=\{false\} className=\{s\.input\}/],
  ["src/components/onboarding/Onboarding.tsx", /<input spellCheck=\{false\} id="ob-name"/],
  ["src/components/templates/RemixPanel.tsx", /<input spellCheck=\{false\} className=\{s\.input\} value=\{name\}/],
];

test("name fields don't spell-check proper names", () => {
  for (const [file, re] of NAME_FIELDS) assert.match(readFileSync(file, "utf8"), re, file);
});

test("the chat composer still spell-checks", () => {
  assert.doesNotMatch(readFileSync("src/components/app-ui/Composer.tsx", "utf8"), /spellCheck=\{false\}/);
});
