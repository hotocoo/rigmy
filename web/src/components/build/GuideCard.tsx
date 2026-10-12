'use client';

import { Button, Eyebrow, Text } from '@/components/ui';
import type { GuideStep } from '@/lib/content';
import { color } from '@/lib/tokens';
import type { Product } from '@/lib/types';
import g from './guide.module.css';

export interface GuideCardProps {
  step: GuideStep;
  index: number;
  total: number;
  part: Product | null;
  onPart: (p: Product) => void;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}

/** The current assembly step, floating over the staged 3D build. */
export function GuideCard({ step, index, total, part, onPart, onBack, onNext, onFinish }: GuideCardProps) {
  const isLast = index === total - 1;
  return (
    <div className={g.cardWrap}>
      <article className={g.card} aria-live="polite" aria-labelledby="guide-step-title">
        <Eyebrow c={color.blueSoft} className={g.cardHead}>
          <span>{'Step ' + (index + 1) + ' of ' + total}</span><span className={g.cardMins}>{'About ' + step.minutes + ' minutes'}</span>
        </Eyebrow>
        <Text v="cardTitle" as="h2" id="guide-step-title">{step.title}</Text>
        {part && <button type="button" onClick={() => onPart(part)} className={g.partLink}>{part.name + ' →'}</button>}
        <p className={g.text}>{step.text}</p>
        <div className={g.nav}>
          <Button variant="ghost" size="mdSlim" onClick={onBack}>Back</Button>
          {isLast
            ? <Button size="mdSlim" wide onClick={onFinish}>Review build</Button>
            : <Button size="mdSlim" wide onClick={onNext}>Next step</Button>}
        </div>
      </article>
    </div>
  );
}
