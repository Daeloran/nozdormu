import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, totalDuration } from "../../src/timeline.js";
import { announcement } from "../../src/announce.js";
import { createStore } from "../../src/store.js";

// Tests d'intention de l'issue #3 : repos entre séries (`setRest`).

const e = (phase, duration, set = null, exercise = null) => ({ phase, duration, set, exercise });

const BASE = { prep: 10, work: 30, rest: 15, exercises: 2, sets: 3, cooldown: 90 };
const WITH_SET_REST = { ...BASE, setRest: 60 };

// ---------- buildTimeline ----------

test("2 exos x 3 séries avec setRest : setRest à la fin des séries 1 et 2, à la place du repos normal", () => {
  assert.deepEqual(buildTimeline(WITH_SET_REST), [
    e("prep", 10),
    e("work", 30, 1, 1),
    e("rest", 15, 1, 1),
    e("work", 30, 1, 2),
    e("setRest", 60, 1, 2),
    e("work", 30, 2, 1),
    e("rest", 15, 2, 1),
    e("work", 30, 2, 2),
    e("setRest", 60, 2, 2),
    e("work", 30, 3, 1),
    e("rest", 15, 3, 1),
    e("work", 30, 3, 2),
    e("cooldown", 90),
  ]);
});

test("nombre de setRest = séries - 1, avec set/exercise du dernier exercice de la série", () => {
  const tl = buildTimeline({ ...WITH_SET_REST, exercises: 3, sets: 4 });
  const setRests = tl.filter((x) => x.phase === "setRest");
  assert.equal(setRests.length, 3);
  assert.deepEqual(
    setRests.map((x) => [x.set, x.exercise, x.duration]),
    [
      [1, 3, 60],
      [2, 3, 60],
      [3, 3, 60],
    ],
  );
  // chaque setRest suit immédiatement le dernier exercice de sa série
  for (const sr of setRests) {
    const i = tl.indexOf(sr);
    assert.deepEqual(tl[i - 1], e("work", 30, sr.set, 3));
    assert.deepEqual(tl[i + 1], e("work", 30, sr.set + 1, 1));
  }
  // aucun repos normal ne suit le dernier exercice d'une série
  assert.equal(tl.filter((x) => x.phase === "rest" && x.exercise === 3).length, 0);
});

test("pas de setRest après la dernière série : la séance finit par exercice puis récupération finale", () => {
  const tl = buildTimeline(WITH_SET_REST);
  assert.deepEqual(tl.at(-1), e("cooldown", 90));
  assert.deepEqual(tl.at(-2), e("work", 30, 3, 2));
  assert.equal(tl.filter((x) => x.phase === "cooldown").length, 1);
});

test("récupération finale à 0 avec setRest : la séance finit sur le dernier exercice, sans setRest", () => {
  const tl = buildTimeline({ ...WITH_SET_REST, cooldown: 0 });
  assert.deepEqual(tl.at(-1), e("work", 30, 3, 2));
  assert.equal(tl.filter((x) => x.phase === "setRest").length, 2);
});

test("setRest = 0 : les séries s'enchaînent directement, le repos normal reste dans la série", () => {
  assert.deepEqual(buildTimeline({ ...BASE, setRest: 0 }), [
    e("prep", 10),
    e("work", 30, 1, 1),
    e("rest", 15, 1, 1),
    e("work", 30, 1, 2),
    e("work", 30, 2, 1),
    e("rest", 15, 2, 1),
    e("work", 30, 2, 2),
    e("work", 30, 3, 1),
    e("rest", 15, 3, 1),
    e("work", 30, 3, 2),
    e("cooldown", 90),
  ]);
});

test("setRest absent : même déroulé (durées, séries, exercices) que setRest = rest", () => {
  const absent = buildTimeline(BASE);
  const explicit = buildTimeline({ ...BASE, setRest: BASE.rest });
  const timing = (tl) => tl.map((x) => [x.duration, x.set, x.exercise]);
  assert.deepEqual(timing(absent), timing(explicit));
  assert.equal(totalDuration(absent), totalDuration(explicit));
});

test("setRest absent : déroulé v1 inchangé (repos normal entre les séries)", () => {
  assert.deepEqual(buildTimeline({ prep: 10, work: 30, rest: 15, exercises: 2, sets: 2, cooldown: 60 }), [
    e("prep", 10),
    e("work", 30, 1, 1),
    e("rest", 15, 1, 1),
    e("work", 30, 1, 2),
    e("rest", 15, 1, 2),
    e("work", 30, 2, 1),
    e("rest", 15, 2, 1),
    e("work", 30, 2, 2),
    e("cooldown", 60),
  ]);
});

test("1 seule série : aucune phase setRest", () => {
  const tl = buildTimeline({ ...WITH_SET_REST, sets: 1 });
  assert.deepEqual(tl, [
    e("prep", 10),
    e("work", 30, 1, 1),
    e("rest", 15, 1, 1),
    e("work", 30, 1, 2),
    e("cooldown", 90),
  ]);
});

test("exercises = 1 : le repos normal disparaît entre les séries au profit de setRest", () => {
  assert.deepEqual(buildTimeline({ prep: 5, work: 40, rest: 15, exercises: 1, sets: 3, cooldown: 30, setRest: 45 }), [
    e("prep", 5),
    e("work", 40, 1, 1),
    e("setRest", 45, 1, 1),
    e("work", 40, 2, 1),
    e("setRest", 45, 2, 1),
    e("work", 40, 3, 1),
    e("cooldown", 30),
  ]);
});

test("totalDuration inclut les setRest", () => {
  // 10 + 6*30 + 3*15 + 2*60 + 90
  assert.equal(totalDuration(buildTimeline(WITH_SET_REST)), 445);
  // 5 + 3*40 + 2*45 + 30
  assert.equal(
    totalDuration(buildTimeline({ prep: 5, work: 40, rest: 15, exercises: 1, sets: 3, cooldown: 30, setRest: 45 })),
    245,
  );
  // setRest = 0 : 10 + 6*30 + 3*15 + 90
  assert.equal(totalDuration(buildTimeline({ ...BASE, setRest: 0 })), 325);
});

test("setRest invalide refusé par RangeError", async (t) => {
  const cases = {
    "setRest négatif": { ...BASE, setRest: -1 },
    "setRest très négatif": { ...BASE, setRest: -60 },
    "setRest non entier": { ...BASE, setRest: 1.5 },
    "setRest non entier < 1": { ...BASE, setRest: 0.5 },
  };
  for (const [name, settings] of Object.entries(cases)) {
    await t.test(name, () => {
      assert.throws(() => buildTimeline(settings), RangeError);
    });
  }
});

// ---------- announcement ----------

test("setRest → « Fin de la série {s} sur {M}, repos »", () => {
  const settings = { prep: 10, work: 30, rest: 15, exercises: 4, sets: 3, cooldown: 60, setRest: 90 };
  assert.equal(
    announcement({ phase: "setRest", duration: 90, set: 1, exercise: 4 }, settings),
    "Fin de la série 1 sur 3, repos",
  );
  assert.equal(
    announcement({ phase: "setRest", duration: 90, set: 2, exercise: 4 }, settings),
    "Fin de la série 2 sur 3, repos",
  );
  assert.equal(
    announcement({ phase: "setRest", duration: 90, set: 4, exercise: 1 }, { ...settings, sets: 5 }),
    "Fin de la série 4 sur 5, repos",
  );
});

// ---------- store ----------

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const V1_A = { prep: 10, work: 30, rest: 15, exercises: 2, sets: 2, cooldown: 60 };
const V1_B = { prep: 0, work: 20, rest: 10, exercises: 8, sets: 1, cooldown: 0 };

test("store : derniers réglages v1 (sans setRest) relus avec setRest = rest", () => {
  const storage = memoryStorage();
  createStore(storage).setLastSettings(V1_A);
  assert.deepEqual(createStore(storage).getLastSettings(), { ...V1_A, setRest: 15 });
});

test("store : préréglages v1 (sans setRest) relus avec setRest = rest", () => {
  const storage = memoryStorage();
  const a = createStore(storage);
  a.savePreset("Tabata", V1_A);
  a.savePreset("Abdos", V1_B);
  assert.deepEqual(createStore(storage).listPresets(), [
    { name: "Abdos", settings: { ...V1_B, setRest: 10 } },
    { name: "Tabata", settings: { ...V1_A, setRest: 15 } },
  ]);
});

test("store : un setRest présent est conservé tel quel (y compris 0)", () => {
  const storage = memoryStorage();
  const a = createStore(storage);
  const withLong = { ...V1_A, setRest: 90 };
  const withZero = { ...V1_B, setRest: 0 };
  a.setLastSettings(withZero);
  a.savePreset("Long", withLong);
  a.savePreset("Zero", withZero);

  const b = createStore(storage);
  assert.deepEqual(b.getLastSettings(), withZero);
  assert.deepEqual(b.listPresets(), [
    { name: "Long", settings: withLong },
    { name: "Zero", settings: withZero },
  ]);

  b.setLastSettings(withLong);
  assert.deepEqual(createStore(storage).getLastSettings(), withLong);
});
