import type { ReactNode } from 'react';
import { Eyebrow, Text } from '@/components/ui';
import { color } from '@/lib/tokens';
import s from './home.module.css';

/** Home section heading: blue eyebrow, large display h2 and an optional lead paragraph. */
export function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: ReactNode; title: ReactNode; lead?: ReactNode }) {
  return (
    <div className={s.sectionHead}>
      <Eyebrow c={color.blueSoft}>{eyebrow}</Eyebrow>
      <Text v="section" as="h2" id={id} className={s.balance}>{title}</Text>
      {lead && <Text v="body" as="p" className={s.sectionLead}>{lead}</Text>}
    </div>
  );
}
