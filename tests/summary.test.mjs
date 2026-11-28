// Résumé d'un article : requête envoyée au modèle et lecture de sa réponse (service simulé).
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeArticle } from '../lib/summary.js';

const page = (url) => ({ url, title: 'Un titre', blocks: [{ type: 'p', text: 'Phrase de l’article. '.repeat(40) }, { type: 'img', src: 'https://exemple.test/i.jpg' }] });
const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test('le résumé est demandé une fois, lu, puis repris sans second appel', async () => {
  const calls = [], usage = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 80 },
      content: [{ type: 'text', text: 'Voici : ["Premier point.", "Deuxième point.", 3, ""]' }] }), { status: 200 });
  };
  const result = await summarizeArticle(page('https://exemple.test/a'), 'claude-haiku-5-5', 'cle-de-test', (u) => usage.push(u));
  assert.deepEqual(result.points, ['Premier point.', 'Deuxième point.']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], 'cle-de-test');
  assert.equal(calls[0].body.model, 'claude-haiku-5-5');
  assert.match(calls[0].body.messages[0].content, /^<article>[\s\S]*<\/article>$/);
  assert.deepEqual(usage, [{ model: 'claude-haiku-5-5', inputTokens: 900, outputTokens: 80 }]);
  await summarizeArticle(page('https://exemple.test/a'), 'claude-haiku-5-5', 'cle-de-test', (u) => usage.push(u));
  assert.equal(calls.length, 1);   // même article : pas de second appel, rien de facturé
  assert.equal(usage.length, 1);
});

test('sans clé, article trop court ou clé refusée : un message clair', async () => {
  await assert.rejects(summarizeArticle(page('https://exemple.test/b'), 'claude-haiku-5-5', ''), /Clé Anthropic manquante/);
  await assert.rejects(summarizeArticle({ url: 'https://exemple.test/c', title: 'x', blocks: [{ type: 'p', text: 'Court.' }] }, 'claude-haiku-5-5', 'cle'), /trop court/);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 });
  await assert.rejects(summarizeArticle(page('https://exemple.test/d'), 'claude-haiku-5-5', 'cle'), /refusée/);
});
