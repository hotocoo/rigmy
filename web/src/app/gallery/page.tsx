import type { Metadata } from 'next';
import { Gallery } from '@/components/market/Gallery';

export const metadata: Metadata = { title: 'Completed builds · RigMY', description: 'PC builds people chose to publish, with live Malaysian prices.' };

export default function Page() {
  return <Gallery />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
