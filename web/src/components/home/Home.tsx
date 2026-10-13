'use client';

import { useState } from 'react';
import { dFull } from '@/lib/format';
import { Footer } from './Footer';
import { Movers } from './Movers';
import { NearStores } from './NearStores';
import { Presets } from './Presets';
import { Story } from './Story';
import { Ticker } from './Ticker';
import s from './home.module.css';

/** RigMY home: scroll story, live ticker, price movers, nearby stores, presets, footer. */
export function Home() {
  const [today] = useState(() => dFull(Date.now()));
  return (
    <div className={s.home}>
      <Story />
      <Ticker />
      <Movers today={today} />
      <NearStores />
      <Presets />
      <Footer />
    </div>
  );
}
