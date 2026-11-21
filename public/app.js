// Briefing — tableau de bord.
import { h, icon, badge, fmt, t, api, openMenu, confirmDialog, hasOverlay } from './ui.js';
import { setLangProvider, resolveLang } from './i18n.js';
import { cardBody, shownArticles, countNew, WMO } from './cards.js';
import { KINDS, template, fetchSignature } from './shared.js';
import { openSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

// Préférences propres à cet appareil (page affichée, heure de la dernière visite). Le stockage peut être
// refusé par le navigateur (navigation privée) : dans ce cas on s'en passe.
function remembered(key) { try { return localStorage.getItem(key); } catch { return null; } }
function remember(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* stockage indisponible */ } }
const state = {
  config: null,
  data: new Map(),        // id de section -> réponse du serveur
  loading: new Set(),
  signatures: new Map(),  // id de section -> empreinte des dernières données demandées
  readIDs: new Set(),
  editing: false,
  page: remembered('lookout.page'),
  lastRefresh: null,
};
const cards = new Map();  // id de section -> élément de carte

const general = () => state.config.general;
const pages = () => state.config.pages;
/** Page affichée : celle retenue sur cet appareil, sinon la première. */
function currentPage() {
  const list = pages();
  return (list.find((p) => p.id === state.page) ?? list[0]).id;
}
/** Sections affichées : celles de la page courante qui ne sont pas masquées. */
const visible = () => { const page = currentPage(); return state.config.sections.filter((s) => s.enabled && s.page === page); };
const section = (id) => state.config.sections.find((s) => s.id === id);

// --- Langue ---
let language = 'fr';
setLangProvider(() => language);
function applyLanguage() {
  const next = resolveLang(general().language, navigator.languages ?? [navigator.language]);
  const changed = next !== language;
  language = next;
  document.documentElement.lang = language;
  for (const [id, label] of [['btn-refresh', 'Actualiser'], ['btn-edit', 'Organiser'], ['btn-settings', 'Réglages']]) $(id).setAttribute('aria-label', t(label));
  $('btn-refresh').title = t('Recharger les sections (les sources sont interrogées selon leur intervalle)');
  $('btn-edit').title = t('Réorganiser, redimensionner ou masquer les sections');
  $('btn-settings').title = t('Configurer les sections et les sources');
  return changed;
}

// --- Thème ---
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const g = general(), root = document.documentElement;
  const dark = g.appearance === 'dark' || (g.appearance === 'system' && darkQuery.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.density = g.density;
  root.dataset.tinted = String(g.tintedBackdrop);
  root.style.setProperty('--accent', g.accentHex);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = dark ? '#1c1c1e' : '#f5f5f7';
}
darkQuery.addEventListener('change', () => state.config && applyTheme());

// --- Enregistrement de la configuration ---
let saveTimer = null, savePromise = Promise.resolve();
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const snapshot = JSON.stringify(state.config);
  savePromise = savePromise.then(() => api('/api/config', { method: 'PUT', body: JSON.parse(snapshot) }))
    .catch((error) => showSubtitle(t('Enregistrement impossible : {0}', error.message)));
  return savePromise;
}

let renderTimer = null, syncTimer = null;
/** À appeler après toute modification de la configuration. */
function commit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderAll, 120);
  clearTimeout(syncTimer);
  // Ne recharge que les sections dont les sources ont changé, une fois la saisie terminée.
  syncTimer = setTimeout(async () => {
    await (saveTimer ? saveNow() : savePromise);
    for (const s of visible()) {
      if (state.signatures.get(s.id) !== fetchSignature(s, general().units)) loadSection(s.id);
    }
  }, 900);
}

// --- Données ---
async function loadSection(id, force = false) {
  const s = section(id);
  if (!s) return;
  const signature = fetchSignature(s, general().units);
  state.signatures.set(id, signature);
  state.loading.add(id);
  renderCard(id);
  updateToolbar();
  let payload;
  // « force » : mise à jour immédiate demandée pour cette section seulement (le serveur la limite à une par minute).
  try { payload = await api(`/api/section/${encodeURIComponent(id)}${force ? '?force=1' : ''}`); }
  catch (error) { payload = { ...(state.data.get(id) ?? {}), error: error.message, sourceErrors: {} }; }
  if (state.signatures.get(id) !== signature) return;   // une demande plus récente est en cours
  state.data.set(id, payload);
  state.loading.delete(id);
  renderCard(id);
  renderHero();
  updateToolbar();
}

function refreshAll() {
  state.lastRefresh = Date.now();
  for (const s of visible()) loadSection(s.id);
  updateToolbar();
}

let refreshTimer = null;
function restartTimer() {
  clearInterval(refreshTimer);
  // Vérifie toutes les 30 secondes : le serveur ne réinterroge une source que lorsque son intervalle est écoulé.
  refreshTimer = setInterval(() => {
    if (document.hidden) return;
    const due = visible().filter((s) => (state.data.get(s.id)?.nextUpdateAt ?? 0) <= Date.now() && !state.loading.has(s.id));
    for (const s of due) loadSection(s.id);
    updateToolbar();
    checkVersion();
  }, 30e3);
}
// Au retour dans l'app (iPhone réveillé, onglet réaffiché), rattrape une actualisation manquée.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.config) { refreshAll(); checkVersion(); }
});

// --- Lecture des articles ---
function setRead(ids, read) {
  for (const id of ids) read ? state.readIDs.add(id) : state.readIDs.delete(id);
  api('/api/read', { method: 'POST', body: read ? { add: ids } : { remove: ids } }).catch(() => {});
  for (const s of visible()) if (state.data.get(s.id)?.articles) renderCard(s.id);
}
// --- Nouveautés depuis la dernière visite ---
// Un article est « nouveau » s'il est paru après votre départ précédent de cette page, sur cet appareil.
// Le repère n'avance que si vous êtes parti au moins 10 minutes : un aller-retour rapide ne l'efface pas.
let newSince = Number(remembered('lookout.newSince')) || 0;
function noteDeparture() { remember('lookout.leftAt', Date.now()); }
/** Au retour (ouverture de la page ou onglet réaffiché) : avance le repère si l'absence a duré. */
function noteReturn() {
  const leftAt = Number(remembered('lookout.leftAt')) || 0;
  if (!leftAt || Date.now() - leftAt < 10 * 60e3 || leftAt <= newSince) return false;
  newSince = leftAt;
  remember('lookout.newSince', newSince);
  return true;
}
noteReturn();
window.addEventListener('pagehide', noteDeparture);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) noteDeparture();
  else if (noteReturn() && state.config) renderAll();
});

const ctx = { get general() { return general(); }, isRead: (id) => state.readIDs.has(id), setRead,
  isNew: (article) => Boolean(newSince && article.date && article.date > newSince && !state.readIDs.has(article.id)) };

// --- Barre supérieure et en-tête ---
function showSubtitle(text) { $('subtitle').textContent = text; }
/** « Mis à jour à 14 h 05 · prochaine à 14 h 35 » : l'heure réelle des données, pas celle du dernier clic. */
function freshness() {
  const payloads = visible().map((s) => state.data.get(s.id)).filter(Boolean);
  const updated = Math.max(0, ...payloads.map((p) => p.updatedAt ?? 0));
  const next = Math.min(...payloads.map((p) => p.nextUpdateAt ?? Infinity));
  if (!updated) return '';
  return Number.isFinite(next) && next > Date.now() ? t('Mis à jour à {0} · prochaine à {1}', fmt.time(updated), fmt.time(next)) : t('Mis à jour à {0}', fmt.time(updated));
}

function updateToolbar() {
  const busy = state.loading.size > 0;
  $('btn-refresh').classList.toggle('spinning', busy);
  showSubtitle(busy ? t('Actualisation…') : freshness());
  $('btn-edit').setAttribute('aria-pressed', String(state.editing));
}

function renderHero() {
  const g = general(), hero = $('hero');
  hero.replaceChildren();
  if (!g.showGreeting) return;
  const now = new Date(), hour = now.getHours();
  const greeting = t(hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir');
  const name = g.displayName.trim();
  hero.append(h('div', {}, h('div', { class: 'hero-date' }, fmt.longDate(now)),
    h('h1', { class: 'hero-greeting' }, name ? `${greeting}, ${name}` : greeting)));
  if (!g.showGlance) return;
  // Résumé en un coup d'œil : météo et premier trajet.
  const chips = [];
  const w = visible().filter((s) => s.kind === 'weather').map((s) => state.data.get(s.id)?.weather).find(Boolean);
  if (w) chips.push(h('span', { class: 'chip' }, WMO.icon(w.code, w.isDay), h('span', {}, `${Math.round(w.temperature)}° · ${WMO.label(w.code)}`)));
  const route = visible().filter((s) => s.kind === 'commute').flatMap((s) => state.data.get(s.id)?.routes ?? []).find((r) => !r.error);
  if (route) chips.push(h('span', { class: 'chip' }, icon(route.mode === 'walking' ? 'walk' : route.mode === 'transit' ? 'transit' : 'car'),
    h('span', {}, `${route.name} · ${fmt.duration(route.duration)}`)));
  if (chips.length) hero.append(h('div', { class: 'glance' }, chips));
}
setInterval(() => state.config && renderHero(), 60e3);

function addSectionMenu(anchor) {
  openMenu(anchor, Object.entries(KINDS).map(([kind, k]) => ({
    label: k.label, detail: k.detail, action: () => {
      const s = template(kind);
      s.title = t(s.title);
      s.page = currentPage();
      state.config.sections.push(s);
      commit();
      openSettings(app, { sectionID: s.id });
    },
  })));
}

/** Onglets des pages, affichés seulement s'il y en a plus d'une. */
function renderPages() {
  const nav = $('pages'), list = pages(), current = currentPage();
  nav.hidden = list.length < 2;
  if (nav.hidden) return;
  nav.replaceChildren(...list.map((p) => h('button', { class: 'page-tab', 'aria-current': p.id === current ? 'page' : null,
    onClick: () => showPage(p.id) }, p.name || 'Sans titre')));
}

function showPage(id) {
  if (id === currentPage()) return;
  state.page = id;
  remember('lookout.page', id);
  hideToast();
  renderAll();
  refreshAll();   // les sections de la page sont demandées au serveur (qui respecte leurs intervalles)
  window.scrollTo({ top: 0 });
}

function renderBanner() {
  const banner = $('edit-banner');
  banner.hidden = !state.editing;
  if (!state.editing) return;
  banner.replaceChildren(
    h('span', { class: 'grow' }, icon('drag'), ' ', "Glissez une carte par son en-tête et déposez-la où vous voulez : les autres cartes restent à leur place."),
    h('button', { class: 'btn', title: 'Replace toutes les cartes de cette page dans les colonnes les moins remplies',
      onClick: () => withUndo('Disposition réorganisée', () => { for (const s of visible()) s.column = -1; }) }, icon('grid'), 'Réorganiser automatiquement'),
    h('button', { class: 'btn', onClick: (e) => addSectionMenu(e.currentTarget) }, icon('plus'), 'Ajouter une section'),
    h('button', { class: 'btn primary', onClick: () => setEditing(false) }, 'Terminé'));
}

function setEditing(on) {
  state.editing = on;
  renderAll();
}

// --- Annuler ---
// Après un déplacement, un masquage ou un changement de largeur, un bandeau propose d'annuler pendant
// quelques secondes : il remet les sections exactement comme elles étaient.
let toastTimer = null;
const toast = h('div', { class: 'toast', role: 'status', hidden: true });
document.body.append(toast);

function hideToast() {
  clearTimeout(toastTimer);
  toast.hidden = true;
}

/** Applique un changement de disposition et propose de l'annuler. */
function withUndo(message, change) {
  const snapshot = JSON.stringify(state.config.sections);
  change();
  if (JSON.stringify(state.config.sections) === snapshot) return;
  commit();
  showToast(message, 'Annuler', () => {
    state.config.sections = JSON.parse(snapshot);
    commit();
  });
}

/** Bandeau en bas de l'écran : un message et une action. Il disparaît seul, sauf s'il est persistant. */
function showToast(message, actionLabel, action, { persistent = false } = {}) {
  toast.replaceChildren(h('span', {}, message), h('button', { class: 'btn small', onClick: () => { hideToast(); action(); } }, actionLabel));
  toast.hidden = false;
  clearTimeout(toastTimer);
  if (!persistent) toastTimer = setTimeout(hideToast, 8000);
}

// --- Nouvelle version installée sur le serveur ---
// Une page peut rester ouverte des jours (onglet oublié, app sur l'écran d'accueil de l'iPhone). Elle vérifie
// donc régulièrement si le serveur a été mis à jour ; si oui elle se recharge, sauf si vous êtes en train de
// faire quelque chose, auquel cas elle vous le propose.
let versionChecked = 0;
async function checkVersion() {
  if (!app.build || Date.now() - versionChecked < 60e3) return;
  versionChecked = Date.now();
  let about;
  try { about = await api('/api/about'); } catch { return; }
  if (!about.build || about.build === app.build) return;
  const busy = hasOverlay() || state.editing || drag || document.activeElement?.matches?.('input, textarea, select');
  if (!busy) return location.reload();
  showToast('Nouvelle version de Lookout disponible', 'Recharger', () => location.reload(), { persistent: true });
}

// --- Cartes ---
function updateSection(id, message, change) {
  withUndo(message, () => { const s = section(id); if (s) change(s); });
}

/** Monte ou descend une carte d'un cran dans sa colonne (boutons du mode « Organiser »). */
function moveInColumn(id, direction) {
  const mine = frames.get(id);
  if (!mine) return;
  const neighbours = [...frames].filter(([other, f]) => other !== id && f.col < mine.col + mine.span && mine.col < f.col + f.span)
    .map(([other, f]) => ({ id: other, y: f.y })).sort((x, y) => x.y - y.y);
  const target = direction < 0 ? neighbours.filter((n) => n.y < mine.y).at(-1) : neighbours.find((n) => n.y > mine.y);
  if (!target) return;
  const list = state.config.sections;
  withUndo('Carte déplacée', () => {
    const moved = list.splice(list.findIndex((x) => x.id === id), 1)[0];
    const at = list.findIndex((x) => x.id === target.id);
    list.splice(direction < 0 ? at : at + 1, 0, moved);
  });
}

const SPANS = [[1, '1 colonne'], [2, '2 colonnes'], [99, 'Pleine largeur']];

function cardMenu(anchor, s) {
  const payload = state.data.get(s.id);
  openMenu(anchor, [
    { label: 'Mettre à jour maintenant', icon: icon('refresh'), action: () => loadSection(s.id, true) },
    payload?.articles && { label: 'Tout marquer comme lu', icon: icon('check-on'), action: () => setRead(shownArticles(s, payload.articles).map((a) => a.id), true) },
    '-',
    { heading: 'Largeur' },
    ...SPANS.map(([value, label]) => ({ label, checked: s.span === value, action: () => updateSection(s.id, 'Largeur modifiée', (x) => { x.span = value; }) })),
    '-',
    { label: 'Configurer…', icon: icon('gear'), action: () => openSettings(app, { sectionID: s.id }) },
    // Avec plusieurs pages : envoyer la carte sur une autre.
    ...(pages().length > 1 ? ['-', { heading: 'Déplacer vers la page' }, ...pages().filter((p) => p.id !== s.page).map((p) => ({
      label: p.name || 'Sans titre', action: () => updateSection(s.id, 'Section déplacée', (x) => { x.page = p.id; x.column = -1; }) }))] : []),
    '-',
    { label: 'Masquer', icon: icon('hide'), action: () => updateSection(s.id, 'Section masquée', (x) => { x.enabled = false; }) },
  ]);
}

function sourceErrorText(s, payload) {
  const names = new Map([...s.feed.sources, ...s.sports.leagues].map((x) => [x.id, x.name]));
  return Object.entries(payload.sourceErrors ?? {}).map(([id, message]) => `${names.get(id) ?? t('Source')} : ${message}`).sort().join('\n');
}

/** Pastille « n nouveaux » dans l'en-tête d'une carte d'articles. */
function newBadge(s, payload) {
  const count = payload?.articles ? countNew(s, payload.articles, ctx) : 0;
  return count > 0 && h('span', { class: 'new-count', title: t('{0} nouveaux depuis votre dernière visite', count) }, String(count));
}

function buildCard(s) {
  const payload = state.data.get(s.id), loading = state.loading.has(s.id);
  const hasContent = payload && (payload.articles || payload.weather || payload.games || payload.routes);
  const errors = payload ? sourceErrorText(s, payload) : '';

  const controls = state.editing
    ? h('div', { class: 'edit-controls' },
      h('button', { class: 'icon-btn', title: 'Monter', 'aria-label': 'Monter', onClick: () => moveInColumn(s.id, -1) }, icon('up')),
      h('button', { class: 'icon-btn', title: 'Descendre', 'aria-label': 'Descendre', onClick: () => moveInColumn(s.id, 1) }, icon('down')),
      h('button', { class: 'icon-btn', title: s.span === 1 ? 'Élargir' : s.span === 2 ? 'Pleine largeur' : 'Réduire', 'aria-label': 'Changer la largeur',
        onClick: () => updateSection(s.id, 'Largeur modifiée', (x) => { x.span = x.span === 1 ? 2 : x.span === 2 ? 99 : 1; }) }, icon(s.span === 99 ? 'narrow' : 'widen')),
      h('button', { class: 'icon-btn', title: 'Masquer la section', 'aria-label': 'Masquer la section', onClick: () => updateSection(s.id, 'Section masquée', (x) => { x.enabled = false; }) }, icon('hide')))
    : [
      !loading && errors && h('span', { class: 'warn', title: errors, role: 'img', 'aria-label': 'Certaines sources sont en erreur' }, icon('warning')),
      h('button', { class: `icon-btn reload${loading ? ' spinning' : ''}`, disabled: loading, 'aria-busy': String(loading),
        'aria-label': t('Mettre à jour la section {0} maintenant', s.title),
        title: payload?.updatedAt ? t('Mettre à jour maintenant (données de {0})', fmt.time(payload.updatedAt)) : 'Mettre à jour maintenant',
        onClick: () => loadSection(s.id, true) }, icon('refresh')),
      h('button', { class: 'icon-btn', 'aria-label': t('Options de la section {0}', s.title),
        title: payload?.updatedAt ? t('Mis à jour {0}', fmt.ago(payload.updatedAt)) : 'Options', onClick: (e) => cardMenu(e.currentTarget, s) }, icon('more')),
    ];

  let body;
  if (hasContent) {
    body = [cardBody(s, payload, ctx),
      payload.error && h('div', { class: 'note' }, icon('offline'), t('Actualisation impossible : {0}', payload.error))];
  } else if (payload?.error && !loading) {
    body = h('div', { class: 'error-state' }, icon('warning'), h('span', {}, payload.error),
      h('div', {}, h('button', { class: 'btn small', onClick: () => loadSection(s.id, true) }, 'Réessayer'), ' ',
        h('button', { class: 'btn small', onClick: () => openSettings(app, { sectionID: s.id }) }, 'Configurer…')));
  } else {
    body = h('div', { class: 'skeleton', role: 'status', 'aria-label': 'Chargement' },
      Array.from({ length: (s.kind === 'weather' ? 3 : Math.min(s.maxItems, 5)) * 2 }, () => h('i')));
  }

  const card = h('article', { class: `card${state.editing ? ' editing' : ''}`, 'aria-label': s.title },
    h('header', { class: 'card-head' }, badge(s),
      h('div', { class: 'card-title' }, h('h2', {}, s.title, newBadge(s, payload)), s.kind === 'weather' && h('small', {}, s.weather.locationName)), controls),
    h('div', { class: 'card-body' }, body));
  card.dataset.id = s.id;

  enableDrag(card, s.id);
  return card;
}

function renderCard(id) {
  const s = section(id), old = cards.get(id);
  if (!s || !s.enabled || !old) return;
  // Pendant un déplacement, les cartes ne sont pas reconstruites : tout est redessiné au dépôt.
  if (drag) { drag.stale = true; return; }
  const card = buildCard(s);
  card.style.cssText = old.style.cssText;
  observer.unobserve(old);
  old.replaceWith(card);
  cards.set(id, card);
  observer.observe(card);
  scheduleLayout();
}

function renderAll() {
  if (drag) { drag.stale = true; return; }
  // Un changement de langue touche aussi les textes fournis par le serveur (erreurs, états des matchs).
  if (applyLanguage() && state.data.size) refreshAll();
  applyTheme();
  renderHero();
  renderPages();
  renderBanner();
  updateToolbar();
  const grid = $('grid'), list = visible();
  for (const card of cards.values()) observer.unobserve(card);
  const previous = new Map(cards);
  cards.clear();
  const elements = list.map((s) => {
    const card = buildCard(s), old = previous.get(s.id);
    if (old) card.style.cssText = old.style.cssText;   // garde la position pour animer le déplacement
    cards.set(s.id, card);
    return card;
  });
  grid.replaceChildren(...elements);
  for (const card of elements) observer.observe(card);

  const empty = $('empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.replaceChildren(h('div', { class: 'error-state' }, h('h2', { style: { margin: '0', color: 'var(--text)' } }, 'Votre tableau de bord est vide'),
      h('span', {}, 'Ajoutez ou réactivez des sections dans les réglages.'),
      h('button', { class: 'btn primary', onClick: () => openSettings(app) }, 'Ouvrir les réglages')));
  }
  scheduleLayout();
}

// --- Déplacement des cartes par glisser-déposer ---
// Chaque carte a une colonne à elle (« column » dans la configuration). Déposer une carte quelque part ne
// touche donc qu'à la colonne d'arrivée et à celle de départ : le reste du tableau de bord ne bouge pas.
// Pendant le geste, rien ne se réorganise ; un trait indique seulement où la carte va atterrir.
//
// À la souris, on saisit une carte par son en-tête à tout moment. Au doigt, seulement en mode « Organiser »,
// pour que le défilement de la page reste naturel le reste du temps.
const frames = new Map();   // id de section -> emplacement { x, y, w, h, col, span } calculé par layout()
const metrics = { columns: 1, columnWidth: 0, gap: 16 };
let drag = null;
const dropLine = h('div', { class: 'drop-line', hidden: true });

function dragTransform() {
  const rect = $('grid').getBoundingClientRect();
  return `translate(${drag.x - rect.left - drag.offsetX}px, ${drag.y - rect.top - drag.offsetY}px) scale(1.02)`;
}

function enableDrag(card, id) {
  const head = card.querySelector('.card-head');
  head.addEventListener('pointerdown', (e) => {
    if (drag || e.target.closest('button, a, input')) return;
    if (e.pointerType === 'mouse' ? e.button !== 0 : !state.editing) return;
    if (!frames.has(id)) layout();   // mise en page pas encore calculée (onglet resté en arrière-plan)
    const frame = frames.get(id), rect = $('grid').getBoundingClientRect();
    if (!frame) return;
    drag = { id, card, head, pointerId: e.pointerId, active: false, stale: false, target: null,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      offsetX: e.clientX - rect.left - frame.x, offsetY: e.clientY - rect.top - frame.y };
    // La capture garantit qu'on reçoit la suite du geste même si le pointeur sort de l'en-tête.
    try { head.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;   // simple clic : on ne déplace rien
      drag.active = true;
      card.classList.add('dragging');
      document.body.classList.add('is-dragging');
      $('grid').append(dropLine);
      autoScroll();
    }
    e.preventDefault();
    updateDrag();
  });
  const finish = (cancelled) => (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    endDrag(cancelled);
  };
  head.addEventListener('pointerup', finish(false));
  head.addEventListener('pointercancel', finish(true));
}

/** Où la carte atterrirait si on la lâchait maintenant : colonne, carte devant laquelle s'insérer, hauteur du trait. */
function dropTarget() {
  const rect = $('grid').getBoundingClientRect(), px = drag.x - rect.left, py = drag.y - rect.top;
  const { columns, columnWidth, gap } = metrics, mine = frames.get(drag.id);
  const col = Math.min(Math.max(0, Math.floor(px / (columnWidth + gap))), columns - mine.span);
  // Les cartes déjà présentes dans la ou les colonnes visées, de haut en bas.
  const others = [...frames].filter(([id, f]) => id !== drag.id && f.col < col + mine.span && col < f.col + f.span)
    .map(([id, f]) => ({ id, ...f })).sort((a, b) => a.y - b.y);
  const before = others.find((f) => py < f.y + f.h / 2) ?? null;
  const last = others.at(-1);
  const y = before ? before.y - gap / 2 : (last ? last.y + last.h + gap / 2 : 0);
  return { col, before: before?.id ?? null, after: before ? null : (last?.id ?? null), y };
}

function updateDrag() {
  drag.card.style.transform = dragTransform();
  const target = drag.target = dropTarget(), mine = frames.get(drag.id), { columnWidth, gap } = metrics;
  dropLine.hidden = false;
  dropLine.style.width = `${columnWidth * mine.span + gap * (mine.span - 1)}px`;
  dropLine.style.transform = `translate(${target.col * (columnWidth + gap)}px, ${Math.max(0, target.y - 2)}px)`;
}

/** Fait défiler la page quand on approche du haut ou du bas de l'écran en tenant une carte. */
function autoScroll() {
  if (!drag?.active) return;
  const edge = 70, speed = 14;
  if (drag.y < edge) window.scrollBy(0, -speed * (1 - Math.max(0, drag.y) / edge));
  else if (drag.y > innerHeight - edge) window.scrollBy(0, speed * (1 - Math.max(0, innerHeight - drag.y) / edge));
  updateDrag();
  requestAnimationFrame(autoScroll);
}

function endDrag(cancelled) {
  const { id, card, head, pointerId, active, target, stale } = drag;
  try { if (head.hasPointerCapture(pointerId)) head.releasePointerCapture(pointerId); } catch { /* déjà relâché */ }
  drag = null;
  card.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  dropLine.hidden = true;
  dropLine.remove();
  if (active && !cancelled && target) withUndo('Carte déplacée', () => placeCard(id, target));
  if (active) layout();   // la carte glisse jusqu'à son emplacement
  if (stale) renderAll();
}

/** Dépose une carte : fixe sa colonne et l'insère à l'endroit visé dans l'ordre des sections. */
function placeCard(id, target) {
  const list = state.config.sections, before = JSON.stringify(list.map((s) => [s.id, s.column]));
  if (metrics.columns > 1) {
    // Au premier déplacement, chaque carte garde la colonne où elle se trouve : plus rien ne se replace tout seul.
    for (const s of list) if (s.column < 0 && frames.has(s.id)) s.column = frames.get(s.id).col;
    list.find((s) => s.id === id).column = target.col;
  }
  const anchor = target.before ?? target.after;
  if (anchor && anchor !== id) {
    const moved = list.splice(list.findIndex((s) => s.id === id), 1)[0];
    const at = list.findIndex((s) => s.id === anchor);
    list.splice(target.before ? at : at + 1, 0, moved);
  }
  return JSON.stringify(list.map((s) => [s.id, s.column])) !== before;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag?.active) endDrag(true); });

// --- Grille en colonnes ---
let layoutFrame = 0;
function scheduleLayout() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(layout);
}

function layout() {
  const grid = $('grid'), width = grid.clientWidth;
  if (!width || !state.config) return;   // rien à placer tant que la configuration n'est pas chargée
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-gap')) || 16;
  const fixed = general().columns;
  // Même avec un nombre fixe, une colonne ne descend jamais sous 260 px.
  const columns = fixed > 0 ? Math.min(fixed, Math.max(1, Math.floor((width + gap) / (260 + gap))))
    : Math.min(4, Math.max(1, Math.floor((width + gap) / (330 + gap))));
  const columnWidth = (width - (columns - 1) * gap) / columns;
  Object.assign(metrics, { columns, columnWidth, gap });
  const heights = new Array(columns).fill(0);
  frames.clear();
  const items = visible().map((s) => ({ s, card: cards.get(s.id), span: Math.min(Math.max(1, s.span), columns) })).filter((x) => x.card);
  for (const item of items) item.card.style.width = `${columnWidth * item.span + gap * (item.span - 1)}px`;
  for (const { s, card, span } of items) {
    let col, y;
    if (s.column >= 0) {
      // Colonne choisie par l'utilisateur (ramenée dans la grille si l'écran a moins de colonnes).
      col = Math.min(s.column, columns - span);
      y = Math.max(...heights.slice(col, col + span));
    } else {
      // Pas encore placée à la main : la colonne la moins remplie.
      col = 0;
      y = Infinity;
      for (let start = 0; start <= columns - span; start++) {
        const top = Math.max(...heights.slice(start, start + span));
        if (top < y - 0.5) { y = top; col = start; }
      }
    }
    const x = col * (columnWidth + gap), height = card.offsetHeight;
    frames.set(s.id, { x, y, w: card.offsetWidth, h: height, col, span });
    if (drag?.active && drag.id === s.id) card.style.transform = dragTransform();   // elle suit le pointeur
    else card.style.transform = `translate(${x}px, ${y}px)`;
    for (let i = col; i < col + span; i++) heights[i] = y + height + gap;
  }
  grid.style.height = `${Math.max(0, Math.max(...heights) - gap)}px`;
  requestAnimationFrame(() => grid.classList.add('ready'));
}
const observer = new ResizeObserver(scheduleLayout);
new ResizeObserver(scheduleLayout).observe($('grid'));

// --- Démarrage ---
const app = {
  version: '',
  build: '',
  state, commit, saveNow, loadSection, refreshAll, restartTimer, renderAll, currentPage,
  async replaceConfig(config) {
    state.config = config;
    state.data.clear();
    state.signatures.clear();
    renderAll();
    restartTimer();
    refreshAll();
  },
};

$('btn-refresh').append(icon('refresh'));
$('btn-edit').append(icon('grid'));
$('btn-settings').append(icon('gear-bold'));
$('btn-refresh').addEventListener('click', () => refreshAll());
$('btn-edit').addEventListener('click', () => setEditing(!state.editing));
$('btn-settings').addEventListener('click', () => openSettings(app));
document.addEventListener('keydown', (e) => {
  if (hasOverlay() || e.target.matches('input, textarea, select')) return;
  if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) refreshAll();
  if (e.key === ',' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSettings(app); }
});

(async () => {
  try {
    const [config, read, about] = await Promise.all([api('/api/config'), api('/api/read'), api('/api/about')]);
    app.version = about.version;
    app.build = about.build;
    state.config = config;
    state.readIDs = new Set(read);
    renderAll();
    restartTimer();
    refreshAll();
  } catch (error) {
    $('empty').hidden = false;
    $('empty').replaceChildren(h('div', { class: 'error-state' }, icon('offline'), h('span', {}, error.message),
      h('button', { class: 'btn', onClick: () => location.reload() }, 'Réessayer')));
  }
})();

export { confirmDialog };
