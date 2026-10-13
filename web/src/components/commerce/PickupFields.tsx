'use client';

import { LocationBar } from '@/components/location/LocationBar';
import { Chip, Text } from '@/components/ui';
import type { useLocate } from '@/lib/location';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { DetailsProps } from './DetailsStep';
import s from './checkout.module.css';

/** Where the user is (sets distances) and which branch of each shop they collect from. */
export function PickupFields({ c, pickupGroups, locator }: DetailsProps & { locator: ReturnType<typeof useLocate> }) {
  const co = useRig((st) => st.co), setCo = useRig((st) => st.setCo);
  return (
    <>
      <LocationBar locator={locator} />
      <div className={s.pickList}>
        {pickupGroups.map(({ g, opts, selId }) => (
          <fieldset key={g.rid} className={s.pickGroup}>
            <legend className="sr-only">{'Pickup branch for ' + g.name}</legend>
            <span className={s.pickHead}>
              <span className={s.pickName}>{g.name + ' · ' + g.count}</span>
              <Text v="metaTight" c={color.blueSoft}>{g.eta}</Text>
            </span>
            <div className={s.chips}>
              {opts.length === 0 && <span className={s.noBranch}>{(g.r.pickup || 'No pickup branches listed') + ' · arrange with the shop'}</span>}
              {opts.map((o) => (
                <Chip key={o.b.id} size="block" className={s.branchChip} on={o.b.id === selId} onClick={() => setCo({ pickup: { ...co.pickup, [g.rid]: o.b.id } })}>
                  <span className={s.branchName}>{o.b.name}</span>
                  <Text v="caption">{c.d.engine.fmtKm(o.km) + ' · ' + o.open.text}</Text>
                </Chip>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </>
  );
}
