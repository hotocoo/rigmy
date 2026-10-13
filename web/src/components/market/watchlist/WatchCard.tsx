'use client';

import { Button, Field, Panel, Price, Progress, Sparkline, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { digits, fmt } from '@/lib/format';
import { useRig, type WatchItem } from '@/lib/store';
import { color, tint, tone } from '@/lib/tokens';
import type { Category, PartStats, Product } from '@/lib/types';
import m from '../market.module.css';
import w from './watchlist.module.css';

/** Days of daily lows in the sparkline (the API sends at most this many). */
const WATCH_SPARK_DAYS = 60;
/** Border strength of a card whose part has reached its target. */
const HIT_BORDER_PCT = 45;

/** Draft keys in `wDraft` are namespaced so other drafts can share the map. */
const draftKey = (id: string) => 'w' + id;

/** One watched part: price vs target, sparkline, editable target and remove. */
export function WatchCard({ item, p, cat, st, loading, open }: { item: WatchItem; p: Product; cat: Category | undefined; st: PartStats | null; loading: boolean; open: () => void }) {
  const set = useRig((s) => s.set), removeWatch = useRig((s) => s.removeWatch);
  const draftRaw = useRig((s) => s.wDraft[draftKey(p.id)]);
  const cur = st?.cur ?? null, hit = cur != null && cur <= item.target;
  const col = hit ? tone.ok : cur == null ? color.muted : color.blueSoft;
  const dk = draftKey(p.id);
  const draft = draftRaw ?? String(item.target);

  const commit = () => {
    const n = Number(useRig.getState().wDraft[dk] ?? '');
    if (n > 0) set((x) => ({ watch: x.watch.map((y) => (y.id === p.id ? { ...y, target: n } : y)) }));
  };

  return (
    <Panel as="li" data-rv="1" className={w.card} style={hit ? { borderColor: tint(tone.ok, HIT_BORDER_PCT) } : undefined}>
      <div className={w.info}>
        <Text v="eyebrowSm">{cat?.long || p.market || 'Other'}</Text>
        <button type="button" onClick={open} className={cx(m.textBtn, w.name)}>{p.name}</button>
        <span className={w.verdict}>{loading ? 'Loading price data…' : st ? st.verdict : 'No price yet'}</span>
      </div>
      <div className={w.spark}><Sparkline values={st?.spark.slice(-WATCH_SPARK_DAYS) || []} w={200} h={44} c={col} fillPct={10} /></div>
      <div className={w.target}>
        <div className={w.priceRow}>
          <Price value={cur} empty="—" v="priceLg" emptyColor={color.fg} />
          <span className={w.status} style={{ color: col }}>{cur == null ? 'Waiting for a price' : hit ? 'Below your target' : fmt(cur - item.target) + ' to go'}</span>
        </div>
        <Progress value={cur == null ? 0 : Math.min(1, item.target / cur)} height={3} c={col} grow />
        <div className={w.targetRow}>
          <span className={w.targetLabel} aria-hidden>Target RM</span>
          <Field size="sm" containerClassName={w.targetField} value={draft} inputMode="numeric" aria-label={'Target price for ' + p.name}
            onValue={(v) => { const val = digits(v); set((x) => ({ wDraft: { ...x.wDraft, [dk]: val } })); }}
            onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          <Button variant="mini" onClick={() => removeWatch(p.id)} aria-label={'Remove ' + p.name + ' from watchlist'}>Remove</Button>
        </div>
      </div>
    </Panel>
  );
}
