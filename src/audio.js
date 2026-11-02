// Bips et annonces vocales, tout en Web Audio pour se mêler à la musique :
// la synthèse vocale d'iOS baisse ou coupe la musique, d'où des clips
// pré-enregistrés (audio/*.mp3, voix Piper fr_FR-siwis).
// iOS n'autorise le son qu'après un geste : unlock() doit être appelé
// depuis un gestionnaire de clic.

const CLIPS = ["Préparation", "Exercice", "Repos", "Récupération", "Séance terminée"];
// Volumes volontairement bas : le minuteur reste en fond sous la musique.
const BEEP_GAIN = 0.2;
const PHASE_GAIN = 0.3;
const VOICE_GAIN = 0.5;

let ctx = null;
const clips = new Map(); // libellé → Promise<AudioBuffer>
let current = null;

// « Séance terminée » → « seance-terminee »
export function clipName(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function unlock() {
  // « ambient » : le son se mêle à la musique au lieu de la couper (Safari 17+).
  if (navigator.audioSession) {
    try {
      navigator.audioSession.type = "ambient";
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

function tone(frequency, duration, delay = 0, level = BEEP_GAIN) {
  if (!ctx) return;
  if (ctx.state !== "running") ctx.resume();
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
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

export const beepShort = () => tone(880, 0.15);
export const beepLong = () => tone(1320, 0.4, 0, PHASE_GAIN);
export const beepEnd = () => {
  tone(1320, 0.25, 0, PHASE_GAIN);
  tone(1320, 0.25, 0.3, PHASE_GAIN);
  tone(1760, 0.7, 0.6, PHASE_GAIN);
};

// Joue le clip du libellé, après le bip (delay en secondes).
// Au premier lancement, le clip peut être encore en chargement : on l'attend.
export function speak(text, delay = 0.35) {
  const clip = clips.get(text);
  if (!ctx || !clip) return;
  const at = ctx.currentTime + delay;
  silence();
  const token = {};
  current = token;
  clip.then((buffer) => {
    if (buffer && current === token) play(buffer, Math.max(at, ctx.currentTime));
  });
}

function play(buffer, at) {
  if (ctx.state !== "running") ctx.resume();
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = VOICE_GAIN;
  source.connect(gain).connect(ctx.destination);
  source.start(at);
  current = source;
}

export function silence() {
  try {
    current?.stop?.();
  } catch {}
  current = null;
}
