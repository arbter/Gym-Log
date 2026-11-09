// Small DOM + formatting helpers shared by every view.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quads',
  'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Cardio', 'Other'];

// Names match the "Item" column of the Fitness Logbook export.
export const KINDS = [
  { name: 'Body weight', unit: 'lb', type: 'headline' },
  { name: 'Body fat', unit: '%', type: 'headline' },
  { name: 'Neck', unit: 'in', type: 'circ' },
  { name: 'Shoulders', unit: 'in', type: 'circ' },
  { name: 'Chest', unit: 'in', type: 'circ' },
  { name: 'Waist', unit: 'in', type: 'circ' },
  { name: 'Hip', unit: 'in', type: 'circ' },
  { name: 'Upper arm, left', unit: 'in', type: 'circ' },
  { name: 'Upper arm, right', unit: 'in', type: 'circ' },
  { name: 'Forearm, left', unit: 'in', type: 'circ' },
  { name: 'Forearm, right', unit: 'in', type: 'circ' },
  { name: 'Wrist', unit: 'in', type: 'circ' },
  { name: 'Thigh, left', unit: 'in', type: 'circ' },
  { name: 'Thigh, right', unit: 'in', type: 'circ' },
  { name: 'Calf, left', unit: 'in', type: 'circ' },
  { name: 'Calf, right', unit: 'in', type: 'circ' },
  { name: 'Height', unit: 'in', type: 'other' },
];
export const kindInfo = (name) => KINDS.find((k) => k.name === name) || { name, unit: '', type: 'other' };

export function num(v) {
  if (v == null || Number.isNaN(v)) return '';
  return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toString();
}

export function parseNum(text) {
  if (text == null) return null;
  const t = String(text).replace(',', '.').trim();
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function duration(sec) {
  sec = Math.max(0, Math.round(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

/** "m:ss", "h:mm:ss" or plain minutes. */
export function parseDuration(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const parts = t.split(':').filter((p) => p !== '').map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

const fmtCache = {};
function fmt(key, opts) { return (fmtCache[key] ??= new Intl.DateTimeFormat(undefined, opts)); }
export const fmtDate = (ms) => fmt('d', { month: 'short', day: 'numeric', year: 'numeric' }).format(ms);
export const fmtShort = (ms) => fmt('s', { month: 'short', day: 'numeric' }).format(ms);
export const fmtMonth = (ms) => fmt('m', { month: 'long', year: 'numeric' }).format(ms);
export const fmtDateTime = (ms) => fmt('dt', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms);

export function toLocalInput(ms) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (s) => new Date(s).getTime();

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
export function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

export function csvEscape(s) { return '"' + String(s ?? '').replace(/"/g, '""') + '"'; }

export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.flush = (...a) => { clearTimeout(t); fn(...a); };
  return wrapped;
}

export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function lsSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
