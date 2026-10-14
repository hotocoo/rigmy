import type { Metadata } from 'next';
import { Stores } from '@/components/market/Stores';

export const metadata: Metadata = { title: 'Stores · RigMY', description: 'PC shops near you with opening hours, directions and what they list for your build.' };

export default function Page() {
  return <Stores />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
