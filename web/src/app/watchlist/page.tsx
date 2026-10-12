import type { Metadata } from 'next';
import { Watchlist } from '@/components/market/Watchlist';

export const metadata: Metadata = { title: 'Watchlist · RigMY', description: 'Your price targets and how far each part is from them.' };

export default function Page() {
  return <Watchlist />;
}
