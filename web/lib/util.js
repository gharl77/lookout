// Outils partagés : requêtes HTTP, texte HTML, erreurs lisibles.
import { t } from '../public/i18n.js';

/** Erreur destinée à l'utilisateur. Le message (clé française + arguments) est traduit dans la langue de la requête. */
export class BriefingError extends Error {
  constructor(key, ...args) { super(t(key, ...args)); }
}

// Même identification que l'app Mac : certains sites (MacGeneration…) refusent les agents inconnus.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15 Lookout/0.1';

export function checkURL(string) {
  const trimmed = String(string ?? '').trim();
  let url;
  try { url = new URL(trimmed); } catch { throw new BriefingError(trimmed ? 'Adresse invalide' : 'Adresse manquante'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new BriefingError('Adresse invalide');
  return url;
}

export async function fetchRaw(url, headers = {}, timeoutMs = 15000) {
  let response;
  try {
    response = await fetch(checkURL(url), {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.7', ...headers },
      signal: AbortSignal.timeout(timeoutMs), redirect: 'follow',
    });
  } catch (error) {
    if (error instanceof BriefingError) throw error;
    if (error.name === 'TimeoutError') throw new BriefingError("Délai d'attente dépassé");
    throw new BriefingError('Serveur introuvable ou connexion impossible');
  }
  if (!response.ok) {
    const error = new BriefingError('Erreur HTTP {0}', response.status);
    error.status = response.status;
    throw error;
  }
  return response;
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

/** Petit cache en mémoire avec durée de vie. */
export class Cache {
  #store = new Map();
  get(key, maxAgeMs) {
    const entry = this.#store.get(key);
    return entry && Date.now() - entry.time < maxAgeMs ? entry.value : undefined;
  }
  set(key, value) { this.#store.set(key, { time: Date.now(), value }); return value; }
}
