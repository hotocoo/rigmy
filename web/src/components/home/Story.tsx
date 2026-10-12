'use client';

import { Text } from '@/components/ui';
import { RAIL } from '@/lib/choreography';
import Studio from '@/studio/Studio';
import { IntroChapter, PartChapter, PartsChapter, PricesChapter, StartChapter } from './StoryChapters';
import { useStoryDriver } from './useStoryDriver';
import { useStoryModel } from './useStoryModel';
import s from './story.module.css';

/** The home hero: a sticky 3D studio with scroll-driven chapters, a chapter chip, big number and progress rail. */
export function Story() {
  const m = useStoryModel();
  const { studio, onReady, story, bigNum, fill, chipDot, chipTxt } = useStoryDriver(m.hb);
  return (
    <section ref={story} className={s.story} aria-label="Build it in 3D">
      <div className={s.stage}>
        <div className={s.studio}><Studio ref={studio} mode="hero" onReady={onReady} className={s.canvas} /></div>
        <div ref={bigNum} className={s.bigNum} aria-hidden />
        <div className={s.fade} />
        <Text v="kicker" as="div" className={s.chip} aria-hidden><span ref={chipDot} className={s.chipDot} /><span ref={chipTxt} /></Text>
        <div className={s.rail} aria-hidden>
          <div className={s.railLabels}>
            {RAIL.map((l, i) => <div key={l} data-rail={i} className={s.railLabel}>{l}</div>)}
          </div>
          <div className={s.railTrack}><div ref={fill} className={s.railFill} /></div>
        </div>

        <IntroChapter m={m} />
        <PartsChapter m={m} />
        {m.parts.map((p) => <PartChapter key={p.ch} part={p} />)}
        <PricesChapter m={m} />
        <StartChapter m={m} />
      </div>
    </section>
  );
}
