'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Product } from '@/lib/types';
import Studio, { type StudioRef } from '@/studio/Studio';
import type { PartVis, StudioCat } from '@/studio/types';
import s from './studio.module.css';

/**
 * Single-part 3D viewer filling its positioned parent. Sends `{ rig: 'solo' }` once the studio is ready and again
 * whenever the product changes.
 */
export function SoloStudio({ product }: { product: Product | null | undefined }) {
  const ref = useRef<StudioRef | null>(null);
  const ready = useRef(false), last = useRef<string | null>(null);
  const cur = useRef(product);
  const push = useCallback(() => {
    const p = cur.current;
    if (!ready.current || !p || !ref.current || p.id === last.current) return;
    last.current = p.id;
    ref.current.send({ rig: 'solo', cat: p.cat as StudioCat, item: { id: p.id, label: p.name, vis: p.vis as PartVis } });
  }, []);
  useEffect(() => { cur.current = product; push(); }, [product, push]);
  return (
    <div className={s.fill}>
      <Studio ref={ref} mode="solo" className={s.canvas} onReady={() => { ready.current = true; last.current = null; push(); }} />
    </div>
  );
}
