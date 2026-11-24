// Notifications : heures calmes, mots-clés suivis et résumé du matin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuiet, diffEvents, morningBrief } from '../lib/notify.js';
import { newSection, normalize } from '../public/shared.js';

const at = (h, m = 0) => new Date(2026, 10, 23, h, m);

test('les heures calmes peuvent enjamber minuit', () => {
  const g = { quietHours: true, quietStart: '22:00', quietEnd: '07:00' };
  assert.equal(isQuiet(g, at(23)), true);
  assert.equal(isQuiet(g, at(3)), true);
  assert.equal(isQuiet(g, at(6, 59)), true);
  assert.equal(isQuiet(g, at(7)), false);
  assert.equal(isQuiet(g, at(12)), false);
  assert.equal(isQuiet({ ...g, quietHours: false }, at(23)), false);
  assert.equal(isQuiet({ quietHours: true, quietStart: '13:00', quietEnd: '14:00' }, at(13, 30)), true);
  assert.equal(isQuiet({ quietHours: true, quietStart: '13:00', quietEnd: '14:00' }, at(14)), false);
});

const article = (id, title) => ({ id, title, summary: '', link: `https://exemple.test/${id}`, date: Date.now(), source: 'Fil' });

test('un mot-clé suivi déclenche une notification, sans annoncer les autres articles', () => {
  const section = newSection('feed'), memory = {}, prefs = { general: {}, keywords: ['tempête'] };
  assert.deepEqual(diffEvents(section, { articles: [article('a', 'Rien de spécial')] }, memory, prefs), []);   // première observation
  const events = diffEvents(section, { articles: [article('a', 'Rien de spécial'), article('b', 'Tempête sur Montréal'), article('c', 'Budget déposé')] }, memory, prefs);
  assert.equal(events.length, 1);
  assert.equal(events[0].body, 'Tempête sur Montréal');
  assert.match(events[0].title, /tempête/);
  // Déjà vu : rien de plus au tour suivant.
  assert.deepEqual(diffEvents(section, { articles: [article('b', 'Tempête sur Montréal')] }, memory, prefs), []);
});

test('sans mot-clé ni option de section, rien n’est surveillé', () => {
  const section = newSection('feed'), memory = {};
  diffEvents(section, { articles: [article('a', 'Un')] }, memory, { general: {}, keywords: [] });
  assert.deepEqual(diffEvents(section, { articles: [article('a', 'Un'), article('b', 'Deux')] }, memory, { general: {}, keywords: [] }), []);
});

test('le résumé du matin réunit météo, rendez-vous et grands titres', async () => {
  const now = at(7), weather = newSection('weather'), calendar = newSection('calendar'), feed = newSection('feed');
  const config = normalize({ general: { displayName: 'Alex' }, sections: [weather, calendar, feed] });
  const payloads = {
    weather: { weather: { temperature: 2.6, code: 71, days: [{ high: 4.4, low: -2 }], alerts: [] } },
    calendar: { events: [{ title: 'Dentiste', start: at(9, 30).getTime(), end: at(10).getTime(), allDay: false },
      { title: 'Demain seulement', start: at(33).getTime(), end: at(34).getTime(), allDay: false },
      { title: 'Congé', start: Date.UTC(2026, 10, 23), end: Date.UTC(2026, 10, 24), allDay: true }] },
    feed: { articles: [{ id: '1', title: 'Grand titre du jour', summary: '', date: now.getTime() - 3600e3 }, { id: '2', title: 'Plus ancien', summary: '', date: now.getTime() - 7200e3 }] },
  };
  const brief = await morningBrief(config, async (section) => payloads[section.kind], now);
  assert.equal(brief.title, 'Bonjour, Alex');
  assert.match(brief.body, /Montréal : 3°, neige faible, max\. 4°/);
  assert.match(brief.body, /2 rendez-vous : Congé · .*Dentiste/);
  assert.doesNotMatch(brief.body, /Demain seulement/);
  assert.match(brief.body, /• Grand titre du jour/);
  assert.equal(await morningBrief(normalize({ sections: [] }), async () => null, now), null);
});
