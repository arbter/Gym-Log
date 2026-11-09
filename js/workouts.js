import { h, clear, num, duration, parseDuration, parseNum, fmtMonth, fmtShort, fmtDate, plural, toLocalInput, fromLocalInput, MUSCLES } from './util.js';
import { S, sortedWorkouts, createWorkout, removeWorkout, getWorkout, touchWorkout, exerciseGroups, volume,
  lastTime, setSummary, groupOf, getExercise, saveExercise, isTimed } from './store.js';
import { sheet, confirmDialog, empty, toast } from './ui.js';
import { pickExercise } from './picker.js';
import * as timer from './timer.js';

// ---------- list ----------

export function renderWorkoutList(root) {
  let query = '';
  const listEl = h('div', { class: 'stack' });

  const draw = () => {
    clear(listEl);
    const q = query.trim().toLowerCase();
    const all = sortedWorkouts().filter((w) => !q || w.name.toLowerCase().includes(q) || w.sets.some((s) => s.exercise.toLowerCase().includes(q)));
    if (!all.length) { listEl.append(empty(S.workouts.length ? 'No matches' : 'No workouts yet', 'Tap + to start your first workout.')); return; }
    let month = '', card = null;
    for (const w of all) {
      const m = fmtMonth(w.date);
      if (m !== month) { month = m; listEl.append(h('h3', { class: 'section-title' }, m)); card = h('div', { class: 'card list' }); listEl.append(card); }
      const groups = exerciseGroups(w), vol = volume(w);
      card.append(h('a', { class: 'list-row', href: `#/workout/${w.id}` },
        h('span', { class: 'grow' },
          h('div', { class: 'strong' }, w.name),
          h('div', { class: 'sub' }, `${plural(groups.length, 'exercise')} · ${plural(w.sets.length, 'set')}${vol > 0 ? ` · ${Math.round(vol).toLocaleString()} lb` : ''}`)),
        h('span', { class: 'sub' }, fmtShort(w.date))));
    }
  };

  const recent = () => {
    const seen = new Set(), out = [];
    for (const w of sortedWorkouts()) {
      if (!w.sets.length) continue;
      const k = w.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k); out.push(w);
      if (out.length === 8) break;
    }
    return out;
  };

  const start = async (template) => {
    const w = { name: template?.name || 'Workout', date: Date.now(), end: null, note: '', sets: [] };
    if (template) {
      w.sets = template.sets.map((s) => ({ exercise: s.exercise, order: s.order, setNumber: s.setNumber, reps: s.reps, weight: s.weight,
        seconds: s.seconds, distance: s.distance, distanceUnit: s.distanceUnit, note: '' }));
    }
    await createWorkout(w);
    location.hash = `#/workout/${w.id}`;
  };

  const plus = () => sheet('Start a workout', (close) => h('div', { class: 'stack' },
    h('button', { class: 'btn primary', onclick: () => { close(); start(null); } }, 'Empty workout'),
    recent().length ? h('h3', { class: 'section-title' }, 'Repeat a recent workout') : null,
    h('div', { class: 'card list' }, recent().map((t) => h('button', { class: 'list-row', onclick: () => { close(); start(t); } },
      h('span', { class: 'grow' }, h('div', { class: 'strong' }, t.name), h('div', { class: 'sub' }, fmtDate(t.date))),
      h('span', { class: 'sub' }, plural(exerciseGroups(t).length, 'exercise')))))));

  root.append(
    header('Workouts', h('button', { class: 'icon-btn accent', 'aria-label': 'New workout', onclick: plus }, '＋')),
    backupNudge(),
    h('input', { type: 'search', class: 'search', placeholder: 'Search workout or exercise', oninput: (e) => { query = e.target.value; draw(); } }),
    listEl);
  draw();
}

export function header(title, right, left) {
  return h('div', { class: 'page-head' }, left || null, h('h1', {}, title), h('span', { class: 'spacer' }), right || null);
}

export function backupNudge() {
  const last = S.meta.lastBackup;
  const days = last ? (Date.now() - last) / 86400000 : Infinity;
  if (days < 14) return null;
  return h('a', { class: 'nudge', href: '#/data' }, last ? `Last backup ${Math.floor(days)} days ago.` : 'You haven’t backed up yet.', ' Tap to back up your data →');
}

// ---------- editor ----------

export function renderWorkoutEditor(root, id) {
  const w = getWorkout(id);
  if (!w) { root.append(empty('Workout not found'), h('a', { class: 'btn', href: '#/workouts' }, 'Back')); return; }
  const body = h('div', { class: 'stack' });
  const save = () => touchWorkout(w);

  const timerMenu = () => sheet('Rest timer', (close) => h('div', { class: 'stack' },
    h('div', { class: 'grid3' }, [30, 60, 90, 120, 180, 240].map((s) => h('button', { class: 'btn', onclick: () => { timer.start(s); close(); } }, duration(s)))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: timer.settings.auto, onchange: (e) => { timer.settings.auto = e.target.checked; } }), 'Start automatically when I add a set'),
    h('label', {}, 'Automatic rest length',
      h('select', { onchange: (e) => { timer.settings.seconds = Number(e.target.value); } },
        [30, 60, 90, 120, 180, 240].map((s) => h('option', { value: s, selected: s === timer.settings.seconds }, duration(s))))),
    timer.isRunning() ? h('button', { class: 'btn danger', onclick: () => { timer.cancel(); close(); } }, 'Stop timer') : null));

  const addSet = (g) => {
    const last = g.sets[g.sets.length - 1];
    w.sets.push({ exercise: g.name, order: g.order, setNumber: (last?.setNumber || 0) + 1, reps: last?.reps ?? null, weight: last?.weight ?? null,
      seconds: last?.seconds ?? null, distance: last?.distance ?? null, distanceUnit: last?.distanceUnit ?? null, note: '' });
    save(); draw();
    if (timer.settings.auto) timer.start(timer.settings.seconds); else timer.unlockAudio();
  };

  const addExercise = async () => {
    const pick = await pickExercise();
    if (!pick) return;
    const order = Math.max(-1, ...w.sets.map((s) => s.order)) + 1;
    w.sets.push({ exercise: pick.name, order, setNumber: 1, reps: null, weight: null, seconds: pick.timed ? 0 : null, distance: null, distanceUnit: null, note: '' });
    save(); draw();
  };

  const exerciseMenu = (g) => sheet(g.name, (close) => {
    const def = getExercise(g.name);
    return h('div', { class: 'stack' },
      h('label', {}, 'Muscle group',
        h('select', { onchange: async (e) => { const d = def || { name: g.name, group: 'Other', timed: false }; d.group = e.target.value; await saveExercise(d); draw(); } },
          MUSCLES.map((m) => h('option', { value: m, selected: m === groupOf(g.name) }, m)))),
      h('button', { class: 'btn danger', onclick: () => { w.sets = w.sets.filter((s) => s.order !== g.order); save(); close(); draw(); } }, 'Remove exercise from workout'));
  });

  const setRow = (g, s) => {
    const del = h('button', { class: 'icon-btn small', 'aria-label': 'Delete set', onclick: () => {
      w.sets = w.sets.filter((x) => x !== s);
      w.sets.filter((x) => x.order === g.order).sort((a, b) => a.setNumber - b.setNumber).forEach((x, i) => { x.setNumber = i + 1; });
      save(); draw();
    } }, '✕');
    const field = (cls, props) => h('input', { class: 'field ' + cls, ...props });
    if (isTimed(s)) {
      return h('div', { class: 'set-row' },
        h('span', { class: 'set-n' }, s.setNumber),
        field('', { placeholder: 'm:ss', inputmode: 'numeric', value: s.seconds != null ? duration(s.seconds) : '', onchange: (e) => { s.seconds = parseDuration(e.target.value); save(); }, 'aria-label': 'Time' }),
        field('', { placeholder: '0', inputmode: 'decimal', value: s.distance ?? '', oninput: (e) => { s.distance = parseNum(e.target.value); save(); }, 'aria-label': 'Distance' }),
        field('narrow', { placeholder: 'unit', value: s.distanceUnit || '', autocapitalize: 'none', oninput: (e) => { s.distanceUnit = e.target.value.trim() || null; save(); }, 'aria-label': 'Distance unit' }),
        del);
    }
    return h('div', { class: 'set-row' },
      h('span', { class: 'set-n' }, s.setNumber),
      h('div', { class: 'with-unit' }, field('', { placeholder: 'BW', inputmode: 'decimal', value: s.weight ?? '', oninput: (e) => { s.weight = parseNum(e.target.value); save(); }, 'aria-label': 'Weight' }), h('span', {}, 'lb')),
      h('span', { class: 'times' }, '×'),
      h('div', { class: 'with-unit' }, field('', { placeholder: 'reps', inputmode: 'numeric', value: s.reps ?? '', oninput: (e) => { const v = parseNum(e.target.value); s.reps = v == null ? null : Math.round(v); save(); }, 'aria-label': 'Reps' }), h('span', {}, 'reps')),
      del);
  };

  const draw = () => {
    clear(body);
    body.append(
      h('div', { class: 'card stack pad' },
        h('input', { class: 'title-input', value: w.name, placeholder: 'Workout name', oninput: (e) => { w.name = e.target.value; save(); } }),
        h('label', {}, 'Started',
          h('input', { type: 'datetime-local', value: toLocalInput(w.date), onchange: (e) => { const t = fromLocalInput(e.target.value); if (!Number.isNaN(t)) { w.date = t; save(); } } })),
        w.end ? h('div', { class: 'sub' }, `Duration ${Math.max(0, Math.round((w.end - w.date) / 60000))} min`) : null));

    for (const g of exerciseGroups(w)) {
      const last = lastTime(g.name, w.date, w);
      body.append(h('div', { class: 'card stack pad' },
        h('div', { class: 'row' },
          h('div', { class: 'grow' }, h('div', { class: 'strong' }, g.name), h('div', { class: 'sub' }, groupOf(g.name))),
          h('button', { class: 'icon-btn', 'aria-label': 'Exercise options', onclick: () => exerciseMenu(g) }, '⋯')),
        last ? h('div', { class: 'sub' }, `Last time (${fmtShort(last.date)}): ${last.sets.map(setSummary).join('  ·  ')}`) : null,
        g.sets.map((s) => setRow(g, s)),
        h('button', { class: 'btn', onclick: () => addSet(g) }, '＋ Add set')));
    }

    body.append(
      h('button', { class: 'btn primary', onclick: addExercise }, '＋ Add exercise'),
      h('div', { class: 'card stack pad' }, h('label', {}, 'Notes', h('textarea', { rows: 2, value: w.note || '', oninput: (e) => { w.note = e.target.value; save(); } }))),
      w.end
        ? h('button', { class: 'btn', onclick: () => { w.end = null; save(); draw(); } }, 'Reopen workout')
        : h('button', { class: 'btn primary', onclick: () => { w.end = Date.now(); save(); toast('Workout saved'); location.hash = '#/workouts'; } }, 'Finish workout'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (await confirmDialog('Delete this workout? This can’t be undone.', { ok: 'Delete', danger: true })) { await removeWorkout(w); location.hash = '#/workouts'; }
      } }, 'Delete workout'));
  };

  root.append(
    header(w.name || 'Workout', h('button', { class: 'icon-btn', 'aria-label': 'Rest timer', onclick: timerMenu }, '⏱'),
      h('a', { class: 'icon-btn', href: '#/workouts', 'aria-label': 'Back' }, '‹')),
    body);
  draw();
}
