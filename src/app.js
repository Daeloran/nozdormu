import { buildTimeline, totalDuration } from "./timeline.js";
import { stateAt, cuesBetween } from "./engine.js";
import { announcement } from "./announce.js";
import { createStore } from "./store.js";
import { formatDuration, parseDuration } from "./format.js";
import { unlock, beepShort, beepLong, beepEnd, speak } from "./audio.js";

const DEFAULTS = { prep: 10, work: 30, rest: 15, exercises: 5, sets: 3, cooldown: 60 };
const LIMITS = { duration: 5999, count: 99 };
const PHASE_NAMES = { prep: "Préparation", work: "Exercice", rest: "Repos", cooldown: "Récupération" };

const $ = (id) => document.getElementById(id);

function openStorage() {
  try {
    return window.localStorage;
  } catch {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
  }
}

const store = createStore(openStorage());

function isValid(settings) {
  try {
    buildTimeline(settings);
    return true;
  } catch {
    return false;
  }
}

let settings = { ...DEFAULTS, ...store.getLastSettings() };
if (!isValid(settings)) settings = { ...DEFAULTS };
let currentPreset = null;

// ---------- écrans ----------

function show(id) {
  for (const screen of document.querySelectorAll(".screen")) screen.hidden = screen.id !== id;
}

// ---------- réglages ----------

const fields = new Map();

function formatField(kind, value) {
  return kind === "duration" ? formatDuration(value) : String(value);
}

function buildFields() {
  for (const field of document.querySelectorAll(".field")) {
    const { key, kind } = field.dataset;
    const step = Number(field.dataset.step);
    const min = Number(field.dataset.min);
    const max = LIMITS[kind];

    const stepper = document.createElement("div");
    stepper.className = "stepper";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Moins");
    const input = document.createElement("input");
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.setAttribute("aria-label", field.querySelector(".label").textContent);
    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Plus");
    stepper.append(minus, input, plus);
    field.append(stepper);

    const set = (value) => {
      const clamped = Math.min(max, Math.max(min, value));
      if (clamped !== settings[key]) {
        settings = { ...settings, [key]: clamped };
        onSettingsChanged();
      }
      input.value = formatField(kind, settings[key]);
    };

    // Pas « arrondi » : 12 s + 5 → 15 s plutôt que 17 s.
    const bump = (direction) => {
      const value = settings[key];
      const next = direction > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
      set(next);
    };
    holdToRepeat(minus, () => bump(-1));
    holdToRepeat(plus, () => bump(1));

    input.addEventListener("focus", () => input.select());
    input.addEventListener("input", () => input.classList.toggle("invalid", parseInput(kind, input.value) === null));
    input.addEventListener("change", () => {
      const value = parseInput(kind, input.value);
      input.classList.remove("invalid");
      set(value ?? settings[key]);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });

    fields.set(key, { input, kind });
  }
}

function parseInput(kind, text) {
  if (kind === "duration") return parseDuration(text);
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

function holdToRepeat(button, action) {
  let delay = null;
  let repeat = null;
  const stop = () => {
    clearTimeout(delay);
    clearInterval(repeat);
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    action();
    delay = setTimeout(() => (repeat = setInterval(action, 90)), 400);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(type, stop);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

function renderFields() {
  for (const [key, { input, kind }] of fields) input.value = formatField(kind, settings[key]);
  const total = totalDuration(buildTimeline(settings));
  const count = settings.exercises * settings.sets;
  $("total").textContent = `Durée totale ${formatDuration(total)} · ${count} exercice${count > 1 ? "s" : ""}`;
}

function sameSettings(a, b) {
  return Object.keys(DEFAULTS).every((key) => a[key] === b[key]);
}

function onSettingsChanged() {
  store.setLastSettings(settings);
  if (currentPreset) {
    const preset = store.listPresets().find((p) => p.name === currentPreset);
    if (!preset || !sameSettings(preset.settings, settings)) {
      currentPreset = null;
      renderPresets();
    }
  }
  renderFields();
}

// ---------- préréglages ----------

function renderPresets() {
  const select = $("preset-select");
  select.replaceChildren(new Option("Séance libre", ""));
  for (const { name } of store.listPresets()) select.add(new Option(name, name));
  select.value = currentPreset ?? "";
  $("preset-delete").hidden = !currentPreset;
}

$("preset-select").addEventListener("change", (event) => {
  const name = event.target.value;
  const preset = store.listPresets().find((p) => p.name === name);
  if (preset && isValid(preset.settings)) {
    currentPreset = name;
    settings = { ...preset.settings };
    store.setLastSettings(settings);
    renderFields();
  } else {
    currentPreset = null;
  }
  renderPresets();
});

$("preset-save").addEventListener("click", () => {
  const name = prompt("Nom du préréglage", currentPreset ?? "")?.trim();
  if (!name) return;
  const exists = store.listPresets().some((p) => p.name === name);
  if (exists && name !== currentPreset && !confirm(`Remplacer le préréglage « ${name} » ?`)) return;
  store.savePreset(name, settings);
  currentPreset = name;
  renderPresets();
});

$("preset-delete").addEventListener("click", () => {
  if (!currentPreset || !confirm(`Supprimer le préréglage « ${currentPreset} » ?`)) return;
  store.deletePreset(currentPreset);
  currentPreset = null;
  renderPresets();
});

// ---------- séance ----------

let run = null;
let wakeLock = null;

async function acquireWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function elapsedNow() {
  return run.base + (run.running ? (performance.now() - run.t0) / 1000 : 0);
}

function startSession() {
  unlock();
  const timeline = buildTimeline(settings);
  const starts = [];
  let t = 0;
  for (const entry of timeline) {
    starts.push(t);
    t += entry.duration;
  }
  run = {
    timeline,
    starts,
    total: t,
    settings: { ...settings },
    preset: currentPreset,
    date: new Date().toISOString(),
    base: 0,
    t0: performance.now(),
    running: true,
    last: -1, // le signal de la première phase tombe dans ]-1, 0]
    recorded: false,
    frame: null,
  };
  $("session").classList.remove("paused");
  $("pause").textContent = "❚❚";
  $("pause").setAttribute("aria-label", "Pause");
  show("session");
  acquireWakeLock();
  tick();
}

function tick() {
  if (!run) return;
  const elapsed = elapsedNow();
  const gap = elapsed - run.last;
  let cues = cuesBetween(run.timeline, run.last, elapsed);
  run.last = elapsed;

  if (gap > 1.5) {
    // Retour après une mise en veille : pas de rafale de bips, juste la phase en cours.
    const hadPhaseChange = cues.some((c) => c.type !== "countdown");
    cues = [];
    const state = stateAt(run.timeline, elapsed);
    if (hadPhaseChange && !state.done) speak(announcement(state.entry, run.settings));
  }
  playCues(cues);

  const state = stateAt(run.timeline, elapsed);
  if (state.done) {
    finish(true);
    return;
  }
  renderSession(state, elapsed);
  run.frame = requestAnimationFrame(tick);
}

function playCues(cues) {
  const phaseStarts = new Set(cues.filter((c) => c.type === "phase").map((c) => c.at));
  for (const cue of cues) {
    if (cue.type === "countdown" && !phaseStarts.has(cue.at)) beepShort();
    if (cue.type === "phase") {
      beepLong();
      speak(announcement(run.timeline[cue.index], run.settings));
    }
    if (cue.type === "end") {
      beepEnd();
      speak(announcement(null, run.settings));
    }
  }
}

function nextWork(index) {
  return run.timeline.slice(index + 1).find((entry) => entry.phase === "work") ?? null;
}

function workLabel(entry) {
  const { exercises, sets } = run.settings;
  return `Exercice ${entry.exercise}/${exercises} · Série ${entry.set}/${sets}`;
}

function renderSession(state, elapsed) {
  const { entry, index, remaining } = state;
  const session = $("session");
  session.dataset.phase = entry.phase;
  $("phase-name").textContent = PHASE_NAMES[entry.phase];
  let detail = "";
  if (entry.phase === "work") detail = workLabel(entry);
  else if (entry.phase !== "cooldown") {
    const next = nextWork(index);
    if (next) detail = `Ensuite : ${workLabel(next).toLowerCase()}`;
  }
  $("phase-detail").textContent = detail;
  $("remaining").textContent = remaining >= 60 ? formatDuration(remaining) : String(remaining);
  const progress = Math.min(1, (elapsed - run.starts[index]) / entry.duration);
  $("progress-bar").style.width = `${(progress * 100).toFixed(2)}%`;
  $("session-left").textContent = `Reste ${formatDuration(Math.ceil(run.total - elapsed))}`;
}

function record(completed) {
  if (!run || run.recorded) return;
  run.recorded = true;
  const elapsed = Math.min(run.total, elapsedNow());
  store.addHistory({
    date: run.date,
    preset: run.preset,
    settings: run.settings,
    elapsed: Math.round(elapsed),
    completed,
  });
}

function endRun() {
  cancelAnimationFrame(run.frame);
  releaseWakeLock();
  run = null;
}

function finish(completed) {
  record(completed);
  const { total, settings: s } = run;
  endRun();
  $("done-summary").textContent = `${formatDuration(total)} · ${s.sets} série${s.sets > 1 ? "s" : ""} × ${s.exercises} exercice${s.exercises > 1 ? "s" : ""}`;
  show("done");
}

$("pause").addEventListener("click", () => {
  if (!run) return;
  unlock();
  if (run.running) {
    run.base = elapsedNow();
    run.running = false;
    cancelAnimationFrame(run.frame);
    window.speechSynthesis?.cancel();
  } else {
    run.t0 = performance.now();
    run.running = true;
    tick();
  }
  $("session").classList.toggle("paused", !run.running);
  $("pause").textContent = run.running ? "❚❚" : "▶";
  $("pause").setAttribute("aria-label", run.running ? "Pause" : "Reprendre");
});

$("skip").addEventListener("click", () => {
  if (!run) return;
  const state = stateAt(run.timeline, elapsedNow());
  if (state.done) return;
  const next = run.starts[state.index] + state.entry.duration;
  // Juste avant le début de la phase suivante : son signal est émis au prochain tick.
  run.base = next;
  run.t0 = performance.now();
  run.last = next - 1e-6;
  if (!run.running) {
    playCues(cuesBetween(run.timeline, run.last, next));
    run.last = next;
    const s = stateAt(run.timeline, next);
    if (s.done) finish(true);
    else renderSession(s, next);
  } else {
    cancelAnimationFrame(run.frame);
    tick();
  }
});

$("stop").addEventListener("click", () => {
  if (!run || !confirm("Arrêter la séance ?")) return;
  record(false);
  endRun();
  window.speechSynthesis?.cancel();
  show("setup");
});

$("done-back").addEventListener("click", () => show("setup"));
$("start").addEventListener("click", startSession);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && run) acquireWakeLock();
});

// Appli fermée en pleine séance : on garde une trace, marquée non terminée.
window.addEventListener("pagehide", () => {
  if (run) record(false);
});

// ---------- historique ----------

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function renderHistory() {
  const items = store.listHistory();
  const list = $("history-list");
  list.replaceChildren();
  for (const item of items) {
    const li = document.createElement("li");
    const s = item.settings ?? {};
    const date = new Date(item.date);
    const parts = [
      ["h-title", item.preset ?? "Séance libre"],
      [`h-status ${item.completed ? "ok" : "partial"}`, item.completed ? `✓ ${formatDuration(item.elapsed)}` : `${formatDuration(item.elapsed)} · interrompue`],
      ["h-date", Number.isNaN(date.getTime()) ? "" : dateFormat.format(date)],
      ["h-detail", `${s.sets} série${s.sets > 1 ? "s" : ""} × ${s.exercises} exercice${s.exercises > 1 ? "s" : ""} · ${formatDuration(s.work)} / ${formatDuration(s.rest)}`],
    ];
    for (const [className, text] of parts) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      li.append(span);
    }
    list.append(li);
  }
  $("history-empty").hidden = items.length > 0;
}

$("open-history").addEventListener("click", () => {
  renderHistory();
  show("history");
});
$("history-back").addEventListener("click", () => show("setup"));

// ---------- démarrage ----------

buildFields();
renderFields();
renderPresets();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
