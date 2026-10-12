'use client';

import { Button } from '@/components/ui';
import { tone } from '@/lib/tokens';
import type { Check, Tone } from '@/lib/types';
import r from './review.module.css';

/** Verdict word shown for each compatibility status. */
const VERDICT: Record<Tone, string> = { ok: 'Pass', warn: 'Check', error: 'Fix', pending: 'Waiting', info: 'Note' };

/** Compatibility checks with their detail and one-click fixes from the engine. */
export function ReviewChecks({ checks, onFocus, onFix }: { checks: Check[]; onFocus: (c: Check) => void; onFix: (c: Check) => void }) {
  return (
    <ul className={r.checks} aria-label="Compatibility checks">
      {checks.map((c) => (
        <li key={c.id} data-rv="1" className={r.check}>
          <span className={r.status} style={{ color: tone[c.status] }}>{VERDICT[c.status]}</span>
          <div className={r.checkBody}>
            <button type="button" onClick={() => onFocus(c)} className={r.checkLabel} title="Show in 3D">{c.label}</button>
            <span className={r.detail}>{c.detail}</span>
            {c.fix && <Button variant="fix" size="compact" className={r.fix} onClick={() => onFix(c)}>{c.fix.text}</Button>}
          </div>
          <span className={r.value}>{c.value}</span>
        </li>
      ))}
    </ul>
  );
}
