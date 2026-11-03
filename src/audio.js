// Bips et annonces vocales, tout en Web Audio pour se mêler à la musique :
// la synthèse vocale d'iOS baisse ou coupe la musique, d'où des clips
// pré-enregistrés (audio/*.mp3, voix Piper fr_FR-siwis).
// iOS n'autorise le son qu'après un geste : unlock() doit être appelé
// depuis un gestionnaire de clic.
// Les sons de la séance sont programmés d'avance sur l'horloge de
// l'AudioContext (schedule) : ils sonnent sans JavaScript, donc même page
// suspendue, tant qu'iOS laisse tourner le contexte (session « playback »).

const CLIPS = ["Préparation", "Exercice", "Repos", "Récupération", "Séance terminée"];
// Volumes volontairement bas : le minuteur reste en fond sous la musique.
const BEEP_GAIN = 0.2;
const PHASE_GAIN = 0.3;
const VOICE_GAIN = 0.5;

let ctx = null;
const clips = new Map(); // libellé → Promise<AudioBuffer>
let scheduled = []; // sources programmées, arrêtées par cancel()
let generation = 0; // invalide les clips encore en chargement après cancel()

// « Séance terminée » → « seance-terminee »
export function clipName(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function unlock(background = false) {
  // « playback » : le son continue appli en fond et écran verrouillé, mais
  // iOS met en pause la musique des autres applis.
  // « ambient » : le son se mêle à la musique, seulement au premier plan.
  if (navigator.audioSession) {
    try {
      navigator.audioSession.type = background ? "playback" : "ambient";
    } catch {}
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!ctx && AudioCtx) ctx = new AudioCtx();
  if (ctx && ctx.state !== "running") ctx.resume();
  if (ctx) {
    // Un buffer muet joué dans le geste débloque la sortie sur iOS.
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22050);
    source.connect(ctx.destination);
    source.start();
  }
  if (ctx && clips.size === 0) loadClips();
}

function loadClips() {
  for (const text of CLIPS) {
    const clip = fetch(`audio/${clipName(text)}.mp3`)
      .then((response) => response.arrayBuffer())
      // Forme à callbacks : seule acceptée par les anciens Safari.
      .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
      .catch(() => null);
    clips.set(text, clip);
  }
}

// Horloge audio (secondes), null si pas de contexte actif.
export function audioTime() {
  return ctx && ctx.state === "running" ? ctx.currentTime : null;
}

function track(node) {
  scheduled.push(node);
  return node;
}

function tone(frequency, duration, at, level = BEEP_GAIN) {
  const start = Math.max(at, ctx.currentTime); // déjà échu : tout de suite
  const osc = track(ctx.createOscillator());
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const SOUNDS = {
  short: (at) => tone(880, 0.15, at),
  long: (at) => tone(1320, 0.4, at, PHASE_GAIN),
  end: (at) => {
    tone(1320, 0.25, at, PHASE_GAIN);
    tone(1320, 0.25, at + 0.3, PHASE_GAIN);
    tone(1760, 0.7, at + 0.6, PHASE_GAIN);
  },
};

// Clip programmé à `at` ; coupé à `until` (annonce suivante).
// Au premier lancement, le clip peut être encore en chargement : on l'attend,
// et on le joue en retard s'il l'est de peu.
function voice(text, at, until) {
  const clip = clips.get(text);
  if (!clip) return;
  const token = generation;
  clip.then((buffer) => {
    if (!buffer || token !== generation) return;
    const start = Math.max(at, ctx.currentTime);
    if (start - at > 1 || (until !== undefined && start >= until)) return;
    const source = track(ctx.createBufferSource());
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = VOICE_GAIN;
    source.connect(gain).connect(ctx.destination);
    source.start(start);
    if (until !== undefined) source.stop(until);
  });
}

// Programme les sons d'un plan (voir engine.soundPlan) : un son d'instant `at`
// sonne à l'heure audio `origin + at`. Remplace toute programmation précédente.
export function schedule(plan, origin) {
  cancel();
  if (!ctx) return;
  // Boucle muette : garde le contexte actif entre deux sons.
  const keepAlive = track(ctx.createBufferSource());
  keepAlive.buffer = ctx.createBuffer(1, 22050, 22050);
  keepAlive.loop = true;
  keepAlive.connect(ctx.destination);
  keepAlive.start();
  // Arrêtée après le dernier son, même si la page est suspendue à ce moment-là.
  keepAlive.stop(origin + (plan.at(-1)?.at ?? 0) + 3);

  const voices = plan.filter((item) => item.sound === "voice");
  voices.forEach((item, i) => {
    const next = voices[i + 1];
    voice(item.text, origin + item.at, next && origin + next.at);
  });
  for (const item of plan) SOUNDS[item.sound]?.(origin + item.at);
}

export function cancel() {
  generation++;
  for (const node of scheduled) {
    try {
      node.stop();
    } catch {}
  }
  scheduled = [];
}
