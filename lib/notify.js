// Surveillance en arrière-plan pour les notifications : alertes météo, matchs des équipes suivies et
// nouveaux articles des sections qui le demandent.
//
// Pour chaque profil qui a au moins un appareil abonné, le serveur regarde périodiquement ses sections météo
// et sports, même si personne n'a la page ouverte, et compare avec ce qu'il a vu la fois précédente.
// Les sources restent ménagées : les données passent par le même cache que la page (intervalle de chaque
// section), et les pointages ne sont redemandés que lorsqu'un match suivi approche ou est en cours.
import { t } from '../public/i18n.js';
import { articleFilter } from '../public/shared.js';

const TICK_MS = 60e3;
const IDLE_SPORTS_MS = 30 * 60e3;   // sans match proche : un coup d'œil aux pointages par demi-heure

/** Équipes suivies par ligue. Une ligue sans équipe choisie n'envoie rien : tous ses matchs, ce serait trop. */
function followed(section) {
  return new Map(section.sports.leagues.filter((l) => l.enabled !== false && l.teams?.length).map((l) => [l.id, new Set(l.teams.map((x) => x.id))]));
}
const involves = (teams, game) => Boolean(teams && (teams.has(game.home?.id) || teams.has(game.away?.id)));
const matchup = (game) => `${game.away?.name ?? '?'} – ${game.home?.name ?? '?'}`;

/**
 * Compare les données d'une section à ce qui a été vu la fois précédente et renvoie les notifications à envoyer.
 * `memory` (un objet par section, tenu par l'appelant) est mis à jour. La première observation d'une section
 * sert de point de départ : elle n'envoie rien, pour ne pas tout annoncer à chaque redémarrage du serveur.
 */
export function diffEvents(section, payload, memory, prefs) {
  const events = [];
  if (!payload || payload.error) return events;   // source en panne : on garde ce qu'on savait

  if (section.kind === 'weather') {
    const alerts = payload.weather?.alerts ?? [];
    const current = new Set(alerts.map((a) => `${a.type}|${a.name}`));
    if (memory.alerts && prefs.alerts) {
      for (const alert of alerts) {
        if (memory.alerts.has(`${alert.type}|${alert.name}`)) continue;
        events.push({ title: `${alert.name} — ${section.weather.locationName}`, body: alert.summary || '',
          tag: `alerte-${section.id}-${alert.name}` });
      }
    }
    memory.alerts = current;
  }

  // Nouveaux articles d'une section (fils RSS ou API JSON) : seulement ceux que la carte afficherait.
  if (payload.articles && section.feed?.notify) {
    const fresh = payload.articles.filter(articleFilter(section.feed, prefs.general));
    if (memory.articles) {
      const added = fresh.filter((a) => !memory.articles.has(a.id)).sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
      if (added.length > 3) {
        // Rafale (fil resté muet un moment, nouvelle source) : une seule notification, qui ouvre Lookout.
        events.push({ title: section.title, body: `${t('{0} nouveaux articles', added.length)} — ${added[0].title}`, tag: `articles-${section.id}` });
      } else {
        for (const a of added) {
          const single = section.feed.sources.filter((s) => s.enabled).length < 2 || !a.source;
          events.push({ title: single ? section.title : `${section.title} · ${a.source}`, body: a.title, tag: `article-${a.id}`.slice(0, 200),
            url: /^https?:\/\//i.test(String(a.link)) ? a.link : undefined });
        }
      }
    }
    // On retient aussi les articles écartés par les filtres : un filtre qu'on assouplit n'annonce pas tout le passé.
    const known = new Set([...(memory.articles ?? []), ...payload.articles.map((a) => a.id)]);
    memory.articles = known.size > 3000 ? new Set([...known].slice(-2000)) : known;
  }

  if (section.kind === 'sports') {
    const teams = followed(section), first = !memory.games, previous = memory.games ?? new Map(), current = new Map();
    for (const game of payload.games ?? []) {
      if (!involves(teams.get(game.leagueID), game)) continue;
      current.set(game.id, game.state);
      const before = previous.get(game.id);
      if (first || before === game.state) continue;
      // Un match jamais vu et déjà commencé (ou fini) n'est pas annoncé : on ne sait pas depuis quand.
      if (game.state === 'live' && before === 'scheduled' && prefs.gameStart) {
        events.push({ title: t('Début du match'), body: `${matchup(game)} · ${game.league}`, tag: `match-${game.id}` });
      }
      if (game.state === 'final' && (before === 'live' || before === 'scheduled') && prefs.gameEnd) {
        events.push({ title: t('Résultat final'), body: `${game.away?.name} ${game.away?.score ?? ''} – ${game.home?.name} ${game.home?.score ?? ''} · ${game.league}`,
          tag: `match-${game.id}` });
      }
    }
    memory.games = current;
  }
  return events;
}

/** Faut-il redemander les pointages maintenant ? Oui si un match suivi est en cours ou commence bientôt. */
export function sportsDue(section, last, now = Date.now()) {
  if (!last || now - last.time > IDLE_SPORTS_MS) return true;
  const teams = followed(section);
  return (last.payload.games ?? []).some((game) => involves(teams.get(game.leagueID), game)
    && (game.state === 'live' || (game.state === 'scheduled' && game.date && game.date - now < 10 * 60e3 && now - game.date < 4 * 3600e3)));
}

/**
 * Lance la surveillance. `subscribers()` : profils à surveiller ({ id, config, lang }) ; `load(section, config)` :
 * données d'une section (avec cache) ; `deliver(id, message)` : envoi aux appareils du profil ;
 * `withLang(lang, fn)` : exécute dans la langue du profil (noms des alertes, états des matchs).
 */
export function startWatcher({ subscribers, load, deliver, withLang }) {
  const memory = new Map();   // « profil|section » -> ce qui a été vu
  const last = new Map();     // « profil|section » -> { time, payload } (pointages seulement)
  let running = false;

  const tick = async () => {
    if (running) return;   // le tour précédent n'est pas fini (source lente)
    running = true;
    try {
      const alive = new Set();
      for (const { id, config, lang } of subscribers()) {
        const g = config.general;
        const prefs = { alerts: g.notifyAlerts !== false, gameStart: g.notifyGameStart !== false, gameEnd: g.notifyGameEnd === true, general: g };
        for (const section of config.sections) {
          const watched = section.enabled && ((section.kind === 'weather' && prefs.alerts && section.weather.showAlerts !== false)
            || (section.kind === 'sports' && (prefs.gameStart || prefs.gameEnd) && followed(section).size)
            || ((section.kind === 'feed' || section.kind === 'api') && section.feed.notify));
          if (!watched) continue;
          const key = `${id}|${section.id}`;
          alive.add(key);
          if (section.kind === 'sports' && !sportsDue(section, last.get(key))) continue;
          try {
            await withLang(lang, async () => {
              const payload = await load(section, config);
              if (section.kind === 'sports' && !payload.error) last.set(key, { time: Date.now(), payload });
              if (!memory.has(key)) memory.set(key, {});
              for (const event of diffEvents(section, payload, memory.get(key), prefs)) await deliver(id, event);
            });
          } catch (error) { console.warn(`Notifications — section « ${section.title} » :`, error.message); }
        }
      }
      // Sections supprimées, profils désabonnés : leur mémoire est oubliée.
      for (const key of memory.keys()) if (!alive.has(key)) { memory.delete(key); last.delete(key); }
    } finally { running = false; }
  };
  setInterval(tick, TICK_MS).unref();
  setTimeout(tick, 15e3).unref();
}
