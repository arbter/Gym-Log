// Automatic backups to a folder the user picks on their device.
// Uses the File System Access API (Chrome/Edge on Android and computers). Safari on iPhone doesn't
// let web apps write to a folder by themselves, so there the app falls back to frequent reminders
// with a one-tap "Save backup" (iOS's share sheet → Save to Files).
import * as db from './db.js';
import { S, setMeta, buildBackup, exportBackup, importBackup } from './store.js';
import { debounce } from './util.js';

export const FILE_NAME = 'gymlog-backup.json';
const KEEP_DAILY = 7;               // older copies, one per day, kept next to the main file
const REMIND_DAYS = 3;              // without folder support: nudge this long after the last backup
export const supported = typeof window.showDirectoryPicker === 'function';

const listeners = new Set();
let status = 'off';                 // off | saving | saved | needs-permission | error
let lastError = '';
let dirty = false;

/** Re-render hooks for views that show the auto-save state. */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const setStatus = (s, err = '') => { status = s; lastError = err; for (const fn of listeners) fn(); };

export const getStatus = () => ({ status, error: lastError, folder: S.meta.autoDir?.name || '', lastSaved: S.meta.lastAutoSave || null });
export const includePhotos = () => S.meta.autoPhotos !== false;
export const enabled = () => supported && !!S.meta.autoDir;

const dayStamp = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

async function permission(handle, ask) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  if (!ask) return false;
  return (await handle.requestPermission?.(opts)) === 'granted';
}

async function readBackup(dir, name = FILE_NAME) {
  try { return await (await dir.getFileHandle(name)).getFile(); } catch { return null; }
}

async function writeFile(dir, name, blob) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(blob);
  await w.close();
}

/** Before the main file is overwritten on a new day, keep yesterday's version as a dated copy. */
async function rotate(dir) {
  const old = await readBackup(dir);
  if (!old || dayStamp(old.lastModified) === dayStamp(Date.now())) return;
  const name = `gymlog-backup-${dayStamp(old.lastModified)}.json`;
  if (!(await readBackup(dir, name))) await writeFile(dir, name, old);
  const dated = [];
  for await (const [n] of dir.entries()) if (/^gymlog-backup-\d{4}-\d\d-\d\d\.json$/.test(n)) dated.push(n);
  dated.sort().reverse();
  for (const n of dated.slice(KEEP_DAILY)) await dir.removeEntry(n).catch(() => {});
}

let saving = null;
/** Writes the backup file now. `ask` may show a permission prompt, so pass it only from a tap. */
export async function saveNow(ask = false) {
  const dir = S.meta.autoDir;
  if (!supported || !dir) return false;
  if (saving) { await saving; if (!dirty) return true; }
  saving = (async () => {
    try {
      if (!(await permission(dir, ask))) { setStatus('needs-permission'); return false; }
      setStatus('saving');
      dirty = false;
      await rotate(dir);
      await writeFile(dir, FILE_NAME, await buildBackup(includePhotos()));
      const now = Date.now();
      await setMeta('lastAutoSave', now);
      await setMeta('lastBackup', now);
      setStatus('saved');
      return true;
    } catch (err) {
      dirty = true;
      console.error(err);
      setStatus('error', err.message || String(err));
      return false;
    } finally { saving = null; }
  })();
  return saving;
}

const schedule = debounce(() => { saveNow(false); }, 3000);

function changed() {
  dirty = true;
  setMeta('lastChange', Date.now());
  if (!enabled()) return;
  if (document.visibilityState === 'hidden') schedule.flush();   // app is going to the background
  else schedule();
}

/** Lets the user pick the folder. Offers to restore if that folder already holds a newer backup. */
export async function chooseFolder({ confirm } = {}) {
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'gymlog-backups', mode: 'readwrite', startIn: 'documents' }); } catch (err) {
    if (err.name === 'AbortError') return { cancelled: true };
    throw err;
  }
  if (!(await permission(dir, true))) throw new Error('Gym Log needs permission to save in that folder.');
  let restored = null;
  const existing = await readBackup(dir);
  if (existing) {
    try {
      const text = await existing.text();
      const data = JSON.parse(text);
      if (data.app === 'gymlog' && data.workouts?.length > S.workouts.length && confirm
        && await confirm(`This folder already has a backup with ${data.workouts.length} workouts (the app has ${S.workouts.length}). Restore it into the app first?`)) {
        restored = await importBackup(text);
      }
    } catch { /* not a readable backup; it will be replaced */ }
  }
  await setMeta('autoDir', dir);
  await saveNow(false);
  return { folder: dir.name, restored };
}

export async function turnOff() {
  await setMeta('autoDir', null);
  setStatus('off');
}

export async function setIncludePhotos(v) {
  await setMeta('autoPhotos', v);
  if (enabled()) schedule();
}

/** Small banner for the Workouts screen, or null when nothing needs attention. */
export function nudgeInfo() {
  if (enabled()) {
    if (status === 'needs-permission') return { kind: 'permission', text: 'Auto-save is paused until you allow it again. Tap to resume →' };
    if (status === 'error') return { kind: 'error', text: 'Auto-save couldn’t write to your backup folder. Tap to check →' };
    return null;
  }
  const last = S.meta.lastBackup;
  const days = last ? (Date.now() - last) / 86400000 : Infinity;
  const changedSince = !last || (S.meta.lastChange || 0) > last;
  if (S.workouts.length === 0 && S.measurements.length === 0) return null;
  if (days < REMIND_DAYS || !changedSince) return null;
  const when = last ? `Last backup ${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} ago.` : 'You haven’t backed up yet.';
  return { kind: 'backup', text: `${when} Tap to save a backup to Files →` };
}

/** One-tap manual backup through the share sheet (used where folder auto-save isn't available). */
export async function shareBackup(saveFile) {
  await saveFile(`gymlog-backup-${dayStamp(Date.now())}.json`, await exportBackup(includePhotos()));
}

export async function initAutosave() {
  db.onWrite(changed);
  const flush = () => { if (dirty && enabled()) { schedule.flush(); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  if (!enabled()) return;
  // Check the folder is still reachable; browsers often reset the permission after a restart.
  if (await permission(S.meta.autoDir, false)) setStatus('saved');
  else setStatus('needs-permission');
}
