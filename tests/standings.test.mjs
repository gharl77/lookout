// Classements et statistiques : configuration de la section.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, template, fetchSignature } from '../public/shared.js';
import { fetchStandings } from '../lib/standings.js';

test('une section de classements incomplète est complétée', () => {
  const s = normalize({ sections: [{ kind: 'standings', standings: { leagues: [{ name: 'LNH', path: 'hockey/nhl' }], grouping: 'fantaisie' } }] }).sections[0];
  assert.equal(s.standings.grouping, 'conference');
  assert.deepEqual(s.standings.leagues[0].teams, []);
  assert.equal(s.standings.leagues[0].provider, 'espn');
  assert.ok(s.standings.leagues[0].id);
  assert.equal(s.refreshMinutes, 60);
});

test('changer une ligue, le regroupement ou le nombre de meneurs redemande les données', () => {
  const s = template('standings'), before = fetchSignature(s, 'metric');
  s.standings.grouping = 'division';
  const grouped = fetchSignature(s, 'metric');
  assert.notEqual(grouped, before);
  s.maxItems = 3;
  assert.notEqual(fetchSignature(s, 'metric'), grouped);
  s.standings.onlyMine = true;   // affichage seulement : rien à retélécharger
  s.maxItems = 5;
  s.standings.grouping = 'conference';
  assert.equal(fetchSignature(s, 'metric'), before);
});

test('sans ligue active, ou avec une ligue API-Sports seule, le message est clair', async () => {
  await assert.rejects(fetchStandings({ leagues: [] }), /Aucune ligue active/);
  await assert.rejects(fetchStandings({ leagues: [{ id: 'a', name: 'X', path: 'hockey/1', provider: 'apisports', enabled: true, teams: [] }] }), /API-Sports/);
});
