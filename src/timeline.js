const DURATIONS = ["prep", "work", "rest", "cooldown"];
const COUNTS = ["exercises", "sets"];

function validate(settings) {
  for (const key of DURATIONS) {
    const v = settings[key];
    if (!Number.isInteger(v) || v < 0) throw new RangeError(`${key} doit être un entier ≥ 0 (reçu ${v})`);
  }
  if (settings.work < 1) throw new RangeError("work doit être ≥ 1");
  const { setRest } = settings;
  if (setRest !== undefined && (!Number.isInteger(setRest) || setRest < 0)) {
    throw new RangeError(`setRest doit être un entier ≥ 0 (reçu ${setRest})`);
  }
  for (const key of COUNTS) {
    const v = settings[key];
    if (!Number.isInteger(v) || v < 1) throw new RangeError(`${key} doit être un entier ≥ 1 (reçu ${v})`);
  }
}

// Réglages enregistrés avant l'arrivée du repos entre séries : il vaut le repos normal.
export function withSetRest(settings) {
  return settings.setRest === undefined ? { ...settings, setRest: settings.rest } : settings;
}

// Séquence des phases d'une séance. Le repos qui suivrait le dernier exercice
// d'une série est remplacé par le repos entre séries, et par la récupération
// finale après la dernière série. Sans setRest, le repos normal sépare les séries.
export function buildTimeline(settings) {
  validate(settings);
  const { prep, work, rest, exercises, sets, setRest, cooldown } = settings;
  const timeline = [];
  if (prep > 0) timeline.push({ phase: "prep", duration: prep, set: null, exercise: null });
  for (let set = 1; set <= sets; set++) {
    for (let exercise = 1; exercise <= exercises; exercise++) {
      timeline.push({ phase: "work", duration: work, set, exercise });
      if (set === sets && exercise === exercises) continue;
      if (exercise === exercises && setRest !== undefined) {
        if (setRest > 0) timeline.push({ phase: "setRest", duration: setRest, set, exercise });
      } else if (rest > 0) {
        timeline.push({ phase: "rest", duration: rest, set, exercise });
      }
    }
  }
  if (cooldown > 0) timeline.push({ phase: "cooldown", duration: cooldown, set: null, exercise: null });
  return timeline;
}

export function totalDuration(timeline) {
  return timeline.reduce((sum, entry) => sum + entry.duration, 0);
}
