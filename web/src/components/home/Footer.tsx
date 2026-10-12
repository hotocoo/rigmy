'use client';

import { Eyebrow, Text } from '@/components/ui';
import { useData } from '@/lib/data';
import { dFmt } from '@/lib/format';
import { FOOTER_COLUMNS } from './config';
import { useNavLink } from './useNavLink';
import s from './home.module.css';

/** Home footer: brand, data provenance and the secondary site map. */
export function Footer() {
  const d = useData();
  const link = useNavLink();
  const ingest = d.lastIngest ? 'Prices last checked ' + dFmt(Date.parse(d.lastIngest), true) + '.' : 'No prices have been checked yet.';
  return (
    <footer className={s.footer}>
      <div className={s.footerAbout}>
        <Text v="brand" className={s.brand}>Rig<span>MY</span></Text>
        <p className={s.footerNote}>Prices and stock are read from retailer listings and can change at the shop. {ingest} Map data © OpenStreetMap contributors.</p>
      </div>
      <nav className={s.footerCols} aria-label="Footer">
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title} className={s.footerCol}>
            <Eyebrow>{col.title}</Eyebrow>
            {col.links.map(([route, label]) => <a key={route.path} {...link(route.path)} className={s.footerLink}>{label}</a>)}
          </div>
        ))}
      </nav>
    </footer>
  );
}
