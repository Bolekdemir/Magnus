// Short, subtle vibration for moves.
// Android browsers support navigator.vibrate. iPhone Safari does not; on iOS 18+
// toggling a native switch control gives a light system tap, which only works
// while handling the user's own touch, so opponent moves stay silent there.
import { store } from './store.js';

const KEY = 'magnus.haptics';
let enabled = store.get(KEY, true);
let iosSwitch = null;

export const hapticsEnabled = () => enabled;
export function setHaptics(on) {
  enabled = on;
  store.set(KEY, on);
}

function iosTap() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-10px;top:-10px';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
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
  if (kind !== 'opponent') {
    try { iosTap(); } catch { /* not supported */ }
  }
}
