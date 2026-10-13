'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CH, MOOD, RAIL } from '@/lib/choreography';
import { useData } from '@/lib/data';
import { fmt, keySpecs } from '@/lib/format';
import { useRig } from '@/lib/store';
import { ease, glow } from '@/lib/tokens';
import type { Build, CatId } from '@/lib/types';
import type { StudioRef } from '@/studio/Studio';
import type { StudioBuild, StudioMsg } from '@/studio/types';
import { CHAPTER } from './config';

/** Scroll smoothing per frame, and the thresholds below which a value is not re-sent to the studio. */
const LERP = 0.09, SNAP = 0.0003, EPS = { p: 0.0002, ex: 0.002, shift: 0.0008 };
/** Chapter cross-fade: full opacity within ±FADE_HOLD of the chapter, fading out over FADE_SPAN. */
const FADE_HOLD = 0.14, FADE_SPAN = 0.3, CH_TRAVEL_PX = 80, CH_BLUR_PX = 8;
/** Big chapter number: vertical drift per chapter and the fade-in on change. */
const NUM_TRAVEL_PX = 140, NUM_FADE_MS = 1000, NUM_BLUR_PX = 14;
/** Price bars grow in while the price chapter is centred, staggered per bar. */
const BAR_FALLOFF = 1.6, BAR_GAIN = 1.8, BAR_STAGGER = 0.12;
/** Below this width the model is centred instead of shifted away from the copy. */
const NARROW = '(max-width: 859px)';
const NAV_FALLBACK_PX = 61;

const pad2 = (n: number) => String(n).padStart(2, '0');
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Host side of the studio's build: what the 3D hero should show for `hb`. */
function useStudioBuild(hb: Build): StudioBuild {
  const d = useData();
  const region = useRig((s) => s.region);
  return useMemo(() => {
    const out: StudioBuild = {};
    for (const c of d.categories) {
      const id = hb[c.id], p = id ? d.byId[id] : null;
      if (!id || !p) continue;
      const lo = d.engine.lowest(id, region);
      out[c.id] = { id, label: p.name, price: lo ? fmt(lo.price) : '', sub: keySpecs(p), vis: p.vis };
    }
    return out;
  }, [d, hb, region]);
}

/**
 * Drives the 820vh scroll story: cross-fades the `[data-ch]` chapters, the big chapter number, the progress rail
 * (`[data-rail]`), the price bars (`[data-w]`) and streams scroll / explode / frame / mood / selection to the studio.
 */
export function useStoryDriver(hb: Build) {
  const studio = useRef<StudioRef | null>(null);
  const story = useRef<HTMLDivElement>(null), bigNum = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null);
  const chipDot = useRef<HTMLSpanElement>(null), chipTxt = useRef<HTMLSpanElement>(null);
  const S = useRef({ ready: false, sp: 0, lastNum: -1, lastMood: -1, lastP: -1, lastEx: -1, lastShift: -9, lastSel: undefined as CatId | null | undefined, ptr: null as { x: number; y: number } | null });
  const post = useCallback((m: StudioMsg) => { studio.current?.send(m); }, []);

  const sb = useStudioBuild(hb);
  const sbRef = useRef(sb);
  useEffect(() => {
    sbRef.current = sb;
    if (S.current.ready) post({ rig: 'build', build: sb });
  }, [sb, post]);
  const onReady = useCallback(() => {
    const st = S.current;
    st.ready = true;
    post({ rig: 'cables', opts: useRig.getState().cables });
    post({ rig: 'build', build: sbRef.current });
    st.lastMood = -1; st.lastSel = undefined; st.lastEx = -1; st.lastShift = -9; st.lastP = -1;
  }, [post]);

  useEffect(() => {
    const st = S.current, root = story.current;
    if (!root) return;
    const narrow = matchMedia(NARROW), reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const chEls = Array.from(root.querySelectorAll<HTMLElement>('[data-ch]')).sort((a, b) => +a.dataset.ch! - +b.dataset.ch!);
    const railEls = Array.from(root.querySelectorAll<HTMLElement>('[data-rail]'));
    const onMove = (e: PointerEvent) => { st.ptr = { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 }; };
    addEventListener('pointermove', onMove);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const still = reduced.matches;
      const nh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav')) || NAV_FALLBACK_PX;
      const r = root.getBoundingClientRect(), H = innerHeight - nh;
      const p = clamp01((nh - r.top) / Math.max(1, r.height - H));
      st.sp = still ? p : st.sp + (p - st.sp) * LERP;
      if (Math.abs(p - st.sp) < SNAP) st.sp = p;
      const N = CH.length, fl = st.sp * (N - 1), cur = Math.round(fl);

      chEls.forEach((el, i) => {
        const t = fl - i, a = clamp01(1 - (Math.abs(t) - FADE_HOLD) / FADE_SPAN);
        el.style.opacity = a.toFixed(3);
        el.style.transform = still ? 'none' : 'translate3d(0,' + (-t * CH_TRAVEL_PX).toFixed(1) + 'px,0) scale(' + (0.97 + 0.03 * a).toFixed(4) + ')';
        el.style.filter = still || a >= 0.999 ? 'none' : 'blur(' + ((1 - a) * CH_BLUR_PX).toFixed(1) + 'px)';
        el.style.pointerEvents = a > 0.5 ? 'auto' : 'none';
      });

      const n = bigNum.current;
      if (n) {
        if (cur !== st.lastNum) {
          st.lastNum = cur;
          n.textContent = pad2(cur + 1);
          n.dataset.side = cur % 2 === 0 ? 'right' : 'left';
          if (!still) n.animate([{ opacity: 0, filter: `blur(${NUM_BLUR_PX}px)` }, { opacity: 1, filter: 'blur(0px)' }], { duration: NUM_FADE_MS, easing: ease.out });
          if (chipTxt.current) chipTxt.current.textContent = pad2(cur + 1) + ' / ' + pad2(N) + ' · ' + RAIL[cur];
          if (chipDot.current) { chipDot.current.style.background = MOOD[cur]; chipDot.current.style.boxShadow = glow(MOOD[cur], 12); }
        }
        n.style.transform = still ? 'none' : 'translate3d(0,' + (-(fl - cur) * NUM_TRAVEL_PX).toFixed(1) + 'px,0)';
      }
      railEls.forEach((el, i) => { el.dataset.state = i === cur ? 'on' : i < cur ? 'past' : 'next'; });
      if (fill.current) fill.current.style.transform = 'scaleY(' + st.sp.toFixed(4) + ')';
      const pr = Math.max(0, 1 - Math.abs(fl - CHAPTER.prices) * BAR_FALLOFF);
      root.querySelectorAll<HTMLElement>('[data-w]').forEach((el, j) => {
        const k = clamp01(pr * BAR_GAIN - j * BAR_STAGGER), e = 1 - Math.pow(1 - k, 3);
        el.style.transform = 'scaleX(' + (e * (+(el.dataset.w || 0) || 0)).toFixed(4) + ')';
      });

      if (!st.ready) return;
      const i0 = Math.min(N - 2, Math.floor(fl)), k = fl - i0, e = k * k * (3 - 2 * k);
      const ex = CH[i0].ex + (CH[i0 + 1].ex - CH[i0].ex) * e;
      const sh = narrow.matches ? 0 : CH[i0].shift + (CH[i0 + 1].shift - CH[i0].shift) * e;
      const sel = CH[cur].sel;
      if (cur !== st.lastMood) { st.lastMood = cur; post({ rig: 'mood', color: MOOD[cur] }); }
      if (Math.abs(st.sp - st.lastP) > EPS.p) { st.lastP = st.sp; post({ rig: 'scroll', p: st.sp }); }
      if (Math.abs(ex - st.lastEx) > EPS.ex) { st.lastEx = ex; post({ rig: 'explode', v: ex }); }
      if (Math.abs(sh - st.lastShift) > EPS.shift) { st.lastShift = sh; post({ rig: 'frame', shiftX: sh }); }
      if (sel !== st.lastSel) { st.lastSel = sel; post({ rig: 'select', part: sel }); }
      if (st.ptr) { post({ rig: 'pointer', x: st.ptr.x, y: st.ptr.y }); st.ptr = null; }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', onMove); };
  }, [post]);

  return { studio, onReady, story, bigNum, fill, chipDot, chipTxt };
}
