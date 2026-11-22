// Lookout — accueil d'un nouveau profil : quelques questions pour partir d'un tableau de bord à soi
// plutôt que de l'exemple. Tout reste modifiable ensuite dans les réglages, et l'on peut passer à tout moment.
import { h, icon, sfIcon, t, api, openDialog } from './ui.js';
import { FEED_CATALOG, LEAGUES, categorySection, league as newLeague } from './shared.js';

const STARTERS = ['Actualités', 'International', 'Techno', 'Sports'];

export function runOnboarding(app) {
  const config = app.state.config, lang = document.documentElement.lang;
  const weather = config.sections.find((s) => s.kind === 'weather'), sports = config.sections.find((s) => s.kind === 'sports');
  const draft = {
    name: config.general.displayName || app.user.name, place: null,
    categories: new Set(STARTERS), leagues: new Set(sports ? ['espn|hockey/nhl'] : []),
  };
  const ALL_LEAGUES = [...LEAGUES.espn.map(([name, path]) => ({ key: `espn|${path}`, name, make: () => newLeague(t(name), path) })),
    ...LEAGUES.hockeytech.map(([name, code, key]) => ({ key: `hockeytech|${code}`, name, make: () => newLeague(t(name), code, 'hockeytech', key) }))];
  let step = 0, applied = false;

  /** Reporte les réponses dans les réglages (une seule fois, avant le choix des équipes). */
  function apply() {
    if (applied) return;
    applied = true;
    config.general.displayName = draft.name.trim().slice(0, 40);
    if (draft.place && weather) Object.assign(weather.weather, { locationName: draft.place.shortLabel, latitude: draft.place.latitude, longitude: draft.place.longitude });
    // Les fils de l'exemple laissent la place aux catégories choisies, dans l'ordre du catalogue.
    const chosen = FEED_CATALOG.filter((c) => draft.categories.has(c.name)).map((c) => categorySection(c, lang));
    for (const s of chosen) { s.title = t(s.title); s.page = config.pages[0].id; }
    if (chosen[0]) Object.assign(chosen[0], { span: 2, maxItems: 7 }, { feed: { ...chosen[0].feed, layout: 'headline', showSummary: true } });
    const kept = config.sections.filter((s) => s.kind !== 'feed' && !(s.kind === 'api' && !draft.categories.has('Techno')));
    const at = Math.min(2, kept.length);   // après la météo et les trajets
    config.sections = [...kept.slice(0, at), ...chosen.slice(0, 1), ...kept.slice(at), ...chosen.slice(1)];
    if (sports) {
      sports.sports.leagues = ALL_LEAGUES.filter((l) => draft.leagues.has(l.key)).map((l) => l.make());
      sports.enabled = sports.sports.leagues.length > 0;
    }
  }
  function finish(close) {
    apply();
    config.general.onboarded = true;
    app.commit();
    close();
    app.renderAll();
    app.refreshAll();
  }

  openDialog((close) => {
    const body = h('div', { class: 'ob-body' }), foot = h('div', { class: 'actions' });
    const chip = (label, on, toggle, glyph) => h('button', { class: `ob-chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on),
      onClick: (e) => { const now = toggle(); e.currentTarget.classList.toggle('on', now); e.currentTarget.setAttribute('aria-pressed', String(now)); } }, glyph, h('span', {}, label));
    const flip = (set, key) => () => { if (set.has(key)) set.delete(key); else set.add(key); return set.has(key); };

    const STEPS = [
      // 1. Qui et où
      () => {
        const name = h('input', { class: 'field', value: draft.name, maxlength: '40', placeholder: t('Votre prénom'), 'aria-label': 'Votre prénom', onInput: (e) => { draft.name = e.target.value; } });
        const results = h('div', { class: 'ob-results' });
        const current = h('p', { class: 'ob-current' }, icon('pin'), ' ', draft.place?.label ?? weather?.weather.locationName ?? '');
        let timer = null;
        const search = h('input', { class: 'field', type: 'search', placeholder: t('Ville ou code postal'), 'aria-label': 'Ville ou code postal', autocomplete: 'off', onInput: () => {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            const q = search.value.trim();
            if (q.length < 2) return results.replaceChildren();
            try {
              const places = await api(`/api/weather/search?q=${encodeURIComponent(q)}`);
              results.replaceChildren(...(places.length ? places.map((p) => h('button', { class: 'ob-result', type: 'button', onClick: () => {
                draft.place = p; current.replaceChildren(icon('pin'), ' ', p.label); results.replaceChildren(); search.value = '';
              } }, p.label)) : [h('p', { class: 'a-meta' }, 'Aucun lieu trouvé.')]));
            } catch (error) { results.replaceChildren(h('p', { class: 'a-meta' }, error.message)); }
          }, 350);
        } });
        return ['Bienvenue dans Lookout', "Trois questions pour préparer votre tableau de bord. Vous pourrez tout changer ensuite dans les réglages.",
          [h('label', { class: 'ob-field' }, h('span', {}, 'Comment vous appeler ?'), name),
            weather && h('div', { class: 'ob-field' }, h('span', {}, 'Pour quelle ville voulez-vous la météo ?'), current, search, results)]];
      },
      // 2. Les sujets
      () => ['Quels sujets vous intéressent ?', 'Chaque sujet choisi devient une section avec quelques sources reconnues. Vous pourrez en ajouter, en retirer et changer les sources.',
        [h('div', { class: 'ob-chips' }, FEED_CATALOG.map((c) => chip(c.name, draft.categories.has(c.name), flip(draft.categories, c.name), sfIcon(c.icon))))]],
      // 3. Les ligues
      () => ['Quels sports suivez-vous ?', "Les pointages s'affichent pour les ligues choisies. Aucune ligue : la section des pointages est masquée.",
        [h('div', { class: 'ob-chips' }, ALL_LEAGUES.map((l) => chip(l.name, draft.leagues.has(l.key), flip(draft.leagues, l.key))))]],
      // 4. Les équipes (seulement s'il y a des ligues)
      () => {
        apply();
        const blocks = sports.sports.leagues.map((lg) => {
          const list = h('div', { class: 'ob-chips small' }, h('span', { class: 'spinner' }));
          app.saveNow().then(() => api(`/api/teams?section=${encodeURIComponent(sports.id)}&league=${encodeURIComponent(lg.id)}`)).then((teams) => {
            list.replaceChildren(...teams.map((team) => chip(team.name, lg.teams.some((x) => x.id === team.id), () => {
              const i = lg.teams.findIndex((x) => x.id === team.id);
              if (i >= 0) lg.teams.splice(i, 1); else lg.teams.push({ id: team.id, name: team.name, logo: team.logo ?? null });
              return i < 0;
            })));
          }).catch((error) => list.replaceChildren(h('p', { class: 'a-meta' }, error.message)));
          return h('div', { class: 'ob-field' }, h('span', {}, lg.name), list);
        });
        return ['Vos équipes', "Choisissez vos équipes pour ne voir que leurs matchs et leur classement. Sans choix, tous les matchs de la ligue s'affichent.", blocks];
      },
    ];
    const count = () => (draft.leagues.size && sports ? 4 : 3);

    function draw() {
      const [title, intro, content] = STEPS[step]();
      const last = step === count() - 1;
      body.replaceChildren(
        h('div', { class: 'ob-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(count()), 'aria-valuenow': String(step + 1) },
          Array.from({ length: count() }, (_, i) => h('i', { class: i <= step ? 'on' : '' }))),
        h('h3', {}, title), h('p', {}, intro), ...content.filter(Boolean));
      foot.replaceChildren(...[
        h('button', { class: 'btn ob-skip', type: 'button', onClick: () => { if (!applied) { config.general.onboarded = true; app.commit(); close(); } else finish(close); } }, 'Passer'),
        step > 0 && !applied && h('button', { class: 'btn', type: 'button', onClick: () => { step--; draw(); } }, 'Retour'),
        h('button', { class: 'btn primary', type: 'button', onClick: () => { if (last) finish(close); else { step++; draw(); } } }, last ? 'Terminer' : 'Continuer')].filter(Boolean));
      body.scrollTop = 0;
    }
    draw();
    return [body, foot];
  }, { cls: 'dialog wide onboarding' });
}
