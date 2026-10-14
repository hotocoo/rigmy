'use client';

import { Meta, Price, Text } from '@/components/ui';
import { useData } from '@/lib/data';
import { dFmt, plural } from '@/lib/format';
import { color } from '@/lib/tokens';
import type { CardSummary } from './summarize';
import g from './gallery.module.css';

/** One published build: title, key parts, a mini parts list and today's lowest total (or an honest "no price"). */
export function GalleryCard({ s, open }: { s: CardSummary; open: (id: string) => void }) {
  const d = useData();
  const { gb, parts, cpu, gpu, total, priced, listed } = s;
  const rest = parts.filter((p) => p !== cpu && p !== gpu);
  const gone = gb.partCount - parts.length;
  return (
    <li className={g.item}>
      <button type="button" data-rv="1" className={g.card} onClick={() => open(gb.id)}>
        <span className={g.head}>
          <Text v="meta">{dFmt(gb.createdAt, true) + ' · ' + plural(gb.partCount, 'part')}</Text>
          <Text v="title" className={g.title}>{gb.title}</Text>
          {gb.note && <Text v="bodySm" c={color.fg3} className={g.note}>{gb.note}</Text>}
        </span>
        <span className={g.key}>
          <KeyPart label="CPU" name={cpu && (cpu.short || cpu.name)} />
          <KeyPart label="GPU" name={gpu && (gpu.short || gpu.name)} />
        </span>
        {rest.length > 0 && (
          <ul className={g.mini} aria-label="Other parts">
            {rest.map((p) => (
              <li key={p.id} className={g.miniRow}>
                <Text v="tagLoose">{p.cat ? d.cat(p.cat).long : ''}</Text>
                <span className={g.miniName}>{p.short || p.name}</span>
              </li>
            ))}
          </ul>
        )}
        {gone > 0 && <Meta>{plural(gone, 'part') + ' no longer in the catalogue'}</Meta>}
        <span className={g.foot}>
          <Price value={total ?? (listed.count ? listed.total : null)} empty="No price yet" v="price22" emptyV="meta" />
          <Meta>{total != null
            ? (priced < parts.length ? priced + ' of ' + parts.length + ' parts priced' : 'Lowest in-stock total')
            : listed.count ? 'Listed prices for ' + listed.count + ' of ' + parts.length + ' parts · delivery not listed by the shops'
              : 'No shop lists these parts in stock'}</Meta>
        </span>
      </button>
    </li>
  );
}

function KeyPart({ label, name }: { label: string; name: string | null | undefined }) {
  return (
    <span className={g.keyRow}>
      <Text v="tagLoose">{label}</Text>
      <span className={name ? g.keyName : g.keyNone}>{name || 'Not chosen'}</span>
    </span>
  );
}
