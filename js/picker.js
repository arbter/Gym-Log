import { h, clear, MUSCLES, plural } from './util.js';
import { S, exerciseCounts, saveExercise } from './store.js';
import { sheet, chips } from './ui.js';

/** Resolves to { name, timed } or null if dismissed. */
export function pickExercise({ title = 'Add exercise', allowCreate = true } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const counts = exerciseCounts();
    let query = '', group = 'All';

    sheet(title, (close) => {
      const list = h('div', { class: 'list' });
      const create = h('div', { class: 'stack create-box' });
      let newGroup = 'Other', newTimed = false;

      const choose = (name, timed) => { done({ name, timed }); close(); };

      const render = () => {
        const q = query.trim().toLowerCase();
        const items = S.exercises
          .filter((e) => (group === 'All' || e.group === group) && (!q || e.name.toLowerCase().includes(q)))
          .sort((a, b) => (counts.get(b.name) || 0) - (counts.get(a.name) || 0) || a.name.localeCompare(b.name));
        clear(list);
        for (const e of items) {
          list.append(h('button', { class: 'list-row', onclick: () => choose(e.name, e.timed) },
            h('span', { class: 'grow' }, h('div', {}, e.name), h('div', { class: 'sub' }, e.group)),
            counts.get(e.name) ? h('span', { class: 'sub' }, plural(counts.get(e.name), 'set')) : null));
        }
        if (!items.length) list.append(h('p', { class: 'sub pad' }, 'No matches.'));

        clear(create);
        const exists = S.exercises.some((e) => e.name.toLowerCase() === q);
        if (allowCreate && q && !exists) {
          const name = query.trim();
          create.append(
            h('div', { class: 'row gap wrap' },
              h('label', { class: 'grow' }, 'Muscle group',
                h('select', { onchange: (e) => { newGroup = e.target.value; } },
                  MUSCLES.map((m) => h('option', { value: m, selected: m === newGroup }, m)))),
              h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: newTimed, onchange: (e) => { newTimed = e.target.checked; } }), 'Timed / cardio')),
            h('button', {
              class: 'btn primary', onclick: async () => {
                const ex = { name, group: newGroup, timed: newTimed };
                await saveExercise(ex);
                choose(name, newTimed);
              },
            }, `Create “${name}”`));
        }
      };

      const search = h('input', {
        type: 'search', placeholder: allowCreate ? 'Search or create exercise' : 'Search exercises',
        oninput: (e) => { query = e.target.value; render(); },
      });
      render();
      return h('div', { class: 'stack' }, search,
        chips(['All', ...MUSCLES], 'All', (v) => { group = v; render(); }),
        create, list);
    }, { onClose: () => done(null) });
  });
}
