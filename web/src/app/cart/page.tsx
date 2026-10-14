import type { Metadata } from 'next';
import { CartView } from '@/components/commerce/CartView';

export const metadata: Metadata = { title: 'Cart · RigMY' };

export default function CartPage() {
  return <CartView />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
