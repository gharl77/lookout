// Briefing — réglages : sections (liste + éditeur), général, données.
import { h, icon, sfIcon, badge, fmt, SF_NAMES, t, api, openMenu, openPopover, openDialog, confirmDialog } from './ui.js';
import { signOut } from './auth.js';
import { KINDS, SWATCHES, FEED_CATALOG, LEAGUES, PROVIDER_LABELS, REFRESH_CHOICES, template, feedSource, league as newLeague, commuteRoute, calendarSource, hassEntity, stockSymbol, YOUTUBE_REFRESH, newPage, uuid, SECRET_MASK,
  categorySection, youtubeSection, youtubeFeedURL, youtubeChannelID, parseSubscriptions, SUMMARY_MODELS } from './shared.js';

let closeCurrent = null;

/**
 * Menu « Ajouter une section » : les types de section, YouTube, puis les catégories de fils prêtes à l'emploi.
 * `add(section)` reçoit la section créée (titre déjà dans la langue de l'interface).
 */
export function addSectionMenu(anchor, add) {
  const lang = document.documentElement.lang;
  const ready = (s) => { s.title = t(s.title); add(s); };
  openMenu(anchor, [
    ...Object.entries(KINDS).map(([kind, k]) => ({ label: k.label, detail: k.detail, icon: sfIcon(k.icon), action: () => ready(template(kind)) })),
    { label: 'YouTube', detail: 'Dernières vidéos de vos chaînes et abonnements', icon: sfIcon('film.fill'), action: () => ready(youtubeSection()) },
    '-',
    { label: 'Fils par catégorie…', detail: 'Films, séries, culture, science, jeux vidéo…', icon: sfIcon('tag.fill'), action: () => openMenu(anchor, [
      { heading: 'Section prête à l’emploi' },
      ...FEED_CATALOG.map((c) => ({ label: c.name, icon: sfIcon(c.icon), action: () => ready(categorySection(c, lang)) }))]) },
  ]);
}

export function openSettings(app, { sectionID = null, tab = null } = {}) {
  if (app.viewing) return;   // profil d'un autre, en lecture seule : aucun réglage à modifier
  closeCurrent?.();
  const config = () => app.state.config;
  // `nav` ne compte que sur un petit écran : on y voit d'abord la liste des rubriques, puis la rubrique choisie.
  const ui = { tab: tab ?? 'sections', selected: sectionID ?? config().sections[0]?.id ?? null, detail: Boolean(sectionID), nav: !tab && !sectionID, query: '' };
  const root = h('div', { class: 'settings-root', style: { display: 'contents' } });
  const commit = () => app.commit();

  // --- Contrôles de formulaire ---
  const group = (title, rows, footer) => h('div', { class: 'group' }, title && h('h3', {}, title),
    h('div', { class: 'box' }, rows), footer && h('p', {}, footer));
  const line = (label, ...control) => h('div', { class: 'line' }, h('span', { class: 'lbl' }, label), h('div', { class: 'ctl' }, control));
  const text = (obj, key, { placeholder = '', mono = false, bare = true, label, onInput, type = 'text' } = {}) =>
    h('input', { class: `field${bare ? ' bare' : ''}${mono ? ' mono' : ''}`, type, value: obj[key] ?? '', placeholder, 'aria-label': label ?? placeholder,
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      onInput: (e) => { obj[key] = e.target.value; commit(); onInput?.(); } });
  const toggle = (obj, key, { label, rerender = false } = {}) =>
    h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: Boolean(obj[key]), 'aria-label': label,
      onChange: (e) => { obj[key] = e.target.checked; commit(); if (rerender) render(); else refreshList(); } });
  const select = (obj, key, options, { rerender = false, label } = {}) => {
    const el = h('select', { class: 'field', 'aria-label': label,
      onChange: (e) => { obj[key] = options[e.target.selectedIndex][0]; commit(); if (rerender) render(); } },
    options.map(([value, name]) => h('option', { selected: obj[key] === value }, name)));
    return el;
  };
  const seg = (obj, key, options, { rerender = true } = {}) => h('div', { class: 'seg', role: 'group' },
    options.map(([value, name, ic]) => h('button', { 'aria-pressed': String(obj[key] === value),
      onClick: () => { obj[key] = value; commit(); if (rerender) render(); } }, ic && icon(ic), name)));
  const stepper = (obj, key, min, max) => {
    const value = h('b', {}, String(obj[key]));
    const step = (d) => () => { obj[key] = Math.min(max, Math.max(min, Number(obj[key]) + d)); value.textContent = String(obj[key]); commit(); };
    return h('div', { class: 'stepper' }, value, h('div', { class: 'seg' },
      h('button', { 'aria-label': 'Diminuer', onClick: step(-1) }, icon('minus')), h('button', { 'aria-label': 'Augmenter', onClick: step(1) }, icon('plus'))));
  };
  const swatches = (obj, key, onChange) => h('div', { class: 'swatches' },
    SWATCHES.map((c) => h('button', { class: 'swatch', style: { '--c': c }, 'aria-label': t('Couleur {0}', c), 'aria-pressed': String(obj[key].toUpperCase() === c),
      onClick: () => { obj[key] = c; commit(); onChange?.(); render(); } }, obj[key].toUpperCase() === c && icon('check'))),
    h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[key]) ? obj[key] : '#3B82F6', title: 'Couleur personnalisée', 'aria-label': 'Couleur personnalisée',
      onInput: (e) => { obj[key] = e.target.value.toUpperCase(); commit(); onChange?.(); refreshList(); } }));
  /** Boutons monter / descendre / supprimer pour un élément d'une liste modifiable. */
  const rowControls = (list, item) => {
    const i = list.indexOf(item);
    const swap = (j) => () => { [list[i], list[j]] = [list[j], list[i]]; commit(); render(); };
    return h('div', { class: 'ctrls' },
      h('button', { class: 'icon-btn', title: 'Monter', 'aria-label': 'Monter', disabled: i === 0, onClick: swap(i - 1) }, icon('up')),
      h('button', { class: 'icon-btn', title: 'Descendre', 'aria-label': 'Descendre', disabled: i >= list.length - 1, onClick: swap(i + 1) }, icon('down')),
      h('button', { class: 'icon-btn', title: 'Supprimer', 'aria-label': 'Supprimer', onClick: () => { list.splice(i, 1); commit(); render(); } }, icon('trash')));
  };
  const statusDot = (section, id, enabled) => {
    if (!enabled) return null;
    const payload = app.state.data.get(section.id);
    if (!payload || app.state.loading.has(section.id)) return null;
    const error = payload.sourceErrors?.[id] ?? (payload.updatedAt ? null : payload.error);
    return error ? h('span', { class: 'status-bad', title: error, role: 'img', 'aria-label': t('Erreur : {0}', error) }, icon('warning'))
      : h('span', { class: 'status-ok', title: 'Source fonctionnelle', role: 'img', 'aria-label': 'Source fonctionnelle' }, icon('check-on'));
  };

  // --- Éditeur de section ---
  const SPANS = [[1, '1 colonne'], [2, '2 colonnes'], [3, '3 colonnes'], [99, 'Pleine largeur']];
  const INTERVAL_LABELS = { 5: 'Toutes les 5 minutes', 10: 'Toutes les 10 minutes', 15: 'Toutes les 15 minutes', 30: 'Toutes les 30 minutes', 60: 'Toutes les heures', 120: 'Toutes les 2 heures' };
  const intervalLabel = (minutes) => t(INTERVAL_LABELS[minutes] ?? 'Toutes les 30 minutes');
  const ITEMS_LABEL = { calendar: "Nombre d'événements", feed: "Nombre d'articles", api: "Nombre d'articles", sports: 'Nombre de matchs', commute: 'Nombre de trajets', releases: 'Nombre de sorties', summary: 'Nombre de points', hass: "Nombre d'entités", stocks: 'Nombre de cours', standings: 'Meneurs par catégorie' };

  function iconPicker(s) {
    return h('button', { class: 'btn', 'aria-label': 'Choisir une icône', onClick: (e) => openPopover(e.currentTarget, (close) =>
      h('div', { class: 'icon-grid', style: { '--c': s.colorHex } }, SF_NAMES.map((name) =>
        h('button', { 'aria-label': name, 'aria-pressed': String(name === s.icon), onClick: () => { s.icon = name; commit(); close(); render(); } }, sfIcon(name)))),
    { width: 348 }) }, badge(s, true), icon('down'));
  }

  function commonGroup(s) {
    return group(KINDS[s.kind].label, [
      line('Titre', text(s, 'title', { label: 'Titre', onInput: refreshList })),
      line('Icône', iconPicker(s)),
      line('Couleur', swatches(s, 'colorHex')),
      line('Afficher dans le tableau de bord', toggle(s, 'enabled', { label: 'Afficher dans le tableau de bord' })),
      line('Largeur', select(s, 'span', SPANS, { label: 'Largeur' })),
      line('Page', pageSelect(s)),
      s.kind !== 'weather' && line(ITEMS_LABEL[s.kind], stepper(s, 'maxItems', 1, s.kind === 'standings' ? 10 : 40)),
      // Après le changement, on redemande la section : le serveur applique tout de suite le nouvel intervalle.
      line('Interroger les sources', h('span', { onChange: () => app.saveNow().then(() => app.loadSection(s.id)) }, select(s, 'refreshMinutes',
        [[0, t('Par défaut ({0} min)', s.kind === 'feed' && s.feed.youtube ? YOUTUBE_REFRESH : config().general.refreshMinutes)], ...REFRESH_CHOICES.map((m) => [m, intervalLabel(m)])], { label: 'Interroger les sources' }))),
    ], KINDS[s.kind].detail);
  }

  /** Choix de la page d'une section ; la dernière entrée crée une page et y place la section. */
  function pageSelect(s) {
    const list = config().pages;
    return h('select', { class: 'field', 'aria-label': 'Page', onChange: async (e) => {
      if (e.target.value !== '+') { s.page = e.target.value; s.column = -1; commit(); return render(); }
      const name = await askText('Nouvelle page', 'Nom de la page', 'Créer');
      if (name) { const page = newPage(name.slice(0, 40)); list.push(page); s.page = page.id; s.column = -1; commit(); }
      render();   // annulé : le choix revient à la page actuelle
    } },
    list.map((p) => h('option', { value: p.id, selected: p.id === s.page }, p.name || t('Sans titre'))),
    h('option', { value: '+' }, t('Nouvelle page…')));
  }
  /** Demande un court texte dans une fenêtre. Renvoie le texte, ou null si la fenêtre est fermée. */
  const askText = (title, placeholder, actionLabel) => new Promise((resolve) => {
    let answer = null;
    openDialog((close) => {
      const input = h('input', { class: 'field', placeholder: t(placeholder), 'aria-label': placeholder, maxlength: '40', autofocus: true });
      return h('form', { style: { display: 'contents' }, novalidate: true, onSubmit: (e) => { e.preventDefault(); if (!input.value.trim()) return input.focus(); answer = input.value.trim(); close(); } },
        h('h3', {}, title), input,
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: close }, 'Annuler'), h('button', { class: 'btn primary', type: 'submit' }, actionLabel)));
    }, { onClose: () => resolve(answer) });
  });

  /** Marche à suivre pour exporter ses abonnements YouTube depuis Google Takeout. */
  function takeoutHelp() {
    const STEPS = [
      "Ouvrez takeout.google.com, connecté au compte Google que vous utilisez sur YouTube.",
      "Cliquez « Tout désélectionner », en haut de la liste des produits.",
      "Tout en bas de la liste, cochez « YouTube et YouTube Music ».",
      "Sur cette même ligne, cliquez « Toutes les données YouTube incluses », puis « Tout désélectionner », et cochez seulement « abonnements ». Validez.",
      "Cliquez « Étape suivante », puis « Créer une exportation ». Google vous envoie un courriel quand l'archive est prête, d'ordinaire en quelques minutes.",
      "Téléchargez l'archive et ouvrez-la : le fichier se trouve dans Takeout → YouTube et YouTube Music → abonnements → abonnements.csv.",
      "Revenez ici et choisissez ce fichier avec « Importer mes abonnements… ».",
    ];
    openDialog((close) => [h('h3', {}, 'Exporter mes abonnements YouTube'),
      h('ol', { class: 'steps' }, STEPS.map((step) => h('li', {}, step))),
      h('p', {}, "Le fichier ne contient que la liste de vos chaînes. Lookout n'a jamais accès à votre compte Google."),
      h('div', { class: 'actions' },
        h('a', { class: 'btn', href: 'https://takeout.google.com/', target: '_blank', rel: 'noopener noreferrer' }, icon('open'), 'Ouvrir Google Takeout'),
        h('button', { class: 'btn primary', onClick: close }, 'Compris'))], { cls: 'dialog wide' });
  }

  // --- YouTube : les sources sont des chaînes ---
  const youtube = { note: null, busy: false };
  let googleStatus = null, googleNote = null;   // { configured, connected, redirectURI }
  /** Deux façons de tenir la liste des chaînes : à la main (adresse, @nom, fichier Takeout) ou d'après le compte Google. */
  function googleSyncGroup(s) {
    if (!googleStatus) {
      api('/api/google/status').then((status) => { googleStatus = status; }).catch(() => { googleStatus = { configured: false, connected: false }; }).then(() => render());
      return null;
    }
    const o = s.feed, synced = o.youtubeSync && googleStatus.connected;
    const run = async (work, done) => {
      try { await work(); googleNote = done ? { text: t(done), ok: true } : null; } catch (error) { googleNote = { text: error.message, ok: false }; }
      googleStatus = null;
      render();
    };
    const sync = () => run(async () => {
      await app.saveNow();
      const done = await api('/api/youtube/sync', { method: 'POST', body: { section: s.id } });
      await app.replaceConfig(done.config);
      googleNote = { text: t('Abonnements à jour : {0} chaînes ({1} ajoutées, {2} retirées).', done.total, done.added, done.removed), ok: true };
    });
    const note = noteView(googleNote);
    googleNote = null;
    return group('Mes abonnements', [
      line('Liste des chaînes', h('span', {}, synced ? 'Tenue à jour par mon compte Google' : 'Tenue à la main')),
      h('div', { class: 'line' },
        h('div', {}, note ?? h('span', { class: 'sub-line' }, synced ? t('Synchronisé {0}', fmt.ago(o.youtubeSyncedAt)) : googleStatus.connected ? t('Compte Google relié.') : '')),
        !googleStatus.configured ? null
          : !googleStatus.connected ? h('button', { class: 'btn', onClick: async () => { await app.saveNow(); location.href = `api/google/connect?section=${encodeURIComponent(s.id)}`; } }, icon('link'), 'Relier mon compte Google')
          : [h('button', { class: 'btn', onClick: sync }, icon('refresh'), synced ? 'Synchroniser maintenant' : 'Synchroniser avec mes abonnements'),
            synced && h('button', { class: 'btn', onClick: () => { o.youtubeSync = false; commit(); render(); } }, 'Revenir à la liste manuelle'),
            h('button', { class: 'btn', onClick: () => run(async () => { await api('/api/google/disconnect', { method: 'POST', body: {} }); o.youtubeSync = false; commit(); }, 'Compte Google délié.') }, 'Délier')]),
    ], !googleStatus.configured ? "À la main : ajoutez les chaînes une à une ou importez le fichier de Google Takeout, ci-dessous. La synchronisation avec un compte Google n'est pas offerte sur ce serveur : un administrateur doit d'abord enregistrer un identifiant client Google (Réglages → Clés partagées)."
      : synced ? "La liste suit vos abonnements YouTube : elle est remise à jour une fois par jour, à l'ouverture de Lookout. Les chaînes ajoutées à la main qui ne font pas partie de vos abonnements sont retirées à chaque synchronisation."
        : "À la main : ajoutez les chaînes une à une ou importez le fichier de Google Takeout, ci-dessous. Compte Google : Lookout lit la liste de vos abonnements (lecture seule, rien d'autre) et la tient à jour tout seul.");
  }
  function youtubeSources(s) {
    const list = s.feed.sources, o = s.feed;
    const videosOnly = list.length > 0 && list.every((src) => !youtubeChannelID(src.url) || src.url.includes('playlist_id='));
    const has = (id) => list.some((src) => youtubeChannelID(src.url) === id);
    const say = (text, ok = false) => { youtube.note = { text, ok }; render(); };
    const input = h('input', { class: 'field', placeholder: t('Adresse de la chaîne ou @nom'), 'aria-label': 'Adresse de la chaîne ou @nom', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const addChannel = async (e) => {
      e.preventDefault();
      if (!input.value.trim() || youtube.busy) return;
      youtube.busy = true;
      try {
        const channel = await api(`/api/youtube/channel?q=${encodeURIComponent(input.value.trim())}`);
        if (has(channel.id)) say(t('{0} est déjà dans la liste.', channel.name));
        else { list.push(feedSource(channel.name, youtubeFeedURL(channel.id, videosOnly))); commit(); say(t('Chaîne ajoutée : {0}', channel.name), true); }
      } catch (error) { say(error.message); } finally { youtube.busy = false; }
    };
    const fileInput = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', hidden: true, onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const channels = parseSubscriptions(await file.text()).filter((c) => !has(c.id));
      if (!channels.length) return say(t("Aucune nouvelle chaîne trouvée dans ce fichier. Il faut le fichier « abonnements.csv » de Google Takeout."));
      for (const c of channels) list.push(feedSource(c.name, youtubeFeedURL(c.id, videosOnly)));
      commit();
      say(t('{0} chaînes ajoutées.', channels.length), true);
    } });
    const note = noteView(youtube.note);
    youtube.note = null;
    return [googleSyncGroup(s), group('Chaînes', [
      list.map((src) => h('div', { class: 'item' },
        toggle(src, 'enabled', { label: t('Activer {0}', src.name), rerender: true }),
        h('div', { class: 'fields' }, text(src, 'name', { placeholder: 'Nom de la chaîne' })),
        statusDot(s, src.id, src.enabled), rowControls(list, src))),
      h('form', { class: 'line', novalidate: true, onSubmit: addChannel }, input, h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Ajouter')),
      h('div', { class: 'line' }, h('div', {}, note),
        h('button', { class: 'info-btn', title: "Comment obtenir le fichier de mes abonnements", 'aria-label': "Comment obtenir le fichier de mes abonnements", onClick: takeoutHelp }, 'i'),
        h('button', { class: 'btn', onClick: () => fileInput.click() }, icon('upload'), 'Importer mes abonnements…'), fileInput),
    ], "Collez l'adresse d'une chaîne (youtube.com/@nom) ou son @nom. Pour reprendre tous vos abonnements d'un coup : sur takeout.google.com, exportez seulement « YouTube » → « abonnements », puis importez ici le fichier abonnements.csv. Aucune clé ni connexion à votre compte Google n'est nécessaire ; la liste ne suit pas vos futurs abonnements."),
    group('Vidéos', [
      line('Lire les vidéos dans Lookout', toggle(o, 'playInline', { label: 'Lire les vidéos dans Lookout' })),
      line('Masquer les Shorts et les directs', h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: videosOnly, disabled: !list.length, 'aria-label': 'Masquer les Shorts et les directs',
        onChange: (e) => { for (const src of list) { const id = youtubeChannelID(src.url); if (id) src.url = youtubeFeedURL(id, e.target.checked); } commit(); render(); } })),
    ], o.sources.length > 60 ? "Avec autant de chaînes, chaque mise à jour interroge YouTube une fois par chaîne : gardez un intervalle d'au moins 30 minutes." : null)];
  }

  function feedSources(s) {
    const list = s.feed.sources;
    return group('Sources', [
      list.map((src) => h('div', { class: 'item' },
        toggle(src, 'enabled', { label: t('Activer {0}', src.name), rerender: true }),
        h('div', { class: 'fields' }, text(src, 'name', { placeholder: 'Nom de la source' }),
          h('input', { class: 'sub mono', value: src.url, placeholder: 'https://exemple.com/rss', 'aria-label': 'Adresse du fil', inputmode: 'url',
            autocapitalize: 'off', spellcheck: 'false', onInput: (e) => { src.url = e.target.value; commit(); } })),
        statusDot(s, src.id, src.enabled), rowControls(list, src))),
      h('div', { class: 'line' },
        h('button', { class: 'btn', onClick: () => { list.push(feedSource('', '')); commit(); render(); } }, icon('plus'), 'Ajouter un fil RSS'),
        // Catalogue en deux temps : la catégorie, puis ses fils (dans la langue de l'interface d'abord).
        h('button', { class: 'btn', onClick: (e) => {
          const anchor = e.currentTarget, lang = document.documentElement.lang;
          openMenu(anchor, [{ heading: 'Catégories' }, ...FEED_CATALOG.map((c) => ({ label: c.name, icon: sfIcon(c.icon), action: () => openMenu(anchor, [
            { heading: c.name },
            ...[...c.feeds].sort((x, y) => (y[2] === lang) - (x[2] === lang)).map(([name, url]) => ({ label: name, disabled: list.some((x) => x.url === url),
              action: () => { list.push(feedSource(name, url)); commit(); render(); } }))]) }))]);
        } }, 'Suggestions', icon('down'))),
    ], "Collez l'adresse de n'importe quel fil RSS ou Atom. L'ordre des sources sert à alterner les articles.");
  }

  function articleDisplay(s, isFeed) {
    const o = s.feed;
    return [
      group('Affichage', [
        line('Présentation', select(o, 'layout', [['list', 'Liste'], ['headline', 'À la une'], ['grid', 'Vignettes'], ['compact', 'Titres seulement']], { rerender: true, label: 'Présentation' })),
        isFeed && line('Ordre', select(o, 'ordering', [['newest', "Plus récents d'abord"], ['balanced', 'Alterner entre les sources']], { label: 'Ordre' })),
        o.layout !== 'compact' && line('Images', toggle(o, 'showImages', { label: 'Images' })),
        o.layout !== 'compact' && line(isFeed ? 'Résumé' : 'Sous-titre', toggle(o, 'showSummary', { label: 'Résumé' })),
        isFeed && o.layout !== 'compact' && line('Nom de la source', toggle(o, 'showSource', { label: 'Nom de la source' })),
        line('Heure de publication', toggle(o, 'showTime', { label: 'Heure de publication' })),
      ]),
      group('Filtres', [
        line('Âge maximal', select(o, 'maxAgeHours', [[0, 'Aucune limite'], [12, '12 heures'], [24, '24 heures'], [48, '48 heures'], [72, '3 jours'], [168, '7 jours']], { label: 'Âge maximal' })),
        line('Doit contenir', text(o, 'includeKeywords', { placeholder: 'ex. Canadiens, budget', label: 'Doit contenir' })),
        line('Exclure', text(o, 'excludeKeywords', { placeholder: 'ex. horoscope, publicité', label: 'Exclure' })),
        line('Mettre en évidence', text(o, 'highlightKeywords', { placeholder: 'ex. Montréal, grève', label: 'Mettre en évidence' })),
      ], 'Mots-clés séparés par des virgules, recherchés dans le titre et le résumé.'),
      group('Notifications', [
        line('Notifier les nouveaux articles', toggle(o, 'notify', { label: 'Notifier les nouveaux articles' })),
      ], "Chaque nouvel article qui passe les filtres ci-dessus envoie une notification aux appareils abonnés (Réglages → Notifications). Un toucher sur la notification ouvre l'article. Au-delà de trois nouveautés d'un coup, une seule notification les annonce."),
    ];
  }

  function weatherEditor(s) {
    const o = s.weather;
    const results = h('div', {});
    const query = h('input', { class: 'field', placeholder: 'Ville ou code postal', 'aria-label': 'Changer de lieu', enterkeyhint: 'search' });
    const search = async () => {
      const q = query.value.trim();
      if (q.length < 2) return;
      results.replaceChildren(h('div', { class: 'line' }, h('span', { class: 'spinner' })));
      try {
        const places = await api(`/api/weather/search?q=${encodeURIComponent(q)}`);
        results.replaceChildren(...(places.length ? places.map((p) => h('button', { class: 'line', style: { width: '100%', textAlign: 'left' },
          onClick: () => { Object.assign(o, { locationName: p.shortLabel, latitude: p.latitude, longitude: p.longitude }); commit(); render(); } },
        h('span', {}, p.label), icon('right'))) : [h('div', { class: 'line' }, t('Aucun lieu trouvé pour « {0} ».', q))]));
      } catch (error) { results.replaceChildren(h('div', { class: 'line' }, error.message)); }
    };
    query.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
    return [
      group('Lieu', [
        line('Lieu actuel', h('span', {}, icon('pin'), ' ', o.locationName)),
        h('div', { class: 'line' }, query, h('button', { class: 'btn', onClick: search }, 'Rechercher')),
        results,
      ]),
      group('Affichage', [
        line('Alertes météo (Environnement Canada)', toggle(o, 'showAlerts', { label: 'Alertes météo' })),
        line('Ressenti, vent, humidité et soleil', toggle(o, 'showDetails', { label: 'Détails' })),
        line('Prévisions horaires', toggle(o, 'showHourly', { label: 'Prévisions horaires', rerender: true })),
        o.showHourly && line('Heures affichées', stepper(o, 'hourlyCount', 4, 24)),
        line('Prévisions quotidiennes', toggle(o, 'showDaily', { label: 'Prévisions quotidiennes', rerender: true })),
        o.showDaily && line('Jours affichés', stepper(o, 'dailyCount', 2, 10)),
      ]),
    ];
  }

  function commuteEditor(s) {
    const o = s.commute, hass = o.provider === 'hass';
    const modes = [['driving', 'Voiture', 'car'], ['walking', 'À pied', 'walk']];
    return [
      group('Trajets', [
        o.routes.map((r) => h('div', { class: 'item top' },
          toggle(r, 'enabled', { label: t('Activer {0}', r.name), rerender: true }),
          h('div', { class: 'fields' },
            text(r, 'name', { placeholder: 'Nom du trajet (ex. Maison → Bureau)' }),
            hass ? text(r, 'entity', { placeholder: 'Entité du capteur (ex. sensor.waze_travail)', mono: true })
              : [text(r, 'from', { placeholder: 'Adresse de départ' }), text(r, 'to', { placeholder: 'Adresse de destination' }),
                h('div', {}, seg(r, 'mode', modes))]),
          rowControls(o.routes, r))),
        h('div', { class: 'line' }, h('button', { class: 'btn', onClick: () => { o.routes.push(commuteRoute()); commit(); render(); } }, icon('plus'), 'Ajouter un trajet')),
      ], hass ? "Chaque trajet lit un capteur de temps de trajet de Home Assistant (intégration Waze Travel Time ou Google Maps)."
        : 'Entrez des adresses complètes ou des noms de lieux. Le temps de parcours est calculé pour un départ immédiat.'),
      group('Calcul', [
        line('Service', select(o, 'provider', [['osrm', 'OSRM (sans circulation)'], ['tomtom', 'TomTom (avec circulation)'], ['hass', 'Home Assistant (Waze)']], { rerender: true, label: 'Service' })),
        o.provider === 'tomtom' && line('Clé TomTom', text(o, 'tomtomKey', { placeholder: app.sharedKeys?.tomtomKey ? "Fournie par l'administrateur" : 'Clé gratuite de developer.tomtom.com', mono: true })),
        hass && line('Adresse', text(o, 'hassURL', { placeholder: 'http://homeassistant.local:8123', mono: true })),
        hass && line('Jeton', text(o, 'hassToken', { placeholder: "Jeton d'accès longue durée", mono: true })),
        !hass && line('Afficher les itinéraires de rechange', toggle(o, 'showAlternates', { label: 'Itinéraires de rechange' })),
      ], o.provider === 'osrm' ? 'OSRM est un service libre, sans données de circulation en direct.'
        : o.provider === 'tomtom' ? 'TomTom tient compte de la circulation en direct. Une fois enregistrée, la clé reste sur le serveur et n\'est plus affichée.'
          : 'Le temps affiché est celui que Waze fournit à Home Assistant. Une fois enregistré, le jeton reste sur le serveur et n\'est plus affiché.'),
    ];
  }

  function teamButton(s, lg) {
    const title = () => (lg.teams.length === 0 ? t('Toutes les équipes') : lg.teams.length === 1 ? lg.teams[0].name : t('{0} équipes', lg.teams.length));
    const label = h('span', {}, title());
    const button = h('button', { class: `pill${lg.teams.length ? ' on' : ''}`, title: 'Choisir les équipes à afficher', onClick: () => openPopover(button, () => {
      // Liste du fournisseur, complétée par les équipes déjà choisies ou vues dans les matchs chargés.
      const seen = (app.state.data.get(s.id)?.games ?? []).filter((g) => g.leagueID === lg.id).flatMap((g) => [g.home, g.away]).map((t) => ({ id: t.id, name: t.name }));
      let provided = [], message = t('Chargement des équipes…');
      const listEl = h('div', { class: 'pick-list' }), note = h('small', { style: { color: 'var(--text2)' } }, message);
      const query = h('input', { class: 'field', placeholder: 'Rechercher une équipe', 'aria-label': 'Rechercher une équipe', onInput: () => draw() });
      const sync = () => { label.textContent = title(); button.classList.toggle('on', lg.teams.length > 0); commit(); draw(); };
      const pick = (name, on, action, bold) => h('button', { class: 'pick', role: 'checkbox', 'aria-checked': String(on), onClick: action },
        icon(on ? 'check-on' : 'check-off'), h('span', { style: { fontWeight: bold ? '500' : '400' } }, name));
      function draw() {
        const byID = new Map([...seen, ...lg.teams, ...provided].map((t) => [t.id, t]));
        const q = query.value.trim().toLowerCase();
        const all = [...byID.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')).filter((t) => !q || t.name.toLowerCase().includes(q));
        listEl.replaceChildren(pick('Toutes les équipes', lg.teams.length === 0, () => { lg.teams = []; sync(); }, true), h('hr', { style: { width: '100%', border: '0', borderTop: '0.5px solid var(--sep)' } }),
          ...all.map((t) => pick(t.name, lg.teams.some((x) => x.id === t.id), () => {
            const i = lg.teams.findIndex((x) => x.id === t.id);
            if (i >= 0) lg.teams.splice(i, 1); else lg.teams.push({ id: t.id, name: t.name, logo: t.logo ?? null });
            sync();
          })));
        note.textContent = message;
        note.hidden = !message;
      }
      draw();
      // Le serveur doit connaître la ligue avant de pouvoir lister ses équipes.
      app.saveNow().then(() => api(`/api/teams?section=${encodeURIComponent(s.id)}&league=${encodeURIComponent(lg.id)}`))
        .then((teams) => { provided = teams; message = ''; })
        .catch((error) => { message = t('Liste complète indisponible ({0}). Les équipes des matchs récents restent sélectionnables.', error.message); })
        .finally(draw);
      return [query, listEl, note];
    }) }, label, icon('down'));
    return button;
  }

  function apiSportsSearch(s) {
    openDialog((close) => {
      const sport = { value: 'hockey' }, results = h('div', { class: 'pick-list', style: { minHeight: '120px' } }, h('p', {}, 'Tapez au moins 3 lettres, puis Rechercher.'));
      const query = h('input', { class: 'field', placeholder: 'ex. NHL, Canada, Premier League', 'aria-label': 'Nom de la ligue', autofocus: true });
      const note = h('p', {});
      const search = async () => {
        const q = query.value.trim();
        if (q.length < 3) return;
        results.replaceChildren(h('span', { class: 'spinner' }));
        try {
          await app.saveNow();
          const found = await api(`/api/apisports/leagues?section=${encodeURIComponent(s.id)}&sport=${sport.value}&q=${encodeURIComponent(q)}`);
          results.replaceChildren(...(found.length ? found.map((l) => h('button', { class: 'pick', onClick: () => {
            s.sports.leagues.push(newLeague(l.name, `${sport.value}/${l.id}`, 'apisports', l.season));
            commit(); render();
            note.textContent = t('« {0} » ajoutée.', l.name);
          } }, icon('plus'), h('span', {}, l.name, h('small', {}, [l.country, l.season].filter(Boolean).join(' · '))))) : [h('p', {}, 'Aucune ligue trouvée.')]));
        } catch (error) { results.replaceChildren(h('p', {}, error.message)); }
      };
      query.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
      return [h('h3', {}, 'Ajouter une ligue API-Sports'),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, select(sport, 'value', LEAGUES.apisports.map(([name, id]) => [id, name]), { label: 'Sport' }),
          h('div', { style: { flex: '1 1 160px', display: 'flex', gap: '8px' } }, query, h('button', { class: 'btn', onClick: search }, 'Rechercher'))),
        results, note, h('div', { class: 'actions' }, h('button', { class: 'btn primary', onClick: close }, 'Terminé'))];
    });
  }

  function sportsEditor(s) {
    const o = s.sports, list = o.leagues, hasKey = Boolean(o.apiSportsKey.trim()) || Boolean(app.sharedKeys?.apiSportsKey);
    const has = (provider, path) => list.some((l) => l.provider === provider && l.path === path);
    const add = (lg) => { list.push(lg); commit(); render(); };
    return [
      group('Ligues et équipes', [
        list.map((lg) => h('div', { class: 'item' },
          toggle(lg, 'enabled', { label: t('Activer {0}', lg.name), rerender: true }),
          h('div', { class: 'fields' }, text(lg, 'name', { placeholder: 'Nom de la ligue' }),
            h('div', { class: 'sub-line' }, h('span', {}, PROVIDER_LABELS[lg.provider] ?? 'ESPN'),
              (lg.provider ?? 'espn') === 'espn' && [h('span', {}, '·'), h('input', { class: 'sub mono', value: lg.path, placeholder: 'sport/ligue', 'aria-label': 'Chemin ESPN',
                autocapitalize: 'off', spellcheck: 'false', onInput: (e) => { lg.path = e.target.value; commit(); } })])),
          teamButton(s, lg), statusDot(s, lg.id, lg.enabled), rowControls(list, lg))),
        h('div', { class: 'line' }, h('button', { class: 'btn', onClick: (e) => openMenu(e.currentTarget, [
          { heading: 'ESPN' },
          ...LEAGUES.espn.map(([name, path]) => ({ label: name, disabled: has('espn', path), action: () => add(newLeague(t(name), path)) })),
          { label: 'Autre ligue ESPN…', action: () => add(newLeague('', '')) },
          { heading: 'HockeyTech — hockey junior, féminin et LAH' },
          ...LEAGUES.hockeytech.map(([name, code, key]) => ({ label: name, disabled: has('hockeytech', code), action: () => add(newLeague(t(name), code, 'hockeytech', key)) })),
          { heading: 'API-Sports' },
          { label: hasKey ? 'Rechercher une ligue…' : 'Rechercher une ligue… (clé requise ci-dessous)', disabled: !hasKey, action: () => apiSportsSearch(s) },
        ]) }, icon('plus'), 'Ajouter une ligue')),
      ], 'Pour chaque ligue, choisissez « Toutes les équipes » ou seulement celles que vous suivez. Chemin ESPN : sport/ligue (ex. hockey/nhl, soccer/ita.1).'),
      group('API-Sports', [
        line('Clé API-Sports', text(o, 'apiSportsKey', { placeholder: app.sharedKeys?.apiSportsKey ? "Fournie par l'administrateur" : 'Facultatif', mono: true, onInput: () => {} })),
        h('div', { class: 'line' }, h('a', { href: 'https://dashboard.api-football.com/register', target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)' } },
          'Obtenir une clé gratuite sur api-sports.io')),
      ], 'Nécessaire seulement pour les ligues API-Sports. Le forfait gratuit permet 100 requêtes par jour et par sport ; Lookout met les réponses en cache pour le respecter. Une fois enregistrée, la clé reste sur le serveur et n\'est plus affichée.'),
      group('Affichage', [
        line("Résultats d'hier", toggle(o, 'showYesterday', { label: "Résultats d'hier" })),
        line('Matchs de demain', toggle(o, 'showUpcoming', { label: 'Matchs de demain' })),
        line('Logos des équipes', toggle(o, 'showLogos', { label: 'Logos des équipes' })),
        line('Classement de mes équipes', toggle(o, 'showStandings', { label: 'Classement de mes équipes' })),
        line('Suivre les matchs en direct (mise à jour chaque minute)', toggle(o, 'liveRefresh', { label: 'Suivre les matchs en direct' })),
      ]),
    ];
  }

  function apiEditor(s) {
    const o = s.api;
    return [
      group('Requête', [
        h('div', { class: 'line stack' }, h('label', {}, 'Adresse'), text(o, 'url', { placeholder: 'https://api.exemple.com/v1/articles', mono: true, bare: false, label: 'Adresse' })),
        h('div', { class: 'line stack' }, h('label', {}, 'En-têtes HTTP'),
          h('textarea', { class: 'field mono', 'aria-label': 'En-têtes HTTP', spellcheck: 'false', onInput: (e) => { o.headers = e.target.value; commit(); } }, o.headers)),
      ], 'Un en-tête par ligne, au format « Nom: valeur » (ex. Authorization: Bearer …). Une fois enregistrées, les valeurs restent sur le serveur et sont masquées.'),
      group('Correspondance des champs', [
        line('Liste des éléments', text(o, 'itemsPath', { placeholder: 'ex. data.items (vide = racine)', mono: true })),
        line('Titre', text(o, 'titlePath', { placeholder: 'ex. title', mono: true })),
        line('Sous-titre', text(o, 'subtitlePath', { placeholder: 'facultatif', mono: true })),
        line('Lien', text(o, 'linkPath', { placeholder: 'ex. url', mono: true })),
        line('Date', text(o, 'datePath', { placeholder: 'facultatif — ISO 8601 ou Unix', mono: true })),
        line('Image', text(o, 'imagePath', { placeholder: 'facultatif', mono: true })),
      ], 'Chemins pointés dans le JSON : « hits » pour la liste, puis « title » ou « author.name » dans chaque élément.'),
    ];
  }

  // --- Sorties : films et séries ---
  function releasesEditor(s) {
    const o = s.releases, shared = app.sharedKeys?.tmdbKey;
    return [group('Contenu', [
      line('Pays', select(o, 'country', [['CA', 'Canada'], ['US', 'États-Unis'], ['FR', 'France'], ['GB', 'Royaume-Uni'], ['BE', 'Belgique'], ['CH', 'Suisse']], { label: 'Pays' })),
      line('Période', select(o, 'days', [[3, '3 jours'], [7, '7 jours'], [14, '14 jours'], [30, '30 jours']], { label: 'Période' })),
      line('Nouvelles saisons de séries', toggle(o, 'showSeries', { label: 'Nouvelles saisons de séries' })),
      line('Films en salle et à venir', toggle(o, 'showMovies', { label: 'Films en salle et à venir', rerender: true })),
      o.showMovies && line('Clé TMDB', text(o, 'tmdbKey', { placeholder: shared ? "Fournie par l'administrateur" : 'Clé gratuite de themoviedb.org', mono: true })),
      o.showMovies && !shared && h('div', { class: 'line' }, h('a', { href: 'https://www.themoviedb.org/settings/api', target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)' } },
        'Obtenir une clé gratuite sur themoviedb.org')),
    ], "Les séries viennent de TVmaze, sans clé : premier épisode de chaque nouvelle saison, à la télé du pays choisi et sur les grands services en ligne. Les films viennent de TMDB et demandent une clé gratuite. Ce produit utilise l'API de TMDB mais n'est ni approuvé ni certifié par TMDB.")];
  }

  // --- Agenda ---
  function calendarHelp() {
    const WHERE = [
      ['Google Agenda', "Sur ordinateur : Paramètres → cliquez le calendrier dans la colonne de gauche → « Intégrer l'agenda » → copiez l'« Adresse secrète au format iCal »."],
      ['iCloud', "Dans l'app Calendrier ou sur icloud.com : partagez le calendrier, cochez « Calendrier public », puis copiez le lien (il commence par webcal://)."],
      ['Outlook', "Sur outlook.com : Paramètres → Calendrier → Calendriers partagés → « Publier un calendrier » → copiez le lien ICS."],
    ];
    openDialog((close) => [h('h3', {}, "Trouver l'adresse d'un calendrier"),
      h('ol', { class: 'steps' }, WHERE.map(([name, how]) => h('li', {}, h('b', {}, name), ' — ', how))),
      h('p', {}, "Cette adresse donne accès à tout le calendrier en lecture : ne la partagez pas. Lookout la garde sur le serveur et ne l'affiche plus une fois enregistrée."),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onClick: close }, 'Fermer'))], { cls: 'dialog wide' });
  }
  function calendarEditor(s) {
    const o = s.calendar, list = o.calendars;
    return [group('Calendriers', [
      list.map((c) => h('div', { class: 'item' },
        toggle(c, 'enabled', { label: t('Activer {0}', c.name), rerender: true }),
        h('div', { class: 'fields' }, text(c, 'name', { placeholder: 'Nom du calendrier' }),
          h('input', { class: 'sub mono', value: c.url, placeholder: 'https://… ou webcal://… (.ics)', 'aria-label': 'Adresse du calendrier', inputmode: 'url',
            autocapitalize: 'off', spellcheck: 'false', onFocus: (e) => e.target.select(), onInput: (e) => { c.url = e.target.value.trim(); commit(); } })),
        h('input', { class: 'cal-color', type: 'color', value: /^#[0-9a-f]{6}$/i.test(c.colorHex) ? c.colorHex : s.colorHex, title: 'Couleur', 'aria-label': 'Couleur',
          onInput: (e) => { c.colorHex = e.target.value.toUpperCase(); commit(); } }),
        statusDot(s, c.id, c.enabled), rowControls(list, c))),
      h('div', { class: 'line' },
        h('button', { class: 'btn', onClick: () => { list.push(calendarSource()); commit(); render(); } }, icon('plus'), 'Ajouter un calendrier'),
        h('button', { class: 'info-btn', title: "Où trouver l'adresse de mon calendrier", 'aria-label': "Où trouver l'adresse de mon calendrier", onClick: calendarHelp }, 'i')),
    ], "Collez l'adresse iCal de chaque calendrier (Google, iCloud, Outlook…). Aucune clé ni connexion : Lookout lit le calendrier, sans jamais le modifier. L'adresse n'est plus affichée une fois enregistrée."),
    group('Affichage', [
      line('Période', select(o, 'days', [[1, "Aujourd'hui"], [2, '2 jours'], [3, '3 jours'], [7, '7 jours'], [14, '14 jours'], [30, '30 jours']], { label: 'Période' })),
      line('Lieu', toggle(o, 'showLocation', { label: 'Lieu' })),
      line("Événements d'aujourd'hui déjà terminés", toggle(o, 'showEnded', { label: "Événements d'aujourd'hui déjà terminés" })),
    ])];
  }

  // --- Classements et statistiques ---
  function standingsEditor(s) {
    const o = s.standings, list = o.leagues;
    const has = (provider, path) => list.some((l) => l.provider === provider && l.path === path);
    const add = (lg) => { list.push(lg); commit(); render(); };
    return [
      group('Ligues', [
        list.map((lg) => h('div', { class: 'item' },
          toggle(lg, 'enabled', { label: t('Activer {0}', lg.name), rerender: true }),
          h('div', { class: 'fields' }, text(lg, 'name', { placeholder: 'Nom de la ligue' }),
            h('div', { class: 'sub-line' }, h('span', {}, PROVIDER_LABELS[lg.provider] ?? 'ESPN'),
              (lg.provider ?? 'espn') === 'espn' && [h('span', {}, '·'), h('input', { class: 'sub mono', value: lg.path, placeholder: 'sport/ligue', 'aria-label': 'Chemin ESPN',
                autocapitalize: 'off', spellcheck: 'false', onInput: (e) => { lg.path = e.target.value; commit(); } })])),
          teamButton(s, lg), statusDot(s, lg.id, lg.enabled), rowControls(list, lg))),
        h('div', { class: 'line' }, h('button', { class: 'btn', onClick: (e) => openMenu(e.currentTarget, [
          { heading: 'ESPN' },
          ...LEAGUES.espn.map(([name, path]) => ({ label: name, disabled: has('espn', path), action: () => add(newLeague(t(name), path)) })),
          { label: 'Autre ligue ESPN…', action: () => add(newLeague('', '')) },
          { heading: 'HockeyTech — hockey junior, féminin et LAH' },
          ...LEAGUES.hockeytech.map(([name, code, key]) => ({ label: name, disabled: has('hockeytech', code), action: () => add(newLeague(t(name), code, 'hockeytech', key)) })),
        ]) }, icon('plus'), 'Ajouter une ligue')),
      ], "Pour chaque ligue, choisissez vos équipes : elles sont mises en évidence dans le classement et chez les meneurs. Avec plusieurs ligues, la carte offre un onglet par ligue."),
      group('Classement', [
        line('Afficher le classement', toggle(o, 'showStandings', { label: 'Afficher le classement', rerender: true })),
        o.showStandings && line('Regrouper par', select(o, 'grouping', [['conference', 'Association'], ['division', 'Division']], { label: 'Regrouper par' })),
        o.showStandings && line('Seulement les groupes de mes équipes', toggle(o, 'onlyMine', { label: 'Seulement les groupes de mes équipes' })),
        o.showStandings && line('Marquer la limite des séries', toggle(o, 'playoffLine', { label: 'Marquer la limite des séries' })),
      ], "Le regroupement par division vaut pour les ligues ESPN qui en ont (LNH, NFL, NBA, MLB). Les ligues HockeyTech sont toujours présentées par association. La limite des séries s'affiche dans le classement par association, avec l'écart en points de vos équipes pour le hockey et le soccer ; elle suit le classement de la source et ne tient pas compte de tous les critères de bris d'égalité."),
      group('Mes équipes', [
        line('Afficher la fiche de mes équipes', toggle(o, 'showTeams', { label: 'Afficher la fiche de mes équipes', rerender: true })),
        o.showTeams && line('Prochains matchs', select(o, 'upcoming', [[5, '5'], [10, '10']], { label: 'Prochains matchs' })),
      ], "Pour chaque équipe choisie ci-dessus (six au plus par ligue) : ses prochains matchs, ses cinq derniers résultats et ses meilleurs joueurs."),
      group('Meneurs', [
        line('Afficher les meneurs', toggle(o, 'showLeaders', { label: 'Afficher les meneurs' })),
      ], "Les meilleurs joueurs par catégorie : points, buts, passes et gardiens au hockey ; verges et touchés au football ; points, rebonds et passes au basketball ; moyenne, circuits et lanceurs au baseball. Non offert pour le soccer."),
    ];
  }

  // --- Home Assistant ---
  /** Fenêtre de choix : cherche parmi les entités de Home Assistant et ajoute celles qu'on coche. */
  function hassPicker(s) {
    const list = s.hass.entities;
    openDialog((close) => {
      const results = h('div', { class: 'pick-list', style: { minHeight: '180px' } }), note = h('p', { class: 'a-meta' });
      const query = h('input', { class: 'field', type: 'search', placeholder: 'ex. salon, température, porte', 'aria-label': 'Rechercher une entité', autofocus: true });
      let timer = null, latest = 0;
      const has = (entity) => list.some((e) => e.entity === entity);
      const search = async () => {
        const turn = ++latest;
        note.textContent = t('Recherche…');
        try {
          await app.saveNow();   // le serveur doit connaître l'adresse et le jeton
          const found = await api(`/api/hass/entities?section=${encodeURIComponent(s.id)}&q=${encodeURIComponent(query.value.trim())}`);
          if (turn !== latest) return;
          const draw = () => results.replaceChildren(...found.map((e) => h('button', { class: 'pick', role: 'checkbox', 'aria-checked': String(has(e.entity)), onClick: () => {
            const at = list.findIndex((x) => x.entity === e.entity);
            if (at >= 0) list.splice(at, 1); else list.push(hassEntity(e.entity));
            commit(); draw();
          } }, icon(has(e.entity) ? 'check-on' : 'check-off'),
          h('span', {}, document.createTextNode(e.name), h('small', {}, document.createTextNode(` ${e.entity} · ${e.state}${e.unit ? ` ${e.unit}` : ''}`))))));
          draw();
          note.textContent = found.length ? (found.length >= 80 ? t('Les 80 premières entités. Précisez la recherche pour en voir d’autres.') : '') : t('Aucune entité ne correspond.');
        } catch (error) { if (turn === latest) { results.replaceChildren(); note.textContent = error.message; } }
      };
      query.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
      search();
      return [h('h3', {}, 'Choisir des entités'), query, note, results, h('div', { class: 'actions' }, h('button', { class: 'btn primary', onClick: () => { close(); render(); } }, 'Terminé'))];
    }, { cls: 'dialog wide', onClose: () => render() });
  }
  function hassEditor(s) {
    const o = s.hass, list = o.entities, ready = Boolean(String(o.url).trim() && String(o.token).trim());
    return [
      group('Connexion', [
        line('Adresse', text(o, 'url', { placeholder: 'http://homeassistant.local:8123', mono: true, label: 'Adresse de Home Assistant' })),
        line('Jeton', text(o, 'token', { placeholder: "Jeton d'accès longue durée", mono: true, label: "Jeton d'accès" })),
      ], "Dans Home Assistant : votre profil (en bas à gauche) → Sécurité → « Jetons d'accès de longue durée » → Créer un jeton. Une fois enregistré, le jeton reste sur le serveur de Lookout et n'est plus affiché."),
      group('Entités', [
        list.map((e) => h('div', { class: 'item' },
          toggle(e, 'enabled', { label: t('Activer {0}', e.name || e.entity), rerender: true }),
          h('div', { class: 'fields' }, text(e, 'name', { placeholder: app.state.data.get(s.id)?.entities?.find((x) => x.id === e.id)?.name ?? 'Nom affiché (facultatif)' }),
            h('input', { class: 'sub mono', value: e.entity, placeholder: 'ex. sensor.temperature_salon', 'aria-label': "Identifiant de l'entité", autocapitalize: 'off', spellcheck: 'false',
              onInput: (ev) => { e.entity = ev.target.value.trim(); commit(); } })),
          statusDot(s, e.id, e.enabled), rowControls(list, e))),
        h('div', { class: 'line' },
          h('button', { class: 'btn', disabled: !ready, title: ready ? null : "Indiquez d'abord l'adresse et le jeton", onClick: () => hassPicker(s) }, icon('search'), 'Choisir des entités…'),
          h('button', { class: 'btn', onClick: () => { list.push(hassEntity()); commit(); render(); } }, icon('plus'), 'Ajouter par identifiant')),
      ], "Lookout ne lit que les entités listées ici, dans cet ordre. Sans nom affiché, celui de Home Assistant est utilisé."),
      group('Commandes', [
        line('Actionner les entités depuis la carte', toggle(o, 'allowControl', { label: 'Actionner les entités depuis la carte' })),
      ], "Activé, la carte offre un interrupteur pour les lumières, les prises, les ventilateurs et les interrupteurs virtuels, et un bouton pour les stores, les scènes, les scripts et les automatisations. Les serrures et les alarmes ne peuvent jamais être actionnées d'ici."),
    ];
  }

  // --- Bourse et devises ---
  const STOCK_IDEAS = [['Indices'], ['S&P/TSX', '^GSPTSE'], ['S&P 500', '^GSPC'], ['Dow Jones', '^DJI'], ['Nasdaq', '^IXIC'], ['CAC 40', '^FCHI'],
    ['Devises'], ['USD → CAD', 'USDCAD=X'], ['EUR → CAD', 'EURCAD=X'], ['CAD → USD', 'CADUSD=X'], ['EUR → USD', 'EURUSD=X'],
    ['Autres'], ['Bitcoin (CAD)', 'BTC-CAD'], ['Or', 'GC=F'], ['Pétrole (WTI)', 'CL=F']];
  function stockSearch(s) {
    const list = s.stocks.symbols;
    openDialog((close) => {
      const results = h('div', { class: 'pick-list', style: { minHeight: '140px' } }, h('p', {}, 'Tapez le nom d’une entreprise ou un symbole.')), note = h('p', {});
      const query = h('input', { class: 'field', type: 'search', placeholder: 'ex. Shopify, Apple, BNC', 'aria-label': 'Rechercher un titre', autofocus: true });
      let timer = null, latest = 0;
      const search = async () => {
        const q = query.value.trim(), turn = ++latest;
        if (q.length < 2) return;
        try {
          const found = await api(`/api/stocks/search?q=${encodeURIComponent(q)}`);
          if (turn !== latest) return;
          results.replaceChildren(...(found.length ? found.map((x) => h('button', { class: 'pick', disabled: list.some((y) => y.symbol === x.symbol), onClick: (e) => {
            list.push(stockSymbol(x.symbol, x.name));
            commit();
            e.currentTarget.disabled = true;
            note.textContent = t('« {0} » ajoutée.', x.name);
          } }, icon('plus'), h('span', {}, document.createTextNode(x.name), h('small', {}, document.createTextNode(` ${x.symbol}${x.where ? ` · ${x.where}` : ''}`))))) : [h('p', {}, 'Aucun titre trouvé.')]));
        } catch (error) { if (turn === latest) results.replaceChildren(h('p', {}, error.message)); }
      };
      query.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
      return [h('h3', {}, 'Ajouter un titre'), query, results, note, h('div', { class: 'actions' }, h('button', { class: 'btn primary', onClick: close }, 'Terminé'))];
    }, { onClose: () => render() });
  }
  function stocksEditor(s) {
    const o = s.stocks, list = o.symbols;
    return [group('Cours suivis', [
      list.map((x) => h('div', { class: 'item' },
        toggle(x, 'enabled', { label: t('Activer {0}', x.name || x.symbol), rerender: true }),
        h('div', { class: 'fields' }, text(x, 'name', { placeholder: 'Nom affiché' }),
          h('input', { class: 'sub mono', value: x.symbol, placeholder: 'ex. SHOP.TO, AAPL, USDCAD=X', 'aria-label': 'Symbole', autocapitalize: 'characters', spellcheck: 'false',
            onInput: (e) => { x.symbol = e.target.value.trim().toUpperCase(); commit(); } })),
        statusDot(s, x.id, x.enabled), rowControls(list, x))),
      h('div', { class: 'line' },
        h('button', { class: 'btn', onClick: () => stockSearch(s) }, icon('search'), 'Rechercher un titre…'),
        h('button', { class: 'btn', onClick: (e) => openMenu(e.currentTarget, STOCK_IDEAS.map(([name, symbol]) => (symbol
          ? { label: name, disabled: list.some((x) => x.symbol === symbol), action: () => { list.push(stockSymbol(symbol, t(name))); commit(); render(); } } : { heading: name }))) }, 'Suggestions', icon('down'))),
    ], "Les symboles sont ceux de Yahoo Finance : « .TO » pour la Bourse de Toronto (SHOP.TO), « =X » pour une paire de devises (USDCAD=X), « ^ » pour un indice (^GSPTSE)."),
    group('Affichage', [
      line('Variation du jour', toggle(o, 'showChange', { label: 'Variation du jour' })),
    ], "Cours fournis par Yahoo Finance, sans clé, souvent différés d'une quinzaine de minutes. À titre indicatif seulement : ce service n'est pas garanti et peut cesser de répondre.")];
  }

  // --- Résumé du jour ---
  function summaryEditor(s) {
    const o = s.summary, shared = app.sharedKeys?.anthropicKey;
    const feeds = config().sections.filter((x) => (x.kind === 'feed' || x.kind === 'api') && !x.feed.youtube);
    const all = !o.sections.length;
    return [group('Résumé', [
      line('Modèle', select(o, 'model', SUMMARY_MODELS, { label: 'Modèle' })),
      line('Clé Anthropic', text(o, 'anthropicKey', { placeholder: shared ? "Fournie par l'administrateur" : 'sk-ant-…', mono: true })),
      !shared && h('div', { class: 'line' }, h('a', { href: 'https://platform.claude.com/settings/keys', target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)' } },
        'Créer une clé sur platform.claude.com')),
      line('Accent particulier', text(o, 'focus', { placeholder: 'ex. le Québec et la techno d’abord', label: 'Accent particulier' })),
    ], "Chaque mise à jour envoie à Anthropic les titres récents de vos fils (pas vos réglages ni vos clés) et coûte quelques cents avec Claude Opus 5.5, moins avec Sonnet ou Haiku. Lookout ne redemande un résumé que si les titres ont changé, et jamais plus d'une fois par heure."),
    group('Sections résumées', [
      line('Tous mes fils', h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: all, 'aria-label': 'Tous mes fils',
        onChange: (e) => { o.sections = e.target.checked ? [] : feeds.map((x) => x.id); commit(); render(); } })),
      !all && feeds.map((x) => line(x.title, h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: o.sections.includes(x.id), 'aria-label': x.title,
        onChange: (e) => { o.sections = e.target.checked ? [...o.sections, x.id] : o.sections.filter((id) => id !== x.id); commit(); } }))),
    ], "Seuls les articles des dernières 24 heures comptent, huit par section au plus. Les sections YouTube ne sont pas résumées.")];
  }

  function editor(s) {
    return [commonGroup(s),
      s.kind === 'feed' && [s.feed.youtube ? youtubeSources(s) : feedSources(s), articleDisplay(s, true)],
      s.kind === 'weather' && weatherEditor(s),
      s.kind === 'commute' && commuteEditor(s),
      s.kind === 'sports' && sportsEditor(s),
      s.kind === 'api' && [apiEditor(s), articleDisplay(s, false)],
      s.kind === 'releases' && releasesEditor(s),
      s.kind === 'calendar' && calendarEditor(s),
      s.kind === 'standings' && standingsEditor(s),
      s.kind === 'hass' && hassEditor(s),
      s.kind === 'stocks' && stocksEditor(s),
      s.kind === 'summary' && summaryEditor(s)];
  }

  // --- Liste des sections ---
  // La liste est une arborescence : chaque page, puis ses sections dans l'ordre du tableau de bord.
  // On glisse une section pour la changer de place ou de page ; une page repliée reste une cible de dépôt.
  let listEl = null;
  const collapsed = new Set();   // pages repliées (le temps que les réglages restent ouverts)
  const clearMarks = () => { for (const el of listEl?.querySelectorAll('.drop-before, .drop-after, .drop-into') ?? []) el.classList.remove('drop-before', 'drop-after', 'drop-into'); };

  /** Déplace une section : devant ou derrière une autre (`anchorID`), ou à la fin d'une page. Elle prend la page d'arrivée. */
  function moveSection(id, pageID, anchorID = null, after = false) {
    const list = config().sections, from = list.findIndex((x) => x.id === id);
    if (from < 0 || id === anchorID) return;
    const [moved] = list.splice(from, 1);
    if (moved.page !== pageID) { moved.page = pageID; moved.column = -1; }
    let at = anchorID ? list.findIndex((x) => x.id === anchorID) + (after ? 1 : 0) : -1;
    if (at < 0) at = list.findLastIndex((x) => x.page === pageID) + 1 || list.length;   // fin de la page
    list.splice(at, 0, moved);
    collapsed.delete(pageID);
    commit(); render();
  }

  // Glisser une section dans la liste, à la souris comme au doigt. À la souris, on la saisit n'importe où ;
  // au doigt, par sa poignée (à droite), pour que la liste continue de défiler normalement sous le pouce.
  let listDrag = null, skipClick = false;
  /** Où la section atterrirait si on la lâchait à cet endroit : une autre section (avant ou après), ou une page. */
  function listTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !listEl?.contains(el)) return null;
    const item = el.closest('.s-item');
    if (item) {
      const r = item.getBoundingClientRect(), after = y > r.top + r.height / 2;
      return { el: item, mark: after ? 'drop-after' : 'drop-before', page: item.dataset.page, anchor: item.dataset.section, after };
    }
    const group = el.closest('.s-group');
    return group ? { el: group, mark: 'drop-into', page: group.dataset.page } : null;
  }
  function moveListDrag(e) {
    const d = listDrag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.active) {
      if (Math.hypot(d.x - d.startX, d.y - d.startY) < 6) return;
      d.active = true;
      const r = d.item.getBoundingClientRect();
      d.ghost = d.item.cloneNode(true);
      d.ghost.classList.add('s-ghost');
      d.ghost.style.width = `${r.width}px`;
      d.dx = d.startX - r.left; d.dy = d.startY - r.top;
      document.body.append(d.ghost);
      d.item.classList.add('dragging');
      document.body.classList.add('is-dragging');
      const loop = () => {
        if (listDrag !== d) return;
        // Près du haut ou du bas de la liste : elle défile toute seule.
        const r2 = listEl.getBoundingClientRect(), edge = 36;
        if (d.y < r2.top + edge) listEl.scrollTop -= 8; else if (d.y > r2.bottom - edge) listEl.scrollTop += 8;
        requestAnimationFrame(loop);
      };
      loop();
    }
    e.preventDefault();
    d.ghost.style.transform = `translate(${d.x - d.dx}px, ${d.y - d.dy}px)`;
    clearMarks();
    d.target = listTarget(d.x, d.y);
    if (d.target && d.target.anchor !== d.id) d.target.el.classList.add(d.target.mark); else if (d.target?.anchor === d.id) d.target = null;
  }
  function endListDrag(e) {
    const d = listDrag;
    if (!d || (e && e.pointerId !== d.pointerId)) return;
    listDrag = null;
    window.removeEventListener('pointermove', moveListDrag);
    window.removeEventListener('pointerup', endListDrag);
    window.removeEventListener('pointercancel', endListDrag);
    if (!d.active) return;
    d.ghost.remove();
    d.item.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    clearMarks();
    skipClick = true;
    setTimeout(() => { skipClick = false; }, 50);
    const target = e?.type === 'pointerup' ? d.target : null;
    if (!target) return;
    let page = target.page;
    if (page === '+') {
      const created = newPage(t('Nouvelle page'));
      config().pages.push(created);
      page = created.id;
    }
    moveSection(d.id, page, target.anchor, target.after);
  }
  function enableListDrag(item, s, handle) {
    const start = (e) => {
      if (listDrag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // Au doigt, seule la poignée lance le déplacement.
      if (e.pointerType === 'touch' && !handle.contains(e.target)) return;
      listDrag = { id: s.id, item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, target: null };
      window.addEventListener('pointermove', moveListDrag, { passive: false });
      window.addEventListener('pointerup', endListDrag);
      window.addEventListener('pointercancel', endListDrag);
    };
    item.addEventListener('pointerdown', start);
  }

  function sectionItem(s) {
    const handle = h('span', { class: 's-grip', title: 'Glisser pour déplacer', 'aria-hidden': 'true' }, icon('drag'));
    const item = h('button', { class: `s-item${s.enabled ? '' : ' off'}`, role: 'option', 'aria-selected': String(s.id === ui.selected),
      onClick: () => { if (skipClick) return; ui.selected = s.id; ui.detail = true; render(); } },
    badge(s, true), h('span', { class: 'names' }, h('span', {}, s.title || 'Sans titre'), h('small', {}, t(KINDS[s.kind].label))),
    !s.enabled && h('span', { title: 'Section masquée' }, icon('hide')), handle);
    item.dataset.section = s.id;
    item.dataset.page = s.page;
    enableListDrag(item, s, handle);
    return h('li', {}, item);
  }
  let renamingPage = null;   // id de la page dont on saisit le nom dans la liste
  /** Menu d'une page : la renommer, changer son ordre, la supprimer (ses sections passent sur une autre page). */
  function pageMenu(anchor, p) {
    const pages = config().pages, sections = config().sections, i = pages.indexOf(p);
    const swap = (j) => () => { [pages[i], pages[j]] = [pages[j], pages[i]]; commit(); render(); };
    openMenu(anchor, [
      { label: 'Renommer', action: () => { renamingPage = p.id; refreshList(); } },
      { label: 'Monter', icon: icon('up'), disabled: i === 0, action: swap(i - 1) },
      { label: 'Descendre', icon: icon('down'), disabled: i === pages.length - 1, action: swap(i + 1) },
      '-',
      { label: 'Supprimer la page', icon: icon('trash'), disabled: pages.length < 2, action: async () => {
        const count = sections.filter((x) => x.page === p.id).length;
        if (count && !await confirmDialog('Supprimer cette page ?', t('Ses {0} sections seront déplacées vers une autre page, pas supprimées.', count), 'Supprimer')) return;
        pages.splice(pages.indexOf(p), 1);
        for (const x of sections) if (x.page === p.id) { x.page = pages[0].id; x.column = -1; }
        commit(); render();
      } },
    ]);
  }
  /** Champ qui remplace le nom d'une page pendant qu'on la renomme. Entrée ou un clic ailleurs valide, Échap annule. */
  function pageNameField(p) {
    const input = h('input', { class: 'field s-page-name', value: p.name, maxlength: '40', placeholder: t('Nom de la page'), 'aria-label': 'Nom de la page' });
    const done = (save) => {
      if (renamingPage !== p.id) return;
      renamingPage = null;
      const name = input.value.trim().slice(0, 40);
      if (save && name && name !== p.name) { p.name = name; commit(); }
      refreshList();
    };
    input.addEventListener('blur', () => done(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.stopPropagation(); done(false); }
    });
    setTimeout(() => { input.focus(); input.select(); });
    return input;
  }
  function sectionItems() {
    const pages = config().pages, sections = config().sections;
    const groups = pages.map((p) => {
      const mine = sections.filter((s) => s.page === p.id), open = !collapsed.has(p.id), name = p.name || t('Sans titre');
      const head = renamingPage === p.id ? h('div', { class: 's-page-row' }, pageNameField(p)) : h('div', { class: 's-page-row' },
        h('button', { class: 's-page', 'aria-expanded': String(open), title: open ? 'Replier la page' : 'Déplier la page',
          onClick: () => { if (open) collapsed.add(p.id); else collapsed.delete(p.id); refreshList(); },
          onDblclick: () => { renamingPage = p.id; refreshList(); } },
        icon(open ? 'down' : 'right'), h('span', { class: 'grow' }, document.createTextNode(name)), h('small', {}, String(mine.length))),
        h('button', { class: 'icon-btn s-page-more', title: 'Options de la page', 'aria-label': t('Options de la page {0}', name), onClick: (e) => pageMenu(e.currentTarget, p) }, icon('more')));
      const group = h('li', { class: 's-group' }, head,
        open && h('ul', { role: 'group', 'aria-label': name }, mine.map(sectionItem),
          !mine.length && h('li', { class: 's-empty' }, 'Glissez une section ici')));
      group.dataset.page = p.id;   // sur l'en-tête, ou dans le vide de la page : la section se range à la fin
      return group;
    });
    const add = h('li', { class: 's-group' }, h('button', { class: 's-page add', title: 'Ajouter une page',
      onClick: () => { const page = newPage(t('Nouvelle page')); config().pages.push(page); commit(); renamingPage = page.id; refreshList();
        setTimeout(() => listEl?.querySelector('.s-page-name')?.scrollIntoView({ block: 'nearest' })); } }, icon('plus'), h('span', { class: 'grow' }, 'Nouvelle page')));
    add.dataset.page = '+';
    return [...groups, add];
  }
  function refreshList() { listEl?.replaceChildren(...sectionItems()); }

  /** Monte ou descend la section choisie parmi celles de sa page ; au bout, elle passe sur la page voisine. */
  function moveSelected(offset) {
    const list = config().sections, pages = config().pages, s = list.find((x) => x.id === ui.selected);
    if (!s) return;
    const mine = list.filter((x) => x.page === s.page), i = mine.indexOf(s), neighbour = mine[i + offset];
    if (neighbour) return moveSection(s.id, s.page, neighbour.id, offset > 0);
    const page = pages[pages.findIndex((p) => p.id === s.page) + offset];
    if (!page) return;
    const first = list.find((x) => x.page === page.id);
    moveSection(s.id, page.id, offset > 0 ? first?.id ?? null : null, false);
  }

  async function deleteSection(s) {
    const list = config().sections;
    if (!await confirmDialog('Supprimer cette section ?', 'La section et ses sources seront supprimées. Pour la retirer temporairement, désactivez-la plutôt.', 'Supprimer')) return;
    const i = list.indexOf(s);
    if (i < 0) return;
    list.splice(i, 1);
    ui.selected = (list.filter((x) => x.page === s.page)[0] ?? list[Math.min(i, list.length - 1)])?.id ?? null;
    ui.detail = false;
    commit(); render();
  }
  function duplicateSection(s) {
    const list = config().sections, copy = JSON.parse(JSON.stringify(s));
    copy.id = uuid();
    copy.title += t(' (copie)');
    copy.column = -1;
    // Une adresse de calendrier masquée ne se copie pas : le serveur ne la retrouverait pas sous un nouvel identifiant.
    for (const c of copy.calendar.calendars) if (c.url === SECRET_MASK) c.url = '';
    for (const x of [...copy.feed.sources, ...copy.commute.routes, ...copy.sports.leagues, ...copy.calendar.calendars]) x.id = uuid();
    list.splice(list.indexOf(s) + 1, 0, copy);
    ui.selected = copy.id;
    commit(); render();
  }
  /** Bas de la fiche d'une section : ce qu'on peut faire de la section entière. */
  const sectionActions = (s) => group('Cette section', [
    line('Dupliquer', h('button', { class: 'btn', onClick: () => duplicateSection(s) }, icon('copy'), 'Dupliquer')),
    line('Supprimer', h('button', { class: 'btn danger', onClick: () => deleteSection(s) }, icon('trash'), 'Supprimer…')),
  ], "Pour retirer une section du tableau de bord sans perdre ses réglages, désactivez plutôt « Afficher dans le tableau de bord ».");

  function sectionsTab() {
    const list = config().sections, selected = list.find((s) => s.id === ui.selected);
    listEl = h('ul', { class: 's-tree', role: 'listbox', 'aria-label': 'Sections' }, sectionItems());
    const foot = h('div', { class: 's-list-foot' },
      // La nouvelle section rejoint la page de celle qui est sélectionnée, sinon la page affichée.
      h('button', { class: 'btn small', title: 'Ajouter une section', onClick: (e) => addSectionMenu(e.currentTarget, (s) => {
        s.page = selected?.page ?? app.currentPage(); list.push(s); ui.selected = s.id; ui.detail = true; commit(); render(); }) }, icon('plus'), 'Section'),
      h('span', { style: { flex: '1' } }),
      h('button', { class: 'icon-btn', title: 'Monter la section', 'aria-label': 'Monter la section', disabled: !selected, onClick: () => moveSelected(-1) }, icon('up')),
      h('button', { class: 'icon-btn', title: 'Descendre la section', 'aria-label': 'Descendre la section', disabled: !selected, onClick: () => moveSelected(1) }, icon('down')));
    const pane = h('div', { class: 's-pane' }, selected ? [editor(selected), sectionActions(selected)]
      : h('div', { class: 'error-state' }, h('strong', {}, 'Aucune section sélectionnée'), h('span', {}, 'Choisissez une section dans la liste, ou ajoutez-en une.')));
    return h('div', { class: `settings-body sections${ui.detail && selected ? ' detail' : ''}` }, h('div', { class: 's-list' }, listEl, foot), pane);
  }

  // --- Rubriques des préférences ---
  /** Une rubrique : une colonne de lecture confortable, précédée d'une phrase qui dit à quoi elle sert. */
  const heading = (intro) => intro && h('p', { class: 's-intro' }, intro);
  const pane = (intro, ...content) => h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { class: 's-col' }, heading(intro), content)));

  function generalPane() {
    const g = config().general;
    return pane("La langue, les unités et le rythme auquel Lookout interroge vos sources.",
      group('Langue', [
        line('Langue', h('span', { onChange: () => { app.renderAll(); render(); } }, select(g, 'language', [['auto', 'Automatique'], ['fr', 'Français'], ['en', 'English']], { label: 'Langue' }))),
      ], "Automatique suit la langue de l'appareil. Les titres de vos sections et le contenu des sources ne sont pas traduits."),
      group('Unités', [
        line('Unités', select(g, 'units', [['metric', 'Métrique (°C, km)'], ['imperial', 'Impérial (°F, mi)']], { label: 'Unités' })),
      ]),
      group("Message d'accueil", [
        line("Afficher le message d'accueil", toggle(g, 'showGreeting', { label: "Message d'accueil" })),
        line('Votre prénom', text(g, 'displayName', { placeholder: 'Facultatif', label: 'Votre prénom' })),
        line("Afficher le coup d'œil (météo et premier trajet)", toggle(g, 'showGlance', { label: "Coup d'œil" })),
      ]),
      group('Mise à jour des sources', [
        // Après le changement, on redemande les sections : le serveur applique tout de suite le nouvel intervalle.
        line('Intervalle par défaut', h('span', { onChange: () => app.saveNow().then(() => app.refreshAll()) }, select(g, 'refreshMinutes',
          REFRESH_CHOICES.map((m) => [m, INTERVAL_LABELS[m]]), { label: 'Intervalle par défaut' }))),
      ], "Chaque source est interrogée au plus une fois par intervalle, même si vous ouvrez ou actualisez la page plus souvent. Cela évite qu'un site vous bloque pour avoir demandé trop souvent. Chaque section peut avoir son propre intervalle, dans ses réglages : par défaut, les pointages et les trajets sont interrogés toutes les 5 minutes. L'icône de rechargement d'une carte met cette section à jour tout de suite."));
  }
  function appearancePane() {
    const g = config().general;
    return pane("L'allure du tableau de bord sur tous vos appareils.",
      group('Couleurs', [
        line('Thème', seg(g, 'appearance', [['system', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']])),
        line("Couleur d'accent", swatches(g, 'accentHex')),
        line('Arrière-plan teinté', toggle(g, 'tintedBackdrop', { label: 'Arrière-plan teinté' })),
      ], "Automatique suit le mode clair ou sombre de chaque appareil."),
      group('Disposition', [
        line('Densité', select(g, 'density', [['compact', 'Compacte'], ['comfortable', 'Confortable'], ['spacious', 'Aérée']], { label: 'Densité' })),
        line('Colonnes', select(g, 'columns', [[0, 'Automatique'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], { label: 'Colonnes' })),
      ], "Sur un écran étroit comme celui d'un iPhone, les cartes passent automatiquement sur une colonne."));
  }
  function readingPane() {
    const g = config().general;
    return pane("Ce qui s'applique à tous vos fils d'articles. Chaque section a en plus ses propres filtres.",
      group('Lecture', [
        line('Atténuer les articles déjà lus', toggle(g, 'dimReadArticles', { label: 'Atténuer les articles lus' })),
        line("Afficher d'abord les articles nouveaux et non lus", toggle(g, 'unreadFirst', { label: "Afficher d'abord les articles nouveaux et non lus" })),
      ], "L'état « lu » est enregistré sur le serveur : il est partagé entre tous vos appareils. Avec la seconde option, chaque carte montre d'abord les articles parus depuis votre dernière visite, puis les autres non lus ; un article déjà lu ne revient que s'il reste de la place. Un article que vous venez d'ouvrir garde sa place jusqu'à la prochaine mise à jour de la section."),
      group('Doublons', [
        line('Afficher chaque nouvelle une seule fois par page', toggle(g, 'dedupeArticles', { label: 'Afficher chaque nouvelle une seule fois par page', rerender: true })),
        g.dedupeArticles && line('Regrouper les articles sur le même sujet', toggle(g, 'groupTopics', { label: 'Regrouper les articles sur le même sujet' })),
      ], "Quand plusieurs sections d'une même page reçoivent la même nouvelle, seule la première dans l'ordre de la page l'affiche ; les autres montrent l'article suivant. Avec le regroupement, quand plusieurs sources couvrent le même événement avec des titres proches, un seul article est affiché et il nomme les autres sources ; un clic sur un nom ouvre son article. Le rapprochement se fait sur les mots des titres, dans une même langue : il peut à l'occasion manquer un sujet, ou réunir deux nouvelles voisines."),
      group('Lecteur intégré', [
        line('Ouvrir les articles dans Lookout', toggle(g, 'readerDefault', { label: 'Ouvrir les articles dans Lookout' })),
      ], "Le lecteur affiche le texte de l'article sans quitter Lookout. Activé, un clic sur un article l'ouvre dans le lecteur ; sinon, utilisez le bouton en forme de livre sur chaque article. Certains sites réservés aux abonnés ne s'y prêtent pas : un bouton ouvre alors l'article sur le site."),
      group('Filtres pour tous les fils', [
        line('Masquer partout', text(g, 'muteKeywords', { placeholder: 'ex. horoscope, célébrités', label: 'Masquer partout' })),
        line('Mots-clés suivis', text(g, 'highlightKeywords', { placeholder: 'ex. Montréal, tempête', label: 'Mots-clés suivis' })),
      ], "Mots ou expressions séparés par des virgules, cherchés dans le titre et le résumé. Ils s'ajoutent aux filtres propres à chaque section. Un article qui contient un mot-clé suivi est mis en évidence dans toutes vos sections ; pour en être aussi averti, voyez Notifications."));
  }
  function notificationsPane() {
    return pane("Être averti d'une alerte météo, d'un match ou d'un nouvel article, même quand Lookout est fermé.", notificationsGroup(config().general));
  }
  function displayPane() {
    const g = config().general;
    return pane("Pour un écran mural, une tablette sur un comptoir ou une télé.",
      group(null, [
        line('Changer de page', select(g, 'displaySeconds', [[0, 'Jamais'], [15, 'Toutes les 15 secondes'], [30, 'Toutes les 30 secondes'], [60, 'Chaque minute'], [120, 'Toutes les 2 minutes'], [300, 'Toutes les 5 minutes']], { label: 'Changer de page' })),
        line('Écran mural ou télé', h('button', { class: 'btn', onClick: () => { closeCurrent?.(); app.startDisplay(); } }, sfIcon('desktopcomputer'), 'Lancer le mode affichage')),
      ], "Plein écran, sans boutons, avec l'heure. Les pages défilent l'une après l'autre et l'écran reste allumé. Pour en sortir : touche Échap, ou touchez l'écran puis « Quitter »."));
  }
  function keysPane() {
    return pane("Ce que vous fournissez une fois pour toute l'installation. Un profil qui saisit sa propre clé dans une section garde la sienne.", sharedKeysForm());
  }
  function backupPane() {
    const note = h('p', {});
    return pane("Toute l'installation dans un seul fichier, pour la reconstruire sur ce serveur ou sur un autre.", autoBackups(note), fullBackup(note), note);
  }
  function aboutPane() {
    const link = (label, href) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--accent)' } }, label);
    return pane(null,
      h('div', { class: 'about-head' }, h('img', { src: new URL('logo.svg', import.meta.url).href, alt: '', width: '56', height: '56' }),
        h('div', {}, h('strong', {}, 'Lookout'), h('span', {}, t('Version {0}', app.version ?? '?')))),
      group(null, [
        line('Version', h('span', { class: 'mono' }, app.version ?? '?')),
        line("Empreinte de l'interface", h('span', { class: 'mono' }, app.build ?? '?')),
        line('Vos réglages sur le serveur', h('span', { class: 'mono' }, `data/profiles/${app.user.id}/config.json`)),
      ], 'Dans le dossier de données du conteneur.'),
      group(null, [
        line('Notes de version', link('github.com/gharl77/lookout/releases', 'https://github.com/gharl77/lookout/releases')),
        line('Code source et documentation', link('github.com/gharl77/lookout', 'https://github.com/gharl77/lookout')),
        line('Licence', h('span', {}, 'MIT')),
      ], "Lookout est un logiciel libre. Vos réglages et vos données restent sur votre serveur."));
  }

  // --- Notifications sur cet appareil ---
  // L'abonnement est propre à l'appareil (et, sur iPhone, à l'app ajoutée à l'écran d'accueil) ; ce qui
  // déclenche une notification est un réglage du profil, commun à tous ses appareils.
  const push = { state: 'unknown', note: null };   // unknown | unsupported | insecure | denied | off | on
  const pushRegistration = () => navigator.serviceWorker.register(new URL('sw.js', document.baseURI));
  /** Abonne cet appareil et l'annonce au serveur. `renew` : remplace l'abonnement en place, s'il est périmé. */
  async function subscribePush(registration, renew = false) {
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && renew) { await subscription.unsubscribe(); subscription = null; }
    if (!subscription) {
      const { key } = await api('/api/push/key');
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) });
    }
    const answer = await api('/api/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), lang: document.documentElement.lang } });
    // Le serveur sait que cet abonnement est périmé : on en crée un neuf (une seule fois).
    if (answer.expired && !renew) return subscribePush(registration, true);
    push.endpoint = subscription.endpoint;
    return subscription;
  }
  async function readPushState() {
    if (!window.isSecureContext) push.state = 'insecure';
    else if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) push.state = 'unsupported';
    else if (Notification.permission === 'denied') push.state = 'denied';
    else {
      try {
        const registration = await pushRegistration(), subscription = await registration.pushManager.getSubscription();
        push.state = subscription ? 'on' : 'off';
        push.endpoint = subscription?.endpoint ?? null;
        // Le serveur a pu oublier cet appareil (session renouvelée) ou savoir son abonnement périmé : on se remet d'accord.
        if (subscription) await subscribePush(registration).catch(() => {});
      } catch { push.state = 'unsupported'; }
    }
    if (ui.tab === 'notifications') render();
  }
  async function setPush(on) {
    push.note = null;
    try {
      const registration = await pushRegistration();
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (on) {
        if (await Notification.requestPermission() !== 'granted') { push.state = Notification.permission === 'denied' ? 'denied' : 'off'; return render(); }
        await subscribePush(registration);
        push.state = 'on';
      } else if (existing) {
        await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: existing.endpoint } });
        await existing.unsubscribe();
        push.state = 'off';
      }
    } catch (error) { push.note = { text: error.message, ok: false }; }
    render();
  }
  function notificationsGroup(g) {
    if (push.state === 'unknown') readPushState();
    const WHY = {
      insecure: "Les notifications exigent une adresse en HTTPS. Ouvrez Lookout par son adresse sécurisée.",
      unsupported: "Ce navigateur ne propose pas les notifications. Sur iPhone ou iPad : ajoutez d'abord Lookout à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvrez-le depuis son icône. Sur Mac ou PC : utilisez Safari, Chrome, Edge ou Firefox, hors navigation privée.",
      denied: "Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur ou de l'appareil, puis revenez ici.",
    };
    const usable = push.state === 'on' || push.state === 'off';
    const test = async () => {
      try {
        try { await api('/api/push/test', { method: 'POST', body: { endpoint: push.endpoint } }); } catch (error) {
          if (error.status !== 410) throw error;
          // Abonnement périmé côté service de notifications : on en crée un neuf et on réessaie une fois.
          await subscribePush(await pushRegistration(), true);
          await api('/api/push/test', { method: 'POST', body: { endpoint: push.endpoint } });
        }
        push.note = { text: t("Notification d'essai envoyée à cet appareil. Si rien n'apparaît, vérifiez que le système autorise les notifications de ce navigateur."), ok: true };
      } catch (error) { push.note = { text: error.message, ok: false }; }
      render();
    };
    const note = noteView(push.note);
    push.note = null;
    return [group('Cet appareil', [
      line('Recevoir les notifications sur cet appareil', h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: push.state === 'on', disabled: !usable,
        'aria-label': 'Notifications sur cet appareil', onChange: (e) => setPush(e.target.checked) })),
      push.state === 'on' && h('div', { class: 'line' }, h('div', {}, note), h('button', { class: 'btn', onClick: test }, sfIcon('bell.fill'), "Envoyer une notification d'essai")),
      push.state !== 'on' && note && h('div', { class: 'line' }, note),
    ], WHY[push.state] ?? "Chaque appareil s'abonne séparément : iPhone, iPad, Mac ou PC. Sur iPhone, Lookout doit d'abord être ajouté à l'écran d'accueil."),
    group('Me prévenir pour', [
      line('Alertes météo', toggle(g, 'notifyAlerts', { label: 'Alertes météo' })),
      line("Début d'un match de mes équipes", toggle(g, 'notifyGameStart', { label: "Début d'un match" })),
      line("Résultat final d'un match de mes équipes", toggle(g, 'notifyGameEnd', { label: 'Résultat final' })),
      line('Article qui contient un de mes mots-clés suivis', toggle(g, 'notifyKeywords', { label: 'Mots-clés suivis', rerender: true })),
      g.notifyKeywords && line('Mots-clés suivis', text(g, 'highlightKeywords', { placeholder: 'ex. Montréal, tempête', label: 'Mots-clés suivis' })),
    ], "Lookout surveille vos sections même quand la page est fermée. Pour les matchs, seules les ligues où vous avez choisi des équipes comptent. Les mots-clés suivis sont cherchés dans tous vos fils (sauf YouTube) ; pour recevoir tous les nouveaux articles d'une section, activez l'option dans les réglages de cette section."),
    group('Heures calmes', [
      line('Ne rien envoyer pendant certaines heures', toggle(g, 'quietHours', { label: 'Heures calmes', rerender: true })),
      g.quietHours && line('De', text(g, 'quietStart', { type: 'time', bare: false, label: 'Début des heures calmes' })),
      g.quietHours && line('À', text(g, 'quietEnd', { type: 'time', bare: false, label: 'Fin des heures calmes' })),
      g.quietHours && line('Laisser passer les alertes météo', toggle(g, 'quietAllowAlerts', { label: 'Laisser passer les alertes météo' })),
    ], "Pendant ces heures, aucune notification n'est envoyée, et celles qui auraient dû l'être ne sont pas rattrapées ensuite. L'heure est celle du serveur."),
    group('Résumé du matin', [
      line('Recevoir un résumé chaque matin', toggle(g, 'morningBrief', { label: 'Résumé du matin', rerender: true })),
      g.morningBrief && line('Heure', text(g, 'morningTime', { type: 'time', bare: false, label: 'Heure du résumé du matin' })),
    ], "Une notification avec la météo, vos rendez-vous du jour et les grands titres de vos premières sections. Elle arrive sur les appareils abonnés, même pendant les heures calmes. L'heure est celle du serveur.")];
  }

  // --- Données ---
  function dataTab() {
    const note = h('p', {});
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed?.sections)) throw new Error(t("Ce fichier n'est pas une configuration Lookout valide."));
        if (!await confirmDialog('Importer cette configuration ?', 'La configuration actuelle sera remplacée.', 'Importer', false)) return;
        await app.replaceConfig(await api('/api/config', { method: 'PUT', body: parsed }));
        ui.selected = config().sections[0]?.id ?? null;
        render();
        note.textContent = t('Configuration importée.');
      } catch (error) { note.textContent = error instanceof SyntaxError ? t("Ce fichier n'est pas du JSON valide.") : error.message; }
    } });
    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { class: 's-col' }, heading("Vos sections, vos sources et vos préférences dans un fichier, pour les garder ou les reprendre ailleurs."),
      group('Exporter et importer', [
        line('Exporter la configuration', h('button', { class: 'btn', onClick: () => {
          const blob = new Blob([JSON.stringify(config(), null, 2)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'Lookout-configuration.json' });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          note.textContent = t('Configuration exportée.');
        } }, icon('download'), 'Exporter…')),
        line('Importer une configuration', h('button', { class: 'btn', onClick: () => fileInput.click() }, icon('upload'), 'Importer…'), fileInput),
      ], 'Le fichier JSON contient toutes vos sections, sources et préférences, mais pas vos clés ni vos jetons.'),
      group('Repartir de zéro', [
        line('Revenir à la configuration de départ', h('button', { class: 'btn danger', onClick: async () => {
          if (!await confirmDialog('Réinitialiser toute la configuration ?', "Toutes vos sections et sources seront remplacées par celles de départ. Exportez d'abord votre configuration si vous voulez la conserver.", 'Réinitialiser')) return;
          await app.replaceConfig(await api('/api/config/reset', { method: 'POST' }));
          ui.selected = config().sections[0]?.id ?? null;
          render();
          note.textContent = t('Configuration réinitialisée.');
        } }, icon('reset'), 'Réinitialiser…')),
      ]), note)));
  }

  // --- Sauvegarde complète (administrateur) ---
  /** Redemande le mot de passe de l'administrateur avant une opération sensible. Renvoie le mot de passe, ou null. */
  const askPassword = (title, message, actionLabel) => new Promise((resolve) => {
    let answer = null;
    openDialog((close) => {
      const input = h('input', { class: 'field', type: 'password', placeholder: t('Votre mot de passe'), 'aria-label': 'Votre mot de passe', autocomplete: 'current-password', autofocus: true });
      return h('form', { style: { display: 'contents' }, novalidate: true, onSubmit: (e) => { e.preventDefault(); if (!input.value) return input.focus(); answer = input.value; close(); } },
        h('h3', {}, title), h('p', {}, message),
        h('input', { type: 'text', name: 'username', autocomplete: 'username', value: app.user.name, hidden: true }), input,
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: close }, 'Annuler'), h('button', { class: 'btn primary', type: 'submit' }, actionLabel)));
    }, { onClose: () => resolve(answer) });
  });

  /** Sauvegardes automatiques gardées sur le serveur : la liste se charge d'elle-même. */
  function autoBackups(note) {
    const box = h('div', {}, h('div', { class: 'line' }, h('span', { class: 'spinner' })));
    const lang = document.documentElement.lang;
    const size = (bytes) => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1000))} ko` : `${fmt.number(bytes / 1e6, 1)} Mo`);
    const save = (backup, name) => {
      const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' })), download: `Lookout-sauvegarde-${name}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    const download = async (file) => {
      const password = await askPassword('Télécharger cette sauvegarde', "Le fichier contient tous les profils, leurs réglages, leurs clés d'API et les clés partagées. Gardez-le en lieu sûr.", 'Télécharger');
      if (!password) return;
      try { save(await api('/api/backup', { method: 'POST', body: { password, name: file.name } }), file.day); } catch (error) { note.textContent = error.message; }
    };
    const restore = async (file, day) => {
      const password = await askPassword(t('Restaurer la sauvegarde du {0} ?', day),
        "Tous les profils actuels seront remplacés par ceux de cette sauvegarde. Tout le monde devra se reconnecter, avec le mot de passe qu'il avait à ce moment-là. Les données actuelles sont mises de côté sur le serveur.", 'Restaurer');
      if (!password) return;
      try { await api('/api/restore', { method: 'POST', body: { password, name: file.name } }); location.reload(); } catch (error) { note.textContent = error.message; }
    };
    const draw = ({ files, keep }) => {
      const dayLabel = (file) => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${file.day}T12:00:00Z`));
      box.replaceChildren(group('Sauvegardes automatiques', [
        files.map((file) => h('div', { class: 'line' },
          h('span', { class: 'lbl' }, dayLabel(file), h('small', { class: 'sub-line' }, [file.users != null && (file.users > 1 ? t('{0} profils', file.users) : t('1 profil')), size(file.size)].filter(Boolean).join(' · '))),
          h('div', { class: 'ctl' },
            h('button', { class: 'btn', onClick: () => download(file) }, icon('download'), 'Télécharger…'),
            h('button', { class: 'btn danger', onClick: () => restore(file, dayLabel(file)) }, icon('reset'), 'Restaurer…')))),
        !files.length && h('div', { class: 'line' }, 'Aucune sauvegarde pour le moment : la première sera faite cette nuit.'),
        h('div', { class: 'line' }, h('button', { class: 'btn', onClick: async () => {
          try { draw(await api('/api/backups', { method: 'POST', body: {} })); note.textContent = t('Sauvegarde faite.'); } catch (error) { note.textContent = error.message; }
        } }, icon('plus'), 'Sauvegarder maintenant')),
      ], t("Chaque nuit, vers 3 h, Lookout écrit toute l'installation dans le dossier « backups » de ses données, et garde les {0} dernières. Ces fichiers contiennent les clés d'API : le dossier de données ne doit être lisible que par vous. Pour vous protéger d'une panne du serveur lui-même, copiez-les de temps à autre ailleurs.", keep)));
    };
    api('/api/backups').then(draw).catch((error) => box.replaceChildren(h('p', {}, error.message)));
    return box;
  }

  function fullBackup(note) {
    const download = async () => {
      const password = await askPassword('Télécharger la sauvegarde complète', "Le fichier contient tous les profils, leurs réglages, leurs clés d'API et les clés partagées. Gardez-le en lieu sûr.", 'Télécharger');
      if (!password) return;
      try {
        const backup = await api('/api/backup', { method: 'POST', body: { password } });
        const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' })), download: `Lookout-sauvegarde-${backup.createdAt.slice(0, 10)}.json` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        note.textContent = t('Sauvegarde complète téléchargée ({0} profils).', backup.users.length);
      } catch (error) { note.textContent = error.message; }
    };
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        if (backup?.format !== 'lookout-backup' || !Array.isArray(backup.users)) throw new Error(t("Ce fichier n'est pas une sauvegarde Lookout valide"));
        const password = await askPassword(t('Restaurer la sauvegarde du {0} ?', new Date(backup.createdAt).toLocaleDateString(document.documentElement.lang)),
          t("Tous les profils actuels seront remplacés par les {0} profils de la sauvegarde ({1}). Tout le monde devra se reconnecter, avec le mot de passe qu'il avait à ce moment-là. Les données actuelles sont mises de côté sur le serveur.",
            backup.users.length, backup.users.map((u) => u.name).join(', ')), 'Restaurer');
        if (!password) return;
        await api('/api/restore', { method: 'POST', body: { password, backup } });
        location.reload();
      } catch (error) { note.textContent = error instanceof SyntaxError ? t("Ce fichier n'est pas du JSON valide.") : error.message; }
    } });
    return group('Sauvegarde manuelle', [
      line('Télécharger tous les profils', h('button', { class: 'btn', onClick: download }, icon('download'), 'Télécharger…')),
      line('Restaurer une sauvegarde', h('button', { class: 'btn danger', onClick: () => fileInput.click() }, icon('upload'), 'Restaurer…'), fileInput),
    ], "Réservé aux administrateurs. Contrairement à l'export de « Mes données », ce fichier contient tout : les comptes, les réglages de chaque profil et les clés d'API. Il permet de reconstruire l'installation sur un autre serveur.");
  }

  // --- Compte ---
  const passwordField = (placeholder, autocomplete) => h('input', { class: 'field', type: 'password', placeholder, 'aria-label': placeholder, autocomplete, minlength: '6' });

  function accountTab() {
    const current = passwordField('Mot de passe actuel', 'current-password'), next = passwordField('Nouveau mot de passe', 'new-password'),
      confirm = passwordField('Confirmer le nouveau mot de passe', 'new-password');
    const note = h('div', {});
    const say = (text, ok = false) => note.replaceChildren(noteView({ text, ok }));
    const change = async (e) => {
      e.preventDefault();
      if (next.value.length < 6) return say(t('Le mot de passe doit compter au moins 6 caractères'));
      if (next.value !== confirm.value) return say(t('Les deux mots de passe ne sont pas identiques'));
      try {
        await api('/api/auth/password', { method: 'POST', body: { current: current.value, next: next.value } });
        for (const input of [current, next, confirm]) input.value = '';
        say(t('Mot de passe modifié. Vos autres appareils devront se reconnecter.'), true);
      } catch (error) { say(error.message); }
    };
    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { class: 's-col' }, heading(null),
      group('Mon profil', [
        line('Nom', h('span', {}, app.user.name)),
        line('Rôle', h('span', {}, app.user.role === 'admin' ? 'Administrateur' : 'Utilisateur')),
      ], "Vos sections, vos sources et vos préférences vous sont propres : les autres profils ont les leurs."),
      h('form', { onSubmit: change }, group('Mot de passe', [
        // Champ du nom, invisible : il permet au gestionnaire de mots de passe d'associer le nouveau mot de passe au bon compte.
        h('input', { type: 'text', name: 'username', autocomplete: 'username', value: app.user.name, hidden: true }),
        h('div', { class: 'line stack' }, current, next, confirm),
        h('div', { class: 'line' }, note, h('button', { class: 'btn', type: 'submit' }, icon('key'), 'Changer le mot de passe')),
      ])),
      group('Session', [
        line('Se déconnecter de cet appareil', h('button', { class: 'btn', onClick: signOut }, icon('signout'), 'Se déconnecter')),
      ], "Vous restez connecté sur cet appareil tant que vous ne vous déconnectez pas, même après une mise à jour de Lookout."))));
  }

  // --- Profils (administrateur) ---
  let users = null, usersNote = null;   // { text, ok }
  const noteView = (note) => note && h('p', { class: `form-note ${note.ok ? 'ok' : 'error'}`, role: note.ok ? 'status' : 'alert' }, icon(note.ok ? 'check-on' : 'warning'), ' ', note.text);
  async function loadUsers() {
    try { users = await api('/api/users'); } catch (error) { users = []; usersNote = { text: error.message, ok: false }; }
    if (ui.tab === 'users' || ui.tab === 'keys') render();
  }
  /** Lance une action sur les profils, recharge la liste et affiche le résultat. */
  async function usersAction(action, done) {
    try { await action(); usersNote = done ? { text: t(done), ok: true } : null; } catch (error) { usersNote = { text: error.message, ok: false }; }
    await loadUsers();
  }

  // --- Présence : qui est en ligne ---
  const ago = (ms) => {
    const rtf = new Intl.RelativeTimeFormat(document.documentElement.lang, { numeric: 'auto', style: 'short' });
    const minutes = Math.round((ms - Date.now()) / 60e3);
    if (minutes > -1) return t("à l'instant");
    if (minutes > -60) return rtf.format(minutes, 'minute');
    if (minutes > -48 * 60) return rtf.format(Math.round(minutes / 60), 'hour');
    return rtf.format(Math.round(minutes / 1440), 'day');
  };
  const presenceSummary = () => {
    const online = users.filter((u) => u.online).length;
    return t('{0} profils · {1} en ligne', users.length, online);
  };
  /** « ● En ligne · 2 appareils · 8 sections · vous » */
  function presenceLine(u) {
    const status = u.online ? h('span', { class: 'online-text' }, 'En ligne')
      : h('span', {}, u.lastSeen ? t('Vu {0}', ago(u.lastSeen)) : t('Jamais connecté'));
    const parts = [u.devices.length ? t(u.devices.length > 1 ? '{0} appareils' : '{0} appareil', u.devices.length) : null,
      t('{0} sections', u.sections), u.id === app.user.id ? t('vous') : null].filter(Boolean);
    return [status, ` · ${parts.join(' · ')}`];
  }
  /** Met à jour l'état « en ligne » sans redessiner l'onglet (ce qui effacerait un formulaire en cours de saisie). */
  async function refreshPresence() {
    if (ui.tab !== 'users' || !users) return;
    let fresh;
    try { fresh = await api('/api/users'); } catch { return; }
    if (fresh.length !== users.length || fresh.some((u, i) => u.id !== users[i].id)) { users = fresh; return render(); }
    users = fresh;
    for (const u of users) {
      root.querySelector(`[data-presence="${u.id}"]`)?.replaceChildren(...presenceLine(u));
      root.querySelector(`[data-dot="${u.id}"]`)?.classList.toggle('online', u.online);
    }
    const summary = root.querySelector('[data-summary]');
    if (summary) summary.textContent = presenceSummary();
  }
  const presenceTimer = setInterval(refreshPresence, 20e3);

  function devicesDialog(user) {
    openDialog((close) => [
      h('h3', {}, t('Appareils de {0}', user.name)),
      user.devices.length ? h('div', { class: 'pick-list' }, user.devices.map((d) => h('div', { class: 'pick' },
        h('span', { class: `status-dot${d.online ? ' online' : ''}` }),
        h('span', {}, d.label, h('small', {}, d.online ? t('En ligne') : t('Vu {0}', ago(d.lastSeen)), ' · ', t('connecté depuis le {0}', new Intl.DateTimeFormat(document.documentElement.lang, { day: 'numeric', month: 'long' }).format(d.since)))))))
        : h('p', {}, "Aucun appareil connecté."),
      h('div', { class: 'actions' },
        user.devices.length > 0 && h('button', { class: 'btn danger', onClick: async () => {
          close();
          await usersAction(() => api(`/api/users/${encodeURIComponent(user.id)}/signout`, { method: 'POST', body: {} }),
            user.id === app.user.id ? 'Vos autres appareils ont été déconnectés.' : 'Appareils déconnectés.');
        } }, icon('signout'), user.id === app.user.id ? 'Déconnecter mes autres appareils' : 'Déconnecter ses appareils'),
        h('button', { class: 'btn primary', onClick: close }, 'Terminé')),
    ]);
  }

  function passwordDialog(user) {
    openDialog((close) => {
      const input = passwordField('Nouveau mot de passe', 'new-password');
      const error = h('div', {});
      return h('form', { style: { display: 'contents' }, novalidate: true, onSubmit: async (e) => {
        e.preventDefault();
        if (input.value.length < 6) return error.replaceChildren(noteView({ text: t('Le mot de passe doit compter au moins 6 caractères'), ok: false }));
        try {
          await api(`/api/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: { password: input.value } });
          close();
          usersNote = { text: user.id === app.user.id ? t('Mot de passe modifié. Vos autres appareils devront se reconnecter.')
            : t('Mot de passe provisoire de {0} enregistré. Il devra choisir le sien à sa prochaine connexion.', user.name), ok: true };
          render();
        } catch (err) { error.replaceChildren(noteView({ text: err.message, ok: false })); }
      } },
      h('h3', {}, t('Mot de passe de {0}', user.name)), input, error,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: close }, 'Annuler'), h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer')));
    });
  }

  /** Marche à suivre pour créer l'identifiant client Google qui permet de relier un compte YouTube. */
  async function googleHelp() {
    const { redirectURI } = await api('/api/google/status').catch(() => ({ redirectURI: `${location.origin}/api/google/callback` }));
    const STEPS = [
      "Ouvrez console.cloud.google.com et créez un projet (par exemple « Lookout »).",
      "Dans « API et services » → « Bibliothèque », activez « YouTube Data API v3 ».",
      "Dans « Écran de consentement OAuth », choisissez « Externe », donnez un nom à l'application et votre adresse de contact. Ajoutez la portée « youtube.readonly ».",
      "Passez l'application « En production » (bouton « Publier l'application »). En mode « Test », Google déconnecte chaque compte au bout de 7 jours. Sans validation par Google, un écran d'avertissement s'affiche à la connexion : c'est normal pour un usage personnel.",
      "Dans « Identifiants » → « Créer des identifiants » → « ID client OAuth », choisissez « Application Web ».",
      "Sous « URI de redirection autorisés », ajoutez exactement l'adresse ci-dessous.",
      "Copiez l'identifiant client et le secret client dans les deux champs Google, puis enregistrez.",
    ];
    openDialog((close) => [h('h3', {}, 'Créer un identifiant client Google'),
      h('ol', { class: 'steps' }, STEPS.map((step) => h('li', {}, step))),
      h('p', {}, 'Adresse de redirection à déclarer chez Google :'),
      h('input', { class: 'field mono', readonly: true, value: redirectURI, 'aria-label': 'Adresse de redirection', onFocus: (e) => e.target.select() }),
      h('p', {}, "Elle doit être en HTTPS et correspondre à l'adresse par laquelle vous ouvrez Lookout. Chaque profil relie ensuite son propre compte Google, depuis sa section YouTube."),
      h('div', { class: 'actions' },
        h('a', { class: 'btn', href: 'https://console.cloud.google.com/apis/credentials', target: '_blank', rel: 'noopener noreferrer' }, icon('open'), 'Ouvrir Google Cloud'),
        h('button', { class: 'btn primary', onClick: close }, 'Compris'))], { cls: 'dialog wide' });
  }

  // --- Clés d'API partagées (administrateur) ---
  let sharedNote = null;
  /** Ce que la clé Anthropic partagée a coûté ce mois-ci et le mois dernier, par profil. */
  function usageGroup() {
    const report = app.sharedKeys?.usage;
    if (!report) return null;
    const money = (value) => new Intl.NumberFormat(document.documentElement.lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const monthName = (month) => new Intl.DateTimeFormat(document.documentElement.lang, { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00`));
    const total = (rows) => rows.reduce((sum, row) => sum + row.cost, 0), calls = (rows) => rows.reduce((sum, row) => sum + row.calls, 0);
    const detail = (row) => h('span', { class: 'usage' }, h('span', { class: 'sub-line' }, t('{0} résumés', row.calls)), h('b', {}, money(row.cost)));
    return group('Dépense de la clé Anthropic partagée', [
      !report.current.length && h('div', { class: 'line' }, h('span', { class: 'lbl sub-line' }, t('Aucun résumé généré en {0}.', monthName(report.month)))),
      report.current.map((row) => line(row.name ?? t('Profil supprimé'), detail(row))),
      report.current.length > 1 && line(t('Total de {0}', monthName(report.month)), detail({ calls: calls(report.current), cost: total(report.current) })),
      report.previous.length > 0 && line(t('Total de {0}', monthName(report.previousMonth)), detail({ calls: calls(report.previous), cost: total(report.previous) })),
    ], "Estimation en dollars américains, d'après les tarifs publics et les jetons réellement consommés par chaque résumé. Seuls les résumés faits avec la clé partagée sont comptés ; la facture d'Anthropic fait foi.");
  }

  let policyDraft = null, keysFresh = false;   // qui a droit à la clé Anthropic partagée, tant que ce n'est pas enregistré
  function sharedKeysForm() {
    if (!users) { loadUsers(); return h('span', { class: 'spinner' }); }
    // À l'ouverture de la rubrique : état à jour des clés et de la dépense (une fois par ouverture des réglages).
    if (!keysFresh) { keysFresh = true; api('/api/shared-keys').then((fresh) => { app.sharedKeys = fresh; policyDraft = null; if (ui.tab === 'keys') render(); }).catch(() => {}); }
    const API_KEYS = [['tomtomKey', 'Clé TomTom', 'Trajets avec circulation'], ['apiSportsKey', 'Clé API-Sports', 'Ligues API-Sports'],
      ['tmdbKey', 'Clé TMDB', 'Films de la section Sorties'], ['anthropicKey', 'Clé Anthropic', 'Résumé du jour — facturé à l’usage']];
    const GOOGLE_KEYS = [['googleClientId', 'Identifiant client', 'Fourni par Google Cloud'], ['googleClientSecret', 'Secret client', 'Fourni par Google Cloud']];
    const KEYS = [...API_KEYS, ...GOOGLE_KEYS];
    const inputs = new Map(KEYS.map(([key, label, use]) => [key, h('input', { class: 'field bare mono', name: `shared-${key}`, value: app.sharedKeys?.[key] ? SECRET_MASK : '',
      placeholder: t(use), 'aria-label': label, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      onFocus: (e) => { if (e.target.value === SECRET_MASK) e.target.select(); } })]));
    policyDraft ??= structuredClone(app.sharedKeys?.policy ?? { anthropicUsers: [], anthropicMaxModel: SUMMARY_MODELS[0][0] });
    const others = users.filter((u) => u.role !== 'admin');
    const save = async (e) => {
      e.preventDefault();
      try {
        app.sharedKeys = await api('/api/shared-keys', { method: 'PUT', body: { ...Object.fromEntries(KEYS.map(([key]) => [key, inputs.get(key).value])), policy: policyDraft } });
        policyDraft = null;
        sharedNote = { text: t('Clés partagées enregistrées.'), ok: true };
      } catch (error) { sharedNote = { text: error.message, ok: false }; }
      render();
    };
    const note = noteView(sharedNote);
    sharedNote = null;   // affiché une seule fois
    const rows = (list) => list.map(([key, label]) => line(label, inputs.get(key)));
    return h('form', { novalidate: true, onSubmit: save },
      group("Clés d'API", rows(API_KEYS),
        "Elles servent aux profils qui n'ont pas saisi la leur. Aucune ne donne accès à vos données : TomTom, API-Sports et TMDB puisent seulement dans votre quota gratuit. Une fois enregistrées, elles ne sont plus affichées à personne. Videz un champ pour retirer la clé."),
      group('Qui peut utiliser la clé Anthropic', [
        line('Administrateurs', h('span', { class: 'sub-line' }, 'Toujours')),
        others.map((u) => line(u.name, h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: policyDraft.anthropicUsers.includes(u.id), 'aria-label': u.name,
          onChange: (e) => { policyDraft.anthropicUsers = e.target.checked ? [...policyDraft.anthropicUsers, u.id] : policyDraft.anthropicUsers.filter((id) => id !== u.id); } }))),
        line('Modèle le plus coûteux permis', select(policyDraft, 'anthropicMaxModel', SUMMARY_MODELS, { label: 'Modèle le plus coûteux permis' })),
      ], "La clé Anthropic est la seule facturée à l'usage : chaque résumé du jour vous est compté. Les autres profils n'y ont droit que si vous les cochez ici, et jamais au-delà du modèle choisi. Un profil qui saisit sa propre clé n'est pas concerné."),
      usageGroup(),
      group('Connexion Google (application)', [
        ...rows(GOOGLE_KEYS),
        h('div', { class: 'line' }, h('span', { class: 'lbl' }, 'Marche à suivre et adresse de redirection'),
          h('button', { class: 'info-btn', type: 'button', title: 'Comment obtenir un identifiant client Google', 'aria-label': 'Comment obtenir un identifiant client Google', onClick: googleHelp }, 'i')),
      ], "Ces deux valeurs identifient cette installation de Lookout auprès de Google ; elles ne donnent accès au compte de personne. Chaque profil relie ensuite son propre compte Google depuis sa section YouTube, et ne voit que ses propres abonnements."),
      h('div', { class: 'form-actions' }, h('div', {}, note), h('button', { class: 'btn primary', type: 'submit' }, icon('key'), 'Enregistrer')));
  }

  function usersTab() {
    if (!users) { loadUsers(); return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('span', { class: 'spinner' }))); }
    const ROLES = [['user', 'Utilisateur'], ['admin', 'Administrateur']];
    const path = (u) => `/api/users/${encodeURIComponent(u.id)}`;
    const draft = { role: 'user', copyFrom: '' };
    const nameInput = h('input', { class: 'field', name: 'new-profile-name', placeholder: t('Nom'), 'aria-label': 'Nom', maxlength: '32', autocomplete: 'off', required: true });
    const passInput = h('input', { class: 'field', name: 'new-profile-password', type: 'password', placeholder: t('Mot de passe provisoire (6 caractères ou plus)'), 'aria-label': 'Mot de passe', autocomplete: 'new-password', required: true });
    const createNote = h('div', {});
    const createFail = (message, input) => {
      // Un échec efface le message de réussite précédent, pour ne pas afficher les deux à la fois.
      usersNote = null;
      root.querySelector('.s-pane .form-note.ok')?.remove();
      createNote.replaceChildren(noteView({ text: message, ok: false }));
      input?.focus();
    };
    const create = async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim(), password = passInput.value;
      // Vérifié ici d'abord, pour répondre tout de suite ; le serveur revérifie de toute façon.
      if (!name) return createFail(t('Entrez un nom pour le profil'), nameInput);
      if (password.length < 6) return createFail(t('Le mot de passe doit compter au moins 6 caractères'), passInput);
      try {
        await api('/api/users', { method: 'POST', body: { name, password, role: draft.role, copyFrom: draft.copyFrom || null } });
      } catch (error) {
        return createFail(error.message, /mot de passe|password/i.test(error.message) ? passInput : nameInput);   // les champs restent remplis
      }
      usersNote = { text: t('Profil « {0} » créé. Ce mot de passe est provisoire : la personne choisira le sien à sa première connexion.', name), ok: true };
      await loadUsers();
    };

    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { class: 's-col' }, heading("Chaque personne a son profil, avec ses propres sections et préférences."),
      noteView(usersNote),
      h('p', { class: 'presence-summary', 'data-summary': '' }, presenceSummary()),
      group('Profils', users.map((u) => h('div', { class: 'item' },
        h('span', { class: `avatar-dot${u.online ? ' online' : ''}`, 'data-dot': u.id }, u.name.charAt(0).toUpperCase()),
        h('div', { class: 'fields' },
          h('input', { value: u.name, 'aria-label': 'Nom', maxlength: '32', onChange: (e) => usersAction(() => api(path(u), { method: 'PATCH', body: { name: e.target.value } })) }),
          h('div', { class: 'sub-line', 'data-presence': u.id }, presenceLine(u))),
        h('select', { class: 'field', 'aria-label': 'Rôle', onChange: (e) => usersAction(() => api(path(u), { method: 'PATCH', body: { role: ROLES[e.target.selectedIndex][0] } })) },
          ROLES.map(([value, label]) => h('option', { selected: u.role === value }, label))),
        h('button', { class: 'icon-btn', 'aria-label': t('Actions pour {0}', u.name), onClick: (e) => openMenu(e.currentTarget, [
          { label: 'Voir son tableau de bord', icon: icon('open'), disabled: u.id === app.user.id, action: () => { location.href = `${location.pathname}?voir=${encodeURIComponent(u.id)}`; } },
          { label: 'Appareils connectés…', icon: icon('users'), action: () => devicesDialog(u) },
          { label: 'Changer le mot de passe…', icon: icon('key'), action: () => passwordDialog(u) },
          users.length > 1 && { heading: 'Remplacer ses réglages par ceux de' },
          ...users.filter((o) => o.id !== u.id).map((o) => ({ label: o.name, action: async () => {
            if (!await confirmDialog(t('Remplacer les réglages de {0} ?', u.name), t('Toutes ses sections et préférences seront remplacées par une copie de celles de {0}. Cette opération ne peut pas être annulée.', o.name), 'Remplacer')) return;
            await usersAction(() => api(`${path(u)}/copy`, { method: 'POST', body: { from: o.id } }), 'Réglages copiés.');
            if (u.id === app.user.id) location.reload();   // mes propres réglages viennent de changer
          } })),
          '-',
          { label: 'Supprimer…', icon: icon('trash'), disabled: u.id === app.user.id, action: async () => {
            if (!await confirmDialog(t('Supprimer le profil de {0} ?', u.name), "Ses réglages et son accès seront supprimés. Ses appareils seront déconnectés.", 'Supprimer')) return;
            usersAction(() => api(path(u), { method: 'DELETE', body: {} }), 'Profil supprimé.');
          } },
        ]) }, icon('more')))),
      "Chaque profil a ses propres sections, sources et préférences. Un administrateur peut créer, modifier et supprimer des profils."),
      h('form', { novalidate: true, onSubmit: create }, group('Nouveau profil', [
        h('div', { class: 'line stack' }, nameInput, passInput),
        line('Rôle', select(draft, 'role', ROLES, { label: 'Rôle' })),
        line('Réglages de départ', select(draft, 'copyFrom', [['', 'Réglages par défaut'], ...users.map((u) => [u.id, t('Copie de {0}', u.name)])], { label: 'Réglages de départ' })),
        h('div', { class: 'line' }, createNote, h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Créer le profil')),
      ], "Une copie reprend les sections, les sources et les clés d'API de l'autre profil. Chacun évolue ensuite de son côté.")),
      )));
  }

  // --- Santé des sources (administrateur) ---
  let healthData = null;
  function healthTab() {
    if (!healthData) {
      api('/api/health').then((data) => { healthData = data; }).catch((error) => { healthData = { watched: 0, failing: [], error: error.message }; })
        .then(() => { if (ui.tab === 'health') render(); });
      return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('span', { class: 'spinner' })));
    }
    const { failing, watched } = healthData;
    const days = (since) => Math.floor((Date.now() - since) / 86400e3);
    const duration = (since) => (days(since) >= 1 ? t('en panne depuis {0} j', days(since)) : t("en panne depuis aujourd'hui"));
    const reload = h('button', { class: 'btn', onClick: () => { healthData = null; render(); } }, icon('refresh'), 'Actualiser');
    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { class: 's-col' }, heading("Les sources qui ne répondent plus, tous profils confondus."),
      healthData.error && noteView({ text: healthData.error, ok: false }),
      group(failing.length === 1 ? 'Une source en panne' : failing.length ? t('{0} sources en panne', failing.length) : null, [
        !failing.length && h('div', { class: 'line' }, h('span', { class: 'lbl' }, icon('check-on'), ' ', t('Aucune source en panne parmi les {0} sources suivies.', watched))),
        failing.map((f) => h('div', { class: 'item' },
          h('span', { class: `health-dot${days(f.since) >= 3 ? ' old' : ''}` }),
          h('div', { class: 'fields' },
            h('div', { class: 'health-name' }, f.source ? `${f.source} — ${f.section}` : f.section),
            h('div', { class: 'sub-line' }, [f.profile, duration(f.since), f.lastOK ? t('dernière réponse {0}', fmt.ago(f.lastOK)) : t("n'a jamais répondu")].join(' · ')),
            h('div', { class: 'sub-line' }, f.error)))),
        h('div', { class: 'line' }, h('span', {}), reload),
      ], "Tous profils confondus. Une source n'est connue qu'une fois sa section chargée ; une panne de quelques heures est souvent passagère, une panne de plusieurs jours signale d'ordinaire une adresse qui a changé."))));
  }

  // --- Fenêtre ---
  // Rubriques, regroupées comme on les cherche : ce qu'on voit, comment on le voit, soi, puis l'installation.
  // Les mots-clés servent à la recherche dans les réglages.
  const admin = app.user?.role === 'admin';
  const NAV = [
    { title: 'Tableau de bord', items: [
      ['sections', 'Sections et pages', () => icon('grid'), 'cartes fils rss météo trajets sports youtube sorties résumé agenda calendrier classements statistiques meneurs standings leaders home assistant domotique bourse devises actions stocks currencies onglets ajouter supprimer cards feeds weather calendar tabs pages add'],
      ['appearance', 'Apparence', () => icon('sliders'), 'thème sombre clair couleur accent densité colonnes arrière-plan theme dark light color density columns'],
      ['display', 'Mode affichage', () => sfIcon('desktopcomputer'), 'écran mural télé plein écran wall screen tv kiosk'] ] },
    { title: 'Préférences', items: [
      ['general', 'Général', () => icon('gear'), 'langue unités prénom accueil intervalle mise à jour language units greeting refresh'],
      ['reading', 'Lecture et filtres', () => sfIcon('newspaper.fill'), 'articles lus lecteur mots masquer évidence mots-clés suivis doublons read reader words hide highlight keywords duplicates'],
      ['notifications', 'Notifications', () => sfIcon('bell.fill'), 'alertes matchs articles iphone appareil heures calmes ne pas déranger résumé du matin mots-clés alerts games device quiet hours do not disturb morning summary keywords'] ] },
    { title: 'Compte', items: [
      ['account', 'Mon compte', () => icon('user'), 'mot de passe déconnexion session password sign out'],
      ['data', 'Mes données', () => icon('drive'), 'exporter importer réinitialiser configuration export import reset'] ] },
    ...(admin ? [{ title: 'Administration', items: [
      ['users', 'Profils', () => icon('users'), 'utilisateurs comptes en ligne appareils users accounts online devices'],
      ['keys', 'Clés partagées', () => icon('key'), 'tomtom tmdb anthropic google api-sports api keys'],
      ['health', 'État des sources', () => icon('shield'), 'pannes fils erreurs santé failing health errors'],
      ['backup', 'Sauvegarde', () => icon('download'), 'restaurer télécharger automatique nuit restore download backup automatic nightly'] ] }] : []),
    { title: null, items: [['about', 'À propos', () => sfIcon('tag.fill'), 'version licence github license']] },
  ];
  const PANES = { sections: sectionsTab, general: generalPane, appearance: appearancePane, reading: readingPane, notifications: notificationsPane,
    display: displayPane, account: accountTab, data: dataTab, users: usersTab, keys: keysPane, health: healthTab, backup: backupPane, about: aboutPane };
  const labelOf = (id) => NAV.flatMap((g) => g.items).find((item) => item[0] === id)?.[1] ?? '';
  if (!PANES[ui.tab] || (!admin && ['users', 'keys', 'health', 'backup'].includes(ui.tab))) ui.tab = 'sections';

  const go = (id) => { ui.tab = id; ui.nav = false; ui.detail = false; render(); };
  /** Liste des rubriques, filtrée par la recherche (sur le nom affiché et sur les mots-clés). */
  function navItems() {
    const words = ui.query.toLowerCase().split(/\s+/).filter(Boolean);
    const match = ([, label, , keywords]) => words.every((w) => `${t(label)} ${label} ${keywords}`.toLowerCase().includes(w));
    const groups = NAV.map((g) => ({ ...g, items: g.items.filter(match) })).filter((g) => g.items.length);
    if (!groups.length) return [h('p', { class: 's-nav-empty' }, 'Aucun réglage ne correspond.')];
    return groups.map((g) => h('div', { class: 's-nav-group', role: 'group', 'aria-label': g.title },
      g.title && h('h4', {}, g.title),
      g.items.map(([id, label, glyph]) => h('button', { class: 's-nav-item', 'aria-current': ui.tab === id && !ui.nav ? 'page' : null, onClick: () => go(id) },
        h('span', { class: 's-nav-icon' }, glyph()), h('span', { class: 'grow' }, label), h('span', { class: 's-nav-chevron' }, icon('right'))))));
  }

  function render() {
    const pane = root.querySelector('.s-pane'), scroll = pane?.scrollTop ?? 0, sameView = root.dataset.view === `${ui.tab}/${ui.selected}`;
    const body = PANES[ui.tab]();
    const detail = ui.tab === 'sections' && ui.detail && config().sections.some((s) => s.id === ui.selected);
    const done = () => h('button', { class: 'btn primary', onClick: () => closeCurrent?.() }, 'Terminé');
    const list = h('div', { class: 's-nav-list' }, navItems());
    // Sur un petit écran : rubriques -> rubrique -> (pour les sections) réglages d'une section. « Retour » remonte d'un cran.
    const back = () => { if (detail) ui.detail = false; else ui.nav = true; render(); };
    const title = detail ? config().sections.find((s) => s.id === ui.selected).title : labelOf(ui.tab);
    root.replaceChildren(h('div', { class: `settings${detail ? ' detail' : ''}${ui.nav ? ' at-nav' : ''}` },
      h('nav', { class: 's-nav', 'aria-label': 'Réglages' },
        h('div', { class: 's-nav-head' }, h('h2', {}, 'Réglages'), done()),
        h('input', { class: 'field s-nav-search', type: 'search', placeholder: t('Rechercher un réglage'), 'aria-label': 'Rechercher un réglage', value: ui.query,
          autocomplete: 'off', spellcheck: 'false', onInput: (e) => { ui.query = e.target.value; list.replaceChildren(...navItems()); } }),
        list,
        h('p', { class: 's-nav-foot' }, 'Vos changements sont enregistrés automatiquement.')),
      h('div', { class: 's-main' },
        h('div', { class: 'settings-head' },
          h('button', { class: 'icon-btn s-back', 'aria-label': 'Retour', onClick: back }, icon('back')),
          h('h2', {}, title),
          done()),
        body)));
    root.dataset.view = `${ui.tab}/${ui.selected}`;
    if (sameView) root.querySelector('.s-pane').scrollTop = scroll;   // garde la position après un ajout ou un retrait
  }

  const close = openDialog(() => { render(); return root; }, { cls: 'settings-host', onClose: () => { closeCurrent = null; clearInterval(presenceTimer); app.saveNow(); app.renderAll(); } });
  closeCurrent = close;
}
