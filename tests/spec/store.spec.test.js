import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../../src/store.js";

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function corruptStorage() {
  return {
    getItem: () => "{pas du json",
    setItem: () => {},
    removeItem: () => {},
  };
}

const S1 = { prep: 10, work: 30, rest: 15, exercises: 2, sets: 2, cooldown: 60 };
const S2 = { prep: 0, work: 20, rest: 10, exercises: 8, sets: 1, cooldown: 0 };
const S3 = { prep: 5, work: 45, rest: 15, exercises: 3, sets: 4, cooldown: 120 };

// ---------- derniers réglages ----------

test("getLastSettings renvoie null si rien n'est stocké", () => {
  assert.equal(createStore(memoryStorage()).getLastSettings(), null);
});

test("setLastSettings puis getLastSettings", () => {
  const store = createStore(memoryStorage());
  store.setLastSettings(S1);
  assert.deepEqual(store.getLastSettings(), S1);
  store.setLastSettings(S2);
  assert.deepEqual(store.getLastSettings(), S2);
});

test("derniers réglages persistés dans le storage (relus par un nouveau store)", () => {
  const storage = memoryStorage();
  createStore(storage).setLastSettings(S3);
  assert.deepEqual(createStore(storage).getLastSettings(), S3);
});

// ---------- préréglages ----------

test("listPresets vide au départ", () => {
  assert.deepEqual(createStore(memoryStorage()).listPresets(), []);
});

test("savePreset puis listPresets triés par nom", () => {
  const store = createStore(memoryStorage());
  store.savePreset("Tabata", S1);
  store.savePreset("Abdos", S2);
  store.savePreset("Gainage", S3);
  assert.deepEqual(store.listPresets(), [
    { name: "Abdos", settings: S2 },
    { name: "Gainage", settings: S3 },
    { name: "Tabata", settings: S1 },
  ]);
});

test("savePreset écrase un préréglage de même nom", () => {
  const store = createStore(memoryStorage());
  store.savePreset("Tabata", S1);
  store.savePreset("Abdos", S2);
  store.savePreset("Tabata", S3);
  assert.deepEqual(store.listPresets(), [
    { name: "Abdos", settings: S2 },
    { name: "Tabata", settings: S3 },
  ]);
});

test("deletePreset supprime le préréglage", () => {
  const store = createStore(memoryStorage());
  store.savePreset("Tabata", S1);
  store.savePreset("Abdos", S2);
  store.deletePreset("Tabata");
  assert.deepEqual(store.listPresets(), [{ name: "Abdos", settings: S2 }]);
  store.deletePreset("Abdos");
  assert.deepEqual(store.listPresets(), []);
});

test("préréglages persistés dans le storage (relus par un nouveau store)", () => {
  const storage = memoryStorage();
  const a = createStore(storage);
  a.savePreset("Tabata", S1);
  a.savePreset("Abdos", S2);
  a.deletePreset("Abdos");
  assert.deepEqual(createStore(storage).listPresets(), [{ name: "Tabata", settings: S1 }]);
});

// ---------- historique ----------

test("listHistory vide au départ", () => {
  assert.deepEqual(createStore(memoryStorage()).listHistory(), []);
});

test("listHistory du plus récent au plus ancien selon date", () => {
  const store = createStore(memoryStorage());
  const h1 = { date: "2026-10-01T08:00:00.000Z", preset: "Tabata", settings: S1, elapsed: 235, completed: true };
  const h3 = { date: "2026-10-03T18:30:00.000Z", preset: null, settings: S2, elapsed: 42.5, completed: false };
  const h2 = { date: "2026-10-02T12:15:00.000Z", preset: "Gainage", settings: S3, elapsed: 600, completed: true };
  store.addHistory(h1);
  store.addHistory(h3);
  store.addHistory(h2);
  assert.deepEqual(store.listHistory(), [h3, h2, h1]);
});

test("historique persisté dans le storage (relu par un nouveau store)", () => {
  const storage = memoryStorage();
  const h = { date: "2026-10-05T07:00:00.000Z", preset: null, settings: S1, elapsed: 100, completed: false };
  createStore(storage).addHistory(h);
  assert.deepEqual(createStore(storage).listHistory(), [h]);
});

// ---------- données corrompues ----------

test("JSON corrompu sur toutes les clés : pas de plantage, valeurs vides", () => {
  let store;
  assert.doesNotThrow(() => {
    store = createStore(corruptStorage());
  });
  assert.equal(store.getLastSettings(), null);
  assert.deepEqual(store.listPresets(), []);
  assert.deepEqual(store.listHistory(), []);
});

test("JSON corrompu : les écritures ne plantent pas", () => {
  const store = createStore(corruptStorage());
  assert.doesNotThrow(() => store.setLastSettings(S1));
  assert.doesNotThrow(() => store.savePreset("Tabata", S1));
  assert.doesNotThrow(() => store.deletePreset("Tabata"));
  assert.doesNotThrow(() =>
    store.addHistory({ date: "2026-10-01T08:00:00.000Z", preset: null, settings: S1, elapsed: 10, completed: false }),
  );
});

test("données valides corrompues après coup : traitées comme vides, puis réécriture possible", () => {
  const storage = memoryStorage();
  const a = createStore(storage);
  a.setLastSettings(S1);
  a.savePreset("Tabata", S1);
  a.addHistory({ date: "2026-10-01T08:00:00.000Z", preset: "Tabata", settings: S1, elapsed: 235, completed: true });
  assert.ok(storage.map.size > 0);
  for (const k of [...storage.map.keys()]) storage.map.set(k, "{pas du json");

  const b = createStore(storage);
  assert.equal(b.getLastSettings(), null);
  assert.deepEqual(b.listPresets(), []);
  assert.deepEqual(b.listHistory(), []);

  b.savePreset("Abdos", S2);
  b.setLastSettings(S2);
  assert.deepEqual(b.listPresets(), [{ name: "Abdos", settings: S2 }]);
  assert.deepEqual(b.getLastSettings(), S2);
});
