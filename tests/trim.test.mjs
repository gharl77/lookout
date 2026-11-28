// Allègement des sections d'articles : la carte garde tout ce qu'elle peut afficher.
import test from 'node:test';
import assert from 'node:assert/strict';
import { trimArticles, ARTICLE_LIMIT } from '../lib/trim.js';
import { newSection } from '../public/shared.js';

const now = Date.now();
const make = (count, source, startHoursAgo = 0, title = 'Vidéo') => Array.from({ length: count }, (_, i) =>
  ({ id: `${source}-${i}`, title: `${title} ${source} ${i}`, summary: '', date: now - (startHoursAgo + i) * 3600e3, source }));

test('une petite section est renvoyée telle quelle', () => {
  const articles = make(40, 'A');
  assert.equal(trimArticles(articles, newSection('feed')), articles);
});

test('les plus récents qui passent les filtres sont gardés, dans la limite', () => {
  const section = newSection('feed');
  Object.assign(section.feed, { ordering: 'newest', maxAgeHours: 48 });
  const articles = [...make(400, 'Bavarde'), ...make(5, 'Discrète', 1)];
  const kept = trimArticles(articles, section);
  assert.equal(kept.length, ARTICLE_LIMIT);
  // Les 48 premières heures de « Bavarde » et les cinq de « Discrète » passent les filtres : toutes sont là.
  assert.ok(make(5, 'Discrète', 1).every((a) => kept.some((k) => k.id === a.id)));
  assert.ok(kept.some((k) => k.id === 'Bavarde-0') && kept.some((k) => k.id === 'Bavarde-47'));
});

test('avec un mot obligatoire, les articles qui le contiennent passent avant les plus récents', () => {
  const section = newSection('feed');
  Object.assign(section.feed, { ordering: 'newest', maxAgeHours: 0, includeKeywords: 'hockey' });
  const wanted = make(3, 'Sport', 900, 'Hockey');
  const kept = trimArticles([...make(600, 'Autre'), ...wanted], section);
  assert.ok(wanted.every((a) => kept.some((k) => k.id === a.id)));
  assert.equal(kept.length, ARTICLE_LIMIT);
});

test('en alternance, chaque source garde ses plus récents', () => {
  const section = newSection('feed', { maxItems: 6 });
  Object.assign(section.feed, { ordering: 'balanced', maxAgeHours: 0 });
  const quiet = make(2, 'Discrète', 5000);
  const kept = trimArticles([...make(300, 'A'), ...make(300, 'B'), ...quiet], section);
  assert.ok(quiet.every((a) => kept.some((k) => k.id === a.id)));
});
