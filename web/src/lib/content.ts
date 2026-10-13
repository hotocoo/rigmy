'use client';

import { useMemo } from 'react';
import { useData, type Data } from './data';
import { useRig } from './store';
import type { CatId, Eta, GuideStepDef, Preset, RegionId } from './types';

/** Studio part ids staged by the build guide, in assembly order, derived from the configured guide steps. */
export interface GuideStep extends GuideStepDef { show: string[] }

/** Guide steps with the cumulative set of parts the 3D studio should show at each step. */
export function guideSteps(d: Data): GuideStep[] {
  const order: string[] = [];
  return d.content.guide.map((g) => {
    if (g.cat) order.push(g.cat);
    return { ...g, show: g.cat ? order.slice() : order.concat(['fans', 'glass']) };
  });
}
export const useGuide = () => { const d = useData(); return useMemo(() => guideSteps(d), [d]); };

/** The preset highlighted on the home page and offered as a starting point (config: `featured`). */
export function featuredPreset(d: Data): Preset | null {
  return d.presets.find((p) => p.featured) || d.presets[0] || null;
}

/** A configured price region by id, falling back to the first one (an unknown id from old saved state). */
export const regionById = (d: Data, id: RegionId) => d.regions.find((x) => x.id === id) || d.regions[0];
/** The price region the user has chosen. */
export function useRegion() {
  const d = useData();
  const id = useRig((s) => s.region);
  return regionById(d, id);
}

/** Approximate centre of a delivery region, used until the user shares a location. */
export const regionCenter = (d: Data, id: RegionId) => regionById(d, id).center;

/** Worst-case days for a delivery bucket (config table, evaluated by the engine). */
export const etaDays = (d: Data, eta: Eta | null | undefined) => (eta ? d.engine.etaDays(eta) : 0);
/** Ordering rank for a delivery bucket (config table, evaluated by the engine). */
export const etaRank = (d: Data, eta: Eta | null | undefined) => (eta ? d.engine.etaRank(eta) : 0);

/** Courier tracking link from configured couriers, or null when no public URL template is known. */
export const trackingUrl = (d: Data, courier: string | null | undefined, tracking: string | null | undefined) =>
  (courier && tracking ? d.engine.trackingUrl(courier, tracking) ?? null : null);

/** Cable runs present for the current build. */
export function cableRunsFor(d: Data, has: Partial<Record<CatId, boolean>>) {
  return d.content.cableRuns.filter((r) => has[r.requires]);
}
