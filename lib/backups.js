// Sauvegardes automatiques : chaque nuit, toute l'installation est écrite dans data/backups/, et les plus anciennes
// sont retirées. Le fichier a le même format que la sauvegarde complète téléchargée depuis les réglages : il contient
// les clés d'API et les empreintes des mots de passe, d'où ses permissions restreintes.
import fs from 'node:fs';
import path from 'node:path';
import { BriefingError } from './util.js';

const NAME = /^lookout-(\d{4}-\d{2}-\d{2})\.json$/;
const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export class Backups {
  #dir; #accounts; #keep;
  constructor(dataDir, accounts, keep = 14) {
    this.#dir = path.join(dataDir, 'backups');
    this.#accounts = accounts;
    this.#keep = keep;
  }
  get keep() { return this.#keep; }

  #names() {
    try { return fs.readdirSync(this.#dir).filter((name) => NAME.test(name)).sort().reverse(); } catch { return []; }
  }

  /** Sauvegardes présentes, la plus récente d'abord. */
  list() {
    return this.#names().map((name) => {
      const file = path.join(this.#dir, name);
      let users = null, createdAt = null;
      try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); users = data.users?.length ?? null; createdAt = Date.parse(data.createdAt) || null; } catch { /* fichier abîmé : listé sans détails */ }
      return { name, day: NAME.exec(name)[1], size: fs.statSync(file).size, users, createdAt };
    });
  }

  /** Écrit la sauvegarde du jour (remplace celle déjà faite aujourd'hui) et retire les plus anciennes. */
  create() {
    if (!this.#accounts.hasUsers) return null;
    fs.mkdirSync(this.#dir, { recursive: true });
    const name = `lookout-${dayKey()}.json`, file = path.join(this.#dir, name), temp = `${file}.tmp`;
    // Écriture en deux temps : une panne en cours de route ne laisse jamais une sauvegarde tronquée.
    fs.writeFileSync(temp, JSON.stringify(this.#accounts.exportAll()), { mode: 0o600 });
    fs.renameSync(temp, file);
    for (const old of this.#names().slice(this.#keep)) fs.rmSync(path.join(this.#dir, old), { force: true });
    return name;
  }

  /** Contenu d'une sauvegarde, par son nom de fichier. */
  read(name) {
    if (!NAME.test(String(name))) throw new BriefingError('Sauvegarde introuvable');
    try { return JSON.parse(fs.readFileSync(path.join(this.#dir, name), 'utf8')); } catch { throw new BriefingError('Sauvegarde introuvable'); }
  }

  /** La sauvegarde du jour reste-t-elle à faire ? Oui passé 3 h du matin, ou si la dernière date de plus d'un jour. */
  due(now = new Date()) {
    const latest = this.#names()[0];
    if (latest === `lookout-${dayKey(now)}.json`) return false;
    const yesterday = new Date(now.getTime() - 86400e3);
    return now.getHours() >= 3 || latest !== `lookout-${dayKey(yesterday)}.json`;
  }

  /** Lance la surveillance : une vérification peu après le démarrage, puis toutes les vingt minutes. */
  start() {
    const check = () => {
      try { if (this.due()) { const name = this.create(); if (name) console.log(`Sauvegarde automatique écrite : backups/${name}`); } }
      catch (error) { console.error('Sauvegarde automatique impossible :', error.message); }
    };
    setTimeout(check, 30e3).unref();
    setInterval(check, 20 * 60e3).unref();
  }
}
