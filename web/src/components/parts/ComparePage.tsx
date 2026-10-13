'use client';

import { useGo } from '@/components/shell/useGo';
import { Button, IconButton, Meta, Text } from '@/components/ui';
import { cx } from '@/lib/cx';
import { useData } from '@/lib/data';
import { specVal } from '@/lib/format';
import { href } from '@/lib/routes';
import { useRig } from '@/lib/store';
import type { CatalogPart } from '@/lib/types';
import { FitLine, InBuild, PageEmpty, PartPrice } from './bits';
import { fitOf, priceOf } from './derive';
import { useAddPart, useBrowse, useCompareToggle } from './hooks';
import { lastBrowseCat } from './lastCategory';
import c from './compare.module.css';
import s from './parts.module.css';

/** Spec rows for the compared parts; on rows with a `better` direction the best distinct value is flagged. */
function compareRows(specdef: ReturnType<typeof useData>['specdef'], items: CatalogPart[]) {
  return (specdef[items[0].cat] || []).map(([key, label, unit, better]) => {
    const vals = items.map((p) => p.specs[key]);
    const nums = vals.filter((x): x is number => typeof x === 'number');
    const best = better && nums.length > 1 ? (better === 'high' ? Math.max(...nums) : Math.min(...nums)) : null;
    const allSame = nums.length === vals.length && new Set(nums).size === 1;
    return { label, cells: vals.map((x) => ({ text: specVal(x, unit), best: best != null && x === best && !allSame })) };
  });
}

/** Compare (/compare): up to three parts of one category side by side. */
export function ComparePage() {
  const d = useData();
  const browse = useBrowse();
  const compare = useRig((x) => x.compare);
  const items = compare.map((id) => d.byId[id]).filter((p): p is CatalogPart => !!p && !!p.cat);
  const fallback = lastBrowseCat(d);
  return (
    <div className={cx(s.page, s.pageCompare)}>
      {items.length
        ? <CompareView items={items} />
        : <PageEmpty
            title="Nothing to compare yet"
            lead="Tap Compare on up to three parts from the same category while browsing."
            action={fallback ? 'Browse parts' : undefined}
            onAction={fallback ? () => browse(fallback) : undefined}
          />}
    </div>
  );
}

function CompareView({ items }: { items: CatalogPart[] }) {
  const d = useData();
  const go = useGo();
  const browse = useBrowse();
  const addPart = useAddPart();
  const toggleCompare = useCompareToggle();
  const build = useRig((x) => x.build), region = useRig((x) => x.region);
  const cat = items[0].cat, cd = d.cat(cat);
  const rows = compareRows(d.specdef, items);
  return (
    <>
      <div className={c.head}>
        <Text v="h2" as="h1">{'Compare ' + cd.long.toLowerCase() + 's'}</Text>
        <Button variant="ghost" size="sm" onClick={() => browse(cat)}>Add another</Button>
      </div>
      <div className={c.scroll}>
        <table className={c.table}>
          <caption className="sr-only">{'Specifications of ' + items.length + ' ' + cd.long.toLowerCase() + 's side by side'}</caption>
          <colgroup><col className={c.labelCol} />{items.map((p) => <col key={p.id} />)}</colgroup>
          <thead>
            <tr>
              <td className={c.corner} />
              {items.map((p) => {
                const pr = priceOf(d, p.id, region), inBuild = build[cat] === p.id;
                return (
                  <th key={p.id} scope="col" className={c.item}>
                    <div className={c.card}>
                      <div className={c.cardTop}>
                        <Text v="eyebrowSm">{p.brand}</Text>
                        <IconButton tone="remove" size="sm" onClick={() => toggleCompare(p.id)} label={'Remove ' + p.name + ' from compare'} />
                      </div>
                      <span className={c.name}>{p.name}</span>
                      <FitLine {...fitOf(d, build, p)} size="sm" />
                      <PartPrice value={pr.lo?.price} empty={pr.empty} size="compare" />
                      <div className={c.actions}>
                        {inBuild ? <InBuild size="md" /> : <Button size="sm" className={s.grow} onClick={() => addPart(p)}>Use this</Button>}
                        <Button variant="ghost" size="sm" onClick={() => go(href.part(p.id))} aria-label={'3D view, prices and specs for ' + p.name}>3D</Button>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className={c.rowLabel}>{row.label}</th>
                {row.cells.map((cell, i) => <td key={items[i].id} className={cx(c.cell, cell.best && c.best)}>{cell.text}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Meta>Blue values are the best in each row.</Meta>
    </>
  );
}
