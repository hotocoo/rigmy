import type { Data } from '@/lib/data';
import { fmt } from '@/lib/format';
import type { Build, RegionId } from '@/lib/types';
import { partPrice } from './shared';

/** Quote a CSV field (RFC 4180): always quoted, embedded quotes doubled. */
const esc = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';

/**
 * CSV of the current build: one row per selected part, using the lowest
 * available offer in the region. Unpriced parts keep the honest status text
 * ('No price yet', 'Sold out', ...) with a blank price. The total row is the
 * engine's lowest total including delivery, and is omitted when nothing is
 * priced (never a guessed number).
 */
export function buildCsv(d: Data, build: Build, region: RegionId): string {
  const rows: (string | number)[][] = [['Slot', 'Part', 'Brand', 'Price (RM)', 'Retailer', 'Stock', 'Delivery', 'URL']];
  let count = 0;
  for (const c of d.categories) {
    const id = build[c.id];
    if (!id) continue;
    const p = d.byId[id];
    if (!p) continue;
    count++;
    const pp = partPrice(d, id, region);
    const lo = pp.price != null ? d.engine.lowest(id, region) : null;
    rows.push([
      c.long,
      p.name,
      p.brand,
      lo ? lo.price : '',
      lo ? d.retailerById[lo.retailerId]?.name ?? lo.retailerId : '',
      lo ? lo.status : pp.text,
      lo ? (lo.fee == null ? 'Quoted at checkout' : lo.fee === 0 ? 'Free' : fmt(lo.fee)) : '',
      lo ? lo.url : '',
    ]);
  }
  if (count > 0) {
    const plan = d.engine.plan(build, region, {});
    if (plan.best.missing < count) {
      rows.push(['Total (lowest, incl. delivery)', '', '', plan.best.total, '', '', '', '']);
    } else {
      rows.push(['Total', '', '', '', 'No priced parts in this region yet', '', '', '']);
    }
  }
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

/** Trigger a client-side download of the build CSV. */
export function downloadCsv(d: Data, build: Build, region: RegionId): void {
  const blob = new Blob([buildCsv(d, build, region)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rigmy-build-' + region + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
