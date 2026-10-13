'use client';

import { useEffect, useState } from 'react';
import { useGo } from '@/components/shell/useGo';
import { Button, EmptyState } from '@/components/ui';
import { api } from '@/lib/data';
import { endpoint, ROUTES } from '@/lib/routes';
import type { SavedBuild } from '@/lib/types';
import { MarketHeader, MarketPage } from './MarketHeader';
import { BuildSummary } from './sharedBuild/BuildSummary';

type Loaded = { id: string; state: 'ok'; sb: SavedBuild } | { id: string; state: 'error'; error: string };

/** Read-only page for a saved build: GET /api/builds/:id. */
export function SharedBuild({ id }: { id: string }) {
  const [st, setSt] = useState<Loaded | null>(null);
  useEffect(() => {
    let dead = false;
    api<SavedBuild>(endpoint.build(id))
      .then((sb) => { if (!dead) setSt({ id, state: 'ok', sb }); })
      .catch((e: unknown) => { if (!dead) setSt({ id, state: 'error', error: e instanceof Error ? e.message : String(e) }); });
    return () => { dead = true; };
  }, [id]);
  // Ignore a result that belongs to a previous id while the new one loads.
  const cur = st && st.id === id ? st : null;

  if (!cur) {
    return (
      <MarketPage narrow>
        <div role="status"><MarketHeader eyebrow="Shared build" title="Loading build…" muted /></div>
      </MarketPage>
    );
  }
  if (cur.state === 'error') return <NotFound error={cur.error} />;
  return <BuildSummary sb={cur.sb} />;
}

function NotFound({ error }: { error: string }) {
  const go = useGo();
  return (
    <MarketPage narrow>
      <EmptyState eyebrow="Shared build" title="This build link doesn't work"
        body={'It may have been mistyped, or the build was removed. (' + error + ')'}
        action={<Button onClick={() => go(ROUTES.build.path)}>Start a build</Button>} />
    </MarketPage>
  );
}
