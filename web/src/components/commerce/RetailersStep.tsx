'use client';

import { Notice, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { fmt, hostOf } from '@/lib/format';
import { CardHead } from './parts';
import type { CartGroup } from './useCommerce';
import s from './checkout.module.css';
import cs from './commerce.module.css';

/** Step 2: what buying through RigMY means, and every shop's product links and payment terms. */
export function RetailersStep({ groups, pickup, branchOf }: { groups: CartGroup[]; pickup: boolean; branchOf: (rid: string) => string | null }) {
  return (
    <>
      <Notice tone="callout" stack>
        <Text v="strong">RigMY does not take payment</Text>
        <span className={cs.calloutBody}>You buy each part on the retailer&apos;s own site and pay them directly. Prices and stock can change there. We save this order so you can open every shop again and record tracking.</span>
      </Notice>
      {groups.map((g) => <HandoffCard key={g.rid} g={g} pickup={pickup} branch={branchOf(g.rid)} />)}
    </>
  );
}

function HandoffCard({ g, pickup, branch }: { g: CartGroup; pickup: boolean; branch: string | null }) {
  return (
    <section data-rv="1" className={cs.card} aria-label={g.name}>
      <CardHead title={g.name} meta={g.city + ' · ' + g.count + ' · ' + g.sub} eta={g.eta}
        side={pickup ? 'Pickup · ' + (branch || g.r.pickup || 'arrange with the shop') : 'Delivery ' + g.fee} />
      {g.items.map((i) => (
        <div key={i.productId} className={cs.item}>
          <Text v="tagLoose">{i.catLong}</Text>
          <span className={cs.stack}>
            <Text v="label">{i.name}</Text>
            {i.url
              ? <a href={i.url} target="_blank" rel="noopener noreferrer" className={s.itemLink}>{'Open at ' + g.name}<span aria-hidden> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>
              : <span className={s.noLink}>No product link</span>}
          </span>
          <Text v="dataLg">{fmt(i.price)}</Text>
        </div>
      ))}
      <div className={cx(cs.item, cs.itemPlain)}>
        <Text v="tagLoose">Pays with</Text>
        <span className={s.pays}>
          <span>{g.r.pay || 'Check payment options on the shop’s site'}</span>
          {g.r.website && <a href={g.r.website} target="_blank" rel="noopener noreferrer" className={s.site}>{hostOf(g.r.website)}<span aria-hidden> ↗</span></a>}
        </span>
      </div>
    </section>
  );
}
