# hyrox-app

App mobile (PWA) de suivi Hyrox : programme, saisie des séances, progression.
Code uniquement — les données vivent dans un repo privé séparé (`hyrox-data`),
lu et écrit via l'API GitHub avec un token stocké sur le téléphone.

- Vue ordinateur : `desktop.html` (lecture seule, mêmes données et même token).
- Pas de build : HTML + modules JS + Chart.js (CDN). Hébergé sur GitHub Pages.
- Dev local : `python3 dev/mock_github.py <copie de hyrox-data>` puis
  `http://localhost:8787/?api=http://localhost:8787/api` (n'importe quel token).
