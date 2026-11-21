// Cache DNS. Node ne garde aucune résolution en mémoire : sans cache, chaque actualisation redemande
// l'adresse de chaque site. Sur un réseau dont le serveur DNS est lent ou surchargé (Pi-hole, VPN…),
// des dizaines de requêtes simultanées finissent par dépasser le délai de connexion.
//
// Ici, une adresse résolue est réutilisée pendant 10 minutes, les demandes simultanées pour un même
// nom sont regroupées, et si le serveur DNS ne répond plus, la dernière adresse connue reste utilisée.
import dns from 'node:dns';
import net from 'node:net';

const FRESH_MS = 10 * 60e3;        // réutilisée telle quelle
const STALE_MS = 24 * 3600e3;      // utilisable en secours si le DNS ne répond pas
const cache = new Map();           // nom -> { time, addresses: [{ address, family }] }
const pending = new Map();
const stats = { hits: 0, lookups: 0, stale: 0, failures: 0 };

let systemLookup = null;

function resolve(hostname) {
  if (pending.has(hostname)) return pending.get(hostname);
  stats.lookups++;
  const job = new Promise((done, fail) => {
    systemLookup.call(dns, hostname, { all: true }, (error, addresses) => {
      if (error || !addresses?.length) return fail(error ?? Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }));
      // IPv4 d'abord : beaucoup de réseaux Docker n'ont pas de route IPv6.
      const ordered = [...addresses].sort((a, b) => a.family - b.family);
      cache.set(hostname, { time: Date.now(), addresses: ordered });
      done(ordered);
    });
  }).finally(() => pending.delete(hostname));
  pending.set(hostname, job);
  return job;
}

async function addressesFor(hostname) {
  const entry = cache.get(hostname), age = entry ? Date.now() - entry.time : Infinity;
  if (age < FRESH_MS) { stats.hits++; return entry.addresses; }
  if (age < STALE_MS) {
    // Adresse connue mais ancienne : on la sert tout de suite et on la rafraîchit en arrière-plan.
    stats.stale++;
    resolve(hostname).catch(() => { stats.failures++; });
    return entry.addresses;
  }
  try { return await resolve(hostname); } catch (error) { stats.failures++; throw error; }
}

export function installDnsCache() {
  if (systemLookup) return;
  systemLookup = dns.lookup;
  dns.lookup = function cachedLookup(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (typeof options === 'number') options = { family: options };
    options ??= {};
    if (typeof hostname !== 'string' || !hostname || net.isIP(hostname) || hostname === 'localhost') {
      return systemLookup.call(dns, hostname, options, callback);
    }
    const family = options.family === 4 || options.family === 'IPv4' ? 4 : (options.family === 6 || options.family === 'IPv6' ? 6 : 0);
    addressesFor(hostname.toLowerCase()).then((all) => {
      const list = family ? all.filter((a) => a.family === family) : all;
      if (!list.length) return callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND', hostname }));
      if (options.all) callback(null, list.map((a) => ({ address: a.address, family: a.family })));
      else callback(null, list[0].address, list[0].family);
    }, (error) => callback(error));
  };
}

export const dnsStats = () => ({ ...stats, names: cache.size });
