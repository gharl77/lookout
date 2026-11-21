// Contenu des cartes : articles, météo, pointages, trajets.
import { h, icon, fmt, t, openMenu, copyText } from './ui.js';

// --- Articles (RSS et API JSON) ---

const keywords = (s) => String(s ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);

/** Filtre, trie et limite les articles selon les réglages d'affichage de la section. */
export function present(articles, options, sourceOrder, limit) {
  const include = keywords(options.includeKeywords), exclude = keywords(options.excludeKeywords);
  const cutoff = options.maxAgeHours > 0 ? Date.now() - options.maxAgeHours * 3600e3 : null;
  const seen = new Set();
  const sorted = articles.filter((a) => {
    if (cutoff && a.date && a.date < cutoff) return false;
    const haystack = `${a.title} ${a.summary}`.toLowerCase();
    if (include.length && !include.some((k) => haystack.includes(k))) return false;
    if (exclude.some((k) => haystack.includes(k))) return false;
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

function articleRow(article, style, section, ctx) {
  const o = section.feed;
  const read = ctx.isRead(article.id), fresh = ctx.isNew(article);
  const pill = fresh && h('span', { class: 'new-pill' }, 'Nouveau');
  const showSource = o.showSource && section.kind === 'feed' && o.sources.filter((s) => s.enabled).length > 1;
  const meta = [showSource && article.source, o.showTime && article.date && fmt.ago(article.date)].filter(Boolean).join(' · ');
  const metaLine = (meta || pill) && h('span', { class: 'a-meta' }, pill, meta);
  const img = (cls) => o.showImages && article.image
    && h('img', { class: cls, src: article.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.target.remove() });

  let inner;
  if (style === 'headline') {
    inner = h('div', { class: 'headline row-main' }, img(''), h('span', { class: 'a-title' }, article.title),
      article.summary && h('span', { class: 'a-summary' }, article.summary), metaLine);
  } else if (style === 'compact') {
    inner = h('div', { class: 'compact row-main' }, h('i', { class: 'dot' }), h('span', { class: 'a-title' }, article.title),
      pill, o.showTime && article.date && h('time', {}, fmt.ago(article.date)));
  } else {
    inner = h('div', { class: 'article row-main' },
      h('div', { class: 'text' }, h('span', { class: 'a-title' }, article.title),
        o.showSummary && article.summary && h('span', { class: 'a-summary' }, article.summary), metaLine),
      img('thumb'));
  }

  const row = h(article.link ? 'a' : 'div', {
    class: `row${read && ctx.general.dimReadArticles ? ' read' : ''}`, href: article.link, target: '_blank', rel: 'noopener noreferrer',
    title: article.summary || article.title,
    onClick: () => ctx.setRead([article.id], true),
    onContextmenu: (e) => {
      // Sur ordinateur : menu contextuel. Sur iPhone, l'appui long garde le menu natif du lien.
      if (matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      openMenu(row, [
        article.link && { label: 'Ouvrir', icon: icon('open'), action: () => { window.open(article.link, '_blank', 'noopener'); ctx.setRead([article.id], true); } },
        article.link && { label: 'Copier le lien', icon: icon('link'), action: () => copyText(article.link) },
        '-',
        { label: read ? 'Marquer comme non lu' : 'Marquer comme lu', icon: icon(read ? 'check-off' : 'check-on'), action: () => ctx.setRead([article.id], !read) },
      ]);
    },
  }, inner);
  return row;
}

/** Nombre d'articles affichés parus depuis la dernière visite. */
export function countNew(section, articles, ctx) {
  return shownArticles(section, articles).filter(ctx.isNew).length;
}

export function shownArticles(section, articles) {
  return present(articles, section.feed, section.feed.sources.map((s) => s.name), Math.max(1, section.maxItems));
}

function articleList(section, articles, ctx) {
  const shown = shownArticles(section, articles);
  if (!shown.length) return h('div', { class: 'hint' }, 'Aucun article ne correspond aux filtres.');
  const layout = section.feed.layout;
  return h('div', { class: 'rows' }, shown.map((a, i) => articleRow(a, layout === 'headline' ? (i === 0 ? 'headline' : 'list') : layout, section, ctx)));
}

// --- Météo ---

export const WMO = {
  label(code) {
    const labels = { 0: 'Dégagé', 1: 'Généralement dégagé', 2: 'Partiellement nuageux', 3: 'Couvert', 45: 'Brouillard', 48: 'Brouillard',
      51: 'Bruine', 53: 'Bruine', 55: 'Bruine', 56: 'Bruine verglaçante', 57: 'Bruine verglaçante', 61: 'Pluie faible', 63: 'Pluie',
      65: 'Pluie forte', 66: 'Pluie verglaçante', 67: 'Pluie verglaçante', 71: 'Neige faible', 73: 'Neige', 75: 'Neige forte',
      77: 'Grains de neige', 80: 'Averses', 81: 'Averses', 82: 'Averses fortes', 85: 'Averses de neige', 86: 'Averses de neige',
      95: 'Orage', 96: 'Orage et grêle', 99: 'Orage et grêle' };
    return labels[code] ? t(labels[code]) : '—';
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

export function cardBody(section, payload, ctx) {
  if (payload.articles) return articleList(section, payload.articles, ctx);
  if (payload.weather) return weatherView(section, payload.weather);
  if (payload.games) return sportsView(section, payload.games, ctx, payload.standings);
  if (payload.routes) return commuteView(section, payload.routes, ctx);
  return null;
}
