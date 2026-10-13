'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import s from './ui.module.css';

/**
 * Inline message.
 * - error: red box, announced (role="alert") · info: blue box · warn: amber box laid out as a column (message + action)
 * - callout: dashed blue box laid out as a row (message + action); `stack` lays it out as a column
 * `bare` drops the box and keeps the tone's text colour (a status line under a control).
 */
export function Notice({ tone, bare, stack, size = 'md', className, role, children, ...rest }: {
  tone: 'error' | 'warn' | 'info' | 'callout';
  bare?: boolean;
  stack?: boolean;
  /** lg: 13px text, for the message at the foot of a form. */
  size?: 'md' | 'lg';
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div role={role ?? (tone === 'error' ? 'alert' : undefined)}
      className={cx(s.notice, s['n-' + tone], bare && s.noticeBare, stack && s.noticeStack, size === 'lg' && s.noticeLg, className)} {...rest}>
      {children}
    </div>
  );
}
