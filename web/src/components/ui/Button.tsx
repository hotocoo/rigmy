'use client';

import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import s from './ui.module.css';

/**
 * Colour treatments.
 * - primary: filled blue · ghost: outlined · accent: blue-tinted · fix: stronger blue tint for a one-click fix · glass: blurred, for controls over the 3D stage
 * - veil: outlined over a translucent page-colour wash, for calls to action laid over the 3D hero (the wash strength
 *   comes from `--veil`, default 50%, so a section can set it without restyling the button)
 * - mini: quiet outlined mono caps (defaults to the `mini` size) · quiet: dimmer outline, for secondary row actions
 * - link: blue mono caps text · danger: quiet until hovered red · dangerOutline: ghost with a red outline (a blocking fix)
 */
export type ButtonVariant = 'primary' | 'ghost' | 'accent' | 'fix' | 'glass' | 'veil' | 'mini' | 'quiet' | 'link' | 'danger' | 'dangerOutline';
/**
 * Geometry (height · horizontal padding · type). Sans sizes:
 * lg 48·22·15 · lgSlim 48·18·14 · tall 46·18·14 · md 44·18·14 · mdSlim 42·16·13.5 · mdc 40·16·13 · inline 38·14·13 (beside an
 * inline Field) · sm 36·14·13 · compact 34·12·12.5 · tiny 30·12·12.
 * Mono caps sizes: tool 32·12·10.5 · mini 30·10·10 · xs 28·9·10. `icon` is a 28px square glyph button.
 * `wide` swaps in the size's roomier padding (lg 24 · tall 22 · md 20 · mdSlim 20 · xs 10) for a lone call to action.
 */
export type ButtonSize = 'lg' | 'lgSlim' | 'tall' | 'md' | 'mdSlim' | 'mdc' | 'inline' | 'sm' | 'compact' | 'tiny' | 'tool' | 'mini' | 'xs' | 'icon';

interface BtnBase {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Roomier horizontal padding (see ButtonSize). */
  wide?: boolean;
  full?: boolean;
  /** Pressed state of a toggle (mini / glass show it); sets aria-pressed. */
  on?: boolean;
  className?: string;
  children?: ReactNode;
}
export type ButtonProps = BtnBase & ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Work in progress: disables the button, shows a progress cursor and sets aria-busy. */
  busy?: boolean;
};
type LinkButtonProps = BtnBase & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; external?: boolean };

function btnClass({ variant = 'primary', size, wide, full, on, className }: BtnBase) {
  const sz = variant === 'link' ? null : size || (variant === 'mini' ? 'mini' : 'md');
  return cx(s.btn, sz && s['sz-' + sz], wide && s.wide, s[variant], on && s.pressed, full && s.full, className);
}

/** Button. See ButtonVariant and ButtonSize for the design vocabulary; never resize one from a page stylesheet. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant, size, wide, full, on, busy, disabled, className, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={btnClass({ variant, size, wide, full, on, className })} disabled={disabled || busy}
      aria-pressed={on} aria-busy={busy || undefined} {...rest} />
  );
});

/** Anchor styled as a button. `external` opens in a new tab with a safe rel, appends ↗ and says so to screen readers. */
export function LinkButton({ variant, size, wide, full, on, className, external, children, ...rest }: LinkButtonProps) {
  return (
    <a className={btnClass({ variant, size, wide, full, on, className })} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : null)} {...rest}>
      {children}
      {external && <><span aria-hidden>↗</span><span className="sr-only"> (opens in a new tab)</span></>}
    </a>
  );
}

/**
 * Square glyph button (× close / remove). `tone="close"` brightens on hover; `tone="remove"` turns red.
 * `label` is required because the glyph means nothing to a screen reader.
 */
export function IconButton({ label, tone = 'close', size = 'md', glyph = '×', className, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & { label: string; tone?: 'close' | 'remove'; size?: 'sm' | 'md'; glyph?: ReactNode }) {
  return (
    <button type="button" aria-label={label} className={cx(s.iconBtn, size === 'sm' && s.iconBtnSm, tone === 'remove' ? s.iconRemove : s.iconClose, className)} {...rest}>
      <span aria-hidden>{glyph}</span>
    </button>
  );
}

/** "← Back to …" text button that sits above a page or panel title. */
export function BackLink({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return <button type="button" onClick={onClick} className={cx(s.back, className)}><span aria-hidden>← </span>{children}</button>;
}
