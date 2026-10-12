'use client';

import { Chip, Field } from '@/components/ui';
import { useLocate } from '@/lib/location';
import { useRig } from '@/lib/store';
import type { ShipMode } from '@/lib/types';
import { DeliveryFields } from './DeliveryFields';
import { PickupFields } from './PickupFields';
import type { FieldErrors, FieldKey, PickupGroup, Slots } from './useCheckout';
import type { Commerce } from './useCommerce';
import s from './checkout.module.css';

const SHIP_MODES: { id: ShipMode; label: string; note: string }[] = [
  { id: 'delivery', label: 'Home delivery', note: 'Each shop ships to your address.' },
  { id: 'pickup', label: 'Store pickup', note: 'Collect from each shop. No delivery fees.' },
];

export interface DetailsProps {
  c: Commerce;
  slots: Slots;
  pickupGroups: PickupGroup[];
  errors: FieldErrors;
  setField: (k: FieldKey, v: string) => void;
}

/** Step 1: how to receive the parts, contact details, then address + slot or pickup branches. */
export function DetailsStep(p: DetailsProps) {
  const co = useRig((st) => st.co), setCo = useRig((st) => st.setCo);
  const locator = useLocate();
  const { errors, setField } = p;
  return (
    <>
      <div className={s.shipModes} role="group" aria-label="How to receive your parts">
        {SHIP_MODES.map((m) => (
          <Chip key={m.id} size="block" className={s.shipMode} on={co.ship === m.id} onClick={() => setCo({ ship: m.id, err: '' })}>
            <span className={s.optTitle}>{m.label}</span>
            <span className={s.optNote}>{m.note}</span>
          </Chip>
        ))}
      </div>
      <div className={s.contactGrid}>
        <Field label="Full name" name="name" autoComplete="name" required value={co.name} onValue={(v) => setField('name', v)} placeholder="Aina binti Hassan" error={errors.name} />
        <Field label="Phone" name="tel" type="tel" inputMode="tel" autoComplete="tel" required mono value={co.phone} onValue={(v) => setField('phone', v)} placeholder="012-345 6789" error={errors.phone} />
        <Field label="Email for receipts" name="email" type="email" inputMode="email" autoComplete="email" value={co.email} onValue={(v) => setCo({ email: v })} placeholder="aina@email.com" />
      </div>
      {p.c.pickup ? <PickupFields {...p} locator={locator} /> : <DeliveryFields {...p} locator={locator} />}
    </>
  );
}
