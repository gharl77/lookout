// Briefing — tableau de bord.
import { h, icon, sfIcon, badge, fmt, t, api, openMenu, openDialog, confirmDialog, hasOverlay, whenSignedOut, viewProfile } from './ui.js';
import { showAuth, showPasswordChange, signOut } from './auth.js';
import { runOnboarding } from './onboarding.js';
import { setLangProvider, resolveLang } from './i18n.js';
import { cardBody, shownArticles, articleKeys, countNew, setRankProvider, setTopicProvider, WMO } from './cards.js';
import { KINDS, FEED_CATALOG, template, youtubeSection, categorySection, newPage, fetchSignature, youtubeVideoID, articleFilter, topicClusters } from './shared.js';
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
  saved: [],              // articles gardés « à lire plus tard »
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
  $('btn-saved').title = t('À lire plus tard');
  $('btn-readall').title = t('Tout marquer comme lu sur cette page ( M )');
  $('btn-readall').setAttribute('aria-label', t('Tout marquer comme lu sur cette page'));
  $('btn-search').title = t('Rechercher dans les articles ( / )');
  $('btn-search').setAttribute('aria-label', t('Rechercher dans les articles'));
  $('btn-saved').setAttribute('aria-label', t('À lire plus tard'));
  $('display-exit').textContent = t('Quitter le mode affichage');
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
  if (app.viewing) return;   // profil d'un autre, en lecture seule : rien n'est enregistré
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
const readAtLoad = new Map();     // id de section -> articles déjà lus quand ses données sont arrivées
const refreshTries = new Map();   // id de section -> nombre de retours pendant une mise à jour en arrière-plan
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
  // L'ordre « non lus d'abord » se fie aux articles lus à l'arrivée des données : un article qu'on vient d'ouvrir
  // reste à sa place, au lieu de sauter au bas de la carte sous le doigt.
  if (payload.articles && (!payload.refreshing || !readAtLoad.has(id))) readAtLoad.set(id, new Set(state.readIDs));
  renderCard(id);
  // Données servies depuis le cache pendant que le serveur interroge les sources : on revient les chercher sous peu.
  if (payload.refreshing) {
    const tries = (refreshTries.get(id) ?? 0) + 1;
    refreshTries.set(id, tries);
    if (tries <= 15) setTimeout(() => { if (state.signatures.get(id) === signature && !state.loading.has(id)) loadSection(id); }, Math.max(1500, payload.nextUpdateAt - Date.now()));
  } else refreshTries.delete(id);
  // Les sections placées après celle-ci peuvent maintenant avoir des doublons à écarter (ou à reprendre) ; celles
  // placées avant indiquent, sous leurs articles, que cette section les reçoit aussi.
  if (payload.articles && general().dedupeArticles) {
    for (const s of visible()) if (s.id !== id && state.data.get(s.id)?.articles) renderCard(s.id);
  }
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

// --- À lire plus tard ---
// Les articles gardés sont enregistrés sur le serveur, par profil : on les retrouve sur tous ses appareils,
// même une fois sortis des fils.
function applySaved(list) {
  state.saved = list;
  const button = $('btn-saved');
  button.hidden = !list.length || Boolean(app.viewing);
  button.replaceChildren(sfIcon('bookmark.fill'), h('span', { class: 'count' }, String(list.length)));
  for (const s of visible()) if (state.data.get(s.id)?.articles) renderCard(s.id);
}
async function toggleSaved(article, section) {
  const saved = state.saved.some((a) => a.id === article.id);
  try {
    applySaved(await api('/api/saved', { method: 'POST', body: saved ? { remove: [article.id] }
      : { add: { id: article.id, title: article.title, link: article.link, image: article.image, date: article.date, source: article.source || section?.title } } }));
  } catch (error) { showSubtitle(error.message); }
}
function savedDialog() {
  openDialog((close) => {
    const body = h('div', { class: 'saved-list' });
    const change = async (payload) => {
      try { applySaved(await api('/api/saved', { method: 'POST', body: payload })); } catch (error) { showSubtitle(error.message); }
      if (state.saved.length) draw(); else close();
    };
    const draw = () => body.replaceChildren(...state.saved.map((a) => h('div', { class: 'saved-item' },
      h('a', { href: a.link, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'a-title' }, a.title || a.link),
        h('span', { class: 'a-meta' }, [a.source, a.date && fmt.ago(a.date)].filter(Boolean).join(' · '))),
      h('button', { class: 'icon-btn', title: 'Retirer de la liste', 'aria-label': t('Retirer {0}', a.title), onClick: () => change({ remove: [a.id] }) }, icon('close')))));
    draw();
    return [h('h3', {}, 'À lire plus tard'), body,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onClick: async () => {
          if (await confirmDialog('Vider la liste ?', 'Tous les articles gardés seront retirés de la liste.', 'Vider')) change({ clear: true });
        } }, 'Tout retirer'),
        h('button', { class: 'btn primary', onClick: close }, 'Terminé'))];
  }, { cls: 'dialog wide' });
}

// --- Lecture d'une vidéo YouTube sans quitter Lookout ---
function playVideo(article) {
  const id = youtubeVideoID(article.link);
  if (!id) return;
  openDialog((close) => [
    h('div', { class: 'video-frame' }, h('iframe', { src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, title: article.title,
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' })),
    h('h3', {}, article.title),
    h('div', { class: 'actions' },
      h('span', { class: 'a-meta grow' }, [article.source, article.date && fmt.ago(article.date)].filter(Boolean).join(' · ')),
      h('a', { class: 'btn', href: article.link, target: '_blank', rel: 'noopener noreferrer' }, icon('open'), 'Ouvrir sur YouTube'),
      h('button', { class: 'btn primary', onClick: close }, 'Fermer'))], { cls: 'dialog video' });
}

// --- Lecteur d'article ---
// Le serveur extrait le texte principal de la page et le renvoie en blocs ; rien de la page d'origine n'est exécuté ici.
function readArticle(article, section = null) {
  const body = h('div', { class: 'reader-body' }, h('div', { class: 'skeleton', role: 'status', 'aria-label': 'Chargement' }, Array.from({ length: 12 }, () => h('i'))));
  const meta = h('div', { class: 'a-meta' }, [article.source, article.date && fmt.ago(article.date)].filter(Boolean).join(' · '));
  const title = h('h2', {}, article.title);
  const summaryBox = h('aside', { class: 'reader-summary', hidden: true, 'aria-live': 'polite' });
  const images = section ? section.feed.showImages !== false : true;
  const picture = (src, alt = '') => h('img', { src, alt, loading: 'lazy', referrerpolicy: 'no-referrer', onError: (e) => e.target.remove() });
  let closed = false;
  openDialog((close) => {
    const saved = () => state.saved.some((a) => a.id === article.id);
    const keep = !app.viewing && h('button', { class: 'btn', 'aria-pressed': String(saved()), onClick: (e) => {
      toggleSaved(article, section);
      e.currentTarget.setAttribute('aria-pressed', String(!saved()));
    } }, sfIcon('bookmark.fill'), 'À lire plus tard');
    // Résumé par Claude : offert quand le profil a une clé (la sienne, dans Réglages → Résumé par courriel, ou la clé partagée).
    const canSummarize = !app.viewing && (app.sharedKeys?.anthropicKey || state.config.digest?.anthropicKey);
    const summarize = canSummarize && h('button', { class: 'btn', onClick: async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      summaryBox.hidden = false;
      summaryBox.replaceChildren(h('div', { class: 'skeleton', role: 'status', 'aria-label': 'Chargement' }, Array.from({ length: 4 }, () => h('i'))));
      try {
        const done = await api('/api/reader/summary', { method: 'POST', body: { url: article.link }, asViewed: false });
        if (closed) return;
        summaryBox.replaceChildren(h('h3', {}, 'En bref'), h('ul', {}, done.points.map((p) => h('li', {}, document.createTextNode(p)))),
          h('small', {}, t('Résumé par {0}. À vérifier dans le texte.', String(done.model ?? '').replace(/^claude-/, 'Claude ').replace(/-/g, ' '))));
      } catch (error) {
        if (closed) return;
        summaryBox.replaceChildren(h('span', { class: 'note' }, icon('warning'), document.createTextNode(error.message)));
        button.disabled = false;
      }
    } }, sfIcon('bolt.fill'), 'Résumer');
    return [
      h('div', { class: 'reader-scroll' }, h('article', { class: 'reader-text' }, meta, title, summaryBox, body)),
      h('div', { class: 'actions' }, keep, summarize, h('span', { class: 'grow' }),
        h('a', { class: 'btn', href: article.link, target: '_blank', rel: 'noopener noreferrer' }, icon('open'), 'Ouvrir sur le site'),
        h('button', { class: 'btn primary', onClick: close }, 'Fermer'))].filter(Boolean);
  }, { cls: 'dialog reader', onClose: () => { closed = true; } });
  api('/api/reader', { method: 'POST', body: { url: article.link }, asViewed: false }).then((page) => {
    if (closed) return;
    meta.textContent = [page.site || article.source, page.byline, article.date && fmt.ago(article.date), t('{0} min de lecture', page.minutes)].filter(Boolean).join(' · ');
    const lead = images && page.image && page.blocks[0]?.type !== 'img' && picture(page.image);
    const blocks = page.blocks.filter((b) => b.type !== 'img' || (images && b.src !== page.image));
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === 'li') {   // les éléments de liste qui se suivent forment une seule liste
        const items = [];
        while (blocks[i]?.type === 'li') items.push(h('li', {}, document.createTextNode(blocks[i++].text)));
        i--;
        out.push(h('ul', {}, items));
      } else if (b.type === 'img') out.push(h('figure', {}, picture(b.src, b.alt)));
      else out.push(h(b.type === 'h' ? 'h3' : b.type === 'quote' ? 'blockquote' : b.type === 'pre' ? 'pre' : 'p', {}, document.createTextNode(b.text)));
    }
    body.replaceChildren(...[lead && h('figure', {}, lead), ...out].filter(Boolean));
  }).catch((error) => {
    if (closed) return;
    body.replaceChildren(h('div', { class: 'error-state' }, icon('warning'), h('span', {}, document.createTextNode(error.message)),
      h('a', { class: 'btn primary', href: article.link, target: '_blank', rel: 'noopener noreferrer' }, icon('open'), 'Ouvrir sur le site')));
  });
}

// --- Abonnements YouTube tenus à jour d'après le compte Google relié ---
/** Au chargement : annonce le résultat d'une connexion à Google, puis resynchronise les sections qui datent de plus d'un jour. */
async function googleFollowUp() {
  const query = new URLSearchParams(location.search), outcome = query.get('google');
  if (outcome) {
    query.delete('google');
    history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
    showNotice(t(outcome === 'ok' ? 'Compte Google relié : vos abonnements YouTube sont importés.'
      : outcome === 'refuse' ? "Connexion à Google annulée : rien n'a été modifié." : 'La connexion à Google a échoué. Réessayez depuis les réglages de la section.'));
  }
  const stale = state.config.sections.filter((s) => s.kind === 'feed' && s.feed.youtubeSync && Date.now() - (s.feed.youtubeSyncedAt || 0) > 24 * 3600e3);
  for (const s of stale) {
    try {
      await saveNow();
      const done = await api('/api/youtube/sync', { method: 'POST', body: { section: s.id } });
      await app.replaceConfig(done.config);
    } catch { /* compte délié ou Google injoignable : la liste actuelle reste en place, l'erreur est visible dans les réglages */ }
  }
}

// --- Recherche dans les articles ---
// Cherche dans les articles de toutes les sections (toutes pages confondues) et dans « À lire plus tard ».
// Les sections des autres pages sont demandées au serveur à l'ouverture ; il les sert depuis son cache.
function searchDialog() {
  if (hasOverlay()) return;
  const calendars = state.config.sections.filter((s) => s.enabled && s.kind === 'calendar');
  const feeds = state.config.sections.filter((s) => s.enabled && (s.kind === 'feed' || s.kind === 'api'));
  for (const s of [...feeds, ...calendars]) if (!state.data.has(s.id) && !state.loading.has(s.id)) loadSection(s.id);
  let timer = null;
  openDialog((close) => {
    const input = h('input', { class: 'field search-input', type: 'search', placeholder: t('Rechercher dans les articles'), 'aria-label': 'Rechercher dans les articles', autofocus: true,
      autocomplete: 'off', spellcheck: 'false', onInput: () => draw() });
    const results = h('div', { class: 'saved-list search-results' }), status = h('p', { class: 'a-meta' });
    const draw = () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      const found = new Map();
      if (words.length) {
        const match = (a) => { const text = `${a.title} ${a.summary ?? ''} ${a.source ?? ''}`.toLowerCase(); return words.every((w) => text.includes(w)); };
        for (const s of feeds) {
          const keep = articleFilter({ ...s.feed, maxAgeHours: 0 }, general());   // les mots masqués le restent ; l'âge ne compte pas
          for (const a of state.data.get(s.id)?.articles ?? []) if (keep(a) && match(a) && !found.has(a.link ?? a.id)) found.set(a.link ?? a.id, { ...a, where: s.title, section: s });
        }
        for (const a of state.saved) if (match(a) && !found.has(a.link)) found.set(a.link, { ...a, where: t('À lire plus tard') });
        // Événements des agendas : cherchés dans le titre et le lieu.
        for (const s of calendars) {
          for (const e of state.data.get(s.id)?.events ?? []) {
            const text = `${e.title} ${e.location ?? ''} ${e.calendar ?? ''}`.toLowerCase();
            if (words.every((w) => text.includes(w))) found.set(`e:${s.id}:${e.start}:${e.title}`, { title: e.title || t('(sans titre)'), link: e.link || null, date: e.start, event: e, where: s.title });
          }
        }
      }
      const list = [...found.values()].sort((a, b) => (b.date ?? 0) - (a.date ?? 0)).slice(0, 60);
      results.replaceChildren(...list.map((a) => h(a.link ? 'a' : 'div', { class: 'saved-item search-item', href: a.link, target: '_blank', rel: 'noopener noreferrer',
        onClick: (e) => {
          if (a.section) setRead([a.id], true);
          if (!a.link) return;
          if (a.section?.feed.playInline !== false && youtubeVideoID(a.link) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); close(); playVideo(a); }
        } },
      h('span', { class: 'a-title' }, a.title), h('span', { class: 'a-meta' }, (a.event
        ? [a.where, a.event.allDay ? new Intl.DateTimeFormat(document.documentElement.lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(a.date) : fmt.dayTime(a.date), a.event.location]
        : [a.where, a.source !== a.where && a.source, a.date && fmt.ago(a.date)]).filter(Boolean).join(' · ')))));
      const pendingCount = [...feeds, ...calendars].filter((s) => state.loading.has(s.id)).length;
      status.textContent = !words.length ? t('Tapez un ou plusieurs mots. La recherche couvre les articles de toutes vos pages, vos agendas et « À lire plus tard ».')
        : pendingCount ? t('{0} résultats — chargement des autres sections…', list.length)
        : list.length ? t('{0} résultats', list.length) : t('Rien ne contient ces mots.');
      // Tant que des sections arrivent, les résultats se complètent d'eux-mêmes.
      clearTimeout(timer);
      if (pendingCount) timer = setTimeout(draw, 600);
    };
    draw();
    return [input, status, results, h('div', { class: 'actions' }, h('button', { class: 'btn primary', onClick: close }, 'Fermer'))];
  }, { cls: 'dialog wide', onClose: () => clearTimeout(timer) });
}

// --- Mode affichage (écran mural, télé) ---
// Plein écran, sans boutons, avec l'heure ; les pages défilent et l'écran reste allumé. L'adresse garde
// « ?affichage=1 » : une tablette murale peut l'enregistrer en signet et y revenir après un redémarrage.
let displayTimer = null, displaySeconds = null, clockTimer = null, wakeLock = null, exitTimer = null, wentFullscreen = false;
const setDisplayParam = (on) => {
  const query = new URLSearchParams(location.search);
  if (on) query.set('affichage', '1'); else query.delete('affichage');
  history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
};
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* refusé ou non pris en charge : l'écran suivra ses réglages */ }
}
function tickClock() {
  $('clock').textContent = new Intl.DateTimeFormat(document.documentElement.lang, { hour: 'numeric', minute: '2-digit' }).format(new Date());
}
function scheduleDisplay() {
  const seconds = app.display && state.config ? Number(general().displaySeconds) || 0 : 0;
  if (seconds === displaySeconds) return;   // rien n'a changé : la minuterie en cours continue
  clearInterval(displayTimer);
  displaySeconds = seconds;
  if (!seconds) return;
  displayTimer = setInterval(() => {
    const list = pages();
    if (list.length < 2 || hasOverlay()) return;
    showPage(list[(list.findIndex((p) => p.id === currentPage()) + 1) % list.length].id);
  }, seconds * 1000);
}
function startDisplay({ fullscreen = true } = {}) {
  if (app.display) return;
  app.display = true;
  state.editing = false;
  document.body.classList.add('display');
  setDisplayParam(true);
  // Le plein écran exige un geste de l'utilisateur : au chargement direct de l'adresse, on s'en passe.
  if (fullscreen) document.documentElement.requestFullscreen?.().then(() => { wentFullscreen = true; }).catch(() => {});
  keepAwake();
  $('clock').hidden = false;
  tickClock();
  clockTimer = setInterval(tickClock, 5000);
  scheduleDisplay();
  if (state.config) renderAll();
}
function stopDisplay() {
  if (!app.display) return;
  app.display = false;
  document.body.classList.remove('display');
  setDisplayParam(false);
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  wentFullscreen = false;
  scheduleDisplay();
  clearInterval(clockTimer);
  $('clock').hidden = true;
  $('display-exit').hidden = true;
  renderAll();
}
// Un mouvement de souris ou un toucher fait apparaître « Quitter » quelques secondes.
for (const type of ['pointermove', 'pointerdown']) document.addEventListener(type, () => {
  if (!app.display) return;
  $('display-exit').hidden = false;
  clearTimeout(exitTimer);
  exitTimer = setTimeout(() => { $('display-exit').hidden = true; }, 4000);
});
// Sortir du plein écran (touche Échap) quitte aussi le mode affichage.
document.addEventListener('fullscreenchange', () => { if (app.display && wentFullscreen && !document.fullscreenElement) stopDisplay(); });
// L'écran peut relâcher le maintien en éveil quand l'onglet passe en arrière-plan : on le redemande au retour.
document.addEventListener('visibilitychange', () => { if (app.display && !document.hidden) keepAwake(); });

// --- Lecture des articles ---
function setRead(ids, read, advance = false) {
  if (app.viewing) return;   // on ne marque rien comme lu à la place de quelqu'un d'autre
  for (const id of ids) read ? state.readIDs.add(id) : state.readIDs.delete(id);
  api('/api/read', { method: 'POST', body: read ? { add: ids } : { remove: ids } }).catch(() => {});
  // « Tout marquer comme lu » : on a fini ces articles, les cartes passent tout de suite aux non lus suivants.
  if (advance) for (const s of visible()) if (readAtLoad.has(s.id)) readAtLoad.set(s.id, new Set(state.readIDs));
  for (const s of visible()) if (state.data.get(s.id)?.articles) renderCard(s.id);
  updateReadAll();
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

// --- Une même nouvelle n'apparaît qu'une fois par page ---
// Une nouvelle reprise par plusieurs fils (à la une, international, politique…) reste dans la première section qui
// l'affiche, dans l'ordre de la page ; les suivantes montrent à la place l'article suivant de leur liste.
/** Filtre pour une section : vrai pour un article qu'une section placée avant elle affiche déjà. Nul si l'option est coupée. */
// --- Sujets regroupés ---
// Les articles de la page affichée qui parlent du même événement (sources différentes, titres proches) forment un
// sujet : un seul est affiché, et il nomme les autres sources. Le calcul est repris quand les données changent.
let topicMemo = { stamp: '', topics: new Map(), members: new Map() };
function topics() {
  const g = general();
  const sections = g.groupTopics && g.dedupeArticles ? visible().filter((s) => (s.kind === 'feed' && !s.feed.youtube) || s.kind === 'api') : [];
  const loaded = sections.map((s) => [s, state.data.get(s.id)?.articles]).filter(([, articles]) => articles);
  const stamp = loaded.map(([s, articles]) => `${s.id}:${articles.length}:${articles[0]?.id}:${s.feed.includeKeywords}|${s.feed.excludeKeywords}|${s.feed.maxAgeHours}`).join('~') + g.muteKeywords;
  if (stamp === topicMemo.stamp) return topicMemo;
  const all = loaded.flatMap(([s, articles]) => articles.filter(articleFilter(s.feed, g)).map((a) => ({ ...a, section: s })));
  const map = topicClusters(all), members = new Map();
  for (const a of all) { const topic = map.get(a.id); if (topic != null) { if (!members.has(topic)) members.set(topic, []); members.get(topic).push(a); } }
  topicMemo = { stamp, topics: map, members };
  return topicMemo;
}
setTopicProvider(() => { const { topics: map } = topics(); return map.size ? (a) => map.get(a.id) ?? null : null; });
/** Ce qui identifie une nouvelle pour l'écarter ailleurs : son adresse, son titre, et son sujet quand il est regroupé. */
function keysOf(article) {
  const topic = topics().topics.get(article.id);
  return topic == null ? articleKeys(article) : [...articleKeys(article), `s:${topic}`];
}
/** Autres sources qui couvrent le même sujet : une par source, la plus récente, quatre au plus. */
function related(article) {
  const { topics: map, members } = topics(), topic = map.get(article.id);
  if (topic == null) return [];
  const bySource = new Map();
  for (const a of members.get(topic).sort((x, y) => (y.date ?? 0) - (x.date ?? 0))) {
    if (a.link && a.link !== article.link && a.source && a.source !== article.source && !bySource.has(a.source)) bySource.set(a.source, { source: a.source, title: a.title, link: a.link });
  }
  return [...bySource.values()].slice(0, 4);
}

function skipFor(section) {
  if (!general().dedupeArticles) return null;
  const taken = new Set(), skip = (a) => keysOf(a).some((key) => taken.has(key));
  for (const s of visible()) {
    if (s.id === section.id) return taken.size ? skip : null;
    const articles = state.data.get(s.id)?.articles;
    if (articles) for (const a of shownArticles(s, articles, general(), skip)) for (const key of keysOf(a)) taken.add(key);
  }
  return null;   // section absente de la page affichée
}

// Clés des articles qu'une section afficherait sans le tri des doublons (mémorisées tant que ses données et ses filtres ne changent pas).
const keyIndex = new Map();   // id de section -> { articles, stamp, keys }
function sectionKeys(s) {
  const articles = state.data.get(s.id)?.articles;
  if (!articles) return null;
  const stamp = `${s.feed.includeKeywords}|${s.feed.excludeKeywords}|${s.feed.maxAgeHours}|${general().muteKeywords}`, known = keyIndex.get(s.id);
  if (known?.articles === articles && known.stamp === stamp && known.topics === topics()) return known.keys;
  const keys = new Set(articles.filter(articleFilter(s.feed, general())).flatMap(keysOf));
  keyIndex.set(s.id, { articles, stamp, keys, topics: topics() });
  return keys;
}
/** Titres des sections placées après celle-ci qui reçoivent la même nouvelle (et ne l'affichent donc pas). */
function alsoIn(article, section) {
  if (!general().dedupeArticles) return [];
  const list = visible(), at = list.findIndex((s) => s.id === section.id), keys = keysOf(article);
  if (at < 0 || !keys.length) return [];
  return list.slice(at + 1).filter((s) => { const theirs = sectionKeys(s); return theirs && keys.some((key) => theirs.has(key)); }).map((s) => s.title);
}

// --- Home Assistant : actionner une entité depuis sa carte ---
async function callEntity(s, entity) {
  try { state.data.set(s.id, await api('/api/hass/call', { method: 'POST', body: { section: s.id, entity } })); }
  catch (error) { showNotice(error.message); }
  renderCard(s.id);
}

// --- Nouveaux et non lus d'abord ---
setRankProvider((s) => {
  if (!general().unreadFirst) return null;
  const read = readAtLoad.get(s.id) ?? state.readIDs;
  return (a) => (read.has(a.id) ? 2 : newSince && a.date && a.date > newSince ? 0 : 1);
});

const ctx = { get general() { return general(); }, skipFor, alsoIn, related, get configure() { return app.viewing || app.display ? null : (s) => openSettings(app, { sectionID: s.id }); }, get callEntity() { return app.viewing ? null : callEntity; }, isRead: (id) => state.readIDs.has(id), setRead,
  get canSave() { return !app.viewing && !app.display; }, get playVideo() { return app.display ? null : playVideo; }, get readArticle() { return app.display ? null : readArticle; }, isSaved: (id) => state.saved.some((a) => a.id === id), toggleSaved,
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
  updateReadAll();
}
/** Le bouton « tout lu » de la page n'apparaît que s'il reste des articles non lus à l'écran. */
function updateReadAll() {
  $('btn-readall').hidden = Boolean(app.viewing) || app.display || state.editing || !state.config || !visible().some((s) => unreadShown(s).length > 0);
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

// --- Ajouter une section ---
// En mode « Organiser », une palette propose les types de section et les catégories de fils. Un clic ajoute la
// section à la page ; à la souris, on peut aussi la glisser à l'endroit voulu (voir « Glisser une nouvelle section »).
function paletteItems() {
  const lang = document.documentElement.lang;
  return {
    kinds: [...Object.entries(KINDS).map(([kind, k]) => ({ label: k.label, detail: k.detail, icon: k.icon, color: k.color, make: () => template(kind) })),
      { label: 'YouTube', detail: 'Dernières vidéos de vos chaînes et abonnements', icon: 'film.fill', color: '#EF4444', span: 2, make: youtubeSection }],
    categories: FEED_CATALOG.map((c) => ({ label: c.name, icon: c.icon, color: c.color, make: () => categorySection(c, lang) })),
  };
}

/** Ajoute une section à la page affichée : à l'endroit visé (`target`, voir dropTargetAt) ou dans la colonne la moins remplie. */
function addSection(item, target = null) {
  const s = item.make();
  s.title = t(s.title);
  s.page = currentPage();
  withUndo(t('Section « {0} » ajoutée', s.title), () => {
    state.config.sections.push(s);
    if (target) placeCard(s.id, target);
  }, ['Configurer…', () => openSettings(app, { sectionID: s.id })]);
  // La carte arrive parfois sous le bas de l'écran : on l'amène en vue et on la signale un instant.
  setTimeout(() => {
    const card = cards.get(s.id);
    if (!card) return;
    card.classList.add('just-added');
    const frame = frames.get(s.id), top = $('grid').getBoundingClientRect().top + (frame?.y ?? 0);
    if (top < 80 || top + Math.min(frame?.h ?? 0, 200) > innerHeight) window.scrollBy({ top: top - innerHeight / 3, behavior: 'smooth' });
  }, 350);
}

// --- Pages ---
// Les onglets apparaissent dès qu'il y a deux pages. En mode « Organiser », ils sont toujours là et se modifient
// sur place : « + » crée une page, un double-clic la renomme, on les glisse pour changer leur ordre.
let renaming = null;                       // id de la page dont on saisit le nom dans son onglet
let lastTabClick = { id: null, at: 0 };    // pour reconnaître un double-clic même si l'onglet a été redessiné entre les deux
let suppressClick = false;                 // le clic qui suit un glisser ne doit rien déclencher
const pageName = (p) => p.name || t('Sans titre');

function renderPages() {
  const nav = $('pages'), list = pages(), current = currentPage(), editing = state.editing && !app.viewing;
  nav.hidden = list.length < 2 && !editing;
  nav.classList.toggle('editing', editing);
  if (nav.hidden) return nav.replaceChildren();
  if (renaming && nav.querySelector('input')) return;   // saisie en cours : on n'y touche pas
  nav.replaceChildren(...[...list.flatMap((p) => {
    if (editing && renaming === p.id) return [renameField(p)];
    const tab = h('button', { class: 'page-tab', 'aria-current': p.id === current ? 'page' : null,
      title: editing ? 'Double-cliquez pour renommer, glissez pour changer l’ordre' : null,
      onClick: () => {
        if (suppressClick) return;
        const twice = editing && lastTabClick.id === p.id && Date.now() - lastTabClick.at < 450;
        lastTabClick = { id: p.id, at: Date.now() };
        if (twice) renamePage(p.id); else showPage(p.id);
      } }, pageName(p));
    tab.dataset.page = p.id;
    if (!editing) return [tab];
    enableTabDrag(tab, p.id);
    return p.id === current ? [tab, h('button', { class: 'page-more', title: 'Options de la page', 'aria-label': t('Options de la page {0}', pageName(p)),
      onClick: (e) => pageMenu(e.currentTarget, p) }, icon('more'))] : [tab];
  }), editing && h('button', { class: 'page-tab add', title: 'Ajouter une page', 'aria-label': 'Ajouter une page', onClick: (e) => addPageMenu(e.currentTarget) }, icon('plus'), h('span', {}, 'Page'))].filter(Boolean));
}

function showPage(id) {
  if (id === currentPage()) return;
  state.page = id;
  if (!app.viewing) remember('lookout.page', id);
  hideToast();
  renderAll();
  refreshAll();   // les sections de la page sont demandées au serveur (qui respecte leurs intervalles)
  window.scrollTo({ top: 0 });
}

/** Champ de saisie qui remplace l'onglet pendant qu'on renomme la page. Entrée ou un clic ailleurs valide, Échap annule. */
function renameField(p) {
  const input = h('input', { class: 'page-tab rename', value: p.name, maxlength: '40', placeholder: 'Nom de la page', 'aria-label': 'Nom de la page' });
  const fit = () => { input.style.width = `${Math.max(7, input.value.length + 2)}ch`; };
  const done = (save) => {
    if (renaming !== p.id) return;
    renaming = null;
    const name = input.value.trim().slice(0, 40);
    if (save && name && name !== p.name) withUndo('Page renommée', () => { p.name = name; });
    renderPages();
  };
  input.addEventListener('input', fit);
  input.addEventListener('blur', () => done(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') done(true);
    else if (e.key === 'Escape') { e.stopPropagation(); done(false); }
  });
  fit();
  setTimeout(() => { input.focus(); input.select(); });
  return input;
}

function renamePage(id) {
  renaming = id;
  renderPages();
}

// Pages déjà garnies : un point de départ qu'on ajuste ensuite comme n'importe quelle page.
const PAGE_TEMPLATES = [
  { name: 'Matin', icon: 'sun.max.fill', detail: 'Météo, trajets, agenda et grands titres', kinds: ['weather', 'commute', 'calendar'], feeds: ['Actualités'] },
  { name: 'Actualités', icon: 'newspaper.fill', detail: 'À la une, international, politique, économie', feeds: ['Actualités', 'International', 'Politique', 'Économie'] },
  { name: 'Sports', icon: 'sportscourt.fill', detail: 'Pointages et nouvelles du sport', kinds: ['sports'], feeds: ['Sports'] },
  { name: 'Cinéma et séries', icon: 'film.fill', detail: 'Sorties de la semaine, films, séries', kinds: ['releases'], feeds: ['Films', 'Séries et télé'] },
  { name: 'Techno', icon: 'cpu.fill', detail: 'Techno, intelligence artificielle, jeux vidéo', feeds: ['Techno', 'Intelligence artificielle', 'Jeux vidéo'] },
  { name: 'Culture', icon: 'music.note', detail: 'Culture, musique, livres', feeds: ['Culture', 'Musique', 'Livres'] },
  { name: 'Vidéos', icon: 'film.fill', detail: 'Les dernières vidéos de vos chaînes YouTube', youtube: true },
];
function templateSections(tpl) {
  const lang = document.documentElement.lang;
  const feeds = (tpl.feeds ?? []).map((name) => FEED_CATALOG.find((c) => c.name === name)).filter(Boolean).map((c) => categorySection(c, lang));
  // Le premier fil d'une page d'actualités prend la place d'honneur.
  if (feeds[0] && feeds.length + (tpl.kinds?.length ?? 0) > 2) Object.assign(feeds[0], { span: 2, maxItems: 7 }, { feed: { ...feeds[0].feed, layout: 'headline', showSummary: true } });
  return [...(tpl.kinds ?? []).map((kind) => template(kind)), ...(tpl.youtube ? [youtubeSection()] : []), ...feeds].map((s) => ({ ...s, title: t(s.title) }));
}

/** Menu du bouton « + Page » : une page vide, ou une page déjà garnie. */
function addPageMenu(anchor) {
  openMenu(anchor, [
    { label: 'Page vide', icon: icon('plus'), action: () => addPage() },
    '-', { heading: 'Page déjà garnie' },
    ...PAGE_TEMPLATES.map((tpl) => ({ label: tpl.name, detail: tpl.detail, icon: sfIcon(tpl.icon), action: () => addPage(null, tpl) })),
  ]);
}

/** Crée une page et l'affiche. Vide : propose aussitôt de la nommer. `sectionID` : une section à y emporter. `tpl` : un modèle. */
function addPage(sectionID = null, tpl = null) {
  const page = newPage(t(tpl ? tpl.name : 'Nouvelle page'));
  withUndo(sectionID ? 'Section déplacée vers une nouvelle page' : tpl ? t('Page « {0} » ajoutée', page.name) : 'Page ajoutée', () => {
    pages().push(page);
    const s = sectionID && section(sectionID);
    if (s) { s.page = page.id; s.column = -1; }
    if (tpl) state.config.sections.push(...templateSections(tpl).map((x) => ({ ...x, page: page.id })));
  });
  state.page = page.id;
  remember('lookout.page', page.id);
  state.editing = true;
  renaming = tpl ? null : page.id;
  renderAll();
  window.scrollTo({ top: 0 });
}

function movePage(p, direction) {
  withUndo('Pages réorganisées', () => {
    const list = pages(), i = list.indexOf(p), j = i + direction;
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
  });
}

async function deletePage(p) {
  const list = pages(), count = state.config.sections.filter((s) => s.page === p.id).length;
  if (list.length < 2) return;
  if (count && !await confirmDialog('Supprimer cette page ?', t('Ses {0} sections seront déplacées vers une autre page, pas supprimées.', count), 'Supprimer')) return;
  withUndo('Page supprimée', () => {
    list.splice(list.indexOf(p), 1);
    for (const s of state.config.sections) if (s.page === p.id) { s.page = list[0].id; s.column = -1; }
  });
  state.page = list[0].id;
  remember('lookout.page', state.page);
  renderAll();
  refreshAll();
}

function pageMenu(anchor, p) {
  const list = pages(), i = list.indexOf(p);
  openMenu(anchor, [
    { label: 'Renommer', action: () => renamePage(p.id) },
    { label: 'Déplacer à gauche', icon: icon('left'), disabled: i === 0, action: () => movePage(p, -1) },
    { label: 'Déplacer à droite', icon: icon('right'), disabled: i === list.length - 1, action: () => movePage(p, 1) },
    '-',
    { label: 'Supprimer la page', icon: icon('trash'), disabled: list.length < 2, action: () => deletePage(p) },
  ]);
}

/** Change l'ordre des pages en glissant un onglet : il prend sa place à mesure qu'on le déplace. */
let tabDrag = null;
function enableTabDrag(tab, id) {
  tab.addEventListener('pointerdown', (e) => {
    if (tabDrag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    tabDrag = { id, tab, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
    window.addEventListener('pointermove', moveTab);
    window.addEventListener('pointerup', endTab);
    window.addEventListener('pointercancel', endTab);
  });
}
function moveTab(e) {
  if (!tabDrag || e.pointerId !== tabDrag.pointerId) return;
  const nav = $('pages'), { tab } = tabDrag;
  if (!tabDrag.active) {
    if (Math.hypot(e.clientX - tabDrag.startX, e.clientY - tabDrag.startY) < 8) return;
    tabDrag.active = true;
    tab.classList.add('moving');
    document.body.classList.add('is-dragging');
    nav.querySelector('.page-more')?.remove();
  }
  // L'onglet devant lequel s'insérer : le premier dont le milieu est après le pointeur, rangée par rangée.
  const before = [...nav.querySelectorAll('.page-tab[data-page]')].filter((el) => el !== tab).find((el) => {
    const r = el.getBoundingClientRect();
    return e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2);
  }) ?? nav.querySelector('.page-tab.add');
  if (tab.nextElementSibling !== before) nav.insertBefore(tab, before);
}
function endTab(e) {
  if (!tabDrag || e.pointerId !== tabDrag.pointerId) return;
  const { active } = tabDrag;
  tabDrag = null;
  window.removeEventListener('pointermove', moveTab);
  window.removeEventListener('pointerup', endTab);
  window.removeEventListener('pointercancel', endTab);
  if (!active) return;
  document.body.classList.remove('is-dragging');
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 50);
  const order = [...$('pages').querySelectorAll('.page-tab[data-page]')].map((el) => el.dataset.page);
  if (e.type === 'pointerup') withUndo('Pages réorganisées', () => { pages().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); });
  renderPages();
}

let showCategories = false;
function renderBanner() {
  const banner = $('edit-banner');
  banner.hidden = !state.editing;
  $('edit-zone').classList.toggle('editing', state.editing);
  if (!state.editing) return;
  // Sur un grand écran, la palette et les onglets restent sous la barre du haut pendant qu'on fait défiler la page.
  document.documentElement.style.setProperty('--topbar-h', `${$('topbar').offsetHeight}px`);
  const { kinds, categories } = paletteItems();
  const tile = (item) => {
    const el = h('button', { class: 'pal', title: item.detail ?? null }, badge({ icon: item.icon, colorHex: item.color }, true), h('span', {}, item.label));
    enableTileDrag(el, item);
    return el;
  };
  banner.replaceChildren(...[
    h('div', { class: 'edit-top' },
      h('strong', {}, 'Ajouter une section'),
      h('span', { class: 'grow' }, 'Cliquez sur un type, ou glissez-le à l’endroit voulu sur la page.'),
      h('button', { class: 'btn', title: 'Replace toutes les cartes de cette page dans les colonnes les moins remplies',
        onClick: () => withUndo('Disposition réorganisée', () => { for (const s of visible()) s.column = -1; }) }, icon('grid'), 'Réorganiser automatiquement'),
      h('button', { class: 'btn primary', onClick: () => setEditing(false) }, 'Terminé')),
    h('div', { class: 'palette' }, kinds.map(tile),
      h('button', { class: 'pal toggle', 'aria-expanded': String(showCategories), onClick: () => { showCategories = !showCategories; renderBanner(); } },
        h('span', {}, 'Fils par catégorie'), icon(showCategories ? 'up' : 'down'))),
    showCategories && h('div', { class: 'palette categories' }, categories.map(tile)),
    h('div', { class: 'edit-hint' }, icon('drag'), h('span', {}, 'Glissez une carte par son en-tête pour la déplacer ; déposez-la sur un onglet pour la changer de page.'))].filter(Boolean));
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
function withUndo(message, change, extra = null) {
  const take = () => JSON.stringify([state.config.sections, state.config.pages]);
  const snapshot = take(), page = state.page;
  change();
  if (take() === snapshot) return;
  commit();
  showToast(message, 'Annuler', () => {
    [state.config.sections, state.config.pages] = JSON.parse(snapshot);
    state.page = page;
    renaming = null;
    commit();
  }, { extra });
}

/** Bandeau en bas de l'écran : un message et une action (plus une seconde, `extra`). Il disparaît seul, sauf s'il est persistant. */
function showToast(message, actionLabel, action, { persistent = false, extra = null } = {}) {
  const button = (label, run) => h('button', { class: 'btn small', onClick: () => { hideToast(); run(); } }, label);
  toast.replaceChildren(...[h('span', {}, message), extra && button(...extra), button(actionLabel, action)].filter(Boolean));
  toast.hidden = false;
  clearTimeout(toastTimer);
  if (!persistent) toastTimer = setTimeout(hideToast, 8000);
}

// --- Nouvelle version installée sur le serveur ---
// Une page peut rester ouverte des jours (onglet oublié, app sur l'écran d'accueil de l'iPhone). Elle vérifie
// donc régulièrement si le serveur a été mis à jour ; si oui elle se recharge, sauf si vous êtes en train de
// faire quelque chose, auquel cas elle vous le propose.
let versionChecked = 0;
async function checkVersion(now = false) {
  if (!app.build || (!now && Date.now() - versionChecked < 60e3)) return;
  versionChecked = Date.now();
  let about;
  try { about = await api('/api/about'); } catch { return; }
  if (!about.build || about.build === app.build) return;
  // Recharge en changeant l'adresse de la page, pour contourner un éventuel cache de la page elle-même.
  const reload = () => {
    try { sessionStorage.setItem('lookout.reloadedFor', about.build); } catch { /* stockage indisponible */ }
    const query = new URLSearchParams(location.search);
    query.set('v', about.build);   // garde le reste de l'adresse (profil consulté, par exemple)
    location.replace(`${location.pathname}?${query}`);
  };
  // Déjà rechargée pour cette version sans succès (un cache sert encore l'ancienne page) : on n'insiste pas,
  // pour ne jamais recharger en boucle. On le signale seulement.
  let alreadyTried = false;
  try { alreadyTried = sessionStorage.getItem('lookout.reloadedFor') === about.build; } catch { /* stockage indisponible */ }
  const busy = hasOverlay() || state.editing || drag || document.activeElement?.matches?.('input, textarea, select');
  if (!busy && !alreadyTried) return reload();
  showToast('Nouvelle version de Lookout disponible', 'Recharger', reload, { persistent: true });
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

const SPANS = [[1, '1 colonne'], [2, '2 colonnes'], [3, '3 colonnes'], [99, 'Pleine largeur']];
/** Largeur suivante quand on appuie sur le bouton du mode « Organiser » : 1 → 2 → 3 → pleine largeur → 1. */
const nextSpan = (span) => SPANS[(SPANS.findIndex(([value]) => value === span) + 1) % SPANS.length][0];

/** Articles affichés par une section et pas encore lus. */
function unreadShown(s) {
  const articles = state.data.get(s.id)?.articles;
  return articles ? shownArticles(s, articles, general(), skipFor(s)).filter((a) => !state.readIDs.has(a.id)).map((a) => a.id) : [];
}
/** Marque comme lus tous les articles affichés par la section ; un bandeau permet de revenir en arrière. */
function markAllRead(s) {
  const ids = unreadShown(s);
  if (!ids.length) return;
  setRead(ids, true, true);
  showToast(ids.length > 1 ? t('{0} articles marqués comme lus', ids.length) : t('Article marqué comme lu'), 'Annuler', () => setRead(ids, false, true));
}
/** Marque comme lus tous les articles affichés sur la page courante, toutes sections confondues. */
function markPageRead() {
  const ids = [...new Set(visible().flatMap(unreadShown))];
  if (!ids.length) return;
  setRead(ids, true, true);
  showToast(ids.length > 1 ? t('{0} articles marqués comme lus', ids.length) : t('Article marqué comme lu'), 'Annuler', () => setRead(ids, false, true));
}

function cardMenu(anchor, s) {
  const payload = state.data.get(s.id);
  // Profil d'un autre : on peut seulement redemander les données.
  if (app.viewing) return openMenu(anchor, [{ label: 'Mettre à jour maintenant', icon: icon('refresh'), action: () => loadSection(s.id, true) }]);
  openMenu(anchor, [
    { label: 'Mettre à jour maintenant', icon: icon('refresh'), action: () => loadSection(s.id, true) },
    payload?.articles && { label: 'Tout marquer comme lu', icon: icon('check-on'), action: () => markAllRead(s) },
    '-',
    { heading: 'Largeur' },
    ...SPANS.map(([value, label]) => ({ label, checked: s.span === value, action: () => updateSection(s.id, 'Largeur modifiée', (x) => { x.span = value; }) })),
    '-',
    { label: 'Configurer…', icon: icon('gear'), action: () => openSettings(app, { sectionID: s.id }) },
    // Avec plusieurs pages : envoyer la carte sur une autre.
    ...(pages().length > 1 ? ['-', { heading: 'Déplacer vers la page' }, ...pages().filter((p) => p.id !== s.page).map((p) => ({
      label: p.name || 'Sans titre', action: () => updateSection(s.id, 'Section déplacée', (x) => { x.page = p.id; x.column = -1; }) }))] : []),
    // Administrateur : déposer une copie de cette section chez un autre profil.
    ...(app.user?.role === 'admin' ? ['-', { label: 'Envoyer à un profil…', icon: icon('users'), action: () => sendSection(anchor, s) }] : []),
    '-',
    { label: 'Masquer', icon: icon('hide'), action: () => updateSection(s.id, 'Section masquée', (x) => { x.enabled = false; }) },
  ]);
}

/** Menu des profils à qui envoyer une copie de la section (réglages et clés compris). */
async function sendSection(anchor, s) {
  let others;
  try {
    await saveNow();   // le serveur copie ce qu'il a enregistré : les derniers changements doivent y être
    others = (await api('/api/users')).filter((u) => u.id !== app.user.id);
  } catch (error) { return showNotice(error.message); }
  if (!others.length) return showNotice(t('Aucun autre profil à qui envoyer cette section.'));
  const send = async (targets, done) => {
    try {
      await api(`/api/section/${encodeURIComponent(s.id)}/send`, { method: 'POST', body: { to: targets.map((u) => u.id) } });
      showNotice(done);
    } catch (error) { showNotice(error.message); }
  };
  openMenu(anchor, [
    { heading: t('Envoyer « {0} » à', s.title) },
    ...others.map((u) => ({ label: u.name, action: () => send([u], t('Section envoyée à {0}. Elle apparaîtra à son prochain chargement de la page.', u.name)) })),
    ...(others.length > 1 ? ['-', { label: 'Tous les profils', icon: icon('users'), action: () => send(others, t('Section envoyée à {0} profils.', others.length)) }] : []),
  ]);
}
/** Message bref, sans action à annuler. */
function showNotice(message) { showToast(message, 'OK', () => {}); }

function sourceErrorText(s, payload) {
  const names = new Map([...s.feed.sources, ...s.sports.leagues, ...s.standings.leagues, ...s.calendar.calendars, ...s.hass.entities.map((e) => ({ id: e.id, name: e.name || e.entity })),
    ...s.stocks.symbols.map((x) => ({ id: x.id, name: x.name || x.symbol }))].map((x) => [x.id, x.name]));
  return Object.entries(payload.sourceErrors ?? {}).map(([id, message]) => `${names.get(id) ?? t('Source')} : ${message}`).sort().join('\n');
}

/** Pastille « n nouveaux » dans l'en-tête d'une carte d'articles. */
function newBadge(s, payload) {
  const count = payload?.articles ? countNew(s, payload.articles, ctx) : 0;
  return count > 0 && h('span', { class: 'new-count', title: t('{0} nouveaux depuis votre dernière visite', count) }, String(count));
}

function buildCard(s) {
  const payload = state.data.get(s.id), loading = state.loading.has(s.id);
  const hasContent = payload && (payload.articles || payload.weather || payload.games || payload.routes || payload.releases || payload.summary || payload.events || payload.entities || payload.quotes || payload.tables);
  const errors = payload ? sourceErrorText(s, payload) : '';

  const controls = state.editing
    ? h('div', { class: 'edit-controls' },
      h('button', { class: 'icon-btn', title: 'Monter', 'aria-label': 'Monter', onClick: () => moveInColumn(s.id, -1) }, icon('up')),
      h('button', { class: 'icon-btn', title: 'Descendre', 'aria-label': 'Descendre', onClick: () => moveInColumn(s.id, 1) }, icon('down')),
      h('button', { class: 'icon-btn', title: s.span === 99 ? 'Réduire' : 'Élargir', 'aria-label': 'Changer la largeur',
        onClick: () => updateSection(s.id, 'Largeur modifiée', (x) => { x.span = nextSpan(x.span); }) }, icon(s.span === 99 ? 'narrow' : 'widen')),
      h('button', { class: 'icon-btn', title: 'Configurer…', 'aria-label': 'Configurer…', onClick: () => openSettings(app, { sectionID: s.id }) }, icon('gear')),
      h('button', { class: 'icon-btn', title: 'Masquer la section', 'aria-label': 'Masquer la section', onClick: () => updateSection(s.id, 'Section masquée', (x) => { x.enabled = false; }) }, icon('hide')))
    : [
      !loading && errors && h('span', { class: 'warn', title: errors, role: 'img', 'aria-label': 'Certaines sources sont en erreur' }, icon('warning')),
      // Tout marquer comme lu : offert seulement quand il reste des articles non lus à l'écran.
      !app.viewing && !app.display && unreadShown(s).length > 0 && h('button', { class: 'icon-btn', title: 'Tout marquer comme lu',
        'aria-label': t('Tout marquer comme lu dans la section {0}', s.title), onClick: () => markAllRead(s) }, icon('check-on')),
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
        !app.viewing && h('button', { class: 'btn small', onClick: () => openSettings(app, { sectionID: s.id }) }, 'Configurer…')));
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
  scheduleDisplay();
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
    if (app.viewing) empty.replaceChildren(h('div', { class: 'error-state' }, h('span', {}, 'Ce profil n’affiche aucune section sur cette page.')));
    else if (state.editing) empty.replaceChildren(h('div', { class: 'error-state drop-here' }, h('h2', { style: { margin: '0', color: 'var(--text)' } }, 'Cette page est vide'),
      h('span', {}, 'Cliquez sur un type de section ci-dessus, ou glissez-le ici.')));
    else empty.replaceChildren(h('div', { class: 'error-state' }, h('h2', { style: { margin: '0', color: 'var(--text)' } }, pages().length > 1 ? 'Cette page est vide' : 'Votre tableau de bord est vide'),
      h('span', {}, 'Ajoutez des sections ici même, ou réactivez-en dans les réglages.'),
      h('div', {}, h('button', { class: 'btn primary', onClick: () => setEditing(true) }, icon('plus'), 'Ajouter une section'), ' ',
        h('button', { class: 'btn', onClick: () => openSettings(app) }, 'Ouvrir les réglages'))));
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
    if (drag || app.viewing || app.display || e.target.closest('button, a, input')) return;
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
function dropTargetAt(clientX, clientY, span, exceptID = null) {
  const rect = $('grid').getBoundingClientRect(), px = clientX - rect.left, py = clientY - rect.top;
  const { columns, columnWidth, gap } = metrics;
  const col = Math.min(Math.max(0, Math.floor(px / (columnWidth + gap))), columns - span);
  // Les cartes déjà présentes dans la ou les colonnes visées, de haut en bas.
  const others = [...frames].filter(([id, f]) => id !== exceptID && f.col < col + span && col < f.col + f.span)
    .map(([id, f]) => ({ id, ...f })).sort((a, b) => a.y - b.y);
  const before = others.find((f) => py < f.y + f.h / 2) ?? null;
  const last = others.at(-1);
  const y = before ? before.y - gap / 2 : (last ? last.y + last.h + gap / 2 : 0);
  return { col, before: before?.id ?? null, after: before ? null : (last?.id ?? null), y };
}

/** Trait d'insertion pour une carte de `span` colonnes à l'emplacement `target`. */
function showDropLine(target, span) {
  const { columnWidth, gap } = metrics;
  dropLine.hidden = false;
  dropLine.style.width = `${columnWidth * span + gap * (span - 1)}px`;
  dropLine.style.transform = `translate(${target.col * (columnWidth + gap)}px, ${Math.max(0, target.y - 2)}px)`;
}

/** Onglet de page sous le pointeur (ou le « + »), pour y déposer une carte ; jamais celui de la page affichée. */
function tabUnder(x, y) {
  const nav = $('pages');
  if (nav.hidden) return null;
  const current = currentPage();
  return [...nav.querySelectorAll('.page-tab[data-page], .page-tab.add')].find((el) => {
    const r = el.getBoundingClientRect();
    return el.dataset.page !== current && x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 6 && y <= r.bottom + 6;
  }) ?? null;
}
function markTab(tab) {
  for (const el of $('pages').querySelectorAll('.drop-target')) if (el !== tab) el.classList.remove('drop-target');
  tab?.classList.add('drop-target');
}

function updateDrag() {
  drag.card.style.transform = dragTransform();
  const tab = drag.tab = tabUnder(drag.x, drag.y);
  markTab(tab);
  drag.card.classList.toggle('over-tab', Boolean(tab));
  if (tab) { drag.target = null; dropLine.hidden = true; return; }
  const span = frames.get(drag.id).span;
  showDropLine(drag.target = dropTargetAt(drag.x, drag.y, span, drag.id), span);
}

/** Fait défiler la page quand on approche du haut ou du bas de l'écran pendant un glisser. */
function scrollNearEdge(y) {
  const edge = 70, speed = 14;
  if (y < edge) window.scrollBy(0, -speed * (1 - Math.max(0, y) / edge));
  else if (y > innerHeight - edge) window.scrollBy(0, speed * (1 - Math.max(0, innerHeight - y) / edge));
}
function autoScroll() {
  if (!drag?.active) return;
  scrollNearEdge(drag.y);
  updateDrag();
  requestAnimationFrame(autoScroll);
}

function endDrag(cancelled) {
  const { id, card, head, pointerId, active, target, tab, stale } = drag;
  try { if (head.hasPointerCapture(pointerId)) head.releasePointerCapture(pointerId); } catch { /* déjà relâché */ }
  drag = null;
  card.classList.remove('dragging', 'over-tab');
  document.body.classList.remove('is-dragging');
  markTab(null);
  dropLine.hidden = true;
  dropLine.remove();
  if (active && !cancelled && tab) return tab.dataset.page ? moveToPage(id, tab.dataset.page) : addPage(id);
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

/** Envoie une section sur une autre page ; elle s'y range dans la colonne la moins remplie. */
function moveToPage(id, pageID) {
  const page = pages().find((p) => p.id === pageID), s = section(id);
  if (!page || !s) return;
  withUndo(t('Section déplacée vers « {0} »', pageName(page)), () => { s.page = pageID; s.column = -1; }, ['Voir la page', () => showPage(pageID)]);
  renderAll();
}

// --- Glisser une nouvelle section depuis la palette ---
// À la souris ou au stylet seulement : au doigt, un toucher ajoute la section, qu'on déplace ensuite comme les autres.
let newDrag = null;
function enableTileDrag(tile, item) {
  tile.addEventListener('click', () => { if (!suppressClick) addSection(item); });
  tile.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0 || newDrag || drag) return;
    newDrag = { item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, ghost: null, target: null };
    window.addEventListener('pointermove', moveNew);
    window.addEventListener('pointerup', endNew);
    window.addEventListener('pointercancel', endNew);
  });
}
function updateNew() {
  const d = newDrag, grid = $('grid').getBoundingClientRect(), span = Math.min(d.item.span ?? 1, metrics.columns);
  d.ghost.style.transform = `translate(${d.x + 14}px, ${d.y + 12}px)`;
  // Au-dessus de la grille (palette, onglets) : rien ne serait ajouté en lâchant ici.
  d.target = d.y > grid.top - 12 ? dropTargetAt(d.x, d.y, span) : null;
  d.ghost.classList.toggle('ready', Boolean(d.target));
  if (d.target) showDropLine(d.target, span); else dropLine.hidden = true;
}
function moveNew(e) {
  const d = newDrag;
  if (!d || e.pointerId !== d.pointerId) return;
  d.x = e.clientX;
  d.y = e.clientY;
  if (!d.active) {
    if (Math.hypot(d.x - d.startX, d.y - d.startY) < 6) return;
    d.active = true;
    if (!metrics.columnWidth || frames.size !== visible().length) layout();
    d.ghost = h('div', { class: 'pal ghost' }, badge({ icon: d.item.icon, colorHex: d.item.color }, true), h('span', {}, d.item.label));
    document.body.append(d.ghost);
    document.body.classList.add('is-dragging');
    $('grid').append(dropLine);
    const loop = () => { if (!newDrag?.active) return; scrollNearEdge(newDrag.y); updateNew(); requestAnimationFrame(loop); };
    loop();
  }
  e.preventDefault();
  updateNew();
}
function endNew(e) {
  const d = newDrag;
  if (!d || (e && e.pointerId !== d.pointerId)) return;
  newDrag = null;
  window.removeEventListener('pointermove', moveNew);
  window.removeEventListener('pointerup', endNew);
  window.removeEventListener('pointercancel', endNew);
  if (!d.active) return;
  d.ghost.remove();
  document.body.classList.remove('is-dragging');
  dropLine.hidden = true;
  dropLine.remove();
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 50);
  if (e?.type === 'pointerup' && d.target) addSection(d.item, d.target);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (drag?.active) endDrag(true);
  if (newDrag?.active) endNew(null);
});

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
  user: null,
  sharedKeys: {},
  display: false,   // mode affichage (écran mural)
  startDisplay,
  viewing: null,   // { id, name } quand un administrateur consulte le profil d'un autre, en lecture seule
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

/**
 * Adresse « ?voir=<profil> » : un administrateur consulte le tableau de bord d'un autre profil.
 * Tout est en lecture seule, et un bandeau le rappelle en permanence.
 */
async function enterViewMode() {
  const id = new URLSearchParams(location.search).get('voir');
  if (!id || id === app.user.id || app.user.role !== 'admin') return;
  let target;
  try { target = (await api('/api/users')).find((u) => u.id === id); } catch { return; }
  if (!target) return;
  app.viewing = { id: target.id, name: target.name };
  viewProfile(target.id);
  document.body.classList.add('viewing');
  const leave = () => { location.href = location.pathname; };
  $('view-banner').hidden = false;
  $('view-banner').replaceChildren(icon('users'), h('span', { class: 'grow' }, t('Profil de {0} — lecture seule. Rien de ce que vous faites ici ne modifie ses réglages.', target.name)),
    h('button', { class: 'btn primary', onClick: leave }, 'Revenir à mon profil'));
}

/** Pastille du compte, en haut à droite : initiale du nom, menu du compte. */
function renderUserButton() {
  const button = $('btn-user');
  button.hidden = false;
  button.textContent = app.user.name.charAt(0).toUpperCase();
  button.title = app.user.name;
  button.onclick = () => openMenu(button, app.viewing ? [
    { heading: app.user.name },
    { label: 'Revenir à mon profil', icon: icon('back'), action: () => { location.href = location.pathname; } },
    '-',
    { label: 'Se déconnecter', icon: icon('signout'), action: signOut },
  ] : [
    { heading: app.user.name },
    { label: 'Mon compte…', icon: icon('user'), action: () => openSettings(app, { tab: 'account' }) },
    { label: 'Mode affichage', icon: sfIcon('desktopcomputer'), action: () => startDisplay() },
    !matchMedia('(pointer: coarse)').matches && { label: 'Raccourcis clavier', icon: icon('key'), action: shortcutsDialog },
    app.user.role === 'admin' && { label: 'Profils…', icon: icon('users'), action: () => openSettings(app, { tab: 'users' }) },
    '-',
    { label: 'Se déconnecter', icon: icon('signout'), action: signOut },
  ]);
}

// --- Raccourcis clavier ---
const SHORTCUTS = [[['/'], 'Rechercher dans les articles et les agendas'], [['⌘', 'K'], 'Rechercher (Ctrl+K sous Windows et Linux)'], [['R'], 'Actualiser les sections'],
  [['E'], 'Organiser le tableau de bord'], [['M'], 'Tout marquer comme lu sur la page'], [['L'], 'Ouvrir « À lire plus tard »'], [['1', '…', '9'], 'Aller à la page de ce rang'], [['←', '→'], 'Page précédente ou suivante'],
  [['⌘', ','], 'Ouvrir les réglages'], [['?'], 'Afficher cette aide'], [['Échap'], 'Fermer une fenêtre, quitter le mode affichage']];
function shortcutsDialog() {
  if (hasOverlay()) return;
  openDialog((close) => [h('h3', {}, 'Raccourcis clavier'),
    h('dl', { class: 'shortcuts' }, SHORTCUTS.map(([keys, label]) => [h('dt', {}, keys.map((k) => (k === '…' ? h('span', {}, '…') : h('kbd', {}, k)))), h('dd', {}, label)])),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onClick: close }, 'Fermer'))]);
}

$('btn-refresh').append(icon('refresh'));
$('btn-edit').append(icon('grid'));
$('btn-settings').append(icon('gear-bold'));
$('btn-refresh').addEventListener('click', () => refreshAll());
$('btn-edit').addEventListener('click', () => setEditing(!state.editing));
$('btn-settings').addEventListener('click', () => openSettings(app));
$('btn-saved').addEventListener('click', savedDialog);
$('btn-readall').append(icon('check-on'));
$('btn-readall').addEventListener('click', markPageRead);
$('btn-search').append(icon('search'));
$('btn-search').addEventListener('click', searchDialog);
$('display-exit').addEventListener('click', stopDisplay);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.display && !hasOverlay() && !document.fullscreenElement) return stopDisplay();
  if (hasOverlay() || e.target.matches?.('input, textarea, select')) return;
  if (e.key === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) refreshAll();
  if ((e.key === '/' && !e.metaKey && !e.ctrlKey) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); if (state.config && !app.display) searchDialog(); }
  if (e.key === ',' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSettings(app); }
  if (e.metaKey || e.ctrlKey || e.altKey || !state.config || app.display) return;
  if (e.key === '?') shortcutsDialog();
  if (e.key === 'e' && !app.viewing) setEditing(!state.editing);
  if (e.key === 'm' && !app.viewing) markPageRead();
  if (e.key === 'l' && state.saved.length && !app.viewing) savedDialog();
  // Pages : par leur rang, ou de proche en proche avec les flèches.
  const list = pages(), at = list.findIndex((p) => p.id === currentPage());
  if (/^[1-9]$/.test(e.key) && list[Number(e.key) - 1] && list.length > 1) showPage(list[Number(e.key) - 1].id);
  if (e.key === 'ArrowRight' && list.length > 1) showPage(list[(at + 1) % list.length].id);
  if (e.key === 'ArrowLeft' && list.length > 1) showPage(list[(at - 1 + list.length) % list.length].id);
});

(async () => {
  try {
    // Qui est là ? Sans session, on affiche la connexion (ou la création de l'administrateur) et on s'arrête.
    language = resolveLang('auto', navigator.languages ?? [navigator.language]);
    document.documentElement.lang = language;
    const auth = await api('/api/auth/state');
    if (!auth.user) {
      // Pas encore de réglages à appliquer : l'écran de connexion suit le thème de l'appareil.
      Object.assign(document.documentElement.dataset, { theme: darkQuery.matches ? 'dark' : 'light', tinted: 'true' });
      return showAuth(auth);
    }
    // Mot de passe provisoire donné par un administrateur : on choisit le sien avant d'aller plus loin.
    if (auth.user.mustChangePassword) {
      Object.assign(document.documentElement.dataset, { theme: darkQuery.matches ? 'dark' : 'light', tinted: 'true' });
      return showPasswordChange(auth.user);
    }
    app.user = auth.user;
    whenSignedOut(() => location.reload());
    renderUserButton();
    await enterViewMode();
    const [config, read, about, sharedKeys] = await Promise.all([api('/api/config'), api('/api/read'), api('/api/about'),
      api('/api/shared-keys', { asViewed: false }).catch(() => ({}))]);
    app.sharedKeys = sharedKeys;   // clés d'API fournies par l'administrateur : { tomtomKey: true, … }
    app.version = about.version;
    // Version de l'interface réellement chargée : elle est dans l'adresse de ce script (« /v/<empreinte>/app.js »).
    app.build = /\/v\/([0-9a-f]{12})\//.exec(import.meta.url)?.[1] ?? about.build;
    if (app.build !== about.build) checkVersion(true);   // page plus ancienne que le serveur : on se met à jour
    state.config = config;
    state.readIDs = new Set(read);
    if (!app.viewing) api('/api/saved').then(applySaved).catch(() => {});
    if (!app.viewing) googleFollowUp();
    // Profil tout neuf : quelques questions pour remplacer le tableau de bord d'exemple par le sien.
    if (!app.viewing && !app.display && state.config.general.onboarded === false) runOnboarding(app);
    // Appareil abonné aux notifications : son service worker se met à jour avec l'application.
    navigator.serviceWorker?.getRegistration().then((registration) => registration?.update()).catch(() => {});
    if (new URLSearchParams(location.search).has('affichage')) startDisplay({ fullscreen: false });
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
