'use client';

import { Button, Chip, EmptyState, Meta, Text, Toggle } from '@/components/ui';
import { useData } from '@/lib/data';
import { openColor, plural } from '@/lib/format';
import { useRig } from '@/lib/store';
import { color, tone } from '@/lib/tokens';
import type { Retailer } from '@/lib/types';
import type { StoreRow } from './useStores';
import m from '../market.module.css';
import s from './stores.module.css';

/** Retailer chips plus "open now" / "has most of my build" toggles. */
export function StoreFilters({ retailers, hasBuild }: { retailers: Retailer[]; hasBuild: boolean }) {
  const set = useRig((x) => x.set), stRet = useRig((x) => x.stRet), stOpen = useRig((x) => x.stOpen), stBuild = useRig((x) => x.stBuild);
  return (
    <div className={s.filters}>
      <div className={m.chips} role="group" aria-label="Retailer">
        <Chip on={stRet === 'all'} onClick={() => set({ stRet: 'all', stSel: null })}>All</Chip>
        {retailers.map((r) => <Chip key={r.id} on={stRet === r.id} onClick={() => set({ stRet: r.id, stSel: null })}>{r.name}</Chip>)}
      </div>
      <div className={m.chips}>
        <Toggle on={stOpen} label="Open now" onClick={() => set((x) => ({ stOpen: !x.stOpen }))} />
        <Toggle on={stBuild} label="Has most of my build" onClick={() => set((x) => ({ stBuild: !x.stBuild }))} />
      </div>
      {stBuild && hasBuild && <span className={s.fine}>Based on each retailer&apos;s online stock. Call the store to confirm what is on the shelf.</span>}
    </div>
  );
}

/** Area (last part of the address) shown under each branch name. */
const area = (addr: string) => addr.split(', ').slice(-1)[0] || addr;

export function StoreList({ all, list, buildSize, mostOf, have, pick, comparePrices }: {
  all: StoreRow[]; list: StoreRow[]; buildSize: number; mostOf: number; have: (rid: string) => number; pick: (id: string) => void; comparePrices: () => void;
}) {
  const d = useData();
  if (!all.length) {
    return (
      <div className={s.emptyWrap}>
        <EmptyState title="No store locations yet"
          body="Store branches come from OpenStreetMap, imported by the RigMY backend, or from the retailer config. Once a branch is imported it shows up here with its distance from you, opening hours, phone number and directions."
          action={<>
            {d.retailers.length > 0 && <Meta>{'You can still compare online prices from ' + plural(d.retailers.length, 'retailer') + '.'}</Meta>}
            <Button variant="mini" onClick={comparePrices}>Compare online prices</Button>
          </>} />
      </div>
    );
  }
  if (!list.length) return <div className={s.emptyWrap}><EmptyState title="No stores match these filters" /></div>;
  return (
    <ul className={s.list} aria-label="Stores near you">
      {list.map((x) => {
        const n = have(x.b.retailerId);
        const buildColor = n === buildSize ? tone.ok : n >= mostOf ? color.blueSoft : color.muted;
        return (
          <li key={x.b.id}>
            <button type="button" data-rv="x" onClick={() => pick(x.b.id)} className={s.row}>
              <span className={m.col}>
                <Text v="eyebrowSm" c={color.blueSoft}>{x.r?.name || x.b.retailerId}</Text>
                <span className={s.name}>{x.b.name}</span>
                <Text v="meta">{area(x.b.addr)}</Text>
                {buildSize > 0 && <span className={s.buildCount} style={{ color: buildColor }}>{n + ' of ' + buildSize + ' build parts in stock online'}</span>}
              </span>
              <span className={m.end}>
                <Text v="priceMd">{d.engine.fmtKm(x.km)}</Text>
                <span className={s.open} style={{ color: openColor(x.open) }}>{x.open.text}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
