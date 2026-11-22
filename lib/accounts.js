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
import { defaultConfig, normalize, uuid, SECRET_MASK } from '../public/shared.js';

/**
 * Génération des sessions. L'augmenter lors d'un changement majeur de l'application (modèle de comptes,
 * sécurité) déconnecte tout le monde : chacun doit alors ressaisir son mot de passe une fois.
 */
export const AUTH_EPOCH = 1;

export const SESSION_COOKIE = 'lookout_session';
export const SESSION_MAX_AGE = 400 * 24 * 3600;   // secondes ; le maximum que les navigateurs acceptent
const ROLES = ['admin', 'user'];
/** Clés d'API qu'un administrateur peut fournir à tous les profils. */
export const SHARED_KEYS = ['tomtomKey', 'apiSportsKey'];

/** Une session est « en ligne » si la page a parlé au serveur depuis moins de deux minutes et demie. */
const ONLINE_MS = 150e3;

/** Nom lisible d'un appareil d'après ce que le navigateur annonce : « Chrome · Mac », « Safari · iPhone »… */
function deviceLabel(agent) {
  const a = String(agent ?? '');
  const device = /iPhone/.test(a) ? 'iPhone' : /iPad/.test(a) ? 'iPad' : /Android/.test(a) ? 'Android' : /Macintosh|Mac OS X/.test(a) ? 'Mac'
    : /Windows/.test(a) ? 'Windows' : /Linux/.test(a) ? 'Linux' : '';
  const browser = /OPR\//.test(a) ? 'Opera' : /Edg\//.test(a) ? 'Edge' : /Firefox\//.test(a) ? 'Firefox' : /CriOS|Chrome\//.test(a) ? 'Chrome'
    : /Safari\//.test(a) ? 'Safari' : '';
  return [browser, device].filter(Boolean).join(' · ') || 'Appareil inconnu';
}

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
  #dir; #users; #sessions; #shared; #profiles = new Map(); #attempts = new Map(); #sessionsDirty = false;

  constructor(dataDir) {
    this.#dir = dataDir;
    this.#users = readJSON(this.#file('users.json'), { users: [] }).users ?? [];
    this.#shared = readJSON(this.#file('shared-keys.json'), {});
    // Les sessions d'une autre génération sont écartées dès le chargement.
    const saved = readJSON(this.#file('sessions.json'), { epoch: AUTH_EPOCH, sessions: {} });
    this.#sessions = new Map(saved.epoch === AUTH_EPOCH ? Object.entries(saved.sessions ?? {}) : []);
    setInterval(() => this.#flushSessions(), 60e3).unref();
  }

  #file(...parts) { return path.join(this.#dir, ...parts); }
  #saveUsers() { writeJSON(this.#file('users.json'), { users: this.#users }); }
  #flushSessions(force = false) {
    if (!this.#sessionsDirty && !force) return;
    if (this.#sessionsDirty) this.#saveUsers();   // dernière visite de chaque compte
    this.#sessionsDirty = false;
    writeJSON(this.#file('sessions.json'), { epoch: AUTH_EPOCH, sessions: Object.fromEntries(this.#sessions) });
  }

  // --- Comptes ---

  get hasUsers() { return this.#users.length > 0; }
  user(id) { return this.#users.find((u) => u.id === id) ?? null; }
  /** Ce qu'on peut montrer d'un compte : jamais le mot de passe. */
  describe(user) { return { id: user.id, name: user.name, role: user.role, mustChangePassword: Boolean(user.mustChangePassword) }; }
  /** Les profils tels que les voit un administrateur : activité, appareils connectés, taille des réglages. */
  list() {
    const now = Date.now();
    return this.#users.map((u) => {
      const devices = [...this.#sessions.values()].filter((s) => s.userId === u.id).sort((x, y) => y.lastSeen - x.lastSeen)
        .map((s) => ({ label: deviceLabel(s.agent), since: s.createdAt, lastSeen: s.lastSeen, online: now - s.lastSeen < ONLINE_MS }));
      const config = this.profile(u.id).config;
      return { ...this.describe(u), createdAt: u.createdAt, lastSeen: Math.max(devices[0]?.lastSeen ?? 0, u.lastSeen ?? 0) || null, online: devices.some((d) => d.online),
        devices, sections: config.sections.length, pages: config.pages.length };
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
    // Mot de passe choisi par un administrateur pour quelqu'un d'autre : il est provisoire, la personne
    // devra choisir le sien à sa première connexion. (Le tout premier compte choisit lui-même le sien.)
    if (!first) user.mustChangePassword = true;
    if (copyFrom && !this.user(copyFrom)) throw new BriefingError('Profil introuvable');
    this.#users.push(user);
    this.#saveUsers();
    if (first) this.#adoptLegacyData(user.id);            // installation d'avant les comptes : le premier compte en hérite
    else if (copyFrom) this.copyProfile(copyFrom, user.id);
    return user;
  }

  /**
   * Modifie un compte. `keepToken` : session à conserver si le mot de passe change (l'appareil qui fait le changement).
   * `temporary` : le mot de passe est donné par un administrateur ; la personne devra le remplacer à sa prochaine connexion.
   */
  update(id, { name, role, password }, keepToken = null, temporary = false) {
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
      if (checkPassword(this.#validPassword(password), user.password)) throw new BriefingError("Le nouveau mot de passe doit être différent de l'ancien");
      user.password = hashPassword(password);
      if (temporary) user.mustChangePassword = true; else delete user.mustChangePassword;
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

  // --- Clés d'API partagées ---
  // Un administrateur peut fournir des clés (TomTom, API-Sports) à tous les profils. Elles servent quand un
  // profil n'a pas saisi la sienne ; personne ne peut les relire, pas même un administrateur.

  /** Quelles clés partagées existent (jamais leur valeur). */
  get sharedKeysSet() { return Object.fromEntries(SHARED_KEYS.map((k) => [k, Boolean(this.#shared[k])])); }
  sharedKey(name) { return SHARED_KEYS.includes(name) ? this.#shared[name] ?? '' : ''; }
  /** Enregistre les clés reçues. Le masque laisse la clé telle quelle ; une valeur vide la retire. */
  setSharedKeys(values) {
    for (const k of SHARED_KEYS) {
      const value = values?.[k];
      if (typeof value !== 'string' || value === SECRET_MASK) continue;
      if (value.length > 300) throw new BriefingError('Clé trop longue');
      if (value.trim()) this.#shared[k] = value.trim(); else delete this.#shared[k];
    }
    writeJSON(this.#file('shared-keys.json'), this.#shared);
    return this.sharedKeysSet;
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
    user.lastSeen = Date.now();
    this.#sessionsDirty = true;
    this.#sessions.set(sha256(token), { userId: user.id, createdAt: Date.now(), lastSeen: Date.now(), agent: String(agent).slice(0, 160) });
    this.#flushSessions(true);
    return token;
  }

  /** Compte associé à un jeton de session, ou null. Note l'activité, qui sert à savoir qui est en ligne (écrite sur disque au plus une fois par minute). */
  sessionUser(token) {
    if (!token) return null;
    const session = this.#sessions.get(sha256(token));
    const user = session && this.user(session.userId);
    if (!user) return null;
    if (Date.now() - session.lastSeen > 20e3) {
      // Gardé aussi sur le compte : la dernière visite reste connue une fois les appareils déconnectés.
      session.lastSeen = user.lastSeen = Date.now();
      this.#sessionsDirty = true;
    }
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
    profile = { config, readIDs: new Set(readJSON(this.#file('profiles', id, 'read.json'), [])),
      saved: readJSON(this.#file('profiles', id, 'saved.json'), []) };   // articles gardés « à lire plus tard »
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

  /** Garde un article « à lire plus tard » (en tête de liste), ou le retire. La liste est bornée à 200 articles. */
  keepArticle(id, article) {
    const text = (value, max) => String(value ?? '').slice(0, max);
    if (!article || typeof article.id !== 'string' || !/^https?:\/\//i.test(String(article.link))) throw new BriefingError('Article invalide');
    const entry = { id: text(article.id, 300), title: text(article.title, 300), link: text(article.link, 2000), source: text(article.source, 100),
      image: /^https?:\/\//i.test(String(article.image)) ? text(article.image, 2000) : '', date: Number(article.date) || null, savedAt: Date.now() };
    const profile = this.profile(id);
    profile.saved = [entry, ...profile.saved.filter((a) => a.id !== entry.id)].slice(0, 200);
    this.#writeSaved(id);
    return profile.saved;
  }
  dropArticles(id, articleIDs) {
    const profile = this.profile(id), drop = new Set(articleIDs);
    profile.saved = articleIDs === null ? [] : profile.saved.filter((a) => !drop.has(a.id));
    this.#writeSaved(id);
    return profile.saved;
  }
  #writeSaved(id) { writeJSON(this.#file('profiles', id, 'saved.json'), this.profile(id).saved); }

  // --- Notifications : appareils abonnés ---
  // Chaque abonnement est lié à la session de l'appareil : une fois celle-ci fermée (déconnexion, mot de passe
  // changé), l'appareil ne reçoit plus rien et son abonnement est oublié.

  #pushFile(id) { return this.#file('profiles', id, 'push.json'); }
  /** Abonnements encore valides d'un profil. */
  pushSubscriptions(id) {
    const all = readJSON(this.#pushFile(id), []);
    const alive = all.filter((s) => this.#sessions.has(s.session));
    if (alive.length !== all.length) writeJSON(this.#pushFile(id), alive);
    return alive;
  }
  addPush(id, token, subscription, lang) {
    const list = this.pushSubscriptions(id).filter((s) => s.endpoint !== subscription.endpoint);
    list.push({ ...subscription, session: sha256(token), lang: lang === 'en' ? 'en' : 'fr', createdAt: Date.now() });
    writeJSON(this.#pushFile(id), list.slice(-20));
  }
  removePush(id, endpoint) {
    writeJSON(this.#pushFile(id), this.pushSubscriptions(id).filter((s) => s.endpoint !== endpoint));
  }
  /** Profils qui ont au moins un appareil abonné, avec la langue de leurs notifications. */
  pushProfiles() {
    return this.#users.filter((u) => fs.existsSync(this.#pushFile(u.id))).map((u) => {
      const subscriptions = this.pushSubscriptions(u.id), config = this.profile(u.id).config;
      const lang = ['fr', 'en'].includes(config.general.language) ? config.general.language : subscriptions.at(-1)?.lang ?? 'fr';
      return { id: u.id, config, lang, subscriptions };
    }).filter((p) => p.subscriptions.length);
  }

  /** Remplace les réglages d'un profil par une copie de ceux d'un autre (clés comprises ; l'état de lecture n'est pas copié). */
  copyProfile(fromID, toID) {
    if (!this.user(fromID) || !this.user(toID)) throw new BriefingError('Profil introuvable');
    if (fromID === toID) throw new BriefingError('Choisissez un autre profil à copier');
    return this.saveConfig(toID, structuredClone(this.profile(fromID).config));
  }

  /** Dépose une copie d'une section (clés comprises) dans le profil d'un autre, à la suite de ses sections. */
  addSection(toID, section) {
    if (!this.user(toID)) throw new BriefingError('Profil introuvable');
    const config = structuredClone(this.profile(toID).config);
    // Nouvel identifiant, placement automatique : la copie vit ensuite sa vie dans le profil qui la reçoit.
    const copy = { ...structuredClone(section), id: uuid(), enabled: true, column: -1, page: config.pages[0]?.id ?? '' };
    config.sections.push(copy);
    this.saveConfig(toID, normalize(config));
    return copy.id;
  }

  // --- Sauvegarde complète ---

  /** Tout ce qu'il faut pour reconstruire l'installation : comptes, réglages de chaque profil (clés comprises), clés partagées. */
  exportAll() {
    return { format: 'lookout-backup', formatVersion: 1, createdAt: new Date().toISOString(),
      users: structuredClone(this.#users), sharedKeys: { ...this.#shared },
      profiles: Object.fromEntries(this.#users.map((u) => { const p = this.profile(u.id); return [u.id, { config: p.config, read: [...p.readIDs], saved: p.saved }]; })) };
  }

  /**
   * Remplace toute l'installation par le contenu d'une sauvegarde. Tout est vérifié avant de toucher au disque,
   * et les données en place sont mises de côté (data/avant-restauration-<date>/) plutôt que supprimées.
   * Toutes les sessions sont fermées : chacun se reconnecte avec le mot de passe qu'il avait dans la sauvegarde.
   */
  restoreAll(backup) {
    const invalid = () => new BriefingError("Ce fichier n'est pas une sauvegarde Lookout valide");
    if (backup?.format !== 'lookout-backup' || !Array.isArray(backup.users) || !backup.users.length) throw invalid();
    const users = [], profiles = new Map(), names = new Set();
    for (const u of backup.users) {
      // L'identifiant sert de nom de dossier : rien d'autre que des lettres, des chiffres et des tirets.
      if (typeof u?.id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(u.id) || profiles.has(u.id)) throw invalid();
      const name = String(u.name ?? '').trim();
      if (!name || name.length > 32 || names.has(name.toLowerCase()) || !ROLES.includes(u.role) || !/^scrypt:[0-9a-f]+:[0-9a-f]+$/.test(String(u.password))) throw invalid();
      names.add(name.toLowerCase());
      const user = { id: u.id, name, role: u.role, password: u.password, createdAt: Number(u.createdAt) || Date.now() };
      if (u.mustChangePassword) user.mustChangePassword = true;
      users.push(user);
      const saved = backup.profiles?.[u.id];
      let config;
      try { config = normalize(saved?.config ?? defaultConfig()); } catch { throw invalid(); }
      profiles.set(u.id, { config, read: (Array.isArray(saved?.read) ? saved.read : []).filter((x) => typeof x === 'string').slice(-4000),
        saved: (Array.isArray(saved?.saved) ? saved.saved : []).filter((a) => a && typeof a.id === 'string' && /^https?:\/\//i.test(String(a.link))).slice(0, 200) });
    }
    if (!users.some((u) => u.role === 'admin')) throw invalid();
    const shared = Object.fromEntries(SHARED_KEYS.map((k) => [k, backup.sharedKeys?.[k]]).filter(([, v]) => typeof v === 'string' && v.trim() && v.length <= 300));

    this.#flushSessions(true);
    const aside = this.#file(`avant-restauration-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    for (const name of ['users.json', 'sessions.json', 'shared-keys.json', 'profiles']) {
      if (!fs.existsSync(this.#file(name))) continue;
      fs.mkdirSync(aside, { recursive: true });
      fs.renameSync(this.#file(name), path.join(aside, name));
    }
    this.#users = users;
    this.#shared = shared;
    this.#sessions.clear();
    this.#profiles.clear();
    for (const [id, p] of profiles) {
      writeJSON(this.#file('profiles', id, 'config.json'), p.config);
      writeJSON(this.#file('profiles', id, 'read.json'), p.read);
      writeJSON(this.#file('profiles', id, 'saved.json'), p.saved);
    }
    writeJSON(this.#file('shared-keys.json'), shared);
    this.#saveUsers();
    this.#flushSessions(true);
    return { users: users.length };
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
