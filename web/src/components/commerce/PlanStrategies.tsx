'use client';

import { Text } from '@/components/ui';
import { fmt, plural } from '@/lib/format';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { PlanMode, PlanTotal } from '@/lib/types';
import type { Commerce } from './useCommerce';
import { etaLower } from './util';
import s from './prices.module.css';

/** The four ways to split the build across shops. Labels are presentation; the totals come from the engine plan. */
const STRATEGIES: { mode: PlanMode; label: string; note: string }[] = [
  { mode: 'best', label: 'Lowest total', note: 'Cheapest shop for each part' },
  { mode: 'fast', label: 'Fastest delivery', note: 'Quickest arrival for each part' },
  { mode: 'single', label: 'One shop', note: 'Everything from one retailer' },
  { mode: 'custom', label: 'Pick per part', note: 'Choose shops in the table below' },
];

/** At least one part of the build has a buyable offer under this plan. */
export const isPriced = (x: PlanTotal, count: number) => count - x.missing > 0;

const feeLine = (x: PlanTotal) => plural(x.shops, 'shop') + ' · ' + (x.fee ? fmt(x.fee) + ' delivery' : x.unknownFees ? 'delivery fee unknown' : 'free delivery');

export function PlanStrategies({ c }: { c: Commerce }) {
  const planMode = useRig((st) => st.planMode), set = useRig((st) => st.set);
  const { d, plan, count } = c;
  const listed = d.retailers.length > 0 && plan.rows.some((r) => r.offers.length > 0);
  return (
    <div className={s.strategies} role="group" aria-label="How to buy">
      {STRATEGIES.map(({ mode, label, note }) => {
        const x = plan[mode];
        const ok = isPriced(x, count);
        const name = mode === 'single' && plan.single.retailer ? label + ' · ' + plan.single.retailer.name : label;
        const warn = !listed ? 'No retailer listings yet' : x.missing ? plural(x.missing, 'part') + ' unavailable here' : '';
        return (
          <button key={mode} type="button" data-rv="1" aria-pressed={planMode === mode} onClick={() => set({ planMode: mode })} className={s.strategy}>
            <span className={s.strategyLabel}><span className={s.radio} aria-hidden />{name}</span>
            <span className={s.strategyNote}>{note}</span>
            <Text v="figure" className={s.strategyTotal}>{ok ? fmt(x.total) : '—'}</Text>
            <Text v="meta" c={color.fg3}>{ok ? feeLine(x) : '—'}</Text>
            <Text v="meta" c={color.fg3}>{ok ? 'Arrives in ' + etaLower(d.engine.maxEta(x.choice)) : '—'}</Text>
            {warn && <span className={s.strategyWarn}>{warn}</span>}
          </button>
        );
      })}
    </div>
  );
}
