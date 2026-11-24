// Sauvegardes automatiques : une par jour, les plus anciennes retirées, noms de fichiers contrôlés.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Backups } from '../lib/backups.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lookout-backups-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const accounts = { hasUsers: true, exportAll: () => ({ format: 'lookout-backup', createdAt: new Date().toISOString(), users: [{ id: 'a' }, { id: 'b' }] }) };
const day = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test('une sauvegarde est écrite, listée et relue', () => {
  const backups = new Backups(dir, accounts, 3);
  assert.equal(backups.due(new Date(2026, 10, 23, 4)), true);
  const name = backups.create();
  assert.equal(name, `lookout-${day(new Date())}.json`);
  const [file] = backups.list();
  assert.equal(file.users, 2);
  assert.equal(backups.read(name).format, 'lookout-backup');
  assert.equal(fs.statSync(path.join(dir, 'backups', name)).mode & 0o077, 0);   // lisible par le serveur seulement
  assert.equal(backups.due(new Date()), false);
});

test('seules les plus récentes sont gardées', () => {
  const backups = new Backups(dir, accounts, 3);
  for (const old of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']) fs.writeFileSync(path.join(dir, 'backups', `lookout-${old}.json`), '{}');
  backups.create();
  const names = backups.list().map((f) => f.name);
  assert.equal(names.length, 3);
  assert.equal(names[0], `lookout-${day(new Date())}.json`);
  assert.ok(!names.includes('lookout-2026-01-01.json'));
});

test('un nom de fichier fantaisiste est refusé', () => {
  const backups = new Backups(dir, accounts);
  assert.throws(() => backups.read('../users.json'), /introuvable/);
  assert.throws(() => backups.read('lookout-2020-01-01.json'), /introuvable/);
});

test('avant 3 h, la sauvegarde de la veille suffit ; sans compte, rien n’est écrit', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lookout-backups-'));
  const backups = new Backups(empty, { hasUsers: false, exportAll: () => ({}) });
  assert.equal(backups.create(), null);
  fs.mkdirSync(path.join(empty, 'backups'));
  fs.writeFileSync(path.join(empty, 'backups', 'lookout-2026-11-22.json'), '{}');
  assert.equal(backups.due(new Date(2026, 10, 23, 1)), false);
  assert.equal(backups.due(new Date(2026, 10, 23, 3, 5)), true);
  assert.equal(backups.due(new Date(2026, 10, 25, 1)), true);   // plus d'un jour de retard : on n'attend pas
  fs.rmSync(empty, { recursive: true, force: true });
});
