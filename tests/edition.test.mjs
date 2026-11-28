// Résumé par courriel : sujets et vidéos regroupés par page, appel au modèle simulé, gabarit du courriel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEdition, renderEmail, dayKey, LOGO_CID } from '../lib/edition.js';
import { fetchEdition } from '../lib/summary.js';
import { buildMessage } from '../lib/mail.js';
import { newSection, youtubeSection, normalize, newPage } from '../public/shared.js';

const now = new Date(2026, 10, 28, 5, 30).getTime(), hours = (n) => now - n * 3600e3;
const article = (id, title, source, age, extra = {}) => ({ id, title, summary: `Chapeau de ${id}.`, link: `https://exemple.test/${id}`, date: hours(age), source, ...extra });
const home = newPage('Accueil'), other = newPage('Québec et vidéos');
const news = newSection('feed', { title: 'À la une', page: home.id }), weather = newSection('weather', { page: home.id });
const quebec = newSection('feed', { title: 'Québec', page: other.id }), tube = { ...youtubeSection(), page: other.id };
const config = normalize({ pages: [home, other], sections: [weather, news, quebec, tube] });
const payloads = new Map([
  [news.id, { articles: [article('a', 'Le Pentagone critique les dépenses de défense du Canada', 'Radio-Canada', 2, { image: 'https://exemple.test/a.jpg' }),
    article('vieux', 'Une nouvelle d’avant-hier sur un autre sujet complètement', 'Radio-Canada', 40), article('seul', 'Budget du Québec : hausse des taxes sur le tabac', 'Le Devoir', 3)] }],
  [quebec.id, { articles: [article('b', 'Dépenses de défense : le Pentagone critique le Canada', 'La Presse', 4), article('q', 'Le nouveau toit du stade a été hissé sans incident ce matin', 'TVA', 1)] }],
  [tube.id, { articles: [article('v1', 'Nouvelle vidéo', 'Chaîne A', 5, { image: 'https://exemple.test/v1.jpg' }), article('v0', 'Vidéo de la semaine dernière', 'Chaîne B', 100)] }],
  [weather.id, { weather: { temperature: -3.2, code: 71, days: [{ high: 1.4, low: -6 }], alerts: [] } }],
]);
const load = async (s) => payloads.get(s.id) ?? { error: 'aucune donnée', updatedAt: null };
const digest = { sections: [weather.id, news.id, quebec.id, tube.id] };

test('chaque page a ses sujets et ses vidéos ; un événement couvert par deux pages reste dans la première', async () => {
  const draft = await collectEdition(digest, config, load, now);
  assert.deepEqual(draft.pages.map((p) => p.name), ['Accueil', 'Québec et vidéos']);
  const [first, second] = draft.pages;
  assert.deepEqual(first.topics.map((x) => x.title), ['Le Pentagone critique les dépenses de défense du Canada', 'Budget du Québec : hausse des taxes sur le tabac']);
  assert.deepEqual(first.topics[0].sources.map((s) => s.name).sort(), ['La Presse', 'Radio-Canada']);   // les deux pages, un seul sujet
  assert.equal(first.topics[0].image, 'https://exemple.test/a.jpg');
  assert.deepEqual(second.topics.map((x) => x.title), ['Le nouveau toit du stade a été hissé sans incident ce matin']);
  assert.deepEqual(second.videos.map((v) => v.title), ['Nouvelle vidéo']);
  assert.deepEqual(draft.glance, [{ kind: 'weather', title: '-3°, neige faible', detail: 'max. 1°' }]);
});

test('seules les sections cochées comptent, même masquées du tableau de bord', async () => {
  const draft = await collectEdition({ sections: [quebec.id] }, config, load, now);
  assert.deepEqual(draft.pages.map((p) => [p.name, p.topics.length, p.videos.length]), [['Québec et vidéos', 2, 0]]);
  assert.deepEqual(draft.glance, []);   // la météo n'est pas cochée : pas de coup d'œil
  const hidden = normalize({ pages: [home], sections: [{ ...news, enabled: false }] });
  assert.equal((await collectEdition({ sections: [news.id] }, hidden, load, now)).pages[0].topics.length, 2);
});

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test('des points pour chaque page, chacun avec les sources et la vignette de ses sujets', async () => {
  const draft = await collectEdition(digest, config, load, now);
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 90 },
      content: [{ type: 'text', text: JSON.stringify([
        { page: 1, points: [{ text: 'Le Pentagone critique les dépenses militaires du Canada.', topics: [1] }, { text: 'Point inventé.', topics: [99] }, { text: 'Sans source.' },
          { text: 'Emprunte un sujet de l’autre page.', topics: [3] }, { text: 'Québec hausse les taxes sur le tabac.', topics: [2] }] },
        { page: 2, points: [{ text: 'Le toit du stade est en place.', topics: [3] }] }, { page: 7, points: [{ text: 'Page inconnue.', topics: [1] }] }]) }] }), { status: 200 });
  };
  const result = await fetchEdition({ model: 'claude-opus-5-5', points: 5 }, 'cle-de-test', draft.pages);
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.match(sent.messages[0].content, /## Page 1: Accueil\n1\. \[/);
  assert.match(sent.messages[0].content, /## Page 2: Québec et vidéos\n3\. \[/);
  assert.deepEqual(result.pages.map((points) => points.map((p) => p.text)), [['Le Pentagone critique les dépenses militaires du Canada.', 'Québec hausse les taxes sur le tabac.'], ['Le toit du stade est en place.']]);
  assert.deepEqual(result.pages[0][0].sources.map((s) => s.name).sort(), ['La Presse', 'Radio-Canada']);
  assert.equal(result.pages[0][0].image, 'https://exemple.test/a.jpg');
  assert.equal(result.basedOn, 3);
  // Sans aucun sujet, aucun appel : seules les vidéos et le coup d'œil partiront.
  globalThis.fetch = async () => { throw new Error('ne doit pas être appelé'); };
  assert.deepEqual((await fetchEdition({ points: 5 }, 'cle', [{ name: 'Vidéos', topics: [], videos: [] }])).pages, [[]]);
});

const edition = { glance: [{ kind: 'weather', title: '-3°, neige', detail: 'max. 1°' }], model: 'claude-opus-5-5', basedOn: 12, pages: [
  { name: 'Accueil', points: [{ text: 'Un point avec <script>alert(1)</script>.', link: 'https://exemple.test/a', image: 'https://exemple.test/a.jpg',
    sources: [{ name: 'La Presse', link: 'https://exemple.test/a' }, { name: 'Piège', link: 'javascript:alert(1)' }] }], videos: [] },
  { name: 'Vidéos', points: [], videos: [{ title: 'Nouvelle vidéo', source: 'Chaîne A', link: 'https://exemple.test/v1', image: 'https://exemple.test/v1.jpg', date: hours(3) },
    { title: 'Sans vignette', source: 'Chaîne B', link: 'https://exemple.test/v2', image: 'data:image/png;base64,AAAA', date: hours(30) }] },
  { name: 'Page vide', points: [], videos: [] }] };

test('le courriel a un bloc par page, une vignette par point et par vidéo, et rien d’injecté', () => {
  const mail = renderEmail(edition, 'Résumé du jour', new Date(now), { logo: true });
  assert.match(mail.subject, /^Résumé du jour — samedi 28 novembre$/);
  assert.match(mail.text, /== Accueil ==\n1\. Un point/);
  assert.match(mail.text, /== Vidéos ==/);
  assert.ok(!mail.text.includes('Page vide') && !mail.html.includes('Page vide'));
  assert.match(mail.text, /La Presse : https:\/\/exemple\.test\/a/);
  assert.ok(mail.html.indexOf('>Accueil<') < mail.html.indexOf('>Vidéos<'));
  assert.ok(!mail.html.includes('<script>') && !mail.html.includes('javascript:') && !mail.html.includes('data:image'));
  // La vignette précède son titre, dans la même rangée, et mène au même lien.
  assert.match(mail.html, /<a href="https:\/\/exemple\.test\/v1"[^>]*><img src="https:\/\/exemple\.test\/v1\.jpg"[\s\S]{0,400}Nouvelle vidéo/);
  assert.match(mail.html, /<img src="https:\/\/exemple\.test\/a\.jpg"/);
  assert.match(mail.html, new RegExp(`<img src="cid:${LOGO_CID}"`));
  assert.match(mail.html, /prefers-color-scheme:dark/);
  assert.match(mail.html, /il y a 3 h/);
  assert.ok(!renderEmail(edition, 'Résumé du jour', new Date(now)).html.includes('cid:'));   // sans logo joint, pas d'image cassée
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('le logo voyage dans le message, relié au HTML par son identifiant', () => {
  const mail = renderEmail(edition, 'Résumé du jour', new Date(now), { logo: true });
  const raw = buildMessage({ from: 'lookout@exemple.test', to: 'moi@exemple.test', ...mail, inline: [{ cid: LOGO_CID, type: 'image/png', data: Buffer.from('fausse image') },
    { cid: 'mauvais type', type: 'text/html', data: Buffer.from('x') }] });
  assert.match(raw, /Content-Type: multipart\/alternative; boundary="lookout-alt-/);
  assert.match(raw, /Content-Type: multipart\/related; boundary="lookout-rel-/);
  assert.match(raw, new RegExp(`Content-ID: <${LOGO_CID}>\\r\\nContent-Disposition: inline`));
  assert.equal((raw.match(/Content-ID:/g) ?? []).length, 1);   // la pièce au type refusé n'est pas jointe
  assert.ok(raw.indexOf('text/plain') < raw.indexOf('multipart/related'));
  assert.ok(!buildMessage({ from: 'a@exemple.test', to: 'b@exemple.test', subject: 's', text: 't', html: 'h' }).includes('multipart/related'));
});
