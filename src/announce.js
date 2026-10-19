export function announcement(entry, settings) {
  if (entry === null) return "Séance terminée";
  switch (entry.phase) {
    case "prep":
      return "Préparation";
    case "work":
      return `Exercice ${entry.exercise} sur ${settings.exercises}, série ${entry.set} sur ${settings.sets}`;
    case "rest":
      return "Repos";
    case "cooldown":
      return "Récupération";
  }
  return "";
}
