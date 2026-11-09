import { h, clear, fmtDate } from './util.js';
import { S, exportCSVs, exportBackup, importBackup, eraseAll, importLogbookCSV } from './store.js';
import { confirmDialog, saveFile, toast } from './ui.js';
import { header } from './workouts.js';

export function renderData(root) {
  const stamp = new Date().toISOString().slice(0, 10);
  let withPhotos = true;
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!(await confirmDialog('Restoring replaces the workouts and measurements currently in the app with the ones in this backup. Continue?', { ok: 'Restore', danger: true }))) return;
    try {
      const r = await importBackup(await f.text());
      toast(`Restored ${r.workouts} workouts, ${r.measurements} measurements`);
      clear(root); renderData(root);
    } catch (err) { toast(err.message || 'Could not read that file'); }
  } });

  const csvInput = h('input', { type: 'file', accept: '.csv,text/csv', multiple: true, hidden: true, onchange: async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    const lines = [];
    for (const f of files) {
      try {
        const r = await importLogbookCSV(await f.text());
        lines.push(r.kind === 'workouts' ? `${r.added} new workouts${r.updated ? `, ${r.updated} completed` : ''}` : `${r.added} new measurements`);
      } catch (err) { lines.push(`${f.name}: ${err.message}`); }
    }
    if (lines.length) { toast(lines.join(' · ')); clear(root); renderData(root); }
  } });

  const persisted = h('span', { class: 'sub' }, '…');
  navigator.storage?.persisted?.().then((p) => { persisted.textContent = p ? 'Protected from automatic clearing' : 'Not protected — back up regularly'; });

  const last = S.meta.lastBackup;

  root.append(header('Data'), file, csvInput, h('div', { class: 'stack' },
    h('div', { class: 'card list' },
      h('div', { class: 'list-row' }, h('span', { class: 'grow' }, 'Workouts'), h('span', { class: 'num' }, S.workouts.length)),
      h('div', { class: 'list-row' }, h('span', { class: 'grow' }, 'Sets logged'), h('span', { class: 'num' }, S.workouts.reduce((a, w) => a + w.sets.length, 0).toLocaleString())),
      h('div', { class: 'list-row' }, h('span', { class: 'grow' }, 'Measurements'), h('span', { class: 'num' }, S.measurements.length)),
      h('div', { class: 'list-row' }, h('span', { class: 'grow' }, 'Photos'), h('span', { class: 'num' }, S.photos.length))),

    h('h3', { class: 'section-title' }, 'Import more history'),
    h('div', { class: 'card stack pad' },
      h('p', { class: 'sub' }, 'Choose the workouts and/or measurements CSV files from a Fitness Logbook export. Only workouts and measurements that aren’t already here are added, so it’s safe to import the same export twice.'),
      h('button', { class: 'btn', onclick: () => csvInput.click() }, 'Import Fitness Logbook CSV…')),

    h('h3', { class: 'section-title' }, 'Backup'),
    h('div', { class: 'card stack pad' },
      h('p', { class: 'sub' }, last ? `Last backup: ${fmtDate(last)}.` : 'No backup yet.', ' Your data lives only on this phone, and iOS can clear a web app’s storage if you don’t open it for a few weeks. Save a backup to Files or iCloud Drive every so often.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { withPhotos = e.target.checked; } }), 'Include photos (larger file)'),
      h('button', { class: 'btn primary', onclick: async () => {
        await saveFile(`gymlog-backup-${stamp}.json`, await exportBackup(withPhotos));
        clear(root); renderData(root);
      } }, 'Save backup file'),
      h('button', { class: 'btn', onclick: () => file.click() }, 'Restore from backup…'),
      persisted),

    h('h3', { class: 'section-title' }, 'Spreadsheet export'),
    h('div', { class: 'card stack pad' },
      h('p', { class: 'sub' }, 'Workouts and measurements as CSV files, for Excel or Sheets.'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn', onclick: () => saveFile(`gymlog-workouts-${stamp}.csv`, new Blob([exportCSVs().workouts], { type: 'text/csv' })) }, 'Workouts CSV'),
        h('button', { class: 'btn', onclick: () => saveFile(`gymlog-measurements-${stamp}.csv`, new Blob([exportCSVs().measurements], { type: 'text/csv' })) }, 'Measurements CSV'))),

    h('h3', { class: 'section-title' }, 'Danger zone'),
    h('div', { class: 'card stack pad' },
      h('p', { class: 'sub' }, 'Deletes every workout, measurement and photo stored in the app. Your exercise library is kept. Save a backup first.'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!(await confirmDialog('Erase all workouts, measurements and photos from this app? This can’t be undone.', { ok: 'Erase everything', danger: true }))) return;
        await eraseAll();
        toast('All data erased');
        clear(root); renderData(root);
      } }, 'Erase all data'))));
}
