'use client';

import { useCallback } from 'react';
import { toast } from '@/components/shell/motion';
import { useGo } from '@/components/shell/useGo';
import { useData } from '@/lib/data';
import { href, ROUTES } from '@/lib/routes';
import { useRig } from '@/lib/store';
import type { CatId, Product } from '@/lib/types';
import { ADD_TOAST_DELAY_MS, ALL_FACET } from './constants';

/** Open a category's list with the facet reset and the build's current part (if any) previewed. */
export function useBrowse() {
  const go = useGo();
  return useCallback((cat: CatId) => {
    const b = useRig.getState().build;
    go(href.parts(cat), { facet: ALL_FACET, previewId: b[cat] || null });
  }, [go]);
}

/** Put a part in the build and fly to the builder with it selected; toast once the wipe has landed. */
export function useAddPart() {
  const go = useGo();
  const setPart = useRig((s) => s.setPart);
  return useCallback((p: Product) => {
    setPart(p.cat, p.id);
    go(ROUTES.build.path, { sel: p.cat });
    setTimeout(() => toast((p.short || p.name) + ' added to your build'), ADD_TOAST_DELAY_MS);
  }, [go, setPart]);
}


/** Toggle a part in the compare tray (the store keeps one category at a time, resolved from the catalogue). */
export function useCompareToggle() {
  const { byId } = useData();
  const toggle = useRig((s) => s.toggleCompare);
  return useCallback((id: string) => toggle(id, (x) => byId[x]?.cat), [byId, toggle]);
}
