'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Text } from './Text';
import type { DataAttrs } from './Text';
import s from './ui.module.css';

/**
 * Bordered list of label / value rows (checkout review, order summary). Pass `rows`, or compose `KvRow` children
 * (other row-shaped children, e.g. a section per shop, sit between them with the same dividers).
 * `density`: regular 150px labels · compact 120px labels and tighter rows.
 */
export function Rows({ rows, density = 'regular', className, children, ...rest }: {
  rows?: { label: ReactNode; value: ReactNode }[];
  density?: 'regular' | 'compact';
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement> & DataAttrs) {
  return (
    <div className={cx(s.rows, density === 'compact' && s.rowsCompact, className)} {...rest}>
      {rows?.map((r, i) => <KvRow key={i} label={r.label}>{r.value}</KvRow>)}
      {children}
    </div>
  );
}

/** One label / value row inside `Rows`. */
export function KvRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className={s.kv}>
      <Text v="tagLoose">{label}</Text>
      <span className={s.kvValue}>{children}</span>
    </div>
  );
}
