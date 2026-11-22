// Notifications « Web Push », sans dépendance : chiffrement du message (RFC 8291, aes128gcm) et
// identification du serveur auprès du service de notifications (VAPID, RFC 8292).
//
// Le navigateur (ou l'iPhone, pour une app ajoutée à l'écran d'accueil) fournit une adresse d'envoi et deux
// clés. Le serveur chiffre le message pour cet appareil et le remet au service de notifications du fabricant
// (Apple, Google, Mozilla, Microsoft), qui ne peut pas le lire.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BriefingError } from './util.js';

const b64 = (buffer) => Buffer.from(buffer).toString('base64url');
const unb64 = (text) => Buffer.from(String(text ?? ''), 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/**
 * Services de notifications acceptés. L'adresse d'envoi vient du navigateur : sans cette liste, quelqu'un
 * pourrait faire envoyer des requêtes par le serveur vers une adresse de son choix.
 */
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

/** Vérifie un abonnement reçu du navigateur et n'en garde que le nécessaire. */
export function cleanSubscription(input) {
  let url;
  try { url = new URL(String(input?.endpoint)); } catch { throw new BriefingError('Abonnement aux notifications invalide'); }
  const p256dh = unb64(input?.keys?.p256dh), auth = unb64(input?.keys?.auth);
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((host) => host.test(url.hostname)) || url.href.length > 1000
    || p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) {
    // Journalisé (sans le reste de l'adresse) pour repérer un navigateur dont le service n'est pas dans la liste.
    console.warn(`Abonnement aux notifications refusé — service : ${url.protocol}//${url.hostname}`);
    throw new BriefingError('Abonnement aux notifications invalide');
  }
  return { endpoint: url.href, keys: { p256dh: b64(p256dh), auth: b64(auth) } };
}

/**
 * Chiffre un message pour un appareil (RFC 8291). `test` ne sert qu'aux essais : il fixe la clé éphémère et le sel
 * pour comparer le résultat à l'exemple de la RFC.
 */
export function encrypt(subscription, plaintext, test = null) {
  const receiverKey = unb64(subscription.keys.p256dh), authSecret = unb64(subscription.keys.auth);
  const ecdh = crypto.createECDH('prime256v1');
  if (test) ecdh.setPrivateKey(test.privateKey); else ecdh.generateKeys();
  const senderKey = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(receiverKey);
  const salt = test?.salt ?? crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), receiverKey, senderKey]);
  const ikm = hmac(hmac(authSecret, secret), Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // L'octet 2 marque la fin du dernier (et seul) bloc.
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = senderKey.length;
  return Buffer.concat([header, senderKey, body]);
}

export class Push {
  #file; #contact; #loaded = null;

  constructor(dataDir, contact) {
    this.#file = path.join(dataDir, 'push-keys.json');
    this.#contact = contact;
  }

  /** Les clés du serveur sont créées à la première utilisation et gardées dans data/push-keys.json. */
  get #keys() {
    if (this.#loaded) return this.#loaded;
    try { this.#loaded = JSON.parse(fs.readFileSync(this.#file, 'utf8')); } catch { this.#loaded = null; }
    if (!this.#loaded?.publicKey || !this.#loaded?.privateKey) {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.generateKeys();
      this.#loaded = { publicKey: b64(ecdh.getPublicKey()), privateKey: b64(ecdh.getPrivateKey()) };
      fs.writeFileSync(this.#file, JSON.stringify(this.#loaded), { mode: 0o600 });
    }
    return this.#loaded;
  }

  /** Clé publique du serveur, que le navigateur associe à l'abonnement. */
  get publicKey() { return this.#keys.publicKey; }

  /** Jeton signé qui identifie ce serveur auprès du service de notifications (valable 12 heures). */
  #authorization(endpoint) {
    const publicKey = unb64(this.#keys.publicKey);
    const key = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: this.#keys.privateKey,
      x: b64(publicKey.subarray(1, 33)), y: b64(publicKey.subarray(33, 65)) } });
    const unsigned = `${b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64(JSON.stringify({
      aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: this.#contact }))}`;
    const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
    return `vapid t=${unsigned}.${b64(signature)}, k=${this.#keys.publicKey}`;
  }

  /**
   * Envoie une notification à un appareil. Renvoie « gone » si l'abonnement n'existe plus (app supprimée,
   * autorisation retirée) : il faut alors l'oublier.
   */
  async send(subscription, message) {
    let response;
    try {
      response = await fetch(subscription.endpoint, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: this.#authorization(subscription.endpoint), 'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high' },
        body: encrypt(subscription, JSON.stringify(message)) });
    } catch (error) { return { ok: false, error: error.message }; }
    if (response.status === 404 || response.status === 410) return { ok: false, gone: true };
    return response.ok ? { ok: true } : { ok: false, error: `HTTP ${response.status}` };
  }
}
