// Clés et jetons : ils sont enregistrés sur le serveur, mais ne sont jamais renvoyés au navigateur.
// L'interface reçoit un masque à la place ; si elle renvoie ce masque tel quel, la valeur enregistrée
// est conservée. Ainsi, quelqu'un qui ouvre la page (ou un fichier exporté) ne peut pas lire les clés.
import { SECRET_MASK } from '../public/shared.js';

/** Champs secrets d'une section : [objet, nom du champ]. */
const fields = (s) => [[s.sports, 'apiSportsKey'], [s.commute, 'tomtomKey'], [s.commute, 'hassToken'], [s.releases, 'tmdbKey'], [s.summary, 'anthropicKey']];

// En-têtes HTTP d'une section « API JSON » : le nom reste visible, la valeur est masquée.
const headerLines = (text) => String(text ?? '').split(/\r?\n/).map((line) => {
  const i = line.indexOf(':');
  return i > 0 ? { name: line.slice(0, i).trim(), value: line.slice(i + 1).trim() } : { raw: line };
});
const joinHeaders = (lines) => lines.map((l) => (l.raw !== undefined ? l.raw : `${l.name}: ${l.value}`)).join('\n');

/** Copie de la configuration sans aucun secret, destinée au navigateur. */
export function redact(config) {
  const copy = structuredClone(config);
  for (const s of copy.sections) {
    for (const [obj, key] of fields(s)) if (obj[key]) obj[key] = SECRET_MASK;
    s.api.headers = joinHeaders(headerLines(s.api.headers).map((l) => (l.raw !== undefined || !l.value ? l : { ...l, value: SECRET_MASK })));
  }
  return copy;
}

/** Remet les secrets enregistrés là où la configuration reçue contient encore le masque. */
export function restoreSecrets(incoming, stored) {
  const previous = new Map(stored.sections.map((s) => [s.id, s]));
  for (const s of incoming.sections) {
    const old = previous.get(s.id);
    const oldFields = old ? fields(old) : [];
    fields(s).forEach(([obj, key], i) => {
      // Masque sans valeur d'origine (section dupliquée ou importée d'ailleurs) : le champ est vidé.
      if (obj[key] === SECRET_MASK) obj[key] = oldFields[i]?.[0][oldFields[i][1]] ?? '';
    });
    const oldHeaders = new Map(headerLines(old?.api.headers).filter((l) => l.name).map((l) => [l.name.toLowerCase(), l.value]));
    s.api.headers = joinHeaders(headerLines(s.api.headers).map((l) =>
      (l.value === SECRET_MASK ? { ...l, value: oldHeaders.get(l.name.toLowerCase()) ?? '' } : l)));
  }
  return incoming;
}
