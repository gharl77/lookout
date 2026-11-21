// Pointages : ESPN (sans clé), HockeyTech (ligues de hockey canadiennes) et API-Sports (clé personnelle).
import { BriefingError, fetchJSON, parseDate, settle, Cache } from './util.js';
import { t, getLang } from '../public/i18n.js';

const str = (v) => (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : null));
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ymd = (d, sep = '') => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join(sep);

function windowFor(options) {
  const today = startOfDay();
  const start = addDays(today, options.showYesterday ? -1 : 0);
  const end = addDays(today, options.showUpcoming ? 1 : 0);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return { today, start, end, days };
}

export async function fetchSports(options) {
  const leagues = (options.leagues ?? []).filter((l) => l.enabled);
  if (!leagues.length) throw new BriefingError('Aucune ligue active');
  const window = windowFor(options);
  const games = [], sourceErrors = {};
  const results = await settle(leagues, (league) => {
    if (league.provider === 'hockeytech') return hockeyTechGames(league, window);
    if (league.provider === 'apisports') return apiSportsGames(league, window, options.apiSportsKey);
    return espnGames(league, window);
  });
  for (const r of results) { if (r.error) sourceErrors[r.item.id] = r.error; else games.push(...r.value); }
  const errors = Object.values(sourceErrors);
  if (!games.length && errors.length === leagues.length) throw new BriefingError('{0}', errors[0]);
  const lower = window.start.getTime(), upper = addDays(window.end, 1).getTime();
  return { games: games.filter((g) => g.date >= lower && g.date < upper).sort((a, b) => a.date - b.date),
    standings: options.showStandings === false ? [] : await fetchStandings(leagues), sourceErrors };
}

/**
 * Classement des équipes suivies (ESPN et HockeyTech). Une ligue sans équipe choisie n'en affiche pas.
 * Un classement indisponible est simplement omis : il ne doit jamais empêcher d'afficher les matchs.
 */
async function fetchStandings(leagues) {
  const wanted = leagues.filter((l) => l.teams?.length && l.provider !== 'apisports');
  const results = await settle(wanted, (league) => (league.provider === 'hockeytech' ? hockeyTechStandings(league) : espnStandings(league)));
  return results.flatMap((r) => r.value ?? []);
}

// ESPN nomme les associations en anglais : équivalents français pour l'affichage.
const GROUPS_FR = { 'Eastern Conference': "Association de l'Est", 'Western Conference': "Association de l'Ouest",
  'American Football Conference': 'AFC', 'National Football Conference': 'NFC', 'American League': 'Ligue américaine',
  'National League': 'Ligue nationale', 'East Division': 'Division Est', 'West Division': 'Division Ouest' };
const groupName = (name) => (getLang() === 'fr' ? (GROUPS_FR[name] ?? name) : name) ?? '';

async function espnStandings(league) {
  const root = await fetchJSON(`https://site.api.espn.com/apis/v2/sports/${espnPath(league)}/standings`);
  const chosen = new Set(league.teams.map((x) => x.id)), rows = [];
  (function walk(node) {
    const entries = node.standings?.entries ?? [];
    entries.forEach((entry, index) => {
      const team = entry.team ?? {};
      if (!chosen.has(team.abbreviation)) return;
      const stat = (name) => entry.stats?.find((x) => x.name === name);
      const points = stat('points')?.displayValue ?? null;
      const overall = stat('overall')?.displayValue ?? [stat('wins'), stat('losses'), stat('otLosses') ?? stat('ties')].filter(Boolean).map((x) => x.displayValue).join('-');
      rows.push({ leagueID: league.id, league: league.name, teamID: team.abbreviation, name: team.shortDisplayName ?? team.displayName ?? team.abbreviation,
        logo: team.logos?.[0]?.href ?? null, rank: Number(stat('playoffSeed')?.value ?? stat('rank')?.value) || index + 1, group: groupName(node.name),
        record: String(overall).split(',')[0], points: points == null ? null : Number(points), gamesPlayed: Number(stat('gamesPlayed')?.value) || null });
    });
    for (const child of node.children ?? []) walk(child);
  })(root);
  return rows;
}

async function hockeyTechStandings(league) {
  const items = await hockeyTechList(league, 'statviewtype', 'Statviewtype', { type: 'standings', stat: 'conference' });
  const chosen = new Set(league.teams.map((x) => x.id));
  return items.filter((x) => chosen.has(str(x.team_id))).map((x) => ({
    leagueID: league.id, league: league.name, teamID: str(x.team_id), name: String(x.name ?? '').split(',').pop().trim(), logo: null,
    rank: Number(x.rank) || null, group: x.conference_name ?? x.division_long_name ?? '',
    record: [x.wins, x.losses, x.ot_losses, x.shootout_losses].filter((v) => v != null).join('-'),
    points: Number(x.points) || 0, gamesPlayed: Number(x.games_played) || null }));
}

export async function fetchTeams(league, apiSportsKey) {
  const teams = league.provider === 'hockeytech' ? await hockeyTechTeams(league)
    : league.provider === 'apisports' ? await apiSportsTeams(league, apiSportsKey) : await espnTeams(league);
  return teams.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

// --- ESPN ---

function espnPath(league) {
  const path = String(league.path ?? '').replace(/^[/\s]+|[/\s]+$/g, '');
  if (path.split('/').length !== 2) throw new BriefingError('Chemin de ligue invalide (ex. hockey/nhl)');
  return path;
}

async function espnGames(league, window) {
  const byID = new Map();
  const path = espnPath(league);
  // L'API n'accepte qu'une date à la fois. Un jour en échec ne fait pas échouer toute la ligue :
  // on garde les autres jours, et on ne signale l'erreur que si aucun n'a répondu.
  const days = await settle(window.days, (day) => fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${ymd(day)}`));
  if (days.every((d) => d.error)) throw new BriefingError('Ligue introuvable ou indisponible');
  for (const { value: root } of days.filter((d) => !d.error)) {
    for (const event of root.events ?? []) {
      const competitors = event.competitions?.[0]?.competitors ?? [];
      const date = parseDate(event.date);
      if (competitors.length !== 2 || !date) continue;
      const team = (side) => {
        const c = competitors.find((x) => x.homeAway === side), t = c?.team;
        if (!t) return null;
        const abbreviation = t.abbreviation ?? '?';
        return { id: abbreviation, abbreviation, name: t.shortDisplayName ?? t.displayName ?? '?',
          score: c.score ?? '', logo: t.logo ?? null, isWinner: c.winner === true };
      };
      const home = team('home'), away = team('away');
      if (!home || !away) continue;
      const status = event.status?.type ?? {};
      const short = status.shortDetail ?? '';
      let state = status.state === 'in' ? 'live' : (status.state === 'post' ? 'final' : 'scheduled');
      let detail = short;
      if (state === 'final') {
        if (status.completed === false) state = 'other';
        else detail = t(short.includes('SO') ? 'Final (TB)' : (short.includes('OT') ? 'Final (Prol.)' : 'Final'));
      }
      byID.set(event.id, { id: league.id + event.id, leagueID: league.id, league: league.name, date, state, detail,
        away, home, link: event.links?.[0]?.href ?? null });
    }
  }
  return [...byID.values()];
}

async function espnTeams(league) {
  const root = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${espnPath(league)}/teams?limit=400`);
  const teams = root.sports?.[0]?.leagues?.[0]?.teams;
  if (!Array.isArray(teams)) throw new BriefingError("Liste d'équipes indisponible");
  return teams.filter((x) => x.team?.abbreviation).map(({ team: t }) => ({
    id: t.abbreviation, name: t.displayName ?? t.abbreviation, logo: t.logos?.[0]?.href ?? null }));
}

// --- HockeyTech (LHJMQ, LPHF, OHL, WHL, LAH…) ---

async function hockeyTechList(league, view, key, extra = {}) {
  if (!league.path || !league.key) throw new BriefingError('Code ou clé HockeyTech manquant');
  // Certaines ligues ne publient leur flux qu'en anglais : on essaie le français d'abord.
  for (const lang of ['fr', 'en']) {
    const url = new URL('https://lscluster.hockeytech.com/feed/');
    url.search = new URLSearchParams({ feed: 'modulekit', view, key: league.key, client_code: league.path, fmt: 'json', lang, ...extra });
    let root;
    try { root = await fetchJSON(url); } catch { throw new BriefingError('Ligue introuvable ou indisponible'); }
    const list = root.SiteKit?.[key];
    if (Array.isArray(list) && list.length) return list;
  }
  return [];
}

function gameCentre(code, id) {
  const c = String(code).toLowerCase();
  if (['lhjmq', 'ohl', 'whl'].includes(c)) return `https://chl.ca/${c}/gamecentre/${id}/`;
  if (c === 'ahl') return `https://theahl.com/stats/game-center/${id}`;
  if (c === 'pwhl') return `https://www.thepwhl.com/en/stats/game-center/${id}`;
  return null;
}

async function hockeyTechGames(league, window) {
  const back = Math.round((window.today - window.start) / 864e5), ahead = Math.round((window.end - window.today) / 864e5);
  const items = await hockeyTechList(league, 'scorebar', 'Scorebar',
    { numberofdaysback: String(back + 1), numberofdaysahead: String(ahead + 1), limit: '200' });
  const games = [];
  for (const g of items) {
    const id = str(g.ID), date = parseDate(g.GameDateISO8601);
    if (!id || !date) continue;
    const status = str(g.GameStatus) ?? '1';
    const label = g.GameStatusStringLong ?? g.GameStatusString ?? '';
    const homeGoals = parseInt(g.HomeGoals, 10) || 0, awayGoals = parseInt(g.VisitorGoals, 10) || 0;
    let state = 'other', detail = label;
    if (status === '1') state = 'scheduled';
    else if (status === '2' || status === '3') {
      state = 'live';
      detail = g.Intermission === '1' ? t('Entracte {0}', g.PeriodNameShort ?? '') : `P${g.PeriodNameShort ?? ''} ${g.GameClock ?? ''}`;
    } else if (status === '4') {
      state = 'final';
      const upper = label.toUpperCase();
      detail = t(/TB|FUS|SO/.test(upper) ? 'Final (TB)' : (/PROL|OT/.test(upper) ? 'Final (Prol.)' : 'Final'));
    }
    const team = (prefix, goals, other) => {
      const code = str(g[`${prefix}Code`]) ?? '?';
      return { id: str(g[`${prefix}ID`]) ?? code, abbreviation: code, name: (g[`${prefix}Nickname`] ?? code).trim(),
        score: String(goals), logo: g[`${prefix}Logo`] || null, isWinner: state === 'final' && goals > other };
    };
    games.push({ id: league.id + id, leagueID: league.id, league: league.name, date, state, detail,
      away: team('Visitor', awayGoals, homeGoals), home: team('Home', homeGoals, awayGoals), link: gameCentre(league.path, id) });
  }
  return games;
}

async function hockeyTechTeams(league) {
  const teams = (await hockeyTechList(league, 'teamsbyseason', 'Teamsbyseason'))
    .filter((t) => str(t.id) && typeof t.name === 'string' && !t.name.startsWith('-'))   // « - … - » : adversaires hors ligue
    .map((t) => ({ id: str(t.id), name: t.name.trim(), logo: t.team_logo_url ?? null }));
  if (!teams.length) throw new BriefingError("Liste d'équipes indisponible");
  return teams;
}

// --- API-Sports (api-sports.io, clé personnelle) ---

// Le forfait gratuit est limité à 100 requêtes par jour : les réponses sont mises en cache.
const apiCache = new Cache();
const apiHost = (sport) => (sport === 'football' ? 'v3.football.api-sports.io' : `v1.${sport}.api-sports.io`);

function apiParts(league) {
  const parts = String(league.path ?? '').split('/');
  if (parts.length !== 2 || !/^[a-z-]+$/.test(parts[0])) throw new BriefingError('Ligue API-Sports invalide');
  return parts;
}

async function apiRequest(sport, path, query, key, maxAgeMs) {
  key = String(key ?? '').trim();
  if (!key) throw new BriefingError('Clé API-Sports manquante (voir les réglages de la section)');
  if (!/^[a-z-]+$/.test(sport)) throw new BriefingError('Sport invalide');
  const url = new URL(`https://${apiHost(sport)}/${path}`);
  url.search = new URLSearchParams(query);
  let root = apiCache.get(url.href, maxAgeMs);
  if (!root) {
    root = await fetchJSON(url, { 'x-apisports-key': key });
    // L'API signale ses erreurs (clé, quota, forfait) dans le corps de la réponse.
    const errors = Array.isArray(root.errors) ? root.errors : Object.values(root.errors ?? {});
    if (errors.length) throw new BriefingError('API-Sports : {0}', str(errors[0]) ?? t('Erreur'));
    apiCache.set(url.href, root);
  }
  return Array.isArray(root.response) ? root.response : [];
}

function apiGame(item, league) {
  // Selon le sport, l'essentiel est sous « fixture », « game » ou à la racine.
  const core = item.fixture ?? item.game ?? item;
  const id = str(core.id);
  const date = typeof core.timestamp === 'number' ? core.timestamp * 1000
    : (typeof core.date?.timestamp === 'number' ? core.date.timestamp * 1000 : parseDate(typeof core.date === 'string' ? core.date : null));
  if (!id || !date) return null;
  const short = (str(core.status?.short) ?? 'NS').toUpperCase();
  let state, detail = str(core.status?.long) ?? short;
  if (['NS', 'TBD'].includes(short)) state = 'scheduled';
  else if (['FT', 'AET', 'PEN', 'AOT', 'AP', 'AW', 'WO'].includes(short)) {
    state = 'final';
    detail = t(['PEN', 'AP'].includes(short) ? 'Final (TB)' : (['AET', 'AOT'].includes(short) ? 'Final (Prol.)' : 'Final'));
  } else if (['PST', 'POST', 'CANC', 'ABD', 'SUSP', 'INTR', 'AWD'].includes(short)) state = 'other';
  else {
    state = 'live';
    const elapsed = str(core.status?.elapsed) ?? str(core.status?.timer);
    if (elapsed) detail = `${short} ${elapsed}′`;
  }
  const scores = item.goals ?? item.scores ?? {};
  const score = (side) => (typeof scores[side] === 'number' ? scores[side] : (typeof scores[side]?.total === 'number' ? scores[side].total : null));
  const team = (side, other) => {
    const t = item.teams?.[side], teamID = str(t?.id);
    if (!teamID) return null;
    const name = t.name ?? '?', mine = score(side), theirs = score(other);
    return { id: teamID, abbreviation: name.slice(0, 3).toUpperCase(), name, score: mine == null ? '' : String(mine),
      logo: t.logo ?? null, isWinner: state === 'final' && (mine ?? 0) > (theirs ?? 0) };
  };
  const home = team('home', 'away'), away = team('away', 'home');
  if (!home || !away) return null;
  return { id: league.id + id, leagueID: league.id, league: league.name, date, state, detail, away, home, link: null };
}

async function apiSportsGames(league, window, key) {
  const [sport, leagueID] = apiParts(league);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const byID = new Map();
  for (const day of window.days) {
    // Une requête par jour et par sport, toutes ligues confondues, filtrée ensuite localement.
    const items = await apiRequest(sport, sport === 'football' ? 'fixtures' : 'games', { date: ymd(day, '-'), timezone },
      key, day.getTime() === window.today.getTime() ? 20 * 60e3 : 6 * 3600e3);
    for (const item of items) {
      if (str(item.league?.id) !== leagueID) continue;
      const game = apiGame(item, league);
      if (game) byID.set(game.id, game);
    }
  }
  return [...byID.values()];
}

async function apiSportsTeams(league, key) {
  const [sport, leagueID] = apiParts(league);
  const items = await apiRequest(sport, 'teams', { league: leagueID, season: league.key ?? '' }, key, 24 * 3600e3);
  return items.map((item) => item.team ?? item).filter((t) => str(t.id) && t.name)
    .map((t) => ({ id: str(t.id), name: t.name, logo: t.logo ?? null }));
}

export async function searchAPISportsLeagues(sport, query, key) {
  const items = await apiRequest(sport, 'leagues', { search: query }, key, 24 * 3600e3);
  return items.map((item) => {
    const l = item.league ?? item;
    const seasons = item.seasons ?? [];
    const current = seasons.find((s) => s.current === true) ?? seasons.at(-1);
    return { id: str(l.id), name: l.name, country: item.country?.name ?? '', season: str(current?.year) ?? str(current?.season) ?? '' };
  }).filter((l) => l.id && l.name);
}
