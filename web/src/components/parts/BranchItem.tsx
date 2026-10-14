'use client';

import type { MouseEvent } from 'react';
import { Button, Dot, LinkButton } from '@/components/ui';
import { cx } from '@/lib/cx';
import { fmt, openColor, stockColor, telHref, whatsappHref } from '@/lib/format';
import { directionsUrl } from '@/lib/location';
import type { Branch, OpenState, RawOffer, Retailer } from '@/lib/types';
import p from './part.module.css';

export interface NearBranch { b: Branch; o: RawOffer; km: number; kmText: string; retailer: Retailer | undefined; open: OpenState; canPick: boolean }

/** One nearby branch: selecting it highlights its map pin; actions open directions, call, or choose it for pickup. */
export function BranchItem({ x, product, on, onSelect, onPickUp }: { x: NearBranch; product: string; on: boolean; onSelect: () => void; onPickUp: () => void }) {
  const sc = stockColor(x.o.stock);
  // Reserving is a request to the branch, not a booking RigMY can confirm: it opens WhatsApp with the hold written out.
  const reserve = x.b.phone ? whatsappHref(x.b.phone, 'Hi ' + x.b.name + ', could you hold 1 × ' + product + ' (listed at ' + fmt(x.o.price) + ') for me to collect? Please confirm it is on the shelf. Thanks!') : null;
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
          {reserve && <LinkButton variant="mini" href={reserve} external onClick={stop} aria-label={'Reserve at ' + x.b.name + ' on WhatsApp'}>Reserve</LinkButton>}
          {x.b.phone && <LinkButton variant="mini" href={telHref(x.b.phone)} onClick={stop} aria-label={'Call ' + x.b.name}>Call</LinkButton>}
          {x.canPick && <Button variant="primary" size="mini" onClick={(e) => { e.stopPropagation(); onPickUp(); }}>Pick up here</Button>}
        </div>
      </div>
    </li>
  );
}
