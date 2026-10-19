import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "../../src/timeline.js";
import { stateAt, cuesBetween } from "../../src/engine.js";
import { createStore } from "../../src/store.js";

const S = { prep: 5, work: 2, rest: 1, exercises: 1, sets: 2, cooldown: 4 };

test("buildTimeline refuse les valeurs non numériques ou absentes", () => {
  assert.throws(() => buildTimeline({ ...S, work: "30" }), RangeError);
  assert.throws(() => buildTimeline({ ...S, rest: undefined }), RangeError);
  assert.throws(() => buildTimeline({ ...S, sets: NaN }), RangeError);
});

test("stateAt avant le départ : première phase, remaining borné à sa durée", () => {
  const s = stateAt(buildTimeline(S), -2);
  assert.equal(s.index, 0);
  assert.equal(s.remaining, 5);
});

test("timeline vide : terminée d'emblée, aucun signal", () => {
  assert.deepEqual(stateAt([], 0), { index: 0, entry: null, remaining: 0, done: true });
  assert.deepEqual(cuesBetween([], -1, 10), []);
});

test("countdown et phase au même instant : phase d'abord", () => {
  const cues = cuesBetween(buildTimeline(S), 6.5, 7);
  assert.deepEqual(cues.map((c) => c.type), ["phase", "countdown"]);
});

function memory() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
}

test("store : JSON valide mais de mauvais type traité comme vide", () => {
  const storage = memory();
  for (const k of ["nozdormu.lastSettings", "nozdormu.presets", "nozdormu.history"]) storage.setItem(k, '"texte"');
  const store = createStore(storage);
  assert.equal(store.getLastSettings(), null);
  assert.deepEqual(store.listPresets(), []);
  assert.deepEqual(store.listHistory(), []);
});

test("store : stockage qui lève une exception (navigation privée)", () => {
  const throwing = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() {} };
  const store = createStore(throwing);
  assert.equal(store.getLastSettings(), null);
  assert.doesNotThrow(() => store.savePreset("A", S));
});

test("store : tri des préréglages insensible à la casse et aux accents", () => {
  const store = createStore(memory());
  for (const name of ["zumba", "Épaules", "abdos", "Dos"]) store.savePreset(name, S);
  assert.deepEqual(store.listPresets().map((p) => p.name), ["abdos", "Dos", "Épaules", "zumba"]);
});
