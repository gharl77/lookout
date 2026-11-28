// Envoi de courriels par SMTP, sans dépendance : juste ce qu'il faut pour remettre un message à un serveur d'envoi
// (celui d'un fournisseur de courriel ou d'un service d'envoi), avec chiffrement et authentification.
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { BriefingError } from './util.js';

const ADDRESS = /^[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+$/;
/** Adresse de courriel valide, ou erreur claire. Aucun retour de ligne ne peut s'y glisser (en-têtes forgés). */
export function checkAddress(value) {
  const address = String(value ?? '').trim();
  if (!ADDRESS.test(address) || address.length > 254) throw new BriefingError('Adresse de courriel invalide');
  return address;
}

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
/** En-tête contenant autre chose que de l'ASCII : encodé selon la RFC 2047. */
const header = (text) => { const clean = String(text ?? '').replace(/[\r\n]+/g, ' ').trim(); return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${b64(clean)}?=`; };
const wrap = (base64) => base64.replace(/.{1,76}/g, '$&\r\n');

/** Texte complet du message (en-têtes et corps en deux versions, texte et HTML). */
export function buildMessage({ from, to, subject, text, html, name = 'Lookout' }) {
  const boundary = `lookout-${crypto.randomBytes(12).toString('hex')}`, domain = from.split('@')[1];
  return [`From: ${header(name)} <${from}>`, `To: <${to}>`, `Subject: ${header(subject)}`, `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(16).toString('hex')}@${domain}>`, 'MIME-Version: 1.0', 'Auto-Submitted: auto-generated',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(text)).trimEnd(),
    `--${boundary}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(html)).trimEnd(),
    `--${boundary}--`, ''].join('\r\n');
}

/**
 * Remet un message au serveur SMTP. `config` : { host, port, security: 'starttls' | 'tls' | 'none', user, password, from }.
 * Le mot de passe ne figure jamais dans une erreur ni dans un journal.
 */
export async function sendMail(config, message) {
  const host = String(config.host ?? '').trim(), security = ['tls', 'none'].includes(config.security) ? config.security : 'starttls';
  if (!host) throw new BriefingError("L'envoi de courriels n'est pas configuré sur ce serveur");
  const from = checkAddress(config.from), to = checkAddress(message.to);
  const port = Number(config.port) || (security === 'tls' ? 465 : 587);
  const data = buildMessage({ ...message, from, to });

  let socket = security === 'tls' ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  let buffer = '', waiting = null, failure = null;
  const listen = (s) => {
    s.setEncoding('utf8');
    s.setTimeout(20000, () => s.destroy(new Error('délai dépassé')));
    s.on('data', (chunk) => { buffer += chunk; flush(); });
    s.on('error', (error) => { failure = error; flush(); });
    s.on('close', () => { failure ??= new Error('connexion fermée'); flush(); });
  };
  // Une réponse est complète quand sa dernière ligne porte un code suivi d'une espace (« 250 OK », pas « 250-… »).
  const flush = () => {
    if (!waiting) return;
    const lines = buffer.split('\r\n'), end = lines.findIndex((line) => /^\d{3}( |$)/.test(line));
    if (end >= 0 && end < lines.length - 1) {
      const reply = lines.slice(0, end + 1);
      buffer = lines.slice(end + 1).join('\r\n');
      const done = waiting; waiting = null;
      done.resolve({ code: Number(reply[end].slice(0, 3)), text: reply.join(' ') });
    } else if (failure) { const done = waiting; waiting = null; done.reject(failure); }
  };
  const reply = () => new Promise((resolve, reject) => { waiting = { resolve, reject }; flush(); });
  const command = async (line, expected, what) => {
    if (line !== null) socket.write(`${line}\r\n`);
    const answer = await reply();
    if (!expected.includes(answer.code)) throw new BriefingError('Le serveur de courriel a refusé ({0}) : {1}', what, answer.text.replace(/\s+/g, ' ').slice(0, 160));
    return answer;
  };
  listen(socket);
  try {
    await command(null, [220], 'connexion');
    let hello = await command('EHLO lookout.local', [250], 'EHLO');
    if (security === 'starttls') {
      await command('STARTTLS', [220], 'STARTTLS');
      socket.removeAllListeners('data'); socket.removeAllListeners('error'); socket.removeAllListeners('close');
      socket = tls.connect({ socket, servername: host });
      failure = null; buffer = '';
      listen(socket);
      await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
      hello = await command('EHLO lookout.local', [250], 'EHLO');
    }
    const user = String(config.user ?? ''), password = String(config.password ?? '');
    if (user) {
      // Sans chiffrement, le mot de passe voyagerait en clair : on refuse plutôt que de l'exposer.
      if (security === 'none') throw new BriefingError("Le serveur de courriel exige un chiffrement pour s'authentifier");
      if (/AUTH[ =][^\r\n]*PLAIN/i.test(hello.text) || !/AUTH[ =][^\r\n]*LOGIN/i.test(hello.text)) {
        await command(`AUTH PLAIN ${b64(`\0${user}\0${password}`)}`, [235], 'authentification');
      } else {
        await command('AUTH LOGIN', [334], 'authentification');
        await command(b64(user), [334], 'authentification');
        await command(b64(password), [235], 'authentification');
      }
    }
    await command(`MAIL FROM:<${from}>`, [250], 'expéditeur');
    await command(`RCPT TO:<${to}>`, [250, 251], 'destinataire');
    await command('DATA', [354], 'DATA');
    // Une ligne qui commence par un point est doublée, pour ne pas être prise pour la fin du message.
    await command(`${data.replace(/\r\n\./g, '\r\n..')}\r\n.`, [250], 'message');
    // Le message est accepté : on prend congé poliment, sans faire dépendre le résultat de cette dernière réponse.
    await command('QUIT', [221], 'QUIT').catch(() => {});
    return { ok: true };
  } catch (error) {
    if (error instanceof BriefingError) throw error;
    throw new BriefingError('Serveur de courriel injoignable ({0})', String(error.message ?? error).slice(0, 120));
  } finally { socket.destroy(); }
}
