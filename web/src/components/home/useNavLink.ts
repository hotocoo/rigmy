'use client';

import { useCallback, type MouseEvent } from 'react';
import { useGo } from '@/components/shell/useGo';

type GoExtra = Parameters<ReturnType<typeof useGo>>[1];

/**
 * Props for a real `<a>` that navigates through the app's page wipe. Modified clicks (new tab / window) keep the
 * browser's default behaviour, so links stay links for keyboard, middle-click and assistive tech.
 */
export function useNavLink() {
  const go = useGo();
  return useCallback((path: string, extra?: GoExtra) => ({
    href: path,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      go(path, extra);
    },
  }), [go]);
}
