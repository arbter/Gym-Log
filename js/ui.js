import { h, clear } from './util.js';

/** Bottom sheet. `build(close)` returns the sheet body. Resolves when closed. */
export function sheet(title, build, { onClose } = {}) {
  const overlay = h('div', { class: 'overlay' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title });
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    if (!overlay.classList.contains('show')) return;
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 180);
    document.body.classList.remove('noscroll');
    onClose?.();
  };
  const head = h('div', { class: 'sheet-head' },
    h('h2', {}, title),
    h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕'));
  panel.append(head, h('div', { class: 'sheet-body' }, build(close)));
  overlay.append(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => overlay.classList.add('show'));
  return close;
}

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2200);
}

export function confirmDialog(message, { ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    sheet('Please confirm', (close) => h('div', { class: 'stack' },
      h('p', {}, message),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn', onclick: () => { done(false); close(); } }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { done(true); close(); } }, ok))),
    { onClose: () => done(false) });
  });
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented' });
  const render = (v) => {
    clear(wrap);
    for (const o of options) {
      const val = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      wrap.append(h('button', {
        class: val === v ? 'on' : '', type: 'button',
        onclick: () => { render(val); onChange(val); },
      }, label));
    }
  };
  render(value);
  return wrap;
}

export function chips(options, value, onChange) {
  const wrap = h('div', { class: 'chips' });
  const render = (v) => {
    clear(wrap);
    for (const o of options) {
      const val = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      wrap.append(h('button', { class: 'chip' + (val === v ? ' on' : ''), type: 'button', onclick: () => { render(val); onChange(val); } }, label));
    }
  };
  render(value);
  return wrap;
}

/** Saves/shares a file; falls back to a download link. */
export async function saveFile(name, blob) {
  const file = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function empty(title, text) {
  return h('div', { class: 'empty' }, h('h3', {}, title), text && h('p', {}, text));
}
