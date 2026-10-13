'use client';

/**
 * Motion primitives from the prototype:
 *  - [data-rv]           fades/slides/blur-reveals when scrolled into view (staggered 60 ms, 840 ms, ease-out).
 *                        data-rv="x" slides from the left, "s" scales down from above, anything else rises 34 px.
 *  - [data-draw] (svg)   clip-path wipe left→right 1500 ms after its revealed ancestor.
 *  - [data-grow]         scaleX 0→1 1300 ms.
 *  - [data-count]        count-up of the single text node's number, 1200 ms ease-out-quart.
 * startReveal() wires an IntersectionObserver + MutationObserver so newly rendered elements are picked up.
 */

import { LOCALE } from '@/lib/format';
import { dur, ease } from '@/lib/tokens';

const E = ease.out;
/** Reveal choreography (ms): SVG draw-in, bar grow, number count-up, toast lifetime; per-item stagger and the draw / grow offsets. */
const DRAW_MS = 1500, GROW_MS = 1300, COUNT_MS = 1200, TOAST_MS = 3000;
const STAGGER_MS = 60, STAGGER_MAX = 12, DRAW_OFFSET_MS = 160, GROW_OFFSET_MS = 220;
/** Reveals within ENTER_WINDOW_MS of a page entering wait ENTER_DELAY_MS, so they start after the page wipe has lifted. */
const ENTER_WINDOW_MS = 700, ENTER_DELAY_MS = 300;
let enterT = 0;

export function markPageEnter() { enterT = performance.now(); }

export function draw(el: Element, delay: number) {
  (el as HTMLElement).animate([{ clipPath: 'inset(-20px 100% -20px 0)' }, { clipPath: 'inset(-20px 0% -20px 0)' }], { duration: DRAW_MS, delay, easing: ease.draw, fill: 'backwards' });
}

export function redrawAll() { document.querySelectorAll('svg[data-draw]').forEach((x) => draw(x, 0)); }

export function countUp(el: HTMLElement, delay: number) {
  const n = el.firstChild;
  if (!n || n.nodeType !== 3 || el.childNodes.length !== 1) return;
  const txt = n.nodeValue || '', m = txt.match(/-?[\d,]*\d(\.\d+)?/);
  if (!m) return;
  const target = parseFloat(m[0].replace(/,/g, '')), dec = m[1] ? m[1].length - 1 : 0, t0 = performance.now() + delay, D = COUNT_MS;
  const f = (now: number) => {
    if (n.parentNode !== el) return;
    const k = Math.min(1, Math.max(0, (now - t0) / D)), v = target * (1 - Math.pow(1 - k, 4));
    n.nodeValue = txt.replace(m[0], (v < 0 ? '-' : '') + Math.abs(v).toLocaleString(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec }));
    if (k < 1) requestAnimationFrame(f); else n.nodeValue = txt;
  };
  requestAnimationFrame(f);
}

type RvEl = HTMLElement & { __rv?: 1 };

export function startReveal(): () => void {
  enterT = performance.now();
  const io = new IntersectionObserver((ents) => {
    const base = performance.now() - enterT < ENTER_WINDOW_MS ? ENTER_DELAY_MS : 0;
    let i = 0;
    ents.filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
      .forEach((e) => {
        const el = e.target as HTMLElement;
        io.unobserve(el);
        el.style.opacity = '';
        const d = base + Math.min(i++, STAGGER_MAX) * STAGGER_MS, k = el.dataset.rv;
        const from = k === 'x' ? 'translate3d(-28px,0,0)' : k === 's' ? 'translate3d(0,-10px,0) scale(0.97)' : 'translate3d(0,34px,0)';
        el.animate([{ opacity: 0, transform: from, filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: dur.slow, delay: d, easing: E, fill: 'backwards' });
        el.querySelectorAll('[data-draw]').forEach((s) => draw(s, d + DRAW_OFFSET_MS));
        el.querySelectorAll('[data-grow]').forEach((b) => (b as HTMLElement).animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: GROW_MS, delay: d + GROW_OFFSET_MS, easing: E, fill: 'backwards' }));
        if (el.dataset.count != null) countUp(el, d);
        el.querySelectorAll('[data-count]').forEach((c) => countUp(c as HTMLElement, d));
      });
  }, { threshold: 0.01, rootMargin: '0px 0px -6% 0px' });

  const scan = () => document.querySelectorAll<RvEl>('[data-rv]').forEach((el) => {
    if (el.__rv) return;
    el.__rv = 1;
    el.style.opacity = '0';
    io.observe(el);
  });
  let queued = false;
  const mo = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); });
  mo.observe(document.body, { childList: true, subtree: true });
  scan();
  return () => { io.disconnect(); mo.disconnect(); };
}

// ---------- toast ----------
let toastEl: HTMLElement | null = null, toastTxt: HTMLElement | null = null;
export function bindToast(el: HTMLElement | null, txt: HTMLElement | null) { toastEl = el; toastTxt = txt; }
export function toast(msg: string) {
  const el = toastEl;
  if (!el || !toastTxt) return;
  toastTxt.textContent = msg;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([
    { opacity: 0, transform: 'translate(-50%,24px) scale(0.96)' },
    { opacity: 1, transform: 'translate(-50%,0) scale(1)', offset: 0.12 },
    { opacity: 1, transform: 'translate(-50%,0) scale(1)', offset: 0.86 },
    { opacity: 0, transform: 'translate(-50%,10px) scale(0.98)' },
  ], { duration: TOAST_MS, easing: E });
}
