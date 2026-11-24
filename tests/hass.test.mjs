// Home Assistant : lecture des états, recherche d'entités et commandes, contre un faux serveur local.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchHass, searchHass, callHass } from '../lib/hass.js';

const STATES = [
  { entity_id: 'sensor.temperature_salon', state: '21.46', attributes: { friendly_name: 'Température du salon', unit_of_measurement: '°C', device_class: 'temperature' }, last_changed: '2026-11-23T12:00:00Z' },
  { entity_id: 'light.cuisine', state: 'off', attributes: { friendly_name: 'Cuisine' } },
  { entity_id: 'binary_sensor.porte_entree', state: 'on', attributes: { friendly_name: "Porte d'entrée", device_class: 'door' } },
  { entity_id: 'lock.porte', state: 'locked', attributes: { friendly_name: 'Serrure' } },
];
const calls = [];
const server = http.createServer((req, res) => {
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.headers.authorization !== 'Bearer bon-jeton') return json(401, { message: 'Unauthorized' });
  if (req.method === 'GET' && req.url === '/api/states') return json(200, STATES);
  const one = /^\/api\/states\/(.+)$/.exec(req.url);
  if (req.method === 'GET' && one) { const found = STATES.find((s) => s.entity_id === one[1]); return found ? json(200, found) : json(404, { message: 'Entity not found.' }); }
  if (req.method === 'POST' && req.url.startsWith('/api/services/')) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => { calls.push({ url: req.url, body: JSON.parse(body) }); const s = STATES.find((x) => x.entity_id === JSON.parse(body).entity_id); if (s) s.state = s.state === 'on' ? 'off' : 'on'; json(200, []); });
    return undefined;
  }
  return json(404, {});
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const options = (entities, token = 'bon-jeton') => ({ url, token, entities: entities.map((entity, i) => ({ id: `e${i}`, entity, name: '', enabled: true })) });

test('les états des entités choisies sont lus, dans l’ordre, sans rien d’autre', async () => {
  const { entities, sourceErrors } = await fetchHass(options(['light.cuisine', 'sensor.temperature_salon']));
  assert.deepEqual(entities.map((e) => e.entity), ['light.cuisine', 'sensor.temperature_salon']);
  assert.equal(entities[0].action, 'toggle');
  assert.equal(entities[1].action, null);
  assert.equal(entities[1].unit, '°C');
  assert.deepEqual(sourceErrors, {});
});

test('une entité inconnue est signalée sans cacher les autres', async () => {
  const { entities, sourceErrors } = await fetchHass(options(['light.cuisine', 'sensor.absent']));
  assert.equal(entities.length, 1);
  assert.match(sourceErrors.e1, /sensor\.absent/);
});

test('un jeton refusé donne un message clair', async () => {
  await assert.rejects(fetchHass(options(['light.cuisine'], 'mauvais')), /refusé/);
  await assert.rejects(fetchHass({ url, token: '', entities: [] }), /manquant/);
  await assert.rejects(fetchHass(options([])), /au moins une entité/);
});

test('la recherche filtre par nom ou identifiant', async () => {
  assert.deepEqual((await searchHass({ url, token: 'bon-jeton' }, 'porte')).map((e) => e.entity), ['binary_sensor.porte_entree', 'lock.porte']);
  assert.equal((await searchHass({ url, token: 'bon-jeton' }, '')).length, STATES.length);
});

test('une lumière se bascule ; une serrure ne peut pas être actionnée', async () => {
  await callHass({ url, token: 'bon-jeton' }, 'light.cuisine');
  assert.deepEqual(calls.at(-1), { url: '/api/services/light/toggle', body: { entity_id: 'light.cuisine' } });
  const before = calls.length;
  await assert.rejects(callHass({ url, token: 'bon-jeton' }, 'lock.porte'), /ne peut pas être actionnée/);
  await assert.rejects(callHass({ url, token: 'bon-jeton' }, 'light.cuisine/../../config'), /ne peut pas être actionnée/);
  assert.equal(calls.length, before);
});
