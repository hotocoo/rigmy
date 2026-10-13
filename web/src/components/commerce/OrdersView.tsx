'use client';

import { useGo } from '@/components/shell/useGo';
import { Button, Chip, KvRow, Meta, Rows, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { dFmt, dLong, fmt, LOCALE, plural } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color, tone } from '@/lib/tokens';
import type { Order } from '@/lib/types';
import { useOrderAddr } from './orderParts';
import { HeadTotal, PageHead } from './parts';
import { ShipCard } from './ShipCard';
import { useOrders } from './useOrders';
import cs from './commerce.module.css';
import s from './orders.module.css';

/** Headline for where the order as a whole stands, from the statuses the user recorded. */
function headline(o: Order) {
  const pickup = o.ship === 'pickup', n = o.groups.length;
  const toBuy = o.groups.filter((g) => g.status === 'to-buy').length, got = o.groups.filter((g) => g.status === 'received').length;
  if (got === n) return pickup ? 'Everything is collected' : 'Everything has arrived';
  if (toBuy === n) return 'Buy from ' + plural(n, 'shop');
  if (toBuy) return toBuy + ' of ' + n + ' shops still to buy from';
  if (got) return got + ' of ' + n + (pickup ? ' pickups collected' : ' shipments received');
  return plural(n, pickup ? 'pickup' : 'shipment') + (pickup ? ' being prepared' : ' on the way');
}

function OrderHead({ o }: { o: Order }) {
  const placed = dFmt(o.placedAt, true) + ', ' + new Date(o.placedAt).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
  return (
    <PageHead reveal variant="track" eyebrow={'Order ' + o.no + ' · placed ' + placed} eyebrowColor={color.blueSoft} title={headline(o)}
      lead={o.ship === 'pickup' ? 'Each shop holds your parts once it confirms them. Update each shop below as you go.' : 'Each shop ships separately with its own courier. Record the tracking number here once the shop sends it.'}
      right={<HeadTotal size="md" value={fmt(o.total)} note="Paid at each retailer" />} />
  );
}

export function OrdersView() {
  const go = useGo();
  const nos = useRig((st) => st.orders), trackNo = useRig((st) => st.trackNo), last = useRig((st) => st.order), set = useRig((st) => st.set);
  const { map, errs, put } = useOrders(nos, last);
  const addrOf = useOrderAddr();
  const sel = trackNo && nos.includes(trackNo) ? trackNo : nos[0];
  const o = sel ? map[sel] : undefined;

  if (!sel) {
    return (
      <div className={cx(cs.page, cs.wTrack)}>
        <div data-rv="1" className={cx(cs.empty, cs.emptyNone)}>
          <Text v="pageHero" as="h1" className={cs.balance}>No orders yet</Text>
          <Text v="body" as="p" className={cs.lead}>Orders you place appear here, so you can open each shop again and record what you bought and how it ships.</Text>
          <Button onClick={() => go(ROUTES.build.path)}>Start a build</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cx(cs.page, cs.wTrack)}>
      {o ? <OrderHead o={o} /> : (
        <>
          <PageHead reveal variant="track" eyebrow={'Order ' + sel + (o === null ? ' · unavailable' : ' · loading')} eyebrowColor={o === null ? tone.error : color.blueSoft}
            title={o === null ? 'This order could not be loaded' : 'Loading your order'}
            lead={o === null ? (errs[sel] ? errs[sel] + '. ' : '') + 'It may have been removed from the server.' : undefined} />
          {o === null && <div><Button variant="ghost" onClick={() => set((st) => ({ orders: st.orders.filter((x) => x !== sel), trackNo: null }))}>Forget this order</Button></div>}
        </>
      )}
      {nos.length > 1 && (
        <div className={s.chips} role="group" aria-label="Your orders">
          {nos.map((no) => {
            const x = map[no];
            return <Chip key={no} on={no === sel} onClick={() => set({ trackNo: no })}>{no + (x ? ' · ' + dFmt(x.placedAt) : '')}</Chip>;
          })}
        </div>
      )}
      {o && (
        <>
          {o.groups.map((g) => <ShipCard key={o.no + ':' + g.retailerId} o={o} g={g} put={put} />)}
          <Rows density="compact" data-rv="1">
            <KvRow label="Contact">{[o.contact.name, o.contact.phone, o.contact.email].filter(Boolean).join(' · ')}</KvRow>
            {o.slot && <KvRow label="Preferred">{dLong(o.slot.day) + (o.slot.window ? ', ' + o.slot.window : '')}</KvRow>}
            <KvRow label={o.ship === 'pickup' ? 'Pickup' : 'Deliver to'}>{addrOf(o)}</KvRow>
          </Rows>
          <Meta>Statuses here are the ones you record. RigMY does not receive updates from shops or couriers.</Meta>
        </>
      )}
    </div>
  );
}
