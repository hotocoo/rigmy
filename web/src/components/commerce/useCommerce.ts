'use client';

import { useMemo } from 'react';
import { etaRank, regionById } from '@/lib/content';
import { useData, type Data } from '@/lib/data';
import { dFmt, fmt, MODE_LABEL, plural } from '@/lib/format';
import { useRig } from '@/lib/store';
import type { CatId, Choice, Eta, Product, RegionId, Retailer } from '@/lib/types';
import { countText, etaLower } from './util';

export interface CartItem { productId: string; name: string; cat: CatId; catLong: string; price: number; url: string }
export interface CartGroup {
  rid: string;
  r: Retailer;
  name: string;
  city: string;
  items: CartItem[];
  etaRaw: Eta | null;
  /** "Arrives in …" / "Ready for pickup in …". */
  eta: string;
  feeRaw: number | null;
  fee: string;
  count: string;
  subRaw: number;
  sub: string;
}

/** The chosen offers grouped per retailer, with that retailer's delivery terms for the region. */
export function groupsOf(d: Data, choice: Choice, region: RegionId, pickup: boolean): CartGroup[] {
  const g = new Map<string, { r: Retailer; items: CartItem[]; eta: Eta | null }>();
  for (const pid in choice) {
    const o = choice[pid], p = d.byId[pid];
    const r = o ? d.retailerById[o.retailerId] : undefined;
    if (!o || !p || !r) continue;
    if (!p.cat) continue; // cart is build-based; market listings cannot be bought from it
    const x = g.get(r.id) ?? { r, items: [], eta: null };
    g.set(r.id, x);
    x.items.push({ productId: p.id, name: p.name, cat: p.cat, catLong: d.cat(p.cat)?.long || p.cat, price: o.price, url: o.url });
    if (o.eta && (!x.eta || etaRank(d, o.eta) > etaRank(d, x.eta))) x.eta = o.eta;
  }
  return Array.from(g.values(), (x) => {
    const del = x.r.delivery[region];
    const feeRaw = pickup ? 0 : del ? del.fee ?? null : null;
    const subRaw = x.items.reduce((a, i) => a + i.price, 0);
    return {
      rid: x.r.id, r: x.r, name: x.r.name, city: x.r.city, items: x.items, etaRaw: x.eta,
      eta: (pickup ? 'Ready for pickup in ' : 'Arrives in ') + etaLower(x.eta),
      feeRaw, fee: feeRaw == null ? 'Ask the shop' : feeRaw ? fmt(feeRaw) : 'Free',
      count: countText(x.items.length), subRaw, sub: fmt(subRaw),
    };
  });
}

/** Everything the prices, cart and checkout pages derive from the build + plan. */
export function useCommerce() {
  const d = useData();
  const build = useRig((s) => s.build), region = useRig((s) => s.region), picks = useRig((s) => s.picks), planMode = useRig((s) => s.planMode);
  const pickup = useRig((s) => s.co.ship) === 'pickup';
  return useMemo(() => {
    const plan = d.engine.plan(build, region, picks);
    const chosen = plan[planMode] || plan.best;
    const parts = d.categories.map((c) => (build[c.id] ? d.byId[build[c.id]!] : null)).filter((p): p is Product => !!p);
    const groups = groupsOf(d, chosen.choice, region, pickup);
    const missing = parts.filter((p) => !chosen.choice[p.id]);
    const errs = d.engine.compat(build).filter((c) => c.status === 'error');
    const has = groups.length > 0;
    const unknownFee = chosen.unknownFees > 0 && !pickup;
    const feeRaw = pickup ? 0 : chosen.fee;
    const totalRaw = chosen.parts + feeRaw;
    return {
      d, plan, chosen, parts, count: parts.length, groups, missing, errs, has, pickup, region,
      regionName: regionById(d, region).name,
      maxEta: has ? d.engine.maxEta(chosen.choice) : null,
      totalRaw,
      partsText: has ? fmt(chosen.parts) : '—',
      feeText: !has ? '—' : feeRaw ? fmt(feeRaw) + (unknownFee ? ' + ?' : '') : unknownFee ? 'Ask the shop' : 'Free',
      totalText: has ? fmt(totalRaw) : '—',
      cartPlan: MODE_LABEL[planMode] + ' · ' + plural(groups.length, 'shipment'),
      errText: errs.length + (errs.length > 1 ? ' issues need' : ' issue needs') + ' fixing before checkout: ' + errs.map((e) => e.label.toLowerCase()).join(', ') + '.',
      payNote: 'Paid at each retailer on its own site' + (d.lastIngest ? ' · prices checked ' + dFmt(Date.parse(d.lastIngest)) : ''),
    };
  }, [d, build, region, picks, planMode, pickup]);
}
export type Commerce = ReturnType<typeof useCommerce>;
