import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestBundleId } from "../src/components/create/mobile/bundle-id";

test("mobile: the bundle ID follows the app name and stays valid", () => {
  assert.equal(suggestBundleId("Mill Lane Bakehouse"), "com.milllanebakehouse.app");
  assert.equal(suggestBundleId("Café Ünïcode"), "com.cafeunicode.app");
  assert.equal(suggestBundleId("24/7 Gym"), "com.gym.app", "a segment never starts with a digit");
  assert.equal(suggestBundleId("!!!"), "");
});
