// Lookout — traduction. Le français est la langue du code : chaque texte français sert de clé,
// et ce dictionnaire donne son équivalent anglais. Partagé par le navigateur et le serveur.

export const EN = {
  // Général
  "à l'instant": 'just now', 'Annuler': 'Cancel', 'Terminé': 'Done', 'Erreur': 'Error', 'Erreur {0}': 'Error {0}',
  'Serveur Lookout injoignable': 'Lookout server unreachable', 'Enregistrement impossible : {0}': 'Could not save: {0}',
  'Actualisation…': 'Refreshing…', 'Mis à jour à {0}': 'Updated at {0}', 'Mis à jour {0}': 'Updated {0}',
  'Bonne nuit': 'Good night', 'Bonjour': 'Good morning', 'Bon après-midi': 'Good afternoon', 'Bonsoir': 'Good evening',
  'Actualiser': 'Refresh', 'Organiser': 'Arrange', 'Réglages': 'Settings', 'Actions': 'Actions',
  'Actualiser toutes les sections': 'Refresh all sections',
  'Réorganiser, redimensionner ou masquer les sections': 'Rearrange, resize or hide sections',
  'Configurer les sections et les sources': 'Configure sections and sources',
  'Glissez une section pour la déplacer, ou utilisez les boutons de chaque carte.': 'Drag a section to move it, or use the buttons on each card.',
  'Ajouter une section': 'Add a section', 'Pleine largeur': 'Full width', '1 colonne': '1 column', '2 colonnes': '2 columns',
  'Tout marquer comme lu': 'Mark all as read', 'Largeur': 'Width', 'Configurer…': 'Configure…', 'Masquer': 'Hide',
  'Source': 'Source', 'Déplacer vers le début': 'Move toward the start', 'Déplacer vers la fin': 'Move toward the end',
  'Élargir': 'Widen', 'Réduire': 'Shrink', 'Changer la largeur': 'Change width', 'Masquer la section': 'Hide section',
  'Chargement': 'Loading', 'Certaines sources sont en erreur': 'Some sources have errors',
  'Options de la section {0}': 'Options for the {0} section', 'Options': 'Options',
  'Actualisation impossible : {0}': 'Could not refresh: {0}', 'Réessayer': 'Retry',
  'Votre tableau de bord est vide': 'Your dashboard is empty',
  'Ajoutez ou réactivez des sections dans les réglages.': 'Add or re-enable sections in Settings.',
  'Ouvrir les réglages': 'Open Settings',

  // Articles
  'Ouvrir': 'Open', 'Copier le lien': 'Copy link', 'Marquer comme non lu': 'Mark as unread', 'Marquer comme lu': 'Mark as read',
  'Aucun article ne correspond aux filtres.': 'No articles match the filters.',

  // Météo
  'Dégagé': 'Clear', 'Généralement dégagé': 'Mostly clear', 'Partiellement nuageux': 'Partly cloudy', 'Couvert': 'Overcast',
  'Brouillard': 'Fog', 'Bruine': 'Drizzle', 'Bruine verglaçante': 'Freezing drizzle', 'Pluie faible': 'Light rain', 'Pluie': 'Rain',
  'Pluie forte': 'Heavy rain', 'Pluie verglaçante': 'Freezing rain', 'Neige faible': 'Light snow', 'Neige': 'Snow',
  'Neige forte': 'Heavy snow', 'Grains de neige': 'Snow grains', 'Averses': 'Showers', 'Averses fortes': 'Heavy showers',
  'Averses de neige': 'Snow showers', 'Orage': 'Thunderstorm', 'Orage et grêle': 'Thunderstorm with hail',
  'Ressenti': 'Feels like', 'Vent': 'Wind', 'Humidité': 'Humidity', 'Coucher': 'Sunset', 'Lever': 'Sunrise',
  'Maint.': 'Now', 'Auj.': 'Today', '{0} : {1}, minimum {2}, maximum {3}': '{0}: {1}, low {2}, high {3}',

  // Sports
  'Aucun match pour vos équipes ces jours-ci.': 'No games for your teams these days.', 'Aucun match pour le moment.': 'No games right now.',
  "Aujourd'hui": 'Today', 'Hier': 'Yesterday', 'Demain': 'Tomorrow',
  'Final (TB)': 'Final (SO)', 'Final (Prol.)': 'Final (OT)', 'Final': 'Final', 'Entracte {0}': 'Intermission {0}',

  // Trajets
  'arrivée {0}': 'arrive {0}', 'via {0}': 'via {0}', 'ou via {0} · {1}': 'or via {0} · {1}', 'ou autre itinéraire · {0}': 'or another route · {0}',
  "Ouvrir l'itinéraire dans Plans": 'Open the route in Maps', 'Trajet': 'Route', 'Circulation : +{0} min': 'Traffic: +{0} min',

  // Types de sections
  'Fils RSS': 'RSS feeds', 'Articles de un ou plusieurs fils RSS / Atom': 'Articles from one or more RSS / Atom feeds',
  'Météo': 'Weather', 'Conditions et prévisions (API Open-Meteo)': 'Conditions and forecast (Open-Meteo API)',
  'Trajets': 'Commute', 'Temps de parcours (API OSRM, TomTom ou Home Assistant)': 'Travel times (OSRM, TomTom or Home Assistant API)',
  'Pointages sportifs': 'Sports scores', 'Résultats et matchs à venir (API ESPN, HockeyTech ou API-Sports)': 'Results and upcoming games (ESPN, HockeyTech or API-Sports API)',
  'API JSON': 'JSON API', "Liste tirée de n'importe quelle API JSON": 'A list pulled from any JSON API',
  'Pointages': 'Scores', 'À la une': 'Top stories', 'Techno': 'Tech', 'Économie': 'Business', 'Actualités': 'News',
  'Nouveau fil': 'New feed', 'Nouveau trajet': 'New route', ' (copie)': ' (copy)',
  'LNH': 'NHL', 'LCF': 'CFL', 'LPHF': 'PWHL', 'LHJMQ': 'QMJHL', 'LAH': 'AHL', 'Ligue des champions': 'Champions League',
  'Football américain': 'American football',

  // Réglages — commun
  'Diminuer': 'Decrease', 'Augmenter': 'Increase', 'Couleur {0}': 'Colour {0}', 'Couleur personnalisée': 'Custom colour',
  'Monter': 'Move up', 'Descendre': 'Move down', 'Supprimer': 'Delete', 'Erreur : {0}': 'Error: {0}', 'Source fonctionnelle': 'Source is working',
  "Nombre d'articles": 'Number of articles', 'Nombre de matchs': 'Number of games', 'Nombre de trajets': 'Number of routes',
  'Choisir une icône': 'Choose an icon', 'Titre': 'Title', 'Icône': 'Icon', 'Couleur': 'Colour',
  'Afficher dans le tableau de bord': 'Show on the dashboard', 'Activer {0}': 'Enable {0}',

  // Réglages — fils RSS
  'Sources': 'Sources', 'Nom de la source': 'Source name', 'Adresse du fil': 'Feed address', 'Ajouter un fil RSS': 'Add an RSS feed',
  'Suggestions': 'Suggestions',
  "Collez l'adresse de n'importe quel fil RSS ou Atom. L'ordre des sources sert à alterner les articles.": 'Paste the address of any RSS or Atom feed. The order of the sources is used to alternate articles.',
  'Affichage': 'Display', 'Présentation': 'Layout', 'Liste': 'List', 'Titres seulement': 'Headlines only', 'Ordre': 'Order',
  "Plus récents d'abord": 'Newest first', 'Alterner entre les sources': 'Alternate between sources', 'Images': 'Images',
  'Résumé': 'Summary', 'Sous-titre': 'Subtitle', 'Nom de la source ': 'Source name', 'Heure de publication': 'Publication time',
  'Filtres': 'Filters', 'Âge maximal': 'Maximum age', 'Aucune limite': 'No limit', '12 heures': '12 hours', '24 heures': '24 hours',
  '48 heures': '48 hours', '3 jours': '3 days', '7 jours': '7 days', 'Doit contenir': 'Must contain', 'ex. Canadiens, budget': 'e.g. Canadiens, budget',
  'Exclure': 'Exclude', 'ex. horoscope, publicité': 'e.g. horoscope, sponsored',
  'Mots-clés séparés par des virgules, recherchés dans le titre et le résumé.': 'Comma-separated keywords, searched in the title and summary.',

  // Réglages — météo
  'Ville ou code postal': 'City or postal code', 'Changer de lieu': 'Change location', 'Aucun lieu trouvé pour « {0} ».': 'No place found for “{0}”.',
  'Lieu': 'Location', 'Lieu actuel': 'Current location', 'Rechercher': 'Search', 'Ressenti, vent, humidité et soleil': 'Feels like, wind, humidity and sun',
  'Détails': 'Details', 'Prévisions horaires': 'Hourly forecast', 'Heures affichées': 'Hours shown', 'Prévisions quotidiennes': 'Daily forecast',
  'Jours affichés': 'Days shown',

  // Réglages — trajets
  'Voiture': 'Car', 'À pied': 'Walking', 'Nom du trajet (ex. Maison → Bureau)': 'Route name (e.g. Home → Office)',
  'Entité du capteur (ex. sensor.waze_travail)': 'Sensor entity (e.g. sensor.waze_work)', 'Adresse de départ': 'Start address',
  'Adresse de destination': 'Destination address', 'Ajouter un trajet': 'Add a route',
  'Chaque trajet lit un capteur de temps de trajet de Home Assistant (intégration Waze Travel Time ou Google Maps).': 'Each route reads a Home Assistant travel-time sensor (Waze Travel Time or Google Maps integration).',
  'Entrez des adresses complètes ou des noms de lieux. Le temps de parcours est calculé pour un départ immédiat.': 'Enter full addresses or place names. Travel time is computed for leaving now.',
  'Calcul': 'Routing', 'Service': 'Service', 'OSRM (sans circulation)': 'OSRM (no traffic)', 'TomTom (avec circulation)': 'TomTom (with traffic)',
  'Home Assistant (Waze)': 'Home Assistant (Waze)', 'Clé TomTom': 'TomTom key', 'Clé gratuite de developer.tomtom.com': 'Free key from developer.tomtom.com',
  'Adresse': 'Address', 'Jeton': 'Token', "Jeton d'accès longue durée": 'Long-lived access token',
  'Afficher les itinéraires de rechange': 'Show alternate routes', 'Itinéraires de rechange': 'Alternate routes',
  'OSRM est un service libre, sans données de circulation en direct.': 'OSRM is a free service, without live traffic data.',
  'TomTom tient compte de la circulation en direct. La clé est enregistrée en clair sur le serveur.': 'TomTom accounts for live traffic. The key is stored in plain text on the server.',
  'Le temps affiché est celui que Waze fournit à Home Assistant. Le jeton est enregistré en clair sur le serveur.': 'The time shown is the one Waze gives Home Assistant. The token is stored in plain text on the server.',

  // Réglages — sports
  'Toutes les équipes': 'All teams', '{0} équipes': '{0} teams', 'Choisir les équipes à afficher': 'Choose which teams to show',
  'Chargement des équipes…': 'Loading teams…', 'Rechercher une équipe': 'Search for a team',
  'Liste complète indisponible ({0}). Les équipes des matchs récents restent sélectionnables.': 'Full list unavailable ({0}). Teams from recent games can still be selected.',
  'Tapez au moins 3 lettres, puis Rechercher.': 'Type at least 3 letters, then Search.', 'ex. NHL, Canada, Premier League': 'e.g. NHL, Canada, Premier League',
  'Nom de la ligue': 'League name', '« {0} » ajoutée.': '“{0}” added.', 'Aucune ligue trouvée.': 'No league found.',
  'Ajouter une ligue API-Sports': 'Add an API-Sports league', 'Sport': 'Sport', 'Ligues et équipes': 'Leagues and teams',
  'Chemin ESPN': 'ESPN path', 'sport/ligue': 'sport/league', 'Autre ligue ESPN…': 'Other ESPN league…',
  'HockeyTech — hockey junior, féminin et LAH': 'HockeyTech — junior, women’s and AHL hockey',
  'Rechercher une ligue…': 'Search for a league…', 'Rechercher une ligue… (clé requise ci-dessous)': 'Search for a league… (key required below)',
  'Ajouter une ligue': 'Add a league',
  'Pour chaque ligue, choisissez « Toutes les équipes » ou seulement celles que vous suivez. Chemin ESPN : sport/ligue (ex. hockey/nhl, soccer/ita.1).': 'For each league, choose “All teams” or only the ones you follow. ESPN path: sport/league (e.g. hockey/nhl, soccer/ita.1).',
  'Clé API-Sports': 'API-Sports key', 'Facultatif': 'Optional', 'facultatif': 'optional', 'Obtenir une clé gratuite sur api-sports.io': 'Get a free key at api-sports.io',
  'Nécessaire seulement pour les ligues API-Sports. Le forfait gratuit permet 100 requêtes par jour et par sport ; Lookout met les réponses en cache pour le respecter. La clé est enregistrée en clair sur le serveur.': 'Only needed for API-Sports leagues. The free plan allows 100 requests per day per sport; Lookout caches responses to stay within it. The key is stored in plain text on the server.',
  "Résultats d'hier": 'Yesterday’s results', 'Matchs de demain': 'Tomorrow’s games', 'Logos des équipes': 'Team logos',

  // Réglages — API JSON
  'Requête': 'Request', 'En-têtes HTTP': 'HTTP headers',
  'Un en-tête par ligne, au format « Nom: valeur » (ex. Authorization: Bearer …). Les clés sont enregistrées en clair sur le serveur.': 'One header per line, as “Name: value” (e.g. Authorization: Bearer …). Keys are stored in plain text on the server.',
  'Correspondance des champs': 'Field mapping', 'Liste des éléments': 'Item list', 'Lien': 'Link', 'Date': 'Date', 'Image': 'Image',
  'ex. data.items (vide = racine)': 'e.g. data.items (empty = root)', 'ex. title': 'e.g. title', 'ex. url': 'e.g. url',
  'facultatif — ISO 8601 ou Unix': 'optional — ISO 8601 or Unix',
  'Chemins pointés dans le JSON : « hits » pour la liste, puis « title » ou « author.name » dans chaque élément.': 'Dotted paths into the JSON: “hits” for the list, then “title” or “author.name” within each item.',

  // Réglages — liste des sections
  'Sans titre': 'Untitled', 'Section masquée': 'Hidden section', 'Sections': 'Sections',
  'Supprimer la section sélectionnée': 'Delete the selected section', 'Supprimer la section': 'Delete section',
  'Supprimer cette section ?': 'Delete this section?',
  'La section et ses sources seront supprimées. Pour la retirer temporairement, désactivez-la plutôt.': 'The section and its sources will be deleted. To remove it temporarily, turn it off instead.',
  'Dupliquer la section sélectionnée': 'Duplicate the selected section', 'Dupliquer la section': 'Duplicate section',
  'Monter la section': 'Move section up', 'Descendre la section': 'Move section down', 'Aucune section sélectionnée': 'No section selected',
  'Choisissez une section, ou ajoutez-en une avec le bouton +.': 'Choose a section, or add one with the + button.',
  'Retour à la liste des sections': 'Back to the section list',

  // Réglages — général
  'Général': 'General', 'Données': 'Data', 'Accueil': 'Welcome', "Afficher le message d'accueil": 'Show the greeting', "Message d'accueil": 'Greeting',
  'Votre prénom': 'Your first name', "Afficher le coup d'œil (météo et premier trajet)": 'Show the at-a-glance summary (weather and first route)',
  "Coup d'œil": 'At a glance', 'Apparence': 'Appearance', 'Thème': 'Theme', 'Automatique': 'Automatic', 'Clair': 'Light', 'Sombre': 'Dark',
  "Couleur d'accent": 'Accent colour', 'Arrière-plan teinté': 'Tinted background', 'Densité': 'Density', 'Compacte': 'Compact',
  'Confortable': 'Comfortable', 'Aérée': 'Spacious', 'Colonnes': 'Columns', 'Langue': 'Language',
  "Automatique suit la langue de l'appareil. Les titres de vos sections et le contenu des sources ne sont pas traduits.": 'Automatic follows the device language. Your section titles and the content of your sources are not translated.',
  "Sur un écran étroit comme celui d'un iPhone, les cartes passent automatiquement sur une colonne.": 'On a narrow screen such as an iPhone, cards automatically switch to a single column.',
  'Actualisation et unités': 'Refresh and units', 'Actualiser automatiquement': 'Refresh automatically', 'Jamais (manuel)': 'Never (manual)',
  'Toutes les 5 minutes': 'Every 5 minutes', 'Toutes les 15 minutes': 'Every 15 minutes', 'Toutes les 30 minutes': 'Every 30 minutes',
  'Toutes les heures': 'Every hour', 'Unités': 'Units', 'Métrique (°C, km)': 'Metric (°C, km)', 'Impérial (°F, mi)': 'Imperial (°F, mi)',
  'Lecture': 'Reading', 'Atténuer les articles déjà lus': 'Dim articles already read', 'Atténuer les articles lus': 'Dim read articles',
  "L'état « lu » est enregistré sur le serveur : il est partagé entre tous vos appareils.": 'The “read” state is stored on the server, so it is shared across all your devices.',

  // Réglages — données
  "Ce fichier n'est pas une configuration Lookout valide.": 'This file is not a valid Lookout configuration.',
  'Importer cette configuration ?': 'Import this configuration?', 'La configuration actuelle sera remplacée.': 'The current configuration will be replaced.',
  'Importer': 'Import', 'Configuration importée.': 'Configuration imported.', "Ce fichier n'est pas du JSON valide.": 'This file is not valid JSON.',
  'Sauvegarde': 'Backup', 'Exporter la configuration': 'Export the configuration', 'Configuration exportée.': 'Configuration exported.',
  'Exporter…': 'Export…', 'Importer une configuration': 'Import a configuration', 'Importer…': 'Import…',
  "Le fichier JSON contient toutes vos sections, sources et préférences. Il est compatible avec celui de l'app Mac (sauf le service de trajets).": 'The JSON file contains all your sections, sources and preferences. It is compatible with the Mac app’s file (except the commute service).',
  'Fichier de configuration': 'Configuration file', 'Emplacement': 'Location', 'Dans le dossier de données du conteneur, sur le serveur.': 'In the container’s data folder, on the server.',
  'Revenir à la configuration de départ': 'Restore the default configuration', 'Réinitialiser toute la configuration ?': 'Reset the whole configuration?',
  "Toutes vos sections et sources seront remplacées par celles de départ. Exportez d'abord votre configuration si vous voulez la conserver.": 'All your sections and sources will be replaced by the defaults. Export your configuration first if you want to keep it.',
  'Réinitialiser': 'Reset', 'Configuration réinitialisée.': 'Configuration reset.', 'Réinitialiser…': 'Reset…', 'Version': 'Version',

  // Serveur
  'Erreur interne du serveur': 'Internal server error', 'Requête trop volumineuse': 'Request too large', 'JSON invalide': 'Invalid JSON',
  'Section introuvable': 'Section not found', 'Ligue introuvable': 'League not found', 'Introuvable': 'Not found',
  'Adresse introuvable : « {0} »': 'Address not found: “{0}”', 'Aucun itinéraire trouvé': 'No route found',
  'Clé TomTom manquante (voir les réglages de la section)': 'TomTom key missing (see the section settings)', 'Clé TomTom refusée': 'TomTom key rejected',
  'TomTom : {0}': 'TomTom: {0}', 'Adresse ou jeton Home Assistant manquant': 'Home Assistant address or token missing',
  "Indiquez l'entité du capteur (ex. sensor.waze_travail)": 'Enter the sensor entity (e.g. sensor.waze_work)',
  'Jeton Home Assistant refusé': 'Home Assistant token rejected', 'Entité introuvable : {0}': 'Entity not found: {0}',
  'Home Assistant : {0}': 'Home Assistant: {0}', 'Capteur indisponible ({0})': 'Sensor unavailable ({0})', 'Aucun trajet actif': 'No active route',
  'Indiquez un départ et une destination dans les réglages': 'Enter a start and a destination in Settings',
  "Le transport en commun n'est pas offert par ce service": 'Transit is not offered by this service',
  'Aucun article trouvé (fil RSS invalide ?)': 'No articles found (invalid RSS feed?)', 'Aucune source active': 'No active source',
  "Aucune source n'a répondu ({0})": 'No source responded ({0})', 'Aucune liste trouvée au chemin « {0} »': 'No list found at path “{0}”',
  '(racine)': '(root)', 'Aucun élément avec le champ « {0} »': 'No item has the field “{0}”',
  'Aucune ligue active': 'No active league', 'Chemin de ligue invalide (ex. hockey/nhl)': 'Invalid league path (e.g. hockey/nhl)',
  'Ligue introuvable ou indisponible': 'League not found or unavailable', "Liste d'équipes indisponible": 'Team list unavailable',
  'Code ou clé HockeyTech manquant': 'HockeyTech code or key missing', 'Ligue API-Sports invalide': 'Invalid API-Sports league',
  'Clé API-Sports manquante (voir les réglages de la section)': 'API-Sports key missing (see the section settings)',
  'Sport invalide': 'Invalid sport', 'API-Sports : {0}': 'API-Sports: {0}',
  'Adresse invalide': 'Invalid address', 'Adresse manquante': 'Missing address', "Délai d'attente dépassé": 'Request timed out',
  'Serveur introuvable ou connexion impossible': 'Server not found or connection failed', 'Erreur HTTP {0}': 'HTTP error {0}',
  "La réponse n'est pas du JSON valide": 'The response is not valid JSON', 'Réponse météo inattendue': 'Unexpected weather response',
};

let provider = () => 'fr';
/** Le navigateur fournit une langue fixe ; le serveur, celle de la requête en cours. */
export function setLangProvider(fn) { provider = fn; }
export const getLang = () => (provider() === 'en' ? 'en' : 'fr');

/** Choisit la langue à partir du réglage (« auto », « fr », « en ») et des langues préférées de l'appareil. */
export function resolveLang(setting, preferred = []) {
  if (setting === 'fr' || setting === 'en') return setting;
  for (const tag of preferred) {
    const base = String(tag).toLowerCase().slice(0, 2);
    if (base === 'fr' || base === 'en') return base;
  }
  return 'fr';
}

/** Traduit un texte ; {0}, {1}… sont remplacés par les arguments. */
export function t(key, ...args) {
  const text = getLang() === 'en' ? (EN[key] ?? key) : key;
  return args.length ? text.replace(/\{(\d)\}/g, (m, i) => (args[i] ?? m)) : text;
}

/** Traduit un texte statique s'il est connu, en conservant les espaces autour. Sinon le renvoie tel quel. */
export function tr(text) {
  if (getLang() !== 'en' || typeof text !== 'string') return text;
  const core = text.trim();
  const hit = EN[core];
  return hit === undefined ? text : text.replace(core, hit);
}
