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
export function SoloStudio({ product, installed = false }: { product: Product | null | undefined; installed?: boolean }) {
  const ref = useRef<StudioRef | null>(null);
  const ready = useRef(false), last = useRef<string | null>(null);
  const cur = useRef(product), inst = useRef(installed);
  const push = useCallback(() => {
    const p = cur.current;
    const key = p ? p.id + (inst.current ? ':installed' : '') : null;
    if (!ready.current || !p || !ref.current || key === last.current) return;
    last.current = key;
    ref.current.send({ rig: 'solo', cat: p.cat as StudioCat, item: { id: p.id, label: p.name, vis: p.vis as PartVis, installed: inst.current } });
  }, []);
  useEffect(() => { cur.current = product; inst.current = installed; push(); }, [product, installed, push]);
  return (
    <div className={s.fill}>
      <Studio ref={ref} mode="solo" className={s.canvas} onReady={() => { ready.current = true; last.current = null; push(); }} />
    </div>
  );
}
