'use client';

import { EmptyState, LinkButton, Sparkline } from '@/components/ui';
import { useData, useStats } from '@/lib/data';
import { chgColor, chgTxt, dFmt, fmt } from '@/lib/format';
import { href, ROUTES } from '@/lib/routes';
import { color } from '@/lib/tokens';
import { MOVER_SPARK_DAYS, MOVERS_COUNT } from './config';
import { cap, countWords } from './copy';
import { SectionHead } from './SectionHead';
import { useNavLink } from './useNavLink';
import s from './home.module.css';

const SPARK_W = 200, SPARK_H = 56;

/** "Prices that moved this week": the highest-scoring parts with their recent daily lows. */
export function Movers({ today }: { today: string }) {
  const d = useData();
  const stats = useStats();
  const link = useNavLink();
  const nRet = d.retailers.length;

  const movers = stats
    ? d.products
      .filter((p) => stats[p.id]?.cur != null)
      .map((p) => ({ p, st: stats[p.id] }))
      .sort((a, b) => b.st.score - a.st.score)
      .slice(0, MOVERS_COUNT)
      .map(({ p, st }) => {
        const spark = st.spark.slice(-MOVER_SPARK_DAYS);
        return {
          id: p.id, cat: d.cat(p.cat)?.label || p.cat, chg: chgTxt(st.d7) + ' · 7 days', name: p.name, price: fmt(st.cur!),
          note: spark.length >= 2 ? st.verdict : 'History builds daily', spark, c: chgColor(st.d7, color.blueSoft),
        };
      })
    : null;

  const intro = (nRet ? 'Every part is tracked daily across ' + countWords(nRet, 'shop') + '.' : 'Every part will be tracked daily once retailers are configured.')
    + ' Sale days are marked, so you can tell a real drop from a sticker.';

  return (
    <section className={s.movers} aria-labelledby="home-movers">
      <div className={s.gridBg} />
      <div data-rv="1" className={s.moversHead}>
        <SectionHead id="home-movers" eyebrow={'Market · ' + today} title="Prices that moved this week" lead={intro} />
        <LinkButton variant="ghost" {...link(ROUTES.trending.path)}>All price movers →</LinkButton>
      </div>
      <div className={s.moversGrid}>
        {movers && movers.length > 0 ? movers.map((m) => (
          <a key={m.id} data-rv="1" {...link(href.part(m.id))} className={s.mover}>
            <span className={s.moverHead}><span>{m.cat}</span><span style={{ color: m.c }}>{m.chg}</span></span>
            <span className={s.moverName}>{m.name}</span>
            <Sparkline values={m.spark} w={SPARK_W} h={SPARK_H} c={m.c} />
            <span className={s.moverFoot}>
              <span className={s.moverPrice}>{m.price}</span>
              <span className={s.moverNote}>{m.note}</span>
            </span>
          </a>
        )) : (
          <div className={s.spanAll}><EmptyState
            eyebrow={movers ? 'No price history yet' : 'Loading'}
            title={movers ? 'Price tracking starts after the first ingest' : 'Reading the latest prices…'}
            body={movers ? (d.lastIngest
              ? 'The last price check on ' + dFmt(Date.parse(d.lastIngest), true) + ' found no listings for tracked parts. Movers show up here as soon as retailers report prices.'
              : (nRet ? cap(countWords(nRet, 'retailer')) + ' configured. ' : 'No retailers are configured yet. ') + 'Each part gets a daily lowest price and a 7-day change once listings come in.') : undefined}
          /></div>
        )}
      </div>
    </section>
  );
}
