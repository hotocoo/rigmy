'use client';

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import s from './ui.module.css';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  on: boolean;
  /**
   * sm 30px · md 32px · lg 36px sans · block: a multi-line option card · blockRow: an option card laid out in a row
   * (swatch + text). A block card's padding and gap come from `--chip-pad` / `--chip-gap` (default 14px / 6px), so a
   * page can tune them from its own class without competing with the kit's rules.
   */
  size?: 'sm' | 'md' | 'lg' | 'block' | 'blockRow';
  dot?: boolean;
  children?: ReactNode;
}
const CHIP_SIZE = { sm: s.chipSm, md: null, lg: s.chipLg, block: s.chipBlock, blockRow: cx(s.chipBlock, s.chipRow) } as const;

/** Selectable filter/option chip (aria-pressed). */
export function Chip({ on, size = 'md', dot, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={on} className={cx(s.chip, CHIP_SIZE[size], on && s.chipOn, className)} {...rest}>
      {dot && on && <span className={s.chipDot} />}
      {children}
    </button>
  );
}

/** Checkbox-style toggle chip (role="switch"). md 32px · tall 34px with 12px type (settings rows, e.g. alert channels). */
export function Toggle({ on, label, onClick, size = 'md', className, style }: { on: boolean; label: ReactNode; onClick: () => void; size?: 'md' | 'tall'; className?: string; style?: CSSProperties }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className={cx(s.chip, size === 'tall' && s.chipTall, on && s.chipOn, className)} style={style}>
      <span className={cx(s.box, on && s.boxOn)}>{on ? '✓' : ''}</span>{label}
    </button>
  );
}

export interface SegmentItem<T extends string> { id: T; label: ReactNode }
interface SegmentedProps<T extends string> {
  items: readonly SegmentItem<T>[];
  /** Selected id. Omit it for a row of momentary actions (e.g. camera angles): the control is then a plain button group. */
  value?: T | null;
  onChange: (id: T) => void;
  label: string;
  variant?: 'surface' | 'glass';
  className?: string;
  style?: CSSProperties;
}
/** Joined segmented control: a single-choice radiogroup, or a group of actions when `value` is omitted. */
export function Segmented<T extends string>({ items, value, onChange, label, variant = 'surface', className, style }: SegmentedProps<T>) {
  const choice = value !== undefined;
  return (
    <div role={choice ? 'radiogroup' : 'group'} aria-label={label} className={cx(s.seg, variant === 'glass' && s.segGlass, className)} style={style}>
      {items.map((it) => {
        const on = choice && it.id === value;
        return (
          <button key={it.id} type="button" {...(choice ? { role: 'radio', 'aria-checked': on } : null)} onClick={() => onChange(it.id)} className={cx(s.segItem, on && s.segOn)}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
