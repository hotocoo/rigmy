'use client';

import type { MouseEvent } from 'react';
import { Button, Dot, LinkButton } from '@/components/ui';
import { cx } from '@/lib/cx';
import { fmt, openColor, stockColor, telHref } from '@/lib/format';
import { directionsUrl } from '@/lib/location';
import type { Branch, OpenState, RawOffer, Retailer } from '@/lib/types';
import p from './part.module.css';

export interface NearBranch { b: Branch; o: RawOffer; km: number; kmText: string; retailer: Retailer | undefined; open: OpenState; canPick: boolean }

/** One nearby branch: selecting it highlights its map pin; actions open directions, call, or choose it for pickup. */
export function BranchItem({ x, on, onSelect, onPickUp }: { x: NearBranch; on: boolean; onSelect: () => void; onPickUp: () => void }) {
  const sc = stockColor(x.o.stock);
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <li className={cx(p.branch, on && p.branchOn)} onClick={onSelect}>
      {/* Keyboard access to selection: the click bubbles to the item's handler. */}
      <button type="button" className={p.branchMain} aria-pressed={on} aria-label={'Show ' + x.b.name + ' on the map'}>
        <span className={p.branchName}>{x.b.name}</span>
        <span className={p.branchMeta}>{(x.retailer?.name || x.b.retailerId) + ' · ' + x.kmText + ' · '}<span style={{ color: openColor(x.open) }}>{x.open.text}</span></span>
        <span className={p.stockLine} style={{ color: sc }}><Dot c={sc} glowPx={0} />{x.o.stock + ' online'}<span className={p.stockNote}>· Call to confirm shelf stock</span></span>
      </button>
      <div className={p.branchSide}>
        <span className={p.branchPrice}>{fmt(x.o.price)}</span>
        <div className={p.branchActions}>
          <LinkButton variant="mini" href={directionsUrl(x.b.lat, x.b.lon)} external onClick={stop}>Directions</LinkButton>
          {x.b.phone && <LinkButton variant="mini" href={telHref(x.b.phone)} onClick={stop} aria-label={'Call ' + x.b.name}>Call</LinkButton>}
          {x.canPick && <Button variant="primary" size="mini" onClick={(e) => { e.stopPropagation(); onPickUp(); }}>Pick up here</Button>}
        </div>
      </div>
    </li>
  );
}
