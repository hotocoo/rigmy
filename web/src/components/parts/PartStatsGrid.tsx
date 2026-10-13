'use client';

import type { ReactNode } from 'react';
import { Text } from '@/components/ui';
import { chgColor, chgTxt, dFmt, fmt, fmtOr } from '@/lib/format';
import { color, tone } from '@/lib/tokens';
import type { PartStats } from '@/lib/types';
import { AVG_MATCH_TOLERANCE_RM } from './constants';
import p from './part.module.css';

/** Today's price against the 90-day average: text and colour (cheaper = ok, dearer = warn, within tolerance = neutral). */
function avgDelta(st: PartStats | null): { text: string; c: string } {
  if (!st || st.cur == null || st.avg90 == null) return { text: '—', c: color.muted };
  const diff = st.cur - st.avg90;
  if (Math.abs(diff) < AVG_MATCH_TOLERANCE_RM) return { text: 'Today matches it', c: color.muted };
  const c = diff < -AVG_MATCH_TOLERANCE_RM ? tone.ok : diff > AVG_MATCH_TOLERANCE_RM ? tone.warn : color.muted;
  return { text: 'Today ' + fmt(Math.abs(diff)) + (diff < 0 ? ' below' : ' above'), c };
}

function Cell({ label, value, valueColor, note, noteColor = color.muted }: { label: string; value: ReactNode; valueColor?: string; note: ReactNode; noteColor?: string }) {
  return (
    <div className={p.stat}>
      <dt><Text v="eyebrowSm">{label}</Text></dt>
      <dd>
        <Text v="figureSm" c={valueColor ?? color.fg}>{value}</Text>
        <Text v="caption" c={noteColor}>{note}</Text>
      </dd>
    </div>
  );
}

/** 12-month low, 90-day average and short-term change. Every value is "—" until there is history. */
export function PartStatsGrid({ st }: { st: PartStats | null }) {
  const avg = avgDelta(st);
  const d7 = st?.d7 ?? null, d30 = st?.d30 ?? null;
  return (
    <dl data-rv="1" className={p.stats}>
      <Cell label="12-month low" value={fmtOr(st?.low)} note={st?.lowT ? dFmt(st.lowT, true) : '—'} />
      <Cell label="90-day average" value={fmtOr(st?.avg90)} note={avg.text} noteColor={avg.c} />
      <Cell label="7 days" value={chgTxt(d7)} valueColor={chgColor(d7, color.fg3)} note={'30 days ' + chgTxt(d30)} />
    </dl>
  );
}
