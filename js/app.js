import { h, clear } from './util.js';
import { init } from './store.js';
import { mountTimer } from './timer.js';
import { renderWorkoutList, renderWorkoutEditor } from './workouts.js';
import { renderBody, renderKindHistory } from './body.js';
import { renderPhotos } from './photos.js';
import { renderProgress } from './progress.js';
import { renderData } from './data.js';
import { initAutosave } from './autosave.js';

const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  workouts: SVG('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  body: SVG('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'),
  photos: SVG('<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  progress: SVG('<path d="M3 20h18M5 16l4-5 4 3 6-8"/>'),
  data: SVG('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'),
};

const TABS = [
  { id: 'workouts', label: 'Workouts', icon: '🏋️' },
  { id: 'body', label: 'Body', icon: '📏' },
  { id: 'photos', label: 'Photos', icon: '📷' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'data', label: 'Data', icon: '💾' },
];

const main = document.getElementById('main');
const tabbar = document.getElementById('tabbar');

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'workouts').split('/');
  const tab = parts[0];
  clear(main);
  window.scrollTo(0, 0);
  const root = h('div', { class: 'page' });
  main.append(root);
  try {
    if (tab === 'workout' && parts[1]) renderWorkoutEditor(root, parts[1]);
    else if (tab === 'body' && parts[1]) renderKindHistory(root, decodeURIComponent(parts[1]));
    else if (tab === 'body') renderBody(root);
    else if (tab === 'photos') renderPhotos(root);
    else if (tab === 'progress') renderProgress(root);
    else if (tab === 'data') renderData(root);
    else renderWorkoutList(root);
  } catch (err) {
    console.error(err);
    root.append(h('pre', { class: 'error' }, String(err.stack || err)));
  }
  const active = tab === 'workout' ? 'workouts' : TABS.some((t) => t.id === tab) ? tab : 'workouts';
  for (const a of tabbar.children) a.classList.toggle('on', a.dataset.tab === active);
}

async function start() {
  for (const t of TABS) {
    tabbar.append(h('a', { href: `#/${t.id}`, 'data-tab': t.id, class: 'tab' }, h('span', { class: 'tab-icon', html: ICONS[t.id] }), h('span', {}, t.label)));
  }
  mountTimer(document.body);
  try {
    await init();
    await initAutosave();
  } catch (err) {
    console.error(err);
    main.replaceChildren(h('pre', { class: 'error' }, 'Could not start: ' + (err.stack || err)));
    return;
  }
  addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
