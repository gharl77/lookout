// Outils partagés : requêtes HTTP, texte HTML, erreurs lisibles.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { t } from '../public/i18n.js';

/** Erreur destinée à l'utilisateur. Le message (clé française + arguments) est traduit dans la langue de la requête. */
export class BriefingError extends Error {
  constructor(key, ...args) { super(t(key, ...args)); }
}

// Identification de type navigateur : certains sites (MacGeneration…) refusent les agents inconnus.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15 Lookout/0.1';

export function checkURL(string) {
  const trimmed = String(string ?? '').trim();
  let url;
  try { url = new URL(trimmed); } catch { throw new BriefingError(trimmed ? 'Adresse invalide' : 'Adresse manquante'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new BriefingError('Adresse invalide');
  return url;
}

// Au plus 8 requêtes sortantes à la fois : au-delà, elles se ralentissent mutuellement (résolution DNS,
// poignées de main TLS) jusqu'à dépasser les délais.
const MAX_CONCURRENT = 8;
let active = 0;
const waiting = [];
async function withSlot(task) {
  if (active >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
  active++;
  try { return await task(); } finally { active--; waiting.shift()?.(); }
}

async function fetchOnce(url, headers, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.7', ...headers },
      signal: AbortSignal.timeout(timeoutMs), redirect: 'follow',
    });
  } catch (error) {
    const failure = new BriefingError(error.name === 'TimeoutError' ? "Délai d'attente dépassé" : 'Serveur introuvable ou connexion impossible');
    failure.transient = true;
    throw failure;
  }
  if (!response.ok) {
    const failure = new BriefingError('Erreur HTTP {0}', response.status);
    failure.status = response.status;
    // Surcharge ou panne passagère du service distant : vaut la peine de réessayer.
    failure.transient = response.status === 429 || response.status >= 500;
    throw failure;
  }
  return response;
}

/** Requête GET. Une panne passagère (réseau, délai, erreur 5xx ou 429) est retentée une fois. */
export async function fetchRaw(url, headers = {}, timeoutMs = 15000) {
  const target = checkURL(url);
  try {
    return await withSlot(() => fetchOnce(target, headers, timeoutMs));
  } catch (error) {
    if (!error.transient) throw error;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return withSlot(() => fetchOnce(target, headers, timeoutMs));
  }
}

export async function fetchJSON(url, headers = {}) {
  const response = await fetchRaw(url, { Accept: 'application/json', ...headers });
  try { return await response.json(); } catch { throw new BriefingError("La réponse n'est pas du JSON valide"); }
}

/** Texte d'une réponse, décodé selon le jeu de caractères annoncé (en-tête HTTP ou prologue XML). */
export async function fetchText(url, headers = {}) {
  const response = await fetchRaw(url, headers);
  const bytes = Buffer.from(await response.arrayBuffer());
  let charset = /charset=([\w-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1];
  charset ??= /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(bytes.subarray(0, 200).toString('latin1'))?.[1];
  try { return new TextDecoder(charset || 'utf-8').decode(bytes); } catch { return bytes.toString('utf8'); }
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à',
  acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', oelig: 'œ', Eacute: 'É', Egrave: 'È',
  Agrave: 'À', Ccedil: 'Ç', euro: '€', deg: '°', copy: '©' };

export function decodeEntities(input) {
  if (!input.includes('&')) return input;
  return input.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, key) => {
    if (key[0] === '#') {
      const hex = key[1] === 'x' || key[1] === 'X';
      const code = parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
      try { return Number.isFinite(code) ? String.fromCodePoint(code) : match; } catch { return match; }
    }
    return NAMED[key] ?? match;
  });
}

export function plain(html) {
  // Certains fils encodent le HTML deux fois : on décode avant et après le retrait des balises.
  let s = decodeEntities(String(html ?? ''));
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>|<[^>]+>/gi, ' ');
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

export function parseDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value > 1e11 ? value : value * 1000;
  const t = Date.parse(String(value).trim());
  return Number.isNaN(t) ? null : t;
}

/** Exécute des tâches en parallèle et sépare les réussites des échecs. */
export async function settle(items, task) {
  const results = await Promise.allSettled(items.map(task));
  return results.map((r, i) => ({ item: items[i], value: r.status === 'fulfilled' ? r.value : null,
    error: r.status === 'rejected' ? (r.reason?.message ?? t('Erreur')) : null }));
}

/** Petit cache en mémoire avec durée de vie et taille bornée : au-delà de `max` entrées, les plus anciennes sortent. */
export class Cache {
  #store = new Map();
  #max;
  constructor(max = 500) { this.#max = max; }
  get(key, maxAgeMs) {
    const entry = this.#store.get(key);
    return entry && Date.now() - entry.time < maxAgeMs ? entry.value : undefined;
  }
  set(key, value) {
    this.#store.delete(key);   // réinsérée en dernier : l'ordre de la Map est l'ordre d'ancienneté
    this.#store.set(key, { time: Date.now(), value });
    while (this.#store.size > this.#max) this.#store.delete(this.#store.keys().next().value);
    return value;
  }
}

/** Vrai pour une adresse IP locale ou privée (boucle locale, réseau domestique, lien local, adresses réservées). */
export function isPrivateAddress(address) {
  const ip = String(address).toLowerCase().replace(/^\[|\]$/g, '').replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || a >= 224;
  }
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
}

/**
 * Refuse une adresse qui mène au réseau local du serveur. Sert là où n'importe quel profil peut faire lire une
 * page de son choix (le lecteur d'article) : sans cela, il pourrait consulter l'interface d'un routeur ou d'un NAS.
 */
export async function assertPublicHost(url) {
  const { hostname } = checkURL(url);
  const bare = hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try { addresses = isIP(bare) ? [{ address: bare }] : await lookup(bare, { all: true }); } catch { throw new BriefingError('Serveur introuvable ou connexion impossible'); }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new BriefingError("Le lecteur n'ouvre pas les adresses du réseau local");
}
