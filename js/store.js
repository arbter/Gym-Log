// In-memory data model backed by IndexedDB. Everything is loaded at startup (a few thousand rows)
// so views can query synchronously.
import * as db from './db.js';
import { csvEscape, duration, num, debounce, kindInfo, dayKey } from './util.js';

export const S = { workouts: [], measurements: [], exercises: [], photos: [], meta: {} };

export async function init() {
  await db.open();
  S.workouts = await db.getAll('workouts');
  S.measurements = await db.getAll('measurements');
  S.exercises = await db.getAll('exercises');
  S.photos = await db.getAll('photos');
  S.meta = Object.fromEntries((await db.getAll('meta')).map((m) => [m.key, m.value]));

  // Optional bundled history (not included in the public build; see README).
  if (!S.meta.seeded) { try { await importSeed(); } catch { /* no bundled history */ } await setMeta('seeded', true); }
  if (!S.meta.library) { await seedLibrary(); await setMeta('library', true); }
  await ensureExercises();
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}

export async function setMeta(key, value) {
  S.meta[key] = value;
  await db.put('meta', { key, value });
}

// ---------- seed / library ----------

async function fetchJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path}`);
  return r.json();
}

export async function importSeed() {
  const seed = await fetchJSON('data/seed.json');
  const workouts = seed.workouts.map((w) => ({
    name: w.name,
    date: new Date(w.start).getTime(),
    end: w.end ? new Date(w.end).getTime() : null,
    note: '',
    sets: w.sets.map((s) => ({
      exercise: s.exercise, order: s.order, setNumber: s.setNumber,
      reps: s.reps, weight: s.weight, seconds: s.seconds,
      distance: s.distance, distanceUnit: s.distanceUnit, note: s.note || '',
    })),
  }));
  const measurements = seed.measurements
    .filter((m) => kindInfo(m.kind).unit)
    .map((m) => ({ date: new Date(m.date).getTime(), kind: m.kind, value: m.value }));
  await db.putMany('workouts', workouts);
  await db.putMany('measurements', measurements);
  S.workouts.push(...workouts);
  S.measurements.push(...measurements);
  return { workouts: workouts.length, measurements: measurements.length };
}

async function seedLibrary() {
  const lib = await fetchJSON('data/exercise_library.json');
  const have = new Set(S.exercises.map((e) => e.name));
  const add = lib.filter((e) => !have.has(e.name)).map((e) => ({ name: e.name, group: e.group, timed: e.timed }));
  await db.putMany('exercises', add);
  S.exercises.push(...add);
}

/** Every logged exercise gets a library entry (group "Other" if unknown). */
export async function ensureExercises() {
  const have = new Set(S.exercises.map((e) => e.name));
  const add = [];
  for (const w of S.workouts) {
    for (const s of w.sets) {
      if (!have.has(s.exercise)) {
        have.add(s.exercise);
        add.push({ name: s.exercise, group: 'Other', timed: s.seconds != null || s.distance != null });
      }
    }
  }
  if (add.length) { await db.putMany('exercises', add); S.exercises.push(...add); }
}

export async function eraseAll() {
  await db.clearStore('workouts'); await db.clearStore('measurements'); await db.clearStore('photos');
  S.workouts = []; S.measurements = []; S.photos = [];
}

// ---------- workouts ----------

const pending = new Map();
const flushPending = () => {
  for (const [, w] of pending) db.put('workouts', w).then((id) => { if (w.id == null) w.id = id; });
  pending.clear();
};
const scheduleFlush = debounce(flushPending, 400);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPending(); });
addEventListener('pagehide', flushPending);

/** Queue a debounced write of a workout that is being edited in place. */
export function touchWorkout(w) { pending.set(w.id ?? w, w); scheduleFlush(); }

export async function createWorkout(w) {
  w.id = await db.put('workouts', w);
  S.workouts.push(w);
  return w;
}
export async function removeWorkout(w) {
  pending.delete(w.id);
  await db.del('workouts', w.id);
  S.workouts = S.workouts.filter((x) => x !== w);
}
export const getWorkout = (id) => S.workouts.find((w) => w.id === Number(id));
export const sortedWorkouts = () => [...S.workouts].sort((a, b) => b.date - a.date);

export function exerciseGroups(w) {
  const map = new Map();
  for (const s of [...w.sets].sort((a, b) => a.order - b.order || a.setNumber - b.setNumber)) {
    if (!map.has(s.order)) map.set(s.order, { order: s.order, name: s.exercise, sets: [] });
    map.get(s.order).sets.push(s);
  }
  return [...map.values()];
}

export const isTimed = (s) => s.seconds != null || s.distance != null;
export const volume = (w) => w.sets.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
export const e1rm = (s) => (!s.weight || s.weight <= 0 || !s.reps || s.reps <= 0 ? null : s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30));

export function setSummary(s) {
  if (isTimed(s)) {
    const parts = [];
    if (s.seconds != null) parts.push(duration(s.seconds));
    if (s.distance != null) parts.push(`${num(s.distance)} ${s.distanceUnit || ''}`.trim());
    return parts.join(' · ');
  }
  const r = s.reps ?? '–';
  return s.weight != null ? `${num(s.weight)} × ${r}` : `BW × ${r}`;
}

/** Most recent earlier session containing `exercise`. */
export function lastTime(exercise, beforeMs, excludeWorkout) {
  let best = null;
  for (const w of S.workouts) {
    if (w === excludeWorkout || w.date >= beforeMs) continue;
    if (best && w.date <= best.date) continue;
    if (w.sets.some((s) => s.exercise === exercise)) best = w;
  }
  if (!best) return null;
  return { date: best.date, sets: best.sets.filter((s) => s.exercise === exercise).sort((a, b) => a.setNumber - b.setNumber) };
}

export function exerciseCounts() {
  const c = new Map();
  for (const w of S.workouts) for (const s of w.sets) c.set(s.exercise, (c.get(s.exercise) || 0) + 1);
  return c;
}

export const getExercise = (name) => S.exercises.find((e) => e.name === name);
export const groupOf = (name) => getExercise(name)?.group || 'Other';

export async function saveExercise(e) {
  await db.put('exercises', e);
  if (!S.exercises.includes(e)) S.exercises.push(e);
}

// ---------- measurements ----------

export async function addMeasurement(m) {
  m.id = await db.put('measurements', m);
  S.measurements.push(m);
}
export async function removeMeasurement(m) {
  await db.del('measurements', m.id);
  S.measurements = S.measurements.filter((x) => x !== m);
}
export const measurementsOf = (kind) => S.measurements.filter((m) => m.kind === kind).sort((a, b) => a.date - b.date);

export function nearbyWeight(ms) {
  let best = null, bd = 10 * 86400000;
  for (const m of S.measurements) {
    if (m.kind !== 'Body weight') continue;
    const d = Math.abs(m.date - ms);
    if (d < bd) { bd = d; best = m.value; }
  }
  return best;
}

// ---------- photos ----------

export async function addPhoto(p) { p.id = await db.put('photos', p); S.photos.push(p); }
export const savePhoto = (p) => db.put('photos', p);
export async function removePhoto(p) { await db.del('photos', p.id); S.photos = S.photos.filter((x) => x !== p); }

// ---------- Fitness Logbook CSV import ----------

export function parseCSV(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const tsec = (s) => {
  if (!s) return null;
  const p = s.split(':').map(Number);
  if (p.some((n) => !Number.isFinite(n))) return null;
  return p.length === 2 ? p[0] * 60 + p[1] : p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : null;
};
const cleanName = (n) => (n || '').trim().replace(/\s+/g, ' ').replace(/\s*\(1\)$/, '') || 'Workout';
function clock(date, t) {
  const m = /(\d+):(\d+)\s*([AP]M)/i.exec(t || '');
  if (!m) return null;
  let hr = Number(m[1]) % 12; if (m[3].toUpperCase() === 'PM') hr += 12;
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, hr, Number(m[2])).getTime();
}

/** Merges a Fitness Logbook export (workouts and/or measurements CSV) into the app. Nothing is duplicated. */
export async function importLogbookCSV(text) {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  const head = rows[0] || [];
  if (head.includes('Workout Name')) return importWorkoutRows(head, rows.slice(1));
  if (head.includes('Item') && head.includes('Value')) return importMeasurementRows(head, rows.slice(1));
  throw new Error('Not a Fitness Logbook workouts or measurements CSV.');
}

async function importWorkoutRows(head, rows) {
  const col = (name, nth = 0) => { let k = -1; for (let i = 0; i <= nth; i++) k = head.indexOf(name, k + 1); return k; };
  const ix = { date: col('Date'), name: col('Workout Name'), start: col('Start'), finish: col('Finish'), ex: col('Exercise'), set: col('Set'),
    reps: col('Reps'), weight: col('Weight'), time: col('Time'), dist: col('Distance'), dunit: col('Unit', 1), exnote: col('Exercise Note') };
  const groups = new Map();
  for (const r of rows) {
    if (r.length < head.length - 1 || !r[ix.ex]) continue;     // skips a half-written last line
    const key = `${r[ix.date]}|${r[ix.start]}|${r[ix.name]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const existing = new Map(S.workouts.map((w) => [Math.round(w.date / 60000), w]));
  const add = [], replace = [];
  for (const rs of groups.values()) {
    const first = rs[0];
    const start = clock(first[ix.date], first[ix.start]) ?? new Date(`${first[ix.date]}T12:00:00`).getTime();
    let end = clock(first[ix.date], first[ix.finish]);
    if (end && end < start) end += 86400000;
    const order = new Map(), noted = new Set();
    const sets = rs.map((r) => {
      const ex = r[ix.ex].trim();
      if (!order.has(ex)) order.set(ex, order.size);
      const dist = r[ix.dist] ? Number(r[ix.dist]) : null;
      let note = '';
      if (r[ix.exnote] && !noted.has(ex)) { note = r[ix.exnote]; noted.add(ex); }
      return { exercise: ex, order: order.get(ex), setNumber: Number(r[ix.set]) || 1,
        reps: r[ix.reps] ? Number(r[ix.reps]) : null, weight: r[ix.weight] ? Number(r[ix.weight]) : null,
        seconds: tsec(r[ix.time]), distance: dist, distanceUnit: dist != null ? (r[ix.dunit] || '').trim() || null : null, note };
    });
    const w = { name: cleanName(first[ix.name]), date: start, end, note: '', sets };
    const have = existing.get(Math.round(start / 60000));
    if (!have) add.push(w);
    else if (sets.length > have.sets.length) replace.push([have, w]);   // e.g. an earlier, cut-off export
  }
  await db.putMany('workouts', add);
  S.workouts.push(...add);
  for (const [old, w] of replace) { old.name = w.name; old.end = w.end; old.sets = w.sets; await db.put('workouts', old); }
  await ensureExercises();
  return { kind: 'workouts', added: add.length, updated: replace.length, skipped: groups.size - add.length - replace.length };
}

async function importMeasurementRows(head, rows) {
  const di = head.indexOf('Date'), ii = head.indexOf('Item'), vi = head.indexOf('Value');
  const have = new Set(S.measurements.map((m) => `${m.kind}|${m.date}`));
  const add = [];
  for (const r of rows) {
    if (r.length < 3 || !kindInfo(r[ii]).unit) continue;        // ignores sleep/nutrition items
    const date = new Date(r[di].replace(' ', 'T')).getTime(), value = Number(r[vi]);
    if (!Number.isFinite(date) || !Number.isFinite(value) || have.has(`${r[ii]}|${date}`)) continue;
    have.add(`${r[ii]}|${date}`);
    add.push({ date, kind: r[ii], value });
  }
  await db.putMany('measurements', add);
  S.measurements.push(...add);
  return { kind: 'measurements', added: add.length };
}

// ---------- export / import ----------

export function exportCSVs() {
  const d2 = (n) => String(n).padStart(2, '0');
  const day = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`; };
  const clock = (ms) => { const d = new Date(ms); const hr = d.getHours(); return `${hr % 12 || 12}:${d2(d.getMinutes())} ${hr < 12 ? 'AM' : 'PM'}`; };
  let w = 'Date,Workout Name,Start,Finish,Exercise,Set,Reps,Weight,Unit,Time,Distance,Distance Unit,Note\n';
  for (const wk of [...S.workouts].sort((a, b) => a.date - b.date)) {
    for (const s of [...wk.sets].sort((a, b) => a.order - b.order || a.setNumber - b.setNumber)) {
      w += [day(wk.date), wk.name, clock(wk.date), wk.end ? clock(wk.end) : '', s.exercise, s.setNumber,
        s.reps ?? '', s.weight != null ? num(s.weight) : '', s.weight != null ? 'lb' : '',
        s.seconds != null ? duration(s.seconds) : '', s.distance != null ? num(s.distance) : '',
        s.distanceUnit || '', s.note || ''].map(csvEscape).join(',') + '\n';
    }
  }
  let m = 'Date,Item,Value,Unit\n';
  for (const x of [...S.measurements].sort((a, b) => a.date - b.date)) {
    const d = new Date(x.date);
    m += [`${day(x.date)} ${d2(d.getHours())}:${d2(d.getMinutes())}:${d2(d.getSeconds())}`, x.kind, num(x.value), kindInfo(x.kind).unit].map(csvEscape).join(',') + '\n';
  }
  return { workouts: w, measurements: m };
}

const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
const dataURLToBlob = async (u) => (await fetch(u)).blob();
// Photos rarely change, so their encoded form is kept to make repeated (auto-)backups cheap.
const dataURLCache = new WeakMap();
async function cachedDataURL(b) {
  if (!dataURLCache.has(b)) dataURLCache.set(b, await blobToDataURL(b));
  return dataURLCache.get(b);
}

/** The backup file's contents. Doesn't touch `lastBackup`. */
export async function buildBackup(includePhotos) {
  const out = {
    app: 'gymlog', version: 1, exportedAt: Date.now(),
    workouts: S.workouts, measurements: S.measurements, exercises: S.exercises, photos: [],
  };
  if (includePhotos) {
    for (const p of S.photos) {
      out.photos.push({ date: p.date, pose: p.pose, note: p.note, full: await cachedDataURL(p.full), thumb: await cachedDataURL(p.thumb) });
    }
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}

export async function exportBackup(includePhotos) {
  const blob = await buildBackup(includePhotos);
  await setMeta('lastBackup', Date.now());
  return blob;
}

/** Replaces workouts, measurements and exercises (and photos, if the backup includes them). */
export async function importBackup(text) {
  const data = JSON.parse(text);
  if (data.app !== 'gymlog') throw new Error('This is not a Gym Log backup file.');
  await db.clearStore('workouts'); await db.clearStore('measurements'); await db.clearStore('exercises');
  const strip = (o) => { const { id, ...rest } = o; return rest; };
  S.workouts = data.workouts.map(strip); S.measurements = data.measurements.map(strip); S.exercises = data.exercises;
  await db.putMany('workouts', S.workouts); await db.putMany('measurements', S.measurements); await db.putMany('exercises', S.exercises);
  if (data.photos?.length) {
    await db.clearStore('photos');
    S.photos = [];
    for (const p of data.photos) S.photos.push({ date: p.date, pose: p.pose, note: p.note, full: await dataURLToBlob(p.full), thumb: await dataURLToBlob(p.thumb) });
    await db.putMany('photos', S.photos);
  }
  await ensureExercises();
  return { workouts: S.workouts.length, measurements: S.measurements.length, photos: data.photos?.length || 0 };
}

export { dayKey };
