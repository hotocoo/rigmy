/** Joins the truthy class names: `cx(s.row, on && s.rowOn)`. */
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
