// Trajets : OSRM (libre, sans circulation), TomTom (clé, circulation en direct) ou capteur Home Assistant (ex. Waze).
import fs from 'node:fs';
import path from 'node:path';
import { BriefingError, fetchJSON } from './util.js';
import { t } from '../public/i18n.js';

// Les adresses géocodées sont conservées sur disque : une adresse n'est demandée qu'une fois.
let geocodeFile = null, geocodes = {};
export function initGeocodeCache(dataDir) {
  geocodeFile = path.join(dataDir, 'geocode.json');
  try { geocodes = JSON.parse(fs.readFileSync(geocodeFile, 'utf8')); } catch { geocodes = {}; }
}

let lastNominatim = 0;
async function geocode(text, options) {
  const key = String(text).trim().toLowerCase();
  if (geocodes[key]) return geocodes[key];
  let point = null;
  const tomtom = String(options.tomtomKey ?? '').trim();
  if (options.provider === 'tomtom' && tomtom) {
    const data = await fetchJSON(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(text)}.json?limit=1&language=fr-FR&key=${encodeURIComponent(tomtom)}`);
    const p = data.results?.[0]?.position;
    if (p) point = { lat: p.lat, lon: p.lon };
  } else {
    // Nominatim (OpenStreetMap) : au plus une requête par seconde, conformément à ses conditions d'utilisation.
    const wait = lastNominatim + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatim = Date.now();
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: text, format: 'jsonv2', limit: '1', 'accept-language': 'fr' });
    const data = await fetchJSON(url, { 'User-Agent': 'Lookout/0.1 (tableau de bord personnel auto-hébergé)' });
    if (data[0]) point = { lat: Number(data[0].lat), lon: Number(data[0].lon) };
  }
  if (!point) throw new BriefingError('Adresse introuvable : « {0} »', text);
  geocodes[key] = point;
  if (geocodeFile) fs.promises.writeFile(geocodeFile, JSON.stringify(geocodes)).catch(() => {});
  return point;
}

async function osrm(result, a, b, mode) {
  const walking = mode === 'walking';
  const host = walking ? 'routing.openstreetmap.de/routed-foot' : 'router.project-osrm.org';
  const data = await fetchJSON(`https://${host}/route/v1/${walking ? 'foot' : 'driving'}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false&alternatives=true&steps=false`);
  const best = data.routes?.[0];
  if (!best) throw new BriefingError('Aucun itinéraire trouvé');
  result.duration = best.duration;
  result.distance = best.distance;
  result.alternates = data.routes.slice(1, 3).map((r) => ({ name: '', duration: r.duration }));
}

async function tomtom(result, a, b, mode, key) {
  key = String(key ?? '').trim();
  if (!key) throw new BriefingError('Clé TomTom manquante (voir les réglages de la section)');
  const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json`);
  url.search = new URLSearchParams({ key, traffic: 'true', travelMode: mode === 'walking' ? 'pedestrian' : 'car',
    maxAlternatives: '2', computeTravelTimeFor: 'all', language: 'fr-FR' });
  let data;
  try { data = await fetchJSON(url); } catch (e) {
    if (e.status === 403) throw new BriefingError('Clé TomTom refusée');
    throw new BriefingError('TomTom : {0}', e.message);
  }
  const routes = (data.routes ?? []).map((r) => r.summary).filter(Boolean).sort((x, y) => x.travelTimeInSeconds - y.travelTimeInSeconds);
  if (!routes.length) throw new BriefingError('Aucun itinéraire trouvé');
  result.duration = routes[0].travelTimeInSeconds;
  result.distance = routes[0].lengthInMeters;
  const delay = routes[0].trafficDelayInSeconds ?? 0;
  if (delay >= 120) result.notices.push(t('Circulation : +{0} min', Math.round(delay / 60)));
  result.alternates = routes.slice(1, 3).map((r) => ({ name: '', duration: r.travelTimeInSeconds }));
}

async function homeAssistant(result, route, options) {
  const base = String(options.hassURL ?? '').trim().replace(/\/+$/, ''), token = String(options.hassToken ?? '').trim();
  const entity = String(route.entity ?? '').trim();
  if (!base || !token) throw new BriefingError('Adresse ou jeton Home Assistant manquant');
  if (!/^[a-z_]+\.[a-z0-9_]+$/.test(entity)) throw new BriefingError("Indiquez l'entité du capteur (ex. sensor.waze_travail)");
  let data;
  try { data = await fetchJSON(`${base}/api/states/${entity}`, { Authorization: `Bearer ${token}` }); } catch (e) {
    if (e.status === 401) throw new BriefingError('Jeton Home Assistant refusé');
    if (e.status === 404) throw new BriefingError('Entité introuvable : {0}', entity);
    throw new BriefingError('Home Assistant : {0}', e.message);
  }
  const minutes = Number(data.state);
  if (!Number.isFinite(minutes)) throw new BriefingError('Capteur indisponible ({0})', data.state);
  const attrs = data.attributes ?? {};
  // Les capteurs de temps de trajet (Waze, Google…) donnent des minutes ; certains donnent des secondes.
  result.duration = ['s', 'sec'].includes(attrs.unit_of_measurement) ? minutes : minutes * 60;
  if (Number.isFinite(Number(attrs.distance))) result.distance = Number(attrs.distance) * 1000;
  if (typeof attrs.route === 'string') result.via = attrs.route;
}

export async function fetchCommute(options) {
  const routes = (options.routes ?? []).filter((r) => r.enabled);
  if (!routes.length) throw new BriefingError('Aucun trajet actif');
  const results = [];
  for (const route of routes) {
    const result = { id: route.id, name: route.name, mode: route.mode, via: '', duration: 0, distance: 0,
      notices: [], alternates: [], error: null };
    try {
      if (options.provider === 'hass') {
        await homeAssistant(result, route, options);
      } else {
        if (!String(route.from ?? '').trim() || !String(route.to ?? '').trim()) {
          throw new BriefingError('Indiquez un départ et une destination dans les réglages');
        }
        if (route.mode === 'transit') throw new BriefingError("Le transport en commun n'est pas offert par ce service");
        const a = await geocode(route.from, options), b = await geocode(route.to, options);
        if (options.provider === 'tomtom') await tomtom(result, a, b, route.mode, options.tomtomKey);
        else await osrm(result, a, b, route.mode);
      }
    } catch (error) {
      result.error = error.message ?? t('Erreur');
    }
    results.push(result);
  }
  return { routes: results, sourceErrors: {} };
}
