'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/data';
import { endpoint } from '@/lib/routes';
import type { NewOrder, Order, OrderGroup } from '@/lib/types';
import { errMsg } from './util';

/** order no -> Order (null = not found / failed). Missing keys are still loading. */
export type OrderMap = Record<string, Order | null>;

/** POST /api/orders: the server assigns the order number and timestamp. */
export const createOrder = (body: NewOrder) => api<Order>(endpoint.orders, { method: 'POST', json: body });

export type GroupPatch = { status?: OrderGroup['status']; courier?: string | null; tracking?: string | null };
/** PATCH /api/orders/:no/groups/:retailerId: what the user recorded about one shop. */
export const patchGroup = (no: string, retailerId: string, body: GroupPatch) =>
  api<Order>(endpoint.orderGroup(no, retailerId), { method: 'PATCH', json: body });

/** Fetches every order number with GET /api/orders/:no. `seed` (e.g. the order just placed) is shown immediately. */
export function useOrders(nos: string[], seed?: Order | null) {
  const key = nos.join('|');
  const [map, setMap] = useState<OrderMap>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  useEffect(() => {
    let dead = false;
    const list = key ? key.split('|') : [];
    list.forEach((no) => {
      api<Order>(endpoint.order(no))
        .then((o) => { if (!dead) setMap((m) => ({ ...m, [no]: o })); })
        .catch((e: unknown) => {
          if (dead) return;
          setMap((m) => ({ ...m, [no]: m[no] ?? null }));
          setErrs((x) => ({ ...x, [no]: errMsg(e) }));
        });
    });
    return () => { dead = true; };
  }, [key]);
  const merged: OrderMap = seed && !map[seed.no] ? { ...map, [seed.no]: seed } : map;
  const put = useCallback((o: Order) => setMap((m) => ({ ...m, [o.no]: o })), []);
  return { map: merged, errs, put };
}
