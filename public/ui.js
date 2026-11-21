// Petites briques d'interface : éléments DOM, icônes, formats, menus et dialogues.
import { ICONS } from './icons.js';
import { t, tr, getLang } from './i18n.js';
export { t };

const TRANSLATED_ATTRIBUTES = new Set(['title', 'aria-label', 'placeholder', 'alt']);

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    // Les textes statiques connus sont traduits automatiquement (voir i18n.js).
    if (TRANSLATED_ATTRIBUTES.has(key)) el.setAttribute(key, tr(value));
    else if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') for (const [k, v] of Object.entries(value)) (k.startsWith('--') ? el.style.setProperty(k, v) : (el.style[k] = v));
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && !['list', 'form'].includes(key) && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false).map((c) => (typeof c === 'string' ? tr(c) : c)));
  return el;
}

function svg(inner, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="icon ${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${inner}</svg>`;
  return t.content.firstChild;
}
export const icon = (name, cls) => svg(ICONS.ui[name] ?? '', cls);
/** Icône de section. Les noms enregistrés dans la configuration sont des noms de symboles SF (voir scripts/build-icons.py). */
export const sfIcon = (name) => svg(ICONS.sf[name] ?? ICONS.sf['newspaper.fill']);
export const SF_NAMES = Object.keys(ICONS.sf);
export const badge = (section, small) => h('span', { class: `badge${small ? ' small' : ''}`, style: { '--c': section.colorHex } }, sfIcon(section.icon));

// --- Formats (français ou anglais du Canada, selon la langue de l'interface) ---
const locale = () => (getLang() === 'en' ? 'en-CA' : 'fr-CA');
export const fmt = {
  ago(ms, now = Date.now()) {
    const s = Math.round((now - ms) / 1000);
    if (Math.abs(s) < 60) return t("à l'instant");
    const rtf = new Intl.RelativeTimeFormat(locale(), { style: 'short', numeric: 'always' });
    const m = Math.round(s / 60);
    if (Math.abs(m) < 60) return rtf.format(-m, 'minute');
    const hr = Math.round(m / 60);
    if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
    return rtf.format(-Math.round(hr / 24), 'day');
  },
  duration(seconds) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
  },
  distance(meters, units) {
    const value = units === 'metric' ? meters / 1000 : meters / 1609.344, unit = units === 'metric' ? 'km' : 'mi';
    const short = value.toFixed(1);
    return value < 10 ? `${getLang() === 'en' ? short : short.replace('.', ',')} ${unit}` : `${Math.round(value)} ${unit}`;
  },
  time(ms, timeZone) {
    const text = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', timeZone }).format(ms);
    return getLang() === 'en' ? text : text.replace(/\s?h\s?/, ' h ');
  },
  hour(ms, timeZone) {
    if (getLang() === 'en') return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', timeZone }).format(ms);
    return `${new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(ms).replace(/^0/, '')} h`;
  },
  weekday(ms, timeZone, style = 'short') {
    const s = new Intl.DateTimeFormat(locale(), { weekday: style, timeZone }).format(ms);
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  longDate(ms) {
    const s = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
};

// --- Couche flottante : menus, panneaux, dialogues ---
const layer = () => document.getElementById('layer');
const stack = [];

function mount(panel, { dim = false, anchor = null, onClose } = {}) {
  const wrap = h('div', { style: { position: 'absolute', inset: '0' } });
  const previous = document.activeElement;
  const close = () => {
    const i = stack.indexOf(close);
    if (i < 0) return;
    stack.splice(i, 1);
    wrap.remove();
    onClose?.();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  };
  wrap.append(h('div', { class: `scrim${dim ? ' dim' : ''}`, onClick: close }), panel);
  layer().append(wrap);
  stack.push(close);
  if (anchor) place(panel, anchor);
  (panel.querySelector('[autofocus]') ?? panel.querySelector('button, input, select, textarea') ?? panel).focus?.({ preventScroll: true });
  return close;
}

function place(panel, anchor) {
  const r = anchor.getBoundingClientRect(), w = panel.offsetWidth, ht = panel.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight, m = 8;
  let left = Math.min(Math.max(m, r.right - w), vw - w - m);
  if (r.left + w + m <= vw && r.left < vw / 2) left = Math.max(m, r.left);
  let top = r.bottom + 6;
  if (top + ht + m > vh) top = Math.max(m, r.top - ht - 6 > m ? r.top - ht - 6 : vh - ht - m);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) { e.preventDefault(); stack.at(-1)(); }
});
export const hasOverlay = () => stack.length > 0;

/** items : { label, detail?, icon?, checked?, disabled?, action } | '-' | { heading } */
export function openMenu(anchor, items) {
  const menu = h('div', { class: 'menu', role: 'menu' });
  const close = mount(menu, { anchor });
  for (const item of items.filter(Boolean)) {
    if (item === '-') menu.append(h('hr'));
    else if (item.heading) menu.append(h('h4', {}, item.heading));
    else {
      menu.append(h('button', { role: 'menuitem', disabled: item.disabled, onClick: () => { close(); item.action?.(); } },
        item.icon, h('span', {}, item.label, item.detail && h('small', {}, item.detail)), item.checked && icon('check', 'check')));
    }
  }
  place(menu, anchor);
  return close;
}

export function openPopover(anchor, build, { width = 300 } = {}) {
  const panel = h('div', { class: 'popover', style: { width: `min(${width}px, calc(100vw - 16px))` } });
  const close = mount(panel, { anchor });
  panel.append(...[build(close, () => place(panel, anchor))].flat());
  place(panel, anchor);
  return close;
}

export function openDialog(build, { cls = 'dialog', onClose } = {}) {
  const panel = h('div', { class: cls, role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
  const close = mount(panel, { dim: true, onClose });
  panel.append(...[build(close)].flat());
  return close;
}

export function confirmDialog(title, message, actionLabel, danger = true) {
  return new Promise((resolve) => {
    let answer = false;
    openDialog((close) => [
      h('h3', {}, title), h('p', {}, message),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', autofocus: true, onClick: close }, 'Annuler'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onClick: () => { answer = true; close(); } }, actionLabel)),
    ], { onClose: () => resolve(answer) });
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch {
    // Hors HTTPS, l'API du presse-papiers n'existe pas : méthode de repli.
    const area = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

// --- API du serveur ---
export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, { method, headers: { 'X-Lang': getLang(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error(t('Serveur Lookout injoignable')); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? t('Erreur {0}', response.status));
  return data;
}
