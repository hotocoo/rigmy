'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui';
import { useData } from '@/lib/data';
import type { Order, OrderGroup } from '@/lib/types';
import { etaLower, groupUrls, openAll } from './util';
import s from './orders.module.css';

export const groupEta = (o: Order, g: OrderGroup) => (o.ship === 'pickup' ? 'Ready for pickup in ' : 'Arrives in ') + etaLower(g.eta);

/** Pickup branches or the delivery address of an order, as one line. */
export function useOrderAddr() {
  const d = useData();
  return useCallback((o: Order) => o.ship === 'pickup'
    ? o.groups.map((g) => ((g.branchId && d.branchById[g.branchId]?.name) || 'Branch to confirm') + ' (' + g.name + ')').join(' · ')
    : o.addr ? [o.addr.line, (o.addr.postcode + ' ' + o.addr.city).trim()].filter(Boolean).join(', ') : '—', [d]);
}

/** Opens every product link of one shop in new tabs. */
export function BuyButton({ g }: { g: OrderGroup }) {
  const urls = groupUrls(g);
  if (!urls.length) return <span className={s.noLinks}>No product links</span>;
  return (
    <Button variant="accent" size="compact" onClick={() => openAll(urls)} aria-label={'Buy at ' + g.name + ' (opens ' + urls.length + (urls.length === 1 ? ' tab)' : ' tabs)')}>
      {'Buy at ' + g.name}<span className={s.arrow} aria-hidden>↗</span>
    </Button>
  );
}
