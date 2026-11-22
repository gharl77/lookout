// Lecteur d'article : télécharge une page et n'en garde que le texte principal, pour le lire dans Lookout.
// Le résultat est une liste de blocs de texte (jamais de HTML) : le navigateur construit l'affichage lui-même.
import { BriefingError, fetchRaw, assertPublicHost, decodeEntities, plain, Cache } from './util.js';

const cache = new Cache(80);   // quelques dizaines d'articles récents suffisent
const MAX_BYTES = 3e6;

const meta = (html, ...names) => {
  for (const name of names) {
    const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i').exec(html)?.[0];
    const content = tag && /content=(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (content) return decodeEntities(content[1] ?? content[2]).trim();
  }
  return '';
};

/** Contenu de la plus longue balise de ce nom (les pages ont parfois plusieurs <article> : résumés, encadrés…). */
function largest(html, name) {
  let best = '';
  const open = new RegExp(`<${name}\\b[^>]*>`, 'gi'), close = `</${name}>`;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    // Fermeture correspondante, en comptant les balises du même nom imbriquées.
    let depth = 1, at = open.lastIndex;
    const step = new RegExp(`<${name}\\b[^>]*>|</${name}>`, 'gi');
    step.lastIndex = at;
    for (let n = step.exec(html); n; n = step.exec(html)) {
      depth += n[0].toLowerCase() === close ? -1 : 1;
      if (depth === 0) { at = n.index; break; }
    }
    if (depth !== 0) continue;
    const inner = html.slice(open.lastIndex, at);
    if (plain(inner).length > plain(best).length) best = inner;
  }
  return best;
}

const absolute = (src, base) => { try { const u = new URL(decodeEntities(src), base); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };

/** Extrait le titre et les blocs lisibles d'une page HTML. */
export function extract(html, url) {
  const title = meta(html, 'og:title', 'twitter:title') || plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  // Tout ce qui n'est jamais du texte d'article.
  const body = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|button|select|template|figcaption)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const article = largest(body, 'article');
  const main = article.length > 600 ? article : (largest(body, 'main') || /<body[^>]*>([\s\S]*)<\/body>/i.exec(body)?.[1] || body);
  const strict = main !== article;   // sans <article>, on ne garde que les vrais paragraphes
  const blocks = [];
  const seen = new Set();
  const pattern = /<(p|h[1-4]|li|blockquote|pre)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*>/gi;
  for (let m = pattern.exec(main); m; m = pattern.exec(main)) {
    if (!m[1]) {
      const tag = m[0], src = /\ssrc=["']([^"']+)["']/i.exec(tag)?.[1] ?? /\sdata-src=["']([^"']+)["']/i.exec(tag)?.[1];
      const width = Number(/\swidth=["']?(\d+)/i.exec(tag)?.[1] ?? 0);
      const href = src && !/^data:/i.test(src) && absolute(src, url);
      // Les petites images sont des icônes, des avatars ou des pixels de mesure.
      if (href && !(width && width < 200) && !seen.has(href) && !/\.svg(\?|$)|pixel|sprite|logo|avatar/i.test(href)) {
        seen.add(href);
        blocks.push({ type: 'img', src: href, alt: decodeEntities(/\salt=["']([^"']*)["']/i.exec(tag)?.[1] ?? '').slice(0, 200) });
      }
      continue;
    }
    const kind = m[1].toLowerCase(), text = plain(kind === 'pre' ? m[2] : m[2].replace(/<br\s*\/?>/gi, ' '));
    if (!text || seen.has(text)) continue;
    if (kind === 'p' && strict && text.length < 60) continue;
    if (kind === 'li' && (strict || text.length < 25)) continue;   // menus et listes de liens
    seen.add(text);
    blocks.push({ type: kind === 'p' ? 'p' : kind === 'li' ? 'li' : kind === 'blockquote' ? 'quote' : kind === 'pre' ? 'pre' : 'h', text: text.slice(0, 6000) });
  }
  // Un titre de section sans texte à sa suite n'apporte rien ; le titre de la page n'est pas répété.
  const kept = blocks.filter((b, i) => !(b.type === 'h' && (b.text === title || !blocks.slice(i + 1).some((x) => x.type !== 'h' && x.type !== 'img'))));
  const words = kept.filter((b) => b.text).reduce((n, b) => n + b.text.split(/\s+/).length, 0);
  return { title, site: meta(html, 'og:site_name'), byline: meta(html, 'author', 'article:author').replace(/^https?:\/\/\S+$/, ''),
    published: Date.parse(meta(html, 'article:published_time', 'date')) || null, image: absolute(meta(html, 'og:image') || '', url),
    blocks: kept.slice(0, 400), words, minutes: Math.max(1, Math.round(words / 220)) };
}

/** Article lisible à cette adresse. Lève une erreur claire si la page n'a pas de texte exploitable. */
export async function readArticle(url) {
  const hit = cache.get(url, 30 * 60e3);
  if (hit) return hit;
  await assertPublicHost(url);
  let response;
  try { response = await fetchRaw(url, { Accept: 'text/html,application/xhtml+xml' }, 12000); } catch (error) {
    // Le site refuse les lecteurs automatiques ou réserve l'article à ses abonnés.
    if ([401, 402, 403, 451].includes(error.status)) throw new BriefingError("Ce site ne permet pas de lire cet article ici. Ouvrez-le sur le site.");
    throw error;
  }
  if (!/html/i.test(response.headers.get('content-type') ?? 'text/html')) throw new BriefingError("Cette page n'est pas un article lisible ici");
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) throw new BriefingError('Page trop volumineuse pour le lecteur');
  await assertPublicHost(response.url || url);   // une redirection ne doit pas non plus mener au réseau local
  // Lecture par morceaux : on s'arrête dès que la limite est dépassée, sans tout charger en mémoire.
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new BriefingError('Page trop volumineuse pour le lecteur');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const head = bytes.subarray(0, 2000).toString('latin1');
  const charset = /charset=([\w-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  let html;
  try { html = new TextDecoder(charset || 'utf-8').decode(bytes); } catch { html = bytes.toString('utf8'); }
  const result = extract(html, response.url || url);
  // Trop peu de texte : page protégée par un abonnement, ou construite entièrement par du JavaScript.
  if (result.words < 80) throw new BriefingError("Le texte de cet article n'a pas pu être extrait. Ouvrez-le sur le site.");
  return cache.set(url, { ...result, url: response.url || url });
}
