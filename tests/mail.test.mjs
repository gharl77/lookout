// Courriel : dialogue SMTP complet contre un faux serveur local, et refus des adresses piégées.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { sendMail, checkAddress, buildMessage } from '../lib/mail.js';

function fakeServer({ rejectRcpt = false } = {}) {
  const seen = { commands: [], data: '' };
  const server = net.createServer((socket) => {
    let inData = false, buffer = '';
    socket.setEncoding('utf8');
    socket.write('220 faux.test ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          seen.data = buffer.slice(0, end); buffer = buffer.slice(end + 5); inData = false;
          socket.write('250 2.0.0 accepté\r\n');
          continue;
        }
        const at = buffer.indexOf('\r\n');
        if (at < 0) return;
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 2);
        seen.commands.push(line);
        if (line.startsWith('EHLO')) socket.write('250-faux.test\r\n250-SIZE 1000000\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (line.startsWith('RCPT') && rejectRcpt) socket.write('550 5.1.1 destinataire inconnu\r\n');
        else if (line === 'DATA') { inData = true; socket.write('354 allez-y\r\n'); }
        else if (line === 'QUIT') { socket.end('221 au revoir\r\n'); return; }
        else socket.write('250 OK\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })));
}
const message = { to: 'lecteur@exemple.test', subject: 'Résumé du matin', text: 'Bonjour.\r\n.ligne qui commence par un point\r\nFin.', html: '<p>Bonjour.</p>' };

test('un message est remis : expéditeur, destinataire, corps en deux versions', async () => {
  const { server, seen, port } = await fakeServer();
  await sendMail({ host: '127.0.0.1', port, security: 'none', from: 'lookout@exemple.test' }, message);
  server.close();
  assert.deepEqual(seen.commands.filter((c) => !c.startsWith('EHLO')), ['MAIL FROM:<lookout@exemple.test>', 'RCPT TO:<lecteur@exemple.test>', 'DATA', 'QUIT']);
  assert.match(seen.data, /Subject: =\?UTF-8\?B\?/);
  assert.match(seen.data, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(seen.data, /Content-Type: text\/html; charset=utf-8/);
  const text = Buffer.from(/text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)\r\n--/.exec(seen.data)[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.equal(text, message.text);
});

test('un refus du serveur est rapporté clairement, sans mot de passe', async () => {
  const { server, port } = await fakeServer({ rejectRcpt: true });
  await assert.rejects(sendMail({ host: '127.0.0.1', port, security: 'none', from: 'lookout@exemple.test' }, message), /destinataire.*inconnu/);
  server.close();
  // Sans chiffrement, on ne transmet jamais un mot de passe.
  const second = await fakeServer();
  await assert.rejects(sendMail({ host: '127.0.0.1', port: second.port, security: 'none', user: 'moi', password: 'secret-123', from: 'lookout@exemple.test' }, message), (error) => /chiffrement/.test(error.message) && !error.message.includes('secret-123'));
  assert.ok(!second.seen.commands.some((c) => c.includes('AUTH')));
  second.server.close();
});

test('adresses invalides ou piégées refusées ; serveur absent signalé', async () => {
  for (const bad of ['', 'sans-arobase', 'a@b', 'a@exemple.test\r\nBcc: autre@exemple.test', 'a b@exemple.test', '<a@exemple.test>']) assert.throws(() => checkAddress(bad), /invalide/, bad);
  assert.equal(checkAddress(' moi@exemple.test '), 'moi@exemple.test');
  assert.ok(!buildMessage({ from: 'a@exemple.test', to: 'b@exemple.test', subject: 'Un\r\nBcc: x@exemple.test', text: 't', html: 'h' }).includes('\r\nBcc:'));
  await assert.rejects(sendMail({ host: '', from: 'a@exemple.test' }, message), /pas configuré/);
  await assert.rejects(sendMail({ host: '127.0.0.1', port: 1, security: 'none', from: 'a@exemple.test' }, message), /injoignable/);
});
