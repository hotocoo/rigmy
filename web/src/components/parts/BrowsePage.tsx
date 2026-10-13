'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGo } from '@/components/shell/useGo';
import { BackLink, Button, Chip, Dot, EmptyState, Eyebrow, Meta, Tabs, Text } from '@/components/ui';
import { regionById } from '@/lib/content';
import { cx } from '@/lib/cx';
import { useData, type Data } from '@/lib/data';
import { href, ROUTES } from '@/lib/routes';
import { useRig, type RigState } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { CatalogPart, RegionId } from '@/lib/types';
import { isCatalogPart } from '@/lib/types';
import { BrowsePreview } from './BrowsePreview';
import { BrowseRow } from './BrowseRow';
import { ALL_FACET, SORT_OPTIONS } from './constants';
import { useAddPart, useCompareToggle } from './hooks';
import { lastBrowseCat, rememberBrowseCat } from './lastCategory';
import b from './browse.module.css';
import s from './parts.module.css';

/** Order parts by the chosen sort. Parts with no price in the region always sort after priced ones. */
function sortParts(d: Data, parts: CatalogPart[], region: RegionId, sort: RigState['sort']) {
  if (sort === 'name') return parts.slice().sort((x, y) => x.name.localeCompare(y.name));
  const dir = sort === 'desc' ? -1 : 1;
  const low = new Map(parts.map((p) => [p.id, d.engine.lowest(p.id, region)?.price ?? null]));
  return parts.slice().sort((x, y) => {
    const a = low.get(x.id) ?? null, b = low.get(y.id) ?? null;
    if (a == null || b == null) return a == null && b == null ? 0 : a == null ? 1 : -1;
    return dir * (a - b);
  });
}

/** Browse one category (/parts/[cat]): category tabs, facet + sort filters, part rows and a live 3D preview. */
export function BrowsePage() {
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

  const all = d.products.filter((p): p is CatalogPart => p.cat === cat);
  const needle = q.trim().toLowerCase();
  // Text search across name, brand and spec values (market listings are excluded by the cat filter above).
  const matches = (p: CatalogPart) =>
    !needle || p.name.toLowerCase().includes(needle) || p.brand.toLowerCase().includes(needle) || Object.values(p.specs).some((v) => String(v).toLowerCase().includes(needle));
  const list = sortParts(d, all.filter((p) => (facet === ALL_FACET || p.facet === facet) && matches(p)), region, sort);

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
        <Meta>{list.length + ' of ' + all.length + ' parts' + (needle ? ' matching "' + q.trim() + '"' : '') + ' · prices for ' + reg.name}</Meta>
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
        <div className={b.chips} role="group" aria-label="Sort">
          <Eyebrow className={b.chipLabel}>Sort</Eyebrow>
          {SORT_OPTIONS.map((o) => <Chip key={o.id} size="sm" on={sort === o.id} onClick={() => set({ sort: o.id })}>{o.label}</Chip>)}
        </div>
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

      <div className={b.body}>
        <div className={b.list}>
          {list.map((p) => (
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
          {!all.length && <EmptyState title={'No ' + cd.long.toLowerCase() + ' options yet'} body="Parts appear here as soon as they are added to the catalogue." />}
          {all.length > 0 && list.length === 0 && <EmptyState title="No matches" body={'Nothing in ' + cd.long.toLowerCase() + 's matches "' + q.trim() + '". Try a different name, brand or spec.'} />}
          {compare.length > 1 && (
            <Button wide className={b.compareCta} onClick={() => go(ROUTES.compare.path)}>{'Compare ' + compare.length + ' parts'} →</Button>
          )}
        </div>
        {preview && <BrowsePreview p={preview} build={build} region={region} onAdd={() => addPart(preview)} onDetails={() => go(href.part(preview.id))} />}
      </div>
    </div>
  );
}
