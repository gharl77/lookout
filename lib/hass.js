// Home Assistant : états d'entités choisies par le profil, lus avec un jeton d'accès longue durée.
// Le jeton reste sur le serveur ; le navigateur ne reçoit que les états.
import { BriefingError, fetchJSON, checkURL, settle } from './util.js';
import { HASS_ACTIONS } from '../public/shared.js';

const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;

function access(options) {
  const base = String(options.url ?? '').trim().replace(/\/+$/, ''), token = String(options.token ?? '').trim();
  if (!base || !token) throw new BriefingError('Adresse ou jeton Home Assistant manquant');
  checkURL(base);
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

/** Traduit les refus de Home Assistant en messages clairs. */
function explain(error, entity = '') {
  if (error.status === 401 || error.status === 403) return new BriefingError('Jeton Home Assistant refusé');
  if (error.status === 404 && entity) return new BriefingError('Entité introuvable : {0}', entity);
  return new BriefingError('Home Assistant : {0}', error.message);
}

/** Ce que la carte affiche d'une entité : rien d'autre ne quitte le serveur. */
function describe(raw) {
  const attrs = raw.attributes ?? {}, entity = String(raw.entity_id), domain = entity.split('.')[0];
  const number = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
  return { entity, domain, name: String(attrs.friendly_name ?? entity).slice(0, 80), state: String(raw.state ?? '').slice(0, 60),
    unit: String(attrs.unit_of_measurement ?? '').slice(0, 12), deviceClass: String(attrs.device_class ?? '').slice(0, 30),
    // Thermostat : température mesurée et consigne. Aspirateur, tondeuse : niveau de batterie.
    current: number(attrs.current_temperature), target: number(attrs.temperature), battery: number(attrs.battery_level),
    changed: Date.parse(raw.last_changed ?? '') || null, action: HASS_ACTIONS[domain] ?? null };
}

/** États des entités activées d'une section, dans l'ordre choisi. */
export async function fetchHass(options) {
  const { base, headers } = access(options);
  const wanted = (options.entities ?? []).filter((e) => e.enabled !== false && String(e.entity ?? '').trim());
  if (!wanted.length) throw new BriefingError('Choisissez au moins une entité dans les réglages de la section');
  const entities = [], sourceErrors = {};
  const results = await settle(wanted, async (item) => {
    const id = String(item.entity).trim().toLowerCase();
    if (!ENTITY.test(id)) throw new BriefingError('Entité invalide : {0}', id);
    try { return await fetchJSON(`${base}/api/states/${id}`, headers); } catch (error) { throw explain(error, id); }
  });
  for (const r of results) {
    if (r.error) sourceErrors[r.item.id] = r.error;
    else entities.push({ id: r.item.id, ...describe(r.value) });
  }
  // Rien n'a répondu : c'est l'adresse ou le jeton, pas une entité en particulier.
  if (!entities.length) throw new BriefingError('{0}', Object.values(sourceErrors)[0]);
  return { entities, sourceErrors };
}

/** Entités de Home Assistant qui contiennent le texte cherché (nom ou identifiant), pour le choix dans les réglages. */
export async function searchHass(options, query) {
  const { base, headers } = access(options);
  let all;
  try { all = await fetchJSON(`${base}/api/states`, headers); } catch (error) { throw explain(error); }
  if (!Array.isArray(all)) throw new BriefingError('Réponse inattendue de Home Assistant');
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return all.map(describe)
    .filter((e) => { const text = `${e.name} ${e.entity}`.toLowerCase(); return words.every((w) => text.includes(w)); })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .slice(0, 80)
    .map(({ entity, domain, name, state, unit }) => ({ entity, domain, name, state, unit }));
}

/** Actionne une entité (bascule une lumière, lance une scène…). Seuls les domaines de HASS_ACTIONS sont permis. */
export async function callHass(options, entity) {
  const { base, headers } = access(options);
  const id = String(entity ?? '').trim().toLowerCase(), domain = id.split('.')[0], service = HASS_ACTIONS[domain];
  if (!ENTITY.test(id) || !service) throw new BriefingError('Cette entité ne peut pas être actionnée depuis Lookout');
  let response;
  try {
    response = await fetch(`${base}/api/services/${domain}/${service}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: id }), signal: AbortSignal.timeout(8000) });
  } catch { throw new BriefingError('Home Assistant : {0}', 'Serveur introuvable ou connexion impossible'); }
  if (!response.ok) throw explain(Object.assign(new Error(`HTTP ${response.status}`), { status: response.status }), id);
  // Home Assistant répond avant que l'appareil ait changé d'état : on lui laisse un instant.
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { ok: true };
}
