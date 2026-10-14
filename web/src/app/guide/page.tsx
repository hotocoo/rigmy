import { GuidePage } from '@/components/build/GuidePage';

export default function Page() {
  return <GuidePage />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
