// Résumé du jour : les titres des fils du profil, condensés par Claude (API Anthropic).
// Appel HTTP direct plutôt que le SDK officiel : Lookout n'a aucune dépendance, et l'image n'embarque pas npm.
import crypto from 'node:crypto';
import { BriefingError } from './util.js';
import { getLang } from '../public/i18n.js';

export const SUMMARY_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
// Repli côté serveur quand un classificateur refuse la requête : offert sur ces modèles seulement.
const WITH_FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const previous = new Map();   // section -> { hash, result } : mêmes titres, même résumé, pas de nouvel appel

/**
 * `items` : [{ section, source, title, link }]. Renvoie { summary: [{ text, link, source }], model }.
 * `onUsage({ model, inputTokens, outputTokens })` est appelé après chaque appel réellement fait au service.
 * Si les titres n'ont pas changé depuis le dernier résumé de cette section, celui-ci est repris tel quel.
 */
export async function fetchSummary(sectionID, options, key, items, onUsage = null) {
  const apiKey = String(key ?? '').trim();
  if (!apiKey) throw new BriefingError('Clé Anthropic manquante (voir les réglages de la section)');
  if (!items.length) throw new BriefingError('Aucun article à résumer pour le moment');
  const model = SUMMARY_MODELS.includes(options.model) ? options.model : SUMMARY_MODELS[0];
  const count = Math.min(10, Math.max(3, Number(options.points) || 5)), lang = getLang();
  const focus = String(options.focus ?? '').trim().slice(0, 300);
  const hash = crypto.createHash('sha256').update(JSON.stringify([model, count, lang, focus, items.map((i) => i.title)])).digest('hex');
  const last = previous.get(sectionID);
  if (last?.hash === hash) return last.result;

  const system = [
    `You write the daily briefing card of a personal news dashboard. The reader skims it in ten seconds to know what matters today.`,
    `From the numbered headlines below, pick the ${count} most significant developments. When several headlines cover the same story, merge them into one point.`,
    `Write each point as one plain sentence of at most 30 words, in ${lang === 'en' ? 'English' : 'French (as written in Québec)'}, stating what happened. Use only what the headlines say: do not add facts, causes or outcomes that are not in them.`,
    focus ? `The reader asked for this emphasis: ${focus}` : '',
    `Reply with a JSON array and nothing else: [{"text": "...", "sources": [headline numbers]}]. List the most important point first.`,
  ].filter(Boolean).join('\n');
  const list = items.map((item, i) => `${i + 1}. [${item.section}${item.source && item.source !== item.section ? ` · ${item.source}` : ''}] ${item.title}`).join('\n');

  const fallback = WITH_FALLBACK.has(model);
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(120e3),
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2026-10-21', 'content-type': 'application/json',
        ...(fallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}) },
      body: JSON.stringify({ model, max_tokens: 16000, output_config: { effort: 'low' }, ...(fallback ? { fallbacks: 'default' } : {}),
        system, messages: [{ role: 'user', content: list }] }) });
  } catch { throw new BriefingError('Service Anthropic injoignable'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new BriefingError('Clé Anthropic refusée');
    if (response.status === 429) throw new BriefingError('Limite de requêtes Anthropic atteinte');
    throw new BriefingError('Le résumé a échoué ({0})', String(body.error?.message ?? `HTTP ${response.status}`).slice(0, 160));
  }
  if (body.stop_reason === 'refusal') throw new BriefingError('Le modèle a refusé de résumer ces titres');
  const text = (body.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('');
  let points;
  try { points = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)); } catch { throw new BriefingError('Le résumé reçu est illisible'); }
  const summary = (Array.isArray(points) ? points : []).filter((p) => p && typeof p.text === 'string' && p.text.trim()).slice(0, count).map((p) => {
    const first = items[(Array.isArray(p.sources) ? Number(p.sources[0]) : 0) - 1];
    return { text: p.text.trim().slice(0, 400), link: first?.link ?? null, source: first ? (first.source || first.section) : '' };
  });
  if (!summary.length) throw new BriefingError('Le résumé reçu est illisible');
  // Un vrai appel vient d'être facturé : on le signale (les résumés repris tels quels, plus haut, ne coûtent rien).
  onUsage?.({ model, inputTokens: Number(body.usage?.input_tokens) || 0, outputTokens: Number(body.usage?.output_tokens) || 0 });
  const result = { summary, model: body.model ?? model, basedOn: items.length };
  previous.set(sectionID, { hash, result });
  return result;
}
