// Agenda : prochains événements de calendriers publiés au format iCalendar (.ics) — Google, iCloud, Outlook…
// Sans clé ni compte : chaque calendrier se lit par son adresse secrète. Les répétitions courantes sont développées.
import { BriefingError, fetchText, settle, Cache } from './util.js';

const cache = new Cache();
const DAY = 24 * 3600e3;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Décalage d'un fuseau à un instant donné, en millisecondes (heure locale − UTC). */
const formatters = new Map();
function zoneOffset(ms, zone) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formatters.set(zone, f);
  }
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
/** Instant réel d'une heure « au mur » (exprimée comme si elle était en UTC) dans un fuseau. */
function wallToUTC(wall, zone) {
  if (!zone) return wall;
  const first = wall - zoneOffset(wall, zone);
  return wall - zoneOffset(first, zone);   // second passage : corrige autour des changements d'heure
}
function validZone(name) {
  if (!name) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: name }); return name; } catch { return null; }
}

/** Décode une valeur de texte iCalendar (\n, \, \;). */
const unescape = (value) => value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/** Lit une date iCalendar. Renvoie { wall, zone, allDay } : `wall` est l'heure au mur, écrite comme un instant UTC. */
function readDate(value, params, fallbackZone) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  if (!m[4]) return { wall, zone: null, allDay: true };
  if (m[7]) return { wall, zone: null, allDay: false };   // déjà en UTC
  // Fuseau inconnu (noms propres à Outlook, par exemple) ou heure « flottante » : celui de l'installation.
  return { wall, zone: validZone(params.TZID) ?? fallbackZone, allDay: false };
}
const toInstant = (d) => (d.allDay ? d.wall : wallToUTC(d.wall, d.zone));

function readDuration(value) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return 0;
  const ms = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * DAY + +(m[4] ?? 0) * 3600e3 + +(m[5] ?? 0) * 60e3 + +(m[6] ?? 0) * 1000;
  return m[1] === '-' ? -ms : ms;
}

/** Découpe un fichier iCalendar en événements bruts : { NOM: [{ value, params }] }. */
export function parseICS(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let current = null, depth = 0, name = '';
  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) { current = {}; depth = 0; continue; }
    if (/^END:VEVENT$/i.test(line)) { if (current) events.push(current); current = null; continue; }
    if (!current) {
      const cal = /^X-WR-CALNAME[^:]*:(.*)$/i.exec(line);
      if (cal) name = unescape(cal[1]);
      continue;
    }
    // Alarmes et autres blocs imbriqués dans l'événement : ignorés.
    if (/^BEGIN:/i.test(line)) { depth++; continue; }
    if (/^END:/i.test(line)) { depth--; continue; }
    if (depth > 0) continue;
    const m = /^([A-Za-z0-9-]+)((?:;[^:;=]+=(?:"[^"]*"|[^:;]*))*):(.*)$/.exec(line);
    if (!m) continue;
    const params = {};
    for (const p of m[2].matchAll(/;([^=;]+)=("[^"]*"|[^;]*)/g)) params[p[1].toUpperCase()] = p[2].replace(/^"|"$/g, '');
    (current[m[1].toUpperCase()] ??= []).push({ value: m[3], params });
  }
  return { name, events };
}

/** Occurrences d'une règle de répétition (heures au mur) entre deux bornes. Couvre les règles courantes. */
function expand(start, rule, fromWall, toWall) {
  const parts = Object.fromEntries(rule.split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.toUpperCase(), v]));
  const freq = parts.FREQ, interval = Math.max(1, parseInt(parts.INTERVAL ?? '1', 10) || 1);
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return [start];
  let remaining = parts.COUNT ? parseInt(parts.COUNT, 10) : Infinity;
  const untilRaw = parts.UNTIL && /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(parts.UNTIL);
  // « UNTIL » est en UTC alors que l'on compte en heures au mur : une journée de marge évite d'écarter la dernière.
  const until = untilRaw ? Date.UTC(+untilRaw[1], +untilRaw[2] - 1, +untilRaw[3], +(untilRaw[4] ?? 23), +(untilRaw[5] ?? 59), +(untilRaw[6] ?? 59)) + (untilRaw[4] ? DAY : 0) : Infinity;
  const first = new Date(start), timeOfDay = start - Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const byDay = (parts.BYDAY ?? '').split(',').filter(Boolean).map((x) => /^([+-]?\d+)?([A-Z]{2})$/.exec(x)).filter(Boolean)
    .map((m) => ({ nth: m[1] ? parseInt(m[1], 10) : 0, day: WEEKDAYS.indexOf(m[2]) })).filter((x) => x.day >= 0);
  const byMonthDay = (parts.BYMONTHDAY ?? '').split(',').map((x) => parseInt(x, 10)).filter((x) => x && Math.abs(x) <= 31);
  const out = [];
  const emit = (wall) => {
    if (wall < start || wall > until || remaining <= 0) return wall <= until && remaining > 0;
    remaining--;
    if (wall >= fromWall && wall <= toWall) out.push(wall);
    return true;
  };
  const dayStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  // Jours d'un mois retenus par BYDAY (avec rang : « 2TU », « -1FR ») ou BYMONTHDAY.
  const monthDays = (y, m) => {
    const n = daysIn(y, m), days = new Set();
    for (const d of byMonthDay) { const day = d > 0 ? d : n + 1 + d; if (day >= 1 && day <= n) days.add(day); }
    for (const { nth, day } of byDay) {
      const matches = [];
      for (let d = 1; d <= n; d++) if (new Date(Date.UTC(y, m, d)).getUTCDay() === day) matches.push(d);
      if (!nth) matches.forEach((d) => days.add(d));
      else { const d = nth > 0 ? matches[nth - 1] : matches[matches.length + nth]; if (d) days.add(d); }
    }
    if (!byDay.length && !byMonthDay.length && first.getUTCDate() <= n) days.add(first.getUTCDate());
    return [...days].sort((a, b) => a - b);
  };

  // Sans « COUNT », inutile de parcourir les années passées : on saute juste avant la période demandée.
  const unit = freq === 'DAILY' ? interval * DAY : freq === 'WEEKLY' ? interval * 7 * DAY : 0;
  const skip = unit && remaining === Infinity ? Math.max(0, Math.floor((fromWall - dayStart) / unit) - 1) : 0;
  for (let step = skip, guard = 0; guard < 4000 && remaining > 0; step++, guard++) {
    let candidates;
    if (freq === 'DAILY') {
      const wall = dayStart + step * interval * DAY + timeOfDay;
      candidates = !byDay.length || byDay.some((x) => x.day === new Date(wall).getUTCDay()) ? [wall] : [];
      if (wall > Math.min(toWall, until)) break;
    } else if (freq === 'WEEKLY') {
      const weekStart = dayStart - first.getUTCDay() * DAY + step * interval * 7 * DAY;
      const days = byDay.length ? byDay.map((x) => x.day).sort((a, b) => a - b) : [first.getUTCDay()];
      candidates = days.map((d) => weekStart + d * DAY + timeOfDay);
      if (weekStart > Math.min(toWall, until)) break;
    } else if (freq === 'MONTHLY') {
      const index = first.getUTCMonth() + step * interval, y = first.getUTCFullYear() + Math.floor(index / 12), m = index % 12;
      candidates = monthDays(y, m).map((d) => Date.UTC(y, m, d) + timeOfDay);
      if (Date.UTC(y, m, 1) > Math.min(toWall, until)) break;
    } else {
      const y = first.getUTCFullYear() + step * interval, m = first.getUTCMonth();
      candidates = first.getUTCDate() <= daysIn(y, m) ? [Date.UTC(y, m, first.getUTCDate()) + timeOfDay] : [];
      if (Date.UTC(y, 0, 1) > Math.min(toWall, until)) break;
    }
    for (const wall of candidates) if (!emit(wall) && wall > until) return out;
  }
  return out;
}

/** Événements d'un calendrier dans la période, répétitions développées. */
export function eventsBetween(text, from, to, fallbackZone) {
  const { name, events: raw } = parseICS(text);
  const one = (e, key) => e[key]?.[0];
  // Occurrences modifiées à la main : elles remplacent celle que la règle de répétition aurait produite.
  const overridden = new Set();
  for (const e of raw) {
    const rid = one(e, 'RECURRENCE-ID'), uid = one(e, 'UID')?.value;
    const d = rid && readDate(rid.value, rid.params, fallbackZone);
    if (d && uid) overridden.add(`${uid}|${toInstant(d)}`);
  }
  const out = [];
  for (const e of raw) {
    const startProp = one(e, 'DTSTART');
    const start = startProp && readDate(startProp.value, startProp.params, fallbackZone);
    if (!start || /^CANCELLED$/i.test(one(e, 'STATUS')?.value ?? '')) continue;
    const endProp = one(e, 'DTEND'), end = endProp && readDate(endProp.value, endProp.params, fallbackZone);
    const length = end ? Math.max(0, end.wall - start.wall) : one(e, 'DURATION') ? Math.max(0, readDuration(one(e, 'DURATION').value)) : (start.allDay ? DAY : 0);
    const uid = one(e, 'UID')?.value ?? '', rule = one(e, 'RRULE')?.value, isOverride = Boolean(one(e, 'RECURRENCE-ID'));
    const excluded = new Set((e.EXDATE ?? []).flatMap((x) => x.value.split(',').map((v) => readDate(v, x.params, fallbackZone))).filter(Boolean).map(toInstant));
    // Marge d'un jour de chaque côté : les heures au mur et les instants réels diffèrent du décalage du fuseau.
    const walls = rule && !isOverride ? expand(start.wall, rule, from - length - DAY, to + DAY) : [start.wall];
    for (const wall of walls) {
      const at = toInstant({ ...start, wall }), until = start.allDay ? wall + length : toInstant({ ...start, wall: wall + length });
      if (at > to + DAY || until < from - DAY) continue;   // tri grossier ; fetchCalendar tranche selon le fuseau
      if (excluded.has(at) || (!isOverride && rule && overridden.has(`${uid}|${at}`))) continue;
      out.push({ id: `${uid}|${at}`, title: unescape(one(e, 'SUMMARY')?.value ?? ''), start: at, end: until, allDay: start.allDay,
        location: unescape(one(e, 'LOCATION')?.value ?? '').replace(/\n/g, ', '), link: /^https?:\/\//i.test(one(e, 'URL')?.value ?? '') ? one(e, 'URL').value : null });
    }
  }
  return { name, events: out };
}

/**
 * Événements à venir des calendriers d'une section.
 * `options` : { calendars: [{ id, name, url, enabled, colorHex }], days, showEnded }.
 */
export async function fetchCalendar(options, zone) {
  const calendars = (options.calendars ?? []).filter((c) => c.enabled !== false && String(c.url ?? '').trim());
  if (!calendars.length) throw new BriefingError("Ajoutez l'adresse d'un calendrier dans les réglages de la section");
  const fallbackZone = validZone(zone) ?? validZone(process.env.TZ) ?? 'UTC';
  const now = Date.now();
  // Début de la journée en cours dans le fuseau de l'installation : les événements d'aujourd'hui restent visibles.
  const offset = zoneOffset(now, fallbackZone), today = Math.floor((now + offset) / DAY) * DAY - offset;
  const from = options.showEnded ? today : now, to = today + Math.max(1, Number(options.days) || 7) * DAY;
  const fetched = await settle(calendars, async (c) => {
    // « webcal:// » est l'adresse d'abonnement habituelle : c'est le même fichier, servi en HTTPS.
    const url = String(c.url).trim().replace(/^webcal:\/\//i, 'https://');
    const text = cache.get(url, 10 * 60e3) ?? cache.set(url, await fetchText(url, { Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' }));
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new BriefingError("Cette adresse ne renvoie pas un calendrier (.ics)");
    return eventsBetween(text, from, to, fallbackZone);
  });
  const sourceErrors = {}, events = [];
  for (const { item, value, error } of fetched) {
    if (error) { sourceErrors[item.id] = error; continue; }
    for (const e of value.events) {
      // Journée entière : une date sans fuseau. On la garde telle quelle (minuit UTC) et le navigateur l'affiche sans conversion.
      if (e.allDay ? (e.end <= today + offset || e.start >= to + offset) : (e.end < from || e.start > to)) continue;
      events.push({ ...e, id: `${item.id}|${e.id}`, calendar: item.name || value.name || '', colorHex: item.colorHex || null });
    }
  }
  if (fetched.every((r) => r.error)) throw new BriefingError(fetched[0].error);
  events.sort((a, b) => a.start - b.start || Number(b.allDay) - Number(a.allDay) || a.title.localeCompare(b.title));
  return { events: events.slice(0, 200), zone: fallbackZone, sourceErrors };
}
