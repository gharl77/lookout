#!/usr/bin/env node
// Produit les captures d'écran de la documentation (docs/images/<langue>/), à partir d'une instance NEUVE de
// Lookout qu'il remplit lui-même de données de démonstration. Aucune dépendance : Chrome est piloté par son
// protocole de débogage.
//
// Usage :
//   DATA_DIR=/tmp/lookout-demo PORT=8090 node server.js &
//   node scripts/doc-screenshots.mjs http://127.0.0.1:8090
//
// Les images des articles et les logos d'équipes sont désactivés dans la démonstration : les captures ne
// reprennent ainsi aucune photo de presse ni aucun logo.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig, normalize, youtubeSection, youtubeFeedURL, feedSource, newPage, categorySection, FEED_CATALOG } from '../public/shared.js';
import { EN } from '../public/i18n.js';

const base = (process.argv[2] ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ADMIN = { name: 'Alex', password: 'demo-lookout-1' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Petit client HTTP avec témoin de session, pour préparer les données ---
let cookie = '';
async function call(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(base + pathname, { method, headers: { 'X-Requested-With': 'lookout', Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const set = response.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${pathname} : ${data.error ?? response.status}`);
  return data;
}

/** Tableau de bord de démonstration, dans la langue demandée. */
function demoConfig(lang) {
  const tr = (text) => (lang === 'en' ? EN[text] ?? text : text);
  const config = normalize(defaultConfig());
  Object.assign(config.general, { onboarded: true, displayName: 'Alex', appearance: 'light', language: lang });
  const second = newPage(tr('Loisirs'));
  config.pages.push(second);
  for (const s of config.sections) {
    s.title = tr(s.title);
    s.feed.showImages = false;
    s.sports.showLogos = false;
    for (const lg of s.sports.leagues) { lg.name = tr(lg.name); lg.teams = [{ id: 'MTL', name: 'Montreal Canadiens', logo: null }]; }
    for (const route of s.commute.routes) route.name = tr(route.name);
  }
  const youtube = youtubeSection();
  youtube.page = second.id;
  youtube.feed.sources = [feedSource('NASA', youtubeFeedURL('UCLA_DiR1FfKNvjuUpBHmylQ')), feedSource('NASA Jet Propulsion Laboratory', youtubeFeedURL('UCryGec9PdUCLjpJW2mgCuLw'))];
  const extras = ['Films', 'Science'].map((name) => {
    const s = categorySection(FEED_CATALOG.find((c) => c.name === name), lang);
    Object.assign(s, { title: tr(s.title), page: second.id });
    s.feed.showImages = false;
    return s;
  });
  // Une source volontairement morte, pour la rubrique « État des sources ».
  extras[1].feed.sources.push(feedSource(tr('Ancien fil'), 'https://fil-disparu.invalid/rss'));
  config.sections.push(youtube, ...extras);
  return normalize(config);
}

// --- Chrome, piloté par son protocole de débogage ---
async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lookout-captures-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run',
    '--disable-extensions', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await (await fetch('http://127.0.0.1:9333/json/version')).json(); break; } catch { await sleep(200); }
  }
  const target = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  const waiting = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const { resolve, reject } = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { waiting.set(++next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    send,
    // Chrome finit d'écrire dans son profil temporaire en se fermant : le ménage attend un instant, sans insister.
    close: async () => { socket.close(); chrome.kill(); await sleep(1500); try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 }); } catch { /* le système videra son dossier temporaire */ } },
    viewport: (width, height, scale = 1.5, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile }),
    async open(url, wait = 6000) { await send('Page.navigate', { url: base + url }); await sleep(wait); },
    /** Exécute du JavaScript dans la page et attend son résultat. */
    async run(expression) {
      const result = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    },
    async shot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      console.log('  ', path.relative(ROOT, file), `${Math.round(fs.statSync(file).size / 1024)} Ko`);
    },
  };
}

// Morceaux de script exécutés dans la page.
const CLICK = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => ${text ? `el.textContent.trim() === ${JSON.stringify(text)}` : 'true'})?.click();`;
const WAIT = (ms) => `await new Promise((resolve) => setTimeout(resolve, ${ms}));`;
const LOGIN = (name, password) => `await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lookout' }, body: JSON.stringify({ name: ${JSON.stringify(name)}, password: ${JSON.stringify(password)} }) });`;
const LOGOUT = `await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lookout' }, body: '{}' });`;
const CLOSE = `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); [...document.querySelectorAll('.dialog .btn.primary, .settings-head .btn.primary')].pop()?.click();`;

async function capture(lang, browser, newcomer) {
  const out = path.join(ROOT, 'docs', 'images', lang);
  fs.mkdirSync(out, { recursive: true });
  const tr = (text) => (lang === 'en' ? EN[text] ?? text : text);
  const file = (name) => path.join(out, `${name}.jpg`);
  console.log(`\nCaptures — ${lang}`);

  await call('/api/config', { method: 'PUT', body: demoConfig(lang) });
  await call('/api/saved', { method: 'POST', body: { clear: true } });
  await browser.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    acceptLanguage: lang === 'en' ? 'en-CA,en' : 'fr-CA,fr' });
  await browser.send('Emulation.setLocaleOverride', { locale: lang === 'en' ? 'en-CA' : 'fr-CA' }).catch(() => {});
  await browser.viewport(1280, 820);

  // Écran de connexion
  await browser.open('/', 1500);
  await browser.run(LOGOUT);
  await browser.open('/', 1500);
  await browser.shot(file('connexion'));

  // Tableau de bord
  await browser.run(LOGIN(ADMIN.name, ADMIN.password));
  await browser.open('/', 9000);
  await browser.shot(file('tableau-de-bord'));

  // Menu d'une carte
  await browser.run(`const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('.row')); card.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); ${WAIT(300)} [...card.querySelectorAll('.card-head button')].pop().click(); ${WAIT(400)}`);
  await browser.shot(file('menu-carte'));
  await browser.run(`document.body.click(); ${CLOSE} window.scrollTo(0, 0); ${WAIT(300)}`);

  // Mode Organiser
  await browser.run(`document.getElementById('btn-edit').click(); ${WAIT(500)}`);
  await browser.shot(file('organiser'));
  await browser.run(`document.getElementById('btn-edit').click(); ${WAIT(300)}`);

  // À lire plus tard : on garde trois articles, puis on ouvre la liste
  await browser.run(`for (const button of [...document.querySelectorAll('.row-save')].slice(0, 3)) { button.click(); ${WAIT(500)} } document.getElementById('btn-saved').click(); ${WAIT(500)}`);
  await browser.shot(file('a-lire-plus-tard'));
  await browser.run(CLOSE + WAIT(300));

  // Recherche
  await browser.run(`document.getElementById('btn-search').click(); ${WAIT(500)} const input = document.querySelector('.search-input'); input.value = ${JSON.stringify(lang === 'en' ? 'canada' : 'québec')}; input.dispatchEvent(new Event('input', { bubbles: true })); ${WAIT(5000)}`);
  await browser.shot(file('recherche'));
  await browser.run(CLOSE + WAIT(300));

  // Deuxième page : YouTube et fils par catégorie
  await browser.run(`${CLICK('.page-tab', tr('Loisirs'))} ${WAIT(7000)}`);
  await browser.shot(file('youtube'));

  // Réglages
  const pane = async (label, name, wait = 700, extra = '') => {
    await browser.run(`${CLICK('.s-nav-item', tr(label))} ${WAIT(wait)} ${extra}`);
    await browser.shot(file(name));
  };
  await browser.run(`${CLICK('.page-tab', tr('Accueil'))} ${WAIT(1500)} document.getElementById('btn-settings').click(); ${WAIT(800)}`);
  await browser.shot(file('reglages-sections'));
  await browser.run(`document.querySelectorAll('.s-item')[1].click(); ${WAIT(500)}`);
  await browser.shot(file('reglages-fils'));
  await pane('Apparence', 'reglages-apparence');
  await pane('Lecture et filtres', 'reglages-lecture');
  await pane('Notifications', 'reglages-notifications', 1500);
  await pane('Mode affichage', 'reglages-affichage');
  await pane('Profils', 'reglages-profils', 1800);
  await pane('Clés partagées', 'reglages-cles', 1800);
  await pane('État des sources', 'reglages-sources', 1800);
  await pane('Sauvegarde', 'reglages-sauvegarde');
  await browser.run(CLOSE + WAIT(400));

  // Mode affichage
  await browser.open('/?affichage=1', 7000);
  await browser.shot(file('mode-affichage'));

  // Téléphone
  await browser.viewport(390, 844, 2, true);
  await browser.open('/', 7000);
  await browser.shot(file('telephone-tableau-de-bord'));
  await browser.run(`document.getElementById('btn-settings').click(); ${WAIT(800)}`);
  await browser.shot(file('telephone-reglages'));
  await browser.run(`${CLICK('.s-nav-item', tr('Apparence'))} ${WAIT(600)}`);
  await browser.shot(file('telephone-reglages-rubrique'));
  await browser.viewport(1280, 820);

  // Nouveau profil : mot de passe provisoire, puis questions d'accueil
  await browser.run(LOGOUT + LOGIN(newcomer.name, newcomer.password));
  await browser.open('/', 2000);
  await browser.shot(file('mot-de-passe-provisoire'));
  await browser.run(`await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'lookout' }, body: JSON.stringify({ next: 'demo-accueil-2' }) });`);
  // Même présentation que le reste : thème clair, sans photos de presse derrière la fenêtre d'accueil.
  await browser.run(`const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'lookout' }; const config = await (await fetch('/api/config')).json();
    config.general.appearance = 'light'; config.general.language = ${JSON.stringify(lang)}; for (const s of config.sections) { s.feed.showImages = false; s.sports.showLogos = false; }
    await fetch('/api/config', { method: 'PUT', headers, body: JSON.stringify(config) });`);
  await browser.open('/', 7000);
  await browser.shot(file('accueil-1'));
  await browser.run(`${CLICK('.onboarding .btn.primary')} ${WAIT(500)}`);
  await browser.shot(file('accueil-2'));
  await browser.run(LOGOUT);
}

// --- Déroulement ---
const state = await call('/api/auth/state');
if (!state.setup) throw new Error(`${base} a déjà un compte : lancez ce script sur une instance neuve (dossier de données vide).`);
await call('/api/auth/setup', { method: 'POST', body: ADMIN });
const newcomers = { fr: { name: 'Camille', password: 'bienvenue-1' }, en: { name: 'Sam', password: 'welcome-12' } };
for (const person of Object.values(newcomers)) await call('/api/users', { method: 'POST', body: person });
await call('/api/shared-keys', { method: 'PUT', body: { tomtomKey: 'demonstration', tmdbKey: 'demonstration', anthropicKey: 'demonstration' } });

const browser = await launchChrome();
try {
  for (const lang of ['fr', 'en']) await capture(lang, browser, newcomers[lang]);
} finally { await browser.close(); }
console.log('\nTerminé.');
