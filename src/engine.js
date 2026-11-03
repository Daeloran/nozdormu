import { announcement } from "./announce.js";

// Tout est calculé à partir du temps écoulé (secondes) : pas de compteur
// incrémenté, donc pas de dérive.

export function stateAt(timeline, elapsed) {
  let start = 0;
  for (let index = 0; index < timeline.length; index++) {
    const entry = timeline[index];
    const end = start + entry.duration;
    if (elapsed < end) {
      const remaining = Math.min(entry.duration, Math.ceil(end - elapsed));
      return { index, entry, remaining, done: false };
    }
    start = end;
  }
  return { index: timeline.length, entry: null, remaining: 0, done: true };
}

// Signaux dont l'instant tombe dans ]from, to], dans l'ordre chronologique.
export function cuesBetween(timeline, from, to) {
  const cues = [];
  const inRange = (at) => at > from && at <= to;
  let start = 0;
  for (let index = 0; index < timeline.length; index++) {
    const end = start + timeline[index].duration;
    if (start > to) break;
    if (inRange(start)) cues.push({ type: "phase", at: start, index });
    for (const offset of [3, 2, 1]) {
      const at = end - offset;
      if (at >= start && inRange(at)) cues.push({ type: "countdown", at, index });
    }
    start = end;
  }
  if (timeline.length > 0 && inRange(start)) cues.push({ type: "end", at: start });
  return cues;
}

// Sons de la séance déclenchés strictement après `from`, triés par instant :
// le minuteur les programme d'avance dans le moteur audio, pour qu'ils
// sonnent même quand iOS suspend la page (appli en fond, écran verrouillé).
export function soundPlan(timeline, settings, from) {
  const plan = [];
  for (const cue of cuesBetween(timeline, from, Infinity)) {
    if (cue.type === "phase") {
      plan.push({ at: cue.at, sound: "long" });
      plan.push({ at: cue.at + 0.35, sound: "voice", text: announcement(timeline[cue.index], settings) });
    } else if (cue.type === "countdown") {
      if (!plan.some((s) => s.sound === "long" && s.at === cue.at)) plan.push({ at: cue.at, sound: "short" });
    } else {
      plan.push({ at: cue.at, sound: "end" });
      plan.push({ at: cue.at + 1.4, sound: "voice", text: announcement(null, settings) });
    }
  }
  return plan.sort((a, b) => a.at - b.at);
}
