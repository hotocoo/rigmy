'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { wipeLabel } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { ease } from '@/lib/tokens';
import { markPageEnter } from './motion';

/**
 * Page transition from the prototype: a full-height gridded panel wipes up from the bottom (380 ms, ease-in-out),
 * shows the destination's step number + title (label rises 40 px and un-blurs, 520 ms, 120 ms delay),
 * the route changes underneath and, once the new route has committed, the panel retracts upwards (560 ms) after a 160 ms hold.
 */
let wipeEl: HTMLElement | null = null, wipeNum: HTMLElement | null = null, wipeLbl: HTMLElement | null = null, wiping = false;
export function bindWipe(el: HTMLElement | null, num: HTMLElement | null, lbl: HTMLElement | null) { wipeEl = el; wipeNum = num; wipeLbl = lbl; }

const EIO = ease.io;
const COVER_MS = 380, HOLD_MS = 160, REVEAL_MS = 560, COMMIT_TIMEOUT_MS = 1200, LABEL_MS = 520, LABEL_DELAY_MS = 120;

/** Resolves when the router has committed `path` (signalled by AppShell's RouteCommit) or after a timeout. */
let commitWaiter: { path: string; resolve: () => void } | null = null;
export function notifyRouteCommit(path: string) {
  if (commitWaiter && commitWaiter.path === path) { commitWaiter.resolve(); commitWaiter = null; }
}
function waitForCommit(path: string) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(() => { if (commitWaiter?.path === path) commitWaiter = null; resolve(); }, COMMIT_TIMEOUT_MS);
    commitWaiter = { path, resolve: () => { clearTimeout(t); resolve(); } };
  });
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Cover → navigate → wait for the new route to commit → hold → reveal. Every animation is awaited and the panel is
 * always returned to its resting state (scaleY(0), no running animations), even if an animation is interrupted.
 */
async function runWipe(w: HTMLElement, path: string, apply: () => void) {
  const lb = wipeLabel(path);
  if (wipeNum) wipeNum.textContent = lb[0];
  if (wipeLbl) wipeLbl.textContent = lb[1];
  const reset = () => { w.getAnimations().forEach((x) => x.cancel()); wipeLbl?.getAnimations().forEach((x) => x.cancel()); };
  reset();
  let navigated = false;
  try {
    wipeLbl?.animate([{ opacity: 0, transform: 'translate3d(0,40px,0)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: LABEL_MS, delay: LABEL_DELAY_MS, easing: ease.out, fill: 'both' });
    const cover = w.animate([{ transform: 'scaleY(0)', transformOrigin: '50% 100%' }, { transform: 'scaleY(1)', transformOrigin: '50% 100%' }], { duration: COVER_MS, easing: EIO, fill: 'forwards' });
    await cover.finished;
    const committed = waitForCommit(path);
    navigated = true;
    apply();
    await committed;
    await sleep(HOLD_MS);
    const reveal = w.animate([{ transform: 'scaleY(1)', transformOrigin: '50% 0%' }, { transform: 'scaleY(0)', transformOrigin: '50% 0%' }], { duration: REVEAL_MS, easing: EIO, fill: 'forwards' });
    cover.cancel();
    await reveal.finished;
  } catch {
    // An animation was cancelled mid-flight: still honour the navigation, then reset below.
    if (!navigated) apply();
  } finally {
    reset();
  }
}

export function useGo() {
  const router = useRouter();
  return useCallback((href: string, extra?: Parameters<ReturnType<typeof useRig.getState>['set']>[0]) => {
    const path = href.split('?')[0];
    const apply = () => {
      useRig.getState().set({ sel: null });
      if (extra) useRig.getState().set(extra);
      router.push(href, { scroll: false });
      window.scrollTo(0, 0);
      markPageEnter();
    };
    const w = wipeEl;
    if (path === window.location.pathname || !w || wiping || !w.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
    wiping = true;
    void runWipe(w, path, apply).finally(() => { wiping = false; });
  }, [router]);
}
