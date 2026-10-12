'use client';

import { useEffect, useRef, useState } from 'react';
import { useGo } from '@/components/shell/useGo';
import { etaDays } from '@/lib/content';
import { DAY, dDow, dFmt, startOfDay } from '@/lib/format';
import { POSTCODE_HINT, POSTCODE_LEN } from '@/lib/location';
import { href } from '@/lib/routes';
import { useRig, type Checkout } from '@/lib/store';
import type { Branch, NewOrder, OpenState, OrderGroup } from '@/lib/types';
import type { CartGroup, Commerce } from './useCommerce';
import { createOrder } from './useOrders';
import { errMsg } from './util';

// ---------------------------------------------------------------- delivery slots
export interface SlotDay { t: number; dow: string; date: string }

/**
 * Delivery-day options: the earliest day is set by the slowest shop's ETA (config `etas[].days`, at least tomorrow),
 * followed by `content.slotDays` consecutive days; windows come from `content.deliveryWindows`.
 */
export function useSlots(c: Commerce, now: number) {
  const co = useRig((st) => st.co);
  const { slotDays, deliveryWindows: windows } = c.d.content;
  const first = Math.max(1, etaDays(c.d, c.maxEta));
  const base = startOfDay(now) + first * DAY;
  const days: SlotDay[] = Array.from({ length: Math.max(0, slotDays) }, (_, i) => {
    const t = base + i * DAY;
    return { t, dow: first + i === 1 ? 'Tomorrow' : dDow(t), date: dFmt(t) };
  });
  const day = days.length ? days[Math.min(co.slotDay, days.length - 1)] : null;
  const dayIdx = day ? days.indexOf(day) : -1;
  const winIdx = windows.length ? Math.min(co.slotWin, windows.length - 1) : -1;
  const win = winIdx >= 0 ? windows[winIdx] : null;
  return { days, windows, day, dayIdx, win, winIdx };
}
export type Slots = ReturnType<typeof useSlots>;

// ---------------------------------------------------------------- pickup branches
export interface BranchOpt { b: Branch; km: number; open: OpenState }
export interface PickupGroup { g: CartGroup; opts: BranchOpt[]; selId: string | null; sel: BranchOpt | null }

/** Each shop's branches nearest-first, with the user's pick (or the nearest) selected. */
export function pickupGroupsOf(c: Commerce, co: Checkout, from: { lat: number; lon: number }, now: number): PickupGroup[] {
  return c.groups.map((g) => {
    const opts = c.d.branches.filter((b) => b.retailerId === g.rid)
      .map((b) => ({ b, km: c.d.engine.dist(from, b), open: c.d.engine.openState(b.id, now) }))
      .sort((a, b) => a.km - b.km);
    const selId = co.pickup[g.rid] || opts[0]?.b.id || null;
    return { g, opts, selId, sel: opts.find((o) => o.b.id === selId) || null };
  });
}

// ---------------------------------------------------------------- validation
export type FieldKey = 'name' | 'phone' | 'addr' | 'postcode' | 'city';
export type FieldErrors = Partial<Record<FieldKey, string>>;

const REQUIRED: { key: FieldKey; noun: string; delivery?: boolean }[] = [
  { key: 'name', noun: 'name' },
  { key: 'phone', noun: 'phone number' },
  { key: 'addr', noun: 'address', delivery: true },
  { key: 'postcode', noun: 'postcode', delivery: true },
  { key: 'city', noun: 'city', delivery: true },
];
const POSTCODE_RE = new RegExp('^\\d{' + POSTCODE_LEN + '}$');

/** Per-field errors plus the one-line summary shown above the actions. */
export function validateDetails(co: Checkout): { errors: FieldErrors; summary: string } {
  const delivery = co.ship === 'delivery';
  const missing = REQUIRED.filter((f) => (delivery || !f.delivery) && !co[f.key].trim());
  const errors: FieldErrors = Object.fromEntries(missing.map((f) => [f.key, 'Add your ' + f.noun + '.']));
  if (missing.length) return { errors, summary: 'Add your ' + missing.map((f) => f.noun).join(', ') + ' to continue.' };
  if (delivery && !POSTCODE_RE.test(co.postcode.trim())) return { errors: { postcode: POSTCODE_HINT }, summary: POSTCODE_HINT };
  return { errors: {}, summary: '' };
}

// ---------------------------------------------------------------- placing the order
/** Overlay choreography: the save is shown for at least MIN_SAVE_MS, then each later step is held for a beat. */
const MIN_SAVE_MS = 800, PREPARE_MS = 750, DONE_HOLD_MS = 650;
export const PROC_STEPS = ['Saving your order', 'Preparing retailer links', 'Done'] as const;

export function buildOrder(c: Commerce, co: Checkout, slots: Slots, branchOf: (rid: string) => Branch | null): NewOrder {
  const pickup = c.pickup;
  return {
    region: c.region,
    ship: co.ship,
    contact: { name: co.name.trim(), phone: co.phone.trim(), email: co.email.trim() },
    addr: pickup ? null : { line: co.addr.trim(), postcode: co.postcode.trim(), city: co.city.trim() },
    slot: pickup || !slots.day ? null : { day: slots.day.t, window: slots.win ?? '' },
    groups: c.groups.map((g): OrderGroup => ({
      retailerId: g.rid,
      name: g.name,
      items: g.items.map((i) => ({ productId: i.productId, name: i.name, cat: i.cat, price: i.price, url: i.url })),
      fee: g.feeRaw,
      eta: g.etaRaw,
      branchId: pickup ? branchOf(g.rid)?.id || null : null,
      status: 'to-buy',
    })),
    total: c.totalRaw,
  };
}

/** POSTs the order, records it in this browser, plays the hand-off overlay and lands on the order page. `proc` is the overlay step (0 = hidden). */
export function usePlaceOrder() {
  const go = useGo();
  const set = useRig((st) => st.set), setCo = useRig((st) => st.setCo);
  const [proc, setProc] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const t = timers.current;
    return () => { alive.current = false; t.forEach(clearTimeout); };
  }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  const place = (body: NewOrder) => {
    if (proc) return;
    setProc(1);
    setCo({ err: '' });
    // Not tracked in `timers`: the order must still be recorded if the page unmounts during the minimum wait.
    const minWait = new Promise<void>((r) => setTimeout(r, MIN_SAVE_MS));
    Promise.all([createOrder(body), minWait])
      .then(([order]) => {
        // Keep the order number in this browser right away, even if the page is left mid-animation.
        set((st) => ({ order, orders: [order.no].concat(st.orders.filter((x) => x !== order.no)), trackNo: order.no }));
        if (!alive.current) return;
        setProc(2);
        later(() => {
          setProc(3);
          later(() => {
            set((st) => ({ co: { ...st.co, step: 0, err: '' } }));
            setProc(0);
            go(href.order(order.no));
          }, DONE_HOLD_MS);
        }, PREPARE_MS);
      })
      .catch((e: unknown) => {
        if (!alive.current) return;
        setProc(0);
        setCo({ err: 'Could not save your order: ' + errMsg(e) + '. Try again.' });
      });
  };
  return { proc, place };
}
