import type { Metadata } from 'next';
import { OrdersView } from '@/components/commerce/OrdersView';

export const metadata: Metadata = { title: 'Orders · RigMY' };

export default function OrdersPage() {
  return <OrdersView />;
}
