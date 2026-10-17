import { test } from "node:test";
import assert from "node:assert/strict";
import { skyProfile } from "@/lib/sky/profile";
import {
  altitudeFromScroll,
  effectivePrecip,
  fallMultiplier,
  meadowKind,
  precipFromVariant,
  profileForChoice,
  readPrecipChoice,
} from "@/lib/sky/journey";

test("scroll maps the top of the page to high altitude and the bottom to the ground", () => {
  assert.equal(altitudeFromScroll(0, 4000, 900), 0);
  assert.equal(altitudeFromScroll(3100, 4000, 900), 1);
  assert.equal(altitudeFromScroll(1550, 4000, 900), 0.5);
  assert.equal(altitudeFromScroll(-20, 4000, 900), 0);
  assert.equal(altitudeFromScroll(99999, 4000, 900), 1);
  assert.equal(altitudeFromScroll(10, 100, 800), 1);
});

test("weather mode follows live weather until the visitor picks, then the pick wins", () => {
  assert.equal(precipFromVariant("snow"), "snow");
  assert.equal(precipFromVariant("rain"), "rain");
  assert.equal(precipFromVariant("drizzle"), "rain");
  assert.equal(precipFromVariant("thunderstorm"), "rain");
  assert.equal(precipFromVariant("partly-cloudy"), "none");
  assert.equal(precipFromVariant("clear"), "none");
  assert.equal(effectivePrecip("snow", null), "snow");
  assert.equal(effectivePrecip("rain", "none"), "none");
  assert.equal(effectivePrecip("clear", "snow"), "snow");
  const mem = { getItem: (k: string) => (k === "keplar-weather-v1" ? "rain" : null) };
  assert.equal(readPrecipChoice(mem), "rain");
  assert.equal(readPrecipChoice({ getItem: () => "hail" }), null);
  assert.equal(readPrecipChoice(null), null);
});

test("an explicit weather pick replaces the live profile; no pick keeps it", () => {
  const live = skyProfile("fog");
  assert.equal(profileForChoice(live, "fog", null), live);
  const clear = profileForChoice(live, "fog", "none");
  assert.equal(clear.precip, "none");
  assert.equal(clear.precipAmount, 0);
  assert.equal(profileForChoice(live, "fog", "rain").precip, "rain");
  assert.equal(profileForChoice(live, "fog", "snow").precip, "snow");
  assert.equal(meadowKind("none", false), "day");
  assert.equal(meadowKind("none", true), "night");
  assert.equal(meadowKind("rain", false), "rain");
  assert.equal(meadowKind("snow", true), "snow");
});

test("precipitation falls faster while scrolling and eases back to 1 when the page is still", () => {
  assert.equal(fallMultiplier(0), 1);
  assert.ok(fallMultiplier(900) > fallMultiplier(200));
  assert.equal(fallMultiplier(9000), 4);
  assert.equal(fallMultiplier(Number.NaN), 1);
});
