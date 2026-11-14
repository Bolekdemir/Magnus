// Motion helpers. Curves follow the strong ease-out / ease-in-out tokens in app.css.
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';

export function motionLevel() {
  const m = document.documentElement.dataset.motion || 'full';
  if (m === 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced';
  return m;
}
export const canMove = () => motionLevel() === 'full';
export const canFade = () => motionLevel() !== 'off';

// Apple-style spring (damping ratio + response) sampled into a CSS linear() easing.
const springCache = new Map();
export function spring(damping = 1, response = 0.4) {
  const key = damping + ':' + response;
  if (springCache.has(key)) return springCache.get(key);
  const w0 = (2 * Math.PI) / response;
  const zeta = damping;
  const x = (t) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  // settle time: when the curve stays within 0.1% of the target
  let settle = response * 2;
  for (let t = 0.05; t < 3; t += 0.01) {
    let ok = true;
    for (let u = t; u < t + 0.2; u += 0.02) if (Math.abs(1 - x(u)) > 0.001) { ok = false; break; }
    if (ok) { settle = t; break; }
  }
  const pts = [];
  const n = 40;
  for (let i = 0; i <= n; i++) pts.push(+x((settle * i) / n).toFixed(4));
  pts[n] = 1;
  let easing = `linear(${pts.join(', ')})`;
  if (!(window.CSS && CSS.supports && CSS.supports('transition-timing-function', 'linear(0, 1)'))) easing = EASE_OUT;
  const out = { easing, duration: Math.round(settle * 1000) };
  springCache.set(key, out);
  return out;
}

// Stagger children in with a small rise. Only for occasional surfaces.
export function staggerIn(nodes, { step = 40, rise = 8, duration = 320 } = {}) {
  if (!canFade()) return;
  const move = canMove();
  [...nodes].forEach((el, i) => {
    el.animate(
      [
        { opacity: 0, transform: move ? `translateY(${rise}px)` : 'none' },
        { opacity: 1, transform: 'none' },
      ],
      { duration, delay: i * step, easing: EASE_OUT, fill: 'backwards' },
    );
  });
}

// Swap content with a soft crossfade (blur masks the seam).
export function swapIn(el, { duration = 200 } = {}) {
  if (!canFade()) return;
  el.animate(
    [
      { opacity: 0, filter: 'blur(3px)', transform: canMove() ? 'translateY(4px)' : 'none' },
      { opacity: 1, filter: 'blur(0)', transform: 'none' },
    ],
    { duration, easing: EASE_OUT },
  );
}

export function shake(el) {
  if (!canMove()) return;
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
    { duration: 320, easing: EASE_OUT },
  );
}

export function pop(el, { scale = 0.92 } = {}) {
  if (!canFade()) return;
  const s = spring(0.7, 0.45);
  el.animate(
    [{ opacity: 0, transform: canMove() ? `scale(${scale})` : 'none' }, { opacity: 1, transform: 'none' }],
    { duration: canMove() ? s.duration : 200, easing: canMove() ? s.easing : EASE_OUT },
  );
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
