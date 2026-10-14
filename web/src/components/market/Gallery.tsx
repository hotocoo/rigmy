'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGo } from '@/components/shell/useGo';
import { Button, Chip, EmptyState, Notice, Segmented, Text } from '@/components/ui';
import { api, useData } from '@/lib/data';
import { plural } from '@/lib/format';
import { endpoint, href, ROUTES } from '@/lib/routes';
import type { GalleryBuild, GalleryPage } from '@/lib/types';
import { MarketHeader, MarketPage } from './MarketHeader';
import { GalleryCard } from './gallery/GalleryCard';
import { brandsOf, byLowestTotal, summarize } from './gallery/summarize';
import m from './market.module.css';
import g from './gallery/gallery.module.css';

type Sort = 'new' | 'price';
const SORTS = [{ id: 'new', label: 'Newest' }, { id: 'price', label: 'Lowest total' }] as const;

type Feed = { builds: GalleryBuild[]; next: string | null; state: 'loading' | 'ready' | 'error'; error: string; busy: boolean };

/** Public gallery of builds people chose to publish: GET /api/gallery, totals from today's prices via the engine. */
export function Gallery() {
  const d = useData();
  const go = useGo();
  const [feed, setFeed] = useState<Feed>({ builds: [], next: null, state: 'loading', error: '', busy: false });
  const [sort, setSort] = useState<Sort>('new');
  const [cpuBrand, setCpuBrand] = useState<string | null>(null);
  const [gpuBrand, setGpuBrand] = useState<string | null>(null);

  const fail = (e: unknown) => setFeed((f) => ({ ...f, state: 'error', busy: false, error: e instanceof Error ? e.message : String(e) }));
  useEffect(() => {
    let dead = false;
    api<GalleryPage>(endpoint.gallery())
      .then((p) => { if (!dead) setFeed({ builds: p.builds, next: p.nextCursor, state: 'ready', error: '', busy: false }); })
      .catch((e: unknown) => { if (!dead) setFeed((f) => ({ ...f, state: 'error', error: e instanceof Error ? e.message : String(e) })); });
    return () => { dead = true; };
  }, []);

  const more = () => {
    setFeed((f) => ({ ...f, busy: true }));
    api<GalleryPage>(endpoint.gallery(feed.next))
      .then((p) => setFeed((f) => ({ ...f, builds: [...f.builds, ...p.builds], next: p.nextCursor, state: 'ready', busy: false })))
      .catch(fail);
  };

  const all = useMemo(() => feed.builds.map((b) => summarize(d, b)), [d, feed.builds]);
  const cpuBrands = useMemo(() => brandsOf(all, 'cpu'), [all]);
  const gpuBrands = useMemo(() => brandsOf(all, 'gpu'), [all]);
  const shown = useMemo(() => {
    const list = all.filter((s) => (!cpuBrand || s.cpu?.brand === cpuBrand) && (!gpuBrand || s.gpu?.brand === gpuBrand));
    return sort === 'price' ? [...list].sort(byLowestTotal) : list;
  }, [all, cpuBrand, gpuBrand, sort]);

  const pick = (cur: string | null, set: (v: string | null) => void, v: string) => set(cur === v ? null : v);

  if (feed.state === 'loading') {
    return <MarketPage><div role="status"><MarketHeader eyebrow="Community" title="Loading builds…" muted /></div></MarketPage>;
  }
  if (feed.state === 'error' && !feed.builds.length) {
    return (
      <MarketPage>
        <EmptyState eyebrow="Community" title="Could not load the gallery" body={feed.error}
          action={<Button onClick={() => window.location.reload()}>Try again</Button>} />
      </MarketPage>
    );
  }
  if (!feed.builds.length) {
    return (
      <MarketPage>
        <EmptyState eyebrow="Community" title="No builds published yet"
          body="Builds appear here when someone chooses to publish them from Save & share. Nothing is added automatically."
          action={<Button onClick={() => go(ROUTES.build.path)}>Start a build</Button>} />
      </MarketPage>
    );
  }

  const lede = plural(feed.builds.length, 'build') + ' loaded' + (feed.next ? ', newest first' : '') + '. Each total is the lowest in-stock price today, not what the builder paid.';
  return (
    <MarketPage>
      <MarketHeader eyebrow="Community" title="Completed builds" lede={lede} />

      <div data-rv="1" className={g.filters}>
        <div className={g.filterRow}>
          <Segmented label="Sort" items={SORTS} value={sort} onChange={setSort} />
        </div>
        {cpuBrands.length > 0 && (
          <div className={g.filterRow} role="group" aria-label="CPU brand">
            <Text v="capsWide">CPU</Text>
            {cpuBrands.map((b) => <Chip key={b} on={cpuBrand === b} onClick={() => pick(cpuBrand, setCpuBrand, b)}>{b}</Chip>)}
          </div>
        )}
        {gpuBrands.length > 0 && (
          <div className={g.filterRow} role="group" aria-label="GPU brand">
            <Text v="capsWide">GPU</Text>
            {gpuBrands.map((b) => <Chip key={b} on={gpuBrand === b} onClick={() => pick(gpuBrand, setGpuBrand, b)}>{b}</Chip>)}
          </div>
        )}
        {sort === 'price' && feed.next && <Text v="meta">Sorted among the builds loaded so far. Load more to include older ones.</Text>}
      </div>

      {shown.length ? (
        <ul className={g.grid} aria-label="Published builds">
          {shown.map((s) => <GalleryCard key={s.gb.id} s={s} open={(id) => go(href.shared(id))} />)}
        </ul>
      ) : (
        <EmptyState title="No builds match these filters" body="Clear a brand to see more."
          action={<Button variant="ghost" onClick={() => { setCpuBrand(null); setGpuBrand(null); }}>Clear filters</Button>} />
      )}

      {feed.state === 'error' && <Notice tone="warn" bare role="alert">{'Could not load more: ' + feed.error}</Notice>}
      {feed.next && (
        <div className={m.actions}>
          <Button variant="ghost" onClick={more} disabled={feed.busy}>{feed.busy ? 'Loading…' : 'Load more'}</Button>
        </div>
      )}
    </MarketPage>
  );
}
