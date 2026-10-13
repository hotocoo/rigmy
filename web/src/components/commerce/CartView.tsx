'use client';

import { useGo } from '@/components/shell/useGo';
import { Button, Eyebrow, Meta, Notice, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { fmt, plural } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { color } from '@/lib/tokens';
import type { Product } from '@/lib/types';
import { CardHead, ItemRow, PageHead, SummaryTotals } from './parts';
import { useCommerce, type CartGroup, type Commerce } from './useCommerce';
import { stepLabel } from './util';
import s from './commerce.module.css';

function GroupCard({ g }: { g: CartGroup }) {
  return (
    <section data-rv="1" className={s.card} aria-label={g.name}>
      <CardHead title={g.name} meta={g.city + ' · ' + g.count} eta={g.eta} side={'Delivery ' + g.fee} />
      {g.items.map((i) => <ItemRow key={i.productId} cat={i.catLong} name={i.name} price={fmt(i.price)} />)}
    </section>
  );
}

/** Parts with no buyable listing in the region: kept visible so the cart never silently drops a part. */
function MissingCard({ parts, c }: { parts: Product[]; c: Commerce }) {
  if (!parts.length) return null;
  return (
    <section data-rv="1" className={cx(s.card, s.cardMissing)} aria-label="Parts without listings">
      <CardHead title="No retailer listings yet" titleColor={color.fg3} meta={'Not buyable for delivery to ' + c.regionName + ' · ' + plural(parts.length, 'part')} />
      {parts.map((p) => <ItemRow key={p.id} muted cat={p.cat ? c.d.cat(p.cat)?.long || p.cat : p.market || 'Other'} name={p.name} price="—" />)}
    </section>
  );
}

function CartSummary({ c }: { c: Commerce }) {
  const go = useGo();
  const blocked = c.errs.length > 0;
  return (
    <aside className={s.aside} aria-label="Summary">
      <Eyebrow>Summary</Eyebrow>
      <SummaryTotals parts={c.partsText} fee={c.feeText} total={c.totalText} />
      <Meta>{c.payNote}</Meta>
      {blocked && (
        <>
          <Notice tone="error">{c.errText}</Notice>
          <Button variant="dangerOutline" size="tall" full onClick={() => go(ROUTES.review.path)}>Fix in review</Button>
        </>
      )}
      {!blocked && !c.has && <Notice tone="info">No retailer listings yet for these parts in {c.regionName}. Checkout opens once a shop lists them.</Notice>}
      {!blocked && c.has && <Button size="lg" full onClick={() => go(ROUTES.checkout.path)}>Checkout</Button>}
      <Button variant="mini" size="mdc" onClick={() => go(ROUTES.prices.path)}>Change shops</Button>
    </aside>
  );
}

export function CartView() {
  const go = useGo();
  const c = useCommerce();
  return (
    <div className={cx(s.page, s.wCart)}>
      <PageHead eyebrow={stepLabel(ROUTES.cart.step) + ' · ' + c.cartPlan} title="Cart" />
      {c.count === 0 ? (
        <div className={s.empty}>
          <Text v="body" as="p" className={s.p}>Your cart is empty.</Text>
          <Button onClick={() => go(ROUTES.build.path)}>Start a build</Button>
        </div>
      ) : (
        <div className={s.layout}>
          <div className={s.main}>
            {c.groups.map((g) => <GroupCard key={g.rid} g={g} />)}
            <MissingCard parts={c.missing} c={c} />
          </div>
          <CartSummary c={c} />
        </div>
      )}
    </div>
  );
}
