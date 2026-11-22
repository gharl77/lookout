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
import { Push, cleanSubscription } from './lib/push.js';
import { startWatcher } from './lib/notify.js';

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
// Notifications : le service du fabricant exige une adresse de contact pour l'exploitant du serveur.
const push = new Push(DATA, process.env.LOOKOUT_CONTACT || 'https://github.com/gharl77/lookout');

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
// Sections déposées par un administrateur dans le profil d'un autre. Une page ouverte avant le dépôt ne les
// connaît pas : tant qu'elle n'a pas rechargé ses réglages, ses enregistrements ne doivent pas les effacer.
const delivered = new Map();    // profil -> Map(section -> moment du dépôt)
const configSeen = new Map();   // session -> dernier chargement des réglages
setInterval(() => {
  for (const [id, sections] of delivered) {
    for (const [section, time] of sections) if (Date.now() - time > 7 * 24 * 3600e3) sections.delete(section);
    if (!sections.size) delivered.delete(id);
  }
}, 3600e3).unref();

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

/** Options d'une section, complétées par la clé partagée quand le profil n'a pas saisi la sienne. */
function withSharedKey(options, name) {
  return String(options[name] ?? '').trim() ? options : { ...options, [name]: accounts.sharedKey(name) };
}

/** Envoie une notification à tous les appareils abonnés d'un profil ; oublie ceux qui n'existent plus. */
async function notify(userID, message) {
  const result = { devices: 0, delivered: 0, error: null };
  for (const subscription of accounts.pushSubscriptions(userID)) {
    result.devices++;
    const sent = await push.send(subscription, message);
    if (sent.ok) result.delivered++;
    else if (sent.gone) accounts.removePush(userID, subscription.endpoint);
    else { result.error = sent.error; console.warn(`Notification non remise (${new URL(subscription.endpoint).hostname}) : ${sent.error}`); }
  }
  return result;
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
        : section.kind === 'commute' ? await fetchCommute(withSharedKey(section.commute, 'tomtomKey'))
        : section.kind === 'sports' ? await fetchSports(withSharedKey(section.sports, 'apiSportsKey'))
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

async function readBody(req, limit = 2e6) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new BriefingError('Requête trop volumineuse');
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

  // Restaurer une sauvegarde sur une installation neuve : possible tant qu'aucun compte n'existe, comme la
  // création de l'administrateur. (Sur une installation en service, voir plus bas : réservé à un administrateur.)
  if (route === 'POST /api/restore' && !accounts.hasUsers) {
    const body = await readBody(req, 30e6);
    const done = accounts.restoreAll(body?.backup);
    console.log(`Sauvegarde restaurée sur une installation neuve : ${done.users} profil(s).`);
    return send(res, 200, done);
  }

  // Tout le reste exige d'être connecté.
  if (!user) throw Object.assign(new BriefingError('Connexion requise'), { status: 401 });

  if (route === 'POST /api/auth/password') {
    const body = await readBody(req);
    // Mot de passe provisoire : la personne vient de le saisir pour se connecter, on ne le redemande pas.
    if (!user.mustChangePassword && !accounts.checkOwnPassword(user.id, body?.current)) throw new BriefingError('Mot de passe actuel incorrect');
    accounts.update(user.id, { password: body?.next }, token);
    return send(res, 200, { ok: true });
  }
  // Tant que le mot de passe provisoire n'est pas remplacé, rien d'autre n'est accessible.
  if (user.mustChangePassword) throw Object.assign(new BriefingError('Choisissez d’abord votre mot de passe'), { status: 403 });

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

  // --- Clés d'API partagées : tout le monde sait lesquelles existent, seul un administrateur les définit ---
  if (route === 'GET /api/shared-keys') return send(res, 200, accounts.sharedKeysSet);
  if (route === 'PUT /api/shared-keys') {
    requireAdmin(user);
    const set = accounts.setSharedKeys(await readBody(req));
    // Les sections restées en erreur (clé manquante ou refusée) sont redemandées dès le prochain affichage.
    for (const [key, entry] of cache) if (hasErrors(entry.payload)) cache.delete(key);
    return send(res, 200, set);
  }

  // --- Sauvegarde complète (administrateur) ---
  // Le fichier contient les clés d'API et les empreintes des mots de passe : le mot de passe de
  // l'administrateur est redemandé, pour qu'une session restée ouverte ne suffise pas à l'obtenir.
  if (route === 'POST /api/backup' || route === 'POST /api/restore') {
    requireAdmin(user);
    const body = await readBody(req, 30e6);
    if (!accounts.checkOwnPassword(user.id, body?.password)) throw new BriefingError('Mot de passe incorrect');
    if (route === 'POST /api/backup') { console.log(`Sauvegarde complète téléchargée par « ${user.name} ».`); return send(res, 200, accounts.exportAll()); }
    const done = accounts.restoreAll(body?.backup);
    cache.clear(); delivered.clear(); configSeen.clear();
    console.log(`Sauvegarde restaurée par « ${user.name} » : ${done.users} profil(s). Les données précédentes sont mises de côté.`);
    return send(res, 200, done, { 'Set-Cookie': sessionCookie(req, null) });
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
      // Mot de passe donné à quelqu'un d'autre : provisoire, à remplacer à sa prochaine connexion.
      return send(res, 200, accounts.describe(accounts.update(id, changes, id === user.id ? token : null, id !== user.id)));
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
  if (route === 'GET /api/config') {
    if (!viewedID) configSeen.set(token, Date.now());
    return send(res, 200, redact(profile.config));
  }
  if (route === 'PUT /api/config') {
    let next;
    try { next = restoreSecrets(normalize(await readBody(req)), profile.config); } catch (e) { return send(res, 400, { error: e.message }); }
    // Sections reçues d'un administrateur depuis le dernier chargement de cette page : elles sont conservées.
    for (const [id, time] of delivered.get(user.id) ?? []) {
      const kept = (configSeen.get(token) ?? 0) < time && !next.sections.some((s) => s.id === id) && profile.config.sections.find((s) => s.id === id);
      if (kept) next.sections.push(structuredClone(kept));
    }
    return send(res, 200, redact(accounts.saveConfig(user.id, next)));
  }
  if (route === 'POST /api/config/reset') return send(res, 200, redact(accounts.saveConfig(user.id, normalize(defaultConfig()))));
  // Envoyer une copie d'une de ses sections à d'autres profils (administrateur).
  const sendRoute = /^\/api\/section\/([^/]+)\/send$/.exec(url.pathname);
  if (sendRoute && req.method === 'POST') {
    requireAdmin(user);
    const body = await readBody(req);
    const section = findSection(decodeURIComponent(sendRoute[1]));
    const targets = [...new Set(Array.isArray(body?.to) ? body.to.map(String) : [])].filter((id) => id !== user.id);
    if (!targets.length) throw new BriefingError('Choisissez au moins un profil');
    if (targets.some((id) => !accounts.user(id))) throw new BriefingError('Profil introuvable');
    for (const id of targets) {
      const copy = accounts.addSection(id, section);
      if (!delivered.has(id)) delivered.set(id, new Map());
      delivered.get(id).set(copy, Date.now());
    }
    return send(res, 200, { sent: targets.length });
  }
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
  // --- Notifications sur cet appareil ---
  if (route === 'GET /api/push/key') return send(res, 200, { key: push.publicKey });
  if (route === 'POST /api/push/subscribe') {
    const body = await readBody(req);
    accounts.addPush(user.id, token, cleanSubscription(body?.subscription), body?.lang);
    return send(res, 200, { ok: true });
  }
  if (route === 'POST /api/push/unsubscribe') {
    accounts.removePush(user.id, String((await readBody(req))?.endpoint ?? ''));
    return send(res, 200, { ok: true });
  }
  if (route === 'POST /api/push/test') {
    const sent = await notify(user.id, { title: 'Lookout', body: t('Les notifications fonctionnent sur cet appareil.'), tag: 'essai' });
    if (!sent.devices) throw new BriefingError('Aucun appareil abonné aux notifications');
    if (!sent.delivered) throw new BriefingError('Le service de notifications a refusé le message ({0})', sent.error ?? '?');
    return send(res, 200, sent);
  }

  // Articles gardés « à lire plus tard » : propres au profil, partagés entre ses appareils.
  if (route === 'GET /api/saved') return send(res, 200, profile.saved);
  if (route === 'POST /api/saved') {
    const body = await readBody(req);
    if (body?.add) return send(res, 200, accounts.keepArticle(user.id, body.add));
    if (body?.clear === true) return send(res, 200, accounts.dropArticles(user.id, null));
    if (Array.isArray(body?.remove)) return send(res, 200, accounts.dropArticles(user.id, body.remove.map(String)));
    throw new BriefingError('JSON invalide');
  }
  if (route === 'GET /api/weather/search') return send(res, 200, await searchPlaces(q.get('q') ?? ''));
  if (route === 'GET /api/teams') {
    const section = findSection(q.get('section'));
    const league = section.sports.leagues.find((l) => l.id === q.get('league'));
    if (!league) throw new BriefingError('Ligue introuvable');
    return send(res, 200, await fetchTeams(league, withSharedKey(section.sports, 'apiSportsKey').apiSportsKey));
  }
  if (route === 'GET /api/apisports/leagues') {
    const section = findSection(q.get('section'));
    return send(res, 200, await searchAPISportsLeagues(q.get('sport') ?? '', q.get('q') ?? '', withSharedKey(section.sports, 'apiSportsKey').apiSportsKey));
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

// Surveillance en arrière-plan des alertes météo et des matchs, pour les profils dont un appareil est abonné.
startWatcher({ subscribers: () => accounts.pushProfiles(), load: (section, config) => loadSection(section, config),
  deliver: notify, withLang: (lang, run) => requestLang.run(lang, run) });
