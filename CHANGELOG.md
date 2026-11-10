# Versions

Revenir à une version : demander à Claude « reviens à la vX.Y de hyrox-app ».
Chaque version = un commit sur `main` (tag Git du même nom quand il existe, sinon l'identifiant de commit ci-dessous).

## v3.4 — 2026-11-10
- Vue ordinateur, Mois : le calendrier n'est plus coupé à droite (le dimanche disparaissait sur un
  écran de 1 380 à 1 550 px depuis le menu latéral). Il garde sa largeur utile ; s'il manque de place,
  le résumé du mois passe dessous (les deux cartes côte à côte, la légende en dessous).
- Mois : toutes les semaines ont la même hauteur (celle de la semaine la plus remplie).
- Saison : les noms de phases ne sont plus tronqués sur la frise. Chaque segment affiche le libellé le plus
  long qui tient (« Phase 5 — Pic », sinon « P5 Pic », sinon « P5 ») ; la liste complète des phases avec
  leurs dates s'affiche sous la frise, la phase en cours en jaune.

## v3.3 — 2026-11-07 · commit 2958e45
- Vue ordinateur : le surlignage jaune du menu glisse d'un niveau à l'autre (Saison, Mois, Semaine,
  Séance, Analyses). Les pages arrivent par la droite quand on descend d'un niveau ou qu'on passe au
  mois / à la semaine suivant(e), par la gauche dans l'autre sens. Les cartes cliquables se soulèvent
  au survol ; barres, jauges et courbes se dessinent à l'arrivée sur une page.
- App mobile : le texte de l'onglet passe au noir quand la pastille arrive, pas avant.

## v3.2 — 2026-11-07 · commit d735a0c
- Barre du bas : la pastille jaune glisse d'un onglet à l'autre (léger rebond à l'arrivée) pendant que
  le nom de l'onglet s'ouvre.
- Changement de page : l'écran glisse depuis la droite ou la gauche selon l'onglet choisi, ou selon la
  date (semaine suivante/précédente, jour suivant/précédent en nutrition). Détail d'une séance et retours :
  légère montée en fondu. Changement d'espace (Sport, Nutrition, Sommeil) : léger zoom.
- Boutons, lignes et cartes s'enfoncent légèrement au toucher ; la barre d'avancement de la phase se
  remplit à l'ouverture d'Aujourd'hui.
- Vue ordinateur : fondu léger au changement de page.
- Réglage iPhone « Réduire les animations » respecté : plus aucun effet.

## v3.1 — 2026-11-06 · commit c20cce0
- Barre du bas : elle flotte maintenant par-dessus le contenu, qui défile jusqu'en bas de l'écran
  (avant, une bande vide restait sous la barre). Barre plus proche du bas, juste au-dessus de la barre
  d'accueil de l'iPhone. Les boutons « Enregistrer » restent collés juste au-dessus d'elle.

## v3.0 — 2026-11-06 · commit 72e1a2c
- Nouveau design (direction A des maquettes) : noir plus profond, cartes sans bordure aux coins plus
  ronds, icônes au trait à la place des emojis et symboles. Le jaune ne change pas.
- En-tête : logo HYROX + bouton d'espace (« Sport ▾ ») qui ouvre le volet ; synchro et réglages en icônes.
- Barre du bas flottante : l'onglet actif en pastille jaune avec son nom, les autres en icône seule.
- Aujourd'hui : bandeau de la semaine (point jaune = séance faite, orange = à saisir, gris = prévue),
  compte à rebours avec l'avancement de la phase en cours, séance du jour en grande carte avec bouton
  « Saisir la séance », message du coach, listes « À saisir » et « À venir » compactes.
- Vue ordinateur : menu à gauche (Saison, Mois, Semaine, Séance, Analyses), synchro et réglages en bas,
  mêmes couleurs que l'app. Sur un écran étroit, le menu repasse en haut.

## v2.9 — 2026-11-06 · commit a69f381
- Repas du jour : ajout d'un aliment par recherche texte. Le menu déroulant devient un champ
  « + Ajouter : chercher un aliment… » : quelques lettres suffisent, les aliments, recettes et plats
  FoodChéri correspondants s'affichent (12 max), sans tenir compte des accents ni des majuscules
  (« oeuf » trouve « Œuf entier »). Le nom d'un rayon marche aussi (« féculents »). Entrée ajoute le
  premier résultat. Champ vide : « Saisie libre » et « Plat FoodChéri » restent proposés.

## v2.8 — 2026-10-25 · commit 082049e
- Vue ordinateur, onglet Analyses : « Volume par station » Hyrox, depuis une course au choix
  (par défaut Lyon) ou sur 28 jours. Séances d'entraînement seulement (courses exclues), échauffements
  exclus sauf bouton. Volume en « × course » (1 = une station complète) pour comparer les stations,
  trait à la moyenne, date de dernière séance (orange au-delà de 14 jours). Hachuré = estimé (temps
  saisi sans distance). Séances Hyrox sans détail par station listées, non comptées.
  Si un échauffement est plus récent que la dernière séance de la station, sa date s'affiche en dessous.

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
