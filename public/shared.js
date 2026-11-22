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
  api: { label: 'API JSON', detail: "Liste tirée de n'importe quelle API JSON", icon: 'curlybraces', color: '#8B5CF6', maxItems: 6 },
};

export const SWATCHES = ['#EF4444', '#F97316', '#F59E0B', '#22C55E', '#10B981', '#14B8A6', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

export const FEED_CATALOG = [
  { name: 'Actualités', feeds: [
    ['Radio-Canada – À la une', 'https://ici.radio-canada.ca/rss/4159'],
    ['Radio-Canada – En continu', 'https://ici.radio-canada.ca/rss/1000524'],
    ['La Presse', 'https://www.lapresse.ca/actualites/rss'],
    ['Le Devoir', 'https://www.ledevoir.com/rss/manchettes.xml'],
    ['Le Journal de Montréal', 'https://www.journaldemontreal.com/rss.xml'],
    ['CBC Top Stories', 'https://www.cbc.ca/webfeed/rss/rss-topstories'] ] },
  { name: 'International', feeds: [
    ['Le Monde', 'https://www.lemonde.fr/rss/une.xml'],
    ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml'] ] },
  { name: 'Techno', feeds: [
    ['Numerama', 'https://www.numerama.com/feed/'],
    ['MacGeneration', 'https://www.macg.co/news/feed'],
    ['The Verge', 'https://www.theverge.com/rss/index.xml'],
    ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'],
    ['9to5Mac', 'https://9to5mac.com/feed/'],
    ['TechCrunch', 'https://techcrunch.com/feed/'],
    ['Hacker News', 'https://hnrss.org/frontpage'] ] },
  { name: 'Sports', feeds: [
    ['La Presse – Sports', 'https://www.lapresse.ca/sports/rss'],
    ['Radio-Canada – Sports', 'https://ici.radio-canada.ca/rss/771'] ] },
  { name: 'Économie', feeds: [
    ['Radio-Canada – Économie', 'https://ici.radio-canada.ca/rss/5717'],
    ['La Presse – Affaires', 'https://www.lapresse.ca/affaires/rss'] ] },
];

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
export const KIND_REFRESH = { feed: 0, weather: 0, api: 0, commute: 5, sports: 5 };

export const PROVIDER_LABELS = { espn: 'ESPN', hockeytech: 'HockeyTech', apisports: 'API-Sports' };

const GENERAL = { displayName: '', showGreeting: true, showGlance: true, appearance: 'system', accentHex: '#3B82F6',
  tintedBackdrop: true, language: 'auto', columns: 0, density: 'comfortable', refreshMinutes: 30, openLinksInBackground: false,
  dimReadArticles: true, units: 'metric',
  muteKeywords: '', highlightKeywords: '',   // filtres appliqués à tous les fils
  displaySeconds: 30,
  notifyAlerts: true, notifyGameStart: true, notifyGameEnd: false };   // ce qui déclenche une notification                      // mode affichage : durée de chaque page (0 = ne pas changer de page)
const FEED = { sources: [], layout: 'list', ordering: 'balanced', showImages: true, showSummary: false, showSource: true,
  showTime: true, maxAgeHours: 48, includeKeywords: '', excludeKeywords: '', highlightKeywords: '',
  notify: false };   // notification à chaque nouvel article (sur les appareils abonnés)
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
    feed: clone(FEED), weather: clone(WEATHER), commute: clone(COMMUTE), sports: clone(SPORTS), api: clone(API), ...overrides };
}

/** Nouvelle section prête à l'emploi pour un type donné. */
export function template(kind) {
  const s = newSection(kind);
  if (kind === 'feed') { s.title = 'Nouveau fil'; s.feed.sources = [catalogSource('Radio-Canada – À la une')]; }
  if (kind === 'commute') s.commute.routes = [commuteRoute('Nouveau trajet')];
  if (kind === 'sports') s.sports.leagues = [league('LNH', 'hockey/nhl')];
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
  return { version: 1, general: clone(GENERAL), pages: [newPage('Accueil')],
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
    if (!config.pages.some((p) => p.id === s.page)) s.page = config.pages[0].id;   // page inconnue ou supprimée
    config.sections.push(s);
  }
  return config;
}

/** Empreinte des réglages qui exigent de retélécharger les données (pas la présentation). */
export function fetchSignature(s, units) {
  const data = s.kind === 'feed' ? s.feed.sources : s.kind === 'weather' ? [s.weather.latitude, s.weather.longitude, s.weather.showAlerts]
    : s.kind === 'commute' ? s.commute
    : s.kind === 'sports' ? [s.sports.leagues.map((l) => [l.id, l.path, l.enabled, l.provider, l.key]), s.sports.showYesterday, s.sports.showUpcoming, s.sports.apiSportsKey,
      s.sports.showStandings, s.sports.leagues.map((l) => l.teams.map((x) => x.id))]
    : [s.api, s.title];
  return JSON.stringify([s.kind, units, data]);
}
