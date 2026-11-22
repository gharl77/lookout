// YouTube sans clé ni compte : chaque chaîne publie un fil Atom de ses dernières vidéos.
// Ce module retrouve l'identifiant d'une chaîne à partir de ce que l'utilisateur colle (adresse, @nom, identifiant).
import { BriefingError, fetchText, decodeEntities } from './util.js';

const ID = /UC[\w-]{22}/;
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  'Accept-Language': 'fr-CA,fr;q=0.9,en;q=0.8', Cookie: 'CONSENT=YES+1' };

export const channelFeed = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

/** Retrouve une chaîne : renvoie { id, name, url } (url = adresse de son fil de vidéos). */
export async function resolveChannel(input) {
  const text = String(input ?? '').trim();
  if (!text) throw new BriefingError('Entrez une adresse de chaîne ou un @nom');
  let id = /^UC[\w-]{22}$/.test(text) ? text : /(?:\/channel\/|channel_id=)(UC[\w-]{22})/.exec(text)?.[1] ?? null;
  let name = '';
  if (!id) {
    // @nom, nom seul ou adresse de la chaîne : la page de la chaîne donne son identifiant.
    let page;
    if (/^https?:\/\//i.test(text)) {
      let url;
      try { url = new URL(text); } catch { throw new BriefingError('Adresse invalide'); }
      if (!/(^|\.)youtube\.com$/.test(url.hostname)) throw new BriefingError("Ce n'est pas une adresse YouTube");
      page = `https://www.youtube.com${url.pathname}`;
    } else {
      if (!/^@?[\w.-]{2,60}$/.test(text)) throw new BriefingError('Entrez une adresse de chaîne ou un @nom');
      page = `https://www.youtube.com/@${text.replace(/^@/, '')}`;
    }
    let html;
    try { html = await fetchText(page, BROWSER); } catch { throw new BriefingError('Chaîne YouTube introuvable'); }
    id = new RegExp(`<link rel="canonical" href="https://www\\.youtube\\.com/channel/(${ID.source})"`).exec(html)?.[1]
      ?? new RegExp(`"externalId":"(${ID.source})"`).exec(html)?.[1] ?? null;
    if (!id) throw new BriefingError('Chaîne YouTube introuvable');
    name = decodeEntities(/<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? '');
  }
  if (!name) {
    try { name = decodeEntities(/<title>([^<]*)<\/title>/.exec(await fetchText(channelFeed(id)))?.[1] ?? ''); }
    catch { throw new BriefingError('Chaîne YouTube introuvable'); }
  }
  return { id, name: name || id, url: channelFeed(id) };
}
