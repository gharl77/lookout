// Bourse et devises : cours d'un titre, d'un indice ou d'une paire de devises (Yahoo Finance, sans clé).
// Ce service n'a pas de contrat public : s'il change, la section affiche une erreur sans toucher au reste.
import { BriefingError, fetchJSON, settle } from './util.js';

const SYMBOL = /^[A-Za-z0-9.^=-]{1,20}$/;
// Ce service refuse les agents qui se présentent comme un navigateur sans en être un : Lookout s'y annonce sous son propre nom.
const HEADERS = { 'User-Agent': 'Lookout/1.0' };

async function quote(item) {
  const symbol = String(item.symbol ?? '').trim().toUpperCase();
  if (!SYMBOL.test(symbol)) throw new BriefingError('Symbole invalide : {0}', symbol || '?');
  let data;
  try { data = await fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, HEADERS); } catch (error) {
    if (error.status === 404) throw new BriefingError('Symbole introuvable : {0}', symbol);
    if (error.status === 429) throw new BriefingError('Le service de cours limite les demandes pour le moment');
    throw error;
  }
  const meta = data?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice), previous = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  if (!Number.isFinite(price)) throw new BriefingError('Aucun cours pour {0}', symbol);
  const change = Number.isFinite(previous) && previous ? price - previous : null;
  return { id: item.id, symbol, name: String(item.name || meta.shortName || meta.longName || symbol).slice(0, 60), price,
    change, changePct: change === null ? null : (change / previous) * 100, currency: String(meta.currency ?? '').slice(0, 6),
    type: String(meta.instrumentType ?? '').slice(0, 20), time: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null };
}

export async function fetchStocks(options) {
  const wanted = (options.symbols ?? []).filter((x) => x.enabled !== false && String(x.symbol ?? '').trim());
  if (!wanted.length) throw new BriefingError('Ajoutez au moins un symbole dans les réglages de la section');
  const quotes = [], sourceErrors = {};
  for (const r of await settle(wanted, quote)) {
    if (r.error) sourceErrors[r.item.id] = r.error; else quotes.push(r.value);
  }
  if (!quotes.length) throw new BriefingError('{0}', Object.values(sourceErrors)[0]);
  return { quotes, sourceErrors };
}

/** Titres, indices et devises qui correspondent à une recherche, pour le choix dans les réglages. */
export async function searchSymbols(query) {
  const q = String(query ?? '').trim().slice(0, 40);
  if (q.length < 2) return [];
  const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
  url.search = new URLSearchParams({ q, quotesCount: '10', newsCount: '0' });
  const data = await fetchJSON(url, HEADERS);
  return (data?.quotes ?? []).filter((x) => SYMBOL.test(String(x.symbol ?? ''))).slice(0, 10)
    .map((x) => ({ symbol: x.symbol, name: String(x.shortname ?? x.longname ?? x.symbol).slice(0, 60), where: [x.exchDisp, x.typeDisp].filter(Boolean).join(' · ') }));
}
