import { h, clear, num, startOfDay, kindInfo, KINDS } from './util.js';
import { S, measurementsOf, e1rm, isTimed, groupOf } from './store.js';
import { segmented } from './ui.js';
import { lineChart, barList } from './charts.js';
import { pickExercise } from './picker.js';
import { header } from './workouts.js';

const RANGES = [{ value: '3M', label: '3M', months: 3 }, { value: '6M', label: '6M', months: 6 }, { value: '1Y', label: '1Y', months: 12 }, { value: 'All', label: 'All', months: null }];
const cutoff = (r) => {
  const m = RANGES.find((x) => x.value === r).months;
  if (!m) return null;
  const d = new Date(); d.setMonth(d.getMonth() - m); return d.getTime();
};

const state = { mode: 'Lifts', range: '1Y', exercise: 'Barbell Bench Press', metric: 'Est. 1RM', kind: 'Body weight' };

export function renderProgress(root) {
  const content = h('div', { class: 'stack' });
  const draw = () => {
    clear(content);
    if (state.mode === 'Lifts') lifts(content, draw);
    else if (state.mode === 'Muscles') muscles(content);
    else bodyMetrics(content);
  };
  root.append(
    header('Progress'),
    h('div', { class: 'stack' },
      segmented(['Lifts', 'Muscles', 'Body'], state.mode, (v) => { state.mode = v; draw(); }),
      segmented(RANGES, state.range, (v) => { state.range = v; draw(); }),
      content));
  draw();
}

function stat(title, value) { return h('div', { class: 'stat' }, h('div', { class: 'stat-v num' }, value), h('div', { class: 'sub' }, title)); }

function lifts(el, redraw) {
  const sets = [];
  for (const w of S.workouts) for (const s of w.sets) if (s.exercise === state.exercise) sets.push({ ...s, date: w.date });
  sets.sort((a, b) => a.date - b.date);

  const byDay = new Map();
  for (const s of sets) {
    const k = startOfDay(s.date);
    const d = byDay.get(k) || { t: k, e1rm: 0, top: 0, volume: 0, reps: 0 };
    const est = e1rm(s);
    if (est) d.e1rm = Math.max(d.e1rm, est);
    if (s.weight) d.top = Math.max(d.top, s.weight);
    d.volume += (s.weight || 0) * (s.reps || 0);
    d.reps = Math.max(d.reps, s.reps || 0);
    byDay.set(k, d);
  }
  const sessions = [...byDay.values()].sort((a, b) => a.t - b.t);
  const bodyweightOnly = sessions.length && sessions.every((s) => s.top === 0);
  const metrics = { 'Est. 1RM': ['e1rm', 'lb'], 'Top weight': ['top', 'lb'], Volume: ['volume', 'lb'], 'Best reps': ['reps', 'reps'] };
  if (bodyweightOnly && state.metric !== 'Best reps') state.metric = 'Best reps';
  const [key, unit] = metrics[state.metric];
  const c = cutoff(state.range);
  const pts = sessions.filter((s) => (c == null || s.t >= c) && s[key] > 0).map((s) => ({ t: s.t, v: s[key] }));

  const heaviest = sets.filter((s) => s.weight && s.reps).sort((a, b) => b.weight - a.weight || b.reps - a.reps)[0];
  const best1rm = Math.max(0, ...sessions.map((s) => s.e1rm));

  el.append(
    h('button', { class: 'picker-btn', onclick: async () => { const p = await pickExercise({ title: 'Choose lift', allowCreate: false }); if (p) { state.exercise = p.name; redraw(); } } },
      h('span', {}, state.exercise), h('span', { class: 'sub' }, '⌄')),
    segmented(Object.keys(metrics), state.metric, (v) => { state.metric = v; redraw(); }),
    h('div', { class: 'card pad' }, pts.length >= 2 ? lineChart(pts, { unit }) : h('p', { class: 'sub center' }, 'Not enough sessions in this range for this metric.')),
    h('div', { class: 'stats' },
      stat('Sessions', sessions.length),
      stat('Best est. 1RM', best1rm ? `${Math.round(best1rm)} lb` : '—'),
      stat('Heaviest set', heaviest ? `${num(heaviest.weight)} × ${heaviest.reps}` : '—')));
}

function muscles(el) {
  const c = cutoff(state.range);
  const counts = new Map();
  let first = Infinity;
  for (const w of S.workouts) {
    if (c != null && w.date < c) continue;
    for (const s of w.sets) {
      const g = groupOf(s.exercise);
      if (g === 'Cardio') continue;
      counts.set(g, (counts.get(g) || 0) + 1);
      first = Math.min(first, w.date);
    }
  }
  if (!counts.size) { el.append(h('p', { class: 'sub center pad' }, 'No sets in this range.')); return; }
  const weeks = Math.max(1, (Date.now() - (c ?? first)) / (7 * 86400000));
  const rows = [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  el.append(
    h('h3', { class: 'section-title' }, 'Working sets per muscle group'),
    h('div', { class: 'card pad' }, barList(rows)),
    h('h3', { class: 'section-title' }, 'Average per week'),
    h('div', { class: 'card list' }, rows.map((r) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, r.label), h('span', { class: 'num sub' }, `${(r.value / weeks).toFixed(1)} sets/wk`)))));
}

function bodyMetrics(el) {
  const k = kindInfo(state.kind);
  const c = cutoff(state.range);
  const pts = measurementsOf(k.name).filter((m) => c == null || m.date >= c).map((m) => ({ t: m.date, v: m.value }));
  el.append(
    h('label', {}, 'Measurement', h('select', { onchange: (e) => { state.kind = e.target.value; clear(el); bodyMetrics(el); } },
      KINDS.filter((x) => x.name !== 'Height').map((x) => h('option', { value: x.name, selected: x.name === state.kind }, x.name)))),
    h('div', { class: 'card pad' }, pts.length >= 2 ? lineChart(pts, { unit: k.unit }) : h('p', { class: 'sub center' }, `Log at least two ${k.name.toLowerCase()} entries in this range.`)));
  if (pts.length >= 2) {
    const vs = pts.map((p) => p.v), diff = pts.at(-1).v - pts[0].v;
    el.append(h('div', { class: 'stats' },
      stat('Latest', `${num(pts.at(-1).v)} ${k.unit}`),
      stat('Change', `${diff >= 0 ? '+' : '−'}${num(Math.abs(diff))}`),
      stat('Low / High', `${num(Math.min(...vs))} / ${num(Math.max(...vs))}`)));
  }
}
