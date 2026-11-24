// Classements et statistiques : le tableau complet d'une ligue et ses meneurs (ESPN et HockeyTech, sans clé).
import { BriefingError, fetchJSON, settle } from './util.js';
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
      groups.push({ name: groupName(node.name) || '', rows: ranked.map(({ teamID, name, logo, values }, i) => ({ rank: i + 1, teamID, name, logo, values })) });
    }
    for (const child of node.children ?? []) walk(child);
  })(root);
  if (!groups.length) throw new BriefingError('Classement indisponible pour cette ligue');
  // Une seule table (soccer) : son nom répète celui de la ligue.
  if (groups.length === 1) groups[0].name = '';
  return { columns: header(columns), groups };
}

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
    groups.at(-1).rows.push({ teamID: str(x.team_id), name: String(x.name ?? '').split(',').pop().trim() || String(x.name ?? '?'), logo: null,
      values: [x.games_played, x.wins, x.losses, Number(x.ot_losses ?? 0) + Number(x.shootout_losses ?? 0), x.points,
        Number.isFinite(diff) ? `${diff > 0 ? '+' : ''}${diff}` : '–', last10.every((v) => v != null) ? last10.join('-') : '–'].map((v) => (v == null || v === '' ? '–' : String(v))) });
  }
  const filled = groups.filter((g) => g.rows.length);
  if (!filled.length) throw new BriefingError('Classement indisponible pour cette ligue');
  for (const g of filled) g.rows.forEach((row, i) => { row.rank = i + 1; });
  if (filled.length === 1) filled[0].name = '';
  return { columns: header(COLUMNS.hockey.slice(0, 7)), groups: filled };
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
    const [table, leaders] = await Promise.all([
      options.showStandings === false ? null : (hockeyTech ? hockeyTechTable(league) : espnTable(league, options.grouping === 'division')),
      options.showLeaders === false ? [] : (hockeyTech ? hockeyTechLeaders(league, count) : espnLeaders(league, count)).catch(() => [])]);
    return { leagueID: league.id, league: league.name, mine: (league.teams ?? []).map((x) => String(x.id)), ...(table ?? { columns: [], groups: [] }), leaders };
  });
  for (const r of results) { if (r.error) sourceErrors[r.item.id] = r.error; else tables.push(r.value); }
  if (!tables.length) throw new BriefingError('{0}', Object.values(sourceErrors)[0]);
  return { tables, sourceErrors };
}
