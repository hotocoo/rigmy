import { Suspense } from 'react';
import { PartPage } from '@/components/parts/PartPage';

/** /part/[id] — prices, stock, history and specs for one product. The id is read client-side with useParams(). */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PartPage />
    </Suspense>
  );
}
