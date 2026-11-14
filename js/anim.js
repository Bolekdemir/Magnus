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

// Publish spring curves as CSS variables so stylesheets can use them:
// --sp (gentle overshoot), --sp-bouncy (playful), --sp-soft (settles, almost no overshoot).
export function installSprings() {
  const r = document.documentElement.style;
  const set = (name, d, resp) => {
    if (canMove()) {
      const s = spring(d, resp);
      r.setProperty(`--${name}`, s.easing);
      r.setProperty(`--${name}-d`, s.duration + 'ms');
    } else {
      r.setProperty(`--${name}`, EASE_OUT);
      r.setProperty(`--${name}-d`, canFade() ? '140ms' : '0ms');
    }
  };
  set('sp', 0.78, 0.38);
  set('sp-bouncy', 0.6, 0.42);
  set('sp-soft', 0.9, 0.3);
  set('sp-piece', 0.8, 0.3);
}

// Swap content: fades in while sliding up with a slight overshoot (blur masks the seam).
export function swapIn(el, { duration = 200 } = {}) {
  if (!canFade()) return;
  el.animate([{ opacity: 0, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }], { duration, easing: EASE_OUT });
  if (canMove()) {
    const s = spring(0.74, 0.4);
    el.animate([{ transform: 'translateY(10px) scale(0.985)' }, { transform: 'none' }], { duration: s.duration, easing: s.easing });
  }
}

// Squash on landing: a quick wide-and-short, then tall-and-thin, then settle.
export function squash(el, { amount = 0.07 } = {}) {
  if (!canMove()) return;
  const a = amount;
  el.animate(
    [{ scale: '1 1' }, { scale: `${1 + a} ${1 - a}`, offset: 0.3 }, { scale: `${1 - a * 0.4} ${1 + a * 0.4}`, offset: 0.62 }, { scale: '1 1' }],
    { duration: 300, easing: EASE_OUT },
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

// ---------- jelly press: squash down on press, stretch past and settle on release ----------
const PRESSABLE = '.btn, .ctrl, .icon-btn, .level, .way, .moment, .game-row, .seg button, .nav a, .mv, .toggle';
const held = new WeakMap();
export function installJelly(root = document) {
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(PRESSABLE);
    if (!el || !canMove() || el.disabled) return;
    const wide = el.offsetWidth > el.offsetHeight * 3;
    const press = wide ? '0.985 0.9' : '0.94 0.9';
    held.get(el)?.cancel();
    const a = el.animate([{ scale: '1 1' }, { scale: press }], { duration: 120, easing: EASE_OUT, fill: 'forwards' });
    held.set(el, a);
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      const p = held.get(el);
      if (p) p.cancel();
      held.delete(el);
      const s = spring(0.45, 0.42);
      el.animate(
        [{ scale: press }, { scale: wide ? '1.01 1.06' : '1.05 1.07', offset: 0.28 }, { scale: '0.99 0.985', offset: 0.6 }, { scale: '1 1' }],
        { duration: Math.max(380, Math.min(520, s.duration)), easing: 'linear' },
      );
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }, { passive: true });
}

// ---------- pill that slides between options and squashes while moving ----------
export function movePill(pill, target, animate = true) {
  if (!pill || !target || !target.offsetWidth) return;
  const x = target.offsetLeft, w = target.offsetWidth;
  const prevX = parseFloat(pill.dataset.x || 'NaN');
  pill.classList.toggle('still', !animate);
  pill.style.width = w + 'px';
  pill.style.transform = `translateX(${x}px)`;
  pill.dataset.x = x;
  if (animate && canMove() && !Number.isNaN(prevX) && Math.abs(prevX - x) > 2) {
    pill.animate(
      [{ scale: '1 1' }, { scale: '1.14 0.84', offset: 0.32 }, { scale: '0.96 1.05', offset: 0.68 }, { scale: '1 1' }],
      { duration: 420, easing: EASE_OUT },
    );
  }
  if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.remove('still')));
}

// ---------- explanation sections slide in as they scroll into view ----------
let revealer = null;
function getRevealer() {
  if (revealer) return revealer;
  revealer = new IntersectionObserver((entries) => {
    let k = 0;
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      revealer.unobserve(en.target);
      revealIt(en.target, k++ * 70);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  return revealer;
}
function revealIt(el, delay) {
  el.classList.remove('rv-hide');
  if (!canFade()) return;
  el.animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 260, delay, easing: EASE_OUT, fill: 'backwards' });
  if (canMove()) {
    const s = spring(0.7, 0.5);
    el.animate([{ transform: 'translateY(26px) scale(0.96)', transformOrigin: 'top center' }, { transform: 'none', transformOrigin: 'top center' }], { duration: s.duration, delay, easing: s.easing, fill: 'backwards' });
  }
}
// Sections already on screen cascade in now; the rest wait until scrolled to.
export function revealSections(container) {
  if (!container) return;
  const items = [...container.querySelectorAll(':scope > .card > *')];
  if (!canFade() || !('IntersectionObserver' in window)) return;
  const vh = window.innerHeight;
  let k = 0;
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.94 && r.bottom > 0) revealIt(el, k++ * 60);
    else { el.classList.add('rv-hide'); getRevealer().observe(el); }
  }
}
