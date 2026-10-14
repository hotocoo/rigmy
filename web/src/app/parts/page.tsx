import { PartsIndex } from '@/components/parts/PartsIndex';

/** /parts — forwards to the last-browsed category (or the first one). */
export default function Page() {
  return <PartsIndex />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
