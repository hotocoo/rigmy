'use client';

import { Dot, Meta, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { useData } from '@/lib/data';
import { fmt, hostOf, stockColor } from '@/lib/format';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import { priceOf } from './derive';
import p from './part.module.css';

/** Every retailer listing for the part in the user's region: availability first, then cheapest. */
export function OffersTable({ productId, regionName }: { productId: string; regionName: string }) {
  const d = useData();
  const region = useRig((x) => x.region);
  const { lo, offers } = priceOf(d, productId, region);
  const rows = offers.slice().sort((a, b) => Number(b.avail) - Number(a.avail) || a.price - b.price);
  return (
    <section data-rv="1" className={p.offers}>
      <div className={p.sectionHead}>
        <Text v="h3" as="h2">Online prices in {regionName}</Text>
        <Text v="metaTight">Delivery fees and times for your region</Text>
      </div>
      <div className={p.tableWrap}>
        <table className={p.offerTable}>
          <caption className="sr-only">{'Retailer prices for this part in ' + regionName + (lo ? ', lowest first among those in stock' : '')}</caption>
          <colgroup>
            <col className={p.cRetailer} /><col className={p.cStock} /><col className={p.cEta} /><col className={p.cFee} /><col className={p.cWarranty} /><col className={p.cPrice} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Retailer</th>
              <th scope="col">Stock</th>
              <th scope="col">Arrives</th>
              <th scope="col">Delivery</th>
              <th scope="col">Warranty · payment</th>
              <th scope="col" className={p.right}>Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const r = d.retailerById[o.retailerId], best = !!lo && o.retailerId === lo.retailerId, status = o.status || o.stock;
              return (
                <tr key={o.retailerId} className={cx(best && p.bestRow)}>
                  <th scope="row">
                    <div className={p.stack}>
                      <span className={p.retName}>{r?.name || o.retailerId}</span>
                      <span className={p.sub}>{[r?.city, r?.website ? hostOf(r.website) : ''].filter(Boolean).join(' · ')}</span>
                    </div>
                  </th>
                  <td style={{ color: stockColor(status) }}>{status}</td>
                  <td className={p.soft}>{o.avail && o.eta ? o.eta : '—'}</td>
                  <td className={p.soft}>{!o.avail ? '—' : o.fee == null ? 'At checkout' : o.fee ? fmt(o.fee) : 'Free'}</td>
                  <td className={p.softer}><div className={p.stack}><span>{o.warranty}</span>{r?.pay && <span className={p.sub}>{r.pay}</span>}</div></td>
                  <td className={p.right}>
                    <div className={cx(p.stack, p.stackEnd)}>
                      <span className={cx(p.offerPrice, best && p.offerBest, !o.avail && p.offerOff)}>{fmt(o.price)}</span>
                      {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer" className={p.retailerLink}>View at retailer ↗<span className="sr-only"> {r?.name || o.retailerId} (opens in a new tab)</span></a>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className={p.noOffersCell}>
                  <div className={p.noOffers}><Dot c={color.dim} glowPx={0} /><Meta c={color.muted}>No retailer listings tracked for this part yet</Meta></div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
