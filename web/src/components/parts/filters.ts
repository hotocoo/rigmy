import type { CatalogPart, SpecDef } from '@/lib/types';

/** Categorical specs with more distinct values than this are free text (fans, igpu…) and get no chip filter. */
export const MAX_CHIP_OPTIONS = 12;

/** A part with the derived values the filters and sorts need. */
export interface Row {
  p: CatalogPart;
  /** Shown price (lowest deliverable, else cheapest in-stock listing), null when none. */
  price: number | null;
  inStock: boolean;
  /** Compatible with the current build (tone 'ok'). */
  fits: boolean;
}

export interface Range { min?: number; max?: number }
export interface Filters {
  cats: Record<string, string[]>;
  ranges: Record<string, Range>;
  price: Range;
  inStock: boolean;
  fitOnly: boolean;
  verifiedOnly: boolean;
}
export const EMPTY_FILTERS: Filters = { cats: {}, ranges: {}, price: {}, inStock: false, fitOnly: false, verifiedOnly: false };

export interface SpecFacet {
  key: string;
  label: string;
  unit: string;
  kind: 'cat' | 'num';
  /** Categorical: distinct values with part counts. */
  options: { value: string; count: number }[];
  /** Numeric: observed bounds. */
  min: number;
  max: number;
}

type SpecVal = string | number | undefined;
const missing = (v: SpecVal) => v == null || v === '' || v === '—';

/** A spec value as a number, or null when absent or not numeric. */
export function specNum(v: SpecVal): number | null {
  if (v == null || missing(v)) return null;
  const n = typeof v === 'number' ? v : /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
/** A spec value as a categorical label, or null when absent. */
export const specCat = (v: SpecVal): string | null => (missing(v) ? null : String(v));

/** One facet per filterable spec, from what the parts actually carry. Numeric when every stated value is a number. */
export function buildFacets(defs: SpecDef[], parts: CatalogPart[]): SpecFacet[] {
  const out: SpecFacet[] = [];
  for (const [key, label, unit = ''] of defs) {
    const vals = parts.map((p) => p.specs[key]).filter((v) => !missing(v));
    if (!vals.length) continue;
    const nums = vals.map(specNum);
    if (nums.every((n) => n != null)) {
      const ns = nums as number[];
      const min = Math.min(...ns), max = Math.max(...ns);
      if (min !== max) out.push({ key, label, unit, kind: 'num', options: [], min, max });
      continue;
    }
    const counts = new Map<string, number>();
    for (const v of vals) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
    if (counts.size < 2 || counts.size > MAX_CHIP_OPTIONS) continue;
    const options = [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    out.push({ key, label, unit, kind: 'cat', options, min: 0, max: 0 });
  }
  return out;
}

const inRange = (n: number, r: Range) => (r.min == null || n >= r.min) && (r.max == null || n <= r.max);
const hasRange = (r?: Range) => !!r && (r.min != null || r.max != null);

/** Number of active filters (a spec counts once however many chips are picked). */
export function activeCount(f: Filters): number {
  return Object.values(f.cats).filter((v) => v.length).length + Object.values(f.ranges).filter(hasRange).length
    + (hasRange(f.price) ? 1 : 0) + [f.inStock, f.fitOnly, f.verifiedOnly].filter(Boolean).length;
}

/**
 * Apply filters. A part that states a value outside a filter is dropped. A part missing the filtered spec (or price)
 * is also dropped, but counted in `hidden` when nothing else excluded it, so the UI can say so honestly.
 */
export function applyFilters(rows: Row[], f: Filters): { kept: Row[]; hidden: number } {
  const kept: Row[] = [];
  let hidden = 0;
  for (const r of rows) {
    let fail = !((!f.inStock || r.inStock) && (!f.fitOnly || r.fits) && (!f.verifiedOnly || r.p.source !== 'listing'));
    let gap = false;
    if (hasRange(f.price)) { if (r.price == null) gap = true; else if (!inRange(r.price, f.price)) fail = true; }
    for (const [key, sel] of Object.entries(f.cats)) {
      if (!sel.length) continue;
      const v = specCat(r.p.specs[key]);
      if (v == null) gap = true; else if (!sel.includes(v)) fail = true;
    }
    for (const [key, range] of Object.entries(f.ranges)) {
      if (!hasRange(range)) continue;
      const n = specNum(r.p.specs[key]);
      if (n == null) gap = true; else if (!inRange(n, range)) fail = true;
    }
    if (fail) continue;
    if (gap) hidden++; else kept.push(r);
  }
  return { kept, hidden };
}

export type Cell = number | string | null;
/** Sort by a cell getter. Unknown (null) cells always go last, whichever the direction. Stable on ties. */
export function sortRows(rows: Row[], cell: (r: Row) => Cell, dir: 'asc' | 'desc'): Row[] {
  const m = dir === 'desc' ? -1 : 1;
  return rows
    .map((r, i) => ({ r, i, c: cell(r) }))
    .sort((a, b) => {
      if (a.c == null || b.c == null) return a.c == null && b.c == null ? a.i - b.i : a.c == null ? 1 : -1;
      const d = typeof a.c === 'number' && typeof b.c === 'number' ? a.c - b.c : String(a.c).localeCompare(String(b.c), undefined, { numeric: true });
      return d ? m * d : a.i - b.i;
    })
    .map((x) => x.r);
}

/** Cell for a table column key: 'name', 'price', or a spec key (numeric when it parses as a number). */
export function cellOf(r: Row, key: string): Cell {
  if (key === 'name') return r.p.name;
  if (key === 'price') return r.price;
  return specNum(r.p.specs[key]) ?? specCat(r.p.specs[key]);
}
