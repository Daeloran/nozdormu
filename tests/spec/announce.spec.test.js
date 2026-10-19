import { test } from "node:test";
import assert from "node:assert/strict";
import { announcement } from "../../src/announce.js";

const SETTINGS = { prep: 10, work: 30, rest: 15, exercises: 4, sets: 3, cooldown: 60 };

test("prep → « Préparation »", () => {
  assert.equal(announcement({ phase: "prep", duration: 10, set: null, exercise: null }, SETTINGS), "Préparation");
});

test("work → « Exercice {e} sur {N}, série {s} sur {M} »", () => {
  assert.equal(
    announcement({ phase: "work", duration: 30, set: 2, exercise: 3 }, SETTINGS),
    "Exercice 3 sur 4, série 2 sur 3",
  );
  assert.equal(
    announcement({ phase: "work", duration: 30, set: 1, exercise: 1 }, SETTINGS),
    "Exercice 1 sur 4, série 1 sur 3",
  );
  assert.equal(
    announcement({ phase: "work", duration: 30, set: 1, exercise: 1 }, { ...SETTINGS, exercises: 1, sets: 1 }),
    "Exercice 1 sur 1, série 1 sur 1",
  );
});

test("rest → « Repos »", () => {
  assert.equal(announcement({ phase: "rest", duration: 15, set: 1, exercise: 2 }, SETTINGS), "Repos");
});

test("cooldown → « Récupération »", () => {
  assert.equal(announcement({ phase: "cooldown", duration: 60, set: null, exercise: null }, SETTINGS), "Récupération");
});

test("entry null → « Séance terminée »", () => {
  assert.equal(announcement(null, SETTINGS), "Séance terminée");
});
