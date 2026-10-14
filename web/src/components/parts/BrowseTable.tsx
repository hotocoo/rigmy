'use client';

import { Button, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { specVal } from '@/lib/format';
import type { RigState } from '@/lib/store';
import type { SpecDef } from '@/lib/types';
import { specCat, specNum, type Row } from './filters';
import { PartPrice, SourceTag } from './bits';
import b from './browse.module.css';

/** Spec columns shown in the table (the category's leading specdef entries). */
export const TABLE_SPEC_COLS = 5;

interface Props {
  rows: Row[];
  defs: SpecDef[];
  sort: RigState['tsort'];
  onSort: (key: string) => void;
  inBuild: (r: Row) => boolean;
  comparing: (r: Row) => boolean;
  onCompare: (r: Row) => void;
  onDetails: (r: Row) => void;
  onAdd: (r: Row) => void;
}

/** Sortable parts table. The wrapper is the positioned horizontal scroller, so nothing inside can widen the page. */
export function BrowseTable({ rows, defs, sort, onSort, inBuild, comparing, onCompare, onDetails, onAdd }: Props) {
  const cols = defs.slice(0, TABLE_SPEC_COLS);
  const th = (key: string, label: string, num = false) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cx(num && b.num)}>
      <button type="button" className={b.sortBtn} onClick={() => onSort(key)}>
        {label}<span aria-hidden className={b.arrow}>{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
  return (
    <div className={b.tableWrap}>
      <table className={b.table}>
        <thead>
          <tr>
            {th('name', 'Name')}
            {cols.map(([key, label, unit]) => th(key, unit ? label + ' (' + unit + ')' : label, true))}
            {th('price', 'Price', true)}
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.p.id}>
              <th scope="row" className={b.nameCell}>
                <div className={b.nameStack}>
                  <Text v="eyebrowSm">{r.p.brand}</Text>
                  <button type="button" className={b.nameBtn} onClick={() => onDetails(r)}>{r.p.name}</button>
                  <SourceTag source={r.p.source} />
                </div>
              </th>
              {cols.map(([key, , unit]) => {
                const v = specNum(r.p.specs[key]) ?? specCat(r.p.specs[key]);
                return <td key={key} className={b.num}>{v == null ? '—' : specVal(v, typeof v === 'number' ? unit : undefined)}</td>;
              })}
              <td className={b.num}>{r.price == null ? '—' : <PartPrice value={r.price} empty="—" size="row" />}</td>
              <td className={b.tableActions}>
                <Button variant="mini" on={comparing(r)} onClick={() => onCompare(r)}>{comparing(r) ? 'Comparing' : 'Compare'}</Button>
                {!inBuild(r) && <Button size="tiny" onClick={() => onAdd(r)}>Add</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
