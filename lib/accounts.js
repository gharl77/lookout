// Comptes, sessions et profils.
//
// Chaque utilisateur a un profil : ses propres réglages et son propre état de lecture, dans
// data/profiles/<id>/. Les comptes sont dans data/users.json (mots de passe hachés avec scrypt, jamais en
// clair) et les sessions ouvertes dans data/sessions.json (seule l'empreinte du jeton y est écrite).
//
// Une session dure : une fois connecté sur un appareil, on le reste, même après un redémarrage du serveur.
// Elle ne tombe que si l'on se déconnecte, si le mot de passe change, ou si AUTH_EPOCH est augmenté.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BriefingError } from './util.js';
import { defaultConfig, normalize, uuid } from '../public/shared.js';

/**
 * Génération des sessions. L'augmenter lors d'un changement majeur de l'application (modèle de comptes,
 * sécurité) déconnecte tout le monde : chacun doit alors ressaisir son mot de passe une fois.
 */
export const AUTH_EPOCH = 1;

export const SESSION_COOKIE = 'lookout_session';
export const SESSION_MAX_AGE = 400 * 24 * 3600;   // secondes ; le maximum que les navigateurs acceptent
const ROLES = ['admin', 'user'];

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt:${salt.toString('hex')}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function checkPassword(password, stored) {
  const [scheme, salt, hash] = String(stored ?? '').split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const given = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), expected.length);
  return crypto.timingSafeEqual(given, expected);
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export class Accounts {
  #dir; #users; #sessions; #profiles = new Map(); #attempts = new Map(); #sessionsDirty = false;

  constructor(dataDir) {
    this.#dir = dataDir;
    this.#users = readJSON(this.#file('users.json'), { users: [] }).users ?? [];
    // Les sessions d'une autre génération sont écartées dès le chargement.
    const saved = readJSON(this.#file('sessions.json'), { epoch: AUTH_EPOCH, sessions: {} });
    this.#sessions = new Map(saved.epoch === AUTH_EPOCH ? Object.entries(saved.sessions ?? {}) : []);
    setInterval(() => this.#flushSessions(), 60e3).unref();
  }

  #file(...parts) { return path.join(this.#dir, ...parts); }
  #saveUsers() { writeJSON(this.#file('users.json'), { users: this.#users }); }
  #flushSessions(force = false) {
    if (!this.#sessionsDirty && !force) return;
    this.#sessionsDirty = false;
    writeJSON(this.#file('sessions.json'), { epoch: AUTH_EPOCH, sessions: Object.fromEntries(this.#sessions) });
  }

  // --- Comptes ---

  get hasUsers() { return this.#users.length > 0; }
  user(id) { return this.#users.find((u) => u.id === id) ?? null; }
  /** Ce qu'on peut montrer d'un compte : jamais le mot de passe. */
  describe(user) { return { id: user.id, name: user.name, role: user.role }; }
  list() {
    return this.#users.map((u) => {
      const seen = [...this.#sessions.values()].filter((s) => s.userId === u.id).map((s) => s.lastSeen);
      return { ...this.describe(u), createdAt: u.createdAt, lastSeen: seen.length ? Math.max(...seen) : null,
        sections: this.profile(u.id).config.sections.length };
    });
  }
  /** Noms des profils, pour l'écran de connexion. */
  names() { return this.#users.map((u) => u.name); }

  #validName(name, exceptID = null) {
    const clean = String(name ?? '').trim();
    if (clean.length < 1 || clean.length > 32) throw new BriefingError('Le nom doit compter de 1 à 32 caractères');
    if (this.#users.some((u) => u.id !== exceptID && u.name.toLowerCase() === clean.toLowerCase())) throw new BriefingError('Ce nom est déjà utilisé');
    return clean;
  }
  #validPassword(password) {
    if (typeof password !== 'string' || password.length < 6) throw new BriefingError('Le mot de passe doit compter au moins 6 caractères');
    if (password.length > 200) throw new BriefingError('Mot de passe trop long');
    return password;
  }

  /** Crée un compte. `copyFrom` : identifiant du profil dont on reprend les réglages (sinon ceux de départ). */
  create({ name, password, role = 'user', copyFrom = null }) {
    const first = !this.hasUsers;
    const user = { id: uuid(), name: this.#validName(name), role: first || role === 'admin' ? 'admin' : 'user',
      password: hashPassword(this.#validPassword(password)), createdAt: Date.now() };
    if (copyFrom && !this.user(copyFrom)) throw new BriefingError('Profil introuvable');
    this.#users.push(user);
    this.#saveUsers();
    if (first) this.#adoptLegacyData(user.id);            // installation d'avant les comptes : le premier compte en hérite
    else if (copyFrom) this.copyProfile(copyFrom, user.id);
    return user;
  }

  /** Modifie un compte. `keepToken` : session à conserver si le mot de passe change (l'appareil qui fait le changement). */
  update(id, { name, role, password }, keepToken = null) {
    const user = this.user(id);
    if (!user) throw new BriefingError('Profil introuvable');
    if (name !== undefined) user.name = this.#validName(name, id);
    if (role !== undefined) {
      if (!ROLES.includes(role)) throw new BriefingError('Rôle invalide');
      if (user.role === 'admin' && role !== 'admin' && this.#users.filter((u) => u.role === 'admin').length < 2) {
        throw new BriefingError('Il doit rester au moins un administrateur');
      }
      user.role = role;
    }
    if (password !== undefined) {
      user.password = hashPassword(this.#validPassword(password));
      // Nouveau mot de passe : les autres appareils de ce compte doivent se reconnecter.
      this.endSessions(id, keepToken);
    }
    this.#saveUsers();
    return user;
  }

  remove(id, actingID) {
    const user = this.user(id);
    if (!user) throw new BriefingError('Profil introuvable');
    if (id === actingID) throw new BriefingError('Vous ne pouvez pas supprimer votre propre profil');
    if (user.role === 'admin' && this.#users.filter((u) => u.role === 'admin').length < 2) throw new BriefingError('Il doit rester au moins un administrateur');
    this.#users = this.#users.filter((u) => u.id !== id);
    this.#saveUsers();
    this.endSessions(id, null);
    this.#profiles.delete(id);
    // Le dossier du profil est mis de côté plutôt que détruit, au cas où la suppression serait une erreur.
    const dir = this.#file('profiles', id);
    if (fs.existsSync(dir)) fs.renameSync(dir, this.#file('profiles', `supprime-${id}`));
  }

  // --- Connexion ---

  /** Vérifie un nom et un mot de passe. Après 5 échecs en 10 minutes, la source est mise en attente 5 minutes. */
  login(name, password, source) {
    const key = `${source}|${String(name ?? '').toLowerCase()}`, now = Date.now();
    const attempt = this.#attempts.get(key) ?? { count: 0, first: now, until: 0 };
    if (attempt.until > now) throw Object.assign(new BriefingError('Trop de tentatives. Réessayez dans quelques minutes.'), { status: 429 });
    if (now - attempt.first > 10 * 60e3) Object.assign(attempt, { count: 0, first: now });
    const user = this.#users.find((u) => u.name.toLowerCase() === String(name ?? '').trim().toLowerCase());
    // Même temps de calcul que le nom existe ou non, pour ne pas révéler quels profils existent.
    const ok = checkPassword(password, user?.password ?? 'scrypt:00:00') && Boolean(user);
    if (!ok) {
      attempt.count++;
      if (attempt.count >= 5) attempt.until = now + 5 * 60e3;
      this.#attempts.set(key, attempt);
      throw Object.assign(new BriefingError('Nom ou mot de passe incorrect'), { status: 401 });
    }
    this.#attempts.delete(key);
    return user;
  }

  checkOwnPassword(id, password) { return checkPassword(password, this.user(id)?.password); }

  // --- Sessions ---

  startSession(user, agent = '') {
    const token = crypto.randomBytes(32).toString('base64url');
    this.#sessions.set(sha256(token), { userId: user.id, createdAt: Date.now(), lastSeen: Date.now(), agent: String(agent).slice(0, 160) });
    this.#flushSessions(true);
    return token;
  }

  /** Compte associé à un jeton de session, ou null. Note l'activité (écrite sur disque au plus une fois par minute). */
  sessionUser(token) {
    if (!token) return null;
    const session = this.#sessions.get(sha256(token));
    const user = session && this.user(session.userId);
    if (!user) return null;
    if (Date.now() - session.lastSeen > 60e3) { session.lastSeen = Date.now(); this.#sessionsDirty = true; }
    return user;
  }

  endSession(token) {
    if (token && this.#sessions.delete(sha256(token))) this.#flushSessions(true);
  }

  /** Ferme les sessions d'un compte ; `keepToken` : celle à conserver (l'appareil qui fait le changement). */
  endSessions(userId, keepToken) {
    const keep = keepToken ? sha256(keepToken) : null;
    for (const [hash, session] of this.#sessions) if (session.userId === userId && hash !== keep) this.#sessions.delete(hash);
    this.#flushSessions(true);
  }

  // --- Profils : réglages et état de lecture de chaque compte ---

  profile(id) {
    let profile = this.#profiles.get(id);
    if (profile) return profile;
    const file = this.#file('profiles', id, 'config.json');
    let config;
    try {
      config = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      if (fs.existsSync(file)) {
        // Fichier illisible : on le met de côté plutôt que de l'écraser.
        fs.renameSync(file, this.#file('profiles', id, 'config-illisible.json'));
        console.error(`Configuration illisible pour le profil ${id}, mise de côté :`, error.message);
      }
      config = normalize(defaultConfig());
      writeJSON(file, config);
    }
    profile = { config, readIDs: new Set(readJSON(this.#file('profiles', id, 'read.json'), [])) };
    this.#profiles.set(id, profile);
    return profile;
  }

  saveConfig(id, config) {
    writeJSON(this.#file('profiles', id, 'config.json'), config);
    this.profile(id).config = config;
    return config;
  }

  saveRead(id) {
    const profile = this.profile(id);
    // Garde l'historique borné : les plus anciens identifiants sont retirés en premier.
    if (profile.readIDs.size > 4000) profile.readIDs = new Set([...profile.readIDs].slice(-3000));
    fs.promises.writeFile(this.#file('profiles', id, 'read.json'), JSON.stringify([...profile.readIDs])).catch(() => {});
  }

  /** Remplace les réglages d'un profil par une copie de ceux d'un autre (clés comprises ; l'état de lecture n'est pas copié). */
  copyProfile(fromID, toID) {
    if (!this.user(fromID) || !this.user(toID)) throw new BriefingError('Profil introuvable');
    if (fromID === toID) throw new BriefingError('Choisissez un autre profil à copier');
    return this.saveConfig(toID, structuredClone(this.profile(fromID).config));
  }

  /**
   * Installation d'avant les comptes : ses fichiers (data/config.json, data/read.json) deviennent ceux du
   * premier compte. Ils sont copiés tels quels, clés comprises, puis mis de côté dans data/avant-les-comptes/
   * plutôt que supprimés : rien n'est perdu, même si la création du compte tournait mal.
   */
  #adoptLegacyData(id) {
    for (const name of ['config.json', 'read.json']) {
      const legacy = this.#file(name);
      if (!fs.existsSync(legacy)) continue;
      fs.mkdirSync(this.#file('profiles', id), { recursive: true });
      fs.copyFileSync(legacy, this.#file('profiles', id, name));
      fs.mkdirSync(this.#file('avant-les-comptes'), { recursive: true });
      fs.renameSync(legacy, this.#file('avant-les-comptes', name));
    }
  }
}
