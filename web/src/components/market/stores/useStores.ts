'use client';

import { useMemo } from 'react';
import type { MapData } from '@/components/StoreMap';
import { useBuildParts, useData } from '@/lib/data';
import { useUserLoc } from '@/lib/location';
import { useRig } from '@/lib/store';
import type { Branch, Offer, OpenState, Product, Retailer } from '@/lib/types';
import { inStock } from '../util';

/** "Has most of my build": the retailer lists at least this share of the build's parts in stock online. */
const MOST_OF_BUILD = 0.6;
/** A selected store closer than this is framed together with the user's position on the map. */
const FRAME_WITH_USER_KM = 80;

export interface StoreRow { b: Branch; r: Retailer | undefined; km: number; open: OpenState }

/** Branches near the user with open state, the filters applied, and each retailer's online listing for the build. */
export function useStores(now: number) {
  const d = useData();
  const L = useUserLoc();
  const build = useRig((s) => s.build), region = useRig((s) => s.region);
  const stRet = useRig((s) => s.stRet), stOpen = useRig((s) => s.stOpen), stBuild = useRig((s) => s.stBuild), stSel = useRig((s) => s.stSel);
  const parts: Product[] = useBuildParts(build);

  // Each retailer's ONLINE listing for each build part (per-branch shelf stock is not available).
  const listing = useMemo(() => {
    const m: Record<string, Record<string, Offer>> = {};
    parts.forEach((p) => d.engine.offers(p.id, region).forEach((o) => { (m[o.retailerId] ||= {})[p.id] = o; }));
    return m;
  }, [d, parts, region]);
  const have = (rid: string) => parts.filter((p) => inStock(listing[rid]?.[p.id]?.stock)).length;

  const { lat, lon } = L;
  const all: StoreRow[] = useMemo(() => d.engine.nearby({ lat, lon }).flatMap((x) => {
    const b = d.branchById[x.branchId];
    return b ? [{ b, r: d.retailerById[b.retailerId], km: x.km, open: d.engine.openState(b.id, now) }] : [];
  }), [d, lat, lon, now]);

  const mostOf = Math.ceil(parts.length * MOST_OF_BUILD);
  const list = all.filter((x) => (stRet === 'all' || x.b.retailerId === stRet) && (!stOpen || x.open.open) && (!stBuild || !parts.length || have(x.b.retailerId) >= mostOf));
  const sel = stSel ? all.find((x) => x.b.id === stSel) || null : null;
  const retailers = d.retailers.filter((r) => all.some((x) => x.b.retailerId === r.id));

  const map: MapData = {
    branches: list.map((x) => {
      const km = d.engine.fmtKm(x.km);
      return { id: x.b.id, name: x.b.name, lat: x.b.lat, lon: x.b.lon, tone: x.open.open ? 'ok' : 'none', sub: (x.r?.name || '') + ' · ' + km, km, d: x.km, near: x.km < FRAME_WITH_USER_KM };
    }),
    user: { lat: L.lat, lon: L.lon, acc: L.acc },
    sel: stSel,
    // Without a real position, or when one retailer is picked, show every pin; otherwise frame the nearest.
    focus: L.source === 'region' || stRet !== 'all' ? 'all' : 'near',
  };

  return { L, parts, listing, have, all, list, sel, retailers, map, mostOf };
}
