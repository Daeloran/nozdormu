import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, totalDuration } from "../../src/timeline.js";

const NOMINAL = { prep: 10, work: 30, rest: 15, exercises: 2, sets: 2, cooldown: 60 };

const e = (phase, duration, set = null, exercise = null) => ({ phase, duration, set, exercise });

test("cas nominal 2 exos x 2 séries : séquence complète", () => {
  assert.deepEqual(buildTimeline(NOMINAL), [
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

test("entre deux séries c'est le repos normal, le dernier repos est remplacé par la récupération", () => {
  const tl = buildTimeline(NOMINAL);
  assert.equal(tl.filter((x) => x.phase === "rest").length, 3);
  assert.equal(tl.at(-1).phase, "cooldown");
  assert.equal(tl.at(-2).phase, "work");
});

test("phases à durée nulle omises (prep, rest, cooldown à 0)", () => {
  const tl = buildTimeline({ prep: 0, work: 20, rest: 0, exercises: 2, sets: 2, cooldown: 0 });
  assert.deepEqual(tl, [
    e("work", 20, 1, 1),
    e("work", 20, 1, 2),
    e("work", 20, 2, 1),
    e("work", 20, 2, 2),
  ]);
});

test("préparation à 0 seule : la séance commence par l'exercice", () => {
  const tl = buildTimeline({ ...NOMINAL, prep: 0 });
  assert.deepEqual(tl[0], e("work", 30, 1, 1));
  assert.equal(tl.length, 8);
});

test("1 exo x 1 série : prep, exercice, récupération (pas de repos)", () => {
  const tl = buildTimeline({ prep: 5, work: 30, rest: 10, exercises: 1, sets: 1, cooldown: 20 });
  assert.deepEqual(tl, [e("prep", 5), e("work", 30, 1, 1), e("cooldown", 20)]);
});

test("récupération à 0 : la séance finit sur l'exercice", () => {
  const tl = buildTimeline({ prep: 10, work: 30, rest: 15, exercises: 1, sets: 2, cooldown: 0 });
  assert.deepEqual(tl, [
    e("prep", 10),
    e("work", 30, 1, 1),
    e("rest", 15, 1, 1),
    e("work", 30, 2, 1),
  ]);
});

test("réglages invalides refusés par RangeError", async (t) => {
  const cases = {
    "prep négatif": { ...NOMINAL, prep: -1 },
    "rest négatif": { ...NOMINAL, rest: -5 },
    "cooldown négatif": { ...NOMINAL, cooldown: -1 },
    "work négatif": { ...NOMINAL, work: -30 },
    "work non entier": { ...NOMINAL, work: 1.5 },
    "prep non entier": { ...NOMINAL, prep: 2.5 },
    "rest non entier": { ...NOMINAL, rest: 0.5 },
    "work = 0": { ...NOMINAL, work: 0 },
    "sets = 0": { ...NOMINAL, sets: 0 },
    "exercises = 0": { ...NOMINAL, exercises: 0 },
    "sets non entier": { ...NOMINAL, sets: 1.5 },
    "exercises négatif": { ...NOMINAL, exercises: -2 },
  };
  for (const [name, settings] of Object.entries(cases)) {
    await t.test(name, () => {
      assert.throws(() => buildTimeline(settings), RangeError);
    });
  }
});

test("valeurs limites valides acceptées (work = 1, autres à 0, 1 exo, 1 série)", () => {
  assert.deepEqual(
    buildTimeline({ prep: 0, work: 1, rest: 0, exercises: 1, sets: 1, cooldown: 0 }),
    [e("work", 1, 1, 1)],
  );
});

test("totalDuration : somme des durées", () => {
  // 10 + 4*30 + 3*15 + 60
  assert.equal(totalDuration(buildTimeline(NOMINAL)), 235);
  assert.equal(totalDuration(buildTimeline({ prep: 0, work: 20, rest: 0, exercises: 2, sets: 2, cooldown: 0 })), 80);
  assert.equal(totalDuration(buildTimeline({ prep: 5, work: 30, rest: 10, exercises: 1, sets: 1, cooldown: 20 })), 55);
  assert.equal(totalDuration(buildTimeline({ prep: 10, work: 30, rest: 15, exercises: 1, sets: 2, cooldown: 0 })), 85);
});

test("totalDuration d'une timeline vide = 0", () => {
  assert.equal(totalDuration([]), 0);
});
