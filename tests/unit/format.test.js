import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, parseDuration } from "../../src/format.js";

test("formatDuration", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(5), "0:05");
  assert.equal(formatDuration(75), "1:15");
  assert.equal(formatDuration(3600), "60:00");
  assert.equal(formatDuration(42.5), "0:43");
  assert.equal(formatDuration(-3), "0:00");
});

test("parseDuration accepte secondes et m:ss", () => {
  assert.equal(parseDuration("90"), 90);
  assert.equal(parseDuration(" 1:30 "), 90);
  assert.equal(parseDuration("0:05"), 5);
  assert.equal(parseDuration("2:5"), 125);
  assert.equal(parseDuration("0"), 0);
});

test("parseDuration refuse les saisies illisibles", () => {
  for (const bad of ["", "abc", "1:60", "-5", "1.5", "1:2:3", ":30"]) {
    assert.equal(parseDuration(bad), null, bad);
  }
});
