'use client';

import { LocationBar } from '@/components/location/LocationBar';
import { toast } from '@/components/shell/motion';
import { useGo } from '@/components/shell/useGo';
import { StoreMap } from '@/components/StoreMap';
import { Eyebrow, Text } from '@/components/ui';
import { useNow } from '@/lib/clock';
import { featuredPreset } from '@/lib/content';
import { useData } from '@/lib/data';
import { plural } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { Product } from '@/lib/types';
import { StoreDetail } from './stores/StoreDetail';
import { StoreFilters, StoreList } from './stores/StoreList';
import { useStores } from './stores/useStores';
import s from './stores/stores.module.css';

export function Stores() {
  const d = useData();
  const go = useGo();
  const now = useNow();
  const set = useRig((x) => x.set);
  const { L, parts, listing, have, all, list, sel, retailers, map, mostOf } = useStores(now);
  const preset = featuredPreset(d);
  const count = plural(all.length, 'store') + ' · ' + plural(retailers.length, 'retailer') + ' · distances from ' + (L.source === 'region' ? L.label : 'you');

  const pickup = (ok: Product[]) => {
    if (!sel) return;
    const rid = sel.b.retailerId, bid = sel.b.id;
    set((st) => {
      const picks = { ...st.picks };
      ok.forEach((p) => { picks[p.id] = rid; });
      return { picks, planMode: 'custom', co: { ...st.co, ship: 'pickup', pickup: { ...st.co.pickup, [rid]: bid } } };
    });
    toast(plural(ok.length, 'part') + ' set to pick up at ' + sel.b.name);
    go(ROUTES.cart.path);
  };

  return (
    <div className={s.layout}>
      <div className={s.side}>
        <div className={s.top}>
          <header data-rv="1" className={s.heading}>
            <Eyebrow c={color.blueSoft}>{count}</Eyebrow>
            <Text v="titleXxl" as="h1">Stores</Text>
          </header>
          <LocationBar />
          {!sel && all.length > 0 && <StoreFilters retailers={retailers} hasBuild={parts.length > 0} />}
        </div>

        {sel ? (
          <StoreDetail key={sel.b.id} x={sel} now={now} parts={parts} listing={listing[sel.b.retailerId] || {}}
            preset={parts.length ? null : preset}
            loadPreset={() => preset && set({ build: { ...preset.build }, picks: {} })}
            back={() => set({ stSel: null })}
            pickup={pickup} />
        ) : (
          <StoreList all={all} list={list} buildSize={parts.length} mostOf={mostOf} have={have}
            pick={(id) => set({ stSel: id })} comparePrices={() => go(ROUTES.prices.path)} />
        )}
      </div>

      <div className={s.mapPane}>
        <div className={s.mapInner}>
          <StoreMap data={map} onPick={(id) => set({ stSel: id })} />
        </div>
      </div>
    </div>
  );
}
