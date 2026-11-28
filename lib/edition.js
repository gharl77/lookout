// Résumé par courriel : ce que le résumé quotidien rassemble avant d'appeler le modèle, et sa mise en page.
// Les faits chiffrés (météo, agenda, trajet, pointages) et la liste des vidéos sont mis en forme ici, sans modèle :
// ils ne coûtent rien et ne peuvent pas être inventés. Seul le choix des nouvelles du jour passe par Claude.
import { t } from '../public/i18n.js';
import { articleFilter, topicClusters, WMO_LABELS } from '../public/shared.js';

const DAY = 24 * 3600e3;
const TOPIC_LIMIT = 45;   // sujets proposés au modèle
const VIDEO_LIMIT = 15;
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Rassemble la matière du résumé. `digest.sections` liste les sections choisies (affichées ou non sur le tableau de
 * bord) ; `load(section)` donne les données d'une section (par le cache habituel). Renvoie { topics, videos, glance } :
 * - topics : les sujets des dernières 24 heures, un par événement (plusieurs sources réunies), les plus couverts d'abord ;
 * - videos : les nouvelles vidéos des sections YouTube choisies, depuis 24 heures ;
 * - glance : la journée en un coup d'œil, d'après les sections météo, agenda, trajets et pointages choisies.
 */
export async function collectEdition(digest, config, load, now = Date.now()) {
  const safe = async (s) => { try { const payload = await load(s); return payload?.error && !payload.updatedAt ? null : payload; } catch { return null; } };
  const wanted = new Set(digest.sections), chosen = config.sections.filter((s) => wanted.has(s.id));
  const articles = [], videos = [], seen = new Set();
  for (const s of chosen.filter((x) => x.kind === 'feed' || x.kind === 'api')) {
    const payload = await safe(s);
    const recent = (payload?.articles ?? []).filter(articleFilter({ ...s.feed, maxAgeHours: 24 }, config.general, now)).filter((a) => a.date && a.date > now - DAY && a.date <= now + 3600e3);
    for (const a of recent) {
      const key = a.link ?? `${a.source}|${a.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (s.feed.youtube) videos.push({ title: a.title, source: a.source ?? s.title, link: a.link, image: a.image ?? null, date: a.date });
      else articles.push({ ...a, section: s.title });
    }
  }
  // Un sujet par événement : les articles de sources différentes sur la même nouvelle n'en font qu'un.
  const clusters = topicClusters(articles), groups = new Map();
  for (const a of articles) { const key = clusters.has(a.id) ? `s${clusters.get(a.id)}` : `a${a.id}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(a); }
  const topics = [...groups.values()].map((members) => {
    members.sort((x, y) => (y.date ?? 0) - (x.date ?? 0));
    const sources = [...new Map(members.filter((m) => m.link).map((m) => [m.source || m.section, { name: m.source || m.section, link: m.link, title: m.title }])).values()];
    return { title: members[0].title, summary: String(members[0].summary ?? '').slice(0, 240), section: members[0].section, date: members[0].date, sources };
  }).filter((topic) => topic.sources.length)
    .sort((a, b) => b.sources.length - a.sources.length || (b.date ?? 0) - (a.date ?? 0)).slice(0, TOPIC_LIMIT);
  videos.sort((a, b) => b.date - a.date);
  return { topics, videos: videos.slice(0, VIDEO_LIMIT), glance: await glance(chosen, safe, new Date(now)) };
}

/** La journée en un coup d'œil : au plus quatre repères, tirés des sections du profil. */
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

/**
 * L'édition en courriel : { subject, text, html }. Mise en page sobre, en une colonne, lisible au téléphone et dans
 * les logiciels de courriel qui ignorent les feuilles de style (tout est en styles en ligne).
 */
export function renderEmail(full, title, date = new Date(), { glance = true, videos = true } = {}) {
  // Le courriel a ses propres choix de contenu, distincts de ceux de la carte.
  const edition = { ...full, glance: glance ? full.glance : [], videos: videos ? full.videos : [] };
  const longDate = new Intl.DateTimeFormat(t('fr-CA'), { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  const subject = `${title} — ${longDate}`;
  const glanceText = edition.glance.map((g) => [g.title, g.detail].filter(Boolean).join(' (') + (g.detail ? ')' : '')).join(' · ');
  const text = [subject, '', glanceText, '',
    ...edition.summary.map((p, i) => `${i + 1}. ${p.text}\n   ${p.sources.map((s) => `${s.name} : ${s.link}`).join('\n   ')}`),
    ...(edition.videos.length ? ['', t('Nouvelles vidéos'), ...edition.videos.map((v) => `- ${v.source} — ${v.title}\n  ${v.link}`)] : []),
    ...(edition.summary.length ? ['', t('Résumé produit par {0} à partir de {1} sujets. À vérifier dans les articles.', modelName(edition.model), edition.basedOn)] : [])].filter((line) => line !== null).join('\n');
  const muted = 'color:#6b7280;font-size:13px', link = 'color:#2563eb;text-decoration:none';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f5f5f7">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1c1e;line-height:1.5">
<div style="background:#ffffff;border-radius:12px;padding:22px 22px 18px">
<h1 style="margin:0 0 2px;font-size:20px">${escape(title)}</h1>
<p style="margin:0 0 16px;${muted}">${escape(longDate)}</p>
${edition.glance.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 14px"><tr>${edition.glance.map((g) => `<td style="padding:8px 10px;background:#f5f5f7;border-radius:8px;font-size:14px;vertical-align:top"><b>${escape(g.title)}</b>${g.detail ? `<br><span style="${muted}">${escape(g.detail)}</span>` : ''}</td>`).join('<td style="width:8px"></td>')}</tr></table>` : ''}
${edition.summary.map((p, i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5e5ea"><tr>
<td style="width:30px;padding:12px 0;vertical-align:top;font-weight:700;color:#2563eb">${i + 1}</td>
<td style="padding:12px 0;font-size:15px">${escape(p.text)}<br><span style="${muted}">${p.sources.map((s) => `<a href="${safeLink(s.link)}" style="${link}">${escape(s.name)}</a>`).join(' · ')}</span></td></tr></table>`).join('\n')}
${edition.videos.length ? `<h2 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280">${escape(t('Nouvelles vidéos'))}</h2>
${edition.videos.map((v) => `<p style="margin:0 0 8px;font-size:14px"><a href="${safeLink(v.link)}" style="${link}">${escape(v.title)}</a><br><span style="${muted}">${escape(v.source)}</span></p>`).join('\n')}` : ''}
${edition.summary.length ? `<p style="margin:16px 0 0;${muted}">${escape(t('Résumé produit par {0} à partir de {1} sujets. À vérifier dans les articles.', modelName(edition.model), edition.basedOn))}</p>` : ''}
</div></div></body></html>`;
  return { subject, text, html };
}
