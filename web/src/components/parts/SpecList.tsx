'use client';

import { Text } from '@/components/ui';
import { useData } from '@/lib/data';
import type { CatalogPart } from '@/lib/types';
import { specRows } from './derive';
import p from './part.module.css';

/** The part's full specification list. */
export function SpecList({ P }: { P: CatalogPart }) {
  const d = useData();
  return (
    <section data-rv="1" className={p.specs}>
      <Text v="h3" as="h2">Specifications</Text>
      <dl className={p.specList}>
        {specRows(d, P).map((sp) => (
          <div key={sp.label}><dt>{sp.label}</dt><dd>{sp.value}</dd></div>
        ))}
      </dl>
    </section>
  );
}
