// Bips (Web Audio) et annonces vocales (speechSynthesis).
// iOS n'autorise le son qu'après un geste : unlock() doit être appelé
// depuis un gestionnaire de clic.

let ctx = null;
let voice = null;

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
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
    // Énoncé vide dans le geste : débloque la synthèse sur iOS.
    speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice = voices.find((v) => v.lang === "fr-FR" && v.localService) ?? voices.find((v) => v.lang.startsWith("fr")) ?? null;
}

function tone(frequency, duration, delay = 0) {
  if (!ctx) return;
  if (ctx.state !== "running") ctx.resume();
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.6, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export const beepShort = () => tone(880, 0.15);
export const beepLong = () => tone(1320, 0.6);
export const beepEnd = () => {
  tone(1320, 0.25);
  tone(1320, 0.25, 0.3);
  tone(1760, 0.7, 0.6);
};

export function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  if (voice) utterance.voice = voice;
  utterance.rate = 1.05;
  speechSynthesis.speak(utterance);
}
