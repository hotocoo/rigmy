'use client';

import { useMemo } from 'react';
import { LocationBar } from '@/components/location/LocationBar';
import { toast } from '@/components/shell/motion';
import { StoreMap, type MapData } from '@/components/StoreMap';
import { Meta, Text } from '@/components/ui';
import { useNow } from '@/lib/clock';
import { useData } from '@/lib/data';
import { plural, stockTone } from '@/lib/format';
import { useLocDescription } from '@/lib/location';
import { useRig } from '@/lib/store';
import type { CatalogPart, RawOffer } from '@/lib/types';
import { BranchItem, type NearBranch } from './BranchItem';
import { MAP_NEAR_KM, NEAREST_BRANCH_LIMIT, NO_PICKUP_STOCK } from './constants';
import p from './part.module.css';

/**
 * Nearest branches of the retailers that list this part online (shelf stock itself is not tracked), with a map and
 * "pick up here", which puts the part in the build with that retailer and branch chosen for pickup.
 */
export function NearbyStores({ P }: { P: CatalogPart }) {
  const d = useData();
  const { L, label: locLabel } = useLocDescription();
  const now = useNow();
  const region = useRig((x) => x.region), pBranch = useRig((x) => x.pBranch), set = useRig((x) => x.set);
  const listed = d.engine.offers(P.id, region).length > 0;

  // Cheapest listing per retailer.
  const byRetailer = useMemo(() => {
    const m: Record<string, RawOffer> = {};
    d.offers.forEach((o) => { if (o.productId === P.id && (!m[o.retailerId] || o.price < m[o.retailerId].price)) m[o.retailerId] = o; });
    return m;
  }, [d, P.id]);
  const nRetailers = Object.keys(byRetailer).length;

  const near: NearBranch[] = d.engine.nearby(L)
    .map((x) => ({ km: x.km, b: d.branchById[x.branchId] }))
    .filter((x) => x.b && byRetailer[x.b.retailerId])
    .slice(0, NEAREST_BRANCH_LIMIT)
    .map(({ km, b }) => {
      const o = byRetailer[b.retailerId];
      return { b, o, km, kmText: d.engine.fmtKm(km), retailer: d.retailerById[b.retailerId], open: d.engine.openState(b.id, now), canPick: !NO_PICKUP_STOCK.includes(o.stock) };
    });

  const note = !listed
    ? 'No retailer listings tracked for this part yet, so there are no stores to show.'
    : near.length
      ? plural(near.length, 'nearby store belongs', 'nearby stores belong') + ' to ' + (nRetailers === 1 ? 'the retailer' : 'retailers')
        + ' listing this part · nearest is ' + near[0].b.name + ', ' + near[0].kmText + ' away · call to confirm shelf stock'
      : 'None of the retailers listing this part have a store near you. Order online below.';

  const mapData: MapData = {
    branches: near.map((x) => ({ id: x.b.id, name: x.b.name, lat: x.b.lat, lon: x.b.lon, tone: stockTone(x.o.stock), sub: x.o.stock + ' online · ' + x.kmText, km: x.kmText, d: x.km, near: x.km < MAP_NEAR_KM })),
    user: { lat: L.lat, lon: L.lon, acc: L.acc },
    sel: pBranch,
    focus: 'near',
  };

  const pickUp = (branchId: string, retailerId: string, name: string) => {
    set((s) => ({
      build: { ...s.build, [P.cat]: P.id },
      picks: { ...s.picks, [P.id]: retailerId },
      planMode: 'custom',
      co: { ...s.co, ship: 'pickup', pickup: { ...s.co.pickup, [retailerId]: branchId } },
    }));
    toast('Pick up at ' + name + ' · added to your build');
  };

  return (
    <section className={p.section}>
      <div data-rv="1" className={p.headCol}>
        <Text v="h3" as="h2">On the shelf near you</Text>
        <Meta>{note}</Meta>
      </div>
      <LocationBar />
      <div data-rv="1" className={p.storeBox}>
        <ul className={p.branchList} aria-label="Nearby stores">
          {near.map((x) => (
            <BranchItem key={x.b.id} x={x} product={P.name} on={pBranch === x.b.id} onSelect={() => set({ pBranch: pBranch === x.b.id ? null : x.b.id })} onPickUp={() => pickUp(x.b.id, x.b.retailerId, x.b.name)} />
          ))}
          {!near.length && (
            <li className={p.noStores}>
              <span className={p.noStoresTitle}>{listed ? 'No stores nearby' : 'No stores yet'}</span>
              <Meta>{listed ? 'The retailers listing this part have no branches near ' + locLabel + '.' : 'Stores appear here once a retailer with a branch near you lists this part.'}</Meta>
            </li>
          )}
        </ul>
        <div className={p.mapPane}>
          <StoreMap data={mapData} onPick={(id) => set({ pBranch: id })} className={p.map} />
        </div>
      </div>
    </section>
  );
}
