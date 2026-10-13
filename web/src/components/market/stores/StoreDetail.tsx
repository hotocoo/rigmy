'use client';

import { BackLink, Button, Eyebrow, LinkButton, Panel, Text } from '@/components/ui';
import { useData } from '@/lib/data';
import { fmt, openColor, plural, stockColor, telHref } from '@/lib/format';
import { directionsUrl } from '@/lib/location';
import { color, tone } from '@/lib/tokens';
import type { Offer, Preset, Product } from '@/lib/types';
import { inStock } from '../util';
import { StoreHours } from './StoreHours';
import type { StoreRow } from './useStores';
import m from '../market.module.css';
import s from './stores.module.css';

export interface StoreDetailProps {
  x: StoreRow;
  now: number;
  parts: Product[];
  listing: Record<string, Offer>;
  /** Offered as a one-click starting point when the build is empty. */
  preset: Preset | null;
  loadPreset: () => void;
  back: () => void;
  pickup: (ok: Product[]) => void;
}

export function StoreDetail({ x, now, parts, listing, preset, loadPreset, back, pickup }: StoreDetailProps) {
  const d = useData();
  const { b, r } = x;
  const rName = r?.name || b.retailerId;
  const items = parts.map((p) => {
    const o = listing[p.id] || null;
    return { p, o, ok: inStock(o?.stock), cat: p.cat ? d.cat(p.cat)?.long || p.cat : p.market || 'Other' };
  });
  const ok = items.filter((i) => i.ok);
  const sumColor = ok.length === parts.length ? tone.ok : ok.length ? color.blueSoft : tone.warn;
  const pickupTotal = ok.reduce((a, i) => a + i.o!.price, 0);

  return (
    <div className={s.detail}>
      <BackLink onClick={back}>All stores</BackLink>
      <div data-rv="1" className={s.detailHead}>
        <Eyebrow c={color.blueSoft}>{rName}</Eyebrow>
        <Text v="titleXl" as="h2">{b.name}</Text>
        <Text v="bodySm">{b.addr}</Text>
      </div>
      <dl data-rv="1" className={s.facts}>
        <div className={s.fact}><Text v="eyebrowSm" as="dt">Distance</Text><dd className={s.factBig}>{d.engine.fmtKm(x.km)}</dd></div>
        <div className={s.fact}><Text v="eyebrowSm" as="dt">Now</Text><dd className={s.factSmall} style={{ color: openColor(x.open) }}>{x.open.text}</dd></div>
        <div className={s.fact}><Text v="eyebrowSm" as="dt">Listed from</Text><dd className={s.factSmall}>{b.source === 'osm' ? 'OpenStreetMap' : 'Retailer'}</dd></div>
      </dl>
      <div data-rv="1" className={m.actions}>
        <LinkButton href={directionsUrl(b.lat, b.lon)} external>Directions</LinkButton>
        {b.phone && <LinkButton variant="ghost" href={telHref(b.phone)}>{'Call ' + b.phone}</LinkButton>}
        {r?.website && <LinkButton variant="ghost" href={r.website} external>Website</LinkButton>}
      </div>
      <StoreHours b={b} now={now} />
      {b.services.length > 0 && (
        <ul data-rv="1" className={s.tags} aria-label="Services">
          {b.services.map((sv) => <li key={sv} className={s.tag}>{sv}</li>)}
        </ul>
      )}
      <Panel data-rv="1" className={s.buildBox}>
        <div className={s.sumHead}>
          <Text v="title">Your build at this store</Text>
          {parts.length > 0 && <span className={s.sum} style={{ color: sumColor }}>{ok.length + ' of ' + parts.length + ' in stock online'}</span>}
        </div>
        {!parts.length ? (
          <>
            <Text v="bodySm" c={color.fg3}>{'Add parts to your build to see what ' + rName + ' lists in stock.'}</Text>
            {preset && <Button variant="mini" onClick={loadPreset} className={s.inlineAction}>{'Load the ' + preset.name + ' preset'}</Button>}
          </>
        ) : (
          <span className={s.fine}>{'Listed in stock online at ' + rName + '; call the store to confirm shelf stock.'}</span>
        )}
        {items.map((i) => (
          <div key={i.p.id} className={s.item}>
            <span className={s.itemText}><Text v="eyebrowSm">{i.cat}</Text><Text v="uiSm">{i.p.name}</Text></span>
            <span className={s.itemEnd}>
              <span className={s.itemPrice}>{i.o ? fmt(i.o.price) : '—'}</span>
              <span className={s.itemStock} style={{ color: stockColor(i.o?.stock) }}>{i.o ? (i.o.stock === 'Unknown' ? 'Stock unknown' : i.o.stock) + ' online' : 'Not listed'}</span>
            </span>
          </div>
        ))}
        {ok.length > 0 && (
          <Button onClick={() => pickup(ok.map((i) => i.p))}>
            {'Pick up ' + (ok.length === parts.length ? 'everything' : plural(ok.length, 'part')) + ' here · ' + fmt(pickupTotal)}
          </Button>
        )}
      </Panel>
    </div>
  );
}
