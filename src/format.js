// 75 → "1:15", 30 → "0:30"
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Accepte "1:15", "75" ou "1:5". Renvoie null si la saisie est illisible.
export function parseDuration(text) {
  const value = String(text).trim();
  let match = value.match(/^(\d+)$/);
  if (match) return Number(match[1]);
  match = value.match(/^(\d+):(\d{1,2})$/);
  if (match && Number(match[2]) < 60) return Number(match[1]) * 60 + Number(match[2]);
  return null;
}
