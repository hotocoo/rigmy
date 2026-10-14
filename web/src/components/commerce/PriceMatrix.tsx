'use client';

import { Eyebrow, Text } from '@/components/ui';
import { fmt } from '@/lib/format';
import { useRig } from '@/lib/store';
import type { Offer, PlanRow, Retailer } from '@/lib/types';
import type { Commerce } from './useCommerce';
import s from './prices.module.css';

/** Column geometry: the part column is 1.6× a retailer column; columns never shrink below these widths (the table scrolls instead). */
const PART_SHARE = 1.6, PART_MIN_PX = 200, RETAILER_MIN_PX = 117, TABLE_MIN_PX = 560;

function cellText(o: Offer | undefined) {
  if (!o) return { text: '—', sub: 'Not listed' };
  if (o.avail) return { text: fmt(o.price), sub: o.eta || '' };
  if (o.status === 'No delivery') return { text: 'No delivery', sub: '' };
  if (o.stock === 'Out of stock') return { text: 'Sold out', sub: '' };
  return { text: o.stock === 'Unknown' ? 'Stock unknown' : o.stock, sub: fmt(o.price) };
}

/** Every offer for every part, one column per configured retailer; tapping an available price pins that shop for the part. */
export function PriceMatrix({ c }: { c: Commerce }) {
  const retailers = c.d.retailers, n = retailers.length;
  return (
    <section className={s.section} aria-labelledby="price-matrix-title">
      <h2 id="price-matrix-title" className={s.h2}><Eyebrow>Every offer · tap a price to pick that shop</Eyebrow></h2>
      {n === 0 ? (
        <div className={s.none}>
          <Text v="titleSm">No retailer listings yet</Text>
          <span className={s.noneBody}>Prices appear here once retailers are configured and their listings have been checked.</span>
        </div>
      ) : (
        <div className={s.scroll}>
          <table className={s.table} style={{ minWidth: Math.max(TABLE_MIN_PX, PART_MIN_PX + RETAILER_MIN_PX * n) }}>
            <colgroup>
              <col style={{ width: (PART_SHARE / (PART_SHARE + n)) * 100 + '%' }} />
              {retailers.map((r) => <col key={r.id} />)}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={s.partHead}>Part</th>
                {retailers.map((r) => (
                  <th key={r.id} scope="col" className={s.colHead}>
                    <span className={s.headStack}><span className={s.retailerName}>{r.name}</span><Text v="caption">{r.city}</Text></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.plan.rows.map((row) => <MatrixRow key={row.p.id} row={row} retailers={retailers} c={c} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MatrixRow({ row, retailers, c }: { row: PlanRow; retailers: Retailer[]; c: Commerce }) {
  const set = useRig((st) => st.set);
  const picked = c.chosen.choice[row.p.id];
  const pick = (rid: string) => set((st) => ({ picks: { ...st.picks, [row.p.id]: rid }, planMode: 'custom' }));
  return (
    <tr>
      <th scope="row" className={s.rowHead}>
        <span className={s.headStack}>
          <span className={s.catLabel}>{row.p.cat ? c.d.cat(row.p.cat)?.label || row.p.cat : row.p.market || 'Other'}</span>
          <Text v="uiSm">{row.p.name}</Text>
          {!row.offers.length && <span className={s.unlisted}>No retailer listings yet</span>}
        </span>
      </th>
      {retailers.map((r) => {
        const o = row.offers.find((x) => x.retailerId === r.id);
        const avail = !!o?.avail, on = !!(picked && o && picked.retailerId === o.retailerId);
        const t = cellText(o);
        return (
          <td key={r.id} className={s.cell}>
            <button type="button" className={s.pick} disabled={!avail} aria-pressed={avail ? on : undefined} onClick={() => pick(r.id)}
              aria-label={t.text + (t.sub ? ', ' + t.sub : '') + ' at ' + r.name + (avail ? (on ? ', picked' : ', pick this shop') : '')}>
              <span className={s.pickPrice}>{t.text}</span>
              <Text v="caption">{t.sub}</Text>
            </button>
          </td>
        );
      })}
    </tr>
  );
}
