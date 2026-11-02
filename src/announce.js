// Libellés courts : un mot par phase, joués en clip audio (voir audio.js).
export function announcement(entry, settings) {
  if (entry === null) return "Séance terminée";
  switch (entry.phase) {
    case "prep":
      return "Préparation";
    case "work":
      return "Exercice";
    case "rest":
    case "setRest":
      return "Repos";
    case "cooldown":
      return "Récupération";
  }
  return "";
}
