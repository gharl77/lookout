# Notes de version / Release notes

Les versions sont numérotées `année.mois.numéro`. / Releases are numbered `year.month.number`.

## À venir / Unreleased

En développement, pas encore publié. / In development, not yet released.

- **Filtres** : mots masqués ou mis en évidence dans tous les fils (Réglages → Général), mise en évidence par section.
- **À lire plus tard** : gardez un article d'un clic ; la liste suit votre profil sur tous vos appareils.
- **Notifications** (iPhone, iPad, Mac, PC) : alertes météo, début et résultat des matchs de vos équipes, nouveaux
  articles des sections de votre choix (un toucher ouvre l'article), même page fermée. Exige HTTPS ; sur iPhone,
  Lookout doit d'abord être ajouté à l'écran d'accueil.
- **Mode affichage** : plein écran pour un écran mural ou une télé, avec l'heure et la rotation des pages.
- **Filters**: words hidden or highlighted in every feed (Settings → General), highlighting per section.
- **Read later**: keep an article in one click; the list follows your profile on all your devices.
- **Notifications** (iPhone, iPad, Mac, PC): weather alerts, start and final score of your teams' games, new
  articles from the sections you choose (tapping opens the article), even with the page closed. Requires HTTPS;
  on iPhone, Lookout must first be added to the Home Screen.
- **Display mode**: full screen for a wall screen or TV, with the time and page rotation.

## 2026.11.2

Lookout devient multiutilisateur. / Lookout becomes multi-user.

### Français

**Comptes et profils**
- Chaque personne a son profil : ses sections, ses sources et ses préférences. Le compte administrateur se crée à la première ouverture ; seuls les administrateurs créent ensuite des profils, à partir des réglages de départ ou en copie d'un autre.
- Une fois connecté sur un appareil, on le reste, malgré les redémarrages et les mises à jour.
- Le mot de passe donné par un administrateur (nouveau profil ou réinitialisation) est provisoire : la personne choisit le sien à sa connexion suivante.
- Mise à jour depuis 2026.11.1 : le premier compte créé hérite des réglages existants, clés comprises. Les anciens fichiers sont conservés dans `data/avant-les-comptes/`.

**Administration**
- Liste des profils, avec qui est en ligne et depuis quels appareils ; déconnexion des appareils d'un profil.
- Consultation en lecture seule du tableau de bord d'un autre profil.
- Envoi d'une copie d'une section à un ou plusieurs profils.
- Clés d'API partagées (TomTom, API-Sports) pour les profils qui n'ont pas la leur ; elles ne sont jamais réaffichées.
- Sauvegarde complète de l'installation (comptes, profils, clés) et restauration, y compris sur une installation neuve.

### English

**Accounts and profiles**
- Each person has a profile: their own sections, sources and preferences. The administrator account is created the first time the app is opened; after that only administrators create profiles, from the default settings or as a copy of another.
- Once signed in on a device you stay signed in, across restarts and updates.
- A password set by an administrator (new profile or reset) is temporary: the person chooses their own at their next sign-in.
- Updating from 2026.11.1: the first account created inherits the existing settings, keys included. The old files are kept in `data/avant-les-comptes/`.

**Administration**
- Profile list showing who is online and from which devices; sign a profile's devices out.
- Read-only view of another profile's dashboard.
- Send a copy of a section to one or more profiles.
- Shared API keys (TomTom, API-Sports) for profiles that have none of their own; they are never displayed again.
- Full backup of the installation (accounts, profiles, keys) and restore, including on a fresh installation.

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
