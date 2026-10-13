'use client';

import { KvRow, Rows, Text } from '@/components/ui';
import { plural } from '@/lib/format';
import { useRig } from '@/lib/store';
import type { PickupGroup, Slots } from './useCheckout';
import type { Commerce } from './useCommerce';
import { etaLower } from './util';
import s from './checkout.module.css';
import cs from './commerce.module.css';

/** Step 3: contact, destination, timing and payment, then one line per shop. */
export function ReviewStep({ c, slots, pickupGroups }: { c: Commerce; slots: Slots; pickupGroups: PickupGroup[] }) {
  const co = useRig((st) => st.co);
  const { groups, pickup } = c;
  const where = pickup
    ? pickupGroups.map((p) => (p.sel ? p.sel.b.name : 'Branch to confirm') + ' (' + p.g.name + ')').join(' · ')
    : [co.addr, (co.postcode + ' ' + co.city).trim(), c.regionName].filter(Boolean).join(', ');
  const when = pickup
    ? 'When each shop confirms · ' + groups.map((g) => etaLower(g.etaRaw)).join(', ')
    : slots.day
      ? slots.day.dow + ' ' + slots.day.date + (slots.win ? ', ' + slots.win : '') + ' · your preference'
      : 'Arrange with each shop';
  return (
    <>
      <Rows density="compact">
        <KvRow label="Contact">{[co.name, co.phone, co.email].filter(Boolean).join(' · ')}</KvRow>
        <KvRow label={pickup ? 'Collect from' : 'Deliver to'}>{where}</KvRow>
        <KvRow label="When">{when}</KvRow>
        <KvRow label="Payment">{'Directly at ' + (groups.length === 1 ? groups[0].name : plural(groups.length, 'retailer')) + ', on their sites'}</KvRow>
      </Rows>
      {groups.map((g) => (
        <div key={g.rid} className={s.shopLine}>
          <span className={cs.stack}>
            <span className={s.shopName}>{g.name + ' · ' + g.count}</span>
            <Text v="metaTight">{g.eta}</Text>
          </span>
          <span className={s.shopSub}>{g.sub}</span>
        </div>
      ))}
    </>
  );
}
