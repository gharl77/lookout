// Allège les données d'une section d'articles avant de les envoyer au navigateur.
// Une section YouTube de 200 chaînes reçoit 3 000 vidéos (15 par chaîne) alors que sa carte en montre une
// poignée : on n'envoie que celles qui peuvent servir à l'affichage et à la recherche.
import { articleFilter } from '../public/shared.js';

export const ARTICLE_LIMIT = 250;

/**
 * Articles à envoyer : d'abord ceux que la carte peut afficher (ils passent ses filtres), les plus récents en tête,
 * puis les autres pour la recherche, jusqu'à la limite. Avec l'alternance entre sources, les plus récents de chaque
 * source sont toujours gardés, pour qu'une source discrète ne disparaisse pas derrière les plus bavardes.
 */
export function trimArticles(articles, section, general = {}, limit = ARTICLE_LIMIT) {
  if (!Array.isArray(articles) || articles.length <= limit) return articles;
  const passes = articleFilter(section.feed, general), newest = (a, b) => (b.date ?? 0) - (a.date ?? 0);
  const shown = articles.filter(passes).sort(newest), others = articles.filter((a) => !passes(a)).sort(newest);
  const kept = new Set(shown.slice(0, limit));
  if (section.feed.ordering === 'balanced') {
    const sources = new Set(shown.map((a) => a.source)).size || 1, each = Math.ceil(Math.max(1, section.maxItems) / sources) + 1, seen = new Map();
    for (const a of shown) { const n = seen.get(a.source) ?? 0; if (n < each) { kept.add(a); seen.set(a.source, n + 1); } }
  }
  for (const a of others) { if (kept.size >= limit) break; kept.add(a); }
  return articles.filter((a) => kept.has(a));
}
