// Météo : API Open-Meteo (sans clé).
import { BriefingError, fetchJSON } from './util.js';
import { getLang } from '../public/i18n.js';

export async function searchPlaces(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: query, count: '8', language: 'fr' });
  const data = await fetchJSON(url);
  return (data.results ?? []).map((p) => ({
    id: p.id, latitude: p.latitude, longitude: p.longitude,
    label: [p.name, p.admin1, p.country].filter(Boolean).join(', '),
    shortLabel: [p.name, p.admin1].filter(Boolean).join(', '),
  }));
}

/**
 * Alertes en vigueur pour un point, d'après Environnement et Changement climatique Canada (API GeoMet).
 * Hors du Canada, ou si le service ne répond pas, la liste est simplement vide : la météo s'affiche quand même.
 */
async function fetchAlerts(latitude, longitude) {
  const fr = getLang() === 'fr', d = 0.02;
  const url = new URL('https://api.weather.gc.ca/collections/weather-alerts/items');
  url.search = new URLSearchParams({ f: 'json', limit: '20',
    bbox: [longitude - d, latitude - d, longitude + d, latitude + d].map((n) => n.toFixed(4)).join(',') });
  let data;
  try { data = await fetchJSON(url); } catch { return []; }
  const seen = new Set(), now = Date.now(), alerts = [];
  for (const feature of data.features ?? []) {
    const p = feature.properties ?? {};
    const expires = Date.parse(p.expiration_datetime ?? '') || null;
    const name = (fr ? p.alert_name_fr : p.alert_name_en) ?? p.alert_name_en ?? p.alert_name_fr;
    if (!name || (expires && expires < now) || /ended|terminé/i.test(`${p.status_en} ${p.status_fr}`) || seen.has(name)) continue;
    seen.add(name);
    const text = String((fr ? p.alert_text_fr : p.alert_text_en) ?? '').trim();
    alerts.push({ type: ['warning', 'watch', 'advisory', 'statement'].includes(p.alert_type) ? p.alert_type : 'statement',
      name: name.charAt(0).toUpperCase() + name.slice(1), summary: text.split(/\n\s*\n/)[0].slice(0, 300), text: text.slice(0, 2500),
      until: Date.parse(p.event_end_datetime ?? '') || expires });
  }
  // Les plus graves d'abord.
  const rank = { warning: 0, watch: 1, advisory: 2, statement: 3 };
  return alerts.sort((x, y) => rank[x.type] - rank[y.type]);
}

export async function fetchWeather(options, units) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  const params = {
    latitude: options.latitude, longitude: options.longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto', timeformat: 'unixtime', forecast_days: '10',
  };
  if (units === 'imperial') Object.assign(params, { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph' });
  url.search = new URLSearchParams(params);
  const [r, alerts] = await Promise.all([fetchJSON(url), options.showAlerts === false ? [] : fetchAlerts(options.latitude, options.longitude)]);
  if (!r.current || !r.hourly || !r.daily) throw new BriefingError('Réponse météo inattendue');

  const hours = r.hourly.time.map((t, i) => ({
    time: t * 1000, temperature: r.hourly.temperature_2m[i], code: r.hourly.weather_code[i] ?? 0,
    isDay: (r.hourly.is_day[i] ?? 1) === 1, pop: r.hourly.precipitation_probability[i] ?? 0,
  })).filter((h) => h.temperature != null && h.time > Date.now() - 3600e3).slice(0, 26);
  const days = r.daily.time.map((t, i) => ({
    date: t * 1000, code: r.daily.weather_code[i] ?? 0, low: r.daily.temperature_2m_min[i],
    high: r.daily.temperature_2m_max[i], pop: r.daily.precipitation_probability_max[i] ?? 0,
  })).filter((d) => d.low != null && d.high != null);

  return { weather: {
    timeZone: r.timezone, temperature: r.current.temperature_2m, apparent: r.current.apparent_temperature,
    humidity: Math.round(r.current.relative_humidity_2m), windSpeed: r.current.wind_speed_10m,
    code: r.current.weather_code, isDay: r.current.is_day === 1,
    sunrise: r.daily.sunrise?.[0] ? r.daily.sunrise[0] * 1000 : null,
    sunset: r.daily.sunset?.[0] ? r.daily.sunset[0] * 1000 : null,
    alerts, hours, days, temperatureUnit: units === 'imperial' ? '°F' : '°C', windUnit: units === 'imperial' ? 'mi/h' : 'km/h',
  }, sourceErrors: {} };
}
