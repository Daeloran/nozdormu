import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "../../src/timeline.js";
import { stateAt, cuesBetween } from "../../src/engine.js";

// Phases : 0 prep [0,10) | 1 work [10,40) | 2 rest [40,55) | 3 work [55,85) | 4 rest [85,100)
//          5 work [100,130) | 6 rest [130,145) | 7 work [145,175) | 8 cooldown [175,235)
const NOMINAL = { prep: 10, work: 30, rest: 15, exercises: 2, sets: 2, cooldown: 60 };

// Phases : 0 prep [0,5) | 1 work [5,7) | 2 rest [7,8) | 3 work [8,10) | 4 cooldown [10,14)
const SHORT = { prep: 5, work: 2, rest: 1, exercises: 1, sets: 2, cooldown: 4 };

const DONE = (tl) => ({ index: tl.length, entry: null, remaining: 0, done: true });

function checkState(tl, elapsed, index, remaining) {
  const s = stateAt(tl, elapsed);
  assert.equal(s.index, index, `index à t=${elapsed}`);
  assert.deepEqual(s.entry, tl[index], `entry à t=${elapsed}`);
  assert.equal(s.remaining, remaining, `remaining à t=${elapsed}`);
  assert.equal(s.done, false, `done à t=${elapsed}`);
}

// Projection sur les champs spécifiés par l'issue.
const norm = (c) => (c.type === "end" ? { type: c.type, at: c.at } : { type: c.type, at: c.at, index: c.index });
const cd = (at, index) => ({ type: "countdown", at, index });
const ph = (at, index) => ({ type: "phase", at, index });
const end = (at) => ({ type: "end", at });

// Comparaison tolérante à l'ordre entre signaux de même instant (non spécifié par l'issue),
// mais exigeant un ordre chronologique.
function assertCues(actual, expected) {
  const a = actual.map(norm);
  for (let i = 1; i < a.length; i++) {
    assert.ok(a[i - 1].at <= a[i].at, `signaux non ordonnés : ${JSON.stringify(a)}`);
  }
  const key = (c) => `${c.at}|${c.type}|${c.index ?? ""}`;
  const sort = (l) => [...l].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  assert.deepEqual(sort(a), sort(expected));
}

// ---------- stateAt ----------

test("stateAt t = 0 : première phase, durée entière restante", () => {
  const tl = buildTimeline(NOMINAL);
  checkState(tl, 0, 0, 10);
});

test("stateAt frontières de phase : le début est inclus dans la nouvelle phase", () => {
  const tl = buildTimeline(NOMINAL);
  checkState(tl, 10, 1, 30);
  checkState(tl, 40, 2, 15);
  checkState(tl, 55, 3, 30);
  checkState(tl, 100, 5, 30);
  checkState(tl, 145, 7, 30);
  checkState(tl, 175, 8, 60);
});

test("stateAt juste avant une frontière : reste 1 s dans la phase précédente", () => {
  const tl = buildTimeline(NOMINAL);
  checkState(tl, 9, 0, 1);
  checkState(tl, 39, 1, 1);
  checkState(tl, 234, 8, 1);
});

test("stateAt valeurs décimales : remaining arrondi au supérieur", () => {
  const tl = buildTimeline(NOMINAL);
  checkState(tl, 0.4, 0, 10);
  checkState(tl, 9.5, 0, 1);
  checkState(tl, 9.999, 0, 1);
  checkState(tl, 10.2, 1, 30);
  checkState(tl, 39.999, 1, 1);
  checkState(tl, 54.5, 2, 1);
  checkState(tl, 234.5, 8, 1);
});

test("stateAt fin exacte : séance terminée", () => {
  const tl = buildTimeline(NOMINAL);
  assert.deepEqual(stateAt(tl, 235), DONE(tl));
});

test("stateAt au-delà de la fin : séance terminée", () => {
  const tl = buildTimeline(NOMINAL);
  assert.deepEqual(stateAt(tl, 235.01), DONE(tl));
  assert.deepEqual(stateAt(tl, 10000), DONE(tl));
});

test("stateAt sans dérive : calcul direct sur un temps écoulé quelconque", () => {
  const tl = buildTimeline(NOMINAL);
  // appel isolé sans aucun appel préalable : doit donner la même chose
  checkState(tl, 120.3, 5, 10);
  checkState(tl, 0, 0, 10);
  checkState(tl, 120.3, 5, 10);
});

test("stateAt séance finissant sur l'exercice (cooldown 0)", () => {
  const tl = buildTimeline({ prep: 10, work: 30, rest: 15, exercises: 1, sets: 2, cooldown: 0 });
  checkState(tl, 84.5, 3, 1);
  assert.deepEqual(stateAt(tl, 85), DONE(tl));
});

// ---------- cuesBetween ----------

test("cuesBetween décompte 3-2-1 sur une phase longue puis changement de phase", () => {
  const tl = buildTimeline(NOMINAL);
  assert.deepEqual(cuesBetween(tl, 10, 40).map(norm), [cd(37, 1), cd(38, 1), cd(39, 1), ph(40, 2)]);
});

test("cuesBetween décompte de la préparation, intervalle ]from, to]", () => {
  const tl = buildTimeline(NOMINAL);
  assert.deepEqual(cuesBetween(tl, 0, 9).map(norm), [cd(7, 0), cd(8, 0), cd(9, 0)]);
  // borne basse exclue
  assert.deepEqual(cuesBetween(tl, 7, 9).map(norm), [cd(8, 0), cd(9, 0)]);
  // borne haute incluse
  assert.deepEqual(cuesBetween(tl, 6, 7).map(norm), [cd(7, 0)]);
});

test("cuesBetween rien en milieu de phase", () => {
  const tl = buildTimeline(NOMINAL);
  assert.deepEqual(cuesBetween(tl, 11, 36), []);
  assert.deepEqual(cuesBetween(tl, 20, 20), []);
});

test("cuesBetween signal de phase au début de chaque phase sauf la première", () => {
  const tl = buildTimeline(NOMINAL);
  const phases = cuesBetween(tl, 0, 1000).map(norm).filter((c) => c.type === "phase");
  assert.deepEqual(phases, [ph(10, 1), ph(40, 2), ph(55, 3), ph(85, 4), ph(100, 5), ph(130, 6), ph(145, 7), ph(175, 8)]);
});

test("cuesBetween phase index 0 émise à t = 0 uniquement si from < 0", () => {
  const tl = buildTimeline(NOMINAL);
  assert.deepEqual(cuesBetween(tl, -1, 0).map(norm), [ph(0, 0)]);
  assert.deepEqual(cuesBetween(tl, -0.5, 1).map(norm), [ph(0, 0)]);
  const fromZero = cuesBetween(tl, 0, 1000).map(norm);
  assert.ok(!fromZero.some((c) => c.type === "phase" && c.index === 0));
});

test("cuesBetween signal de fin à la fin de la dernière phase", () => {
  const tl = buildTimeline(NOMINAL);
  assert.deepEqual(cuesBetween(tl, 230, 300).map(norm), [cd(232, 8), cd(233, 8), cd(234, 8), end(235)]);
  assert.deepEqual(cuesBetween(tl, 234, 235).map(norm), [end(235)]);
  assert.deepEqual(cuesBetween(tl, 235, 300), []);
  const all = cuesBetween(tl, -1, 1000).map(norm);
  assert.equal(all.filter((c) => c.type === "end").length, 1);
  assert.deepEqual(all.at(-1), end(235));
});

test("cuesBetween fin sur un exercice (cooldown 0) : pas de signal de phase après", () => {
  const tl = buildTimeline({ prep: 10, work: 30, rest: 15, exercises: 1, sets: 2, cooldown: 0 });
  assert.deepEqual(cuesBetween(tl, 80, 200).map(norm), [cd(82, 3), cd(83, 3), cd(84, 3), end(85)]);
});

test("cuesBetween phases de 2 s et 1 s : aucun décompte avant le début de la phase", () => {
  const tl = buildTimeline(SHORT);
  // work [5,7) : décompte à 5 et 6 seulement (7-3 = 4 tombe dans prep, pas de décompte index 1 à 4)
  const w = cuesBetween(tl, -1, 100).map(norm).filter((c) => c.type === "countdown" && c.index === 1);
  assert.deepEqual(w, [cd(5, 1), cd(6, 1)]);
  // rest [7,8) : un seul décompte à 7
  const r = cuesBetween(tl, -1, 100).map(norm).filter((c) => c.type === "countdown" && c.index === 2);
  assert.deepEqual(r, [cd(7, 2)]);
});

test("cuesBetween séquence complète d'une séance courte", () => {
  const tl = buildTimeline(SHORT);
  assertCues(cuesBetween(tl, -1, 100), [
    ph(0, 0),
    cd(2, 0), cd(3, 0), cd(4, 0),
    ph(5, 1), cd(5, 1), cd(6, 1),
    ph(7, 2), cd(7, 2),
    ph(8, 3), cd(8, 3), cd(9, 3),
    ph(10, 4), cd(11, 4), cd(12, 4), cd(13, 4),
    end(14),
  ]);
});

test("cuesBetween intervalles consécutifs : ni doublon ni trou", () => {
  for (const settings of [SHORT, NOMINAL]) {
    const tl = buildTimeline(settings);
    const full = cuesBetween(tl, -1, 1000).map(norm);
    for (const step of [0.1, 0.25, 0.37, 1, 3]) {
      const acc = [];
      let t = -1;
      while (t < 1000) {
        const next = Math.min(1000, t + step);
        acc.push(...cuesBetween(tl, t, next).map(norm));
        t = next;
      }
      assert.deepEqual(acc, full, `pas = ${step}`);
    }
    // chaque signal une seule fois
    const keys = full.map((c) => `${c.type}|${c.at}|${c.index ?? ""}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test("cuesBetween intervalle vide (from = to) ou après la fin : aucun signal", () => {
  const tl = buildTimeline(SHORT);
  assert.deepEqual(cuesBetween(tl, 5, 5), []);
  assert.deepEqual(cuesBetween(tl, 14, 50), []);
});
