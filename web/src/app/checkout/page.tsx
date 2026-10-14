import type { Metadata } from 'next';
import { CheckoutView } from '@/components/commerce/CheckoutView';

export const metadata: Metadata = { title: 'Checkout · RigMY' };

export default function CheckoutPage() {
  return <CheckoutView />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
