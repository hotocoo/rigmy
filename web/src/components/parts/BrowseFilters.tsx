'use client';

import { Button, Chip, Eyebrow, Field, Toggle } from '@/components/ui';
import { cx } from '@/lib/cx';
import { activeCount, type Filters, type Range, type SpecFacet } from './filters';
import b from './browse.module.css';

interface Props {
  facets: SpecFacet[];
  value: Filters;
  onChange: (f: Filters) => void;
  /** Parts dropped only because they do not state a filtered spec (or price). */
  hidden: number;
  /** Mobile: panel expanded behind the Filters button. */
  open: boolean;
  onToggleOpen: () => void;
}

const num = (s: string): number | undefined => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s));

/** Min/max number inputs under a legend; each input carries its own visible label. */
function RangeFields({ legend, value, onChange, hint }: { legend: string; value: Range; onChange: (r: Range) => void; hint?: string }) {
  return (
    <fieldset className={b.group}>
      <legend><Eyebrow>{legend}</Eyebrow></legend>
      <div className={b.range}>
        <Field size="sm" mono type="number" inputMode="decimal" min={0} label="Min" value={value.min ?? ''} onValue={(v) => onChange({ ...value, min: num(v) })} />
        <Field size="sm" mono type="number" inputMode="decimal" min={0} label="Max" value={value.max ?? ''} onValue={(v) => onChange({ ...value, max: num(v) })} />
      </div>
      {hint && <span className={b.hint}>{hint}</span>}
    </fieldset>
  );
}

/** Spec, price and toggle filters for one category. Collapsible behind a button on phones. */
export function BrowseFilters({ facets, value, onChange, hidden, open, onToggleOpen }: Props) {
  const n = activeCount(value);
  const pickCat = (key: string, v: string) => {
    const cur = value.cats[key] ?? [];
    onChange({ ...value, cats: { ...value.cats, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } });
  };
  return (
    <section className={b.filterPanel} aria-label="Filters">
      <Button variant="mini" className={b.filterToggle} aria-expanded={open} aria-controls="browse-filters" onClick={onToggleOpen}>
        {'Filters (' + n + ')'}
      </Button>
      <div id="browse-filters" className={cx(b.filterBody, open && b.filterOpen)}>
        <div className={b.toggles}>
          <Toggle on={value.inStock} label="In stock only" onClick={() => onChange({ ...value, inStock: !value.inStock })} />
          <Toggle on={value.fitOnly} label="Compatible with my build" onClick={() => onChange({ ...value, fitOnly: !value.fitOnly })} />
          <Toggle on={value.verifiedOnly} label="Verified specs only" onClick={() => onChange({ ...value, verifiedOnly: !value.verifiedOnly })} />
          <Button variant="mini" disabled={!n} onClick={() => onChange({ cats: {}, ranges: {}, price: {}, inStock: false, fitOnly: false, verifiedOnly: false })}>Clear filters</Button>
        </div>
        {hidden > 0 && <p className={b.hiddenNote} role="status">{hidden + ' hidden: spec or price not listed'}</p>}
        <div className={b.facetGrid}>
          <RangeFields legend="Price (RM)" value={value.price} onChange={(price) => onChange({ ...value, price })} />
          {facets.map((f) => f.kind === 'num' ? (
            <RangeFields
              key={f.key}
              legend={f.label + (f.unit ? ' (' + f.unit + ')' : '')}
              hint={f.min + ' to ' + f.max}
              value={value.ranges[f.key] ?? {}}
              onChange={(r) => onChange({ ...value, ranges: { ...value.ranges, [f.key]: r } })}
            />
          ) : (
            <fieldset key={f.key} className={b.group}>
              <legend><Eyebrow>{f.label}</Eyebrow></legend>
              <div className={b.chips}>
                {f.options.map((o) => (
                  <Chip key={o.value} size="sm" on={(value.cats[f.key] ?? []).includes(o.value)} onClick={() => pickCat(f.key, o.value)}>
                    {o.value + ' (' + o.count + ')'}
                  </Chip>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </section>
  );
}
