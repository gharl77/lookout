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
  for (const path of ['/', '/app.js', '/app.css', '/i18n.js', '/icon-180.png', '/manifest.webmanifest']) {
    expect((await request(path)).status === 200, `${path} introuvable`);
  }
});
await check('la version est annoncée', async () => {
  const about = await (await request('/api/about')).json();
  expect(about.name === 'Lookout' && /^\d+\.\d+\.\d+/.test(about.version), `réponse inattendue : ${JSON.stringify(about)}`);
});

let config;
await check('une configuration de départ valide est créée', async () => {
  config = await (await request('/api/config')).json();
  expect(Array.isArray(config.sections) && config.sections.length > 0, 'aucune section par défaut');
  expect(config.sections.every((s) => s.id && s.kind && s.title), 'section incomplète');
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
