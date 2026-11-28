// Surveillance en arrière-plan pour les notifications : alertes météo, matchs des équipes suivies et
// nouveaux articles des sections qui le demandent.
//
// Pour chaque profil qui a au moins un appareil abonné, le serveur regarde périodiquement ses sections météo
// et sports, même si personne n'a la page ouverte, et compare avec ce qu'il a vu la fois précédente.
// Les sources restent ménagées : les données passent par le même cache que la page (intervalle de chaque
// section), et les pointages ne sont redemandés que lorsqu'un match suivi approche ou est en cours.
import { t } from '../public/i18n.js';
import { articleFilter, keywords, WMO_LABELS } from '../public/shared.js';

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
  // Section qui notifie tout : chaque nouvel article. Sinon, seulement ceux qui contiennent un mot-clé suivi.
  const followedWords = prefs.keywords ?? [];
  if (payload.articles && (section.feed?.notify || followedWords.length)) {
    const fresh = payload.articles.filter(articleFilter(section.feed, prefs.general));
    if (memory.articles) {
      const word = (a) => { const text = `${a.title} ${a.summary ?? ''}`.toLowerCase(); return followedWords.find((k) => text.includes(k)); };
      const added = fresh.filter((a) => !memory.articles.has(a.id) && (section.feed.notify || word(a))).sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
      if (!section.feed.notify) {
        // Mot-clé suivi : le mot est annoncé avec la section, et chaque article garde sa notification.
        for (const a of added.slice(0, 5)) {
          events.push({ title: `${word(a)} · ${section.title}`, body: a.title, tag: `article-${a.link ?? a.id}`.slice(0, 200),
            url: /^https?:\/\//i.test(String(a.link)) ? a.link : undefined });
        }
      } else if (added.length > 3) {
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

const minutesOf = (clock) => { const [h, m] = String(clock).split(':').map(Number); return h * 60 + m; };
/** Sommes-nous dans les heures calmes du profil ? La plage peut enjamber minuit (22 h → 7 h). Heure du serveur. */
export function isQuiet(general, now = new Date()) {
  if (!general.quietHours) return false;
  const start = minutesOf(general.quietStart), end = minutesOf(general.quietEnd), at = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false;
  return start < end ? at >= start && at < end : at >= start || at < end;
}

/**
 * Résumé du matin : la météo, les rendez-vous du jour et quelques grands titres, en une notification.
 * `load(section)` fournit les données d'une section (par le cache habituel). Renvoie null s'il n'y a rien à dire.
 */
export async function morningBrief(config, load, now = new Date()) {
  const sections = config.sections.filter((s) => s.enabled), lines = [];
  const safe = async (section) => { try { const payload = await load(section); return payload?.error && !payload.updatedAt ? null : payload; } catch { return null; } };
  const weatherSection = sections.find((s) => s.kind === 'weather');
  const w = weatherSection && (await safe(weatherSection))?.weather;
  if (w) {
    const today = w.days?.[0], label = WMO_LABELS[w.code] ? t(WMO_LABELS[w.code]).toLowerCase() : '';
    lines.push([`${weatherSection.weather.locationName.split(',')[0]} : ${Math.round(w.temperature)}°`, label,
      today && t('max. {0}°', Math.round(today.high)), w.alerts?.[0]?.name].filter(Boolean).join(', '));
  }
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), dayEnd = dayStart + 86400e3;
  const utcDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const events = [];
  for (const section of sections.filter((s) => s.kind === 'calendar')) {
    for (const e of (await safe(section))?.events ?? []) {
      // Journée entière : date sans fuseau (minuit UTC). Sinon, l'heure locale du début.
      if (e.allDay ? e.start <= utcDay && e.end > utcDay : e.start >= dayStart && e.start < dayEnd) events.push(e);
    }
  }
  if (events.length) {
    events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
    const hour = (ms) => new Intl.DateTimeFormat(t('fr-CA'), { hour: 'numeric', minute: '2-digit' }).format(ms);
    const shown = events.slice(0, 3).map((e) => (e.allDay ? e.title : `${hour(e.start)} ${e.title}`)).join(' · ');
    lines.push(`${events.length > 1 ? t('{0} rendez-vous', events.length) : t('1 rendez-vous')} : ${shown}${events.length > 3 ? '…' : ''}`);
  }
  // Grands titres : le plus récent de chacune des premières sections d'articles (hors YouTube).
  const headlines = [];
  for (const section of sections.filter((s) => (s.kind === 'feed' && !s.feed.youtube) || s.kind === 'api').slice(0, 3)) {
    const payload = await safe(section);
    const top = (payload?.articles ?? []).filter(articleFilter({ ...section.feed, maxAgeHours: 24 }, config.general, now.getTime())).sort((a, b) => (b.date ?? 0) - (a.date ?? 0))[0];
    if (top && !headlines.includes(top.title)) headlines.push(top.title);
  }
  for (const title of headlines) lines.push(`• ${title}`);
  if (!lines.length) return null;
  const name = String(config.general.displayName ?? '').trim();
  return { title: name ? `${t('Bonjour')}, ${name}` : t('Bonjour'), body: lines.join('\n').slice(0, 600), tag: 'matin' };
}

/**
 * Lance la surveillance. `subscribers()` : profils à surveiller ({ id, config, lang }) ; `load(section, config)` :
 * données d'une section (avec cache) ; `deliver(id, message)` : envoi aux appareils du profil ;
 * `withLang(lang, fn)` : exécute dans la langue du profil (noms des alertes, états des matchs).
 */
export function startWatcher({ subscribers, load, deliver, withLang }) {
  const memory = new Map();   // « profil|section » -> ce qui a été vu
  const last = new Map();     // « profil|section » -> { time, payload } (pointages seulement)
  const briefed = new Map();  // profil -> jour du dernier résumé du matin
  let running = false;

  const tick = async () => {
    if (running) return;   // le tour précédent n'est pas fini (source lente)
    running = true;
    try {
      const alive = new Set();
      for (const { id, config, lang } of subscribers()) {
        const g = config.general;
        const prefs = { alerts: g.notifyAlerts !== false, gameStart: g.notifyGameStart !== false, gameEnd: g.notifyGameEnd === true, general: g,
          keywords: g.notifyKeywords ? keywords(g.highlightKeywords) : [] };
        // Heures calmes : rien n'est envoyé, mais tout est quand même observé, pour ne pas tout annoncer d'un coup au réveil.
        const quiet = isQuiet(g);
        const send = (event, section) => (quiet && !(section.kind === 'weather' && g.quietAllowAlerts !== false) ? null : deliver(id, event));

        // Résumé du matin : une fois par jour, dans l'heure qui suit le moment choisi.
        const now = new Date(), today = now.toDateString();
        const sinceBrief = now.getHours() * 60 + now.getMinutes() - minutesOf(g.morningTime);
        if (g.morningBrief && sinceBrief >= 0 && sinceBrief < 60 && briefed.get(id) !== today) {
          briefed.set(id, today);
          try {
            await withLang(lang, async () => { const brief = await morningBrief(config, (section) => load(section, config), now); if (brief) await deliver(id, brief); });
          } catch (error) { console.warn('Notifications — résumé du matin :', error.message); }
        }

        for (const section of config.sections) {
          const watched = section.enabled && ((section.kind === 'weather' && prefs.alerts && section.weather.showAlerts !== false)
            || (section.kind === 'sports' && (prefs.gameStart || prefs.gameEnd) && followed(section).size)
            || ((section.kind === 'feed' || section.kind === 'api') && (section.feed.notify || (prefs.keywords.length > 0 && !section.feed.youtube))));
          if (!watched) continue;
          const key = `${id}|${section.id}`;
          alive.add(key);
          if (section.kind === 'sports' && !sportsDue(section, last.get(key))) continue;
          try {
            await withLang(lang, async () => {
              const payload = await load(section, config);
              if (section.kind === 'sports' && !payload.error) last.set(key, { time: Date.now(), payload });
              if (!memory.has(key)) memory.set(key, {});
              for (const event of diffEvents(section, payload, memory.get(key), prefs)) await send(event, section);
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
