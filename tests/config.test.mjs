// Configuration : valeurs par défaut, et secrets jamais renvoyés au navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, defaultConfig, newSection, calendarSource, SECRET_MASK, KINDS, KIND_REFRESH, REFRESH_CHOICES } from '../public/shared.js';
import { redact, restoreSecrets } from '../lib/secrets.js';
import { EN } from '../public/i18n.js';

test('chaque type de section a un intervalle valide et un libellé traduit', () => {
  for (const [kind, k] of Object.entries(KINDS)) {
    assert.ok(kind in KIND_REFRESH, kind);
    assert.ok(KIND_REFRESH[kind] === 0 || REFRESH_CHOICES.includes(KIND_REFRESH[kind]), kind);
    assert.ok(k.label in EN, `traduction manquante : ${k.label}`);
    assert.ok(k.detail in EN, `traduction manquante : ${k.detail}`);
  }
});

test('une configuration ancienne ou incomplète est complétée', () => {
  const config = normalize({ sections: [{ kind: 'feed', title: 'Vieux fil' }, { kind: 'inconnu' }, { kind: 'calendar', calendar: { calendars: [{ url: 'https://exemple.test/a.ics' }] } }] });
  assert.equal(config.sections.length, 2);
  assert.equal(config.pages.length, 1);
  assert.ok(config.sections.every((s) => s.page === config.pages[0].id && s.id));
  assert.ok(config.sections[1].calendar.calendars[0].id, 'chaque calendrier reçoit un identifiant');
  assert.equal(normalize(defaultConfig()).sections.length, defaultConfig().sections.length);
});

test("clés et adresses de calendrier : masquées à l'aller, conservées au retour", () => {
  const section = newSection('calendar', { id: 's1' });
  section.calendar.calendars = [{ ...calendarSource('Perso', 'https://exemple.test/secret.ics'), id: 'c1' }];
  section.releases.tmdbKey = 'cle-tmdb';
  section.api.headers = 'Authorization: Bearer abc\nAccept: application/json';
  const stored = { sections: [section] };
  const sent = redact(stored);
  assert.ok(!JSON.stringify(sent).includes('secret.ics') && !JSON.stringify(sent).includes('cle-tmdb') && !JSON.stringify(sent).includes('abc'));
  assert.equal(sent.sections[0].calendar.calendars[0].url, SECRET_MASK);
  assert.equal(stored.sections[0].calendar.calendars[0].url, 'https://exemple.test/secret.ics', "l'original n'est pas modifié");
  const back = restoreSecrets(structuredClone(sent), stored);
  assert.equal(back.sections[0].calendar.calendars[0].url, 'https://exemple.test/secret.ics');
  assert.equal(back.sections[0].releases.tmdbKey, 'cle-tmdb');
  assert.match(back.sections[0].api.headers, /Bearer abc/);
  // Un masque sans valeur d'origine (section copiée ailleurs) est vidé, jamais enregistré tel quel.
  const orphan = structuredClone(sent);
  orphan.sections[0].id = 'autre';
  assert.equal(restoreSecrets(orphan, stored).sections[0].calendar.calendars[0].url, '');
});

test('le jeton Home Assistant est masqué, puis conservé quand le masque revient', () => {
  const section = newSection('hass');
  Object.assign(section.hass, { url: 'http://ha.test:8123', token: 'jeton-secret' });
  const stored = normalize({ sections: [section] });
  const sent = redact(stored);
  assert.equal(sent.sections[0].hass.token, SECRET_MASK);
  assert.ok(!JSON.stringify(sent).includes('jeton-secret'));
  assert.equal(restoreSecrets(normalize(sent), stored).sections[0].hass.token, 'jeton-secret');
});

test('les heures invalides reviennent à leur valeur par défaut', () => {
  const g = normalize({ general: { quietStart: '25:00', quietEnd: '06:30', morningTime: 'matin' }, sections: [] }).general;
  assert.deepEqual([g.quietStart, g.quietEnd, g.morningTime], ['22:00', '06:30', '07:00']);
});

test('une ancienne carte « Résumé du jour » devient les réglages du résumé par courriel, clé comprise', () => {
  const news = newSection('feed', { title: 'À la une' }), tech = newSection('feed', { title: 'Techno' }), weather = newSection('weather'), hidden = newSection('feed', { title: 'Masquée', enabled: false });
  const old = { kind: 'summary', id: 'ANCIENNE', title: 'Résumé du jour', enabled: true, maxItems: 7,
    summary: { anthropicKey: 'cle-secrete', model: 'claude-sonnet-5-5', sections: [tech.id], focus: 'le Québec', time: '06:15', email: true, emailTo: 'moi@exemple.test' } };
  const config = normalize({ sections: [weather, news, tech, hidden, old] });
  assert.ok(!config.sections.some((s) => s.kind === 'summary'));   // la carte a disparu
  assert.deepEqual(config.digest, { enabled: true, time: '06:15', emailTo: 'moi@exemple.test', sections: [weather.id, tech.id], model: 'claude-sonnet-5-5', anthropicKey: 'cle-secrete', focus: 'le Québec', points: 7 });
  // « Toutes mes sections » : les sections affichées, pas les masquées. Sans courriel réglé, le résumé reste coupé.
  const all = normalize({ sections: [weather, news, tech, hidden, { ...old, summary: { ...old.summary, sections: [], email: false } }] });
  assert.deepEqual(all.digest.sections, [weather.id, news.id, tech.id]);
  assert.equal(all.digest.enabled, false);
  // La clé ne revient jamais au navigateur, et elle est conservée quand le masque revient.
  const sent = redact(config);
  assert.equal(sent.digest.anthropicKey, SECRET_MASK);
  assert.ok(!JSON.stringify(sent).includes('cle-secrete'));
  assert.equal(restoreSecrets(normalize(sent), config).digest.anthropicKey, 'cle-secrete');
});

test('les réglages du résumé par courriel sont bornés et ignorent les sections inconnues', () => {
  const news = newSection('feed'), stocks = newSection('stocks');
  const d = normalize({ sections: [news, stocks], digest: { enabled: 1, time: '99:00', sections: [news.id, stocks.id, 'inconnue', news.id], points: 40, model: 'autre' } }).digest;
  assert.deepEqual([d.enabled, d.time, d.sections, d.points, d.model], [true, '05:30', [news.id], 10, 'claude-opus-5-5']);
  assert.equal(normalize({ sections: [] }).digest.enabled, false);
});
