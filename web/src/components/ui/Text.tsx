'use client';

import type { ElementType, HTMLAttributes } from 'react';
import { type as typeScale, type TypeName } from '@/lib/tokens';

export type DataAttrs = Record<`data-${string}`, string | number | boolean | undefined>;
export type TextProps = { v: TypeName; c?: string; as?: ElementType; htmlFor?: string } & Omit<HTMLAttributes<HTMLElement>, 'color'> & DataAttrs;

/**
 * Text in one of the named type styles: `<Text v="eyebrow" c={color.blueSoft}>…</Text>`.
 *
 * Precedence: the type style, then `c`, then `style` (so `style` wins for a one-off tweak). The type is applied inline,
 * so a CSS-module `className` cannot change the font; use it for layout, wrapping and transitions only.
 */
export function Text({ v, c, as: As = 'span', style, className, children, ...rest }: TextProps) {
  return <As className={className} style={{ ...typeScale[v], ...(c ? { color: c } : null), ...style }} {...rest}>{children}</As>;
}
export const Eyebrow = (p: Omit<TextProps, 'v'>) => <Text v="eyebrow" {...p} />;
export const Meta = (p: Omit<TextProps, 'v'>) => <Text v="meta" {...p} />;
