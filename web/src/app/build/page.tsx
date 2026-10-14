import { BuilderPage } from '@/components/build/BuilderPage';

export default function Page() {
  return <BuilderPage />;
}

/** Client-rendered after catalogue data loads (see app/layout.tsx). */
export const instant = false;
