// Contenu des cartes : articles, météo, pointages, trajets.
import { h, icon, sfIcon, fmt, t, openMenu, copyText } from './ui.js';

// --- Articles (RSS et API JSON) ---

import { keywords, articleFilter, youtubeVideoID, WMO_LABELS } from './shared.js';

/** Filtre, trie et limite les articles selon les réglages d'affichage de la section. */
export function present(articles, options, sourceOrder, limit, general = {}, skip = null) {
  const keep = articleFilter(options, general), seen = new Set();
  const sorted = articles.filter((a) => {
    if (!keep(a) || skip?.(a)) return false;
    const key = a.title.toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  }).sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  if (options.ordering !== 'balanced') return sorted.slice(0, limit);

  // Alterne entre les sources pour qu'un fil très actif ne monopolise pas la section.
  const queues = new Map();
  for (const a of sorted) queues.set(a.source, [...(queues.get(a.source) ?? []), a]);
  const order = [...sourceOrder.filter((n) => queues.has(n)), ...[...queues.keys()].filter((n) => !sourceOrder.includes(n)).sort()];
  const out = [];
  while (out.length < limit) {
    let added = false;
    for (const name of order) {
      const queue = queues.get(name);
      if (out.length < limit && queue.length) { out.push(queue.shift()); added = true; }
    }
    if (!added) break;
  }
  return out;
}

/** L'article contient-il un mot à mettre en évidence (réglages de la section ou réglages généraux) ? */
function highlighted(article, section, general) {
  const words = [...keywords(section.feed.highlightKeywords), ...keywords(general.highlightKeywords)];
  if (!words.length) return false;
  const haystack = `${article.title} ${article.summary}`.toLowerCase();
  return words.some((k) => haystack.includes(k));
}

function articleRow(article, style, section, ctx) {
  const o = section.feed;
  const saved = ctx.isSaved(article.id);
  // Bouton « À lire plus tard » : visible au survol à la souris, toujours visible au doigt et une fois l'article gardé.
  const keep = ctx.canSave && article.link && h('button', { class: `row-save${saved ? ' on' : ''}`, type: 'button', 'aria-pressed': String(saved),
    title: t(saved ? 'Retirer de « À lire plus tard »' : 'À lire plus tard'), 'aria-label': t(saved ? 'Retirer de « À lire plus tard »' : 'À lire plus tard'),
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); ctx.toggleSaved(article, section); } }, sfIcon('bookmark.fill'));
  // Bouton « Lire ici » : ouvre le texte de l'article dans le lecteur intégré (pas pour les vidéos).
  const canRead = ctx.readArticle && article.link && !youtubeVideoID(article.link);
  const reader = canRead && h('button', { class: 'row-save row-read', type: 'button', title: 'Lire ici', 'aria-label': 'Lire ici',
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); ctx.setRead([article.id], true); ctx.readArticle(article, section); } }, icon('reader'));
  const read = ctx.isRead(article.id), fresh = ctx.isNew(article);
  const pill = fresh && h('span', { class: 'new-pill' }, 'Nouveau');
  const showSource = o.showSource && section.kind === 'feed' && o.sources.filter((s) => s.enabled).length > 1;
  const meta = [showSource && article.source, o.showTime && article.date && fmt.ago(article.date)].filter(Boolean).join(' · ');
  // Nouvelle que d'autres sections de la page auraient affichée aussi (doublons écartés) : on dit lesquelles.
  const also = ctx.alsoIn?.(article, section) ?? [];
  const alsoNote = also.length > 0 && h('span', { class: 'a-also', title: t('Cette nouvelle figure aussi dans : {0}', also.join(', ')) }, `${meta ? ' · ' : ''}${t('aussi dans {0}', also.join(', '))}`);
  const metaLine = (meta || pill || alsoNote) && h('span', { class: 'a-meta' }, pill, meta, alsoNote);
  const img = (cls) => o.showImages && article.image
    && h('img', { class: cls, src: article.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.target.remove() });

  // Résumé de l'article. Demandé mais absent du fil : on le dit, plutôt que de laisser un vide inexpliqué.
  const summary = (wanted) => wanted && (article.summary ? h('span', { class: 'a-summary' }, article.summary)
    : section.kind === 'feed' && h('span', { class: 'a-summary none' }, 'Aucun résumé disponible'));

  let inner;
  if (style === 'grid') {
    // Vignette : image au format vidéo (16:9), titre sur deux lignes, source et heure.
    inner = h('div', { class: 'tile row-main' }, h('div', { class: 'tile-img' }, img('')), h('span', { class: 'a-title' }, article.title), summary(o.showSummary), metaLine);
  } else if (style === 'headline') {
    inner = h('div', { class: 'headline row-main' }, img(''), h('span', { class: 'a-title' }, article.title),
      summary(true), metaLine);
  } else if (style === 'compact') {
    inner = h('div', { class: 'compact row-main' }, h('i', { class: 'dot' }), h('span', { class: 'a-title' }, article.title),
      pill, o.showTime && article.date && h('time', {}, fmt.ago(article.date)));
  } else {
    inner = h('div', { class: 'article row-main' },
      h('div', { class: 'text' }, h('span', { class: 'a-title' }, article.title),
        summary(o.showSummary), metaLine),
      img('thumb'));
  }

  const row = h(article.link ? 'a' : 'div', {
    class: `row${read && ctx.general.dimReadArticles ? ' read' : ''}${highlighted(article, section, ctx.general) ? ' hl' : ''}${keep || reader ? ' can-save' : ''}`, href: article.link, target: '_blank', rel: 'noopener noreferrer',
    title: article.summary || article.title,
    onClick: (e) => {
      ctx.setRead([article.id], true);
      // Vidéo YouTube : lecture sur place, sauf si l'on demande un nouvel onglet (Cmd/Ctrl-clic, clic du milieu).
      if (o.playInline !== false && !e.metaKey && !e.ctrlKey && !e.shiftKey && youtubeVideoID(article.link) && ctx.playVideo) { e.preventDefault(); ctx.playVideo(article); }
      // Lecteur intégré choisi par défaut : même règle, un nouvel onglet reste possible avec Cmd/Ctrl-clic.
      else if (canRead && ctx.general.readerDefault && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); ctx.readArticle(article, section); }
    },
    onContextmenu: (e) => {
      // Sur ordinateur : menu contextuel. Sur iPhone, l'appui long garde le menu natif du lien.
      if (matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      openMenu(row, [
        canRead && { label: 'Lire ici', icon: icon('reader'), action: () => { ctx.setRead([article.id], true); ctx.readArticle(article, section); } },
        article.link && { label: 'Ouvrir', icon: icon('open'), action: () => { window.open(article.link, '_blank', 'noopener'); ctx.setRead([article.id], true); } },
        article.link && { label: 'Copier le lien', icon: icon('link'), action: () => copyText(article.link) },
        keep && { label: saved ? 'Retirer de « À lire plus tard »' : 'À lire plus tard', icon: sfIcon('bookmark.fill'), action: () => ctx.toggleSaved(article, section) },
        '-',
        { label: read ? 'Marquer comme non lu' : 'Marquer comme lu', icon: icon(read ? 'check-off' : 'check-on'), action: () => ctx.setRead([article.id], !read) },
      ]);
    },
  }, inner, reader, keep);
  return row;
}

/** Nombre d'articles affichés parus depuis la dernière visite. */
export function countNew(section, articles, ctx) {
  return shownArticles(section, articles, ctx.general, ctx.skipFor?.(section)).filter(ctx.isNew).length;
}

/** Ce qui identifie une même nouvelle d'une section à l'autre : son adresse (sans paramètres de suivi), sinon son titre. */
export function articleKeys(article) {
  const keys = [], title = String(article.title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (article.link) {
    try {
      const u = new URL(article.link);
      keys.push(`u:${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.hostname.includes('youtube.') ? u.search : ''}`);
    } catch { /* adresse invalide : le titre suffira */ }
  }
  if (title.length >= 25) keys.push(`t:${title}`);   // un titre court (« Météo », « En direct ») n'identifie rien
  return keys;
}

/** Articles affichés par une section. `skip` écarte ceux qu'une section placée avant elle montre déjà. */
export function shownArticles(section, articles, general, skip = null) {
  return present(articles, section.feed, section.feed.sources.map((s) => s.name), Math.max(1, section.maxItems), general, skip);
}

function articleList(section, articles, ctx) {
  const shown = shownArticles(section, articles, ctx.general, ctx.skipFor?.(section));
  if (!shown.length) return h('div', { class: 'hint' }, 'Aucun article ne correspond aux filtres.');
  const layout = section.feed.layout;
  return h('div', { class: `rows${layout === 'grid' ? ' grid' : ''}` }, shown.map((a, i) => articleRow(a, layout === 'headline' ? (i === 0 ? 'headline' : 'list') : layout, section, ctx)));
}

// --- Météo ---

export const WMO = {
  label(code) {
    return WMO_LABELS[code] ? t(WMO_LABELS[code]) : '—';
  },
  icon(code, isDay = true) {
    if (code <= 1) return isDay ? icon('w-sun', 'wi-sun') : icon('w-moon', 'wi-moon');
    if (code === 2) return isDay ? icon('w-cloud-sun', 'wi-mix') : icon('w-cloud-moon', 'wi-moon');
    if (code === 3) return icon('w-cloud', 'wi-cloud');
    if (code === 45 || code === 48) return icon('w-fog', 'wi-cloud');
    if ([71, 73, 75, 77, 85, 86].includes(code)) return icon('w-snow', 'wi-snow');
    if (code >= 95) return icon('w-storm', 'wi-storm');
    return icon('w-rain', 'wi-rain');
  },
};

const deg = (v) => `${Math.round(v)}°`;

function weatherView(section, w) {
  const o = section.weather, tz = w.timeZone;
  const parts = [];
  // Alertes en vigueur (Environnement Canada), les plus graves d'abord ; un clic déplie le texte complet.
  if (o.showAlerts !== false && w.alerts?.length) {
    parts.push(h('div', { class: 'alerts' }, w.alerts.map((a) => h('details', { class: `alert ${a.type}` },
      h('summary', {}, icon('warning'), h('span', {}, h('b', {}, a.name), a.until && h('small', {}, t("jusqu'à {0}", fmt.dayTime(a.until, tz)))), icon('down', 'chevron')),
      h('p', {}, a.text || a.summary)))));
  }
  const today = w.days[0];
  parts.push(h('div', { class: 'w-now' }, WMO.icon(w.code, w.isDay),
    h('div', {}, h('div', { class: 'w-temp' }, deg(w.temperature)), h('div', { class: 'w-label' }, WMO.label(w.code))),
    today && h('div', { class: 'w-hilo' }, h('span', {}, icon('arrow-up'), ' ', deg(today.high)), h('span', {}, icon('arrow-down'), ' ', deg(today.low)))));

  if (o.showDetails) {
    const now = Date.now(), sunsetNext = w.sunset && w.sunrise && now < w.sunset && now > w.sunrise;
    const cell = (ic, value, label) => h('div', {}, icon(ic), h('b', {}, value), h('small', {}, label));
    parts.push(h('div', { class: 'w-details' },
      cell('thermo', deg(w.apparent), 'Ressenti'), cell('wind', `${Math.round(w.windSpeed)} ${w.windUnit}`, 'Vent'),
      cell('drop', `${w.humidity} %`, 'Humidité'),
      w.sunset && w.sunrise && cell('sunset', fmt.time(sunsetNext ? w.sunset : w.sunrise, tz), sunsetNext ? 'Coucher' : 'Lever')));
  }
  const hours = w.hours.filter((x) => x.time > Date.now() - 3600e3).slice(0, o.hourlyCount);
  if (o.showHourly && hours.length) {
    parts.push(h('div', { class: 'w-hours' }, hours.map((x, i) => h('div', {},
      h('small', {}, i === 0 ? 'Maint.' : fmt.hour(x.time, tz)), WMO.icon(x.code, x.isDay), h('b', {}, deg(x.temperature)),
      h('em', {}, x.pop >= 20 ? `${x.pop} %` : '')))));
  }
  const days = w.days.slice(0, o.dailyCount);
  if (o.showDaily && days.length) {
    const low = Math.min(...days.map((d) => d.low)), high = Math.max(...days.map((d) => d.high), low + 1), span = high - low;
    parts.push(h('div', { class: 'w-days' }, days.map((d, i) => {
      const a = (d.low - low) / span, b = (d.high - low) / span, width = Math.max(b - a, 0.06);
      return h('div', { class: 'w-day', 'aria-label': t('{0} : {1}, minimum {2}, maximum {3}', fmt.weekday(d.date, tz, 'long'), WMO.label(d.code), deg(d.low), deg(d.high)) },
        h('span', {}, i === 0 ? 'Auj.' : fmt.weekday(d.date, tz)), WMO.icon(d.code), h('em', {}, d.pop >= 20 ? `${d.pop} %` : ''),
        h('span', { class: 'lo' }, deg(d.low)),
        h('span', { class: 'range' }, h('i', { style: { left: `${a * 100}%`, width: `${width * 100}%`, '--w': `${100 / width}%`, '--x': `${width >= 1 ? 0 : (a / (1 - width)) * 100}%` } })),
        h('span', { class: 'hi' }, deg(d.high)));
    })));
  }
  return h('div', { class: 'weather' }, parts);
}

// --- Sports ---

const dayStart = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

const ordinal = (n) => (document.documentElement.lang === 'en'
  ? `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}` : `${n}${n === 1 ? 'er' : 'e'}`);

/** Classement des équipes suivies, sous les matchs. */
function standingsView(section, standings) {
  if (section.sports.showStandings === false || !standings?.length) return null;
  const showLeague = section.sports.leagues.filter((l) => l.enabled && l.teams.length).length > 1;
  return h('div', { class: 'standings' }, h('div', { class: 'day-label' }, 'Classement'), standings.map((r) => h('div', { class: 'standing' },
    section.sports.showLogos && (r.logo ? h('img', { class: 'logo', src: r.logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => { e.target.style.visibility = 'hidden'; } })
      : h('span', { class: 'logo rank-chip' }, String(r.rank ?? '–'))),
    h('div', { class: 'text' }, h('span', { class: 'name' }, r.name),
      h('small', {}, [r.rank && ordinal(r.rank), r.group, showLeague && r.league].filter(Boolean).join(' · '))),
    h('div', { class: 'figures' }, h('b', {}, r.record), r.points != null && h('small', {}, t('{0} pts', r.points))))));
}

function sportsView(section, games, ctx, standings) {
  // Pour chaque ligue : les équipes choisies, ou toutes si aucune n'est choisie.
  const chosen = new Map(section.sports.leagues.map((l) => [l.id, new Set(l.teams.map((t) => t.id))]));
  const filtered = games.filter((g) => {
    const teams = chosen.get(g.leagueID);
    return !teams?.size || teams.has(g.home.id) || teams.has(g.away.id);
  });
  // Aujourd'hui d'abord, puis hier, puis demain : la limite ne doit jamais cacher les matchs du jour.
  const today = dayStart(Date.now());
  const rank = (ms) => { const d = Math.round((dayStart(ms) - today) / 864e5); return d === 0 ? 0 : (d === -1 ? 1 : 2); };
  const limited = filtered.sort((a, b) => rank(a.date) - rank(b.date) || a.date - b.date).slice(0, Math.max(1, section.maxItems));
  const table = standingsView(section, standings);
  if (!limited.length) return h('div', { class: 'rows' }, h('div', { class: 'hint' }, games.length ? 'Aucun match pour vos équipes ces jours-ci.' : 'Aucun match pour le moment.'), table);

  const showLeague = section.sports.leagues.filter((l) => l.enabled).length > 1;
  const out = [];
  let currentDay = null;
  for (const game of limited) {
    const day = dayStart(game.date);
    if (day !== currentDay) {
      currentDay = day;
      const diff = Math.round((day - today) / 864e5);
      out.push(h('div', { class: 'day-label' }, diff === 0 ? "Aujourd'hui" : diff === -1 ? 'Hier' : diff === 1 ? 'Demain' : fmt.longDate(day)));
    }
    const team = (t, other) => h('div', { class: `team${game.state === 'final' && other.isWinner ? ' lost' : ''}${t.isWinner ? ' won' : ''}` },
      section.sports.showLogos && (t.logo
        ? h('img', { class: 'logo', src: t.logo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => { e.target.style.visibility = 'hidden'; } })
        : h('span', { class: 'logo' })),
      h('span', {}, t.name), ['live', 'final'].includes(game.state) && h('b', {}, t.score));
    const status = game.state === 'scheduled' ? h('span', { class: 'time' }, fmt.time(game.date))
      : h('span', { class: game.state === 'live' ? 'live' : (game.state === 'other' ? 'other' : '') }, game.detail);
    out.push(h(game.link ? 'a' : 'div', { class: 'row', href: game.link, target: '_blank', rel: 'noopener noreferrer' },
      h('div', { class: 'game' }, h('div', { class: 'teams' }, team(game.away, game.home), team(game.home, game.away)),
        h('div', { class: 'g-status' }, status, showLeague && h('small', {}, game.league)))));
  }
  return h('div', { class: 'rows' }, out, table);
}

// --- Trajets ---

const MODE_ICON = { driving: 'car', walking: 'walk', transit: 'transit' };

function mapsLink(route) {
  if (!route?.from?.trim() || !route?.to?.trim()) return null;
  const flag = route.mode === 'driving' ? 'd' : (route.mode === 'walking' ? 'w' : 'r');
  return `https://maps.apple.com/?${new URLSearchParams({ saddr: route.from, daddr: route.to, dirflg: flag })}`;
}

function commuteView(section, results, ctx) {
  const units = ctx.general.units;
  return h('div', { class: 'rows' }, results.slice(0, Math.max(1, section.maxItems)).map((r) => {
    const sub = [r.via && t('via {0}', r.via), r.distance > 0 && fmt.distance(r.distance, units), t('arrivée {0}', fmt.time(Date.now() + r.duration * 1000))]
      .filter(Boolean).join(' · ');
    const link = mapsLink(section.commute.routes.find((x) => x.id === r.id));
    return h(link ? 'a' : 'div', { class: 'row', href: link, target: '_blank', rel: 'noopener noreferrer', title: link ? "Ouvrir l'itinéraire dans Plans" : null },
      h('div', { class: 'route' }, icon(MODE_ICON[r.mode] ?? 'car'),
        h('div', { class: 'text' }, h('span', { class: 'name' }, r.name || 'Trajet'),
          r.error ? h('small', { class: 'bad' }, r.error) : [
            h('small', {}, sub),
            r.notices.map((n) => h('small', { class: 'bad' }, icon('warning'), ' ', n)),
            section.commute.showAlternates && r.alternates.map((a) =>
              h('small', { class: 'alt' }, a.name ? t('ou via {0} · {1}', a.name, fmt.duration(a.duration)) : t('ou autre itinéraire · {0}', fmt.duration(a.duration)))),
          ]),
        !r.error && h('span', { class: 'dur' }, fmt.duration(r.duration))));
  }));
}

// --- Sorties : films et nouvelles saisons ---
function releasesView(section, payload) {
  const list = payload.releases.slice(0, Math.max(1, section.maxItems));
  const day = (ms) => {
    const days = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400e3);
    return days === 0 ? t("aujourd'hui") : days === 1 ? t('demain') : days === -1 ? t('hier')
      : new Intl.DateTimeFormat(document.documentElement.lang, { day: 'numeric', month: 'short' }).format(ms);
  };
  return [
    !list.length && h('div', { class: 'hint' }, 'Aucune sortie dans la période choisie.'),
    list.length > 0 && h('div', { class: 'rows grid posters' }, list.map((r) => h(r.link ? 'a' : 'div', { class: 'row', href: r.link, target: '_blank', rel: 'noopener noreferrer', title: r.title },
      h('div', { class: 'tile' },
        h('div', { class: 'tile-img' }, r.image && h('img', { src: r.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.target.remove() })),
        h('span', { class: 'a-title' }, r.title),
        h('span', { class: 'a-meta' }, [r.kind === 'movie' ? t('Film') : t('Saison {0}', r.season), r.where, r.date && day(r.date)].filter(Boolean).join(' · ')))))),
    payload.needsKey && h('div', { class: 'note' }, icon('key'), 'Pour afficher aussi les films, ajoutez une clé TMDB dans les réglages de la section.'),
  ];
}

// --- Agenda ---
function calendarView(section, payload) {
  const o = section.calendar, lang = document.documentElement.lang;
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = ymd(new Date()), tomorrow = ymd(new Date(Date.now() + 86400e3));
  // Journée entière : une date sans fuseau (minuit UTC côté serveur). Sinon, le jour local du début.
  // Un événement commencé avant aujourd'hui (voyage, congé) se range sous aujourd'hui.
  const dayOf = (e) => { const key = e.allDay ? new Date(e.start).toISOString().slice(0, 10) : ymd(new Date(e.start)); return key < today ? today : key; };
  const dayLabel = (key) => (key === today ? t("Aujourd'hui") : key === tomorrow ? t('Demain')
    : new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`)));
  const list = payload.events.slice(0, Math.max(1, section.maxItems)), days = new Map();
  for (const e of list) { const key = dayOf(e); if (!days.has(key)) days.set(key, []); days.get(key).push(e); }
  const several = new Set(payload.events.map((e) => e.calendar)).size > 1;
  return [
    !list.length && h('div', { class: 'hint' }, 'Rien de prévu dans la période choisie.'),
    [...days].map(([key, events]) => h('div', { class: 'agenda-day' },
      h('h3', { class: key === today ? 'today' : null }, dayLabel(key)),
      events.map((e) => {
        const sub = [several && e.calendar, o.showLocation && e.location].filter(Boolean).join(' · ');
        return h(e.link ? 'a' : 'div', { class: `agenda-row${!e.allDay && e.end < Date.now() ? ' past' : ''}`, href: e.link, target: '_blank', rel: 'noopener noreferrer',
          style: { '--c': e.colorHex || section.colorHex }, title: e.allDay ? null : `${fmt.time(e.start)} – ${fmt.time(e.end)}` },
        h('time', {}, e.allDay ? t('Journée') : (dayOf(e) === ymd(new Date(e.start)) ? fmt.time(e.start) : t('En cours'))),
        h('span', { class: 'agenda-text' }, h('span', { class: 'a-title' }, e.title || t('(sans titre)')), sub && h('span', { class: 'a-meta' }, sub)));
      }))),
    payload.events.length > list.length && h('div', { class: 'a-meta more' }, t('et {0} autres', payload.events.length - list.length)),
  ];
}

// --- Home Assistant ---
const HASS_STATES = { on: 'Allumé', off: 'Éteint', open: 'Ouvert', closed: 'Fermé', opening: 'Ouverture…', closing: 'Fermeture…', locked: 'Verrouillé', unlocked: 'Déverrouillé',
  home: 'À la maison', not_home: 'Absent', unavailable: 'Indisponible', unknown: 'Inconnu', cleaning: 'Nettoyage', docked: 'À la base', returning: 'Retour à la base',
  paused: 'En pause', idle: 'Inactif', playing: 'Lecture en cours', standby: 'En veille', heat: 'Chauffage', cool: 'Climatisation', heat_cool: 'Automatique', auto: 'Automatique',
  dry: 'Déshumidification', fan_only: 'Ventilation', error: 'Erreur', charging: 'En charge', armed_home: 'Armée (présent)', armed_away: 'Armée (absent)', disarmed: 'Désarmée',
  triggered: 'Déclenchée', above_horizon: 'Levé', below_horizon: 'Couché', mowing: 'Tonte' };
// Capteurs binaires : ce que « on » et « off » veulent dire selon le type de capteur.
const BINARY = { door: ['Ouverte', 'Fermée'], garage_door: ['Ouverte', 'Fermée'], window: ['Ouverte', 'Fermée'], opening: ['Ouvert', 'Fermé'], lock: ['Déverrouillé', 'Verrouillé'],
  motion: ['Mouvement', 'Rien'], occupancy: ['Occupé', 'Libre'], presence: ['Présent', 'Absent'], moisture: ['Fuite', 'Sec'], smoke: ['Fumée', 'Rien'], gas: ['Gaz', 'Rien'],
  battery: ['Faible', 'Normale'], connectivity: ['Connecté', 'Déconnecté'], problem: ['Problème', 'OK'], plug: ['Branché', 'Débranché'], running: ['En marche', 'Arrêté'] };
const ALERTING = new Set(['door', 'garage_door', 'window', 'opening', 'lock', 'motion', 'moisture', 'smoke', 'gas', 'battery', 'problem']);

function hassValue(e) {
  const lang = document.documentElement.lang;
  if (e.domain === 'binary_sensor' && BINARY[e.deviceClass] && (e.state === 'on' || e.state === 'off')) return t(BINARY[e.deviceClass][e.state === 'on' ? 0 : 1]);
  if (e.domain === 'climate') {
    const temps = [e.current != null && `${fmt.number(e.current, 1)}°`, e.target != null && `→ ${fmt.number(e.target, 1)}°`].filter(Boolean).join(' ');
    return [temps, HASS_STATES[e.state] ? t(HASS_STATES[e.state]) : e.state].filter(Boolean).join(' · ');
  }
  if (e.deviceClass === 'timestamp' && Date.parse(e.state)) return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(Date.parse(e.state));
  // Valeur numérique : arrondie, avec son unité. Sinon l'état, traduit quand il est connu.
  if (e.state !== '' && Number.isFinite(Number(e.state)) && !['scene', 'button', 'input_button'].includes(e.domain)) return `${fmt.number(Number(e.state), 1)}${e.unit ? ` ${e.unit}` : ''}`;
  const label = HASS_STATES[e.state] ? t(HASS_STATES[e.state]) : e.state;
  return e.battery != null && ['vacuum', 'lawn_mower'].includes(e.domain) ? `${label} · ${Math.round(e.battery)} %` : label;
}

function hassView(section, payload, ctx) {
  const names = new Map(section.hass.entities.map((x) => [x.id, x.name]));
  const canAct = section.hass.allowControl !== false && ctx.callEntity;
  const list = payload.entities.slice(0, Math.max(1, section.maxItems));
  return h('div', { class: 'ha-rows' }, list.map((e) => {
    const name = names.get(e.id)?.trim() || e.name, off = ['unavailable', 'unknown'].includes(e.state);
    const act = (event) => { event.currentTarget.disabled = true; ctx.callEntity(section, e.entity); };
    let control = null;
    if (canAct && e.action && !off) {
      control = e.action === 'toggle' && e.domain !== 'cover'
        ? h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: e.state === 'on', 'aria-label': name, onChange: act })
        : h('button', { class: 'btn small', onClick: act, 'aria-label': t('{0} : {1}', name, t(e.domain === 'cover' ? (e.state === 'open' ? 'Fermer' : 'Ouvrir') : 'Lancer')) },
          e.domain === 'cover' ? (e.state === 'open' ? 'Fermer' : 'Ouvrir') : 'Lancer');
    }
    const passive = ['scene', 'script', 'button', 'input_button'].includes(e.domain);
    const warn = e.domain === 'binary_sensor' && e.state === 'on' && ALERTING.has(e.deviceClass);
    return h('div', { class: `ha-row${off ? ' off' : ''}` }, h('span', { class: 'ha-name' }, name),
      !(passive && control) && h('span', { class: `ha-value${warn ? ' warn' : ''}${e.state === 'on' && !warn ? ' on' : ''}` }, document.createTextNode(passive ? '' : hassValue(e))), control);
  }));
}

// --- Bourse et devises ---
function stocksView(section, payload) {
  const lang = document.documentElement.lang;
  const price = (q) => new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: q.price < 10 ? 4 : 2 }).format(q.price);
  return h('div', { class: 'rows' }, payload.quotes.slice(0, Math.max(1, section.maxItems)).map((q) => {
    const up = q.change > 0, flat = !q.change;
    const pct = q.changePct == null ? '' : `${up ? '+' : flat ? '' : '−'}${new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(q.changePct))} %`;
    return h('a', { class: 'row', href: `https://finance.yahoo.com/quote/${encodeURIComponent(q.symbol)}`, target: '_blank', rel: 'noopener noreferrer',
      title: q.time ? t('Cours de {0}', fmt.ago(q.time)) : null },
    h('div', { class: 'quote' }, h('div', { class: 'text' }, h('span', { class: 'name' }, q.name), h('small', {}, [q.symbol, q.currency].filter(Boolean).join(' · '))),
      h('b', {}, price(q)),
      section.stocks.showChange !== false && pct && h('span', { class: `delta ${flat ? 'flat' : up ? 'up' : 'down'}`, 'aria-label': t(up ? 'en hausse de {0}' : flat ? 'inchangé' : 'en baisse de {0}', pct.replace(/^[+−]/, '')) }, pct)));
  }));
}

// --- Résumé du jour ---
function summaryView(section, payload) {
  return [h('ol', { class: 'summary' }, payload.summary.map((point) => h('li', {},
    h(point.link ? 'a' : 'span', { href: point.link, target: '_blank', rel: 'noopener noreferrer' }, point.text),
    point.source && h('span', { class: 'a-meta' }, point.source)))),
  h('div', { class: 'a-meta summary-foot' }, t('Résumé de {0} titres par {1}', payload.basedOn, String(payload.model ?? '').replace(/^claude-/, 'Claude ').replace(/-/g, ' ')))];
}

export function cardBody(section, payload, ctx) {
  if (payload.releases) return releasesView(section, payload);
  if (payload.events) return calendarView(section, payload);
  if (payload.summary) return summaryView(section, payload);
  if (payload.entities) return hassView(section, payload, ctx);
  if (payload.quotes) return stocksView(section, payload);
  if (payload.articles) return articleList(section, payload.articles, ctx);
  if (payload.weather) return weatherView(section, payload.weather);
  if (payload.games) return sportsView(section, payload.games, ctx, payload.standings);
  if (payload.routes) return commuteView(section, payload.routes, ctx);
  return null;
}
