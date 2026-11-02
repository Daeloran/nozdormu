import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { announcement } from "../../src/announce.js";

// Tests d'intention de l'issue #5 : annonces courtes, clips audio pré-enregistrés, plus de speechSynthesis.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SETTINGS = { prep: 10, work: 30, rest: 15, setRest: 90, exercises: 4, sets: 3, cooldown: 60 };

// Combinaisons de numéros d'exercice / de série et de réglages
const VARIANTS = [
  { set: 1, exercise: 1, settings: SETTINGS },
  { set: 2, exercise: 3, settings: SETTINGS },
  { set: 3, exercise: 4, settings: SETTINGS },
  { set: 1, exercise: 1, settings: { ...SETTINGS, exercises: 1, sets: 1 } },
  { set: 7, exercise: 12, settings: { ...SETTINGS, exercises: 12, sets: 10 } },
];

const EXPECTED = {
  prep: "Préparation",
  work: "Exercice",
  rest: "Repos",
  setRest: "Repos",
  cooldown: "Récupération",
};
const END = "Séance terminée";

function allLabels() {
  const labels = [];
  for (const [phase, label] of Object.entries(EXPECTED)) {
    for (const v of VARIANTS) {
      const numbered = phase === "prep" || phase === "cooldown" ? { set: null, exercise: null } : v;
      labels.push({
        phase,
        expected: label,
        got: announcement({ phase, duration: v.settings[phase], set: numbered.set, exercise: numbered.exercise }, v.settings),
      });
    }
  }
  for (const v of VARIANTS) labels.push({ phase: "fin", expected: END, got: announcement(null, v.settings) });
  return labels;
}

// Convention de nommage (commentaire de l'issue) : sans accents, minuscules, espaces → tirets
const clipName = (label) =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");

function swAssets() {
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  const m = sw.match(/ASSETS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(m, "tableau ASSETS introuvable dans sw.js");
  return [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1].replace(/^\.\//, ""));
}

// ---------- libellés courts ----------

for (const [phase, label] of Object.entries(EXPECTED)) {
  test(`${phase} → « ${label} », quel que soit le numéro d'exercice / de série`, () => {
    for (const { phase: p, expected, got } of allLabels()) {
      if (p === phase) assert.equal(got, expected);
    }
  });
}

test("fin de séance (entry null) → « Séance terminée »", () => {
  for (const v of VARIANTS) assert.equal(announcement(null, v.settings), END);
});

test("aucun libellé ne contient de chiffre ni « sur »", () => {
  for (const { phase, got } of allLabels()) {
    assert.doesNotMatch(got, /\d/, `${phase} : « ${got} » contient un chiffre`);
    assert.doesNotMatch(got, /\bsur\b/i, `${phase} : « ${got} » contient « sur »`);
  }
});

// ---------- clips audio ----------

test("la convention de nommage donne les 5 clips annoncés par l'issue", () => {
  const names = [...new Set([...Object.values(EXPECTED), END].map(clipName))].sort();
  assert.deepEqual(names, ["exercice", "preparation", "recuperation", "repos", "seance-terminee"]);
});

test("chaque libellé possible a son clip audio/<nom>.mp3 présent dans le dépôt", () => {
  const labels = new Set(allLabels().map((x) => x.got));
  for (const label of labels) {
    const path = join(ROOT, "audio", `${clipName(label)}.mp3`);
    assert.ok(existsSync(path), `clip manquant pour « ${label} » : audio/${clipName(label)}.mp3`);
    assert.ok(readFileSync(path).length > 0, `clip vide : audio/${clipName(label)}.mp3`);
  }
});

test("chaque clip est listé dans ASSETS du service worker (cache hors ligne)", () => {
  const assets = swAssets();
  const labels = new Set(allLabels().map((x) => x.got));
  for (const label of labels) {
    const asset = `audio/${clipName(label)}.mp3`;
    assert.ok(assets.includes(asset), `${asset} absent de ASSETS dans sw.js`);
  }
});

// ---------- plus de speechSynthesis ----------

test("aucun fichier de src/ n'utilise speechSynthesis", () => {
  const dir = join(ROOT, "src");
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length > 0, "aucun fichier .js dans src/");
  const offenders = files.filter((f) => readFileSync(join(dir, f), "utf8").includes("speechSynthesis"));
  assert.deepEqual(offenders, []);
});
