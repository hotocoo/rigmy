'use client';

import { Dot, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { useData } from '@/lib/data';
import { fmt, keySpecs } from '@/lib/format';
import { tone } from '@/lib/tokens';
import type { Category, Check, Product, RegionId, Tone } from '@/lib/types';
import m from '../market.module.css';
import b from './sharedBuild.module.css';

/** Short verdict word per check status. */
export const STATUS_WORD: Record<Tone, string> = { ok: 'Pass', warn: 'Check', error: 'Fix', pending: 'Waiting', info: 'Info' };

/** Compatibility checks as compact status pills (the detail is in the tooltip). */
export function CheckPills({ checks }: { checks: Check[] }) {
  return (
    <ul data-rv="1" className={b.checks} aria-label="Compatibility checks">
      {checks.map((c) => (
        <li key={c.id} title={c.detail} className={b.check}>
          <Dot c={tone[c.status]} glowPx={0} />
          <span>{c.label}</span>
          <span className={b.checkValue}>{c.value}</span>
          <span className="sr-only">{' — ' + STATUS_WORD[c.status] + '. ' + c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/** One row per category: chosen part, first open check, and today's lowest in-stock offer. */
export function BuildParts({ parts, checks, region, open }: { parts: { c: Category; p: Product | null }[]; checks: Check[]; region: RegionId; open: (id: string) => void }) {
  const d = useData();
  return (
    <ul className={m.list}>
      {parts.map(({ c, p }) => {
        const o = p ? d.engine.lowest(p.id, region) : null;
        const chk = p ? checks.find((k) => k.parts.includes(c.id) && k.status !== 'ok') : null;
        return (
          <li key={c.id}>
            <button type="button" data-rv="1" disabled={!p} onClick={() => p && open(p.id)} className={cx(m.rowBtn, b.part)}>
              <Text v="tagLoose">{c.long}</Text>
              <span className={m.col}>
                <span className={b.partName}>{p ? p.name : 'Not chosen'}</span>
                {p && <Text v="meta">{keySpecs(p)}</Text>}
                {chk && (
                  <span className={b.partIssue} style={{ color: tone[chk.status] }}>
                    <Dot c={tone[chk.status]} glowPx={0} />{STATUS_WORD[chk.status] + ' · ' + chk.label + ' · ' + chk.value}
                  </span>
                )}
              </span>
              <span className={m.end}>
                <span className={cx(b.partPrice, !o && b.partShopNone)}>{o ? fmt(o.price) : '—'}</span>
                {p && <span className={cx(b.partShop, !o && b.partShopNone)}>{o ? d.retailerById[o.retailerId]?.name || o.retailerId : 'No in-stock offer'}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
