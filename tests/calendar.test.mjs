// Agenda : lecture d'un fichier iCalendar, répétitions, exceptions et fuseaux.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseICS, eventsBetween } from '../lib/calendar.js';

const ics = (body) => `BEGIN:VCALENDAR\r\nX-WR-CALNAME:Essai\r\n${body.trim().replace(/\n/g, '\r\n')}\r\nEND:VCALENDAR\r\n`;
const ZONE = 'America/Toronto';
const from = Date.parse('2026-11-22T05:00:00Z'), to = from + 10 * 86400e3;   // du 22 novembre au 2 décembre, heure de l'Est
// eventsBetween trie large (un jour de marge) : comme fetchCalendar, on ne garde ici que la période exacte.
const titles = (text) => eventsBetween(text, from, to, ZONE).events.filter((e) => e.end >= from && e.start <= to).sort((a, b) => a.start - b.start).map((e) => `${new Date(e.start).toISOString()} ${e.title}`);

test('lignes repliées, texte échappé et blocs imbriqués', () => {
  const { name, events } = parseICS(ics(`BEGIN:VEVENT
UID:1
DTSTART:20261123T140000Z
SUMMARY:Réunion\\, équipe et
  partenaires
LOCATION:Salle A\\nÉtage 2
BEGIN:VALARM
SUMMARY:Rappel
END:VALARM
END:VEVENT`));
  assert.equal(name, 'Essai');
  assert.equal(events.length, 1);
  assert.equal(events[0].SUMMARY[0].value, 'Réunion\\, équipe et partenaires');
  assert.equal(events[0].SUMMARY.length, 1, "le titre de l'alarme ne remplace pas celui de l'événement");
});

test("heure locale d'un fuseau, y compris au changement d'heure", () => {
  const text = ics(`BEGIN:VEVENT
UID:1
DTSTART;TZID=America/Toronto:20261023T090000
RRULE:FREQ=WEEKLY;BYDAY=FR
SUMMARY:Hebdo
END:VEVENT`);
  const all = eventsBetween(text, Date.parse('2026-10-20T00:00:00Z'), Date.parse('2026-11-10T00:00:00Z'), ZONE).events.map((e) => new Date(e.start).toISOString());
  // 9 h reste 9 h : 13 h UTC en heure avancée, 14 h UTC après le 1er novembre.
  assert.deepEqual(all, ['2026-10-23T13:00:00.000Z', '2026-10-30T13:00:00.000Z', '2026-11-06T14:00:00.000Z']);
});

test('répétition hebdomadaire, exception et occurrence déplacée', () => {
  assert.deepEqual(titles(ics(`BEGIN:VEVENT
UID:a
DTSTART;TZID=America/Toronto:20260105T090000
DTEND;TZID=America/Toronto:20260105T100000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
EXDATE;TZID=America/Toronto:20261125T090000
SUMMARY:Réunion
END:VEVENT
BEGIN:VEVENT
UID:a
RECURRENCE-ID;TZID=America/Toronto:20261130T090000
DTSTART;TZID=America/Toronto:20261130T140000
SUMMARY:Réunion déplacée
END:VEVENT`)), ['2026-11-23T14:00:00.000Z Réunion', '2026-11-30T19:00:00.000Z Réunion déplacée']);
});

test('répétition mensuelle par rang, quotidienne ancienne, limites COUNT et UNTIL', () => {
  assert.deepEqual(titles(ics(`BEGIN:VEVENT
UID:m
DTSTART;TZID=America/Toronto:20260106T180000
RRULE:FREQ=MONTHLY;BYDAY=-1FR
SUMMARY:Dernier vendredi
END:VEVENT
BEGIN:VEVENT
UID:c
DTSTART:20261120T120000Z
RRULE:FREQ=DAILY;COUNT=4
SUMMARY:Quatre fois
END:VEVENT
BEGIN:VEVENT
UID:u
DTSTART:20261101T120000Z
RRULE:FREQ=DAILY;UNTIL=20261122T120000Z
SUMMARY:Jusqu'au 22
END:VEVENT`)).sort(), ["2026-11-22T12:00:00.000Z Jusqu'au 22", '2026-11-22T12:00:00.000Z Quatre fois', '2026-11-23T12:00:00.000Z Quatre fois', '2026-11-27T23:00:00.000Z Dernier vendredi']);
  // Une répétition commencée il y a des années atteint tout de même la période demandée.
  const old = eventsBetween(ics(`BEGIN:VEVENT
UID:o
DTSTART:20100310T150000Z
RRULE:FREQ=DAILY
SUMMARY:Quotidien
END:VEVENT`), from, to, ZONE).events;
  assert.ok(old.length >= 10);
});

test('journée entière, événement annulé, durée', () => {
  const { events } = eventsBetween(ics(`BEGIN:VEVENT
UID:j
DTSTART;VALUE=DATE:20261124
DTEND;VALUE=DATE:20261126
SUMMARY:Congé
END:VEVENT
BEGIN:VEVENT
UID:x
DTSTART:20261124T150000Z
STATUS:CANCELLED
SUMMARY:Annulé
END:VEVENT
BEGIN:VEVENT
UID:d
DTSTART:20261124T150000Z
DURATION:PT1H30M
SUMMARY:Durée
END:VEVENT`), from, to, ZONE);
  const day = events.find((e) => e.title === 'Congé'), timed = events.find((e) => e.title === 'Durée');
  assert.equal(events.length, 2);
  assert.equal(day.allDay, true);
  assert.equal(new Date(day.start).toISOString(), '2026-11-24T00:00:00.000Z');
  assert.equal(day.end - day.start, 2 * 86400e3);
  assert.equal(timed.end - timed.start, 90 * 60e3);
});
