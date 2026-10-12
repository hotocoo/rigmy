import type { Metadata } from 'next';
import { PricesView } from '@/components/commerce/PricesView';

export const metadata: Metadata = { title: 'Prices · RigMY' };

export default function PricesPage() {
  return <PricesView />;
}
