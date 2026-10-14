import type { Data } from '@/lib/data';
import { fmt } from '@/lib/format';
import { color, tone } from '@/lib/tokens';
import type { Build, CatId, Check, Offer, PlanTotal, Power, RegionId } from '@/lib/types';
import type { CalloutNote, CableOpts } from '@/studio/types';

/**
 * Price text for one part from real offers only.
 *  - lowest available offer -> 'RM 1,234'
 *  - no listings at all      -> 'No price yet' (retailers not tracked / not ingested yet)
 *  - listings, none deliver  -> 'No delivery'
 *  - listings, none in stock -> 'Sold out'
 */
export function partPrice(d: Data, productId: string, region: RegionId): { text: string; price: number | null; offers: Offer[] } {
  const offers = d.engine.offers(productId, region);
  const lo = d.engine.lowest(productId, region);
  if (lo) return { text: fmt(lo.price), price: lo.price, offers };
  if (!offers.length) return { text: 'No price yet', price: null, offers };
  if (offers.every((o) => o.status === 'No delivery')) return { text: 'No delivery', price: null, offers };
  return { text: 'Sold out', price: null, offers };
}

/** Why a listed part has no price in a region, as a sentence ('' when it has one). */
export function noPriceNote(offers: Offer[], regionName: string): string {
  if (!offers.length) return '';
  if (offers.every((o) => o.status === 'No delivery')) return 'Listed at ' + offers.length + (offers.length === 1 ? ' shop' : ' shops') + ', none delivers to ' + regionName + ' yet';
  return 'No shop has it in stock for ' + regionName;
}

/** Text for an offer chosen by a plan, falling back to the reason it has none. */
export function choiceText(d: Data, productId: string, region: RegionId, o: Offer | null | undefined) {
  if (o) return fmt(o.price);
  return partPrice(d, productId, region).text;
}

/** Plan total + note, never inventing a number when nothing is priced. */
export function totalView(d: Data, build: Build, region: RegionId, t: PlanTotal, count: number): { total: string; note: string; priced: boolean } {
  if (!count) return { total: fmt(0), note: 'Add parts to see prices', priced: true };
  if (t.missing >= count) {
    const anyListing = d.categories.some((c) => build[c.id] && d.engine.offers(build[c.id]!, region).length > 0);
    return { total: '—', note: anyListing ? 'None of these parts is in stock right now' : 'Prices appear once retailers are tracked', priced: false };
  }
  const fee = t.fee ? fmt(t.fee) + ' delivery' : t.unknownFees ? 'delivery not quoted' : 'free delivery';
  const note = t.shops + (t.shops === 1 ? ' shop · ' : ' shops · ') + fee + (t.missing ? ' · ' + t.missing + (t.missing > 1 ? ' parts' : ' part') + ' without a price' : '');
  return { total: fmt(t.total), note, priced: true };
}

/** Scale used for the power bar when no PSU is chosen yet (watts). */
const POWER_SCALE_NO_PSU = 1000;

export interface PowerView { text: string; ratio: number; color: string; rec: string }
export function powerView(pw: Power): PowerView {
  return {
    text: pw.psu ? pw.est + ' W of ' + pw.psu + ' W' : pw.est + ' W estimated',
    ratio: Math.min(1, pw.est / (pw.psu || POWER_SCALE_NO_PSU)),
    color: !pw.psu ? color.muted : pw.psu < pw.est ? tone.error : pw.psu < pw.rec ? tone.warn : tone.ok,
    rec: pw.rec + ' W recommended for this CPU and graphics card',
  };
}

export function errText(errs: Check[]) {
  return errs.length + (errs.length > 1 ? ' issues need' : ' issue needs') + ' fixing before checkout: ' + errs.map((e) => e.label.toLowerCase()).join(', ') + '.';
}

/** Name of the preset whose parts exactly match the build, if any. */
export function presetName(d: Data, b: Build) {
  const pr = d.presets.find((p) => d.categories.every((c) => p.build[c.id] === b[c.id]));
  return pr ? pr.name : null;
}

/** Parts present in the build, for content gating (`cableRunsFor`). */
export const presence = (d: Data, b: Build): Partial<Record<CatId, boolean>> => Object.fromEntries(d.categories.map((c) => [c.id, !!b[c.id]]));

/** Callout shown when the studio focuses the cable runs. */
export const cableNote = (route: CableOpts['route']): CalloutNote => ({ title: 'Cable runs', sub: route === 'tidy' ? 'Managed routing' : 'As shipped' });

/** Two-digit step index, e.g. 2 -> '02'. */
export const idx2 = (n: number) => String(n).padStart(2, '0');
