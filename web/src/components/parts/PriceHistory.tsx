'use client';

import { useEffect, useMemo, useRef } from 'react';
import { PriceChart } from '@/components/charts/PriceChart';
import { redrawAll } from '@/components/shell/motion';
import { Chip, Text } from '@/components/ui';
import { chartFor } from '@/lib/chart';
import { useData, useHistory } from '@/lib/data';
import { chgColor, chgTxt, fmt, plural, RANGES } from '@/lib/format';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import p from './part.module.css';

/** Daily lowest/average price history for one part with a range picker and hover readout. */
export function PriceHistory({ productId }: { productId: string }) {
  const d = useData();
  const history = useHistory(productId);
  const hRange = useRig((x) => x.hRange), set = useRig((x) => x.set);

  // Replay the line-draw when the range changes (not on first render: the reveal draws it then).
  const firstRange = useRef(true);
  useEffect(() => { if (firstRange.current) { firstRange.current = false; return; } redrawAll(); }, [hRange]);

  const geom = useMemo(() => (history ? chartFor(history, hRange, fmt, true) : null), [history, hRange]);
  const change = geom ? (geom.last - geom.first) / geom.first : null;
  const rangeLabel = RANGES.find(([, days]) => days === hRange)?.[0] ?? plural(hRange, 'day');

  return (
    <section data-rv="1" className={p.card}>
      <div className={p.cardHead}>
        <div className={p.headCol}>
          <Text v="h3" as="h2">Price history</Text>
          <ul className={p.legend} aria-label="Legend">
            <li><span className={p.swLow} aria-hidden />{'Lowest of ' + plural(d.retailers.length, 'shop')}</li>
            <li><span className={p.swAvg} aria-hidden />Average</li>
            <li><span className={p.swSale} aria-hidden />Sale day</li>
          </ul>
        </div>
        <div className={p.rangeBar}>
          <span className={p.change} style={{ color: chgColor(change, color.fg3) }}>{change == null ? 'No history yet' : chgTxt(change) + ' over ' + rangeLabel}</span>
          <div className={p.ranges} role="group" aria-label="History range">
            {RANGES.map(([label, days]) => <Chip key={label} on={hRange === days} onClick={() => set({ hRange: days })}>{label}</Chip>)}
          </div>
        </div>
      </div>
      <PriceChart geom={geom} />
    </section>
  );
}
