'use client';

import { useState, type FormEvent } from 'react';
import { toast } from '@/components/shell/motion';
import { Button, Field, LinkButton, Meta, Stepper, Text } from '@/components/ui';
import { trackingUrl } from '@/lib/content';
import { useData } from '@/lib/data';
import { directionsUrl } from '@/lib/location';
import { color, tone } from '@/lib/tokens';
import type { Order, OrderGroup } from '@/lib/types';
import { BuyButton } from './orderParts';
import { patchGroup, type GroupPatch } from './useOrders';
import { countText, errMsg, etaLower } from './util';
import s from './orders.module.css';

type Status = OrderGroup['status'];
/** Step index of each recorded status (pickup uses `ready` where delivery uses `shipped`). */
const STEP_OF: Record<Status, number> = { 'to-buy': 0, purchased: 1, shipped: 2, ready: 2, received: 3 };
const statusAt = (i: number, pickup: boolean): Status => (['to-buy', 'purchased', pickup ? 'ready' : 'shipped', 'received'] as const)[i];
const stepsFor = (pickup: boolean) => ['To buy', 'Purchased', pickup ? 'Ready for pickup' : 'Shipped', pickup ? 'Collected' : 'Received'];
const nextLabel = (k: number, pickup: boolean) => ['Mark as purchased', pickup ? 'Mark ready for pickup' : 'Mark as shipped', pickup ? 'Mark as collected' : 'Mark as received'][k];
/** Server-side limits for the free-text courier and tracking fields. */
const COURIER_MAX = 40, TRACKING_MAX = 40;

/** One shop of an order: recorded status, courier + tracking number, and the next action. */
export function ShipCard({ o, g, put }: { o: Order; g: OrderGroup; put: (o: Order) => void }) {
  const d = useData();
  const pickup = o.ship === 'pickup';
  const steps = stepsFor(pickup), n = steps.length, k = STEP_OF[g.status] ?? 0, done = k === n - 1;
  const col = done ? tone.ok : color.blue;
  const br = g.branchId ? d.branchById[g.branchId] : null;
  const branch = br ? br.name : 'the shop';
  const [courier, setCourier] = useState(g.courier || d.retailerById[g.retailerId]?.courier || '');
  const [tracking, setTracking] = useState(g.tracking || '');
  const [busy, setBusy] = useState(false);
  const url = trackingUrl(d, g.courier, g.tracking);
  const dirty = courier.trim() !== (g.courier || '') || tracking.trim() !== (g.tracking || '');

  const patch = (body: GroupPatch, ok: string) => {
    if (busy) return;
    setBusy(true);
    patchGroup(o.no, g.retailerId, body)
      .then((x) => { put(x); toast(ok); })
      .catch((e: unknown) => toast('Could not update · ' + errMsg(e)))
      .finally(() => setBusy(false));
  };
  const setStep = (i: number) => { const st = statusAt(i, pickup); if (st !== g.status) patch({ status: st }, g.name + ' · ' + steps[i].toLowerCase()); };
  const saveTracking = (e: FormEvent) => {
    e.preventDefault();
    if (dirty) patch({ courier: courier.trim() || null, tracking: tracking.trim() || null }, 'Tracking saved');
  };

  const carrier = pickup ? 'Store pickup · ' + (br ? br.name : 'branch to confirm') : g.tracking ? (g.courier ? g.courier + ' · ' : '') + g.tracking : 'No tracking number yet';
  const eta = done ? (pickup ? 'Collected from ' + branch : 'Received')
    : k === 0 ? 'Buy at ' + g.name + ', then mark it purchased'
      : k === 1 ? (pickup ? 'Waiting for ' + g.name + ' to say it is ready' : 'Waiting for ' + g.name + ' to ship · usually ' + etaLower(g.eta))
        : pickup ? 'Ready at ' + branch : 'On the way' + (g.courier ? ' with ' + g.courier : '');
  const listId = 'couriers-' + o.no + '-' + g.retailerId;

  return (
    <section data-rv="1" className={s.ship} aria-label={g.name}>
      <div className={s.shipHead}>
        <div className={s.shipText}>
          <Text v="titleMd" as="h2">{g.name + ' · ' + countText(g.items.length)}</Text>
          <Meta>{g.items.map((i) => i.name).join(' · ')}</Meta>
        </div>
        <div className={s.shipSide}>
          <span className={s.shipStatus} style={{ color: col }}>{steps[k]}</span>
          <Meta>{carrier}</Meta>
        </div>
      </div>
      <Stepper steps={steps} current={k} c={col} busy={busy} onPick={setStep} label={'Status at ' + g.name} stepTitle={(l) => 'Set to ' + l.toLowerCase()} />
      {!pickup && k >= 1 && (
        <form className={s.trackForm} onSubmit={saveTracking} aria-label={'Tracking for ' + g.name}>
          <Field label="Courier" size="inline" name="courier" list={listId} autoComplete="off" maxLength={COURIER_MAX}
            value={courier} onValue={(v) => setCourier(v.slice(0, COURIER_MAX))} placeholder={d.content.couriers[0] ? 'e.g. ' + d.content.couriers[0].name : 'Courier name'} />
          <Field label="Tracking number" size="inline" name="tracking" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={TRACKING_MAX}
            value={tracking} onValue={(v) => setTracking(v.replace(/\s+/g, '').slice(0, TRACKING_MAX))} placeholder="From the shop's shipping email" />
          <Button type="submit" variant="ghost" size="inline" disabled={!dirty || busy}>Save</Button>
          <datalist id={listId}>{d.content.couriers.map((x) => <option key={x.name} value={x.name} />)}</datalist>
        </form>
      )}
      <div className={s.shipFoot}>
        <span className={s.shipEta}>{eta}</span>
        <span className={s.shipActions}>
          {k === 0 && <BuyButton g={g} />}
          {url && <LinkButton variant="mini" href={url} external>{'Track with ' + g.courier}</LinkButton>}
          {pickup && br && <LinkButton variant="mini" href={directionsUrl(br.lat, br.lon)} external>{'Directions to ' + br.name}</LinkButton>}
          {!done && <Button variant="accent" size="mini" onClick={() => setStep(k + 1)} busy={busy}>{nextLabel(k, pickup)}</Button>}
        </span>
      </div>
    </section>
  );
}
