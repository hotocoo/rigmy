'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { guideSteps } from '@/lib/content';
import { useData } from '@/lib/data';
import { fmt, keySpecs } from '@/lib/format';
import { useRig } from '@/lib/store';
import type { StudioRef } from '@/studio/Studio';
import type { CableRunId, PartId, PartVis, PickTarget, StudioBuild, StudioCat, StudioMsg } from '@/studio/types';
import { cableNote } from './shared';

export type HostPage = 'builder' | 'cables' | 'guide' | 'review';
export type StudioHost = ReturnType<typeof useStudioHost>;

/** Wait after the scene is live before focusing a part, so the intro camera move finishes first. */
const CALLOUT_DELAY_MS = 2400;

/**
 * Host side of the 3D studio for the builder / review / cables / guide pages — the prototype's
 * pushAll() (on ready), sync() (on state change), pushGuide() and the builder's pick toggle.
 */
export function useStudioHost(page: HostPage) {
  const d = useData();
  const ref = useRef<StudioRef | null>(null);
  const ready = useRef(false);
  const steps = useMemo(() => guideSteps(d), [d]);
  const timers = useRef<number[]>([]);

  const build = useRig((s) => s.build), region = useRig((s) => s.region), sel = useRig((s) => s.sel);
  const explode = useRig((s) => s.explode), xray = useRig((s) => s.xray), cables = useRig((s) => s.cables);
  const cableHl = useRig((s) => s.cableHl), guideStep = useRig((s) => s.guideStep);

  const post = useCallback((m: StudioMsg) => { if (ready.current) ref.current?.send(m); }, []);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const studioBuild = useCallback((): StudioBuild => {
    const s = useRig.getState(), out: StudioBuild = {};
    for (const c of d.categories) {
      const id = s.build[c.id];
      const p = id ? d.byId[id] : null;
      if (!p) continue;
      const lo = d.engine.lowest(p.id, s.region);
      out[c.id as StudioCat] = { id: p.id, label: p.name, price: lo ? fmt(lo.price) : '', sub: keySpecs(p), vis: p.vis as PartVis };
    }
    return out;
  }, [d]);

  const issueParts = useCallback((): PickTarget[] => {
    const set = new Set<PickTarget>();
    d.engine.compat(useRig.getState().build).forEach((c) => { if (c.status === 'error') c.parts.forEach((p) => set.add(p)); });
    return [...set];
  }, [d]);

  const pushGuide = useCallback((delay: number) => {
    const st = steps[Math.min(useRig.getState().guideStep, steps.length - 1)];
    if (!st) return;
    post({ rig: 'explode', v: 0 });
    post({ rig: 'stage', show: st.show as PartId[] });
    later(() => post({ rig: 'select', part: st.cat === 'case' ? null : st.cat }), delay);
  }, [steps, post, later]);

  const pushAll = useCallback(() => {
    const s = useRig.getState();
    post({ rig: 'cables', opts: s.cables });
    post({ rig: 'build', build: studioBuild() });
    post({ rig: 'issues', parts: page === 'builder' || page === 'review' ? issueParts() : [] });
    if (page === 'builder') {
      if (s.explode) post({ rig: 'explode', v: s.explode, stagger: true });
      if (s.xray) post({ rig: 'xray', v: true });
      if (s.sel) post({ rig: 'select', part: s.sel });
    }
    if (page === 'cables') {
      post({ rig: 'xray', v: true });
      post({ rig: 'cable', id: s.cableHl as CableRunId | null });
      later(() => post({ rig: 'select', part: 'cables', note: cableNote(useRig.getState().cables.route) }), CALLOUT_DELAY_MS);
    }
    if (page === 'guide') pushGuide(CALLOUT_DELAY_MS);
  }, [page, post, later, studioBuild, issueParts, pushGuide]);

  const onReady = useCallback((api: StudioRef) => { ref.current = api; ready.current = true; pushAll(); }, [pushAll]);

  /** Studio click: the builder toggles the row selection (cables are not a row). */
  const onPick = useCallback((part: PickTarget | null) => {
    if (page !== 'builder') return;
    const c = part && part !== 'cables' ? part : null;
    useRig.getState().set((s) => ({ sel: s.sel === c ? null : c }));
  }, [page]);

  // sync(ps): diff the previous state and post only what changed.
  const prev = useRef({ build, region, sel, explode, xray, cables, cableHl, guideStep });
  useEffect(() => {
    const ps = prev.current;
    prev.current = { build, region, sel, explode, xray, cables, cableHl, guideStep };
    if (!ready.current) return;
    if (build !== ps.build || region !== ps.region) {
      post({ rig: 'build', build: studioBuild() });
      if (page === 'builder' || page === 'review') post({ rig: 'issues', parts: issueParts() });
    }
    if (page === 'builder') {
      if (sel !== ps.sel) post({ rig: 'select', part: sel });
      if (explode !== ps.explode) post({ rig: 'explode', v: explode, stagger: true });
      if (xray !== ps.xray) post({ rig: 'xray', v: xray });
    }
    if (cables !== ps.cables) post({ rig: 'cables', opts: cables });
    if (cableHl !== ps.cableHl) post({ rig: 'cable', id: cableHl as CableRunId | null });
    if (guideStep !== ps.guideStep && page === 'guide') pushGuide(0);
  }, [build, region, sel, explode, xray, cables, cableHl, guideStep, page, post, studioBuild, issueParts, pushGuide]);

  return { onReady, onPick, post };
}
