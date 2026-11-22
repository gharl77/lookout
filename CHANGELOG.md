# Notes de version / Release notes

Les versions sont numérotées `année.mois.numéro`. / Releases are numbered `year.month.number`.

## À venir / Unreleased

En développement, pas encore publié. / In development, not yet released.

- **Multiutilisateur** : comptes et profils. Chaque personne a ses propres réglages ; l'administrateur crée les
  profils (éventuellement en copie d'un autre), réinitialise les mots de passe et supprime les profils. Une fois
  connecté sur un appareil, on le reste. Le compte administrateur se crée à la première ouverture.
- **Multi-user**: accounts and profiles. Each person has their own settings; the administrator creates profiles
  (optionally as a copy of another), resets passwords and deletes profiles. Once signed in on a device, you stay
  signed in. The administrator account is created the first time the app is opened.
- **Consultation en lecture seule** : un administrateur peut ouvrir le tableau de bord d'un autre profil, sans
  pouvoir rien y modifier (Réglages → Profils → ⋯ → Voir son tableau de bord).
- **Read-only view**: an administrator can open another profile's dashboard without being able to change anything
  (Settings → Profiles → ⋯ → View their dashboard).
- **Mot de passe provisoire** : le mot de passe donné par un administrateur (nouveau profil ou réinitialisation)
  doit être remplacé par la personne à sa connexion suivante.
- **Clés d'API partagées** : un administrateur peut fournir une clé TomTom et une clé API-Sports à tous les profils
  qui n'ont pas la leur (Réglages → Profils). Elles ne sont jamais réaffichées.
- **Temporary password**: a password set by an administrator (new profile or reset) must be replaced by the person
  at their next sign-in.
- **Shared API keys**: an administrator can provide a TomTom key and an API-Sports key to every profile that has
  none of its own (Settings → Profiles). They are never displayed again.

## 2026.11.1

Première version officielle. / First official release.

### Français

**Tableau de bord**
- Sections configurables : fils RSS, météo, trajets, pointages sportifs, API JSON.
- Plusieurs pages (onglets), cartes sur 1, 2 ou 3 colonnes ou en pleine largeur.
- Disposition par glisser-déposer, à la souris comme au doigt : chaque carte garde la colonne où elle est déposée. Annulation et réorganisation automatique.
- Pastille « Nouveau » sur les articles parus depuis la dernière visite.
- Thèmes clair et sombre, couleur d'accent, densité, interface en français et en anglais.

**Sources**
- Météo : Open-Meteo, avec les alertes d'Environnement Canada.
- Trajets : OSRM, TomTom (circulation en direct) ou capteur Home Assistant.
- Pointages : ESPN, HockeyTech et API-Sports ; choix des équipes par ligue, classement, mise à jour chaque minute pendant un match.
- Chaque source est interrogée au plus une fois par intervalle, réglable par section ; une icône met une section à jour sur demande.

**Fiabilité et sécurité**
- Les clés et jetons ne sont jamais renvoyés au navigateur ni inclus dans les exports.
- Cache DNS, nouvelles tentatives sur les pannes passagères, requêtes sortantes limitées.
- La page se recharge seule après une mise à jour ; les fichiers sont servis à une adresse versionnée, compatible avec les proxys qui mettent les fichiers en cache.
- Chaque image est testée avant publication (installation neuve, installation renforcée, dossier de données inaccessible).

### English

**Dashboard**
- Configurable sections: RSS feeds, weather, commute, sports scores, JSON API.
- Several pages (tabs); cards 1, 2 or 3 columns wide, or full width.
- Drag-and-drop layout with mouse or touch: each card keeps the column it is dropped in. Undo and auto-arrange.
- "New" badge on articles published since your last visit.
- Light and dark themes, accent colour, density, French and English interface.

**Sources**
- Weather: Open-Meteo, with Environment Canada alerts.
- Commute: OSRM, TomTom (live traffic) or a Home Assistant sensor.
- Scores: ESPN, HockeyTech and API-Sports; pick teams per league, standings, refreshed every minute during a game.
- Each source is queried at most once per interval, adjustable per section; an icon updates one section on demand.

**Reliability and security**
- Keys and tokens are never sent back to the browser or included in exports.
- DNS cache, retries on transient failures, capped outbound requests.
- The page reloads itself after an update; files are served from a versioned address, safe behind proxies that cache static files.
- Every image is tested before publishing (fresh install, hardened install, unwritable data folder).
