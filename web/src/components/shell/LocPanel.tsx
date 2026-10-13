'use client';

import { useState } from 'react';
import { Button, Eyebrow, Field, IconButton, Meta, Notice, Text } from '@/components/ui';
import { regionById } from '@/lib/content';
import { cx } from '@/lib/cx';
import { useData } from '@/lib/data';
import { cleanPostcode, describeLoc, POSTCODE_LEN, useLocate, useUserLoc } from '@/lib/location';
import { ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import { useGo } from './useGo';
import s from './shell.module.css';

/** The nav's location panel: precise location, postcode, price region and the nearest store. */
export function LocPanel({ close }: { close: () => void }) {
  const d = useData();
  const go = useGo();
  const region = useRig((x) => x.region), set = useRig((x) => x.set);
  const L = useUserLoc();
  const { locate, setPostcode, busy, msg } = useLocate();
  const [pc, setPc] = useState(L.postcode || '');
  const reg = regionById(d, region);
  const near = d.engine.nearby(L)[0];
  const nb = near ? d.branchById[near.branchId] : null;
  const src = L.source;
  const { label, meta } = describeLoc(L, reg.name, reg.short);
  return (
    <>
      <div onClick={close} className={s.scrim} />
      <div data-rv="s" className={s.pop} role="dialog" aria-label="Your location">
        <div className={s.row}>
          <Eyebrow c={color.blueSoft}>Your location</Eyebrow>
          <IconButton label="Close" onClick={close} />
        </div>
        <div className={s.stackSm}>
          <Text v="panelTitle">{label}</Text>
          <Meta>{meta}</Meta>
        </div>
        <Button onClick={() => locate()} busy={busy}><span className={s.locateDot} />{busy ? 'Locating…' : src === 'gps' ? 'Refresh my location' : 'Use my exact location'}</Button>
        {msg && <Notice tone="warn" bare role="alert">{msg}</Notice>}
        <div className={s.stack}>
          <Eyebrow>Or enter a postcode</Eyebrow>
          <div className={s.pcRow}>
            <Field size="mdc" containerClassName={s.pcField} value={pc} inputMode="numeric" maxLength={POSTCODE_LEN} aria-label="Postcode" autoComplete="postal-code"
              onValue={(v) => setPc(cleanPostcode(v))} onKeyDown={(e) => { if (e.key === 'Enter') setPostcode(pc); }} placeholder="e.g. 47300" />
            <Button variant="ghost" onClick={() => setPostcode(pc)}>Set</Button>
          </div>
        </div>
        <div className={s.stack}>
          <Eyebrow>Price region</Eyebrow>
          <div className={s.regions}>
            {d.regions.map((r) => (
              <button key={r.id} onClick={() => set({ region: r.id })} aria-pressed={r.id === region} className={cx(s.region, r.id === region && s.regionOn)}>{r.name}</button>
            ))}
          </div>
        </div>
        {near && nb && (
          <button onClick={() => { close(); go(ROUTES.stores.path, { stSel: nb.id }); }} className={s.nearest}>
            <span>{'Nearest store: ' + nb.name + ', ' + (d.retailerById[nb.retailerId]?.name || '') + ' · ' + d.engine.fmtKm(near.km)}</span><span className={s.arrow}>→</span>
          </button>
        )}
      </div>
    </>
  );
}
