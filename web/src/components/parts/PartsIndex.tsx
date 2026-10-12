'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { EmptyState } from '@/components/ui';
import { useData } from '@/lib/data';
import { href } from '@/lib/routes';
import { lastBrowseCat } from './lastCategory';
import s from './parts.module.css';

/** /parts: forwards to the last browsed category (or the first configured one). */
export function PartsIndex() {
  const d = useData();
  const router = useRouter();
  const target = lastBrowseCat(d);
  useEffect(() => { if (target) router.replace(href.parts(target)); }, [target, router]);
  if (target) return null;
  return (
    <div className={s.page}>
      <EmptyState title="No part categories configured" body="The catalogue has no categories yet, so there is nothing to browse." />
    </div>
  );
}
