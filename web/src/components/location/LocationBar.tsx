'use client';

import { useState } from 'react';
import { Button, Dot, Field, Meta, Notice, Panel } from '@/components/ui';
import { cleanPostcode, POSTCODE_LEN, useLocate, useLocDescription } from '@/lib/location';
import s from './location.module.css';

type Locator = ReturnType<typeof useLocate>;

/**
 * Where distances are measured from: the user's position and its precision, with "use my location" and a postcode
 * field. Pass `locator` to share one useLocate() (busy state, messages) with other controls on the page.
 */
export function LocationBar({ locator }: { locator?: Locator }) {
  const own = useLocate();
  const { locate, setPostcode, busy, msg } = locator || own;
  const { L, label, meta, dot } = useLocDescription();
  const [pc, setPc] = useState(L.postcode || '');
  return (
    <>
      <Panel className={s.bar}>
        <Dot c={dot} size={8} ring ringWidth={4} />
        <span className={s.text}>
          <span className={s.label}>{label}</span>
          <Meta>{meta}</Meta>
        </span>
        <Button variant="mini" onClick={() => locate()} disabled={busy}>{busy ? 'Locating…' : L.source === 'gps' ? 'Refresh my location' : 'Use my exact location'}</Button>
        <div className={s.pc}>
          {/* Enter sets the postcode (and never submits a surrounding form, e.g. checkout). */}
          <Field size="sm" containerClassName={s.pcField} aria-label="Postcode" name="location-postcode" autoComplete="postal-code" inputMode="numeric"
            maxLength={POSTCODE_LEN} value={pc} onValue={(v) => setPc(cleanPostcode(v))} placeholder="Postcode"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setPostcode(pc); } }} />
          <Button variant="mini" onClick={() => setPostcode(pc)}>Set</Button>
        </div>
      </Panel>
      {msg && <Notice tone="warn" bare role="status">{msg}</Notice>}
    </>
  );
}
