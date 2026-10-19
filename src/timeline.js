const DURATIONS = ["prep", "work", "rest", "cooldown"];
const COUNTS = ["exercises", "sets"];

function validate(settings) {
  for (const key of DURATIONS) {
    const v = settings[key];
    if (!Number.isInteger(v) || v < 0) throw new RangeError(`${key} doit être un entier ≥ 0 (reçu ${v})`);
  }
  if (settings.work < 1) throw new RangeError("work doit être ≥ 1");
  for (const key of COUNTS) {
    const v = settings[key];
    if (!Number.isInteger(v) || v < 1) throw new RangeError(`${key} doit être un entier ≥ 1 (reçu ${v})`);
  }
}

// Séquence des phases d'une séance. Le repos qui suivrait le tout dernier
// exercice est remplacé par la récupération finale.
export function buildTimeline(settings) {
  validate(settings);
  const { prep, work, rest, exercises, sets, cooldown } = settings;
  const timeline = [];
  if (prep > 0) timeline.push({ phase: "prep", duration: prep, set: null, exercise: null });
  for (let set = 1; set <= sets; set++) {
    for (let exercise = 1; exercise <= exercises; exercise++) {
      timeline.push({ phase: "work", duration: work, set, exercise });
      const last = set === sets && exercise === exercises;
      if (!last && rest > 0) timeline.push({ phase: "rest", duration: rest, set, exercise });
    }
  }
  if (cooldown > 0) timeline.push({ phase: "cooldown", duration: cooldown, set: null, exercise: null });
  return timeline;
}

export function totalDuration(timeline) {
  return timeline.reduce((sum, entry) => sum + entry.duration, 0);
}
