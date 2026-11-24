// Fils RSS / Atom et API JSON générique.
import { BriefingError, fetchText, fetchJSON, plain, decodeEntities, parseDate, settle } from './util.js';
import { t } from '../public/i18n.js';

const cdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();

function tag(block, ...names) {
  for (const name of names) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
    if (m && m[1].trim()) return cdata(m[1]);
  }
  return '';
}

function attr(element, name) {
  return new RegExp(`\\s${name}=["']([^"']*)["']`, 'i').exec(element)?.[1] ?? '';
}

function parseFeed(xml, source) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const articles = [];
  for (const block of blocks.slice(0, 60)) {
    const title = plain(tag(block, 'title'));
    if (!title) continue;

    // Lien : texte de <link> (RSS) ou attribut href (Atom, de préférence rel="alternate").
    let link = '';
    for (const el of block.match(/<link\b[^>]*>/gi) ?? []) {
      const href = attr(el, 'href');
      if (href && ((attr(el, 'rel') || 'alternate') === 'alternate' || !link)) link = href;
    }
    if (!link) link = tag(block, 'link');
    link = decodeEntities(link.trim());

    const summaryHTML = tag(block, 'description', 'summary');
    const contentHTML = tag(block, 'content:encoded', 'content');
    let image = '';
    for (const el of block.match(/<(enclosure|media:content|media:thumbnail)\b[^>]*>/gi) ?? []) {
      const type = attr(el, 'type') || attr(el, 'medium') || 'image';
      if (attr(el, 'url') && type.startsWith('image')) { image = attr(el, 'url'); break; }
    }
    if (!image) image = /<img[^>]+src=["']([^"']+)["']/i.exec(decodeEntities(contentHTML + summaryHTML))?.[1] ?? '';
    image = decodeEntities(image);

    const guid = tag(block, 'guid', 'id');
    articles.push({
      id: source.id + (guid || link || source.url + title),
      title,
      summary: plain(summaryHTML || contentHTML).slice(0, 320),
      link: /^https?:/i.test(link) ? link : null,
      date: parseDate(tag(block, 'pubDate', 'published', 'dc:date', 'updated')),
      image: /^https?:/i.test(image) ? image : null,
      source: source.name,
    });
  }
  return articles;
}

// Fil YouTube d'une chaîne ou de sa liste « vidéos ».
const YOUTUBE_FEED = /^https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?/;

async function fetchSource(source) {
  const youtube = YOUTUBE_FEED.test(source.url);
  let xml;
  try { xml = await fetchText(source.url); } catch (error) {
    // Une chaîne sans vidéo longue (seulement des Shorts ou des directs) n'a pas de liste « vidéos » : YouTube répond
    // 404. Ce n'est pas une panne : elle n'a simplement rien à montrer.
    if (youtube && error.status === 404 && source.url.includes('playlist_id=')) return [];
    throw error;
  }
  const articles = parseFeed(xml, source);
  if (!articles.length && !youtube) throw new BriefingError('Aucun article trouvé (fil RSS invalide ?)');
  return articles;
}

/** Télécharge toutes les sources actives en parallèle. Échoue seulement si aucune ne répond. */
export async function fetchFeeds(sources) {
  const active = (sources ?? []).filter((s) => s.enabled);
  if (!active.length) throw new BriefingError('Aucune source active');
  const articles = [], sourceErrors = {};
  for (const r of await settle(active, fetchSource)) {
    if (r.error) sourceErrors[r.item.id] = r.error; else articles.push(...r.value);
  }
  const first = Object.values(sourceErrors)[0];
  if (!articles.length && first) {
    if (active.length === 1) throw new BriefingError('{0}', first);
    throw new BriefingError("Aucune source n'a répondu ({0})", first);
  }
  return { articles, sourceErrors };
}

// --- API JSON générique ---

/** Navigue dans le JSON avec un chemin pointé : « data.items », « 0.title ». */
export function valueAt(path, root) {
  let current = root;
  for (const key of String(path ?? '').split('.').filter(Boolean)) {
    if (Array.isArray(current) && /^\d+$/.test(key)) current = current[Number(key)];
    else if (current && typeof current === 'object' && key in current) current = current[key];
    else return undefined;
  }
  return current ?? undefined;
}

const stringAt = (path, root) => {
  if (!String(path ?? '').trim()) return null;
  const v = valueAt(path, root);
  return typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : null);
};

export async function fetchJSONAPI(options, sourceName) {
  const headers = {};
  for (const line of String(options.headers ?? '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const root = await fetchJSON(options.url, headers);
  const list = valueAt(options.itemsPath, root);
  if (!Array.isArray(list)) throw new BriefingError('Aucune liste trouvée au chemin « {0} »', options.itemsPath || t('(racine)'));
  const articles = [];
  list.slice(0, 100).forEach((item, index) => {
    const title = stringAt(options.titlePath, item);
    if (!title) return;
    const link = stringAt(options.linkPath, item);
    const image = stringAt(options.imagePath, item);
    const rawDate = String(options.datePath ?? '').trim() ? valueAt(options.datePath, item) : null;
    articles.push({
      id: link || `${options.url}#${index}#${title}`,
      title: plain(title), summary: plain(stringAt(options.subtitlePath, item) ?? ''),
      link: link && /^https?:/i.test(link) ? link : null, date: parseDate(rawDate),
      image: image && /^https?:/i.test(image) ? image : null, source: sourceName,
    });
  });
  if (!articles.length) throw new BriefingError('Aucun élément avec le champ « {0} »', options.titlePath);
  return { articles, sourceErrors: {} };
}
