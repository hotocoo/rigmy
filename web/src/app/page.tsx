import { Home } from '@/components/home/Home';

export default function Page() {
  return <Home />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
