import { test } from "node:test";
import assert from "node:assert/strict";
import { clipName } from "../../src/audio.js";

test("clipName retire accents et majuscules, espaces → tirets", () => {
  assert.equal(clipName("Séance terminée"), "seance-terminee");
  assert.equal(clipName("Récupération"), "recuperation");
  assert.equal(clipName("Repos"), "repos");
});
