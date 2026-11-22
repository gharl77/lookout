// Lecteur d'article : extraction du texte principal, et refus des adresses du réseau local.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from '../lib/reader.js';
import { isPrivateAddress, assertPublicHost, Cache } from '../lib/util.js';

const para = (n) => `Paragraphe numéro ${n} avec assez de mots pour compter comme du vrai texte d'article, pas comme un menu. `.repeat(4).trim();
const page = `<!doctype html><html><head><title>Titre de la page | Site</title>
<meta property="og:title" content="Un titre &amp; son sous-titre"><meta property="og:site_name" content="Le Site">
<meta property="og:image" content="/images/une.jpg"></head><body>
<nav><ul><li><a href="/">Accueil du site avec un long libellé de menu</a></li></ul></nav>
<article><h1>Un titre &amp; son sous-titre</h1><p>${para(1)}</p>
<script>alert("jamais affiché")</script>
<h2>Intertitre</h2><p>${para(2)} <a href="/x">un <b>lien</b></a>.</p>
<img src="/images/photo.jpg" width="800" alt="Une photo"><img src="/pixel.gif" width="1">
<blockquote>Une citation assez longue pour être conservée telle quelle.</blockquote>
<ul><li>Premier élément de liste assez long pour être gardé.</li><li>Court</li></ul>
<h2>Intertitre orphelin</h2></article>
<footer><p>${para(99)}</p></footer></body></html>`;

test("texte principal, sans menus, scripts ni pied de page", () => {
  const out = extract(page, 'https://exemple.test/article/1');
  const texts = out.blocks.map((b) => b.text ?? b.src);
  assert.equal(out.title, 'Un titre & son sous-titre');
  assert.equal(out.site, 'Le Site');
  assert.equal(out.image, 'https://exemple.test/images/une.jpg');
  assert.deepEqual(out.blocks.map((b) => b.type), ['p', 'h', 'p', 'img', 'quote', 'li']);
  assert.ok(texts[2].endsWith('un lien .') || texts[2].includes('un lien'), 'les balises internes disparaissent, le texte reste');
  assert.equal(out.blocks[3].src, 'https://exemple.test/images/photo.jpg');
  assert.ok(!JSON.stringify(out).includes('jamais affiché'));
  assert.ok(!texts.some((x) => x.includes('numéro 99')), 'le pied de page est écarté');
  assert.ok(!texts.includes('Intertitre orphelin'), 'un intertitre sans texte à sa suite est retiré');
  assert.ok(out.blocks.every((b) => !/[<>]/.test(b.text ?? '')), 'aucun bloc ne contient de HTML');
});

test('adresses locales reconnues et refusées', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.1.1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
  await assert.rejects(assertPublicHost('http://127.0.0.1:8080/'));
  await assert.rejects(assertPublicHost('http://[::1]/'));
  await assert.rejects(assertPublicHost('http://localhost/'));
});

test('cache borné : les plus anciennes entrées sortent', () => {
  const cache = new Cache(2);
  cache.set('a', 1); cache.set('b', 2); cache.set('a', 3); cache.set('c', 4);
  assert.equal(cache.get('b', 1e9), undefined);
  assert.equal(cache.get('a', 1e9), 3);
  assert.equal(cache.get('c', 1e9), 4);
});
