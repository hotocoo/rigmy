'use client';

import { useMemo } from 'react';
import { useGo } from '@/components/shell/useGo';
import { StoreMap, type MapData } from '@/components/StoreMap';
import { Button, Dot, LinkButton, Meta, Notice } from '@/components/ui';
import { useNow } from '@/lib/clock';
import { useData } from '@/lib/data';
import { openColor, pluralWord } from '@/lib/format';
import { useLocate, useLocDescription } from '@/lib/location';
import { ROUTES } from '@/lib/routes';
import { color } from '@/lib/tokens';
import { NEAR_KM, NEAR_STORES_COUNT } from './config';
import { countWords } from './copy';
import { SectionHead } from './SectionHead';
import { useNavLink } from './useNavLink';
import s from './home.module.css';

/** "Walk in, or pick up today": the nearest branches beside the store map. */
export function NearStores() {
  const d = useData();
  const go = useGo();
  const link = useNavLink();
  const { L, label: locLabel } = useLocDescription();
  const { locate, busy, msg } = useLocate();
  const now = useNow();
  const { source: src, lat, lon, acc } = L;

  const near = useMemo(() => d.engine.nearby({ lat, lon }).map((x) => {
    const b = d.branchById[x.branchId];
    if (!b) return null;
    const open = d.engine.openState(b.id, now);
    return {
      b, retailer: d.retailerById[b.retailerId]?.name || '', area: b.addr.split(', ').slice(-1)[0], km: d.engine.fmtKm(x.km), kmN: x.km,
      open: open.text, isOpen: open.open, openC: openColor(open),
    };
  }).filter((x): x is NonNullable<typeof x> => !!x), [d, lat, lon, now]);

  const mapData: MapData = useMemo(() => ({
    branches: near.map((x) => ({ id: x.b.id, name: x.b.name, lat: x.b.lat, lon: x.b.lon, tone: x.isOpen ? 'ok' : 'none', sub: x.retailer + ' · ' + x.km, km: x.km, d: x.kmN, near: x.kmN < NEAR_KM })),
    user: { lat, lon, acc }, sel: null, focus: 'near',
  }), [near, lat, lon, acc]);

  const nB = d.branches.length, nRet = new Set(d.branches.map((b) => b.retailerId)).size;
  const lead = src === 'gps' ? 'Distances are measured from your exact location. ' : src === 'postcode' ? 'Distances are measured from postcode ' + L.postcode + '. ' : 'Share your location to see exact distances. ';
  const intro = nB
    ? lead + nB + ' ' + pluralWord(nB, 'store') + ' from ' + countWords(nRet, 'retailer') + ' across Malaysia, with opening hours where the shop lists them.'
    : lead + 'Store locations appear here once retailers and their branches are configured.';

  return (
    <section className={s.stores} aria-labelledby="home-stores">
      <div className={s.storesCopy}>
        <div data-rv="1"><SectionHead id="home-stores" eyebrow={'Stores near ' + locLabel} title="Walk in, or pick up today" lead={intro} /></div>
        <div data-rv="1" className={s.actions}>
          <Button onClick={() => locate()} busy={busy}>{busy ? 'Locating…' : src === 'gps' ? 'Refresh my location' : 'Use my exact location'}</Button>
          <LinkButton variant="ghost" {...link(ROUTES.stores.path)}>Open the store map</LinkButton>
        </div>
        {msg && <Notice tone="warn" bare role="alert">{msg}</Notice>}
        <ul className={s.storeList}>
          {near.slice(0, NEAR_STORES_COUNT).map((x) => (
            <li key={x.b.id} data-rv="x">
              <a {...link(ROUTES.stores.path, { stSel: x.b.id })} className={s.storeRow}>
                <span className={s.storeMain}>
                  <span className={s.storeName}>{x.b.name}</span>
                  <Meta>{x.retailer} · {x.area}</Meta>
                </span>
                <span className={s.storeSide}>
                  <span className={s.storeKm}>{x.km}</span>
                  <span className={s.storeOpen} style={{ color: x.openC }}>{x.open}</span>
                </span>
              </a>
            </li>
          ))}
          {!near.length && <li data-rv="x" className={s.storeEmpty}><Dot c={color.dim} glowPx={0} />No stores on the map yet</li>}
        </ul>
      </div>
      <div className={s.mapPane}>
        <StoreMap data={mapData} onPick={(id) => go(ROUTES.stores.path, { stSel: id })} className={s.map} />
      </div>
    </section>
  );
}
