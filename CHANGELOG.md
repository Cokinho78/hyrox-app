# Versions

Revenir à une version : demander à Claude « reviens à la vX.Y de hyrox-app ».
Chaque version = un commit sur `main` (tag Git du même nom quand il existe, sinon l'identifiant de commit ci-dessous).

## v2.8 — 2026-10-25 · commit 082049e
- Vue ordinateur, onglet Analyses : « Volume par station » Hyrox, depuis une course au choix
  (par défaut Lyon) ou sur 28 jours. Séances d'entraînement seulement (courses exclues), échauffements
  exclus sauf bouton. Volume en « × course » (1 = une station complète) pour comparer les stations,
  trait à la moyenne, date de dernière séance (orange au-delà de 14 jours). Hachuré = estimé (temps
  saisi sans distance). Séances Hyrox sans détail par station listées, non comptées.

## v2.7 — 2026-10-24 · commit a661ed9
- Repas du jour : un brouillon local ne masque plus la version du repo. Si le journal du jour a
  été modifié dans `hyrox-data` depuis le début du brouillon (ex. journée remplie par le coach),
  le brouillon est abandonné et la version du repo s'affiche. Brouillon d'un jour non modifié
  ailleurs : conservé comme avant, même après rechargement.
- Réglages : « Vider le cache local » supprime aussi les brouillons de journée nutrition.

## v2.6 — 2026-10-22 · commit d7bc88e
- Repas du jour : compteur « fin de journée estimée ». Les repas pas encore cochés comptent
  dans l'estimé (aujourd'hui et jours à venir ; jours passés : non coché = 0, sauté exclu).
  Barres : plein = mangé, hachuré = prévu restant, trait à la cible quand l'estimé la dépasse,
  orange au-delà de +10 %. Valeurs préfixées « ~ » tant qu'il reste un repas non coché.
  Affichage seulement : le JSON enregistré et le bilan ne changent pas.

## v2.5 — 2026-10-20 · commit 68a368a
- Vue ordinateur, onglet Analyses : section « Sommeil, nutrition & corps » regroupable par jour,
  semaine ou mois. Sommeil : score, durée, phases, coucher moyen. Nutrition : kcal et macros vs
  cible, jours où les protéines sont atteintes, repas notés (journée en cours exclue). Poids &
  composition : courbe par balance, tableau des pesées avec écarts sur la même balance.

## v2.4 — 2026-10-19 · commit 98941e2
- Vue ordinateur : projection des semaines à venir (`plan/projection.json`, écrit par le coach),
  en pointillés et marquée « non validée ». Une semaine projetée disparaît dès que le vrai programme
  de la semaine est écrit. Volume hebdo prolongé jusqu'à la course en hachuré.

## v2.3 — 2026-10-19 · commit 2b7d101
- Vue ordinateur `desktop.html` (lecture seule) : Saison › Mois › Semaine › Séance, plus Analyses.
  Croise séances, sommeil et nutrition ; même token que l'app (à saisir une fois par navigateur).
- Réglages : lien vers la vue ordinateur.

## v2.2 — 2026-10-14 · commit 846f223
- Repas du jour : protéines / glucides / lipides affichés pour chaque plat.
- Graphiques : toucher n'importe où dans une colonne affiche les valeurs.
- Sommeil : historique détaillé (score, phases, coucher/lever), graphique sur 14 nuits, phase « lent ».
- Poids : balance InBody (salle du travail) ; % de gras affiché pour toute balance présente.

## v2.1 — 2026-10-10
- 3 espaces : Sport, Nutrition, Sommeil. Le menu ☰ change d'espace, la barre du bas
  navigue dans l'espace. Ouverture toujours sur Sport.

## v2.0 — 2026-10-10
- Volet latéral (☰ en haut à gauche) : Repas du jour, Menu de la semaine, Liste de courses,
  Bilan nutrition, Poids & composition (par balance), Sommeil.

## v1.4 — 2026-10-10
- Temps saisis avec deux roues minutes : secondes (ex. 37:47), précision à la seconde quelle que soit la durée.

## v1.3 — 2026-10-10
- Numéro de version affiché en bas des Réglages (pour vérifier la mise à jour).

## v1.2 — 2026-10-10
- Saisie par menus déroulants (roue iPhone) : reps 1-100, poids par 0,5 kg,
  temps à la seconde (jusqu'à 20 min) puis à la minute, distances courantes.
- « Autre… » en bas de chaque menu pour taper une valeur au clavier.

## v1.1 — 2026-10-10
- Barre d'onglets fixe en bas d'écran (seule la zone de contenu défile).

## v1.0 — 2026-10-10
- Première version : Aujourd'hui, Semaine, saisie pré-remplie, Historique,
  Progrès (4 graphiques), Objectifs, mode hors ligne, brouillons.
