// Ordre des articles d'une carte : nouveaux, puis non lus, puis déjà lus.
import test from 'node:test';
import assert from 'node:assert/strict';

import { present } from '../public/shared.js';

const now = Date.now(), hours = (n) => now - n * 3600e3;
const article = (id, source, age) => ({ id, title: `Titre ${id}`, summary: '', date: hours(age), source });
const options = { ordering: 'newest', maxAgeHours: 0 };

test('les nouveaux passent devant les non lus, qui passent devant les lus', () => {
  const articles = [article('lu-récent', 'A', 1), article('nonlu', 'A', 5), article('nouveau', 'A', 3), article('lu-vieux', 'A', 9)];
  const rank = (a) => (a.id.startsWith('lu') ? 2 : a.id === 'nouveau' ? 0 : 1);
  assert.deepEqual(present(articles, options, ['A'], 10, {}, null, rank).map((a) => a.id), ['nouveau', 'nonlu', 'lu-récent', 'lu-vieux']);
  // Carte de deux places : les lus cèdent leur place, même plus récents.
  assert.deepEqual(present(articles, options, ['A'], 2, {}, null, rank).map((a) => a.id), ['nouveau', 'nonlu']);
  // Sans rang : simple ordre chronologique.
  assert.deepEqual(present(articles, options, ['A'], 2).map((a) => a.id), ['lu-récent', 'nouveau']);
});

test('l’alternance entre sources vaut à l’intérieur de chaque rang', () => {
  const articles = [article('a1', 'A', 1), article('a2', 'A', 2), article('b1', 'B', 3), article('b-lu', 'B', 0.5)];
  const rank = (a) => (a.id === 'b-lu' ? 2 : 1);
  assert.deepEqual(present(articles, { ...options, ordering: 'balanced' }, ['A', 'B'], 4, {}, null, rank).map((a) => a.id), ['a1', 'b1', 'a2', 'b-lu']);
});
