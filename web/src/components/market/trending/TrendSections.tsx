'use client';

import { EmptyState, Eyebrow, Panel, Progress, Sparkline, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { chgColor, chgTxt, fmt, plural } from '@/lib/format';
import { color, tone } from '@/lib/tokens';
import type { Product } from '@/lib/types';
import { SectionHead } from '../MarketHeader';
import type { Entry } from './useTrending';
import m from '../market.module.css';
import t from './trending.module.css';

/** Days of daily lows drawn in each drop row's sparkline. */
const DROP_SPARK_DAYS = 30;
/** Within 0.5% of the recorded low counts as "at its low" (shops round prices). */
const AT_LOW_RATIO = 1.005;

type Open = (id: string) => void;
type CatLabel = (p: Product) => string;

export interface Empty { title: string; body?: string }

export function DropsList({ rows, catLabel, open, empty }: { rows: Entry[]; catLabel: CatLabel; open: Open; empty: Empty | null }) {
  return (
    <section className={cx(m.stack, t.main)} aria-label="Biggest drops this week">
      <SectionHead title="Biggest drops this week" note="7-day change" />
      {rows.length > 0 && (
        <ol className={m.list}>
          {rows.map((x, i) => {
            const col = chgColor(x.st.d7);
            return (
              <li key={x.p.id}>
                <button type="button" data-rv="1" onClick={() => open(x.p.id)} className={cx(m.rowBtn, t.drop)}>
                  <span className={t.rank} aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                  <span className={m.col}><Text v="eyebrowSm">{catLabel(x.p)}</Text><Text v="strong" className={m.pretty}>{x.p.name}</Text></span>
                  <span className={t.dropSpark}><Sparkline values={x.st.spark.slice(-DROP_SPARK_DAYS)} w={120} h={30} c={col} fillPct={10} /></span>
                  <span className={m.end}><Text v="priceMd">{fmt(x.st.cur!)}</Text><Text v="dataSm" c={col}>{chgTxt(x.st.d7)}</Text></span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {empty && <EmptyState title={empty.title} body={empty.body} />}
    </section>
  );
}

export function BuiltList({ rows, max, open, empty }: { rows: Entry[]; max: number; open: Open; empty: Empty }) {
  return (
    <section className={m.stack} aria-label="Most added to builds">
      <SectionHead title="Most added to builds" note="In saved builds" />
      {rows.length > 0 ? (
        <ul className={m.list}>
          {rows.map((x) => (
            <li key={x.p.id}>
              <button type="button" data-rv="x" onClick={() => open(x.p.id)} className={cx(m.rowBtn, t.built)}>
                <span className={t.builtHead}><Text v="strong">{x.p.name}</Text><Text v="data" c={color.fg3} className={m.nowrap}>{plural(x.st.builds, 'saved build')}</Text></span>
                <Progress value={x.st.builds / max} height={3} grow />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={empty.title} body={empty.body} />
      )}
    </section>
  );
}

export interface SaleRow { key: string; label: string; date: string; in: string; note: string }

export function SalesList({ rows }: { rows: SaleRow[] }) {
  return (
    <section className={m.stack} aria-label="Upcoming sales">
      <div data-rv="1"><Text v="h3" as="h2">Upcoming sales</Text></div>
      {rows.map((e) => (
        <Panel key={e.key} data-rv="x" className={t.sale}>
          <span className={t.saleLabel}>{e.label}</span>
          <span className={t.saleText}><span className={t.saleDate}>{e.date}</span><span className={t.saleNote}>{e.note}</span></span>
          <span className={t.saleIn}>{e.in}</span>
        </Panel>
      ))}
      {!rows.length && <EmptyState title="No upcoming sale days on the calendar" />}
    </section>
  );
}

export function LowsGrid({ rows, yearOfData, maxDays, catLabel, open, empty }: { rows: Entry[]; yearOfData: boolean; maxDays: number; catLabel: CatLabel; open: Open; empty: Empty }) {
  return (
    <section className={m.stack} aria-label="Closest to their low">
      <div data-rv="1" className={m.stackSm}>
        <Text v="h3" as="h2">{yearOfData ? 'Closest to their 12-month low' : 'Closest to their lowest recorded price'}</Text>
        <Text v="meta">{yearOfData ? "Today's lowest price compared with the lowest we recorded this year" : "Today's lowest price compared with the lowest we have recorded" + (maxDays > 1 ? ' in ' + plural(maxDays, 'day') : '')}</Text>
      </div>
      {rows.length > 0 ? (
        <div className={t.lows}>
          {rows.map((x) => {
            const r = x.st.cur! / x.st.low!, at = r <= AT_LOW_RATIO, col = at ? tone.ok : color.blueSoft;
            return (
              <button key={x.p.id} type="button" data-rv="1" onClick={() => open(x.p.id)} className={m.card}>
                <span className={t.lowHead}><Eyebrow>{catLabel(x.p)}</Eyebrow><Eyebrow c={col}>{at ? 'At its low' : '+' + ((r - 1) * 100).toFixed(1) + '% above'}</Eyebrow></span>
                <Text v="titleSm" className={t.lowName}>{x.p.name}</Text>
                <Progress value={1 / r} height={3} c={col} grow />
                <span className={t.lowPrices}><span>{fmt(x.st.cur!)}</span><span className={t.lowRef}>{'Low ' + fmt(x.st.low!)}</span></span>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState title={empty.title} body={empty.body} />
      )}
    </section>
  );
}
