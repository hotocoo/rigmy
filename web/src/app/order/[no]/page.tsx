import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderPlacedView } from '@/components/commerce/OrderPlacedView';

export const metadata: Metadata = { title: 'Order placed · RigMY' };

type Params = Promise<{ no: string }>;

export default function OrderPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Order params={params} />
    </Suspense>
  );
}

async function Order({ params }: { params: Params }) {
  const { no } = await params;
  return <OrderPlacedView no={safeDecode(no)} />;
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
