'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { color } from '@/lib/tokens';
import { Text } from './Text';
import s from './ui.module.css';

/**
 * md 46px (form field: surface fill, 15px sans or mono) · mdc 42px · inline 38px (beside a `size="inline"` Button) · sm 30px.
 * The compact sizes sit on the page background in 500-weight mono, as in the prototype's location and alert strips.
 */
export type FieldSize = 'md' | 'mdc' | 'inline' | 'sm';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  label?: ReactNode;
  mono?: boolean;
  /** Validation message: marks the input invalid and wires the message to it (aria-invalid + aria-describedby). */
  error?: ReactNode;
  /** Invalid without a message of its own (e.g. a group summary explains it). */
  invalid?: boolean;
  hint?: ReactNode;
  onValue?: (v: string) => void;
  onChange?: InputHTMLAttributes<HTMLInputElement>['onChange'];
  size?: FieldSize;
  /** Class for the wrapping <label> (grid placement, width). `className` styles the <input>. */
  containerClassName?: string;
}

/** Labelled text input. The ref points at the <input>. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, mono, error, invalid, hint, onValue, onChange, size = 'md', className, containerClassName, 'aria-describedby': describedBy, ...rest }, ref,
) {
  const id = useId();
  const hintId = hint ? id + '-hint' : undefined, errId = error ? id + '-err' : undefined;
  const bad = !!error || !!invalid;
  return (
    <label className={cx(s.field, containerClassName)}>
      {label && <Text v="capsWide">{label}</Text>}
      <input ref={ref} className={cx(s.input, s['in-' + size], mono && s.inputMono, bad && s.inputInvalid, className)}
        aria-invalid={bad || undefined} aria-describedby={cx(describedBy, errId, hintId) || undefined}
        onChange={onValue ? (e) => onValue(e.target.value) : onChange} {...rest} />
      {error && <Text v="meta" c={color.error} id={errId}>{error}</Text>}
      {hint && <Text v="meta" id={hintId}>{hint}</Text>}
    </label>
  );
});
