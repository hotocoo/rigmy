'use client';

import { Button, Chip, Eyebrow, Field, Meta, Notice, Text } from '@/components/ui';
import { cleanPostcode, POSTCODE_LEN, useLocDescription, type useLocate } from '@/lib/location';
import { useRig } from '@/lib/store';
import type { DetailsProps } from './DetailsStep';
import s from './checkout.module.css';
import cs from './commerce.module.css';

/** Address (optionally filled from the user's location), region and the preferred delivery day + window. */
export function DeliveryFields({ c, slots, errors, setField, locator }: DetailsProps & { locator: ReturnType<typeof useLocate> }) {
  const co = useRig((st) => st.co), setCo = useRig((st) => st.setCo), loc = useRig((st) => st.loc);
  const lv = useLocDescription();
  const { locate, busy, msg } = locator;

  const fillAddr = () => {
    if (loc?.source === 'gps' && (loc.road || loc.postcode)) setCo({ addr: loc.road || loc.label, postcode: loc.postcode || '', city: loc.city || loc.label, err: '' });
    else if (loc?.source === 'postcode') setCo({ postcode: loc.postcode || '', city: loc.label, err: '' });
    else locate((f) => setCo({ addr: f.addr, postcode: f.postcode, city: f.city, err: '' }));
  };
  const fillLabel = busy ? 'Locating…' : loc && loc.source !== 'region' ? 'Fill from my location' : 'Use my location';

  return (
    <>
      <Notice tone="callout">
        <span className={cs.stack}>
          <Text v="strong">Fill the address from your exact location</Text>
          <Meta>{lv.meta}</Meta>
        </span>
        <Button variant="mini" onClick={fillAddr} disabled={busy}>{fillLabel}</Button>
      </Notice>
      {msg && <Notice tone="warn" bare role="status">{msg}</Notice>}
      <div className={s.addrGrid}>
        <Field label="Address" name="street-address" autoComplete="street-address" required value={co.addr} onValue={(v) => setField('addr', v)} placeholder="12, Jalan SS 2/24" error={errors.addr} />
        <Field label="Postcode" name="postal-code" autoComplete="postal-code" inputMode="numeric" maxLength={POSTCODE_LEN} required mono value={co.postcode} onValue={(v) => setField('postcode', cleanPostcode(v))} placeholder="47300" error={errors.postcode} />
        <Field label="City" name="address-level2" autoComplete="address-level2" required value={co.city} onValue={(v) => setField('city', v)} placeholder="Petaling Jaya" error={errors.city} />
        <div className={s.regionField}>
          <Text v="capsWide">Region</Text>
          <div className={s.regionBox}>{c.regionName}</div>
        </div>
      </div>
      {slots.days.length > 0 && (
        <fieldset className={s.group}>
          <legend><Eyebrow>Delivery day</Eyebrow></legend>
          <div className={s.chips}>
            {slots.days.map((sd, i) => (
              <Chip key={sd.t} size="block" className={s.dayChip} on={slots.dayIdx === i} onClick={() => setCo({ slotDay: i })}>
                <span className={s.dayDow}>{sd.dow}</span>
                <span className={s.dayDate}>{sd.date}</span>
              </Chip>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className={s.group}>
        {slots.windows.length > 0 && (
          <>
            <legend><Eyebrow>Time window</Eyebrow></legend>
            <div className={s.chips}>
              {slots.windows.map((w, i) => <Chip key={w} on={slots.winIdx === i} onClick={() => setCo({ slotWin: i })}>{w}</Chip>)}
            </div>
          </>
        )}
        <Text v="meta">
          {'Earliest day is set by the slowest shop (' + (c.maxEta || 'unknown').toLowerCase() + '). Your preferred day and window are saved with the order; confirm them with each shop when you buy.'}
        </Text>
      </fieldset>
    </>
  );
}
