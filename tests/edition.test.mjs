// Résumé par courriel : sujets réunis par événement, vidéos des dernières 24 heures, appel au modèle simulé, courriel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEdition, renderEmail, dayKey } from '../lib/edition.js';
import { fetchEdition } from '../lib/summary.js';
import { newSection, youtubeSection, normalize } from '../public/shared.js';

const now = new Date(2026, 10, 28, 5, 30).getTime(), hours = (n) => now - n * 3600e3;
const article = (id, title, source, age, extra = {}) => ({ id, title, summary: `Chapeau de ${id}.`, link: `https://exemple.test/${id}`, date: hours(age), source, ...extra });
const news = newSection('feed', { title: 'À la une' }), quebec = newSection('feed', { title: 'Québec' }), tube = youtubeSection(), weather = newSection('weather');
const config = normalize({ sections: [weather, news, quebec, tube] });
const payloads = new Map([
  [news.id, { articles: [article('a', 'Le Pentagone critique les dépenses de défense du Canada', 'Radio-Canada', 2), article('vieux', 'Une nouvelle d’avant-hier sur un autre sujet complètement', 'Radio-Canada', 40),
    article('seul', 'Budget du Québec : hausse des taxes sur le tabac', 'Le Devoir', 3)] }],
  [quebec.id, { articles: [article('b', 'Dépenses de défense : le Pentagone critique le Canada', 'La Presse', 4), article('a-bis', 'Le Pentagone critique les dépenses de défense du Canada', 'Radio-Canada', 2, { link: 'https://exemple.test/a' })] }],
  [tube.id, { articles: [article('v1', 'Nouvelle vidéo', 'Chaîne A', 5, { image: 'https://exemple.test/v1.jpg' }), article('v0', 'Vidéo de la semaine dernière', 'Chaîne B', 100)] }],
  [weather.id, { weather: { temperature: -3.2, code: 71, days: [{ high: 1.4, low: -6 }], alerts: [] } }],
]);
const load = async (s) => payloads.get(s.id) ?? { error: 'aucune donnée', updatedAt: null };
const digest = { sections: [weather.id, news.id, quebec.id, tube.id] };

test('les sujets sont réunis par événement, les plus couverts d’abord ; les vidéos récentes sont à part', async () => {
  const draft = await collectEdition(digest, config, load, now);
  assert.equal(draft.topics.length, 2);
  assert.deepEqual(draft.topics[0].sources.map((s) => s.name).sort(), ['La Presse', 'Radio-Canada']);
  assert.equal(draft.topics[1].title, 'Budget du Québec : hausse des taxes sur le tabac');
  assert.deepEqual(draft.videos.map((v) => v.title), ['Nouvelle vidéo']);
  assert.deepEqual(draft.glance, [{ kind: 'weather', title: '-3°, neige faible', detail: 'max. 1°' }]);
});

test('seules les sections cochées comptent', async () => {
  const draft = await collectEdition({ sections: [quebec.id] }, config, load, now);
  assert.equal(draft.topics.length, 1);
  assert.equal(draft.videos.length, 0);
  assert.deepEqual(draft.glance, []);   // la météo n'est pas cochée : pas de coup d'œil
  // Une section masquée du tableau de bord peut quand même nourrir le résumé.
  const hidden = normalize({ sections: [{ ...news, enabled: false }] });
  assert.equal((await collectEdition({ sections: [news.id] }, hidden, load, now)).topics.length, 2);
});

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test('chaque point garde les sources de ses sujets ; un point sans sujet valable est écarté', async () => {
  const draft = await collectEdition(digest, config, load, now);
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 90 },
      content: [{ type: 'text', text: JSON.stringify([{ text: 'Le Pentagone critique les dépenses militaires du Canada.', topics: [1] }, { text: 'Point inventé.', topics: [99] }, { text: 'Sans source.' },
        { text: 'Québec hausse les taxes sur le tabac.', topics: [2] }]) }] }), { status: 200 });
  };
  const result = await fetchEdition({ model: 'claude-opus-5-5', points: 5 }, 'cle-de-test', draft.topics);
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.match(sent.messages[0].content, /^<topics>\n1\. \[/);
  assert.deepEqual(result.points.map((p) => p.text), ['Le Pentagone critique les dépenses militaires du Canada.', 'Québec hausse les taxes sur le tabac.']);
  assert.deepEqual(result.points[0].sources.map((s) => s.name).sort(), ['La Presse', 'Radio-Canada']);
  assert.ok(result.points.every((p) => p.link.startsWith('https://exemple.test/')));
  assert.equal(result.basedOn, 2);
});

test('le courriel reprend la journée, les points, leurs sources et les vidéos, sans HTML injecté', () => {
  const edition = { glance: [{ kind: 'weather', title: '-3°, neige', detail: 'max. 1°' }], model: 'claude-opus-5-5', basedOn: 12,
    summary: [{ text: 'Un point avec <script>alert(1)</script>.', sources: [{ name: 'La Presse', link: 'https://exemple.test/a' }, { name: 'Piège', link: 'javascript:alert(1)' }] }],
    videos: [{ title: 'Nouvelle vidéo', source: 'Chaîne A', link: 'https://exemple.test/v1' }] };
  const mail = renderEmail(edition, 'Résumé du jour', new Date(2026, 10, 28));
  assert.match(mail.subject, /^Résumé du jour — samedi 28 novembre$/);
  assert.match(mail.text, /1\. Un point/);
  assert.match(mail.text, /La Presse : https:\/\/exemple\.test\/a/);
  assert.ok(!mail.html.includes('<script>'));
  assert.ok(!mail.html.includes('javascript:'));
  assert.match(mail.html, /Nouvelle vidéo/);
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('le courriel a son propre contenu : coup d’œil et vidéos se retirent sans toucher aux points', () => {
  const edition = { glance: [{ kind: 'weather', title: '-3°, neige', detail: 'max. 1°' }], model: 'claude-opus-5-5', basedOn: 12,
    summary: [{ text: 'Un point.', sources: [{ name: 'La Presse', link: 'https://exemple.test/a' }] }], videos: [{ title: 'Nouvelle vidéo', source: 'Chaîne A', link: 'https://exemple.test/v1' }] };
  const bare = renderEmail(edition, 'Résumé du jour', new Date(2026, 10, 28), { glance: false, videos: false });
  assert.ok(!bare.html.includes('neige') && !bare.html.includes('Nouvelle vidéo') && !bare.text.includes('Nouvelle vidéo'));
  assert.match(bare.html, /Un point\./);
  assert.equal(edition.glance.length, 1);   // l'édition gardée n'est pas modifiée : la carte garde tout
  assert.match(renderEmail(edition, 'Résumé du jour', new Date(2026, 10, 28), { videos: false }).html, /neige/);
});
