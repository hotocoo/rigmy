'use client';

import { toast } from '@/components/shell/motion';
import { useGo } from '@/components/shell/useGo';
import { Button, Field, LinkButton, Text } from '@/components/ui';
import { digits, fmt } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { Product } from '@/lib/types';
import { ALERT_ROUND_RM, ALERT_SUGGEST_FACTOR } from './constants';
import p from './part.module.css';

/** Suggested alert target: ALERT_SUGGEST_FACTOR of today's price, rounded to ALERT_ROUND_RM, one ringgit under. */
const suggestTarget = (cur: number) => Math.max(1, Math.round((cur * ALERT_SUGGEST_FACTOR) / ALERT_ROUND_RM) * ALERT_ROUND_RM - 1);

/** Client-side price alert (watchlist entry) for one part. */
export function PriceAlert({ P, current }: { P: Product; current: number | null }) {
  const go = useGo();
  const watch = useRig((x) => x.watch), wDraft = useRig((x) => x.wDraft), set = useRig((x) => x.set);
  const addWatch = useRig((x) => x.addWatch), removeWatch = useRig((x) => x.removeWatch);
  const item = watch.find((x) => x.id === P.id);
  const draft = wDraft[P.id] ?? (current != null ? String(suggestTarget(current)) : '');

  const save = () => {
    const target = Number(draft);
    if (!(target > 0)) return;
    addWatch(P.id, target);
    toast('Watching ' + (P.short || P.name) + ' · alert below ' + fmt(target));
  };

  if (item) {
    return (
      <div data-rv="1" className={p.alert}>
        <div className={p.alertWatching}>
          <span className={p.alertText}>
            <Text v="eyebrow" c={color.blueSoft}>Watching this price</Text>
            <span className={p.alertCopy}>{'Alert when it drops below ' + fmt(item.target) + (current != null ? ' · now ' + fmt(current) : ' · no price tracked yet')}</span>
          </span>
          <span className={p.alertActions}>
            <LinkButton variant="mini" href={ROUTES.watchlist.path} onClick={(e) => { e.preventDefault(); go(ROUTES.watchlist.path); }}>{ROUTES.watchlist.navLabel}</LinkButton>
            <Button variant="mini" onClick={() => removeWatch(P.id)}>Stop</Button>
          </span>
        </div>
      </div>
    );
  }
  return (
    <div data-rv="1" className={p.alert}>
      <Text v="eyebrow">Price alert</Text>
      <div className={p.alertRow}>
        <span className={p.unit} aria-hidden>Below RM</span>
        <Field
          size="inline"
          containerClassName={p.alertField}
          value={draft}
          inputMode="numeric"
          aria-label={'Alert me when ' + (P.short || P.name) + ' drops below this price in ringgit'}
          placeholder={current == null ? 'Target price' : undefined}
          onValue={(v) => { const val = digits(v); set((x) => ({ wDraft: { ...x.wDraft, [P.id]: val } })); }}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />
        <Button variant="accent" size="inline" onClick={save}>Watch price</Button>
      </div>
    </div>
  );
}
