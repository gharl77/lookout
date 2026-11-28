# Notes de version / Release notes

Les versions sont numérotées `année.mois.numéro`. / Releases are numbered `year.month.number`.

## À venir / Unreleased

### Français

- **Classements** : sans équipe choisie dans la section, celles de la même ligue dans vos sections *Pointages*
  sont reprises ; s'il n'y en a aucune, l'onglet *Mes équipes* explique comment en choisir au lieu de
  disparaître.

### English

- **Standings**: with no team picked in the section, those of the same league in your *Scores* sections are
  used; if there are none, the *My teams* tab explains how to pick some instead of disappearing.

## 2026.11.8

Fiches d'équipe, sujets regroupés, résumé d'article, chargement plus rapide. / Team sheets, grouped topics, article summaries, faster loading.

### Français

- **Classements** : onglet *Mes équipes* (prochains matchs, derniers résultats, meilleurs joueurs de chaque
  équipe suivie) ; limite des séries marquée dans le classement, avec l'écart en points de vos équipes.
- **Sujets regroupés** : plusieurs sources sur le même événement sont réunies sous un seul article, qui nomme
  les autres (*aussi : La Presse, Le Devoir*).
- **Résumé d'un article par Claude** dans le lecteur intégré (clé Anthropic requise, facturé à l'usage).
- **Tout marquer comme lu pour la page** : un bouton ✓ dans la barre du haut (touche `M`), avec annulation ;
  les cartes passent aussitôt aux articles non lus suivants.
- **Nouveaux et non lus d'abord** : chaque carte montre d'abord les articles parus depuis votre dernière
  visite, puis les autres non lus ; un article déjà lu ne revient que s'il reste de la place. Réglable dans
  *Lecture et filtres*.
- **Sections d'articles allégées** : le serveur n'envoie plus que les articles utiles à la carte et à la
  recherche (250 au plus) au lieu de tout ce que les sources renvoient — une section YouTube de 200 chaînes
  passait par 3 000 vidéos à chaque chargement.
- **Réponses compressées** (gzip) : pages, scripts et données pèsent de trois à dix fois moins.
- **Affichage immédiat** : quand les données d'une section sont à renouveler, la carte montre tout de suite
  celles qu'elle a et se met à jour quelques secondes plus tard, au lieu d'attendre toutes les sources.

### English

- **Standings**: a *My teams* tab (upcoming games, recent results, best players of each followed team); the
  playoff line marked in the standings, with your teams' gap in points.
- **Grouped topics**: several sources on the same event are brought together under one article, which names
  the others (*also: La Presse, Le Devoir*).
- **Article summary by Claude** in the built-in reader (Anthropic key required, billed per use).
- **Mark the whole page as read**: a ✓ button in the top bar (`M` key), with undo; cards move on at once to
  the next unread articles.
- **New and unread first**: each card first shows the articles published since your last visit, then the
  other unread ones; an article already read only comes back if there is room left. Adjustable under
  *Reading and filters*.
- **Lighter article sections**: the server now sends only the articles the card and search can use (250 at
  most) instead of everything the sources return — a YouTube section with 200 channels went through 3,000
  videos on every load.
- **Compressed responses** (gzip): pages, scripts and data weigh three to ten times less.
- **Instant display**: when a section's data is due for renewal, the card shows what it has right away and
  updates a few seconds later, instead of waiting for every source.

## 2026.11.7

Classements complets et meneurs de vos ligues. / Full standings and leaders of your leagues.

### Français

- **Section Classements et statistiques** : le classement complet de vos ligues (par association ou par
  division, vos équipes en évidence) et les meneurs par catégorie, avec un onglet par ligue. Ligues ESPN et
  HockeyTech, sans clé. Les meneurs ne sont pas offerts pour le soccer.

### English

- **Standings and statistics section**: the full standings of your leagues (by conference or by division, your
  teams highlighted) and the leaders per category, with one tab per league. ESPN and HockeyTech leagues, no
  key. Leaders are not offered for soccer.

## 2026.11.6

Home Assistant, Bourse, sauvegardes automatiques, heures calmes et résumé du matin. / Home Assistant, stocks, automatic backups, quiet hours and morning summary.

### Français

- **Section Home Assistant** : l'état des entités de votre choix, lues avec un jeton d'accès longue durée ;
  interrupteurs et boutons pour les lumières, prises, stores, scènes et scripts (jamais les serrures ni les
  alarmes).
- **Section Bourse et devises** : cours de titres, d'indices et de devises, avec la variation du jour.
- **Sauvegardes automatiques** : chaque nuit dans `data/backups/`, quatorze jours gardés ; à télécharger ou à
  restaurer depuis *Réglages → Sauvegarde*.
- **Notifications** : heures calmes, résumé du matin (météo, rendez-vous, grands titres) et alerte quand un
  article contient un de vos mots-clés suivis.
- **Doublons** : sous un article, *aussi dans…* nomme les autres sections qui ont reçu la même nouvelle.
- **Recherche** : couvre aussi les événements des agendas.
- **Raccourcis clavier** : `?` en affiche la liste ; nouveaux raccourcis `E`, `L`, `1`–`9`, `←` `→`.
- **YouTube** : interrogé une fois l'heure par défaut ; une chaîne sans vidéo longue n'est plus signalée en
  erreur. Correction : une source durablement en panne faisait redemander toute sa section toutes les deux
  minutes ; elle est maintenant réessayée deux fois, puis au rythme normal.

### English

- **Home Assistant section**: the state of the entities you choose, read with a long-lived access token;
  switches and buttons for lights, plugs, covers, scenes and scripts (never locks or alarms).
- **Stocks and currencies section**: quotes for stocks, indexes and currencies, with the change for the day.
- **Automatic backups**: every night in `data/backups/`, fourteen days kept; download or restore them from
  *Settings → Backup*.
- **Notifications**: quiet hours, a morning summary (weather, events, top headlines) and an alert when an
  article contains one of your followed keywords.
- **Duplicates**: under an article, *also in…* names the other sections that received the same story.
- **Search**: also covers calendar events.
- **Keyboard shortcuts**: `?` lists them; new shortcuts `E`, `L`, `1`–`9`, `←` `→`.
- **YouTube**: queried once an hour by default; a channel with no long video is no longer flagged as failing.
  Fix: a source that stayed down made its whole section get requested every two minutes; it is now retried
  twice, then at the normal pace.

## 2026.11.5

Doublons écartés et « Tout marquer comme lu » en un clic. / Duplicates removed and one-click “Mark all as read”.

### Français

- **Doublons** : une même nouvelle reprise par plusieurs sections d'une page n'apparaît plus qu'une fois, dans
  la première section ; les autres montrent l'article suivant. Réglable dans *Lecture et filtres*.
- **Tout marquer comme lu** : un bouton dans l'en-tête de chaque carte d'articles, avec annulation.

### English

- **Duplicates**: a story carried by several sections of a page now shows only once, in the first section; the
  others show their next article. Adjustable under *Reading and filters*.
- **Mark all as read**: a button in the header of each article card, with undo.

## 2026.11.4

Agenda, lecteur d'article, mode Organiser repensé, sécurité renforcée. / Calendar, article reader, redesigned Arrange mode, hardened security.

### Français

- **Réglages** : *Sections* et *Pages* réunies dans une seule arborescence (menu `⋯` et renommage sur place pour
  chaque page) ; *Dupliquer* et *Supprimer* au bas de la fiche d'une section ; navigation regroupée.
- **Sécurité** : politique de sécurité du contenu (CSP) et en-têtes associés ; le lecteur d'article refuse les
  adresses du réseau local.
- **Robustesse** : arrêt propre du conteneur, caches en mémoire bornés, tests unitaires exécutés à chaque
  construction. Correction : une répétition d'agenda pouvait afficher une occurrence après sa date de fin.
- **Section Agenda** : les prochains événements de vos calendriers par leur adresse iCal (Google, iCloud,
  Outlook), sans clé ni connexion.
- **Lecteur d'article intégré** : le bouton *Lire ici* ouvre le texte d'un article sans quitter Lookout ;
  une option en fait le comportement du clic.
- **Pages déjà garnies** : *+ Page* propose Matin, Actualités, Sports, Cinéma et séries, Techno, Culture, Vidéos.
- **Glisser au doigt** dans la liste des sections des réglages, par une poignée.
- **Mode Organiser repensé** : une palette de sections à cliquer ou à glisser sur la page, à l'endroit voulu.
- **Pages modifiables sur place** : *+ Page* pour en créer une, double-clic pour renommer, glisser un onglet
  pour changer l'ordre, menu `⋯` pour supprimer.
- **Glisser une carte sur un onglet** l'envoie sur cette page ; sur *+ Page*, sur une nouvelle page.
- Une page vide propose d'y ajouter une section directement.
- **Résumé des articles** : l'option existe maintenant pour les présentations *Liste*, *À la une* et *Vignettes* ;
  sans résumé dans le fil, la carte indique « Aucun résumé disponible ».
- **Réglages → Sections** : la liste est une arborescence par page ; on glisse une section sous une autre page,
  ou sur *Nouvelle page*.

### English

- **Settings**: *Sections* and *Pages* merged into one tree (`⋯` menu and in-place renaming for each page);
  *Duplicate* and *Delete* at the bottom of a section's sheet; regrouped navigation.
- **Security**: Content Security Policy and related headers; the article reader refuses local network addresses.
- **Robustness**: clean container shutdown, bounded in-memory caches, unit tests run on every build. Fix: a
  recurring calendar event could show an occurrence after its end date.
- **Calendar section**: upcoming events from your calendars by their iCal address (Google, iCloud, Outlook),
  with no key or sign-in.
- **Built-in article reader**: the *Read here* button opens an article's text without leaving Lookout; an
  option makes it the click behaviour.
- **Ready-made pages**: *+ Page* offers Morning, News, Sports, Movies and series, Tech, Culture, Videos.
- **Touch dragging** in the Settings section list, by a handle.
- **Redesigned Arrange mode**: a palette of sections to click or drag onto the page, right where you want them.
- **Pages edited in place**: *+ Page* to create one, double-click to rename, drag a tab to reorder, `⋯` menu
  to delete.
- **Dragging a card onto a tab** sends it to that page; onto *+ Page*, to a new page.
- An empty page offers to add a section right there.
- **Article summaries**: the option now exists for the *List*, *Headline* and *Thumbnails* layouts; when the
  feed has none, the card says “No summary available”.
- **Settings → Sections**: the list is a tree grouped by page; drag a section under another page, or onto
  *New page*.

## 2026.11.3

Notifications, YouTube, nouvelles sections et réglages repensés. / Notifications, YouTube, new sections and redesigned settings.

Documentation complète dans [`docs/`](docs/README.md). / Full documentation in [`docs/`](docs/README.md).

### Français

**Tableau de bord**
- Recherche dans les articles de toutes les sections et dans « À lire plus tard » (touche `/`).
- « À lire plus tard » : gardez un article d'un clic ; la liste suit votre profil sur tous vos appareils.
- Filtres : mots masqués ou mis en évidence dans tous les fils, mise en évidence par section.
- Mode affichage : plein écran pour un écran mural ou une télé, avec l'heure et la rotation des pages.
- Accueil d'un nouveau profil : quelques questions (ville, sujets, ligues, équipes) préparent son tableau de bord.

**Sections et sources**
- Catalogue de fils : 23 catégories et plus de 150 fils vérifiés, offerts aussi en sections prêtes à l'emploi.
- YouTube : dernières vidéos de vos chaînes en vignettes, lues dans Lookout ; ajout par adresse ou @nom, import depuis Google Takeout, ou synchronisation avec un compte Google.
- Sorties : nouvelles saisons de séries (TVmaze) et films en salle ou à venir (TMDB).
- Résumé du jour : l'essentiel de vos fils en quelques points, par Claude (clé Anthropic).
- Nouvelle présentation « Vignettes » pour les fils.

**Notifications** (iPhone, iPad, Mac, PC)
- Alertes météo, début et résultat des matchs de vos équipes, nouveaux articles des sections de votre choix.
- Un toucher sur la notification d'un article l'ouvre. Exige HTTPS ; sur iPhone, Lookout doit être ajouté à l'écran d'accueil.

**Réglages**
- Navigation latérale en quatre groupes, une rubrique par sujet, recherche dans les réglages ; sur téléphone, une rubrique à la fois.
- Créer une page directement depuis le choix de la page d'une section.

**Administration**
- Clés partagées : TMDB, Anthropic et connexion Google s'ajoutent à TomTom et API-Sports.
- La clé Anthropic partagée est réservée aux profils choisis, avec un modèle plafond et le suivi de la dépense par profil.
- État des sources : les sources en panne de tous les profils, et depuis quand.

### English

**Dashboard**
- Search across the articles of every section and “Read later” (`/` key).
- “Read later”: keep an article in one click; the list follows your profile on all your devices.
- Filters: words hidden or highlighted in every feed, highlighting per section.
- Display mode: full screen for a wall screen or TV, with the time and page rotation.
- Welcome for a new profile: a few questions (city, topics, leagues, teams) set up its dashboard.

**Sections and sources**
- Feed catalogue: 23 categories and over 150 verified feeds, also offered as ready-made sections.
- YouTube: latest videos from your channels as thumbnails, played inside Lookout; add by address or @name, import from Google Takeout, or sync with a Google account.
- Releases: new series seasons (TVmaze) and movies in theatres or upcoming (TMDB).
- Daily summary: the essentials of your feeds in a few points, by Claude (Anthropic key).
- New “Thumbnails” layout for feeds.

**Notifications** (iPhone, iPad, Mac, PC)
- Weather alerts, start and final score of your teams' games, new articles from the sections you choose.
- Tapping an article notification opens it. Requires HTTPS; on iPhone, Lookout must be added to the Home Screen.

**Settings**
- Side navigation in four groups, one pane per topic, search within settings; on a phone, one pane at a time.
- Create a page straight from a section's page choice.

**Administration**
- Shared keys: TMDB, Anthropic and Google sign-in join TomTom and API-Sports.
- The shared Anthropic key is reserved for chosen profiles, with a model ceiling and per-profile spending.
- Source status: the failing sources of every profile, and since when.

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
