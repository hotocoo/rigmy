import type { Metadata } from 'next';
import { Trending } from '@/components/market/Trending';

export const metadata: Metadata = { title: 'Trending · RigMY', description: 'Price index, biggest drops, most-added parts and upcoming Malaysian sale days.' };

export default function Page() {
  return <Trending />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
