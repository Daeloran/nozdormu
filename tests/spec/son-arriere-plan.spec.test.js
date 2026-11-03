import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildTimeline } from "../../src/timeline.js";
import * as engine from "../../src/engine.js";
import * as storeModule from "../../src/store.js";

// Tests d'intention de l'issue #7 : son en arrière-plan (plan des sons, interrupteur, session audio).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EPS = 1e-9;

// Une seule série : pas de phase « setRest » (libellé non spécifié par l'issue).
// Phases : prep [0,10) | work [10,40) | rest [40,55) | work [55,85) | rest [85,100) | work [100,130) | cooldown [130,190)
const NOMINAL = { prep: 10, work: 30, rest: 15, exercises: 3, sets: 1, setRest: 0, cooldown: 60 };

// Phases courtes (< 3 s) : prep [0,5) | work [5,7) | rest [7,8) | work [8,10) | cooldown [10,14)
const SHORT = { prep: 5, work: 2, rest: 1, exercises: 2, sets: 1, setRest: 0, cooldown: 4 };

// Sans préparation ni récupération : la séance commence par un exercice à t = 0.
// Phases : work [0,20) | rest [20,30) | work [30,50)
const NO_PREP = { prep: 0, work: 20, rest: 10, exercises: 2, sets: 1, setRest: 0, cooldown: 0 };

const LABELS = { prep: "Préparation", work: "Exercice", rest: "Repos", cooldown: "Récupération" };

function soundPlan(...args) {
  assert.equal(typeof engine.soundPlan, "function", "soundPlan doit être exporté par src/engine.js");
  return engine.soundPlan(...args);
}

function createStore(storage) {
  assert.equal(typeof storeModule.createStore, "function", "createStore doit être exporté par src/store.js");
  const store = storeModule.createStore(storage);
  assert.equal(typeof store.getBackgroundSound, "function", "store.getBackgroundSound absent");
  assert.equal(typeof store.setBackgroundSound, "function", "store.setBackgroundSound absent");
  return store;
}

// Plan attendu, calculé indépendamment à partir des durées des phases.
// Chaque son porte son instant de déclenchement (`trigger`) pour le filtrage par `from`.
function expectedPlan(settings, from) {
  const tl = buildTimeline(settings);
  const out = [];
  let t = 0;
  for (const entry of tl) {
    const label = LABELS[entry.phase];
    assert.ok(label, `phase inattendue dans la timeline de test : ${entry.phase}`);
    const start = t;
    const end = t + entry.duration;
    out.push({ trigger: start, at: start, sound: "long" });
    out.push({ trigger: start, at: start + 0.35, sound: "voice", text: label });
    for (const k of [3, 2, 1]) {
      const at = end - k;
      if (at > start) out.push({ trigger: at, at, sound: "short" });
    }
    t = end;
  }
  out.push({ trigger: t, at: t, sound: "end" });
  out.push({ trigger: t, at: t + 1.4, sound: "voice", text: "Séance terminée" });
  return out.filter((s) => s.trigger > from).map(({ trigger, ...s }) => s);
}

function totalDuration(settings) {
  return buildTimeline(settings).reduce((acc, e) => acc + e.duration, 0);
}

// Projection sur les champs spécifiés : at, sound, et text pour les voix.
const norm = (s) => (s.sound === "voice" ? { at: s.at, sound: s.sound, text: s.text } : { at: s.at, sound: s.sound });

function assertSorted(plan) {
  for (let i = 1; i < plan.length; i++) {
    assert.ok(plan[i - 1].at <= plan[i].at + EPS, `plan non trié par at : ${JSON.stringify(plan.map(norm))}`);
  }
}

// Compare deux plans (tolérance 1e-9 sur at), indépendamment de l'ordre entre sons de même instant.
function assertPlan(actual, expected) {
  assert.ok(Array.isArray(actual), "soundPlan doit renvoyer un tableau");
  assertSorted(actual);
  const key = (s) => [s.at, s.sound, s.text ?? ""];
  const cmp = (x, y) => {
    const a = key(x);
    const b = key(y);
    if (Math.abs(a[0] - b[0]) > EPS) return a[0] - b[0];
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
  };
  const A = actual.map(norm).sort(cmp);
  const E = expected.map(norm).sort(cmp);
  const dump = () => `\nobtenu  : ${JSON.stringify(A)}\nattendu : ${JSON.stringify(E)}`;
  assert.equal(A.length, E.length, `nombre de sons différent${dump()}`);
  for (let i = 0; i < E.length; i++) {
    assert.equal(A[i].sound, E[i].sound, `son #${i}${dump()}`);
    assert.ok(Math.abs(A[i].at - E[i].at) <= EPS, `instant du son #${i}${dump()}`);
    if (E[i].sound === "voice") assert.equal(A[i].text, E[i].text, `texte du son #${i}${dump()}`);
  }
}

const near = (a, b) => Math.abs(a - b) <= EPS;

// ---------- soundPlan : plan complet ----------

test("soundPlan depuis le début (from = -1) : plan complet de la séance nominale", () => {
  const tl = buildTimeline(NOMINAL);
  assertPlan(soundPlan(tl, NOMINAL, -1), expectedPlan(NOMINAL, -1));
});

test("soundPlan depuis le début : séance sans préparation (premier début de phase à t = 0 inclus)", () => {
  const tl = buildTimeline(NO_PREP);
  const plan = soundPlan(tl, NO_PREP, -1);
  assertPlan(plan, expectedPlan(NO_PREP, -1));
  assert.ok(plan.some((s) => s.sound === "long" && near(s.at, 0)), "bip long attendu à t = 0");
});

test("soundPlan : un bip long + une annonce par phase, au bon instant et avec le bon libellé", () => {
  const tl = buildTimeline(NOMINAL);
  const plan = soundPlan(tl, NOMINAL, -1);
  const longs = plan.filter((s) => s.sound === "long");
  const phaseVoices = plan.filter((s) => s.sound === "voice" && s.text !== "Séance terminée");
  assert.equal(longs.length, tl.length);
  assert.equal(phaseVoices.length, tl.length);
  let t = 0;
  for (const entry of tl) {
    assert.ok(longs.some((s) => near(s.at, t)), `bip long attendu à ${t}`);
    assert.ok(
      phaseVoices.some((s) => near(s.at, t + 0.35) && s.text === LABELS[entry.phase]),
      `annonce « ${LABELS[entry.phase]} » attendue à ${t + 0.35}`,
    );
    t += entry.duration;
  }
});

test("soundPlan : 3 bips courts avant chaque fin de phase (phases ≥ 3 s)", () => {
  const tl = buildTimeline(NOMINAL);
  const shorts = soundPlan(tl, NOMINAL, -1).filter((s) => s.sound === "short");
  let t = 0;
  let expectedCount = 0;
  for (const entry of tl) {
    const end = t + entry.duration;
    for (const k of [3, 2, 1]) {
      assert.equal(shorts.filter((s) => near(s.at, end - k)).length, 1, `un bip court attendu à ${end - k}`);
      expectedCount++;
    }
    t = end;
  }
  assert.equal(shorts.length, expectedCount);
});

test("soundPlan : bip de fin puis « Séance terminée » 1,4 s après, en fin de plan", () => {
  const tl = buildTimeline(NOMINAL);
  const T = totalDuration(NOMINAL);
  const plan = soundPlan(tl, NOMINAL, -1);
  const ends = plan.filter((s) => s.sound === "end");
  assert.equal(ends.length, 1);
  assert.ok(near(ends[0].at, T), `bip de fin attendu à ${T}`);
  const last = plan.at(-1);
  assert.equal(last.sound, "voice");
  assert.equal(last.text, "Séance terminée");
  assert.ok(near(last.at, T + 1.4));
});

// ---------- soundPlan : décompte et tri ----------

test("soundPlan : aucun bip court au même instant qu'un début de phase", () => {
  for (const settings of [NOMINAL, SHORT, NO_PREP]) {
    const tl = buildTimeline(settings);
    const plan = soundPlan(tl, settings, -1);
    const starts = plan.filter((s) => s.sound === "long").map((s) => s.at);
    for (const s of plan.filter((x) => x.sound === "short")) {
      assert.ok(!starts.some((at) => near(at, s.at)), `bip court au début de phase ${s.at}`);
    }
  }
});

test("soundPlan : liste triée par at", () => {
  for (const settings of [NOMINAL, SHORT, NO_PREP]) {
    const tl = buildTimeline(settings);
    for (const from of [-1, 0, 12.5, 37]) assertSorted(soundPlan(tl, settings, from));
  }
});

test("soundPlan : phase plus courte que 3 s, pas de bip court avant son début (ni en double)", () => {
  const tl = buildTimeline(SHORT);
  const plan = soundPlan(tl, SHORT, -1);
  assertPlan(plan, expectedPlan(SHORT, -1));
  const shortsAt = (t) => plan.filter((s) => s.sound === "short" && near(s.at, t)).length;
  // work [5,7) : seul 6 lui appartient ; 4 vient uniquement du décompte de prep [0,5).
  assert.equal(shortsAt(4), 1, "un seul bip court à 4");
  assert.equal(shortsAt(5), 0, "pas de bip court au début de work (5)");
  assert.equal(shortsAt(6), 1, "un bip court à 6");
  // rest [7,8) : aucun bip court propre (7 est son début).
  assert.equal(shortsAt(7), 0, "pas de bip court au début de rest (7)");
  // cooldown [10,14) : 11, 12, 13.
  for (const t of [11, 12, 13]) assert.equal(shortsAt(t), 1, `un bip court à ${t}`);
});

// ---------- soundPlan : reprise en cours de séance ----------

test("soundPlan avec from en cours de phase : rien à ou avant from, tout ce qui suit présent", () => {
  const tl = buildTimeline(NOMINAL);
  for (const from of [12.5, 64.2, 129.9]) {
    assertPlan(soundPlan(tl, NOMINAL, from), expectedPlan(NOMINAL, from));
  }
});

test("soundPlan avec from exactement sur un début de phase : ce début (bip long + annonce) est exclu", () => {
  const tl = buildTimeline(NOMINAL);
  const plan = soundPlan(tl, NOMINAL, 40);
  assertPlan(plan, expectedPlan(NOMINAL, 40));
  assert.ok(!plan.some((s) => s.sound === "long" && near(s.at, 40)));
  assert.ok(!plan.some((s) => s.sound === "voice" && near(s.at, 40.35)));
  assert.ok(plan.some((s) => s.sound === "long" && near(s.at, 55)));
});

test("soundPlan avec from exactement sur un bip court : ce bip est exclu, les suivants présents", () => {
  const tl = buildTimeline(NOMINAL);
  const plan = soundPlan(tl, NOMINAL, 37);
  assertPlan(plan, expectedPlan(NOMINAL, 37));
  assert.ok(!plan.some((s) => s.sound === "short" && near(s.at, 37)));
  assert.ok(plan.some((s) => s.sound === "short" && near(s.at, 38)));
  assert.ok(plan.some((s) => s.sound === "short" && near(s.at, 39)));
});

test("soundPlan avec from juste après un début de phase : l'annonce décalée de cette phase n'est pas reprogrammée", () => {
  const tl = buildTimeline(NOMINAL);
  const plan = soundPlan(tl, NOMINAL, 10.1);
  assertPlan(plan, expectedPlan(NOMINAL, 10.1));
  assert.ok(!plan.some((s) => s.sound === "voice" && near(s.at, 10.35)));
});

test("soundPlan près de la fin : seuls le bip de fin et « Séance terminée » restent", () => {
  const tl = buildTimeline(NOMINAL);
  const T = totalDuration(NOMINAL);
  const plan = soundPlan(tl, NOMINAL, T - 0.5);
  assertPlan(plan, [
    { at: T, sound: "end" },
    { at: T + 1.4, sound: "voice", text: "Séance terminée" },
  ]);
});

test("soundPlan à ou après la fin de séance : plan vide", () => {
  const tl = buildTimeline(NOMINAL);
  const T = totalDuration(NOMINAL);
  assert.deepEqual(soundPlan(tl, NOMINAL, T), []);
  assert.deepEqual(soundPlan(tl, NOMINAL, T + 10), []);
});

test("soundPlan avec from : cohérent avec le plan complet (sous-ensemble final)", () => {
  const tl = buildTimeline(SHORT);
  const full = soundPlan(tl, SHORT, -1).map(norm);
  for (const from of [0, 4.5, 7, 9.99]) {
    const part = soundPlan(tl, SHORT, from).map(norm);
    assertPlan(part, expectedPlan(SHORT, from));
    for (const s of part) {
      assert.ok(
        full.some((f) => f.sound === s.sound && near(f.at, s.at) && f.text === s.text),
        `son ${JSON.stringify(s)} absent du plan complet`,
      );
    }
  }
});

// ---------- store : son en arrière-plan ----------

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("store : son en arrière-plan activé par défaut", () => {
  assert.equal(createStore(memoryStorage()).getBackgroundSound(), true);
});

test("store : setBackgroundSound(false) puis true, relu par le même store", () => {
  const store = createStore(memoryStorage());
  store.setBackgroundSound(false);
  assert.equal(store.getBackgroundSound(), false);
  store.setBackgroundSound(true);
  assert.equal(store.getBackgroundSound(), true);
});

test("store : false persiste dans un nouveau store sur le même stockage", () => {
  const storage = memoryStorage();
  createStore(storage).setBackgroundSound(false);
  assert.equal(createStore(storage).getBackgroundSound(), false);
});

test("store : valeur illisible → true", () => {
  const corrupt = {
    getItem: () => "{pas du json",
    setItem: () => {},
    removeItem: () => {},
  };
  let store;
  assert.doesNotThrow(() => {
    store = createStore(corrupt);
  });
  assert.equal(store.getBackgroundSound(), true);
});

test("store : valeur stockée corrompue après coup → true", () => {
  const storage = memoryStorage();
  createStore(storage).setBackgroundSound(false);
  assert.ok(storage.map.size > 0);
  for (const k of [...storage.map.keys()]) storage.map.set(k, "{pas du json");
  assert.equal(createStore(storage).getBackgroundSound(), true);
});

test("store : son en arrière-plan indépendant des préréglages et des derniers réglages", () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.setBackgroundSound(false);
  store.savePreset("Tabata", NOMINAL);
  store.setLastSettings(SHORT);
  store.deletePreset("Tabata");
  assert.equal(createStore(storage).getBackgroundSound(), false);
});

// ---------- interface et fichiers statiques ----------

test("index.html contient une case à cocher #background-sound", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const tags = html.match(/<input\b[^>]*>/gi) ?? [];
  const tag = tags.find((t) => /\bid\s*=\s*["']background-sound["']/i.test(t));
  assert.ok(tag, "aucun <input id=\"background-sound\"> dans index.html");
  assert.match(tag, /\btype\s*=\s*["']checkbox["']/i, "#background-sound doit être une case à cocher");
});

test("src/audio.js utilise les types de session « playback » et « ambient »", () => {
  const path = join(ROOT, "src", "audio.js");
  assert.ok(existsSync(path), "src/audio.js absent");
  const src = readFileSync(path, "utf8");
  assert.match(src, /audioSession/, "navigator.audioSession non utilisé");
  assert.match(src, /["'`]playback["'`]/, "type de session « playback » absent");
  assert.match(src, /["'`]ambient["'`]/, "type de session « ambient » absent");
});

test("VERSION du service worker incrémentée (différente de « v3 »)", () => {
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const m = sw.match(/const\s+VERSION\s*=\s*["'`]([^"'`]+)["'`]/);
  assert.ok(m, "VERSION introuvable dans sw.js");
  assert.notEqual(m[1], "v3");
});
