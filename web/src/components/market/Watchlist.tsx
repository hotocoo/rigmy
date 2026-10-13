'use client';

import { useGo } from '@/components/shell/useGo';
import { Button, EmptyState, Eyebrow, Meta, Toggle } from '@/components/ui';
import { useData, useStats } from '@/lib/data';
import { dFmt, plural } from '@/lib/format';
import { href, ROUTES } from '@/lib/routes';
import { useRig, type RigState } from '@/lib/store';
import { MarketHeader, MarketPage } from './MarketHeader';
import { WatchCard } from './watchlist/WatchCard';
import w from './watchlist/watchlist.module.css';

/** Alert channels the user can opt into (delivery is not live yet, so each is tagged "Soon"). */
const CHANNELS: { key: keyof RigState['notify']; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'push', label: 'Push' },
];

export function Watchlist() {
  const d = useData();
  const go = useGo();
  const stats = useStats();
  const watch = useRig((s) => s.watch), notify = useRig((s) => s.notify), set = useRig((s) => s.set);

  const items = watch.flatMap((item) => (d.byId[item.id] ? [{ item, p: d.byId[item.id] }] : []));
  const hits = items.filter(({ item, p }) => { const c = stats?.[p.id]?.cur; return c != null && c <= item.target; }).length;
  const last = d.lastIngest ? new Date(d.lastIngest).getTime() : null;
  const lede = 'Prices update every time RigMY checks the shops' + (last ? ' (last check ' + dFmt(last, true) + ')' : '') + '. When a part drops to your target, it lights up here.';

  return (
    <MarketPage narrow grid={false}>
      <MarketHeader eyebrow={plural(items.length, 'part') + ' watched' + (hits ? ' · ' + hits + ' below target' : '')} title="Watchlist" lede={lede} />
      <div data-rv="1" className={w.alerts}>
        <div className={w.channels} role="group" aria-label="Alert channels">
          <Eyebrow className={w.channelsLabel}>Alert me by</Eyebrow>
          {CHANNELS.map((c) => (
            <Toggle key={c.key} size="tall" on={notify[c.key]} label={<>{c.label}<span className={w.soon}>Soon</span></>}
              onClick={() => set((s) => ({ notify: { ...s.notify, [c.key]: !s.notify[c.key] } }))} />
          ))}
        </div>
        <Meta className={w.alertsNote}>
          Alerts show on this page when a price drops below your target. Email, WhatsApp and push delivery are coming soon — your choices are saved for then, nothing is sent yet.
        </Meta>
      </div>
      {!items.length && (
        <EmptyState title="Nothing on your watchlist yet" body="Open any part and set a price alert under its price. Trending is a good place to start."
          action={<Button onClick={() => go(ROUTES.trending.path)}>See what&apos;s trending</Button>} />
      )}
      {items.length > 0 && (
        <ul className={w.items} aria-label="Watched parts">
          {items.map(({ item, p }) => (
            <WatchCard key={p.id} item={item} p={p} cat={d.cat(p.cat)} st={stats?.[p.id] || null} loading={stats == null} open={() => go(href.part(p.id))} />
          ))}
        </ul>
      )}
    </MarketPage>
  );
}
