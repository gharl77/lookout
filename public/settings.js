// Briefing — réglages : sections (liste + éditeur), général, données.
import { h, icon, sfIcon, badge, SF_NAMES, t, api, openMenu, openPopover, openDialog, confirmDialog } from './ui.js';
import { KINDS, SWATCHES, FEED_CATALOG, LEAGUES, PROVIDER_LABELS, template, feedSource, league as newLeague, commuteRoute, uuid } from './shared.js';

let closeCurrent = null;

export function openSettings(app, { sectionID = null, tab = 'sections' } = {}) {
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
  const SPANS = [[1, '1 colonne'], [2, '2 colonnes'], [99, 'Pleine largeur']];
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
      s.kind !== 'weather' && line(ITEMS_LABEL[s.kind], stepper(s, 'maxItems', 1, 40)),
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
        hass && line('Jeton', text(o, 'hassToken', { placeholder: "Jeton d'accès longue durée", mono: true, type: 'password' })),
        !hass && line('Afficher les itinéraires de rechange', toggle(o, 'showAlternates', { label: 'Itinéraires de rechange' })),
      ], o.provider === 'osrm' ? 'OSRM est un service libre, sans données de circulation en direct.'
        : o.provider === 'tomtom' ? 'TomTom tient compte de la circulation en direct. La clé est enregistrée en clair sur le serveur.'
          : 'Le temps affiché est celui que Waze fournit à Home Assistant. Le jeton est enregistré en clair sur le serveur.'),
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
      ], 'Nécessaire seulement pour les ligues API-Sports. Le forfait gratuit permet 100 requêtes par jour et par sport ; Lookout met les réponses en cache pour le respecter. La clé est enregistrée en clair sur le serveur.'),
      group('Affichage', [
        line("Résultats d'hier", toggle(o, 'showYesterday', { label: "Résultats d'hier" })),
        line('Matchs de demain', toggle(o, 'showUpcoming', { label: 'Matchs de demain' })),
        line('Logos des équipes', toggle(o, 'showLogos', { label: 'Logos des équipes' })),
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
      ], 'Un en-tête par ligne, au format « Nom: valeur » (ex. Authorization: Bearer …). Les clés sont enregistrées en clair sur le serveur.'),
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
      badge(s, true), h('span', { class: 'names' }, h('span', {}, s.title || 'Sans titre'), h('small', {}, KINDS[s.kind].label)),
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
          const s = template(kind); s.title = t(s.title); list.push(s); ui.selected = s.id; ui.detail = true; commit(); render(); } }))) }, icon('plus')),
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

  // --- Général ---
  function generalTab() {
    const g = config().general;
    return h('div', { class: 'settings-body' }, h('div', { class: 's-pane' }, h('div', { style: { maxWidth: '640px', margin: '0 auto' } },
      group('Accueil', [
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
      group('Actualisation et unités', [
        line('Actualiser automatiquement', h('span', { onChange: () => app.restartTimer() }, select(g, 'refreshMinutes',
          [[0, 'Jamais (manuel)'], [5, 'Toutes les 5 minutes'], [15, 'Toutes les 15 minutes'], [30, 'Toutes les 30 minutes'], [60, 'Toutes les heures']], { label: 'Actualiser automatiquement' }))),
        line('Unités', select(g, 'units', [['metric', 'Métrique (°C, km)'], ['imperial', 'Impérial (°F, mi)']], { label: 'Unités' })),
      ]),
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
      ], 'Le fichier JSON contient toutes vos sections, sources et préférences.'),
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

  // --- Fenêtre ---
  const TABS = [['sections', 'Sections', 'grid'], ['general', 'Général', 'gear'], ['data', 'Données', 'drive']];
  function render() {
    const pane = root.querySelector('.s-pane'), scroll = pane?.scrollTop ?? 0, sameView = root.dataset.view === `${ui.tab}/${ui.selected}`;
    const body = ui.tab === 'sections' ? sectionsTab() : ui.tab === 'general' ? generalTab() : dataTab();
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

  const close = openDialog(() => { render(); return root; }, { cls: 'settings-host', onClose: () => { closeCurrent = null; app.saveNow(); app.renderAll(); } });
  closeCurrent = close;
}
