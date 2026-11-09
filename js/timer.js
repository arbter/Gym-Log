// Rest timer. Based on an end timestamp so it stays correct if the page is throttled.
import { h, clear, duration, lsGet, lsSet } from './util.js';

export const settings = {
  get auto() { return lsGet('autoRest', true); },
  set auto(v) { lsSet('autoRest', v); },
  get seconds() { return lsGet('restSeconds', 90); },
  set seconds(v) { lsSet('restSeconds', v); },
};

let end = null, total = 0, interval = null, wakeLock = null, audio = null;
const bar = h('div', { class: 'rest-bar', hidden: true });
export const mountTimer = (parent) => parent.append(bar);

/** Call from a tap handler so iOS lets us play the finish sound later. */
export function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
}

function beep() {
  try {
    if (!audio) return;
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      const t = audio.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    }
  } catch { /* ignore */ }
  navigator.vibrate?.([200, 100, 200]);
}

async function lock() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* denied */ } }
function unlock() { try { wakeLock?.release(); } catch { /* ignore */ } wakeLock = null; }

export function isRunning() { return end != null; }

export function start(seconds) {
  unlockAudio();
  total = seconds; end = Date.now() + seconds * 1000;
  clearInterval(interval); interval = setInterval(tick, 250);
  lock(); render(); tick();
}
export function add(seconds) {
  if (end == null) return;
  end += seconds * 1000; total = Math.max(total, Math.ceil((end - Date.now()) / 1000));
  tick();
}
export function cancel() {
  end = null; clearInterval(interval); unlock(); bar.hidden = true;
}

function finish() {
  cancel(); beep();
  bar.hidden = false; bar.classList.add('done');
  clear(bar).append(h('span', { class: 'rest-time' }, 'Rest over — next set'));
  setTimeout(() => { bar.classList.remove('done'); if (end == null) bar.hidden = true; }, 3500);
}

function tick() {
  if (end == null) return;
  const remaining = (end - Date.now()) / 1000;
  if (remaining <= 0) { finish(); return; }
  const t = bar.querySelector('.rest-time'), f = bar.querySelector('.rest-fill');
  if (t) t.textContent = duration(Math.ceil(remaining));
  if (f) f.style.width = `${Math.max(0, Math.min(100, (remaining / total) * 100))}%`;
}

function render() {
  bar.hidden = false; bar.classList.remove('done');
  clear(bar).append(
    h('div', { class: 'rest-row' },
      h('span', { class: 'rest-icon' }, '⏱'),
      h('span', { class: 'rest-time' }, duration(total)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => add(-15) }, '−15'),
      h('button', { class: 'btn small', onclick: () => add(15) }, '+15'),
      h('button', { class: 'btn small primary', onclick: cancel }, 'Skip')),
    h('div', { class: 'rest-track' }, h('div', { class: 'rest-fill' })));
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (end != null) { lock(); tick(); } }
});
