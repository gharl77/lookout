// Sorties : films en salle ou à venir (TMDB, avec clé) et premières de saisons de séries (TVmaze, sans clé).
import { BriefingError, fetchJSON, settle, Cache } from './util.js';
import { getLang } from '../public/i18n.js';

const cache = new Cache();
const DAY = 24 * 3600e3;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Premières de saisons (épisode 1) diffusées ou mises en ligne dans la période, pour un pays. */
async function seriesPremieres(country, days) {
  const dates = Array.from({ length: days + 2 }, (_, i) => ymd(Date.now() + (i - 1) * DAY));
  const fetched = await settle(dates.flatMap((date) => [
    `https://api.tvmaze.com/schedule?country=${country}&date=${date}`,
    `https://api.tvmaze.com/schedule/web?date=${date}`]), async (url) => {
    const hit = cache.get(url, 6 * 3600e3);
    return hit ?? cache.set(url, await fetchJSON(url));
  });
  if (fetched.every((r) => r.error)) throw new BriefingError('Calendrier des séries indisponible');
  const seen = new Set(), out = [];
  for (const r of fetched) {
    for (const episode of r.error ? [] : r.value) {
      const show = episode.show ?? episode._embedded?.show;
      if (!show || episode.number !== 1 || seen.has(`${show.id}-${episode.season}`)) continue;
      // Diffusion en continu : seulement les services mondiaux ou du pays choisi.
      const web = show.webChannel, webCountry = web?.country?.code;
      if (!show.network && web && webCountry && webCountry !== country) continue;
      // Service mondial sans pays : on ne garde que les séries un peu connues, sinon la liste se remplit de titres régionaux.
      if (!show.network && web && !webCountry && (show.weight ?? 0) < 40) continue;
      if (show.network && show.network.country?.code && show.network.country.code !== country) continue;
      if (['Talk Show', 'News', 'Game Show', 'Sports'].includes(show.type)) continue;
      seen.add(`${show.id}-${episode.season}`);
      out.push({ id: `tv-${show.id}-${episode.season}`, kind: 'series', title: show.name,
        date: Date.parse(episode.airstamp ?? `${episode.airdate}T12:00:00Z`) || null,
        season: episode.season, where: show.network?.name ?? web?.name ?? '', image: show.image?.medium ?? null, link: show.url ?? null,
        weight: show.weight ?? 0 });
    }
  }
  return out;
}

/** Films à l'affiche depuis peu ou qui sortent bientôt, dans un pays (TMDB). */
async function movies(country, key, days) {
  const lang = getLang() === 'en' ? 'en-CA' : 'fr-CA';
  // Clé courte (v3) : dans l'adresse. Jeton long (v4) : dans l'en-tête.
  const bearer = key.length > 60, headers = bearer ? { Authorization: `Bearer ${key}` } : {};
  const url = (list) => `https://api.themoviedb.org/3/movie/${list}?region=${country}&language=${lang}&page=1${bearer ? '' : `&api_key=${encodeURIComponent(key)}`}`;
  let lists;
  try { lists = await Promise.all(['now_playing', 'upcoming'].map((list) => fetchJSON(url(list), headers))); } catch (e) {
    if (e.status === 401) throw new BriefingError('Clé TMDB refusée');
    throw e;
  }
  const from = Date.now() - 21 * DAY, to = Date.now() + Math.max(days, 30) * DAY, seen = new Set(), out = [];
  for (const movie of lists.flatMap((l) => l.results ?? [])) {
    const date = Date.parse(`${movie.release_date}T12:00:00Z`);
    if (!date || date < from || date > to || seen.has(movie.id)) continue;
    seen.add(movie.id);
    out.push({ id: `movie-${movie.id}`, kind: 'movie', title: movie.title, date, season: null, where: '',
      image: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null, link: `https://www.themoviedb.org/movie/${movie.id}`,
      weight: movie.popularity ?? 0 });
  }
  return out;
}

export async function fetchReleases(options) {
  const country = /^[A-Z]{2}$/.test(options.country) ? options.country : 'CA', days = Math.min(30, Math.max(1, Number(options.days) || 7));
  const key = String(options.tmdbKey ?? '').trim(), sourceErrors = {};
  const [films, series] = await Promise.all([
    options.showMovies && key ? movies(country, key, days).catch((e) => { sourceErrors.movies = e instanceof BriefingError ? e.message : String(e.message); return []; }) : [],
    options.showSeries ? seriesPremieres(country, days).catch((e) => { sourceErrors.series = e instanceof BriefingError ? e.message : String(e.message); return []; }) : [],
  ]);
  if (!films.length && !series.length && Object.keys(sourceErrors).length) throw new BriefingError(Object.values(sourceErrors)[0]);
  // Les sorties à venir d'abord (les plus proches en premier), puis celles des derniers jours.
  const now = Date.now() - DAY / 2;
  const releases = [...films, ...series].sort((a, b) => ((a.date < now) - (b.date < now)) || (a.date >= now ? a.date - b.date : b.date - a.date) || b.weight - a.weight);
  return { releases, needsKey: Boolean(options.showMovies && !key), sourceErrors };
}
