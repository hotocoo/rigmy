import { Suspense } from 'react';
import { BrowsePage } from '@/components/parts/BrowsePage';

// No generateStaticParams: categories are runtime data (config → /api/bootstrap), so the segment is read client-side
// with useParams() inside a Suspense boundary (Cache Components), and unknown ids redirect to a valid category.
/** /parts/[cat]: browse one category. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <BrowsePage />
    </Suspense>
  );
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
