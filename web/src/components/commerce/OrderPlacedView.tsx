'use client';

import { useGo } from '@/components/shell/useGo';
import { Button, KvRow, Rows, StepBar, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { fmt, plural } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color, tone } from '@/lib/tokens';
import type { Order } from '@/lib/types';
import { BuyButton, groupEta, useOrderAddr } from './orderParts';
import { PageHead } from './parts';
import { useOrders } from './useOrders';
import { countText } from './util';
import cs from './commerce.module.css';
import s from './orders.module.css';

/** Where a fresh order stands: saved, now the user buys at each shop, then the shops take over. */
const timelineOf = (o: Order) => ['Order saved', 'Buy at each shop', o.ship === 'pickup' ? 'Ready for pickup' : 'Shipped', o.ship === 'pickup' ? 'Collected' : 'Received'];
/** The step a freshly placed order is at: saved, and the user now buys at each shop. */
const BUYING = 1;

export function OrderPlacedView({ no }: { no: string }) {
  const go = useGo();
  const last = useRig((st) => st.order);
  const { map } = useOrders([no], last && last.no === no ? last : null);
  const o = map[no];
  const addrOf = useOrderAddr();

  if (!o) {
    const missing = o === null;
    return (
      <div className={cx(cs.page, cs.wDone)}>
        <PageHead reveal variant="done" eyebrow={(missing ? 'Not found · ' : 'Loading · ') + no} eyebrowColor={missing ? tone.error : color.blueSoft}
          title={missing ? 'We couldn’t find this order' : 'Loading your order'}
          lead={missing ? 'Check the order number, or open the Orders page to see the orders placed from this browser.' : undefined} />
        {missing && <div><Button onClick={() => go(ROUTES.orders.path)}>Open orders</Button></div>}
      </div>
    );
  }

  const pickup = o.ship === 'pickup';
  return (
    <div className={cx(cs.page, cs.wDone)}>
      <PageHead reveal variant="done" eyebrow={'Order placed · ' + o.no} eyebrowColor={tone.ok} title="Thanks, now buy from each shop"
        lead={fmt(o.total) + ' across ' + plural(o.groups.length, 'retailer') + '. Purchases are completed on each retailer’s own site and paid to them directly; RigMY has not charged you. Open each shop below, then record its tracking number on the Orders page.'} />
      <StepBar variant="timeline" steps={timelineOf(o)} current={BUYING} label="Order progress" />
      <Rows density="compact">
        {o.groups.map((g) => (
          <section key={g.retailerId} className={s.shop} aria-label={g.name}>
            <div className={s.shopHead}>
              <span className={s.shopName}>{g.name + ' · ' + countText(g.items.length)}</span>
              <span className={s.shopEta}>{groupEta(o, g)}</span>
            </div>
            <ul className={s.itemList}>
              {g.items.map((i) => (
                <li key={i.productId} className={s.itemLine}>
                  {i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer" className={s.itemLink}>{i.name}<span aria-hidden> ↗</span></a> : <span>{i.name}</span>}
                  <span>{fmt(i.price)}</span>
                </li>
              ))}
            </ul>
            <div className={s.shopFoot}>
              <BuyButton g={g} />
              <Text v="metaTight">{pickup ? 'Store pickup' : 'Delivery ' + (g.fee == null ? 'fee set by the shop' : g.fee ? fmt(g.fee) : 'free')}</Text>
            </div>
          </section>
        ))}
        <KvRow label={pickup ? 'Collect from' : 'Deliver to'}>{o.contact.name + ' · ' + addrOf(o)}</KvRow>
      </Rows>
      <p className={cx(s.note, cs.p)}>Each Buy button opens every item from that shop in new tabs. If your browser blocks extra tabs, use the item links above.</p>
      <div className={cx(cs.actions, cs.actionsStart)}>
        <Button onClick={() => go(ROUTES.orders.path, { trackNo: o.no })}>Track your order</Button>
        <Button variant="ghost" onClick={() => go(ROUTES.guide.path)}>Open the build guide</Button>
        <Button variant="ghost" size="tall" wide onClick={() => go(ROUTES.build.path, { build: {}, picks: {}, order: null })}>Start another build</Button>
      </div>
    </div>
  );
}
