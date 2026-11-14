// Short, subtle vibration for moves.
//
// Android: navigator.vibrate works.
// iPhone: Safari has no vibration API, but since iOS 18 toggling a native switch
// control (<input type="checkbox" switch>) plays the system's light haptic tap.
// iOS only allows it while handling a real gesture, and finger-down doesn't count,
// so a haptic asked for during finger-down is held until the finger lifts.
import { store } from './store.js?v=9c8568e0e8';

const KEY = 'magnus.haptics';
let enabled = store.get(KEY, true);

export const hapticsEnabled = () => enabled;
export function setHaptics(on) {
  enabled = on;
  store.set(KEY, on);
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);

function iosTap() {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

// Are we inside a finger-down handler right now?
let inPointerDown = false;
let pending = null;
document.addEventListener('pointerdown', () => {
  inPointerDown = true;
  setTimeout(() => { inPointerDown = false; }, 0);
}, { capture: true, passive: true });
const flush = () => {
  if (!pending) return;
  const p = pending;
  pending = null;
  if (performance.now() - p.at < 1200) fireIOS(p.taps);
};
const lift = () => { inPointerDown = false; flush(); };
document.addEventListener('pointerup', lift, { capture: true, passive: true });
document.addEventListener('touchend', lift, { capture: true, passive: true });
document.addEventListener('click', flush, { capture: true, passive: true });

function fireIOS(taps) {
  try { iosTap(); } catch { /* not supported */ }
  if (taps > 1) setTimeout(() => { try { iosTap(); } catch { /* ignore */ } }, 90);
}

// kind: 'move' (yours), 'opponent', 'capture', 'success', 'error'
export function haptic(kind = 'move') {
  if (!enabled) return;
  const patterns = { move: 8, opponent: 6, capture: 14, success: [10, 60, 14], error: [18, 40, 18] };
  try {
    if (navigator.vibrate) {
      navigator.vibrate(patterns[kind] ?? 8);
      return;
    }
  } catch {
    /* blocked by the browser */
  }
  if (!isIOS) return;
  const taps = kind === 'success' || kind === 'error' ? 2 : 1;
  if (inPointerDown) pending = { taps, at: performance.now() };
  else fireIOS(taps); // opponent moves have no gesture behind them, so iOS may stay silent
}
