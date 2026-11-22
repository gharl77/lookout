// Connexion à un compte Google (OAuth 2.0), pour lire la liste des abonnements YouTube — et rien d'autre.
// L'identifiant et le secret du client viennent de l'administrateur (un projet Google Cloud lui appartenant).
import { BriefingError } from './util.js';

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

export function authURL(clientID, redirectURI, state) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  // access_type=offline + prompt=consent : Google remet un jeton durable, pour resynchroniser sans redemander.
  for (const [k, v] of Object.entries({ client_id: clientID, redirect_uri: redirectURI, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })) url.searchParams.set(k, v);
  return url.href;
}

async function token(params) {
  let response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15e3),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  } catch { throw new BriefingError('Service Google injoignable'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // invalid_grant : autorisation retirée ou expirée — il faut reconnecter le compte.
    if (body.error === 'invalid_grant') throw Object.assign(new BriefingError('La connexion à Google a expiré : reconnectez votre compte'), { expired: true });
    throw new BriefingError('Google a refusé la connexion ({0})', String(body.error_description ?? body.error ?? response.status).slice(0, 120));
  }
  return body;
}

/** Échange le code reçu de Google contre des jetons. */
export const exchangeCode = (clientID, clientSecret, redirectURI, code) =>
  token({ code, client_id: clientID, client_secret: clientSecret, redirect_uri: redirectURI, grant_type: 'authorization_code' });

/** Jeton d'accès de courte durée, à partir du jeton durable du profil. */
export const refreshAccess = async (clientID, clientSecret, refreshToken) =>
  (await token({ refresh_token: refreshToken, client_id: clientID, client_secret: clientSecret, grant_type: 'refresh_token' })).access_token;

/** Toutes les chaînes auxquelles le compte est abonné : [{ id, name }]. */
export async function listSubscriptions(accessToken) {
  const channels = [];
  let pageToken = '';
  for (let page = 0; page < 40; page++) {   // 40 pages de 50 : 2000 abonnements au plus
    const url = `https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=50&order=alphabetical${pageToken ? `&pageToken=${pageToken}` : ''}`;
    let response;
    try { response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15e3) }); }
    catch { throw new BriefingError('Service Google injoignable'); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new BriefingError('YouTube a refusé la demande ({0})', String(body.error?.message ?? response.status).slice(0, 160));
    for (const item of body.items ?? []) {
      const id = item.snippet?.resourceId?.channelId;
      if (/^UC[\w-]{22}$/.test(String(id))) channels.push({ id, name: String(item.snippet.title ?? id).slice(0, 100) });
    }
    pageToken = body.nextPageToken ?? '';
    if (!pageToken) break;
  }
  return channels;
}

/** Retire l'autorisation donnée à Lookout (sans effet si elle a déjà été retirée). */
export async function revoke(refreshToken) {
  try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST', signal: AbortSignal.timeout(10e3) }); }
  catch { /* le jeton est de toute façon supprimé de ce serveur */ }
}
