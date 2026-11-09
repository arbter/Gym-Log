import { h, clear, KINDS, kindInfo, num, parseNum, fmtDate, toLocalInput, fromLocalInput } from './util.js';
import { S, measurementsOf, addMeasurement, removeMeasurement } from './store.js';
import { sheet, toast, confirmDialog, empty } from './ui.js';
import { lineChart } from './charts.js';
import { header } from './workouts.js';

export function renderBody(root) {
  const row = (k) => {
    const list = measurementsOf(k.name);
    const latest = list[list.length - 1], prev = list[list.length - 2];
    const delta = latest && prev ? latest.value - prev.value : null;
    return h('a', { class: 'list-row', href: `#/body/${encodeURIComponent(k.name)}` },
      h('span', { class: 'grow' }, h('div', {}, k.name), latest ? h('div', { class: 'sub' }, fmtDate(latest.date)) : null),
      latest
        ? h('span', { class: 'right' }, h('div', { class: 'strong num' }, `${num(latest.value)} ${k.unit}`),
          delta != null && Math.abs(delta) > 1e-6 ? h('div', { class: 'sub num' }, `${delta > 0 ? '+' : '−'}${num(Math.abs(delta))}`) : null)
        : h('span', { class: 'sub' }, '—'));
  };
  const group = (title, type) => [h('h3', { class: 'section-title' }, title), h('div', { class: 'card list' }, KINDS.filter((k) => k.type === type).map(row))];

  root.append(
    header('Body', h('button', { class: 'icon-btn accent', 'aria-label': 'Log measurements', onclick: () => logSheet(() => { clear(root); renderBody(root); }) }, '＋')),
    h('div', { class: 'stack' }, group('Weight & body fat', 'headline'), group('Circumferences', 'circ'), group('Other', 'other')));
}

export function renderKindHistory(root, kindName) {
  const k = kindInfo(kindName);
  const body = h('div', { class: 'stack' });
  const draw = () => {
    clear(body);
    const list = measurementsOf(k.name);
    if (list.length >= 2) body.append(h('div', { class: 'card pad' }, lineChart(list.map((m) => ({ t: m.date, v: m.value })), { unit: k.unit })));
    if (!list.length) { body.append(empty('No entries yet', 'Use ＋ on the Body tab to log one.')); return; }
    body.append(h('h3', { class: 'section-title' }, 'History'),
      h('div', { class: 'card list' }, [...list].reverse().map((m) => h('div', { class: 'list-row' },
        h('span', { class: 'grow' }, fmtDate(m.date)),
        h('span', { class: 'strong num' }, `${num(m.value)} ${k.unit}`),
        h('button', { class: 'icon-btn small', 'aria-label': 'Delete entry', onclick: async () => {
          if (await confirmDialog(`Delete ${num(m.value)} ${k.unit} from ${fmtDate(m.date)}?`, { ok: 'Delete', danger: true })) { await removeMeasurement(m); draw(); }
        } }, '✕')))));
  };
  root.append(header(k.name, null, h('a', { class: 'icon-btn', href: '#/body', 'aria-label': 'Back' }, '‹')), body);
  draw();
}

function logSheet(onSaved) {
  sheet('Log measurements', (close) => {
    const inputs = new Map();
    const field = (k) => {
      const last = measurementsOf(k.name).at(-1);
      const input = h('input', { class: 'field', inputmode: 'decimal', placeholder: last ? num(last.value) : k.unit, 'aria-label': k.name });
      inputs.set(k.name, input);
      return h('label', { class: 'form-row' }, h('span', { class: 'grow' }, k.name), input, h('span', { class: 'unit' }, k.unit));
    };
    const date = h('input', { type: 'datetime-local', value: toLocalInput(Date.now()) });
    return h('div', { class: 'stack' },
      h('label', {}, 'Date', date),
      h('h3', { class: 'section-title' }, 'Weight & body fat'), KINDS.filter((k) => k.type === 'headline').map(field),
      h('h3', { class: 'section-title' }, 'Circumferences'), KINDS.filter((k) => k.type === 'circ').map(field),
      h('p', { class: 'sub' }, 'Leave anything you didn’t measure blank. Grey numbers are your last entry.'),
      h('button', { class: 'btn primary', onclick: async () => {
        const t = fromLocalInput(date.value) || Date.now();
        let n = 0;
        for (const [name, input] of inputs) {
          const v = parseNum(input.value);
          if (v != null) { await addMeasurement({ date: t, kind: name, value: v }); n++; }
        }
        close(); toast(n ? `Saved ${n} measurement${n > 1 ? 's' : ''}` : 'Nothing to save'); onSaved();
      } }, 'Save'));
  });
}
