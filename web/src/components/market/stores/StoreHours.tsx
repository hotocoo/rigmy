'use client';

import { Eyebrow } from '@/components/ui';
import { cx } from '@/lib/cx';
import { DAYS, h12 } from '@/lib/format';
import type { Branch } from '@/lib/types';
import s from './stores.module.css';

/** Week shown Monday first (Date#getDay indices), as Malaysian shops list their hours. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
/** Hours per day; an opening span covering all of it is "Open 24 hours". */
const DAY_HOURS = 24;

function dayHours(h: [number, number] | null) {
  if (!h) return 'Closed';
  if (h[0] <= 0 && h[1] >= DAY_HOURS) return 'Open 24 hours';
  return h12(h[0]) + ' – ' + h12(h[1]);
}

/** Weekly opening hours with today highlighted, or the raw listing when it could not be parsed. */
export function StoreHours({ b, now }: { b: Branch; now: number }) {
  const today = new Date(now).getDay();
  const week = b.hours && b.hours.week.length === DAYS.length ? b.hours.week : null;
  return (
    <div data-rv="1" className={s.detailHead}>
      <Eyebrow>Opening hours</Eyebrow>
      {week ? (
        <ul className={s.hours}>
          {WEEK_ORDER.map((i) => (
            <li key={i} className={cx(s.day, i === today && s.today)} aria-current={i === today ? 'date' : undefined}>
              <span>{DAYS[i] + (i === today ? ' · today' : '')}</span><span>{dayHours(week[i])}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={cx(s.hoursRaw, b.hoursRaw && s.hoursRawKnown)}>{b.hoursRaw || 'Hours not listed'}</div>
      )}
      {b.hours && b.hoursRaw && <span className={s.foot}>{(b.source === 'osm' ? 'OpenStreetMap: ' : 'Listed as: ') + b.hoursRaw}</span>}
      {!b.hours && <span className={s.foot}>Call ahead to check opening times.</span>}
    </div>
  );
}
