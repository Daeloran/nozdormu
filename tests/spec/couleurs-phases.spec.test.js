import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Tests d'intention de l'issue #9 : Exercice en vert, Repos en rouge.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Variables CSS déclarées dans le premier bloc `:root { ... }` de style.css.
function rootVars() {
  const css = readFileSync(join(ROOT, "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = css.match(/:root\s*\{([^}]*)\}/);
  assert.ok(block, "style.css doit contenir un bloc :root");
  const vars = {};
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[name] = value.trim().toLowerCase();
  }
  return vars;
}

function assertVar(vars, name, expected, role) {
  assert.equal(vars[name], expected, `${name} (${role}) doit valoir ${expected}, trouvé : ${vars[name]}`);
}

test("fond de séance : Exercice en vert (#2f855a), Repos en rouge (#c53030)", () => {
  const vars = rootVars();
  assertVar(vars, "--work", "#2f855a", "fond Exercice");
  assertVar(vars, "--rest", "#c53030", "fond Repos");
});

test("libellés des réglages : Exercice en vert clair (#68d391), Repos en rouge clair (#fc8181)", () => {
  const vars = rootVars();
  assertVar(vars, "--work-text", "#68d391", "libellé Exercice");
  assertVar(vars, "--rest-text", "#fc8181", "libellé Repos");
});

test("Préparation, Repos série et Récupération gardent leurs couleurs actuelles", () => {
  const vars = rootVars();
  assertVar(vars, "--prep", "#b7791f", "fond Préparation");
  assertVar(vars, "--set-rest", "#6b46c1", "fond Repos série");
  assertVar(vars, "--cooldown", "#2b6cb0", "fond Récupération");
  assertVar(vars, "--prep-text", "#f6c453", "libellé Préparation");
  assertVar(vars, "--set-rest-text", "#b794f4", "libellé Repos série");
  assertVar(vars, "--cooldown-text", "#63b3ed", "libellé Récupération");
});
