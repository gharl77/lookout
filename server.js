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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8080);
const USER = process.env.LOOKOUT_USER || 'lookout';
const PASSWORD = process.env.LOOKOUT_PASSWORD || '';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

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
    return saveConfig(defaultConfig());
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

// --- Données des sections, avec cache court et requêtes en cours partagées ---

const CACHE_MS = 3 * 60e3;
const cache = new Map();   // id de section -> { signature, time, payload }
const pending = new Map();

async function loadSection(section, force) {
  const units = config.general.units;
  const signature = `${requestLang.getStore() ?? 'fr'}|${fetchSignature(section, units)}`;
  const cached = cache.get(section.id);
  if (!force && cached && cached.signature === signature && Date.now() - cached.time < CACHE_MS) return cached.payload;
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
      cache.set(section.id, { signature, time: Date.now(), payload });
    } catch (error) {
      if (!(error instanceof BriefingError)) console.error(`Section « ${section.title} » :`, error);
      const message = error instanceof BriefingError ? error.message : t('Erreur interne du serveur');
      // En cas d'échec, on renvoie les dernières données connues avec l'erreur.
      const stale = cached?.signature === signature ? cached.payload : null;
      payload = stale ? { ...stale, error: message } : { kind: section.kind, error: message, sourceErrors: {}, updatedAt: null };
    }
    return payload;
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

  if (route === 'GET /api/config') return send(res, 200, config);
  if (route === 'GET /api/about') return send(res, 200, { name: 'Lookout', version: VERSION });
  if (route === 'PUT /api/config') {
    let next;
    try { next = normalize(await readBody(req)); } catch (e) { return send(res, 400, { error: e.message }); }
    config = saveConfig(next);
    const ids = new Set(config.sections.map((s) => s.id));
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    return send(res, 200, config);
  }
  if (route === 'POST /api/config/reset') {
    config = saveConfig(defaultConfig());
    cache.clear();
    return send(res, 200, config);
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
    send(res, 200, data, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      // Toujours revalider : une icône ou un script mis à jour apparaît dès le prochain chargement.
      'Cache-Control': 'no-cache' });
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
