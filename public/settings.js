// Briefing — réglages : sections (liste + éditeur), général, données.
import { h, icon, sfIcon, badge, SF_NAMES, t, api, openMenu, openPopover, openDialog, confirmDialog } from './ui.js';
import { signOut } from './auth.js';
import { KINDS, SWATCHES, FEED_CATALOG, LEAGUES, PROVIDER_LABELS, REFRESH_CHOICES, template, feedSource, league as newLeague, commuteRoute, newPage, uuid } from './shared.js';

let closeCurrent = null;

export function openSettings(app, { sectionID = null, tab = 'sections' } = {}) {
  if (app.viewing) return;   // profil d'un autre, en lecture seule : aucun réglage à modifier
  closeCurrent?.();
  const config = () => app.state.config;
  const ui = { tab, selected: sectionID ?? config().sections[0]?.id ?? null, detail: Boolean(sectionID) };
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
  const ITEMS_LABEL = { feed: "Nombre d'articles", api: "Nombre d'articles", sports: 'Nombre de matchs', commute: 'Nombre de trajets' };

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
      config().pages.length > 1 && line('Page', select(s, 'page', config().pages.map((p) => [p.id, p.name || t('Sans titre')]), { label: 'Page', rerender: true })),
      s.kind !== 'weather' && line(ITEMS_LABEL[s.kind], stepper(s, 'maxItems', 1, 40)),
      // Après le changement, on redemande la section : le serveur applique tout de suite le nouvel intervalle.
      line('Interroger les sources', h('span', { onChange: () => app.saveNow().then(() => app.loadSection(s.id)) }, select(s, 'refreshMinutes',
        [[0, t('Par défaut ({0} min)', config().general.refreshMinutes)], ...REFRESH_CHOICES.map((m) => [m, intervalLabel(m)])], { label: 'Interroger les sources' }))),
    ], KINDS[s.kind].detail);
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
        h('button', { class: 'btn', onClick: (e) => openMenu(e.currentTarget, FEED_CATALOG.flatMap((c) => [{ heading: c.name },
          ...c.feeds.map(([name, url]) => ({ label: name, disabled: list.some((x) => x.url === url),
            action: () => { list.push(feedSource(name, url)); commit(); render(); } }))])) }, 'Suggestions', icon('down'))),
    ], "Collez l'adresse de n'importe quel fil RSS ou Atom. L'ordre des sources sert à alterner les articles.");
  }

  function articleDisplay(s, isFeed) {
    const o = s.feed;
    return [
      group('Affichage', [
        line('Présentation', select(o, 'layout', [['list', 'Liste'], ['headline', 'À la une'], ['compact', 'Titres seulement']], { rerender: true, label: 'Présentation' })),
        isFeed && line('Ordre', select(o, 'ordering', [['newest', "Plus récents d'abord"], ['balanced', 'Alterner entre les sources']], { label: 'Ordre' })),
        o.layout !== 'compact' && line('Images', toggle(o, 'showImages', { label: 'Images' })),
        o.layout === 'list' && line(isFeed ? 'Résumé' : 'Sous-titre', toggle(o, 'showSummary', { label: 'Résumé' })),
        isFeed && o.layout !== 'compact' && line('Nom de la source', toggle(o, 'showSource', { label: 'Nom de la source' })),
        line('Heure de publication', toggle(o, 'showTime', { label: 'Heure de publication' })),
      ]),
      group('Filtres', [
        line('Âge maximal', select(o, 'maxAgeHours', [[0, 'Aucune limite'], [12, '12 heures'], [24, '24 heures'], [48, '48 heures'], [72, '3 jours'], [168, '7 jours']], { label: 'Âge maximal' })),
        line('Doit contenir', text(o, 'includeKeywords', { placeholder: 'ex. Canadiens, budget', label: 'Doit contenir' })),
        line('Exclure', text(o, 'excludeKeywords', { placeholder: 'ex. horoscope, publicité', label: 'Exclure' })),
      ], 'Mots-clés séparés par des virgules, recherchés dans le titre et le résumé.'),
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
        o.provider === 'tomtom' && line('Clé TomTom', text(o, 'tomtomKey', { placeholder: 'Clé gratuite de developer.tomtom.com', mono: true })),
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
    const o = s.sports, list = o.leagues, hasKey = Boolean(o.apiSportsKey.trim());
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
        line('Clé API-Sports', text(o, 'apiSportsKey', { placeholder: 'Facultatif', mono: true, onInput: () => {} })),
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

  function editor(s) {
    return [commonGroup(s),
      s.kind === 'feed' && [feedSources(s), articleDisplay(s, true)],
      s.kind === 'weather' && weatherEditor(s),
      s.kind === 'commute' && commuteEditor(s),
      s.kind === 'sports' && sportsEditor(s),
      s.kind === 'api' && [apiEditor(s), articleDisplay(s, false)]];
  }

  // --- Liste des sections ---
  let listEl = null;
  function sectionItems() {
    return config().sections.map((s) => {
      const item = h('button', { class: `s-item${s.enabled ? '' : ' off'}`, role: 'option', 'aria-selected': String(s.id === ui.selected), draggable: 'true',
        onClick: () => { ui.selected = s.id; ui.detail = true; render(); } },
      badge(s, true), h('span', { class: 'names' }, h('span', {}, s.title || 'Sans titre'), h('small', {}, t(KINDS[s.kind].label), config().pages.length > 1 && ` · ${config().pages.find((p) => p.id === s.page)?.name ?? ''}`)),
      !s.enabled && h('span', { title: 'Section masquée' }, icon('hide')));
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drop-target'); });
      item.addEventListener('dragleave', () => item.classList.remove('drop-target'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const list = config().sections, from = list.findIndex((x) => x.id === e.dataTransfer.getData('text/plain'));
        if (from < 0 || list[from].id === s.id) return;
        const [moved] = list.splice(from, 1);
        list.splice(list.findIndex((x) => x.id === s.id), 0, moved);
        commit(); render();
      });
      return h('li', {}, item);
    });
  }
  function refreshList() { listEl?.replaceChildren(...sectionItems()); }

  function moveSelected(offset) {
    const list = config().sections, i = list.findIndex((s) => s.id === ui.selected), j = i + offset;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit(); render();
  }

  function sectionsTab() {
    const list = config().sections, selected = list.find((s) => s.id === ui.selected);
    listEl = h('ul', { role: 'listbox', 'aria-label': 'Sections' }, sectionItems());
    const foot = h('div', { class: 's-list-foot' },
      h('button', { class: 'icon-btn', title: 'Ajouter une section', 'aria-label': 'Ajouter une section', onClick: (e) => openMenu(e.currentTarget,
        Object.entries(KINDS).map(([kind, k]) => ({ label: k.label, detail: k.detail, action: () => {
          const s = template(kind); s.title = t(s.title); s.page = app.currentPage(); list.push(s); ui.selected = s.id; ui.detail = true; commit(); render(); } }))) }, icon('plus')),
      h('button', { class: 'icon-btn', title: 'Supprimer la section sélectionnée', 'aria-label': 'Supprimer la section', disabled: !selected, onClick: async () => {
        if (!await confirmDialog('Supprimer cette section ?', 'La section et ses sources seront supprimées. Pour la retirer temporairement, désactivez-la plutôt.', 'Supprimer')) return;
        const i = list.indexOf(selected);
        list.splice(i, 1);
        ui.selected = list[Math.min(i, list.length - 1)]?.id ?? null;
        ui.detail = false;
        commit(); render();
      } }, icon('minus')),
      h('button', { class: 'icon-btn', title: 'Dupliquer la section sélectionnée', 'aria-label': 'Dupliquer la section', disabled: !selected, onClick: () => {
        const copy = JSON.parse(JSON.stringify(selected));
        copy.id = uuid();
        copy.title += t(' (copie)');
        for (const x of [...copy.feed.sources, ...copy.commute.routes, ...copy.sports.leagues]) x.id = uuid();
        list.splice(list.indexOf(selected) + 1, 0, copy);
        ui.selected = copy.id;
        commit(); render();
      } }, icon('copy')),
      h('span', { style: { flex: '1' } }),
      h('button', { class: 'icon-btn', title: 'Monter la section', 'aria-label': 'Monter la section', disabled: !selected, onClick: () => moveSelected(-1) }, icon('up')),
      h('button', { class: 'icon-btn', title: 'Descendre la section', 'aria-label': 'Descendre la section', disabled: !selected, onClick: () => moveSelected(1) }, icon('down')));
    const pane = h('div', { class: 's-pane' }, selected ? editor(selected)
      : h('div', { class: 'error-state' }, h('strong', {}, 'Aucune section sélectionnée'), h('span', {}, 'Choisissez une section, ou ajoutez-en une avec le bouton +.')));
    return h('div', { class: `settings-body sections${ui.detail && selected ? ' detail' : ''}` }, h('div', { class: 's-list' }, listEl, foot), pane);
  }

  // --- Pages ---
  function pagesGroup() {
    const list = config().pages, sections = config().sections;
    return group('Pages', [
      list.map((p) => h('div', { class: 'item' },
        h('div', { class: 'fields' }, h('input', { value: p.name, placeholder: t('Nom de la page'), 'aria-label': 'Nom de la page', maxlength: '40',
          onInput: (e) => { p.name = e.target.value; commit(); } }),
        h('div', { class: 'sub-line' }, t('{0} sections', sections.filter((s) => s.page === p.id).length))),
        h('div', { class: 'ctrls' },
          h('button', { class: 'icon-btn', title: 'Monter', 'aria-label': 'Monter', disabled: list.indexOf(p) === 0,
            onClick: () => { const i = list.indexOf(p); [list[i - 1], list[i]] = [list[i], list[i - 1]]; commit(); render(); } }, icon('up')),
          h('button', { class: 'icon-btn', title: 'Descendre', 'aria-label': 'Descendre', disabled: list.indexOf(p) === list.length - 1,
            onClick: () => { const i = list.indexOf(p); [list[i + 1], list[i]] = [list[i], list[i + 1]]; commit(); render(); } }, icon('down')),
          h('button', { class: 'icon-btn', title: 'Supprimer', 'aria-label': 'Supprimer', disabled: list.length < 2, onClick: async () => {
            const count = sections.filter((s) => s.page === p.id).length;
            if (count && !await confirmDialog('Supprimer cette page ?', t('Ses {0} sections seront déplacées vers une autre page, pas supprimées.', count), 'Supprimer')) return;
            list.splice(list.indexOf(p), 1);
            for (const s of sections) if (s.page === p.id) { s.page = list[0].id; s.column = -1; }
            commit(); render();
          } }, icon('trash'))))),
      h('div', { class: 'line' }, h('button', { class: 'btn', onClick: () => { list.push(newPage(t('Nouvelle page'))); commit(); render(); } }, icon('plus'), 'Ajouter une page')),
    ], "Avec plusieurs pages, des onglets apparaissent en haut du tableau de bord. Chaque section appartient à une page, qui se choisit dans ses réglages ou dans le menu de sa carte.");
  }

  // --- Général ---
  function generalTab() {
    const g = config().general;
    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { style: { maxWidth: '640px', margin: '0 auto' } },
      group("Message d'accueil", [
        line("Afficher le message d'accueil", toggle(g, 'showGreeting', { label: "Message d'accueil" })),
        line('Votre prénom', text(g, 'displayName', { placeholder: 'Facultatif', label: 'Votre prénom' })),
        line("Afficher le coup d'œil (météo et premier trajet)", toggle(g, 'showGlance', { label: "Coup d'œil" })),
      ]),
      group('Apparence', [
        line('Thème', seg(g, 'appearance', [['system', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']])),
        line("Couleur d'accent", swatches(g, 'accentHex')),
        line('Arrière-plan teinté', toggle(g, 'tintedBackdrop', { label: 'Arrière-plan teinté' })),
        line('Densité', select(g, 'density', [['compact', 'Compacte'], ['comfortable', 'Confortable'], ['spacious', 'Aérée']], { label: 'Densité' })),
        line('Colonnes', select(g, 'columns', [[0, 'Automatique'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], { label: 'Colonnes' })),
      ], "Sur un écran étroit comme celui d'un iPhone, les cartes passent automatiquement sur une colonne."),
      group('Langue', [
        line('Langue', h('span', { onChange: () => { app.renderAll(); render(); } }, select(g, 'language', [['auto', 'Automatique'], ['fr', 'Français'], ['en', 'English']], { label: 'Langue' }))),
      ], "Automatique suit la langue de l'appareil. Les titres de vos sections et le contenu des sources ne sont pas traduits."),
      group('Mise à jour des sources', [
        // Après le changement, on redemande les sections : le serveur applique tout de suite le nouvel intervalle.
        line('Intervalle par défaut', h('span', { onChange: () => app.saveNow().then(() => app.refreshAll()) }, select(g, 'refreshMinutes',
          REFRESH_CHOICES.map((m) => [m, INTERVAL_LABELS[m]]), { label: 'Intervalle par défaut' }))),
      ], "Chaque source est interrogée au plus une fois par intervalle, même si vous ouvrez ou actualisez la page plus souvent. Cela évite qu'un site vous bloque pour avoir demandé trop souvent. Chaque section peut avoir son propre intervalle, dans ses réglages : par défaut, les pointages et les trajets sont interrogés toutes les 5 minutes. L'icône de rechargement d'une carte met cette section à jour tout de suite."),
      group('Unités', [
        line('Unités', select(g, 'units', [['metric', 'Métrique (°C, km)'], ['imperial', 'Impérial (°F, mi)']], { label: 'Unités' })),
      ]),
      pagesGroup(),
      group('Lecture', [
        line('Atténuer les articles déjà lus', toggle(g, 'dimReadArticles', { label: 'Atténuer les articles lus' })),
      ], "L'état « lu » est enregistré sur le serveur : il est partagé entre tous vos appareils."))));
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
    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { style: { maxWidth: '640px', margin: '0 auto' } },
      group('Sauvegarde', [
        line('Exporter la configuration', h('button', { class: 'btn', onClick: () => {
          const blob = new Blob([JSON.stringify(config(), null, 2)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'Lookout-configuration.json' });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          note.textContent = t('Configuration exportée.');
        } }, icon('download'), 'Exporter…')),
        line('Importer une configuration', h('button', { class: 'btn', onClick: () => fileInput.click() }, icon('upload'), 'Importer…'), fileInput),
      ], 'Le fichier JSON contient toutes vos sections, sources et préférences, mais pas vos clés ni vos jetons.'),
      group('Fichier de configuration', [line('Emplacement', h('span', { class: 'mono' }, 'data/config.json')),
        line('Version', h('span', { class: 'mono' }, `Lookout ${app.version ?? ''}`))],
      'Dans le dossier de données du conteneur, sur le serveur.'),
      group(null, [
        line('Revenir à la configuration de départ', h('button', { class: 'btn danger', onClick: async () => {
          if (!await confirmDialog('Réinitialiser toute la configuration ?', "Toutes vos sections et sources seront remplacées par celles de départ. Exportez d'abord votre configuration si vous voulez la conserver.", 'Réinitialiser')) return;
          await app.replaceConfig(await api('/api/config/reset', { method: 'POST' }));
          ui.selected = config().sections[0]?.id ?? null;
          render();
          note.textContent = t('Configuration réinitialisée.');
        } }, icon('reset'), 'Réinitialiser…')),
      ]), note)));
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
    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { style: { maxWidth: '640px', margin: '0 auto' } },
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
    if (ui.tab === 'users') render();
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
          usersNote = { text: t('Mot de passe de {0} modifié. Ses appareils devront se reconnecter.', user.name), ok: true };
          render();
        } catch (err) { error.replaceChildren(noteView({ text: err.message, ok: false })); }
      } },
      h('h3', {}, t('Mot de passe de {0}', user.name)), input, error,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: close }, 'Annuler'), h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer')));
    });
  }

  function usersTab() {
    if (!users) { loadUsers(); return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('span', { class: 'spinner' }))); }
    const ROLES = [['user', 'Utilisateur'], ['admin', 'Administrateur']];
    const path = (u) => `/api/users/${encodeURIComponent(u.id)}`;
    const draft = { role: 'user', copyFrom: '' };
    const nameInput = h('input', { class: 'field', name: 'new-profile-name', placeholder: t('Nom'), 'aria-label': 'Nom', maxlength: '32', autocomplete: 'off', required: true });
    const passInput = h('input', { class: 'field', name: 'new-profile-password', type: 'password', placeholder: t('Mot de passe (6 caractères ou plus)'), 'aria-label': 'Mot de passe', autocomplete: 'new-password', required: true });
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
      usersNote = { text: t('Profil « {0} » créé. Il peut maintenant se connecter avec ce nom et ce mot de passe.', name), ok: true };
      await loadUsers();
    };

    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { style: { maxWidth: '680px', margin: '0 auto' } },
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

  // --- Fenêtre ---
  const TABS = [['sections', 'Sections', 'grid'], ['general', 'Général', 'gear'], ['data', 'Données', 'drive'], ['account', 'Compte', 'user'],
    ...(app.user?.role === 'admin' ? [['users', 'Profils', 'users']] : [])];
  function render() {
    const pane = root.querySelector('.s-pane'), scroll = pane?.scrollTop ?? 0, sameView = root.dataset.view === `${ui.tab}/${ui.selected}`;
    const body = ui.tab === 'sections' ? sectionsTab() : ui.tab === 'general' ? generalTab() : ui.tab === 'account' ? accountTab()
      : ui.tab === 'users' ? usersTab() : dataTab();
    const detail = ui.tab === 'sections' && ui.detail && config().sections.some((s) => s.id === ui.selected);
    root.replaceChildren(h('div', { class: `settings${detail ? ' detail' : ''}` },
      h('div', { class: 'settings-head' },
        h('button', { class: 'icon-btn s-back', 'aria-label': 'Retour à la liste des sections', onClick: () => { ui.detail = false; render(); } }, icon('back')),
        h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label, ic]) => h('button', { role: 'tab', 'aria-selected': String(ui.tab === id),
          onClick: () => { ui.tab = id; ui.detail = false; render(); } }, icon(ic), label))),
        h('button', { class: 'btn primary', onClick: () => closeCurrent?.() }, 'Terminé')),
      body));
    root.dataset.view = `${ui.tab}/${ui.selected}`;
    if (sameView) root.querySelector('.s-pane').scrollTop = scroll;   // garde la position après un ajout ou un retrait
  }

  const close = openDialog(() => { render(); return root; }, { cls: 'settings-host', onClose: () => { closeCurrent = null; clearInterval(presenceTimer); app.saveNow(); app.renderAll(); } });
  closeCurrent = close;
}
