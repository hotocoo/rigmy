import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SharedBuild } from '@/components/market/SharedBuild';

export const metadata: Metadata = { title: 'Shared build · RigMY', description: 'A saved PC build with compatibility checks and live Malaysian prices.' };

// No generateStaticParams: the id is runtime data, so it is read inside a Suspense boundary (Cache Components).
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      {params.then(({ id }) => <SharedBuild id={id} />)}
    </Suspense>
  );
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
