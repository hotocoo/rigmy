import { partPrice } from '@/components/build/shared';
import type { Data } from '@/lib/data';
import { specVal } from '@/lib/format';
import type { Build, Offer, Product, RegionId, Tone } from '@/lib/types';

/** How the part fits the current build, from the engine's compatibility checks. */
export function fitOf(d: Data, build: Build, p: Product): { text: string; tone: Tone } {
  if (!p.cat) return { text: 'Market listing · not buildable', tone: 'info' };
  const cat = p.cat;
  const issues = d.engine.compat({ ...build, [cat]: p.id }).filter((c) => (c.status === 'error' || c.status === 'warn') && c.parts.includes(cat));
  if (!issues.length) {
    const others = Object.keys(build).filter((k) => k !== cat).length;
    return { text: others ? 'Fits your build' : 'No conflicts yet', tone: 'ok' };
  }
  const worst = issues.find((i) => i.status === 'error') || issues[0];
  return { text: worst.label + ' · ' + worst.value, tone: worst.status };
}

/** Labelled spec values for a product, skipping specs it does not have. */
export function specRows(d: Data, p: Product) {
  if (!p.cat) return [];
  return (d.specdef[p.cat] || []).map(([k, label, unit]) => ({ label, value: specVal(p.specs[k], unit) })).filter((r) => r.value !== '—');
}

export interface PartPricing {
  /** Lowest available offer in the region, or null. */
  lo: Offer | null;
  offers: Offer[];
  /** At least one retailer lists the part (in any stock state). */
  listed: boolean;
  /** Retailers that can deliver it in the region now. */
  avail: number;
  /** Honest label when there is no price: listed but unavailable vs never listed. */
  empty: string;
}
export function priceOf(d: Data, pid: string, region: RegionId): PartPricing {
  const offers = d.engine.offers(pid, region);
  return {
    lo: d.engine.lowest(pid, region),
    offers,
    listed: offers.length > 0,
    avail: offers.filter((o) => o.avail).length,
    empty: partPrice(d, pid, region).text,
  };
}

