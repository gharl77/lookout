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
import { Accounts, AUTH_EPOCH, SESSION_COOKIE, SESSION_MAX_AGE } from './lib/accounts.js';

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

// --- Comptes et profils ---
// Chaque utilisateur a ses propres réglages et son propre état de lecture (voir lib/accounts.js).
// Le compte administrateur se crée à la première ouverture de la page ; ensuite, seuls les administrateurs
// peuvent créer des comptes.
const accounts = new Accounts(DATA);

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
// Clé : identifiant de section + empreinte de ses sources. Deux profils qui suivent exactement les mêmes
// sources (un profil copié d'un autre, par exemple) partagent donc les mêmes données : une seule requête.
const cache = new Map();   // clé -> { time, payload }
// Les entrées dont plus personne ne se sert (sources modifiées, profil supprimé) sont retirées après un jour.
setInterval(() => { for (const [key, entry] of cache) if (Date.now() - entry.time > 24 * 3600e3) cache.delete(key); }, 3600e3).unref();
const pending = new Map();

const intervalMs = (section, config) => Math.max(1, Number(section?.refreshMinutes) || Number(config.general.refreshMinutes) || 30) * 60e3;
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
function nextUpdate(entry, section, config) {
  let wait = intervalMs(section, config);
  if (hasErrors(entry.payload)) wait = Math.min(wait, RETRY_MS);
  if (hasLiveGame(entry.payload, section)) wait = Math.min(wait, LIVE_MS);   // pendant un match : chaque minute
  return entry.time + wait;
}

/** Journalise les sources en échec (visible avec « docker logs lookout »), pour comprendre une alerte après coup. */
function logSourceErrors(section, sourceErrors = {}) {
  const names = new Map([...section.feed.sources, ...section.sports.leagues].map((x) => [x.id, x.name]));
  for (const [id, message] of Object.entries(sourceErrors)) console.warn(`[${section.title}] ${names.get(id) || 'source'} : ${message}`);
}

async function loadSection(section, config, force = false) {
  const units = config.general.units;
  const signature = `${requestLang.getStore() ?? 'fr'}|${fetchSignature(section, units)}`;
  const key = `${section.id}|${signature}`;
  const cached = cache.get(key);
  const due = cached && (force ? cached.time + FORCE_MS : nextUpdate(cached, section, config));
  if (cached && Date.now() < due) return { ...cached.payload, nextUpdateAt: nextUpdate(cached, section, config) };
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
      const stale = cached?.payload ?? null;
      payload = stale ? { ...stale, error: message } : { kind: section.kind, error: message, sourceErrors: {}, updatedAt: null };
    }
    // Les échecs sont mémorisés aussi : une source en panne n'est pas redemandée à chaque chargement de page.
    const entry = { time: Date.now(), payload };
    cache.set(key, entry);
    return { ...payload, nextUpdateAt: nextUpdate(entry, section, config) };
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

// --- Sessions ---

function sessionToken(req) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return null;
}

/** En-tête qui dépose (ou efface) le témoin de session. Il est invisible pour le JavaScript de la page. */
function sessionCookie(req, token) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_MAX_AGE : 0}${secure}`;
}

const clientAddress = (req) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '';

function requireAdmin(user) {
  if (user.role !== 'admin') throw Object.assign(new BriefingError('Réservé à un administrateur'), { status: 403 });
}

async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const q = url.searchParams;
  const token = sessionToken(req);
  const user = accounts.sessionUser(token);

  if (route === 'GET /api/about') return send(res, 200, { name: 'Lookout', version: VERSION, build: BUILD, dns: dnsStats() });

  // Toute requête qui modifie quelque chose doit venir de l'interface elle-même : cet en-tête ne peut pas
  // être ajouté par un formulaire ou un lien placé sur un autre site.
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'lookout') {
    throw Object.assign(new BriefingError('Requête refusée'), { status: 403 });
  }

  // --- Connexion ---
  if (route === 'GET /api/auth/state') {
    return send(res, 200, { setup: !accounts.hasUsers, user: user ? accounts.describe(user) : null,
      profiles: user || !accounts.hasUsers ? [] : accounts.names() });
  }
  if (route === 'POST /api/auth/setup') {
    if (accounts.hasUsers) throw Object.assign(new BriefingError('Un administrateur existe déjà'), { status: 403 });
    const body = await readBody(req);
    const admin = accounts.create({ name: body?.name, password: body?.password });
    console.log(`Compte administrateur « ${admin.name} » créé.`);
    return send(res, 200, { user: accounts.describe(admin) }, { 'Set-Cookie': sessionCookie(req, accounts.startSession(admin, req.headers['user-agent'])) });
  }
  if (route === 'POST /api/auth/login') {
    const body = await readBody(req);
    const found = accounts.login(body?.name, body?.password, clientAddress(req));
    return send(res, 200, { user: accounts.describe(found) }, { 'Set-Cookie': sessionCookie(req, accounts.startSession(found, req.headers['user-agent'])) });
  }
  if (route === 'POST /api/auth/logout') {
    accounts.endSession(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, null) });
  }

  // Tout le reste exige d'être connecté.
  if (!user) throw Object.assign(new BriefingError('Connexion requise'), { status: 401 });

  // Un administrateur peut consulter le tableau de bord d'un autre profil, en lecture seule : l'interface
  // l'indique par cet en-tête. Seule la lecture des réglages (clés masquées), des sections et de l'état de
  // lecture est alors permise ; rien ne peut être modifié au nom de l'autre profil.
  const viewedID = req.headers['x-view-as'];
  let owner = user;
  if (viewedID) {
    requireAdmin(user);
    owner = accounts.user(String(viewedID));
    if (!owner) throw new BriefingError('Profil introuvable');
    const readable = req.method === 'GET' && (route === 'GET /api/config' || route === 'GET /api/read' || url.pathname.startsWith('/api/section/'));
    if (!readable) throw Object.assign(new BriefingError('Ce profil est affiché en lecture seule'), { status: 403 });
  }
  const profile = accounts.profile(owner.id);
  const findSection = (id) => {
    const section = profile.config.sections.find((s) => s.id === id);
    if (!section) throw new BriefingError('Section introuvable');
    return section;
  };

  if (route === 'POST /api/auth/password') {
    const body = await readBody(req);
    if (!accounts.checkOwnPassword(user.id, body?.current)) throw new BriefingError('Mot de passe actuel incorrect');
    accounts.update(user.id, { password: body?.next }, token);
    return send(res, 200, { ok: true });
  }

  // --- Profils (administrateur) ---
  if (route === 'GET /api/users') { requireAdmin(user); return send(res, 200, accounts.list()); }
  if (route === 'POST /api/users') {
    requireAdmin(user);
    const body = await readBody(req);
    const created = accounts.create({ name: body?.name, password: body?.password, role: body?.role, copyFrom: body?.copyFrom || null });
    return send(res, 200, accounts.describe(created));
  }
  const userRoute = /^\/api\/users\/([^/]+)(\/copy)?$/.exec(url.pathname);
  if (userRoute) {
    requireAdmin(user);
    const id = decodeURIComponent(userRoute[1]);
    if (req.method === 'PATCH' && !userRoute[2]) {
      const body = await readBody(req);
      const changes = {};
      for (const field of ['name', 'role', 'password']) if (body?.[field] !== undefined) changes[field] = body[field];
      return send(res, 200, accounts.describe(accounts.update(id, changes, id === user.id ? token : null)));
    }
    if (req.method === 'POST' && userRoute[2]) {
      const body = await readBody(req);
      accounts.copyProfile(body?.from, id);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && !userRoute[2]) { accounts.remove(id, user.id); return send(res, 200, { ok: true }); }
  }
  // Déconnecter tous les appareils d'un profil (le sien compris, sauf l'appareil qui fait la demande).
  const signOutRoute = /^\/api\/users\/([^/]+)\/signout$/.exec(url.pathname);
  if (signOutRoute && req.method === 'POST') {
    requireAdmin(user);
    const id = decodeURIComponent(signOutRoute[1]);
    if (!accounts.user(id)) throw new BriefingError('Profil introuvable');
    accounts.endSessions(id, id === user.id ? token : null);
    return send(res, 200, { ok: true });
  }

  // --- Réglages et données du profil connecté ---
  // Le navigateur ne reçoit jamais les clés ni les jetons : seulement un masque.
  if (route === 'GET /api/config') return send(res, 200, redact(profile.config));
  if (route === 'PUT /api/config') {
    let next;
    try { next = restoreSecrets(normalize(await readBody(req)), profile.config); } catch (e) { return send(res, 400, { error: e.message }); }
    return send(res, 200, redact(accounts.saveConfig(user.id, next)));
  }
  if (route === 'POST /api/config/reset') return send(res, 200, redact(accounts.saveConfig(user.id, normalize(defaultConfig()))));
  if (req.method === 'GET' && url.pathname.startsWith('/api/section/')) {
    let id;
    try { id = decodeURIComponent(url.pathname.slice('/api/section/'.length)); } catch { throw new BriefingError('Section introuvable'); }
    return send(res, 200, await loadSection(findSection(id), profile.config, q.get('force') === '1'));
  }
  if (route === 'GET /api/read') return send(res, 200, [...profile.readIDs]);
  if (route === 'POST /api/read') {
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BriefingError('JSON invalide');
    for (const id of Array.isArray(body.add) ? body.add : []) if (typeof id === 'string') profile.readIDs.add(id);
    for (const id of Array.isArray(body.remove) ? body.remove : []) profile.readIDs.delete(id);
    accounts.saveRead(user.id);
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

// Les fichiers de l'interface sont servis sous une adresse qui contient l'empreinte de la version
// (« /v/<empreinte>/app.js »). Un cache intermédiaire qui impose sa propre durée de conservation (par exemple
// l'option « Cache Assets » de Nginx Proxy Manager) ne peut donc jamais resservir un ancien fichier : après
// une mise à jour, la page demande de nouvelles adresses. Seule la page HTML, jamais mise en cache, les connaît.
const INDEX = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replaceAll('{{v}}', `v/${BUILD}`);

function serveStatic(req, res, url) {
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return send(res, 200, INDEX, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
  }
  const versioned = /^\/v\/([0-9a-f]{12})(\/.+)$/.exec(url.pathname);
  const name = versioned ? versioned[2] : url.pathname;
  const file = path.normalize(path.join(PUBLIC, name));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Interdit');
  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, 'Introuvable');
    const etag = `"${crypto.createHash('sha1').update(data).digest('hex').slice(0, 16)}"`;
    // Adresse de la version courante : le contenu n'y changera jamais, le navigateur peut le garder.
    // Toute autre adresse (ancienne version, fichier à la racine) est revalidée à chaque chargement.
    const current = versioned?.[1] === BUILD;
    const headers = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', ETag: etag,
      'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'no-cache' };
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
    if (!res.headersSent) send(res, error instanceof BriefingError ? (error.status ?? 400) : 500, { error: error instanceof BriefingError ? error.message : 'Erreur interne du serveur / Internal server error' });
  }
}).listen(PORT, () => console.log(`Lookout ${VERSION} à l'écoute sur le port ${PORT} — données : ${DATA} — ${accounts.hasUsers ? `${accounts.names().length} profil(s)` : 'aucun compte : le premier visiteur crée l\'administrateur'}${PASSWORD ? ' — mot de passe global activé' : ''}`));
