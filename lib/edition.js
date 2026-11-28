// Résumé par courriel : ce que le résumé quotidien rassemble avant d'appeler le modèle, et sa mise en page.
// Les faits chiffrés (météo, agenda, trajet, pointages) et la liste des vidéos sont mis en forme ici, sans modèle :
// ils ne coûtent rien et ne peuvent pas être inventés. Seul le choix des nouvelles de chaque page passe par Claude.
import { t } from '../public/i18n.js';
import { articleFilter, topicClusters, WMO_LABELS } from '../public/shared.js';

const DAY = 24 * 3600e3;
const TOPICS_PER_PAGE = 30;   // sujets d'une page proposés au modèle
const TOPICS_TOTAL = 90;
const VIDEOS_PER_PAGE = 8;
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Rassemble la matière du résumé, page par page. `digest.sections` liste les sections choisies (affichées ou non sur
 * le tableau de bord) ; `load(section)` donne les données d'une section (par le cache habituel).
 * Renvoie { pages, glance } :
 * - pages : pour chaque page qui a de la matière, { id, name, topics, videos }. Un sujet réunit les articles de sources
 *   différentes sur le même événement ; s'il touche plusieurs pages, il reste dans la première, pour ne pas être répété ;
 * - glance : la journée en un coup d'œil, d'après les sections météo, agenda, trajets et pointages choisies.
 */
export async function collectEdition(digest, config, load, now = Date.now()) {
  const safe = async (s) => { try { const payload = await load(s); return payload?.error && !payload.updatedAt ? null : payload; } catch { return null; } };
  const wanted = new Set(digest.sections), order = new Map(config.pages.map((p, i) => [p.id, i]));
  const chosen = config.sections.filter((s) => wanted.has(s.id)).sort((a, b) => (order.get(a.page) ?? 0) - (order.get(b.page) ?? 0));
  const articles = [], videos = new Map(), seen = new Set();
  for (const s of chosen.filter((x) => x.kind === 'feed' || x.kind === 'api')) {
    const payload = await safe(s);
    const recent = (payload?.articles ?? []).filter(articleFilter({ ...s.feed, maxAgeHours: 24 }, config.general, now)).filter((a) => a.date && a.date > now - DAY && a.date <= now + 3600e3);
    for (const a of recent) {
      const key = a.link ?? `${a.source}|${a.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (s.feed.youtube) {
        if (!videos.has(s.page)) videos.set(s.page, []);
        videos.get(s.page).push({ title: a.title, source: a.source ?? s.title, link: a.link, image: a.image ?? null, date: a.date });
      } else articles.push({ ...a, section: s.title, page: s.page });
    }
  }
  // Un sujet par événement : les articles de sources différentes sur la même nouvelle n'en font qu'un.
  const clusters = topicClusters(articles), groups = new Map();
  for (const a of articles) { const key = clusters.has(a.id) ? `s${clusters.get(a.id)}` : `a${a.id}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(a); }
  const byPage = new Map();
  for (const members of groups.values()) {
    members.sort((x, y) => (y.date ?? 0) - (x.date ?? 0));
    const sources = [...new Map(members.filter((m) => m.link).map((m) => [m.source || m.section, { name: m.source || m.section, link: m.link, title: m.title }])).values()];
    if (!sources.length) continue;
    // La page du sujet : la première, dans l'ordre des onglets, où l'une de ses sources figure.
    const page = members.map((m) => m.page).sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0))[0];
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push({ title: members[0].title, summary: String(members[0].summary ?? '').slice(0, 240), section: members[0].section, date: members[0].date,
      image: members.find((m) => /^https?:\/\//i.test(String(m.image)))?.image ?? null, sources });
  }
  let budget = TOPICS_TOTAL;
  const pages = config.pages.map((p) => {
    const topics = (byPage.get(p.id) ?? []).sort((a, b) => b.sources.length - a.sources.length || (b.date ?? 0) - (a.date ?? 0)).slice(0, Math.min(TOPICS_PER_PAGE, budget));
    budget -= topics.length;
    return { id: p.id, name: p.name || t('Sans titre'), topics, videos: (videos.get(p.id) ?? []).sort((a, b) => b.date - a.date).slice(0, VIDEOS_PER_PAGE) };
  }).filter((p) => p.topics.length || p.videos.length);
  return { pages, glance: await glance(chosen, safe, new Date(now)) };
}

/** La journée en un coup d'œil : au plus quatre repères, tirés des sections choisies. */
async function glance(sections, safe, now) {
  const out = [];
  const weatherSection = sections.find((s) => s.kind === 'weather');
  const w = weatherSection && (await safe(weatherSection))?.weather;
  if (w) {
    const today = w.days?.[0], label = WMO_LABELS[w.code] ? t(WMO_LABELS[w.code]).toLowerCase() : '';
    out.push({ kind: 'weather', title: [`${Math.round(w.temperature)}°`, label].filter(Boolean).join(', '),
      detail: [today && t('max. {0}°', Math.round(today.high)), w.alerts?.[0]?.name].filter(Boolean).join(' · ') });
  }
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), dayEnd = dayStart + DAY, utcDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const events = [];
  for (const s of sections.filter((x) => x.kind === 'calendar')) {
    for (const e of (await safe(s))?.events ?? []) if (e.allDay ? e.start <= utcDay && e.end > utcDay : e.start >= dayStart && e.start < dayEnd) events.push(e);
  }
  if (events.length) {
    events.sort((a, b) => Number(a.allDay) - Number(b.allDay) || a.start - b.start);
    const first = events[0], hour = (ms) => new Intl.DateTimeFormat(t('fr-CA'), { hour: 'numeric', minute: '2-digit' }).format(ms);
    out.push({ kind: 'calendar', title: events.length > 1 ? t('{0} rendez-vous', events.length) : t('1 rendez-vous'), detail: first.allDay ? first.title : `${hour(first.start)} ${first.title}` });
  }
  const commute = sections.find((s) => s.kind === 'commute');
  const route = commute && ((await safe(commute))?.routes ?? []).find((r) => !r.error && r.duration);
  if (route) out.push({ kind: 'commute', title: t('{0} min', Math.max(1, Math.round(route.duration / 60))), detail: route.name || '' });
  // Dernier résultat d'une équipe suivie, depuis hier soir.
  for (const s of sections.filter((x) => x.kind === 'sports')) {
    const mine = new Map(s.sports.leagues.filter((l) => l.teams?.length).map((l) => [l.id, new Set(l.teams.map((x) => x.id))]));
    const done = ((await safe(s))?.games ?? []).filter((g) => g.state === 'final' && g.date > now.getTime() - 20 * 3600e3 && (mine.get(g.leagueID)?.has(g.home?.id) || mine.get(g.leagueID)?.has(g.away?.id)))
      .sort((a, b) => b.date - a.date)[0];
    if (done) { out.push({ kind: 'sports', title: `${done.away.name} ${done.away.score} – ${done.home.name} ${done.home.score}`, detail: done.detail || '' }); break; }
  }
  return out.slice(0, 4);
}

// --- Courriel ---

/** « claude-opus-5-5 » -> « Claude Opus 5.5 ». */
export const modelName = (id) => String(id ?? '').replace(/^claude-([a-z]+)-(\d+)-(\d+).*$/, (m, family, major, minor) => `Claude ${family[0].toUpperCase()}${family.slice(1)} ${major}.${minor}`);
const escape = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const safeLink = (link) => (/^https?:\/\//i.test(String(link)) ? escape(link) : '#');
const safeImage = (src) => (/^https?:\/\//i.test(String(src)) ? escape(src) : null);
/** Identifiant de l'image du logo jointe au message (voir lib/mail.js). */
export const LOGO_CID = 'logo@lookout';

// Le gabarit suit les usages du courriel : une colonne de 600 px au plus, des tableaux pour la structure (seul moyen
// fiable dans Outlook et Gmail), tous les styles en ligne, du texte de 16 px, des liens larges au doigt. Les classes
// ne servent qu'au mode sombre, dans les logiciels qui lisent la feuille de style (Apple Mail, Outlook sur Mac et iOS).
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = { page: '#f2f3f5', card: '#ffffff', text: '#1d1d1f', muted: '#6b7280', line: '#e6e7eb', accent: '#2563eb', soft: '#f5f6f8' };
const STYLE = `<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
.lk-page{background:#111113!important}.lk-card{background:#1c1c1f!important}.lk-text{color:#f2f2f4!important}.lk-muted{color:#a1a1aa!important}
.lk-line{border-color:#2e2e33!important}.lk-soft{background:#26262b!important}.lk-link{color:#7db0ff!important}
}
@media (max-width:480px){.lk-pad{padding-left:16px!important;padding-right:16px!important}.lk-thumb{width:84px!important}.lk-thumb img{width:84px!important;height:56px!important}}
</style>`;

const cell = (html) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${html}</table>`;
/** Vignette cliquable, à gauche d'un texte ; sans image, la colonne disparaît et le texte prend toute la largeur. */
const thumb = (image, link, width, height) => (safeImage(image)
  ? `<td class="lk-thumb" width="${width}" valign="top" style="width:${width}px;padding:0 14px 0 0"><a href="${safeLink(link)}" style="text-decoration:none"><img src="${safeImage(image)}" width="${width}" height="${height}" alt="" style="display:block;width:${width}px;height:${height}px;object-fit:cover;border-radius:8px;border:0;background:${C.soft}"></a></td>`
  : '');

/**
 * Le résumé en courriel : { subject, text, html }. `edition` : { glance, pages: [{ name, points, videos }], model, basedOn }.
 * Chaque page a son bloc, avec ses points numérotés puis ses nouvelles vidéos ; chaque point et chaque vidéo porte
 * sa vignette et ses liens. `logo` : vrai si l'image du logo est jointe au message.
 */
export function renderEmail(edition, title, date = new Date(), { logo = false } = {}) {
  const longDate = new Intl.DateTimeFormat(t('fr-CA'), { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  const subject = `${title} — ${longDate}`;
  const pages = edition.pages.filter((p) => p.points.length || p.videos.length);
  const ago = (ms) => { const h = Math.max(1, Math.round((date.getTime() - ms) / 3600e3)); return h < 24 ? t('il y a {0} h', h) : ''; };
  const total = pages.reduce((n, p) => n + p.points.length, 0);
  // Aperçu affiché par la boîte de réception à côté de l'objet : le premier point du jour.
  const preheader = pages.flatMap((p) => p.points)[0]?.text ?? edition.glance.map((g) => g.title).join(' · ');

  const text = [subject, '',
    edition.glance.length ? edition.glance.map((g) => (g.detail ? `${g.title} (${g.detail})` : g.title)).join(' · ') : null,
    ...pages.flatMap((p) => ['', `== ${p.name} ==`,
      ...p.points.map((pt, i) => `${i + 1}. ${pt.text}\n   ${pt.sources.map((s) => `${s.name} : ${s.link}`).join('\n   ')}`),
      ...(p.videos.length ? ['', `${t('Nouvelles vidéos')} :`, ...p.videos.map((v) => `- ${v.source} — ${v.title}\n  ${v.link}`)] : [])]),
    ...(total ? ['', t('Résumé produit par {0} à partir de {1} sujets. À vérifier dans les articles.', modelName(edition.model), edition.basedOn)] : []),
    '', t('Vous recevez ce courriel parce que le résumé par courriel est activé dans Lookout (Réglages → Résumé par courriel).')].filter((line) => line !== null).join('\n');

  const glanceRow = edition.glance.length ? cell(`<tr>${edition.glance.map((g, i) => `${i ? '<td width="8" style="width:8px;font-size:0">&nbsp;</td>' : ''}<td class="lk-soft" valign="top" style="background:${C.soft};border-radius:10px;padding:10px 12px">
<div class="lk-text" style="font:600 15px/1.3 ${FONT};color:${C.text}">${escape(g.title)}</div>${g.detail ? `<div class="lk-muted" style="font:400 13px/1.35 ${FONT};color:${C.muted};padding-top:2px">${escape(g.detail)}</div>` : ''}</td>`).join('')}</tr>`) : '';

  const point = (pt, i) => cell(`<tr><td class="lk-line" style="border-top:1px solid ${C.line};padding:14px 0">${cell(`<tr>
${thumb(pt.image, pt.link, 104, 70)}<td valign="top">
<a class="lk-text" href="${safeLink(pt.link)}" style="font:400 16px/1.5 ${FONT};color:${C.text};text-decoration:none"><span style="font-weight:700;color:${C.accent}">${i + 1}.</span> ${escape(pt.text)}</a>
<div style="font:400 13px/1.6 ${FONT};padding-top:4px">${pt.sources.map((s) => `<a class="lk-link" href="${safeLink(s.link)}" style="color:${C.accent};text-decoration:none;white-space:nowrap">${escape(s.name)}</a>`).join(`<span class="lk-muted" style="color:${C.muted}"> · </span>`)}</div>
</td></tr>`)}</td></tr>`);

  const video = (v) => cell(`<tr><td class="lk-line" style="border-top:1px solid ${C.line};padding:12px 0">${cell(`<tr>
${thumb(v.image, v.link, 136, 77)}<td valign="top">
<a class="lk-text" href="${safeLink(v.link)}" style="font:600 15px/1.4 ${FONT};color:${C.text};text-decoration:none">${escape(v.title)}</a>
<div class="lk-muted" style="font:400 13px/1.5 ${FONT};color:${C.muted};padding-top:3px">${escape([v.source, ago(v.date)].filter(Boolean).join(' · '))}</div>
</td></tr>`)}</td></tr>`);

  const block = (p) => `<tr><td class="lk-pad" style="padding:22px 28px 6px">
<div style="font:700 12px/1.2 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${C.accent};padding-bottom:10px">${escape(p.name)}</div>
${p.points.map(point).join('\n')}
${p.videos.length ? `<div class="lk-muted" style="font:600 12px/1.2 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:${C.muted};padding:${p.points.length ? '16px' : '0'} 0 10px">${escape(t('Nouvelles vidéos'))}</div>
${p.videos.map(video).join('\n')}` : ''}
</td></tr>`;

  const html = `<!doctype html><html lang="${t('fr-CA').slice(0, 2)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escape(subject)}</title>${STYLE}</head>
<body class="lk-page" style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escape(preheader)}</div>
<table role="presentation" class="lk-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="lk-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border-radius:16px">
<tr><td class="lk-pad" style="padding:24px 28px 18px">${cell(`<tr>
${logo ? `<td width="44" valign="middle" style="width:44px;padding-right:12px"><img src="cid:${LOGO_CID}" width="44" height="44" alt="Lookout" style="display:block;width:44px;height:44px;border-radius:10px;border:0"></td>` : ''}
<td valign="middle"><div class="lk-text" style="font:700 22px/1.2 ${FONT};color:${C.text}">${escape(title)}</div>
<div class="lk-muted" style="font:400 14px/1.4 ${FONT};color:${C.muted};padding-top:2px">${escape(longDate.charAt(0).toUpperCase() + longDate.slice(1))}</div></td></tr>`)}
${glanceRow ? `<div style="padding-top:16px">${glanceRow}</div>` : ''}</td></tr>
${pages.map(block).join('\n')}
<tr><td class="lk-pad lk-line" style="padding:18px 28px 24px;border-top:1px solid ${C.line}">
<div class="lk-muted" style="font:400 12px/1.6 ${FONT};color:${C.muted}">${total ? `${escape(t('Résumé produit par {0} à partir de {1} sujets. À vérifier dans les articles.', modelName(edition.model), edition.basedOn))}<br>` : ''}${escape(t('Vous recevez ce courriel parce que le résumé par courriel est activé dans Lookout (Réglages → Résumé par courriel).'))}</div>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
