import { h, clear, fmtDate, fmtDateTime } from './util.js';
import { S, exportCSVs, exportBackup, importBackup, eraseAll, importLogbookCSV } from './store.js';
import { confirmDialog, saveFile, toast } from './ui.js';
import { header } from './workouts.js';
import * as autosave from './autosave.js';

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

    h('h3', { class: 'section-title' }, 'Auto-save'),
    autoSaveCard(root),

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

function autoSaveCard(root) {
  const rerender = () => { clear(root); renderData(root); };
  const photos = h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: autosave.includePhotos(), onchange: (e) => autosave.setIncludePhotos(e.target.checked) }),
    'Include photos (larger file)');

  if (!autosave.supported) {
    return h('div', { class: 'card stack pad' },
      h('p', { class: 'sub' }, 'This browser doesn’t let web apps save to a folder on their own (Safari on iPhone and iPad doesn’t allow it). Instead, Gym Log reminds you on the Workouts screen once you’ve logged something new and your last backup is 3 days old. One tap opens the share sheet: choose Save to Files and pick the same folder (for example a Gym Log folder in iCloud Drive). Files remembers the folder you used last time.'),
      photos);
  }

  const st = autosave.getStatus();
  const card = h('div', { class: 'card stack pad' });
  const choose = async () => {
    try {
      const r = await autosave.chooseFolder({ confirm: (msg) => confirmDialog(msg, { ok: 'Restore' }) });
      if (r.cancelled) return;
      toast(r.restored ? `Restored ${r.restored.workouts} workouts. Auto-saving to “${r.folder}”` : `Auto-saving to “${r.folder}”`);
    } catch (err) { toast(err.message || 'Couldn’t use that folder'); }
    rerender();
  };

  if (!autosave.enabled()) {
    card.append(
      h('p', { class: 'sub' }, `Pick a folder on this device and Gym Log will keep ${autosave.FILE_NAME} there up to date every time you change something, plus a copy for each of the last 7 days. If the app’s storage is ever cleared, choose the same folder again to get everything back.`),
      photos,
      h('button', { class: 'btn primary', onclick: choose }, 'Choose backup folder…'));
    return card;
  }

  const line = {
    saving: 'Saving…',
    saved: st.lastSaved ? `Saved ${fmtDateTime(st.lastSaved)}` : 'On',
    'needs-permission': 'Paused: tap Resume to allow saving again',
    error: `Couldn’t save: ${st.error}`,
    off: 'On',
  }[st.status];
  const unsub = autosave.subscribe(() => { if (!card.isConnected) { unsub(); return; } rerender(); });
  card.append(
    h('p', {}, 'Saving to folder “', st.folder, '”'),
    h('p', { class: 'sub' }, line, '. The file is ', autosave.FILE_NAME, ', with a copy for each of the last 7 days.'),
    photos,
    st.status === 'needs-permission' || st.status === 'error'
      ? h('button', { class: 'btn primary', onclick: async () => { if (await autosave.saveNow(true)) toast('Auto-save resumed'); rerender(); } }, 'Resume auto-save')
      : h('button', { class: 'btn', onclick: async () => { if (await autosave.saveNow(true)) toast('Saved'); rerender(); } }, 'Save now'),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn', onclick: choose }, 'Change folder…'),
      h('button', { class: 'btn', onclick: async () => { await autosave.turnOff(); toast('Auto-save turned off'); rerender(); } }, 'Turn off')));
  return card;
}
