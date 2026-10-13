'use client';

import type { ReactNode } from 'react';
import { Button, Dot, LinkButton, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { fmt, pluralWord } from '@/lib/format';
import { color } from '@/lib/tokens';
import { CHAPTER, CHAPTER_SIDE, EMPTY_SHOP_ROWS, type Side } from './config';
import { useNavLink } from './useNavLink';
import type { ChapterPart, StoryModel } from './useStoryModel';
import s from './story.module.css';

const num = (ch: number) => String(ch).padStart(2, '0');

/** Absolutely positioned column that vertically centres one chapter card. */
function Column({ side, width = 'md', children }: { side: Side; width?: 'md' | 'lg' | 'xl'; children: ReactNode }) {
  return <div className={cx(s.col, side === 'left' ? s.colLeft : s.colRight, s[width])}>{children}</div>;
}

/** Story calls to action. `dense` deepens the veil behind the outlined buttons (the closing chapter sits on the bright rig). */
function Ctas({ m, dense, browse }: { m: StoryModel; dense?: boolean; browse?: boolean }) {
  const link = useNavLink();
  return (
    <div className={cx(s.ctas, dense && s.ctasDense)}>
      <Button size="lg" onClick={m.cta.startScratch}>Start from scratch</Button>
      <Button variant="veil" size="lg" onClick={m.cta.customise}>{m.cta.customiseLabel}</Button>
      {browse && <LinkButton variant="veil" size="lg" {...link(m.cta.browseHref)}>Browse parts</LinkButton>}
    </div>
  );
}

export function IntroChapter({ m }: { m: StoryModel }) {
  return (
    <Column side={CHAPTER_SIDE.intro} width="xl">
      <div data-ch={CHAPTER.intro} className={s.intro}>
        <Text v="hero" as="h1" className={s.balance}>Build it in 3D. Buy it in one checkout.</Text>
        <p className={s.heroCopy}>{m.heroCopy}</p>
        <Ctas m={m} />
        <Text v="kicker" as="div" className={s.scrollHint}><span className={s.scrollLine} />Scroll to take it apart</Text>
      </div>
    </Column>
  );
}

export function PartsChapter({ m }: { m: StoryModel }) {
  return (
    <Column side={CHAPTER_SIDE.parts}>
      <div data-ch={CHAPTER.parts} className={cx(s.card, s.gapLg)}>
        <div className={s.kicker}>{num(CHAPTER.parts)} · {m.buildLabel}</div>
        <Text v="chapter" as="h2" className={s.balance}>Every part sits where it really goes</Text>
        <p className={s.partsCopy}>Parts are placed from their real dimensions: card length, cooler height, board size. What you see in the case is what fits in it.</p>
        <dl className={s.partList}>
          {m.partList.map((row) => (
            <div key={row.idx} className={s.partRow}><dt className={s.partIdx}>{row.idx}</dt><dd className={s.partName}>{row.name}</dd></div>
          ))}
        </dl>
      </div>
    </Column>
  );
}

export function PartChapter({ part }: { part: ChapterPart }) {
  return (
    <Column side={part.side}>
      <div data-ch={part.ch} className={s.card}>
        <div className={cx(s.kicker, s.kickerRow)}>
          <span>{num(part.ch)} · {part.kicker}</span>
          <span style={{ color: part.price != null ? color.fg : color.dim }}>{part.price != null ? fmt(part.price) : part.selected ? 'No price yet' : '—'}</span>
        </div>
        <Text v="feature" as="h2" className={s.balance}>{part.name}</Text>
        <div className={s.spec}>{part.spec}</div>
        <div className={s.checkBox}>
          <Text v="data" c={part.c} className={s.checkLine}><Dot c={part.c} glowPx={0} />{part.checkLabel} · {part.value}</Text>
          <Text v="bodySm" className={s.pretty}>{part.detail}{part.extra}</Text>
        </div>
      </div>
    </Column>
  );
}

export function PricesChapter({ m }: { m: StoryModel }) {
  const pr = m.prices;
  return (
    <Column side={CHAPTER_SIDE.prices} width="lg">
      <div data-ch={CHAPTER.prices} className={cx(s.card, s.gapLg, s.cardDense, s.full)}>
        <div className={s.kicker}>{num(CHAPTER.prices)} · Prices in {m.regionName}</div>
        <Text v="feature" as="h2">{pr.head}</Text>
        <div className={s.bars}>
          {pr.hasPrices ? (
            <>
              {pr.bars.map((b) => (
                <div key={b.id} className={s.barRow}>
                  <div className={s.barText}><span className={s.barName}>{b.name}</span><span style={{ color: b.text }}>{b.total}</span></div>
                  <div className={s.barTrack}><div data-w={b.scale.toFixed(3)} className={s.barFill} style={{ background: b.bar }} /></div>
                </div>
              ))}
              {pr.more > 0 && <div className={s.moreShops}>+ {pr.more} more {pluralWord(pr.more, 'shop')}</div>}
            </>
          ) : Array.from({ length: EMPTY_SHOP_ROWS }, (_, j) => (
            <div key={j} className={s.barRow}>
              <div className={cx(s.barText, s.barEmpty)}><span>{j === 0 ? pr.waiting : ' '}</span><span>{j === 0 ? '—' : ''}</span></div>
              <div className={s.barTrack} />
            </div>
          ))}
        </div>
        <div className={s.splitRow}>
          <span className={s.splitNote}>{pr.splitNote}</span>
          {pr.total != null
            ? <Text v="figure" c={color.blueSoft} className={s.nowrap}>{fmt(pr.total)}</Text>
            : <Text v="figureSm" c={color.dim} className={s.nowrap}>No price yet</Text>}
        </div>
      </div>
    </Column>
  );
}

export function StartChapter({ m }: { m: StoryModel }) {
  return (
    <div className={s.startCol}>
      <div data-ch={CHAPTER.start} className={s.start}>
        <Text v="heroEnd" as="h2">Now make it yours</Text>
        <Ctas m={m} dense browse />
      </div>
    </div>
  );
}
