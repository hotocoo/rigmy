'use client';

import type { ReactNode } from 'react';
import { Eyebrow, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { color } from '@/lib/tokens';
import m from './market.module.css';

/** Decorative grid that fades out from the top-left of a market page. */
export const GridBg = () => <div className={m.gridBg} aria-hidden />;

/** Market page frame: centred column with the decorative grid. `narrow` is the 1240 px reading width. */
export function MarketPage({ narrow, grid = true, children }: { narrow?: boolean; grid?: boolean; children: ReactNode }) {
  return (
    <div className={cx(m.page, narrow && m.narrow)}>
      {grid && <GridBg />}
      {children}
    </div>
  );
}

/** Eyebrow (blue) + display title + optional lede, with optional actions underneath. */
export function MarketHeader({ eyebrow, title, lede, muted, children }: { eyebrow: ReactNode; title: ReactNode; lede?: ReactNode; muted?: boolean; children?: ReactNode }) {
  return (
    <header data-rv="1" className={m.hero}>
      <Eyebrow c={color.blueSoft}>{eyebrow}</Eyebrow>
      <Text v="pageHero" as="h1" c={muted ? color.dim : undefined} className={m.balance}>{title}</Text>
      {lede && <Text v="body" as="p" className={m.lede}>{lede}</Text>}
      {children}
    </header>
  );
}

/** Section heading (h2) with an optional right-aligned note. */
export function SectionHead({ title, note, rv = true }: { title: ReactNode; note?: ReactNode; rv?: boolean }) {
  return (
    <div {...(rv ? { 'data-rv': '1' } : null)} className={m.sectionHead}>
      <Text v="h3" as="h2">{title}</Text>
      {note && <Text v="meta">{note}</Text>}
    </div>
  );
}

export interface StatTile { label: string; value: string; note: ReactNode; c: string }

/** Row of headline figures (label / big value / note) on a hairline grid. Values count up on reveal. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <dl className={m.statGrid}>
      {tiles.map((k) => (
        <div key={k.label} data-rv="1" className={m.statTile}>
          <Text v="eyebrow" as="dt">{k.label}</Text>
          <dd>
            <Text v="figureXl" c={k.c} data-count="1">{k.value}</Text>
            <span className={m.statNote}>{k.note}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
