import { h, num, fmtDate } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k != null) el.append(k);
  return el;
};

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

/** points: [{t: ms, v: number}] sorted by time. Returns a DOM node. */
export function lineChart(points, { unit = '', height = 230 } = {}) {
  const W = 360, H = height, L = 42, R = 12, T = 10, B = 26;
  const wrap = h('div', { class: 'chart' });
  const readout = h('div', { class: 'readout' }, ' ');
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img' });
  wrap.append(readout, svg);
  if (points.length < 2) return wrap;

  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const vs = points.map((p) => p.v);
  const { lo, hi, ticks } = niceTicks(Math.min(...vs), Math.max(...vs));
  const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);

  for (const tk of ticks) {
    svg.append(s('line', { x1: L, x2: W - R, y1: y(tk), y2: y(tk), class: 'grid' }));
    const label = s('text', { x: L - 6, y: y(tk) + 4, class: 'axis', 'text-anchor': 'end' });
    label.textContent = num(tk);
    svg.append(label);
  }
  const xt = 4;
  for (let i = 0; i <= xt; i++) {
    const t = t0 + ((t1 - t0) * i) / xt;
    const label = s('text', { x: x(t), y: H - 7, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === xt ? 'end' : 'middle' });
    label.textContent = new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    svg.append(label);
  }

  svg.append(s('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(''), class: 'line' }));
  if (points.length <= 80) for (const p of points) svg.append(s('circle', { cx: x(p.t), cy: y(p.v), r: 2.8, class: 'dot' }));

  const cross = s('line', { y1: T, y2: H - B, class: 'cross', visibility: 'hidden' });
  const mark = s('circle', { r: 5, class: 'mark', visibility: 'hidden' });
  svg.append(cross, mark);

  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = points[0], bd = Infinity;
    for (const p of points) { const d = Math.abs(x(p.t) - px); if (d < bd) { bd = d; best = p; } }
    cross.setAttribute('x1', x(best.t)); cross.setAttribute('x2', x(best.t)); cross.setAttribute('visibility', 'visible');
    mark.setAttribute('cx', x(best.t)); mark.setAttribute('cy', y(best.v)); mark.setAttribute('visibility', 'visible');
    readout.textContent = `${fmtDate(best.t)} · ${num(best.v)} ${unit}`.trim();
  };
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointermove', (e) => { if (e.pressure > 0 || e.pointerType === 'mouse') show(e.clientX); });
  const last = points[points.length - 1];
  readout.textContent = `Latest: ${num(last.v)} ${unit}`.trim();
  return wrap;
}

/** Horizontal bars: rows [{label, value}] */
export function barList(rows, { suffix = '' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return h('div', { class: 'bars' }, rows.map((r) => h('div', { class: 'bar-row' },
    h('span', { class: 'bar-label' }, r.label),
    h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill', style: { width: `${(r.value / max) * 100}%` } })),
    h('span', { class: 'bar-val' }, num(r.value) + suffix))));
}
