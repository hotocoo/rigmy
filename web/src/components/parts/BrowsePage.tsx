'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGo } from '@/components/shell/useGo';
import { BackLink, Button, Chip, Dot, EmptyState, Eyebrow, Meta, Segmented, Tabs, Text } from '@/components/ui';
import { regionById } from '@/lib/content';
import { cx } from '@/lib/cx';
import { useData } from '@/lib/data';
import { href, ROUTES } from '@/lib/routes';
import { DEF, useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { CatalogPart, CatId } from '@/lib/types';
import { isCatalogPart } from '@/lib/types';
import { BrowsePreview } from './BrowsePreview';
import { BrowseFilters } from './BrowseFilters';
import { BrowseRow } from './BrowseRow';
import { BrowseTable, TABLE_SPEC_COLS } from './BrowseTable';
import { applyFilters, buildFacets, cellOf, EMPTY_FILTERS, sortRows, type Filters, type Row } from './filters';
import { ALL_FACET, PAGE_SIZE, SORT_OPTIONS, VIEW_OPTIONS } from './constants';
import { useAddPart, useCompareToggle } from './hooks';
import { fitOf } from './derive';
import { lastBrowseCat, rememberBrowseCat } from './lastCategory';
import { listedPrice } from '@/components/build/shared';
import b from './browse.module.css';
import s from './parts.module.css';

/** Browse one category (/parts/[cat]): category tabs, facet + sort filters, part rows and a live 3D preview. */
export function BrowsePage() {
  const params = useParams<{ cat: string }>();
  // Keyed by category so search, filters and paging start fresh when the tab changes.
  return <BrowseCategory key={params.cat} />;
}

function BrowseCategory() {
  const params = useParams<{ cat: string }>();
  const d = useData();
  const router = useRouter();
  const go = useGo();
  const addPart = useAddPart();
  const toggleCompare = useCompareToggle();
  const build = useRig((x) => x.build), region = useRig((x) => x.region), facet = useRig((x) => x.facet), sort = useRig((x) => x.sort);
  const previewId = useRig((x) => x.previewId), compare = useRig((x) => x.compare), set = useRig((x) => x.set);
  const [q, setQ] = useState('');
  const cd = d.categories.find((c) => c.id === params.cat);
  const cat = cd?.id;

  // Remember a valid category; send an unknown one to the last browsed (or first) category.
  useEffect(() => {
    if (cat) { rememberBrowseCat(cat); return; }
    const fallback = lastBrowseCat(d);
    if (fallback) router.replace(href.parts(fallback));
  }, [cat, d, router]);

  const view = useRig((x) => x.view), tsortRaw = useRig((x) => x.tsort);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [paging, setPaging] = useState({ n: PAGE_SIZE, sig: '' });

  const all = d.products.filter((p): p is CatalogPart => p.cat === cat);
  const defs = d.specdef[cat as CatId] ?? [];
  const specFacets = buildFacets(defs, all);
  const needle = q.trim().toLowerCase();
  // Text search across name, brand and spec values (market listings are excluded by the cat filter above).
  const matches = (p: CatalogPart) =>
    !needle || p.name.toLowerCase().includes(needle) || p.brand.toLowerCase().includes(needle) || Object.values(p.specs).some((v) => String(v).toLowerCase().includes(needle));
  // Derived per-part values; compatibility is only evaluated when its filter is on.
  const rows: Row[] = all.map((p) => ({
    p,
    price: d.engine.lowest(p.id, region)?.price ?? listedPrice(d.engine.offers(p.id, region)),
    inStock: d.engine.offers(p.id, region).some((o) => o.stock === 'In stock' || o.stock === 'Low stock'),
    fits: !filters.fitOnly || fitOf(d, build, p).tone === 'ok',
  }));
  const { kept, hidden } = applyFilters(rows.filter((r) => (facet === ALL_FACET || r.p.facet === facet) && matches(r.p)), filters);
  const tsort = tsortRaw.key === 'name' || tsortRaw.key === 'price' || defs.slice(0, TABLE_SPEC_COLS).some(([k]) => k === tsortRaw.key) ? tsortRaw : DEF.tsort;
  const sorted = view === 'table'
    ? sortRows(kept, (r) => cellOf(r, tsort.key), tsort.dir)
    : sort === 'name' ? sortRows(kept, (r) => r.p.name, 'asc') : sortRows(kept, (r) => r.price, sort === 'desc' ? 'desc' : 'asc');
  const sig = JSON.stringify([filters, q, facet, view, sort, tsort]);
  const shown = paging.sig === sig ? paging.n : PAGE_SIZE;
  const list = sorted.slice(0, shown);
  const sortBy = (key: string) => set({ tsort: { key, dir: tsort.key === key && tsort.dir === 'asc' ? 'desc' : 'asc' } });

  if (!cd || !cat) return null;

  const reg = regionById(d, region);
  const facets = [ALL_FACET, ...new Set(all.map((p) => p.facet))];
  const catPart = (id?: string | null): CatalogPart | undefined => {
    const p = id ? d.byId[id] : undefined;
    return p && isCatalogPart(p) && p.cat === cat ? p : undefined;
  };
  const preview = catPart(previewId) || catPart(build[cat]) || all.find((p) => facet === ALL_FACET || p.facet === facet);
  const pickTab = (id: string) => {
    if (id === cat) return;
    const next = d.categories.find((c) => c.id === id);
    if (!next) return;
    setQ('');
    set({ facet: ALL_FACET, previewId: build[next.id] || null });
    router.push(href.parts(next.id), { scroll: false });
  };

  return (
    <div className={cx(s.page, s.pageBrowse)}>
      <header className={b.head}>
        <div className={b.headTitle}>
          <BackLink onClick={() => go(ROUTES.build.path)}>Back to {ROUTES.build.navLabel.toLowerCase()}</BackLink>
          <Text v="h2" as="h1">{(build[cat] ? 'Change your ' : 'Choose a ') + cd.long.toLowerCase()}</Text>
        </div>
        <Meta>{kept.length + ' of ' + all.length + ' parts' + (needle ? ' matching "' + q.trim() + '"' : '') + ' · prices for ' + reg.name}</Meta>
      </header>

      <Tabs
        active={cat}
        onPick={pickTab}
        items={d.categories.map((c) => ({ id: c.id, idx: c.idx, label: c.label, badge: build[c.id] ? <Dot c={color.blue} size={5} glowPx={0} /> : undefined }))}
      />

      <div className={b.filters}>
        <div className={b.chips} role="group" aria-label={d.facet[cat]}>
          <Eyebrow className={b.chipLabel}>{d.facet[cat]}</Eyebrow>
          {facets.map((fc) => <Chip key={fc} size="sm" on={facet === fc} onClick={() => set({ facet: fc })}>{fc}</Chip>)}
        </div>
        {view === 'list' && (
          <div className={b.chips} role="group" aria-label="Sort">
            <Eyebrow className={b.chipLabel}>Sort</Eyebrow>
            {SORT_OPTIONS.map((o) => <Chip key={o.id} size="sm" on={sort === o.id} onClick={() => set({ sort: o.id })}>{o.label}</Chip>)}
          </div>
        )}
        <Segmented label="View" items={VIEW_OPTIONS} value={view} onChange={(v) => set({ view: v })} />
        <div className={b.search} role="search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={'Search ' + cd.long.toLowerCase() + 's by name or spec'}
            aria-label={'Search ' + cd.long.toLowerCase() + 's by name or spec'}
          />
          {q && <button type="button" className={b.clear} onClick={() => setQ('')} aria-label="Clear search">×</button>}
        </div>
      </div>

      <BrowseFilters facets={specFacets} value={filters} onChange={setFilters} hidden={hidden} open={filtersOpen} onToggleOpen={() => setFiltersOpen((o) => !o)} />

      <div className={b.body}>
        <div className={b.list}>
          {view === 'table' ? (
            <BrowseTable
              rows={list}
              defs={defs}
              sort={tsort}
              onSort={sortBy}
              inBuild={(r) => build[cat] === r.p.id}
              comparing={(r) => compare.includes(r.p.id)}
              onCompare={(r) => toggleCompare(r.p.id)}
              onDetails={(r) => go(href.part(r.p.id))}
              onAdd={(r) => addPart(r.p)}
            />
          ) : list.map(({ p }) => (
            <BrowseRow
              key={p.id}
              p={p}
              build={build}
              region={region}
              selected={preview?.id === p.id}
              comparing={compare.includes(p.id)}
              onPreview={() => set({ previewId: p.id })}
              onCompare={() => toggleCompare(p.id)}
              onDetails={() => go(href.part(p.id))}
              onAdd={() => addPart(p)}
            />
          ))}
          {sorted.length > shown && (
            <Button variant="ghost" className={b.more} onClick={() => setPaging({ n: shown + PAGE_SIZE, sig })}>
              {'Show ' + Math.min(PAGE_SIZE, sorted.length - shown) + ' more (' + (sorted.length - shown) + ' left)'}
            </Button>
          )}
          {!all.length && <EmptyState title={'No ' + cd.long.toLowerCase() + ' options yet'} body="Parts appear here as soon as they are added to the catalogue." />}
          {all.length > 0 && kept.length === 0 && <EmptyState title="No matches" body={'Nothing in ' + cd.long.toLowerCase() + 's matches these filters' + (needle ? ' and "' + q.trim() + '"' : '') + '. Loosen a filter or clear them.'} />}
          {compare.length > 1 && (
            <Button wide className={b.compareCta} onClick={() => go(ROUTES.compare.path)}>{'Compare ' + compare.length + ' parts'} →</Button>
          )}
        </div>
        {preview && view === 'list' && <BrowsePreview p={preview} build={build} region={region} onAdd={() => addPart(preview)} onDetails={() => go(href.part(preview.id))} />}
      </div>
    </div>
  );
}
