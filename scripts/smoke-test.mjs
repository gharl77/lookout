#!/usr/bin/env node
// Test de fumée d'une installation neuve de Lookout. Sans dépendance ni accès à Internet.
// Usage : node scripts/smoke-test.mjs http://127.0.0.1:8080
const base = (process.argv[2] ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
let failures = 0;

async function check(name, run) {
  try {
    await run();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures++;
    console.log(`  ÉCHEC ${name} — ${error.message}`);
  }
}
const expect = (condition, message) => { if (!condition) throw new Error(message); };
// Session courante : le témoin déposé à la connexion est renvoyé à chaque requête, comme le ferait un navigateur.
let cookie = '';
const request = (path, options = {}, session = cookie) => fetch(base + path, { signal: AbortSignal.timeout(10000), ...options,
  headers: { 'X-Requested-With': 'lookout', ...(session ? { Cookie: session } : {}), ...(options.headers ?? {}) } });
const sessionFrom = (response) => (response.headers.get('set-cookie') ?? '').split(';')[0];
const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

console.log(`Lookout — test de fumée sur ${base}`);

await check('le serveur répond', async () => expect((await request('/healthz')).status === 200, 'healthz ne répond pas 200'));
await check("la page d'accueil et ses fichiers sont servis", async () => {
  for (const path of ['/', '/app.js', '/app.css', '/i18n.js', '/logo.svg', '/lookout-180.png', '/lookout-512.png', '/manifest.webmanifest']) {
    expect((await request(path)).status === 200, `${path} introuvable`);
  }
});
await check("la page pointe vers des fichiers à l'adresse versionnée, conservables indéfiniment", async () => {
  const page = await request('/');
  const html = await page.text(), about = await (await request('/api/about')).json();
  expect(page.headers.get('cache-control') === 'no-store', 'la page HTML ne doit jamais être mise en cache');
  expect(html.includes(`v/${about.build}/app.js`) && html.includes(`v/${about.build}/app.css`) && !html.includes('{{v}}'), 'adresses versionnées absentes de la page');
  for (const file of ['app.js', 'cards.js', 'settings.js', 'ui.js', 'shared.js', 'i18n.js', 'icons.js', 'app.css', 'logo.svg']) {
    const response = await request(`/v/${about.build}/${file}`);
    expect(response.status === 200, `/v/${about.build}/${file} introuvable`);
    expect(/immutable/.test(response.headers.get('cache-control') ?? ''), `${file} : en-tête de cache inattendu`);
  }
  // Une ancienne adresse reste servie (page ouverte avant la mise à jour), mais sans conservation.
  const old = await request('/v/000000000000/app.js');
  expect(old.status === 200 && old.headers.get('cache-control') === 'no-cache', "une ancienne adresse doit être revalidée");
});
await check('la version est annoncée', async () => {
  const about = await (await request('/api/about')).json();
  expect(about.name === 'Lookout' && /^\d+\.\d+\.\d+/.test(about.version), `réponse inattendue : ${JSON.stringify(about)}`);
  expect(/^[0-9a-f]{12}$/.test(about.build ?? ''), "empreinte de l'interface absente");
});
await check('les fichiers sont revalidés par ETag (pas de vieille version en cache)', async () => {
  const first = await request('/app.js');
  const etag = first.headers.get('etag');
  expect(etag && first.headers.get('cache-control') === 'no-cache', 'ETag ou Cache-Control manquant');
  expect((await request('/app.js', { headers: { 'If-None-Match': etag } })).status === 304, 'pas de réponse 304 pour un fichier inchangé');
  expect((await request('/app.js', { headers: { 'If-None-Match': '"autre"' } })).status === 200, 'un fichier modifié doit être renvoyé');
});

// --- Comptes : une installation neuve n'a aucun compte, et rien n'est accessible sans connexion ---
const ADMIN = { name: 'Admin de test', password: 'motdepasse-de-test' };
await check("installation neuve : aucun compte, création de l'administrateur proposée", async () => {
  const state = await (await request('/api/auth/state')).json();
  expect(state.setup === true && state.user === null, `état inattendu : ${JSON.stringify(state)}`);
});
await check('sans connexion, les réglages et les données sont refusés', async () => {
  for (const path of ['/api/config', '/api/read', '/api/users', '/api/section/x']) {
    expect((await request(path)).status === 401, `${path} accessible sans connexion`);
  }
});
await check("une requête venue d'un autre site est refusée", async () => {
  const response = await fetch(`${base}/api/auth/setup`, { method: 'POST', ...json(ADMIN) });   // sans l'en-tête de l'interface
  expect(response.status === 403, `statut ${response.status}`);
});
await check("création de l'administrateur : session durable, témoin invisible pour les scripts", async () => {
  expect((await request('/api/auth/setup', { method: 'POST', ...json({ name: 'x', password: 'court' }) })).status === 400, 'mot de passe trop court accepté');
  const response = await request('/api/auth/setup', { method: 'POST', ...json(ADMIN) });
  const header = response.headers.get('set-cookie') ?? '';
  expect(response.status === 200 && /HttpOnly/i.test(header) && /SameSite=Lax/i.test(header), `témoin de session incorrect : ${header}`);
  expect(Number(/Max-Age=(\d+)/.exec(header)?.[1]) > 300 * 24 * 3600, 'la session ne dure pas assez longtemps');
  cookie = sessionFrom(response);
  const state = await (await request('/api/auth/state')).json();
  expect(state.user?.role === 'admin' && state.setup === false, 'le premier compte doit être administrateur');
  expect((await request('/api/auth/setup', { method: 'POST', ...json({ name: 'autre', password: 'motdepasse2' }) })).status === 403, 'un second administrateur a pu se créer sans connexion');
});

let config;
await check('une configuration de départ valide est créée', async () => {
  config = await (await request('/api/config')).json();
  expect(Array.isArray(config.sections) && config.sections.length > 0, 'aucune section par défaut');
  expect(config.sections.every((s) => s.id && s.kind && s.title), 'section incomplète');
  expect(Array.isArray(config.pages) && config.pages.length === 1 && config.sections.every((s) => s.page === config.pages[0].id), 'pages par défaut incorrectes');
  expect(config.general.refreshMinutes === 30, `intervalle par défaut inattendu : ${config.general.refreshMinutes}`);
  expect(config.sections.every((s) => [0, 5, 10, 15, 30, 60, 120].includes(s.refreshMinutes)), 'intervalle de section invalide');
});
await check('la configuration de départ ne contient ni nom ni clé', async () => {
  expect(config.general.displayName === '', 'un prénom est préenregistré');
  for (const s of config.sections) {
    expect(s.sports.apiSportsKey === '' && s.commute.tomtomKey === '' && s.commute.hassToken === '' && s.commute.hassURL === '',
      `une clé ou une adresse privée est préenregistrée dans « ${s.title} »`);
    expect(s.api.headers === '', `des en-têtes sont préenregistrés dans « ${s.title} »`);
    expect(s.sports.leagues.every((l) => l.teams.length === 0), `des équipes sont présélectionnées dans « ${s.title} »`);
  }
});
await check("la configuration s'enregistre (dossier de données accessible en écriture)", async () => {
  const response = await request('/api/config', { method: 'PUT', ...json(config) });
  expect(response.status === 200, `PUT /api/config → ${response.status}`);
  expect((await request('/api/read', { method: 'POST', ...json({ add: ['smoke'], remove: ['smoke'] }) })).status === 200, 'POST /api/read refusé');
});

// Une clé enregistrée ne doit jamais revenir vers le navigateur, ni dans la configuration ni ailleurs.
await check('les clés enregistrées ne sont jamais renvoyées au navigateur', async () => {
  const secret = 'SECRET-DE-TEST-1234567890';
  const withKeys = structuredClone(config);
  const s = withKeys.sections[0];
  Object.assign(s.sports, { apiSportsKey: secret });
  Object.assign(s.commute, { tomtomKey: secret, hassToken: secret });
  s.api.headers = `Authorization: Bearer ${secret}\nAccept: application/json`;
  const saved = await request('/api/config', { method: 'PUT', ...json(withKeys) });
  expect(!(await saved.text()).includes(secret), 'la réponse à l\'enregistrement contient la clé');
  const body = await (await request('/api/config')).text();
  expect(!body.includes(secret), 'GET /api/config contient la clé');
  const masked = JSON.parse(body).sections[0];
  expect(masked.sports.apiSportsKey && masked.commute.tomtomKey && masked.commute.hassToken, 'le masque est absent : la clé semble perdue');
  expect(masked.api.headers.includes('Authorization:') && masked.api.headers.includes('Accept:'), 'les noms des en-têtes ont disparu');
  // Remet la configuration de départ (champs vidés explicitement).
  expect((await request('/api/config', { method: 'PUT', ...json(config) })).status === 200, 'remise en état refusée');
  expect(!(await (await request('/api/config')).text()).includes('••'), 'un masque subsiste après avoir vidé les champs');
});

// --- Profils : chacun ses réglages, seul l'administrateur les gère ---
await check('profils : copie des réglages, indépendance, droits et mots de passe', async () => {
  const me = (await (await request('/api/auth/state')).json()).user;
  const marked = structuredClone(config);
  marked.sections[0].title = 'Marque du profil admin';
  await request('/api/config', { method: 'PUT', ...json(marked) });

  const created = await request('/api/users', { method: 'POST', ...json({ name: 'Invitée', password: 'invitee-123', copyFrom: me.id }) });
  expect(created.status === 200, `création refusée (${created.status})`);
  const guest = await created.json();
  expect(guest.role === 'user', 'un nouveau profil doit être un simple utilisateur');
  expect((await request('/api/users', { method: 'POST', ...json({ name: 'invitée', password: 'autre-12345' }) })).status === 400, 'deux profils portent le même nom');

  expect((await request('/api/auth/login', { method: 'POST', ...json({ name: 'Invitée', password: 'mauvais' }) }, '')).status === 401, 'mauvais mot de passe accepté');
  const login = await request('/api/auth/login', { method: 'POST', ...json({ name: 'Invitée', password: 'invitee-123' }) }, '');
  expect(login.status === 200, 'connexion du nouveau profil refusée');
  const guestCookie = sessionFrom(login);

  const copy = await (await request('/api/config', {}, guestCookie)).json();
  expect(copy.sections[0].title === 'Marque du profil admin', 'les réglages ne sont pas une copie du profil choisi');
  copy.sections[0].title = 'Modifié par le profil invité';
  await request('/api/config', { method: 'PUT', ...json(copy) }, guestCookie);
  expect((await (await request('/api/config')).json()).sections[0].title === 'Marque du profil admin', "un profil a modifié les réglages d'un autre");

  // Présence : l'administrateur voit qui est en ligne et depuis quels appareils.
  const seen = (await (await request('/api/users')).json()).find((u) => u.id === guest.id);
  expect(seen.online === true && seen.devices.length === 1 && typeof seen.devices[0].label === 'string', `présence inattendue : ${JSON.stringify(seen)}`);
  expect((await request(`/api/users/${guest.id}/signout`, { method: 'POST', ...json({}) }, guestCookie)).status === 403, 'un simple utilisateur peut déconnecter des appareils');

  expect((await request('/api/users', {}, guestCookie)).status === 403, 'un simple utilisateur voit la liste des profils');
  expect((await request(`/api/users/${me.id}`, { method: 'DELETE' }, guestCookie)).status === 403, 'un simple utilisateur peut supprimer un profil');
  expect((await request(`/api/users/${me.id}`, { method: 'DELETE' })).status === 400, 'un administrateur a pu supprimer son propre profil');
  expect((await request(`/api/users/${me.id}`, { method: 'PATCH', ...json({ role: 'user' }) })).status === 400, 'le dernier administrateur a pu être rétrogradé');

  // Mot de passe réinitialisé par l'administrateur : les appareils du profil sont déconnectés.
  expect((await request(`/api/users/${guest.id}`, { method: 'PATCH', ...json({ password: 'nouveau-12345' }) })).status === 200, 'réinitialisation refusée');
  expect((await request('/api/config', {}, guestCookie)).status === 401, "l'ancienne session survit au changement de mot de passe");
  expect((await request(`/api/users/${guest.id}`, { method: 'DELETE' })).status === 200, 'suppression du profil refusée');
  expect((await request('/api/auth/login', { method: 'POST', ...json({ name: 'Invitée', password: 'nouveau-12345' }) }, '')).status === 401, 'un profil supprimé peut encore se connecter');

  await request('/api/config', { method: 'PUT', ...json(config) });   // remise en état
});

// Les requêtes malformées doivent être refusées proprement (4xx), jamais faire tomber le serveur.
const malformed = [
  ['JSON invalide', '/api/config', { method: 'PUT', ...json('pas du json') }],
  ['configuration sans sections', '/api/config', { method: 'PUT', ...json({ sections: 5 }) }],
  ['configuration nulle', '/api/config', { method: 'PUT', ...json('null') }],
  ['état de lecture invalide', '/api/read', { method: 'POST', ...json('[1,2]') }],
  ['section inconnue', '/api/section/inconnue', {}],
  ['encodage invalide', '/api/section/%E0%A4%A', {}],
  ['ligue inconnue', '/api/teams?section=x&league=y', {}],
  ['route inconnue', '/api/nimporte', {}],
  ['fichier hors du dossier public', '/..%2f..%2fetc%2fpasswd', {}],
  ['méthode non permise', '/', { method: 'DELETE' }],
];
for (const [name, path, options] of malformed) {
  await check(`requête refusée proprement : ${name}`, async () => {
    const status = (await request(path, options)).status;
    expect(status >= 400 && status < 500, `statut ${status}`);
  });
}
await check('déconnexion : la session ne donne plus accès à rien', async () => {
  const before = cookie;
  expect((await request('/api/auth/logout', { method: 'POST', ...json({}) })).status === 200, 'déconnexion refusée');
  expect((await request('/api/config', {}, before)).status === 401, 'la session reste valide après la déconnexion');
  const login = await request('/api/auth/login', { method: 'POST', ...json(ADMIN) }, '');
  expect(login.status === 200, 'reconnexion refusée');
  cookie = sessionFrom(login);
});
await check('le serveur est toujours en vie après les requêtes malformées', async () => {
  expect((await request('/healthz')).status === 200, 'le serveur ne répond plus');
  const after = await (await request('/api/config')).json();
  expect(after.sections.length === config.sections.length, 'la configuration a été altérée');
});

console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
