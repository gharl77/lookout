// Lookout — écrans de connexion et de création du compte administrateur.
import { h, t, api } from './ui.js';

const remembered = () => { try { return localStorage.getItem('lookout.user') ?? ''; } catch { return ''; } };
const remember = (name) => { try { localStorage.setItem('lookout.user', name); } catch { /* stockage indisponible */ } };

/**
 * Affiche l'écran qui convient : création de l'administrateur (première visite) ou connexion.
 * Les champs sont de vrais champs de formulaire, pour que le navigateur ou le gestionnaire de mots de passe
 * puisse proposer d'enregistrer et de remplir le mot de passe.
 */
export function showAuth({ setup, profiles }) {
  document.body.classList.add('signed-out');
  const error = h('p', { class: 'auth-error', role: 'alert', hidden: true });
  const fail = (message) => { error.textContent = message; error.hidden = false; };
  const field = (label, props) => h('label', { class: 'auth-field' }, h('span', {}, label), h('input', { class: 'field', required: true, ...props }));

  let form;
  if (setup) {
    const name = field('Votre nom', { name: 'username', autocomplete: 'username', maxlength: '32', autofocus: true });
    const password = field('Mot de passe', { name: 'new-password', type: 'password', autocomplete: 'new-password', minlength: '6' });
    const confirm = field('Confirmer le mot de passe', { name: 'confirm-password', type: 'password', autocomplete: 'new-password', minlength: '6' });
    form = h('form', { class: 'auth-card', onSubmit: async (e) => {
      e.preventDefault();
      const [n, p, c] = [name, password, confirm].map((x) => x.querySelector('input').value);
      if (p !== c) return fail(t('Les deux mots de passe ne sont pas identiques'));
      try {
        await api('/api/auth/setup', { method: 'POST', body: { name: n, password: p } });
        remember(n.trim());
        location.reload();
      } catch (err) { fail(err.message); }
    } },
    h('img', { src: new URL('logo.svg', import.meta.url).href, alt: '', width: '64', height: '64' }),
    h('h1', {}, 'Bienvenue dans Lookout'),
    h('p', {}, "Créez le compte administrateur. Il pourra ensuite créer un profil pour chaque personne, avec ses propres réglages."),
    name, password, confirm, error,
    h('button', { class: 'btn primary', type: 'submit' }, 'Créer le compte'));
  } else {
    const last = remembered();
    const start = profiles.find((p) => p.toLowerCase() === last.toLowerCase()) ?? (profiles.length === 1 ? profiles[0] : '');
    const name = field('Nom', { name: 'username', autocomplete: 'username', value: start, maxlength: '32', autofocus: !start });
    const password = field('Mot de passe', { name: 'password', type: 'password', autocomplete: 'current-password', autofocus: Boolean(start) });
    const nameInput = name.querySelector('input'), passwordInput = password.querySelector('input');
    // Un bouton par profil : on choisit son nom d'un clic, il ne reste que le mot de passe à saisir.
    const chips = profiles.length > 1 && profiles.length <= 12 && h('div', { class: 'auth-profiles', role: 'group', 'aria-label': t('Profils') },
      profiles.map((p) => h('button', { type: 'button', class: 'auth-profile', 'aria-pressed': String(p === start), onClick: (e) => {
        nameInput.value = p;
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        passwordInput.focus();
      } }, h('span', { class: 'avatar-dot' }, p.charAt(0).toUpperCase()), h('span', {}, p))));
    form = h('form', { class: 'auth-card', onSubmit: async (e) => {
      e.preventDefault();
      try {
        const { user } = await api('/api/auth/login', { method: 'POST', body: { name: nameInput.value, password: passwordInput.value } });
        remember(user.name);
        location.reload();
      } catch (err) {
        fail(err.message);
        passwordInput.select();
      }
    } },
    h('img', { src: new URL('logo.svg', import.meta.url).href, alt: '', width: '64', height: '64' }),
    h('h1', {}, 'Lookout'), chips, name, password, error,
    h('button', { class: 'btn primary', type: 'submit' }, 'Se connecter'),
    h('p', { class: 'auth-note' }, 'Vous resterez connecté sur cet appareil.'));
  }
  document.body.append(h('main', { class: 'auth-screen' }, form));
}

/**
 * Mot de passe provisoire (donné par un administrateur) : la personne choisit le sien avant d'entrer.
 * Le champ du nom, invisible, permet au gestionnaire de mots de passe d'enregistrer le nouveau mot de passe.
 */
export function showPasswordChange(user) {
  document.body.classList.add('signed-out');
  const error = h('p', { class: 'auth-error', role: 'alert', hidden: true });
  const fail = (message) => { error.textContent = message; error.hidden = false; };
  const input = (label, name, focus = false) => h('label', { class: 'auth-field' }, h('span', {}, label),
    h('input', { class: 'field', required: true, name, type: 'password', autocomplete: 'new-password', minlength: '6', autofocus: focus }));
  const next = input('Nouveau mot de passe', 'new-password', true), confirm = input('Confirmer le mot de passe', 'confirm-password');
  document.body.append(h('main', { class: 'auth-screen' }, h('form', { class: 'auth-card', onSubmit: async (e) => {
    e.preventDefault();
    const [p, c] = [next, confirm].map((x) => x.querySelector('input').value);
    if (p !== c) return fail(t('Les deux mots de passe ne sont pas identiques'));
    try {
      await api('/api/auth/password', { method: 'POST', body: { next: p } });
      location.reload();
    } catch (err) { fail(err.message); }
  } },
  h('img', { src: new URL('logo.svg', import.meta.url).href, alt: '', width: '64', height: '64' }),
  h('h1', {}, t('Bonjour {0}', user.name)),
  h('p', {}, "Le mot de passe que vous venez d'utiliser est provisoire. Choisissez le vôtre : vous seul le connaîtrez."),
  h('input', { type: 'text', name: 'username', autocomplete: 'username', value: user.name, hidden: true }),
  next, confirm, error,
  h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer et continuer'),
  h('button', { class: 'btn', type: 'button', style: { justifyContent: 'center' }, onClick: signOut }, 'Se déconnecter'))));
}

export async function signOut() {
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* le témoin est effacé de toute façon au prochain chargement */ }
  location.reload();
}
