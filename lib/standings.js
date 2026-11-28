// Classements et statistiques : le tableau complet d'une ligue et ses meneurs (ESPN et HockeyTech, sans clé).
import { BriefingError, fetchJSON, settle, parseDate } from './util.js';
import { getLang } from '../public/i18n.js';
import { espnPath, hockeyTechList, groupName } from './sports.js';

const str = (v) => (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : null));
/** Libellé dans la langue de la requête : [français, anglais]. */
const lang = (pair) => pair[getLang() === 'en' ? 1 : 0];

// Colonnes du classement par sport : [statistique ESPN, abréviation française, anglaise, secondaire ?].
// Les colonnes secondaires disparaissent sur une carte étroite.
const COLUMNS = {
  hockey: [['gamesPlayed', 'MJ', 'GP'], ['wins', 'V', 'W'], ['losses', 'D', 'L'], ['otLosses', 'DP', 'OTL'], ['points', 'PTS', 'PTS'], ['pointDifferential', 'DIFF', 'DIFF', true],
    ['Last Ten Games', '10 D', 'L10', true], ['streak', 'SÉQ', 'STRK', true]],
  soccer: [['gamesPlayed', 'MJ', 'GP'], ['wins', 'V', 'W'], ['ties', 'N', 'D'], ['losses', 'D', 'L'], ['pointDifferential', 'DB', 'GD', true], ['points', 'PTS', 'PTS']],
  football: [['wins', 'V', 'W'], ['losses', 'D', 'L'], ['ties', 'N', 'T'], ['winPercent', '%', 'PCT'], ['pointDifferential', 'DIFF', 'DIFF', true], ['streak', 'SÉQ', 'STRK', true]],
  basketball: [['wins', 'V', 'W'], ['losses', 'D', 'L'], ['winPercent', '%', 'PCT'], ['gamesBehind', 'ÉC', 'GB'], ['Last Ten Games', '10 D', 'L10', true], ['streak', 'SÉQ', 'STRK', true]],
  baseball: [['wins', 'V', 'W'], ['losses', 'D', 'L'], ['winPercent', '%', 'PCT'], ['gamesBehind', 'ÉC', 'GB'], ['Last Ten Games', '10 D', 'L10', true], ['streak', 'SÉQ', 'STRK', true]],
};
const columnsFor = (sport) => COLUMNS[sport] ?? [['wins', 'V', 'W'], ['losses', 'D', 'L'], ['winPercent', '%', 'PCT']];
const header = (columns) => columns.map(([, fr, en, minor]) => ({ label: lang([fr, en]), minor: Boolean(minor) }));
/** Séquence « W2 » / « L3 » dans la langue de la requête. */
const streak = (text) => (getLang() === 'en' ? text : String(text).replace(/^W/, 'V').replace(/^L/, 'D').replace(/^T/, 'N'));

// Catégories de meneurs retenues par sport : [statistique ESPN, nom français, nom anglais].
const LEADERS = {
  hockey: [['points', 'Points', 'Points'], ['goals', 'Buts', 'Goals'], ['assists', 'Passes', 'Assists'], ['wins', 'Victoires (gardiens)', 'Wins (goalies)'],
    ['savePct', "Taux d'arrêts", 'Save percentage'], ['avgGoalsAgainst', 'Moyenne de buts alloués', 'Goals against average']],
  football: [['passingYards', 'Verges par la passe', 'Passing yards'], ['rushingYards', 'Verges au sol', 'Rushing yards'], ['receivingYards', 'Verges sur réception', 'Receiving yards'],
    ['passingTouchdowns', 'Passes de touché', 'Passing touchdowns'], ['sacks', 'Sacs', 'Sacks'], ['interceptions', 'Interceptions', 'Interceptions']],
  basketball: [['pointsPerGame', 'Points par match', 'Points per game'], ['reboundsPerGame', 'Rebonds par match', 'Rebounds per game'], ['assistsPerGame', 'Passes par match', 'Assists per game'],
    ['stealsPerGame', 'Interceptions par match', 'Steals per game'], ['blocksPerGame', 'Contres par match', 'Blocks per game']],
  baseball: [['avg', 'Moyenne au bâton', 'Batting average'], ['homeRuns', 'Circuits', 'Home runs'], ['RBIs', 'Points produits', 'Runs batted in'],
    ['ERA', 'Moyenne de points mérités', 'Earned run average'], ['wins', 'Victoires (lanceurs)', 'Wins (pitchers)'], ['strikeouts', 'Retraits au bâton', 'Strikeouts']],
};

// --- ESPN ---

async function espnTable(league, byDivision) {
  const path = espnPath(league), sport = path.split('/')[0], columns = columnsFor(sport);
  const root = await fetchJSON(`https://site.api.espn.com/apis/v2/sports/${path}/standings${byDivision ? '?level=3' : ''}`);
  const usesPoints = sport === 'hockey' || sport === 'soccer', groups = [];
  (function walk(node) {
    const entries = node.standings?.entries ?? [];
    if (entries.length) {
      const rows = entries.map((entry, index) => {
        const team = entry.team ?? {}, stat = (name) => entry.stats?.find((x) => x.name === name);
        const number = (name) => { const v = Number(stat(name)?.value); return Number.isFinite(v) ? v : null; };
        return { teamID: str(team.abbreviation) ?? '', name: team.shortDisplayName ?? team.displayName ?? team.abbreviation ?? '?', logo: team.logos?.[0]?.href ?? null,
          order: [usesPoints ? number('points') ?? 0 : number('winPercent') ?? 0, number('wins') ?? 0, number('pointDifferential') ?? 0, -index],
          seed: number('rank') ?? (byDivision ? null : number('playoffSeed')),
          values: columns.map(([name]) => {
            const text = String(stat(name)?.displayValue ?? '').split(',')[0].trim();   // « 8-1-1, 0 PTS » -> « 8-1-1 »
            return name === 'streak' ? streak(text) : text || '–';
          }) };
      });
      // Le rang fourni par ESPN quand il existe (soccer, rang d'association) ; sinon l'ordre des points ou du pourcentage.
      const ranked = rows.every((r) => r.seed) ? rows.sort((a, b) => a.seed - b.seed)
        : rows.sort((a, b) => { for (let i = 0; i < a.order.length; i++) if (a.order[i] !== b.order[i]) return b.order[i] - a.order[i]; return 0; });
      groups.push({ name: groupName(node.name) || '', rows: ranked.map(({ teamID, name, logo, values, order }, i) => ({ rank: i + 1, teamID, name, logo, values, points: usesPoints ? order[0] : null })) });
    }
    for (const child of node.children ?? []) walk(child);
  })(root);
  if (!groups.length) throw new BriefingError('Classement indisponible pour cette ligue');
  // Une seule table (soccer) : son nom répète celui de la ligue.
  if (groups.length === 1) groups[0].name = '';
  return { columns: header(columns), groups, cut: byDivision ? 0 : PLAYOFF_SPOTS[path] ?? 0 };
}

// Nombre d'équipes qualifiées pour les séries dans chaque association (classement par association seulement).
const PLAYOFF_SPOTS = { 'hockey/nhl': 8, 'basketball/nba': 6, 'basketball/wnba': 8, 'football/nfl': 7, 'baseball/mlb': 6, 'soccer/usa.1': 9,
  lhjmq: 8, ohl: 8, whl: 8 };

/** Valeur d'un meneur. Certaines catégories (baseball) donnent toute une ligne de statistiques : on n'en garde que le chiffre. */
function leaderValue(leader) {
  const shown = String(leader.displayValue ?? ''), value = Number(leader.value);
  if (shown.length <= 8 || !Number.isFinite(value)) return shown;
  if (Number.isInteger(value)) return String(value);
  return Math.abs(value) < 1 ? value.toFixed(3).replace(/^(-?)0/, '$1') : value.toFixed(2);
}

async function espnLeaders(league, count) {
  const path = espnPath(league), wanted = LEADERS[path.split('/')[0]];
  if (!wanted) return [];
  const root = await fetchJSON(`https://site.api.espn.com/apis/site/v3/sports/${path}/leaders?limit=${count}`);
  const categories = root.leaders?.categories ?? [];
  return wanted.map(([name, fr, en]) => {
    const category = categories.find((c) => c.name === name);
    const players = (category?.leaders ?? []).slice(0, count).map((l) => ({ name: l.athlete?.displayName ?? '?', team: l.team?.abbreviation ?? '', teamID: l.team?.abbreviation ?? '',
      value: leaderValue(l), link: l.athlete?.links?.find((x) => x.rel?.includes('playercard'))?.href ?? null }));
    return players.length ? { name: lang([fr, en]), players } : null;
  }).filter(Boolean);
}

// --- HockeyTech ---

async function hockeyTechTable(league) {
  const items = await hockeyTechList(league, 'statviewtype', 'Statviewtype', { type: 'standings', stat: 'conference' });
  const groups = [];
  for (const x of items) {
    if (x.repeatheader) { groups.push({ name: String(x.name ?? ''), rows: [] }); continue; }
    if (!str(x.team_id)) continue;
    if (!groups.length) groups.push({ name: '', rows: [] });
    const last10 = [x.past_10_wins, x.past_10_losses, Number(x.past_10_ot_losses ?? 0) + Number(x.past_10_shootout_losses ?? 0)];
    const diff = Number(x.goals_diff);
    groups.at(-1).rows.push({ teamID: str(x.team_id), name: String(x.name ?? '').split(',').pop().trim() || String(x.name ?? '?'), logo: null, points: Number(x.points) || 0,
      values: [x.games_played, x.wins, x.losses, Number(x.ot_losses ?? 0) + Number(x.shootout_losses ?? 0), x.points,
        Number.isFinite(diff) ? `${diff > 0 ? '+' : ''}${diff}` : '–', last10.every((v) => v != null) ? last10.join('-') : '–'].map((v) => (v == null || v === '' ? '–' : String(v))) });
  }
  const filled = groups.filter((g) => g.rows.length);
  if (!filled.length) throw new BriefingError('Classement indisponible pour cette ligue');
  for (const g of filled) g.rows.forEach((row, i) => { row.rank = i + 1; });
  if (filled.length === 1) filled[0].name = '';
  return { columns: header(COLUMNS.hockey.slice(0, 7)), groups: filled, cut: filled.length > 1 ? PLAYOFF_SPOTS[String(league.path).toLowerCase()] ?? 0 : 0 };
}

async function hockeyTechLeaders(league, count) {
  const [scorers, goalies] = await Promise.all([
    hockeyTechList(league, 'statviewtype', 'Statviewtype', { type: 'topscorers', first: '0', limit: String(count) }),
    hockeyTechList(league, 'statviewtype', 'Statviewtype', { type: 'topgoalies', first: '0', limit: String(count) }).catch(() => [])]);
  const name = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ') || String(p.name ?? '?');
  const player = (p, value, detail) => ({ name: name(p), team: String(p.team_code ?? ''), teamID: str(p.team_id) ?? '', value, detail, link: null });
  const fr = getLang() !== 'en';
  return [
    { name: lang(['Pointeurs', 'Scoring leaders']), players: scorers.slice(0, count).map((p) => player(p, `${p.points} pts`, `${p.goals} ${fr ? 'B' : 'G'} · ${p.assists} ${fr ? 'P' : 'A'} · ${p.games_played} ${fr ? 'MJ' : 'GP'}`)) },
    { name: lang(['Gardiens', 'Goalies']), players: goalies.slice(0, count).map((p) => player(p, String(p.goals_against_average ?? ''), `${p.wins} ${fr ? 'V' : 'W'} · ${String(p.save_percentage ?? '').replace(/^0/, '')} · ${p.games_played} ${fr ? 'MJ' : 'GP'}`)) },
  ].filter((c) => c.players.length);
}

// --- Fiche d'une équipe suivie : derniers résultats, prochains matchs, meilleurs joueurs ---

const RECENT = 5;
const TEAM_LEADERS = { hockey: ['points', 'goals', 'assists'], football: ['passingYards', 'rushingYards', 'receivingYards'], basketball: ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame'],
  baseball: ['avg', 'homeRuns', 'RBIs'] };

/** Sépare les matchs joués des matchs à venir, et ne garde que les plus proches d'aujourd'hui. */
function splitGames(games, upcomingCount) {
  const played = games.filter((g) => g.played).sort((a, b) => b.date - a.date).slice(0, RECENT);
  const upcoming = games.filter((g) => !g.played && g.date > Date.now() - 4 * 3600e3).sort((a, b) => a.date - b.date).slice(0, upcomingCount);
  return { recent: played, upcoming };
}

async function espnTeamSheet(league, team, upcomingCount, count) {
  const path = espnPath(league), sport = path.split('/')[0];
  let ref = team.id;
  if (sport === 'soccer') {
    // Le soccer n'accepte que l'identifiant numérique de l'équipe.
    const root = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams?limit=400`);
    ref = root.sports?.[0]?.leagues?.[0]?.teams?.find((x) => x.team?.abbreviation === team.id)?.team?.id;
    if (!ref) throw new BriefingError("Liste d'équipes indisponible");
  }
  const base = `https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${encodeURIComponent(ref)}/schedule`;
  // Soccer : les matchs joués et les matchs à venir sont deux listes distinctes.
  const [schedule, fixtures, leaders] = await Promise.all([fetchJSON(base), sport === 'soccer' ? fetchJSON(`${base}?fixture=true`).catch(() => null) : null,
    TEAM_LEADERS[sport] && espnTeamLeaders(path, team, count)]);
  const games = [];
  for (const event of [...(schedule.events ?? []), ...(fixtures?.events ?? [])]) {
    const c = event.competitions?.[0], date = parseDate(event.date), sides = c?.competitors ?? [];
    const mine = sides.find((x) => x.team?.abbreviation === team.id), other = sides.find((x) => x !== mine);
    if (!date || !mine || !other) continue;
    const state = c.status?.type?.state, detail = String(c.status?.type?.shortDetail ?? '');
    const score = (x) => (x.score?.displayValue ?? (typeof x.score === 'string' ? x.score : ''));
    games.push({ id: str(event.id), date, played: state === 'post' && c.status?.type?.completed !== false, home: mine.homeAway === 'home',
      opponent: other.team?.shortDisplayName ?? other.team?.displayName ?? other.team?.abbreviation ?? '?', logo: other.team?.logos?.[0]?.href ?? other.team?.logo ?? null,
      mine: score(mine), theirs: score(other), won: mine.winner === true ? true : other.winner === true ? false : null,
      extra: /SO/.test(detail) ? lang(['TB', 'SO']) : /OT/.test(detail) ? lang(['Prol.', 'OT']) : '', link: event.links?.[0]?.href ?? null });
  }
  const unique = [...new Map(games.map((g) => [g.id, g])).values()];
  return { teamID: team.id, name: schedule.team?.displayName ?? team.name, logo: schedule.team?.logo ?? team.logo ?? null,
    record: schedule.team?.recordSummary ?? '', standing: getLang() === 'en' ? schedule.team?.standingSummary ?? '' : '', ...splitGames(unique, upcomingCount), leaders: leaders || [] };
}

/** Meilleurs joueurs d'une équipe ESPN, dans les catégories principales de son sport. */
async function espnTeamLeaders(path, team, count) {
  try {
    const info = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams/${encodeURIComponent(team.id)}`);
    const id = info.team?.id;
    if (!id) return [];
    const root = await fetchJSON(`https://site.api.espn.com/apis/site/v3/sports/${path}/leaders?limit=${count}&team=${encodeURIComponent(id)}`);
    const wanted = TEAM_LEADERS[path.split('/')[0]], labels = new Map(LEADERS[path.split('/')[0]].map(([name, fr, en]) => [name, lang([fr, en])]));
    return wanted.map((name) => {
      const category = root.leaders?.categories?.find((c) => c.name === name);
      const players = (category?.leaders ?? []).slice(0, count).map((l) => ({ name: l.athlete?.displayName ?? '?', value: leaderValue(l) }));
      return players.length ? { name: labels.get(name) ?? name, players } : null;
    }).filter(Boolean);
  } catch { return []; }   // les meneurs sont un complément : sans eux, la fiche s'affiche quand même
}

async function hockeyTechTeamSheet(league, team, upcomingCount, count) {
  const [schedule, scorers] = await Promise.all([
    hockeyTechList(league, 'schedule', 'Schedule', { team_id: team.id }),
    hockeyTechList(league, 'statviewtype', 'Statviewtype', { type: 'topscorers', team_id: team.id, first: '0', limit: String(count) }).catch(() => [])]);
  const games = [];
  for (const g of schedule) {
    const date = parseDate(g.GameDateISO8601), home = str(g.home_team) === team.id;
    if (!date) continue;
    const mine = Number(home ? g.home_goal_count : g.visiting_goal_count), theirs = Number(home ? g.visiting_goal_count : g.home_goal_count), played = str(g.final) === '1';
    games.push({ id: str(g.game_id), date, played, home, opponent: String((home ? g.visiting_team_nickname : g.home_team_nickname) ?? (home ? g.visiting_team_code : g.home_team_code) ?? '?').trim(), logo: null,
      mine: played ? String(mine) : '', theirs: played ? String(theirs) : '', won: played ? mine > theirs : null,
      extra: str(g.shootout) === '1' ? lang(['TB', 'SO']) : str(g.overtime) === '1' ? lang(['Prol.', 'OT']) : '', link: null });
  }
  const fr = getLang() !== 'en';
  const name = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ') || String(p.name ?? '?');
  return { teamID: team.id, name: team.name, logo: team.logo ?? null, record: '', standing: '', ...splitGames(games, upcomingCount),
    leaders: scorers.length ? [{ name: lang(['Pointeurs', 'Scoring leaders']), players: scorers.slice(0, count).map((p) => ({ name: name(p), value: `${p.points} pts`, detail: `${p.goals} ${fr ? 'B' : 'G'} · ${p.assists} ${fr ? 'P' : 'A'}` })) }] : [] };
}

/**
 * Classement et meneurs de chaque ligue active d'une section. Une ligue en échec n'empêche pas les autres ;
 * des meneurs indisponibles (soccer, ligue hors saison) laissent le classement s'afficher seul.
 */
export async function fetchStandings(options, leaderCount = 5) {
  const leagues = (options.leagues ?? []).filter((l) => l.enabled !== false);
  if (!leagues.length) throw new BriefingError('Aucune ligue active');
  const count = Math.min(10, Math.max(1, Number(leaderCount) || 5));
  const tables = [], sourceErrors = {};
  const results = await settle(leagues, async (league) => {
    if (league.provider === 'apisports') throw new BriefingError("Les ligues API-Sports n'offrent pas de classement ici");
    const hockeyTech = league.provider === 'hockeytech';
    // Fiches des équipes suivies (six au plus par ligue) : une équipe en échec n'empêche pas les autres.
    const followed = options.showTeams === false ? [] : (league.teams ?? []).slice(0, 6);
    const upcomingCount = Number(options.upcoming) === 10 ? 10 : 5;
    const [table, leaders, sheets] = await Promise.all([
      options.showStandings === false ? null : (hockeyTech ? hockeyTechTable(league) : espnTable(league, options.grouping === 'division')),
      options.showLeaders === false ? [] : (hockeyTech ? hockeyTechLeaders(league, count) : espnLeaders(league, count)).catch(() => []),
      settle(followed, (team) => (hockeyTech ? hockeyTechTeamSheet(league, team, upcomingCount, Math.min(count, 3)) : espnTeamSheet(league, team, upcomingCount, Math.min(count, 3))))]);
    return { leagueID: league.id, league: league.name, mine: (league.teams ?? []).map((x) => String(x.id)), ...(table ?? { columns: [], groups: [], cut: 0 }), leaders,
      teams: sheets.filter((r) => !r.error).map((r) => r.value) };
  });
  for (const r of results) { if (r.error) sourceErrors[r.item.id] = r.error; else tables.push(r.value); }
  if (!tables.length) throw new BriefingError('{0}', Object.values(sourceErrors)[0]);
  return { tables, sourceErrors };
}
