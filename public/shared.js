// Modèle de configuration partagé par le serveur et le navigateur.

import { t } from './i18n.js';

export function uuid() {
  // crypto.randomUUID() n'existe pas hors HTTPS dans le navigateur ; getRandomValues, si.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const KINDS = {
  feed: { label: 'Fils RSS', detail: 'Articles de un ou plusieurs fils RSS / Atom', icon: 'newspaper.fill', color: '#EF4444', maxItems: 6 },
  weather: { label: 'Météo', detail: 'Conditions et prévisions (API Open-Meteo)', icon: 'cloud.sun.fill', color: '#0EA5E9', maxItems: 1 },
  commute: { label: 'Trajets', detail: 'Temps de parcours (API OSRM, TomTom ou Home Assistant)', icon: 'car.fill', color: '#10B981', maxItems: 4 },
  sports: { label: 'Pointages sportifs', detail: 'Résultats et matchs à venir (API ESPN, HockeyTech ou API-Sports)', icon: 'sportscourt.fill', color: '#F59E0B', maxItems: 8 },
  standings: { label: 'Classements et statistiques', detail: 'Classement complet et meneurs de vos ligues (ESPN, HockeyTech)', icon: 'trophy.fill', color: '#F59E0B', maxItems: 5 },
  api: { label: 'API JSON', detail: "Liste tirée de n'importe quelle API JSON", icon: 'curlybraces', color: '#8B5CF6', maxItems: 6 },
  calendar: { label: 'Agenda', detail: 'Prochains événements de vos calendriers (adresse iCal : Google, iCloud, Outlook)', icon: 'calendar', color: '#EC4899', maxItems: 8 },
  hass: { label: 'Home Assistant', detail: 'États de vos entités, avec interrupteurs (jeton d’accès longue durée)', icon: 'house.fill', color: '#14B8A6', maxItems: 12 },
  stocks: { label: 'Bourse et devises', detail: 'Cours de titres, d’indices et de devises (Yahoo Finance)', icon: 'chart.line.uptrend.xyaxis', color: '#22C55E', maxItems: 8 },
  releases: { label: 'Sorties', detail: 'Films en salle et nouvelles saisons de séries (TMDB, TVmaze)', icon: 'film.fill', color: '#F97316', maxItems: 12 },
};

export const SWATCHES = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#10B981', '#14B8A6', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

/**
 * Catalogue de fils RSS, par catégorie. Chaque fil : [nom, adresse, langue]. Chaque catégorie peut aussi devenir
 * une section prête à l'emploi (icône, couleur, premiers fils dans la langue de l'interface).
 * Tous ces fils ont été vérifiés avec le lecteur de Lookout ; un site peut bien sûr changer d'adresse plus tard.
 */
export const FEED_CATALOG = [
  { name: 'Actualités', icon: 'newspaper.fill', color: '#EF4444', feeds: [
    ['Radio-Canada – À la une', 'https://ici.radio-canada.ca/rss/4159', 'fr'],
    ['Radio-Canada – En continu', 'https://ici.radio-canada.ca/rss/1000524', 'fr'],
    ['Radio-Canada – Grand Montréal', 'https://ici.radio-canada.ca/rss/4201', 'fr'],
    ['La Presse', 'https://www.lapresse.ca/actualites/rss', 'fr'],
    ['Le Devoir', 'https://www.ledevoir.com/rss/manchettes.xml', 'fr'],
    ['Le Journal de Montréal', 'https://www.journaldemontreal.com/rss.xml', 'fr'],
    ['TVA Nouvelles', 'https://www.tvanouvelles.ca/rss.xml', 'fr'],
    ["L'actualité", 'https://lactualite.com/feed/', 'fr'],
    ['CBC Top Stories', 'https://www.cbc.ca/webfeed/rss/rss-topstories', 'en'],
    ['CBC Montreal', 'https://www.cbc.ca/webfeed/rss/rss-canada-montreal', 'en'],
    ['The Globe and Mail', 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/', 'en'],
    ['Global News', 'https://globalnews.ca/feed/', 'en'] ] },
  { name: 'International', icon: 'globe.americas.fill', color: '#14B8A6', feeds: [
    ['Le Monde', 'https://www.lemonde.fr/rss/une.xml', 'fr'],
    ['Radio-Canada – International', 'https://ici.radio-canada.ca/rss/96', 'fr'],
    ['La Presse – International', 'https://www.lapresse.ca/international/rss', 'fr'],
    ['Le Devoir – Monde', 'https://www.ledevoir.com/rss/section/monde.xml', 'fr'],
    ['France 24', 'https://www.france24.com/fr/rss', 'fr'],
    ['RFI', 'https://www.rfi.fr/fr/rss', 'fr'],
    ['Courrier international', 'https://www.courrierinternational.com/feed/all/rss.xml', 'fr'],
    ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'en'],
    ['The Guardian – World', 'https://www.theguardian.com/world/rss', 'en'],
    ['NYT – World', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'en'],
    ['NPR – World', 'https://feeds.npr.org/1004/rss.xml', 'en'],
    ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'en'] ] },
  { name: 'Politique', icon: 'building.columns.fill', color: '#64748B', feeds: [
    ['Radio-Canada – Politique', 'https://ici.radio-canada.ca/rss/4175', 'fr'],
    ['La Presse – Politique', 'https://www.lapresse.ca/actualites/politique/rss', 'fr'],
    ['Le Devoir – Politique', 'https://www.ledevoir.com/rss/section/politique.xml', 'fr'],
    ['CBC – Politics', 'https://www.cbc.ca/webfeed/rss/rss-politics', 'en'],
    ['Politico', 'https://rss.politico.com/politics-news.xml', 'en'] ] },
  { name: 'Économie', icon: 'chart.line.uptrend.xyaxis', color: '#22C55E', feeds: [
    ['Radio-Canada – Économie', 'https://ici.radio-canada.ca/rss/5717', 'fr'],
    ['La Presse – Affaires', 'https://www.lapresse.ca/affaires/rss', 'fr'],
    ['Les Affaires', 'https://www.lesaffaires.com/rss/', 'fr'],
    ['Le Devoir – Économie', 'https://www.ledevoir.com/rss/section/economie.xml', 'fr'],
    ['CBC – Business', 'https://www.cbc.ca/webfeed/rss/rss-business', 'en'],
    ['Bloomberg – Markets', 'https://feeds.bloomberg.com/markets/news.rss', 'en'],
    ['CNBC', 'https://www.cnbc.com/id/100003114/device/rss/rss.html', 'en'] ] },
  { name: 'Techno', icon: 'cpu.fill', color: '#6366F1', feeds: [
    ['Numerama', 'https://www.numerama.com/feed/', 'fr'],
    ['MacGeneration', 'https://www.macg.co/news/feed', 'fr'],
    ['Radio-Canada – Techno', 'https://ici.radio-canada.ca/rss/4169', 'fr'],
    ['Frandroid', 'https://www.frandroid.com/feed', 'fr'],
    ['Le Journal du Geek', 'https://www.journaldugeek.com/feed/', 'fr'],
    ['Next', 'https://next.ink/feed/', 'fr'],
    ['Korben', 'https://korben.info/feed', 'fr'],
    ['The Verge', 'https://www.theverge.com/rss/index.xml', 'en'],
    ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'en'],
    ['9to5Mac', 'https://9to5mac.com/feed/', 'en'],
    ['MacRumors', 'https://feeds.macrumors.com/MacRumorsAll', 'en'],
    ['TechCrunch', 'https://techcrunch.com/feed/', 'en'],
    ['Wired', 'https://www.wired.com/feed/rss', 'en'],
    ['Engadget', 'https://www.engadget.com/rss.xml', 'en'],
    ['Hacker News', 'https://hnrss.org/frontpage', 'en'] ] },
  { name: 'Intelligence artificielle', icon: 'bolt.fill', color: '#8B5CF6', feeds: [
    ['The Verge – AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'en'],
    ['Ars Technica – AI', 'https://arstechnica.com/ai/feed/', 'en'],
    ['MIT Technology Review – AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 'en'],
    ['Simon Willison', 'https://simonwillison.net/atom/everything/', 'en'] ] },
  { name: 'Science', icon: 'atom', color: '#0EA5E9', feeds: [
    ['Radio-Canada – Science', 'https://ici.radio-canada.ca/rss/4165', 'fr'],
    ['Futura', 'https://www.futura-sciences.com/rss/actualites.xml', 'fr'],
    ['Sciences et Avenir', 'https://www.sciencesetavenir.fr/rss.xml', 'fr'],
    ['Québec Science', 'https://www.quebecscience.qc.ca/feed/', 'fr'],
    ['Agence Science-Presse', 'https://www.sciencepresse.qc.ca/rss.xml', 'fr'],
    ['Phys.org', 'https://phys.org/rss-feed/', 'en'],
    ['Science Daily', 'https://www.sciencedaily.com/rss/top/science.xml', 'en'],
    ['Nature', 'https://www.nature.com/nature.rss', 'en'] ] },
  { name: 'Espace', icon: 'star.fill', color: '#3B82F6', feeds: [
    ['Ciel & Espace', 'https://www.cieletespace.fr/rss.xml', 'fr'],
    ['NASA', 'https://www.nasa.gov/feed/', 'en'],
    ['Space.com', 'https://www.space.com/feeds/all', 'en'],
    ['Universe Today', 'https://www.universetoday.com/feed/', 'en'],
    ['SpaceNews', 'https://spacenews.com/feed/', 'en'] ] },
  { name: 'Santé', icon: 'cross.case.fill', color: '#EC4899', feeds: [
    ['Radio-Canada – Santé', 'https://ici.radio-canada.ca/rss/4171', 'fr'],
    ['La Presse – Santé', 'https://www.lapresse.ca/actualites/sante/rss', 'fr'],
    ['BBC – Health', 'https://feeds.bbci.co.uk/news/health/rss.xml', 'en'],
    ['NYT – Health', 'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml', 'en'] ] },
  { name: 'Environnement', icon: 'leaf.fill', color: '#10B981', feeds: [
    ['Radio-Canada – Environnement', 'https://ici.radio-canada.ca/rss/92408', 'fr'],
    ['La Presse – Environnement', 'https://www.lapresse.ca/actualites/environnement/rss', 'fr'],
    ['Reporterre', 'https://reporterre.net/spip.php?page=backend', 'fr'],
    ['The Guardian – Environment', 'https://www.theguardian.com/environment/rss', 'en'] ] },
  { name: 'Sports', icon: 'sportscourt.fill', color: '#F59E0B', feeds: [
    ['La Presse – Sports', 'https://www.lapresse.ca/sports/rss', 'fr'],
    ['Radio-Canada – Sports', 'https://ici.radio-canada.ca/rss/771', 'fr'],
    ['Le Devoir – Sports', 'https://www.ledevoir.com/rss/section/sports.xml', 'fr'],
    ['DansLesCoulisses', 'https://www.danslescoulisses.com/feed/', 'fr'],
    ["L'Équipe", 'https://dwh.lequipe.fr/api/edito/rss?path=/', 'fr'],
    ['ESPN', 'https://www.espn.com/espn/rss/news', 'en'],
    ['BBC Sport', 'https://feeds.bbci.co.uk/sport/rss.xml', 'en'],
    ['Habs Eyes on the Prize', 'https://www.habseyesontheprize.com/rss/index.xml', 'en'] ] },
  { name: 'Culture', icon: 'star.fill', color: '#EC4899', feeds: [
    ['Radio-Canada – Arts', 'https://ici.radio-canada.ca/rss/4167', 'fr'],
    ['La Presse – Arts', 'https://www.lapresse.ca/arts/rss', 'fr'],
    ['Le Devoir – Culture', 'https://www.ledevoir.com/rss/section/culture.xml', 'fr'],
    ['Le Monde – Culture', 'https://www.lemonde.fr/culture/rss_full.xml', 'fr'],
    ['CBC – Arts', 'https://www.cbc.ca/webfeed/rss/rss-arts', 'en'],
    ['The Guardian – Culture', 'https://www.theguardian.com/culture/rss', 'en'],
    ['NYT – Arts', 'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml', 'en'] ] },
  { name: 'Films', icon: 'film.fill', color: '#F97316', feeds: [
    ['La Presse – Cinéma', 'https://www.lapresse.ca/cinema/rss', 'fr'],
    ['Radio-Canada – Cinéma', 'https://ici.radio-canada.ca/rss/1000229', 'fr'],
    ['Le Devoir – Cinéma', 'https://www.ledevoir.com/rss/section/culture/cinema.xml', 'fr'],
    ['AlloCiné – Cinéma', 'https://www.allocine.fr/rss/news-cine.xml', 'fr'],
    ['Écran Large', 'https://www.ecranlarge.com/rss', 'fr'],
    ['Variety – Film', 'https://variety.com/v/film/feed/', 'en'],
    ['Deadline', 'https://deadline.com/feed/', 'en'],
    ['The Hollywood Reporter', 'https://www.hollywoodreporter.com/feed/', 'en'],
    ['IndieWire', 'https://www.indiewire.com/feed/', 'en'],
    ['/Film', 'https://www.slashfilm.com/feed/', 'en'],
    ['Collider', 'https://collider.com/feed/', 'en'] ] },
  { name: 'Séries et télé', icon: 'desktopcomputer', color: '#8B5CF6', feeds: [
    ['La Presse – Télé', 'https://www.lapresse.ca/arts/television/rss', 'fr'],
    ['AlloCiné – Séries', 'https://www.allocine.fr/rss/news-series.xml', 'fr'],
    ['Le Devoir – Écrans', 'https://www.ledevoir.com/rss/section/culture/ecrans.xml', 'fr'],
    ['Numerama – Pop culture', 'https://www.numerama.com/pop-culture/feed/', 'fr'],
    ['HollywoodPQ', 'https://hollywoodpq.com/feed/', 'fr'],
    ['Variety – TV', 'https://variety.com/v/tv/feed/', 'en'],
    ['TVLine', 'https://tvline.com/feed/', 'en'] ] },
  { name: 'Musique', icon: 'music.note', color: '#EC4899', feeds: [
    ['La Presse – Musique', 'https://www.lapresse.ca/arts/musique/rss', 'fr'],
    ['Le Devoir – Musique', 'https://www.ledevoir.com/rss/section/culture/musique.xml', 'fr'],
    ['Pitchfork', 'https://pitchfork.com/feed/feed-news/rss', 'en'],
    ['Rolling Stone – Music', 'https://www.rollingstone.com/music/feed/', 'en'],
    ['Stereogum', 'https://www.stereogum.com/feed/', 'en'],
    ['Consequence', 'https://consequence.net/feed/', 'en'],
    ['NME', 'https://www.nme.com/feed', 'en'] ] },
  { name: 'Livres', icon: 'book.fill', color: '#F59E0B', feeds: [
    ['La Presse – Littérature', 'https://www.lapresse.ca/arts/litterature/rss', 'fr'],
    ['Radio-Canada – Livres', 'https://ici.radio-canada.ca/rss/1000083', 'fr'],
    ['The Guardian – Books', 'https://www.theguardian.com/books/rss', 'en'],
    ['NYT – Books', 'https://rss.nytimes.com/services/xml/rss/nyt/Books.xml', 'en'],
    ['Literary Hub', 'https://lithub.com/feed/', 'en'] ] },
  { name: 'Jeux vidéo', icon: 'gamecontroller.fill', color: '#22C55E', feeds: [
    ['Jeuxvideo.com', 'https://www.jeuxvideo.com/rss/rss.xml', 'fr'],
    ['Gamekult', 'https://www.gamekult.com/feed.xml', 'fr'],
    ['IGN', 'https://feeds.feedburner.com/ign/all', 'en'],
    ['Polygon', 'https://www.polygon.com/rss/index.xml', 'en'],
    ['Eurogamer', 'https://www.eurogamer.net/feed', 'en'],
    ['Kotaku', 'https://kotaku.com/rss', 'en'],
    ['PC Gamer', 'https://www.pcgamer.com/rss/', 'en'],
    ['Nintendo Life', 'https://www.nintendolife.com/feeds/latest', 'en'],
    ['Rock Paper Shotgun', 'https://www.rockpapershotgun.com/feed', 'en'] ] },
  { name: 'Auto', icon: 'car.fill', color: '#64748B', feeds: [
    ['La Presse – Auto', 'https://www.lapresse.ca/auto/rss', 'fr'],
    ['Roulez Électrique', 'https://roulezelectrique.com/feed/', 'fr'],
    ['AutoHebdo', 'https://www.autohebdo.fr/rss', 'fr'],
    ['Electrek', 'https://electrek.co/feed/', 'en'],
    ['Motor1', 'https://www.motor1.com/rss/news/all/', 'en'],
    ['Car and Driver', 'https://www.caranddriver.com/rss/all.xml/', 'en'] ] },
  { name: 'Cuisine', icon: 'fork.knife', color: '#F97316', feeds: [
    ['La Presse – Gourmand', 'https://www.lapresse.ca/gourmand/rss', 'fr'],
    ['Trois fois par jour', 'https://www.troisfoisparjour.com/fr/feed/', 'fr'],
    ['Bon Appétit', 'https://www.bonappetit.com/feed/rss', 'en'],
    ['Smitten Kitchen', 'https://smittenkitchen.com/feed/', 'en'] ] },
  { name: 'Voyage', icon: 'airplane', color: '#0EA5E9', feeds: [
    ['La Presse – Voyage', 'https://www.lapresse.ca/voyage/rss', 'fr'],
    ['The Guardian – Travel', 'https://www.theguardian.com/travel/rss', 'en'],
    ['NYT – Travel', 'https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml', 'en'],
    ['Condé Nast Traveler', 'https://www.cntraveler.com/feed/rss', 'en'] ] },
  { name: 'Maison et art de vivre', icon: 'house.fill', color: '#14B8A6', feeds: [
    ['La Presse – Maison', 'https://www.lapresse.ca/maison/rss', 'fr'],
    ['La Presse – Société', 'https://www.lapresse.ca/societe/rss', 'fr'],
    ['Apartment Therapy', 'https://www.apartmenttherapy.com/main.rss', 'en'],
    ['Dezeen', 'https://www.dezeen.com/feed/', 'en'] ] },
  { name: 'Photo et design', icon: 'bookmark.fill', color: '#6366F1', feeds: [
    ['Phototrend', 'https://phototrend.fr/feed/', 'fr'],
    ['PetaPixel', 'https://petapixel.com/feed/', 'en'],
    ['DPReview', 'https://www.dpreview.com/feeds/news.xml', 'en'],
    ['Colossal', 'https://www.thisiscolossal.com/feed/', 'en'],
    ['Creative Bloq', 'https://www.creativebloq.com/feeds/all', 'en'] ] },
  { name: 'Humour', icon: 'megaphone.fill', color: '#F59E0B', feeds: [
    ['Le Gorafi', 'https://www.legorafi.fr/feed/', 'fr'],
    ['The Beaverton', 'https://www.thebeaverton.com/feed/', 'en'],
    ['The Onion', 'https://theonion.com/feed/', 'en'],
    ['xkcd', 'https://xkcd.com/rss.xml', 'en'] ] },
];

/** Section de fils prête à l'emploi pour une catégorie : ses trois premiers fils dans la langue donnée (sinon les premiers). */
export function categorySection(category, lang = 'fr') {
  const own = category.feeds.filter((f) => f[2] === lang), picked = (own.length ? own : category.feeds).slice(0, 3);
  const s = newSection('feed', { title: category.name, icon: category.icon, colorHex: category.color });
  s.feed.sources = picked.map(([name, url]) => feedSource(name, url));
  return s;
}

export const LEAGUES = {
  espn: [['LNH', 'hockey/nhl'], ['NFL', 'football/nfl'], ['NBA', 'basketball/nba'], ['MLB', 'baseball/mlb'], ['MLS', 'soccer/usa.1'],
    ['LCF', 'football/cfl'], ['WNBA', 'basketball/wnba'], ['Premier League', 'soccer/eng.1'], ['Ligue 1', 'soccer/fra.1'],
    ['Ligue des champions', 'soccer/uefa.champions']],
  // Ligues HockeyTech : nom, code de la ligue, clé publique de son flux de statistiques.
  hockeytech: [['LHJMQ', 'lhjmq', 'f322673b6bcae299'], ['LPHF', 'pwhl', '446521baf8c38984'], ['OHL', 'ohl', '2976319eb44abe94'],
    ['WHL', 'whl', '41b145a848f4bd67'], ['LAH', 'ahl', '50c2cd9b5e18e390']],
  apisports: [['Soccer', 'football'], ['Hockey', 'hockey'], ['Basketball', 'basketball'], ['Baseball', 'baseball'],
    ['Football américain', 'american-football'], ['Rugby', 'rugby'], ['Handball', 'handball'], ['Volleyball', 'volleyball']],
};

/** Ce que le navigateur reçoit à la place d'une clé enregistrée (voir lib/secrets.js). */
export const SECRET_MASK = '••••••••';

/** Intervalles de mise à jour offerts, en minutes. */
export const REFRESH_CHOICES = [5, 10, 15, 30, 60, 120];

/**
 * Intervalle propre à un type de section, en minutes ; 0 = suivre l'intervalle par défaut des réglages.
 * Les pointages et les trajets changent vite : ils sont interrogés plus souvent que les nouvelles.
 */
export const KIND_REFRESH = { feed: 0, weather: 0, api: 0, commute: 5, sports: 5, releases: 120, calendar: 15, hass: 5, stocks: 15, standings: 60 };

export const PROVIDER_LABELS = { espn: 'ESPN', hockeytech: 'HockeyTech', apisports: 'API-Sports' };

const GENERAL = { displayName: '', showGreeting: true, showGlance: true, appearance: 'system', accentHex: '#3B82F6',
  tintedBackdrop: true, language: 'auto', columns: 0, density: 'comfortable', refreshMinutes: 30, openLinksInBackground: false,
  dimReadArticles: true, units: 'metric',
  unreadFirst: true,      // les articles nouveaux, puis non lus, passent devant ceux déjà lus
  dedupeArticles: true,
  groupTopics: true,      // les articles de sources différentes sur le même sujet sont réunis sous un seul   // une même nouvelle n'apparaît qu'une fois par page
  readerDefault: false,   // un clic sur un article l'ouvre dans le lecteur intégré plutôt que dans un nouvel onglet
  muteKeywords: '', highlightKeywords: '',   // filtres appliqués à tous les fils
  displaySeconds: 30,
  notifyAlerts: true, notifyGameStart: true, notifyGameEnd: false,
  notifyKeywords: false,   // notification quand un article contient un mot-clé suivi (highlightKeywords)
  quietHours: false, quietStart: '22:00', quietEnd: '07:00', quietAllowAlerts: true,   // heures calmes : aucune notification, sauf les alertes météo si on le veut
  morningBrief: false, morningTime: '07:00',   // résumé du matin envoyé en notification
  onboarded: true };   // faux pour un profil tout neuf : il est accueilli par quelques questions à sa première visite   // ce qui déclenche une notification                      // mode affichage : durée de chaque page (0 = ne pas changer de page)
const FEED = { sources: [], layout: 'list', ordering: 'balanced', showImages: true, showSummary: false, showSource: true,
  showTime: true, maxAgeHours: 48, includeKeywords: '', excludeKeywords: '', highlightKeywords: '',
  notify: false,     // notification à chaque nouvel article (sur les appareils abonnés)
  youtube: false,    // section YouTube : les sources sont des chaînes
  playInline: true,
  youtubeSync: false, youtubeSyncedAt: 0 };   // chaînes tenues à jour d'après les abonnements du compte Google relié  // un clic sur une vidéo YouTube l'ouvre dans Lookout plutôt que sur youtube.com
const WEATHER = { locationName: 'Montréal, Québec', latitude: 45.5019, longitude: -73.5674, showDetails: true,
  showHourly: true, hourlyCount: 12, showDaily: true, dailyCount: 7, showAlerts: true };
const COMMUTE = { routes: [], provider: 'osrm', showAlternates: true, tomtomKey: '', hassURL: '', hassToken: '' };
const SPORTS = { leagues: [], showYesterday: true, showUpcoming: true, showLogos: true, apiSportsKey: '',
  showStandings: true, liveRefresh: true };
const API = { url: '', headers: '', itemsPath: '', titlePath: 'title', subtitlePath: '', linkPath: 'url', datePath: '', imagePath: '' };

/** Mots-clés d'un réglage : séparés par des virgules, comparés sans tenir compte de la casse. */
export const keywords = (s) => String(s ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);

/**
 * Filtre des articles d'une section : âge maximal, mots obligatoires, mots exclus (ceux de la section et ceux
 * des réglages généraux). Sert à l'affichage comme aux notifications, pour qu'on ne soit jamais averti d'un
 * article que la carte n'afficherait pas.
 */
export function articleFilter(options, general = {}, now = Date.now()) {
  const include = keywords(options.includeKeywords), exclude = [...keywords(options.excludeKeywords), ...keywords(general.muteKeywords)];
  const cutoff = options.maxAgeHours > 0 ? now - options.maxAgeHours * 3600e3 : null;
  return (a) => {
    if (cutoff && a.date && a.date < cutoff) return false;
    const haystack = `${a.title} ${a.summary}`.toLowerCase();
    return (!include.length || include.some((k) => haystack.includes(k))) && !exclude.some((k) => haystack.includes(k));
  };
}

/** Filtre, trie et limite les articles selon les réglages d'affichage de la section. */
/**
 * `rank` (facultatif) donne le rang d'un article : 0 = nouveau, 1 = non lu, 2 = déjà lu. Les rangs sont servis l'un
 * après l'autre : tant qu'il reste des nouveaux ou des non lus, ils passent devant les articles lus, même plus récents.
 */
export function present(articles, options, sourceOrder, limit, general = {}, skip = null, rank = null) {
  if (rank) {
    const tiers = [[], [], []];
    for (const a of articles) tiers[rank(a)].push(a);
    const out = [];
    // Les doublons de titre sont écartés d'un rang à l'autre aussi.
    const titles = new Set(), fresh = (a) => { const key = a.title.toLowerCase(); return titles.has(key) ? false : (titles.add(key), true); };
    for (const tier of tiers) {
      if (out.length >= limit) break;
      out.push(...present(tier.filter((a) => !titles.has(a.title.toLowerCase())), options, sourceOrder, limit - out.length, general, skip).filter(fresh));
    }
    return out;
  }
  const keep = articleFilter(options, general), seen = new Set();
  const sorted = articles.filter((a) => {
    if (!keep(a) || skip?.(a)) return false;
    const key = a.title.toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  }).sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  if (options.ordering !== 'balanced') return sorted.slice(0, limit);

  // Alterne entre les sources pour qu'un fil très actif ne monopolise pas la section.
  const queues = new Map();
  for (const a of sorted) queues.set(a.source, [...(queues.get(a.source) ?? []), a]);
  const order = [...sourceOrder.filter((n) => queues.has(n)), ...[...queues.keys()].filter((n) => !sourceOrder.includes(n)).sort()];
  const out = [];
  while (out.length < limit) {
    let added = false;
    for (const name of order) {
      const queue = queues.get(name);
      if (out.length < limit && queue.length) { out.push(queue.shift()); added = true; }
    }
    if (!added) break;
  }
  return out;
}

// --- Sujets regroupés : plusieurs sources, un même événement ---
// Mots trop courants pour dire de quoi parle un titre (sans accents, comparés après normalisation).
const STOPWORDS = new Set(('avec pour dans plus sans sous vers chez entre apres avant selon contre cette leur leurs nous vous elle elles sont etre avoir fait faire tout tous toute toutes '
  + 'mais comme aussi encore deja tres bien alors donc dont quand pourquoi comment quel quelle quels quelles votre notre deux trois nouveau nouvelle nouvelles nouveaux premier premiere '
  + 'face annee annees jour jours depuis pendant veut peut doit vont sera serait etait ete voici voila moins autre autres meme '
  + 'the with from that this have will what when where after before about over into than they their were been more says said your here just could would should first year years '
  + 'most some there which while being does make made new news video photos live update').split(' '));
/** Mots significatifs d'un titre : sans accents ni ponctuation, sans mots courants, pluriels ramenés au singulier. */
export function topicWords(title) {
  const text = String(title ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = text.split(/[^a-z0-9]+/);
  // Un pointage (« 6-0 ») distingue un match d'un autre : il compte comme un mot.
  const out = new Set(text.match(/\b\d{1,3}-\d{1,3}\b/g) ?? []);
  for (const w of words) {
    if (w.length < 4 && !/^\d{2,}$/.test(w)) continue;
    if (STOPWORDS.has(w)) continue;
    out.add(w.length > 4 ? w.replace(/(es|s|x)$/, '') : w);
  }
  return out;
}
/**
 * Regroupe les articles qui parlent du même événement d'après leurs titres. Prudent par construction : il faut au
 * moins trois mots significatifs en commun et une forte ressemblance, à moins de deux jours d'écart. Deux titres dans
 * des langues différentes ne se rejoignent donc pas. Renvoie Map(id d'article -> numéro de sujet) pour les seuls
 * sujets couverts par au moins deux articles d'adresses différentes.
 */
export function topicClusters(articles) {
  const seeds = [], byWord = new Map(), assigned = new Map();
  const sorted = [...articles].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  for (const article of sorted) {
    const words = topicWords(article.title);
    if (words.size < 3) continue;
    const shared = new Map();
    for (const w of words) for (const i of byWord.get(w) ?? []) shared.set(i, (shared.get(i) ?? 0) + 1);
    let best = -1, bestScore = 0;
    for (const [i, common] of shared) {
      const seed = seeds[i];
      if (common < 3 || Math.abs((seed.date ?? 0) - (article.date ?? 0)) > 48 * 3600e3) continue;
      const jaccard = common / (words.size + seed.words.size - common), overlap = common / Math.min(words.size, seed.words.size);
      if ((jaccard >= 0.4 || (common >= 4 && overlap >= 0.6)) && jaccard > bestScore) { best = i; bestScore = jaccard; }
    }
    if (best < 0) {
      best = seeds.length;
      seeds.push({ words, date: article.date, members: [] });
      for (const w of words) { if (!byWord.has(w)) byWord.set(w, []); byWord.get(w).push(best); }
    }
    seeds[best].members.push(article);
  }
  seeds.forEach((seed, i) => {
    if (new Set(seed.members.map((a) => a.link ?? a.id)).size < 2) return;
    for (const a of seed.members) assigned.set(a.id, i);
  });
  return assigned;
}

const CALENDAR = { calendars: [], days: 7, showLocation: true, showEnded: false };
export const calendarSource = (name = '', url = '') => ({ id: uuid(), name, url, enabled: true, colorHex: '' });
const STANDINGS = { leagues: [], showStandings: true, showLeaders: true, showTeams: true, upcoming: 5, playoffLine: true, grouping: 'conference', onlyMine: false };
const HASS = { url: '', token: '', entities: [], allowControl: true };
export const hassEntity = (entity = '', name = '') => ({ id: uuid(), entity, name, enabled: true });
/** Domaines Home Assistant qu'un toucher peut actionner, et le service appelé. Les serrures et les alarmes n'en font pas partie. */
export const HASS_ACTIONS = { light: 'toggle', switch: 'toggle', input_boolean: 'toggle', fan: 'toggle', cover: 'toggle', scene: 'turn_on', script: 'turn_on',
  button: 'press', input_button: 'press', automation: 'trigger' };
const STOCKS = { symbols: [], showChange: true };
export const stockSymbol = (symbol = '', name = '') => ({ id: uuid(), symbol, name, enabled: true });
/** Heure « HH:MM » valide, sinon la valeur de repli. */
export const clockTime = (value, fallback) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : fallback);
/** Libellés des codes météo de l'OMM (clés françaises, traduites à l'affichage). */
export const WMO_LABELS = { 0: 'Dégagé', 1: 'Généralement dégagé', 2: 'Partiellement nuageux', 3: 'Couvert', 45: 'Brouillard', 48: 'Brouillard',
  51: 'Bruine', 53: 'Bruine', 55: 'Bruine', 56: 'Bruine verglaçante', 57: 'Bruine verglaçante', 61: 'Pluie faible', 63: 'Pluie',
  65: 'Pluie forte', 66: 'Pluie verglaçante', 67: 'Pluie verglaçante', 71: 'Neige faible', 73: 'Neige', 75: 'Neige forte',
  77: 'Grains de neige', 80: 'Averses', 81: 'Averses', 82: 'Averses fortes', 85: 'Averses de neige', 86: 'Averses de neige',
  95: 'Orage', 96: 'Orage et grêle', 99: 'Orage et grêle' };
const RELEASES = { country: 'CA', days: 7, showMovies: true, showSeries: true, tmdbKey: '' };
/** Modèles offerts pour le résumé, du plus capable au plus économique. */
export const SUMMARY_MODELS = [['claude-opus-5-5', 'Claude Opus 5.5'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5']];
/**
 * Résumé par courriel : un résumé quotidien des sections choisies, envoyé à l'heure dite. Il se règle dans les
 * réglages (rubrique « Résumé par courriel ») et n'a pas de carte sur le tableau de bord.
 */
const DIGEST = { enabled: false, time: '05:30', emailTo: '', sections: [], model: 'claude-opus-5-5', anthropicKey: '', focus: '', points: 5 };
/** Comment une section entre dans le résumé : matière des points, liste de vidéos, coup d'œil — ou pas du tout (null). */
export const digestRole = (s) => (s.kind === 'feed' ? (s.feed.youtube ? 'videos' : 'points') : s.kind === 'api' ? 'points'
  : ['weather', 'calendar', 'commute', 'sports'].includes(s.kind) ? 'glance' : null);

const clone = (x) => JSON.parse(JSON.stringify(x));
export const feedSource = (name, url) => ({ id: uuid(), name, url, enabled: true });
export const catalogSource = (name) => feedSource(name, FEED_CATALOG.flatMap((c) => c.feeds).find((f) => f[0] === name)[1]);
export const league = (name, path, provider = 'espn', key = '') => ({ id: uuid(), name, path, enabled: true, provider, key, teams: [] });
export const commuteRoute = (name = '', from = '', to = '') => ({ id: uuid(), name, from, to, mode: 'driving', enabled: true, entity: '' });

export function newSection(kind, overrides = {}) {
  const k = KINDS[kind];
  return { id: uuid(), kind, title: k.label, icon: k.icon, colorHex: k.color, enabled: true, span: 1, maxItems: k.maxItems,
    refreshMinutes: KIND_REFRESH[kind],
    page: '',     // page du tableau de bord (vide = première page)
    column: -1,   // colonne dans la grille ; -1 = pas encore placée à la main (colonne la moins remplie)
    feed: clone(FEED), weather: clone(WEATHER), commute: clone(COMMUTE), sports: clone(SPORTS), api: clone(API),
    releases: clone(RELEASES), calendar: clone(CALENDAR), hass: clone(HASS), stocks: clone(STOCKS), standings: clone(STANDINGS), ...overrides };
}

/** Identifiant de la vidéo dans une adresse YouTube (vidéo, Short ou lien court), ou null. */
export const youtubeVideoID = (url) => /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(String(url ?? ''))?.[1] ?? null;

// --- YouTube : chaque chaîne a un fil de ses dernières vidéos, sans clé ni compte ---
const YT_FEED = 'https://www.youtube.com/feeds/videos.xml';
/** Adresse du fil d'une chaîne. `videosOnly` : la liste « vidéos » de la chaîne, sans les Shorts ni les directs. */
export const youtubeFeedURL = (channelID, videosOnly = false) => (videosOnly ? `${YT_FEED}?playlist_id=UULF${channelID.slice(2)}` : `${YT_FEED}?channel_id=${channelID}`);
/** Identifiant de chaîne contenu dans l'adresse d'un fil YouTube, ou null. */
export const youtubeChannelID = (url) => /channel_id=(UC[\w-]{22})/.exec(url)?.[1] ?? (/playlist_id=UULF([\w-]{22})/.exec(url) ? `UC${/playlist_id=UULF([\w-]{22})/.exec(url)[1]}` : null);

/** Intervalle par défaut d'une section YouTube, en minutes : une chaîne publie rarement plus d'une vidéo par heure. */
export const YOUTUBE_REFRESH = 60;
/** Section YouTube : des vignettes, les plus récentes d'abord, sur deux colonnes. */
export function youtubeSection() {
  const s = newSection('feed', { title: 'YouTube', icon: 'film.fill', colorHex: '#EF4444', span: 2, maxItems: 8 });
  Object.assign(s.feed, { youtube: true, layout: 'grid', ordering: 'newest', maxAgeHours: 168, showSource: true });
  s.refreshMinutes = YOUTUBE_REFRESH;
  return s;
}

/**
 * Chaînes d'un export Google Takeout (« abonnements.csv » / « subscriptions.csv ») : identifiant, adresse, titre.
 * Renvoie [{ id, name }]. Les lignes qui ne ressemblent pas à une chaîne sont ignorées.
 */
export function parseSubscriptions(text) {
  const channels = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const id = /(?:^|,|\/channel\/)(UC[\w-]{22})(?=,|$|")/.exec(line)?.[1];
    if (!id || channels.has(id)) continue;
    // Le titre est la dernière colonne ; il peut être entre guillemets s'il contient une virgule.
    const quoted = /,"((?:[^"]|"")*)"\s*$/.exec(line), plainTitle = /,([^,"]*)\s*$/.exec(line);
    const name = (quoted ? quoted[1].replace(/""/g, '"') : plainTitle?.[1] ?? '').trim();
    channels.set(id, { id, name: /^https?:|^UC[\w-]{22}$/.test(name) || !name ? id : name });
  }
  return [...channels.values()];
}

/** Nouvelle section prête à l'emploi pour un type donné. */
export function template(kind) {
  const s = newSection(kind);
  if (kind === 'feed') { s.title = 'Nouveau fil'; s.feed.sources = [catalogSource('Radio-Canada – À la une')]; }
  if (kind === 'commute') s.commute.routes = [commuteRoute('Nouveau trajet')];
  if (kind === 'sports') s.sports.leagues = [league('LNH', 'hockey/nhl')];
  if (kind === 'standings') s.standings.leagues = [league('LNH', 'hockey/nhl')];
  if (kind === 'stocks') s.stocks.symbols = [['S&P/TSX', '^GSPTSE'], ['S&P 500', '^GSPC'], ['USD → CAD', 'USDCAD=X'], ['EUR → CAD', 'EURCAD=X']].map(([name, symbol]) => stockSymbol(symbol, name));
  if (kind === 'api') {
    s.title = 'Hacker News';
    s.icon = 'flame.fill';
    Object.assign(s.api, { url: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30', itemsPath: 'hits',
      titlePath: 'title', subtitlePath: 'author', linkPath: 'url', datePath: 'created_at' });
  }
  return s;
}

export function defaultConfig() {
  const news = newSection('feed', { title: 'À la une', span: 2, maxItems: 7 });
  Object.assign(news.feed, { layout: 'headline', showSummary: true,
    sources: ['Radio-Canada – À la une', 'La Presse', 'Le Devoir'].map(catalogSource) });
  const commute = newSection('commute');
  commute.commute.routes = [commuteRoute("Vers l'aéroport", 'Place Ville Marie, Montréal', 'Aéroport Montréal-Trudeau'),
    commuteRoute('Montréal → Québec', 'Montréal, QC', 'Québec, QC')];
  const scores = template('sports');
  scores.title = 'Pointages';
  const tech = newSection('feed', { title: 'Techno', icon: 'cpu.fill', colorHex: '#6366F1', maxItems: 7 });
  tech.feed.sources = ['Numerama', 'MacGeneration', 'The Verge', 'Ars Technica'].map(catalogSource);
  const sportsNews = newSection('feed', { title: 'Sports', icon: 'figure.hockey', colorHex: '#F97316' });
  sportsNews.feed.sources = ['La Presse – Sports', 'Radio-Canada – Sports'].map(catalogSource);
  const world = newSection('feed', { title: 'International', icon: 'globe.europe.africa.fill', colorHex: '#14B8A6' });
  world.feed.sources = ['Le Monde', 'BBC World'].map(catalogSource);
  const economy = newSection('feed', { title: 'Économie', icon: 'chart.line.uptrend.xyaxis', colorHex: '#22C55E', maxItems: 5 });
  economy.feed.sources = ['Radio-Canada – Économie', 'La Presse – Affaires'].map(catalogSource);
  economy.feed.layout = 'compact';
  const hn = template('api');
  hn.feed.layout = 'compact';
  return { version: 1, general: { ...clone(GENERAL), onboarded: false }, pages: [newPage('Accueil')],
    sections: [newSection('weather'), news, commute, scores, tech, sportsNews, world, economy, hn] };
}

export const newPage = (name) => ({ id: uuid(), name });

/** Complète une configuration (importée ou ancienne) avec les valeurs par défaut manquantes. */
export function normalize(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.sections)) throw new Error(t("Ce fichier n'est pas une configuration Lookout valide."));
  const config = { version: 1, general: { ...GENERAL, ...(input.general ?? {}) }, pages: [], sections: [] };
  // Pages : au moins une, chacune avec un identifiant et un nom.
  for (const p of Array.isArray(input.pages) ? input.pages : []) {
    if (p && typeof p.id === 'string' && p.id && !config.pages.some((x) => x.id === p.id)) config.pages.push({ id: p.id, name: String(p.name ?? '').slice(0, 40) });
  }
  if (!config.pages.length) config.pages.push(newPage('Accueil'));
  // Intervalle de mise à jour : toujours une valeur offerte dans les réglages (30 minutes sinon).
  if (!REFRESH_CHOICES.includes(config.general.refreshMinutes)) config.general.refreshMinutes = 30;
  for (const [key, fallback] of [['quietStart', GENERAL.quietStart], ['quietEnd', GENERAL.quietEnd], ['morningTime', GENERAL.morningTime]]) config.general[key] = clockTime(config.general[key], fallback);
  for (const raw of input.sections) {
    if (!raw || !KINDS[raw.kind]) continue;
    const s = newSection(raw.kind, { ...raw });
    s.id = raw.id || uuid();
    // Intervalle absent (configuration d'avant cette option) ou invalide : celui du type de section.
    if (s.refreshMinutes !== 0 && !REFRESH_CHOICES.includes(s.refreshMinutes)) s.refreshMinutes = KIND_REFRESH[s.kind];
    if (!Number.isInteger(s.column) || s.column < -1 || s.column > 3) s.column = -1;
    if (![1, 2, 3, 99].includes(s.span)) s.span = 1;   // largeurs offertes : 1, 2 ou 3 colonnes, ou pleine largeur
    s.feed = { ...FEED, ...(raw.feed ?? {}) };
    s.feed.sources = (s.feed.sources ?? []).map((x) => ({ ...feedSource('', ''), ...x }));
    s.weather = { ...WEATHER, ...(raw.weather ?? {}) };
    s.commute = { ...COMMUTE, ...(raw.commute ?? {}) };
    // Service inconnu ou retiré : on revient au service sans clé.
    if (!['osrm', 'tomtom', 'hass'].includes(s.commute.provider)) s.commute.provider = 'osrm';
    s.commute.routes = (s.commute.routes ?? []).map((x) => ({ ...commuteRoute(), ...x }));
    s.sports = { ...SPORTS, ...(raw.sports ?? {}) };
    s.sports.leagues = (s.sports.leagues ?? []).map((x) => ({ ...league('', ''), ...x, teams: Array.isArray(x.teams) ? x.teams : [] }));
    s.api = { ...API, ...(raw.api ?? {}) };
    s.releases = { ...RELEASES, ...(raw.releases ?? {}) };
    s.calendar = { ...CALENDAR, ...(raw.calendar ?? {}) };
    s.calendar.calendars = (Array.isArray(s.calendar.calendars) ? s.calendar.calendars : []).map((x) => ({ ...calendarSource(), ...x }));
    s.standings = { ...STANDINGS, ...(raw.standings ?? {}) };
    s.standings.leagues = (Array.isArray(s.standings.leagues) ? s.standings.leagues : []).map((x) => ({ ...league('', ''), ...x, teams: Array.isArray(x.teams) ? x.teams : [] }));
    if (!['conference', 'division'].includes(s.standings.grouping)) s.standings.grouping = 'conference';
    s.hass = { ...HASS, ...(raw.hass ?? {}) };
    s.hass.entities = (Array.isArray(s.hass.entities) ? s.hass.entities : []).filter((x) => x && typeof x === 'object').map((x) => ({ ...hassEntity(), ...x })).slice(0, 60);
    s.stocks = { ...STOCKS, ...(raw.stocks ?? {}) };
    s.stocks.symbols = (Array.isArray(s.stocks.symbols) ? s.stocks.symbols : []).filter((x) => x && typeof x === 'object').map((x) => ({ ...stockSymbol(), ...x })).slice(0, 40);
    if (!config.pages.some((p) => p.id === s.page)) s.page = config.pages[0].id;   // page inconnue ou supprimée
    config.sections.push(s);
  }
  // Résumé par courriel. Une ancienne carte « Résumé du jour » est convertie en ces réglages, puis disparaît.
  const legacy = input.sections.find((raw) => raw?.kind === 'summary');
  const digest = { ...DIGEST, ...(input.digest && typeof input.digest === 'object' ? input.digest : legacy ? digestFromLegacy(legacy, config.sections) : {}) };
  const known = new Set(config.sections.filter(digestRole).map((x) => x.id));
  digest.sections = [...new Set((Array.isArray(digest.sections) ? digest.sections : []).filter((id) => known.has(id)))];
  digest.time = clockTime(digest.time, DIGEST.time);
  if (!SUMMARY_MODELS.some(([id]) => id === digest.model)) digest.model = DIGEST.model;
  digest.points = Math.min(10, Math.max(3, Math.round(Number(digest.points)) || DIGEST.points));
  for (const key of ['emailTo', 'anthropicKey', 'focus']) digest[key] = String(digest[key] ?? '').slice(0, 300);
  digest.enabled = Boolean(digest.enabled);
  config.digest = digest;
  return config;
}

/** Réglages du résumé par courriel tirés d'une ancienne carte « Résumé du jour » (clé, modèle, heure, adresse, sections). */
function digestFromLegacy(legacy, sections) {
  const o = legacy.summary ?? {}, picked = new Set(Array.isArray(o.sections) ? o.sections : []);
  // « Toutes mes sections » : celles qui étaient affichées. Sinon, les sections cochées, plus le coup d'œil.
  const chosen = sections.filter((s) => digestRole(s) && (digestRole(s) === 'glance' ? s.enabled : picked.size ? picked.has(s.id) : s.enabled));
  return { enabled: Boolean(o.email && String(o.emailTo ?? '').trim()), time: o.time, emailTo: o.emailTo, sections: chosen.map((s) => s.id), model: o.model,
    anthropicKey: o.anthropicKey, focus: o.focus, points: legacy.maxItems };
}

/** Empreinte des réglages qui exigent de retélécharger les données (pas la présentation). */
export function fetchSignature(s, units) {
  const data = s.kind === 'feed' ? s.feed.sources : s.kind === 'weather' ? [s.weather.latitude, s.weather.longitude, s.weather.showAlerts]
    : s.kind === 'commute' ? s.commute
    : s.kind === 'sports' ? [s.sports.leagues.map((l) => [l.id, l.path, l.enabled, l.provider, l.key]), s.sports.showYesterday, s.sports.showUpcoming, s.sports.apiSportsKey,
      s.sports.showStandings, s.sports.leagues.map((l) => l.teams.map((x) => x.id))]
    : s.kind === 'releases' ? s.releases
    : s.kind === 'calendar' ? [s.calendar.calendars.map((c) => [c.id, c.url, c.enabled, c.name, c.colorHex]), s.calendar.days, s.calendar.showEnded]
    : s.kind === 'hass' ? [s.hass.url, s.hass.token, s.hass.entities.map((e) => [e.id, e.entity, e.enabled])]
    : s.kind === 'standings' ? [s.standings.leagues.map((l) => [l.id, l.name, l.path, l.enabled, l.provider, l.key, l.teams.map((x) => x.id)]), s.standings.showStandings, s.standings.showLeaders, s.standings.showTeams, s.standings.upcoming, s.standings.grouping, s.maxItems]
    : s.kind === 'stocks' ? s.stocks.symbols.map((x) => [x.id, x.symbol, x.enabled])
    : [s.api, s.title];
  return JSON.stringify([s.kind, units, data]);
}
