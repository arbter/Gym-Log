import { h, clear, fmtDate, toLocalInput, fromLocalInput, num } from './util.js';
import { S, addPhoto, savePhoto, removePhoto, nearbyWeight } from './store.js';
import { sheet, segmented, confirmDialog, empty, toast, saveFile } from './ui.js';
import { header } from './workouts.js';

const POSES = ['Front', 'Side', 'Back', 'Other'];
let urls = [];
const url = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

async function toBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back */ }
  const img = new Image();
  const src = URL.createObjectURL(file);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  URL.revokeObjectURL(src);
  return img;
}

async function resize(bitmap, max, quality) {
  const w = bitmap.width, hgt = bitmap.height, scale = Math.min(1, max / Math.max(w, hgt));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(hgt * scale);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}

export function renderPhotos(root) {
  urls.forEach(URL.revokeObjectURL); urls = [];
  let pose = 'All';
  const grid = h('div', { class: 'photo-grid' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const bmp = await toBitmap(file);
      const full = await resize(bmp, 1600, 0.82), thumb = await resize(bmp, 420, 0.72);
      newPhotoSheet(full, thumb, () => { clear(root); renderPhotos(root); });
    } catch { toast('Could not read that image'); }
  } });

  const draw = () => {
    clear(grid);
    const list = [...S.photos].filter((p) => pose === 'All' || p.pose === pose).sort((a, b) => b.date - a.date);
    if (!list.length) { grid.replaceWith(); }
    for (const p of list) {
      grid.append(h('button', { class: 'photo-cell', onclick: () => detailSheet(p, () => { clear(root); renderPhotos(root); }) },
        h('img', { src: url(p.thumb), alt: `${p.pose} photo`, loading: 'lazy' }),
        h('span', { class: 'photo-date' }, fmtDate(p.date))));
    }
  };

  root.append(
    header('Photos',
      h('span', { class: 'row gap' },
        S.photos.length >= 2 ? h('button', { class: 'icon-btn', 'aria-label': 'Compare', onclick: () => compareSheet() }, '⇄') : null,
        h('button', { class: 'icon-btn accent', 'aria-label': 'Add photo', onclick: () => fileInput.click() }, '＋'))),
    fileInput);
  if (!S.photos.length) {
    root.append(empty('No progress photos', 'Tap ＋ to take or choose one. Use the same pose, lighting and time of day for best comparisons.'));
    return;
  }
  root.append(segmented(['All', ...POSES], 'All', (v) => { pose = v; draw(); }), grid);
  draw();
}

function newPhotoSheet(full, thumb, onSaved) {
  sheet('New photo', (close) => {
    let pose = 'Front';
    const date = h('input', { type: 'datetime-local', value: toLocalInput(Date.now()) });
    const note = h('textarea', { rows: 2, placeholder: 'Optional' });
    return h('div', { class: 'stack' },
      h('img', { class: 'preview', src: url(thumb), alt: 'Preview' }),
      h('label', {}, 'Date', date),
      h('div', {}, h('div', { class: 'sub' }, 'Pose'), segmented(POSES, pose, (v) => { pose = v; })),
      h('label', {}, 'Note', note),
      h('button', { class: 'btn primary', onclick: async () => {
        await addPhoto({ date: fromLocalInput(date.value) || Date.now(), pose, note: note.value, full, thumb });
        close(); toast('Photo saved'); onSaved();
      } }, 'Save photo'));
  });
}

function detailSheet(p, onChanged) {
  sheet(`${p.pose} · ${fmtDate(p.date)}`, (close) => {
    const w = nearbyWeight(p.date);
    return h('div', { class: 'stack' },
      h('img', { class: 'full', src: url(p.full), alt: `${p.pose} photo` }),
      w != null ? h('div', { class: 'sub' }, `Body weight around then: ${num(w)} lb`) : null,
      h('label', {}, 'Date', h('input', { type: 'datetime-local', value: toLocalInput(p.date), onchange: async (e) => { const t = fromLocalInput(e.target.value); if (t) { p.date = t; await savePhoto(p); } } })),
      h('div', {}, h('div', { class: 'sub' }, 'Pose'), segmented(POSES, p.pose, async (v) => { p.pose = v; await savePhoto(p); })),
      h('label', {}, 'Note', h('textarea', { rows: 2, value: p.note || '', onchange: async (e) => { p.note = e.target.value; await savePhoto(p); } })),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn', onclick: () => saveFile(`progress-${new Date(p.date).toISOString().slice(0, 10)}.jpg`, p.full) }, 'Share / save'),
        h('button', { class: 'btn danger', onclick: async () => {
          if (await confirmDialog('Delete this photo?', { ok: 'Delete', danger: true })) { await removePhoto(p); close(); onChanged(); }
        } }, 'Delete')));
  }, { onClose: onChanged });
}

function compareSheet() {
  sheet('Compare', () => {
    let pose = 'Front';
    const out = h('div', { class: 'stack' });
    const draw = () => {
      clear(out);
      const pool = S.photos.filter((p) => p.pose === pose).sort((a, b) => a.date - b.date);
      if (pool.length < 2) { out.append(empty(`Need two ${pose.toLowerCase()} photos`)); return; }
      let bi = 0, ai = pool.length - 1;
      const cols = h('div', { class: 'compare' });
      const col = (label, get, set) => {
        const holder = h('div', { class: 'compare-col' });
        const paint = () => {
          const p = pool[get()];
          const w = nearbyWeight(p.date);
          clear(holder).append(
            h('div', { class: 'sub' }, label),
            h('img', { src: url(p.full), alt: `${label} photo` }),
            h('select', { onchange: (e) => { set(Number(e.target.value)); paint(); } },
              pool.map((q, i) => h('option', { value: i, selected: i === get() }, fmtDate(q.date)))),
            w != null ? h('div', { class: 'sub num' }, `${num(w)} lb`) : null);
        };
        paint();
        return holder;
      };
      cols.append(col('Before', () => bi, (v) => { bi = v; }), col('After', () => ai, (v) => { ai = v; }));
      out.append(cols);
    };
    draw();
    return h('div', { class: 'stack' }, segmented(POSES, pose, (v) => { pose = v; draw(); }), out);
  });
}
