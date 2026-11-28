// Sujets regroupés : plusieurs sources, un même événement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { topicClusters, topicWords } from '../public/shared.js';

const now = Date.now();
const article = (id, title, source, hoursAgo = 0) => ({ id, title, source, link: `https://exemple.test/${id}`, date: now - hoursAgo * 3600e3 });

test('les mots courants, les accents et les pluriels ne comptent pas', () => {
  assert.deepEqual([...topicWords('Les dépenses de défense du Canada, selon le Pentagone')].sort(), ['canada', 'defense', 'depens', 'pentagone']);
  assert.ok(topicWords('Le Canadien s’incline 6-0').has('6-0'));
});

test('deux sources sur le même événement forment un sujet ; les autres nouvelles restent seules', () => {
  const list = [
    article('a', 'Le Pentagone critique les dépenses de défense du Canada', 'Radio-Canada'),
    article('b', 'Dépenses de défense : le Pentagone critique le Canada', 'La Presse', 2),
    article('c', 'Le Canadien s’incline 6-0 face à l’Avalanche', 'RDS'),
    article('d', 'L’Avalanche écrase le Canadien 6-0 au Colorado', 'La Presse', 1),
    article('e', 'Budget du Québec : hausse des taxes sur le tabac', 'Le Devoir'),
    article('f', 'Pentagon criticizes Canada defence spending', 'CBC'),
  ];
  const topics = topicClusters(list);
  assert.equal(topics.get('a'), topics.get('b'));
  assert.equal(topics.get('c'), topics.get('d'));
  assert.notEqual(topics.get('a'), topics.get('c'));
  assert.equal(topics.has('e'), false);
  assert.equal(topics.has('f'), false);   // autre langue : pas de rapprochement
});

test('un même titre à plus de deux jours d’écart n’est pas le même événement', () => {
  const topics = topicClusters([article('a', 'Le Pentagone critique les dépenses de défense du Canada', 'A'), article('b', 'Le Pentagone critique les dépenses de défense du Canada', 'B', 60)]);
  assert.equal(topics.size, 0);
});

test('le même article repris deux fois par une source ne fait pas un sujet', () => {
  const twice = { ...article('a', 'Le Pentagone critique les dépenses de défense du Canada', 'A'), id: 'a2' };
  assert.equal(topicClusters([article('a', 'Le Pentagone critique les dépenses de défense du Canada', 'A'), { ...twice, link: 'https://exemple.test/a' }]).size, 0);
});
