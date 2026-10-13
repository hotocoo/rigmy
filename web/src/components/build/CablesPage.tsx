'use client';

import { useGo } from '@/components/shell/useGo';
import { BackLink, Button, Chip, Dot, Eyebrow, Text } from '@/components/ui';
import { cableRunsFor } from '@/lib/content';
import { cx } from '@/lib/cx';
import { useData } from '@/lib/data';
import { LOCALE } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { useRig, type RigState } from '@/lib/store';
import { color } from '@/lib/tokens';
import { PAL } from '@/studio/palette';
import type { ViewName } from '@/studio/types';
import { PresetNotice } from './Notices';
import { cableNote, presence } from './shared';
import { StageCaption, StudioStage, ViewSwitch } from './StudioStage';
import { useStudioHost } from './useStudioHost';
import c from './cables.module.css';
import l from './layout.module.css';

type Cables = RigState['cables'];

/** Routing modes the studio can draw. */
const ROUTING: { id: Cables['route']; label: string; note: string }[] = [
  { id: 'tidy', label: 'Managed', note: 'Behind the tray, through grommets, combed.' },
  { id: 'stock', label: 'As shipped', note: 'Straight from the PSU with no routing.' },
];
/** Sleeve looks. Only the stock cables come with the PSU; RigMY does not sell sleeved kits, so no price is shown. */
const SLEEVES: { id: Cables['sleeve']; label: string; note: string }[] = [
  { id: 'black', label: 'PSU stock cables', note: 'Included' },
  { id: 'white', label: 'White sleeved', note: 'Preview' },
  { id: 'blue', label: 'Blue sleeved', note: 'Preview' },
];
const CABLE_VIEWS = [['side', 'Side'], ['hero', 'Hero'], ['front', 'Front']] as const satisfies readonly (readonly [ViewName, string])[];
/** Swatch colour of each sleeve look: the studio's own sleeve material, so the swatch matches the 3D preview. */
const SLEEVE_MATERIAL = { black: PAL.sleeve, white: PAL.white_sleeve, blue: PAL.blue_sleeve } as const satisfies Record<Cables['sleeve'], { color: number }>;
const sleeveSwatch = (id: Cables['sleeve']) => '#' + SLEEVE_MATERIAL[id].color.toString(16).padStart(6, '0');

export function CablesPage() {
  const d = useData();
  const go = useGo();
  const build = useRig((x) => x.build), cables = useRig((x) => x.cables), cableHl = useRig((x) => x.cableHl), set = useRig((x) => x.set);
  const host = useStudioHost('cables');
  const tidy = cables.route === 'tidy';
  const runs = cableRunsFor(d, presence(d, build));
  const setC = (o: Partial<Cables>) => set((x) => ({ cables: { ...x.cables, ...o } }));

  return (
    <div className={l.split}>
      <section className={cx(l.side, l.sideNarrow, c.side)} aria-labelledby="cables-title">
        <div className={c.group}>
          <BackLink onClick={() => go(ROUTES.build.path)}>Back to build</BackLink>
          <Text v="pageTitle" as="h1" id="cables-title">Cable management</Text>
          <p className={l.lead}>Preview how each run is routed and try sleeved looks before you buy. The glass and front fans are faded so the cables are easy to see.</p>
        </div>

        {!build.mobo && <PresetNotice message="Add a motherboard to see cable runs." />}

        <div className={c.group} role="group" aria-label="Routing">
          <Eyebrow>Routing</Eyebrow>
          <div className={c.routes}>
            {ROUTING.map((r) => (
              <Chip key={r.id} size="block" on={cables.route === r.id} onClick={() => setC({ route: r.id })}>
                <span className={c.optTitle}>{r.label}</span><span className={c.optNote}>{r.note}</span>
              </Chip>
            ))}
          </div>
        </div>

        <div className={c.group} role="group" aria-label="Sleeving">
          <Eyebrow>Sleeving</Eyebrow>
          <div className={c.sleeves}>
            {SLEEVES.map((sl) => (
              <Chip key={sl.id} size="blockRow" className={c.sleeve} on={cables.sleeve === sl.id} onClick={() => setC({ sleeve: sl.id })}>
                <span className={c.swatch} style={{ background: sleeveSwatch(sl.id) }} aria-hidden />
                <span className={c.sleeveName}>{sl.label}</span>
                <Text v="dataSm" c={color.fg3}>{sl.note}</Text>
              </Chip>
            ))}
          </div>
          {cables.sleeve !== 'black' && (
            <div className={c.preview}><Dot c={color.blue} glowPx={0} />Look preview only · sleeved extension kits are bought separately</div>
          )}
        </div>

        {!!build.mobo && (
          <div className={c.group}>
            <Eyebrow>Runs in your build · tap to highlight</Eyebrow>
            <ul className={c.runs} aria-label="Cable runs in your build">
              {runs.map((r) => {
                const on = cableHl === r.id;
                return (
                  <li key={r.id}>
                    <button type="button" aria-pressed={on} className={cx(c.run, on && c.runOn)} onClick={() => set((x) => ({ cableHl: x.cableHl === r.id ? null : r.id }))}>
                      <span className={c.runHead}><span className={c.runName}>{r.name}</span><span className={c.runState}>{on ? 'Highlighted' : 'Show'}</span></span>
                      <Text v="metaTight">{r.conn + ' · ' + r.lengthMm.toLocaleString(LOCALE) + ' mm'}</Text>
                      <span className={c.runText}>{tidy ? r.tidy : r.stock}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Button size="tall" onClick={() => go(ROUTES.review.path)}>Continue to review</Button>
      </section>

      <StudioStage host={host} label="3D cable view">
        <StageCaption>Cable view</StageCaption>
        <div className={l.tools}>
          <Button variant="glass" size="tool" onClick={() => host.post({ rig: 'select', part: 'cables', note: cableNote(cables.route) })}>Focus</Button>
          <ViewSwitch views={CABLE_VIEWS} onView={(name) => host.post({ rig: 'view', name })} />
        </div>
      </StudioStage>
    </div>
  );
}
