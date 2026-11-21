// Lookout — serveur web. Aucune dépendance : Node 22+ suffit.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { setLangProvider, t } from './public/i18n.js';
import { defaultConfig, normalize, fetchSignature } from './public/shared.js';
import { BriefingError } from './lib/util.js';
import { fetchFeeds, fetchJSONAPI } from './lib/feeds.js';
import { fetchWeather, searchPlaces } from './lib/weather.js';
import { fetchSports, fetchTeams, searchAPISportsLeagues } from './lib/sports.js';
import { fetchCommute, initGeocodeCache } from './lib/commute.js';
import { installDnsCache, dnsStats } from './lib/dns-cache.js';
import { redact, restoreSecrets } from './lib/secrets.js';

installDnsCache();

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8080);
const USER = process.env.LOOKOUT_USER || 'lookout';
const PASSWORD = process.env.LOOKOUT_PASSWORD || '';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
// Empreinte de l'interface : change dès qu'un fichier de public/ change. Une page restée ouverte la compare
// à la sienne pour savoir qu'une nouvelle version est installée, et se recharge.
const BUILD = (() => {
  const hash = crypto.createHash('sha1');
  for (const name of fs.readdirSync(PUBLIC).sort()) hash.update(name).update(fs.readFileSync(path.join(PUBLIC, name)));
  return hash.digest('hex').slice(0, 12);
})();

// Langue de la requête en cours (en-tête X-Lang envoyé par l'interface) : sert à traduire les messages.
const requestLang = new AsyncLocalStorage();
setLangProvider(() => requestLang.getStore() ?? 'fr');
const CONFIG_FILE = path.join(DATA, 'config.json');
const READ_FILE = path.join(DATA, 'read.json');

// Le dossier de données doit être accessible en écriture : on le vérifie tout de suite, avec un message clair.
try {
  fs.mkdirSync(DATA, { recursive: true });
  fs.accessSync(DATA, fs.constants.W_OK);
} catch {
  const who = typeof process.getuid === 'function' ? `${process.getuid()}:${process.getgid()}` : '?';
  console.error(`Lookout ne peut pas écrire dans ${DATA} (utilisateur ${who}).`);
  console.error(`Lookout cannot write to ${DATA} (running as ${who}).`);
  console.error(`→ Sur l'hôte / On the host: sudo chown -R ${who} <dossier monté sur ${DATA} / folder mounted at ${DATA}>`);
  process.exit(1);
}
initGeocodeCache(DATA);

// --- Configuration et état de lecture (fichiers JSON dans le volume de données) ---

function loadConfig() {
  try {
    return normalize(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  } catch (error) {
    if (fs.existsSync(CONFIG_FILE)) {
      // Fichier illisible : on le met de côté plutôt que de l'écraser.
      fs.renameSync(CONFIG_FILE, path.join(DATA, 'config-illisible.json'));
      console.error('Configuration illisible, mise de côté :', error.message);
    }
    return saveConfig(normalize(defaultConfig()));
  }
}

function saveConfig(next) {
  fs.writeFileSync(CONFIG_FILE + '.tmp', JSON.stringify(next, null, 2));
  fs.renameSync(CONFIG_FILE + '.tmp', CONFIG_FILE);
  return next;
}

let config = loadConfig();
let readIDs = new Set();
try { readIDs = new Set(JSON.parse(fs.readFileSync(READ_FILE, 'utf8'))); } catch { /* premier lancement */ }

function saveRead() {
  // Garde l'historique borné : les plus anciens identifiants sont retirés en premier.
  if (readIDs.size > 4000) readIDs = new Set([...readIDs].slice(-3000));
  fs.promises.writeFile(READ_FILE, JSON.stringify([...readIDs])).catch(() => {});
}

// --- Données des sections ---
// Chaque source n'est interrogée qu'une fois par intervalle : celui de sa section s'il est défini, sinon
// celui des réglages généraux (« refreshMinutes », 30 minutes par défaut), peu importe combien de fois la page est ouverte ou actualisée : les sites qui limitent les
// accès ne voient donc jamais plus de requêtes que prévu. Seule exception : après un échec, une nouvelle
// tentative est permise au bout de 2 minutes. L'utilisateur peut aussi demander la mise à jour immédiate
// d'une seule section (icône de rechargement de la carte), au plus une fois par minute. Enfin, pendant
// qu'un match d'une équipe suivie est en cours, les pointages sont rafraîchis chaque minute.

const RETRY_MS = 2 * 60e3;
const FORCE_MS = 60e3;
const LIVE_MS = 60e3;
const cache = new Map();   // id de section -> { signature, time, payload }
const pending = new Map();

const intervalMs = (section) => Math.max(1, Number(section?.refreshMinutes) || Number(config.general.refreshMinutes) || 30) * 60e3;
const hasErrors = (payload) => Boolean(payload.error) || Object.keys(payload.sourceErrors ?? {}).length > 0
  || (payload.routes ?? []).some((route) => route.error);
/** Un match d'une équipe suivie est-il en cours ? (Toute la ligue compte si aucune équipe n'est choisie.) */
function hasLiveGame(payload, section) {
  if (section?.kind !== 'sports' || section.sports.liveRefresh === false) return false;
  const chosen = new Map(section.sports.leagues.map((l) => [l.id, new Set((l.teams ?? []).map((x) => x.id))]));
  // Les ligues API-Sports sont exclues : leur quota gratuit ne permet pas une requête par minute.
  const paced = new Set(section.sports.leagues.filter((l) => l.provider === 'apisports').map((l) => l.id));
  return (payload.games ?? []).some((g) => {
    if (g.state !== 'live' || paced.has(g.leagueID)) return false;
    const teams = chosen.get(g.leagueID);
    return !teams?.size || teams.has(g.home.id) || teams.has(g.away.id);
  });
}

/** Moment à partir duquel les sources d'une section pourront être réinterrogées. */
function nextUpdate(entry, section) {
  let wait = intervalMs(section);
  if (hasErrors(entry.payload)) wait = Math.min(wait, RETRY_MS);
  if (hasLiveGame(entry.payload, section)) wait = Math.min(wait, LIVE_MS);   // pendant un match : chaque minute
  return entry.time + wait;
}

/** Journalise les sources en échec (visible avec « docker logs lookout »), pour comprendre une alerte après coup. */
function logSourceErrors(section, sourceErrors = {}) {
  const names = new Map([...section.feed.sources, ...section.sports.leagues].map((x) => [x.id, x.name]));
  for (const [id, message] of Object.entries(sourceErrors)) console.warn(`[${section.title}] ${names.get(id) || 'source'} : ${message}`);
}

async function loadSection(section, force = false) {
  const units = config.general.units;
  const signature = `${requestLang.getStore() ?? 'fr'}|${fetchSignature(section, units)}`;
  const cached = cache.get(section.id);
  const due = cached && (force ? cached.time + FORCE_MS : nextUpdate(cached, section));
  if (cached && cached.signature === signature && Date.now() < due) {
    return { ...cached.payload, nextUpdateAt: nextUpdate(cached, section) };
  }
  const key = section.id + signature;
  if (pending.has(key)) return pending.get(key);

  const job = (async () => {
    let payload;
    try {
      const data = section.kind === 'feed' ? await fetchFeeds(section.feed.sources)
        : section.kind === 'weather' ? await fetchWeather(section.weather, units)
        : section.kind === 'commute' ? await fetchCommute(section.commute)
        : section.kind === 'sports' ? await fetchSports(section.sports)
        : await fetchJSONAPI(section.api, section.title);
      payload = { kind: section.kind, ...data, error: null, updatedAt: Date.now() };
      logSourceErrors(section, data.sourceErrors);
      for (const route of data.routes ?? []) if (route.error) console.warn(`[${section.title}] ${route.name || 'trajet'} : ${route.error}`);
    } catch (error) {
      if (!(error instanceof BriefingError)) console.error(`Section « ${section.title} » :`, error);
      else console.warn(`[${section.title}] ${error.message}`);
      const message = error instanceof BriefingError ? error.message : t('Erreur interne du serveur');
      // En cas d'échec, on renvoie les dernières données connues avec l'erreur.
      const stale = cached?.signature === signature ? cached.payload : null;
      payload = stale ? { ...stale, error: message } : { kind: section.kind, error: message, sourceErrors: {}, updatedAt: null };
    }
    // Les échecs sont mémorisés aussi : une source en panne n'est pas redemandée à chaque chargement de page.
    const entry = { signature, time: Date.now(), payload };
    cache.set(section.id, entry);
    return { ...payload, nextUpdateAt: nextUpdate(entry, section) };
  })().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

// Filet de sécurité : une erreur imprévue dans une tâche de fond est journalisée, sans arrêter le serveur.
process.on('unhandledRejection', (reason) => console.error('Erreur non gérée (promesse) :', reason));
process.on('uncaughtException', (error) => console.error('Erreur non gérée :', error));

// --- HTTP ---

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(json ? JSON.stringify(body) : body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2e6) throw new BriefingError('Requête trop volumineuse');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new BriefingError('JSON invalide'); }
}

function authorized(req) {
  if (!PASSWORD) return true;
  const expected = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64');
  const given = req.headers.authorization ?? '';
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function findSection(id) {
  const section = config.sections.find((s) => s.id === id);
  if (!section) throw new BriefingError('Section introuvable');
  return section;
}

async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const q = url.searchParams;

  // Le navigateur ne reçoit jamais les clés ni les jetons : seulement un masque.
  if (route === 'GET /api/config') return send(res, 200, redact(config));
  if (route === 'GET /api/about') return send(res, 200, { name: 'Lookout', version: VERSION, build: BUILD, dns: dnsStats() });
  if (route === 'PUT /api/config') {
    let next;
    try { next = restoreSecrets(normalize(await readBody(req)), config); } catch (e) { return send(res, 400, { error: e.message }); }
    config = saveConfig(next);
    const ids = new Set(config.sections.map((s) => s.id));
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    return send(res, 200, redact(config));
  }
  if (route === 'POST /api/config/reset') {
    config = saveConfig(normalize(defaultConfig()));
    cache.clear();
    return send(res, 200, redact(config));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/section/')) {
    let id;
    try { id = decodeURIComponent(url.pathname.slice('/api/section/'.length)); } catch { throw new BriefingError('Section introuvable'); }
    const section = findSection(id);
    return send(res, 200, await loadSection(section, q.get('force') === '1'));
  }
  if (route === 'GET /api/read') return send(res, 200, [...readIDs]);
  if (route === 'POST /api/read') {
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BriefingError('JSON invalide');
    for (const id of Array.isArray(body.add) ? body.add : []) if (typeof id === 'string') readIDs.add(id);
    for (const id of Array.isArray(body.remove) ? body.remove : []) readIDs.delete(id);
    saveRead();
    return send(res, 200, { ok: true });
  }
  if (route === 'GET /api/weather/search') return send(res, 200, await searchPlaces(q.get('q') ?? ''));
  if (route === 'GET /api/teams') {
    const section = findSection(q.get('section'));
    const league = section.sports.leagues.find((l) => l.id === q.get('league'));
    if (!league) throw new BriefingError('Ligue introuvable');
    return send(res, 200, await fetchTeams(league, section.sports.apiSportsKey));
  }
  if (route === 'GET /api/apisports/leagues') {
    const section = findSection(q.get('section'));
    return send(res, 200, await searchAPISportsLeagues(q.get('sport') ?? '', q.get('q') ?? '', section.sports.apiSportsKey));
  }
  return send(res, 404, { error: t('Introuvable') });
}

function serveStatic(req, res, url) {
  const name = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(PUBLIC, name));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Interdit');
  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, 'Introuvable');
    // Toujours revalider : une icône ou un script mis à jour apparaît dès le prochain chargement. L'ETag
    // permet au navigateur de vérifier sans tout retélécharger, et lui interdit de deviner à notre place.
    const etag = `"${crypto.createHash('sha1').update(data).digest('hex').slice(0, 16)}"`;
    const headers = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    send(res, 200, data, headers);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return send(res, 200, 'ok');
    if (!authorized(req)) return send(res, 401, 'Authentification requise / Authentication required', { 'WWW-Authenticate': 'Basic realm="Lookout", charset="UTF-8"' });
    if (url.pathname.startsWith('/api/')) {
      const lang = req.headers['x-lang'] === 'en' ? 'en' : 'fr';
      return await requestLang.run(lang, () => api(req, res, url));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non permise');
    return serveStatic(req, res, url);
  } catch (error) {
    if (!(error instanceof BriefingError)) console.error(error);
    if (!res.headersSent) send(res, error instanceof BriefingError ? 400 : 500, { error: error instanceof BriefingError ? error.message : 'Erreur interne du serveur / Internal server error' });
  }
}).listen(PORT, () => console.log(`Lookout ${VERSION} à l'écoute sur le port ${PORT} — données : ${DATA}${PASSWORD ? ' — mot de passe activé' : ''}`));
