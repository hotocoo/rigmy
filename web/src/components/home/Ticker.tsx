'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Dot } from '@/components/ui';
import { useData, useStats } from '@/lib/data';
import { chgColor, chgTxt, dFmt, fmt } from '@/lib/format';
import { href } from '@/lib/routes';
import { color } from '@/lib/tokens';
import { TICKER_COUNT, TICKER_HOVER_RATE, TICKER_LOOP_MS, TICKER_MIN_HALF } from './config';
import { useNavLink } from './useNavLink';
import s from './home.module.css';

/** Live price ticker under the scroll story. Hovering slows it down; reduced motion turns it into a scrollable strip. */
export function Ticker() {
  const d = useData();
  const stats = useStats();
  const link = useNavLink();
  const anim = useRef<Animation | null>(null);

  const tk = stats
    ? d.products
      .filter((p) => stats[p.id]?.cur != null)
      .map((p) => ({ p, st: stats[p.id] }))
      .sort((a, b) => Math.abs(b.st.d7 ?? 0) - Math.abs(a.st.d7 ?? 0))
      .slice(0, TICKER_COUNT)
      .map(({ p, st }) => ({
        id: p.id, cat: p.cat ? d.cat(p.cat)?.label || p.cat : p.market || 'Other', name: p.cat ? p.short || p.brand + ' ' + p.glyph : p.short || p.name, price: fmt(st.cur!),
        chg: chgTxt(st.d7), c: chgColor(st.d7),
      }))
    : [];
  // Repeat real items (never invented ones) so a short list still fills the strip, then double it for the seamless loop.
  const half = tk.length ? Array.from({ length: Math.ceil(TICKER_MIN_HALF / tk.length) }, () => tk).flat() : [];
  const items = half.concat(half);

  const tickerRef = useCallback((el: HTMLDivElement | null) => {
    anim.current?.cancel();
    anim.current = null;
    if (!el || !el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    anim.current = el.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-50%,0,0)' }], { duration: TICKER_LOOP_MS, iterations: Infinity });
  }, []);
  useEffect(() => () => { anim.current?.cancel(); }, []);
  const slow = useCallback(() => anim.current?.updatePlaybackRate(TICKER_HOVER_RATE), []);
  const fast = useCallback(() => anim.current?.updatePlaybackRate(1), []);

  if (!items.length) {
    const msg = !stats
      ? 'Loading market prices…'
      : d.lastIngest
        ? 'No retailer prices yet · last checked ' + dFmt(Date.parse(d.lastIngest), true)
        : 'Price tracking starts after the first ingest';
    return (
      <section className={s.ticker} aria-label="Market prices">
        <div className={s.tickerEmpty} role="status">
          <Dot c={color.dim} glowPx={0} />
          <span className={s.tickerCat}>Market</span>
          <span>{msg}</span>
        </div>
      </section>
    );
  }

  return (
    <section className={s.ticker} aria-label="Market prices" onMouseEnter={slow} onMouseLeave={fast} onFocus={slow} onBlur={fast}>
      <div ref={tickerRef} className={s.tickerTrack}>
        {items.map((t, i) => {
          // Only the first copy of each part is announced and focusable; the repeats exist for the loop.
          const repeat = i >= tk.length;
          return (
            <a key={i} {...link(href.part(t.id))} className={s.tickerItem} aria-hidden={repeat || undefined} tabIndex={repeat ? -1 : undefined}>
              <span className={s.tickerCat}>{t.cat}</span>
              <span className={s.tickerName}>{t.name}</span>
              <span>{t.price}</span>
              <span style={{ color: t.c }}>{t.chg}</span>
            </a>
          );
        })}
      </div>
      <div className={s.tickerEdgeL} />
      <div className={s.tickerEdgeR} />
    </section>
  );
}
