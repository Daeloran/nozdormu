# Nozdormu

Minuteur de séance de sport en PWA : préparation, exercices, repos, séries, récupération finale.
Installable sur iPhone via Safari → Partager → « Sur l'écran d'accueil ». Fonctionne hors ligne.

Aucune dépendance, aucun build : fichiers statiques servis par GitHub Pages.

```sh
npm test   # node --test tests/
```

## Installer sur l'iPhone

1. Ouvrir https://daeloran.github.io/nozdormu/ dans **Safari**.
2. Partager → **Sur l'écran d'accueil**.
3. Lancer depuis l'icône : plein écran, fonctionne hors ligne.

Les préréglages et l'historique restent dans le téléphone (`localStorage` de l'appli installée).

## Limites iOS

- Les sons de la séance sont programmés d'avance dans Web Audio : ils sonnent même quand iOS suspend le JavaScript.
- **Son en arrière-plan** (réglage, activé par défaut) : session audio « playback », le son continue appli en fond et écran verrouillé, mais iOS met en pause la musique des autres applis.
- Réglage désactivé : session « ambient », le son se mêle à la musique sans la baisser, mais seulement écran allumé et appli au premier plan ; le **commutateur silencieux** de l'iPhone le coupe. L'appli garde l'écran allumé pendant la séance.
- Les annonces sont des clips pré-enregistrés (`audio/*.mp3`, voix Piper `fr_FR-siwis-medium`) : la synthèse vocale d'iOS baisse ou coupe la musique.
- Pas de vibrations (API absente sur iOS).

## Déployer une nouvelle version

Incrémenter `VERSION` dans `sw.js`, sinon les téléphones gardent l'ancienne version en cache.
GitHub Pages publie la branche `main` (racine).
