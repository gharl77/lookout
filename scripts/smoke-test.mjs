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
const request = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(10000), ...options });
const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

console.log(`Lookout — test de fumée sur ${base}`);

await check('le serveur répond', async () => expect((await request('/healthz')).status === 200, 'healthz ne répond pas 200'));
await check("la page d'accueil et ses fichiers sont servis", async () => {
  for (const path of ['/', '/app.js', '/app.css', '/i18n.js', '/logo.svg', '/lookout-180.png', '/lookout-512.png', '/manifest.webmanifest']) {
    expect((await request(path)).status === 200, `${path} introuvable`);
  }
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
await check('le serveur est toujours en vie après les requêtes malformées', async () => {
  expect((await request('/healthz')).status === 200, 'le serveur ne répond plus');
  const after = await (await request('/api/config')).json();
  expect(after.sections.length === config.sections.length, 'la configuration a été altérée');
});

console.log(failures ? `\n${failures} échec(s)` : '\nTout est bon.');
process.exit(failures ? 1 : 0);
