'use client';

/**
 * SaveShare — "Save & share" button + popover for the builder toolbar.
 *
 * POSTs { name, build, region } to endpoint.builds (the API answers with the SavedBuild, at least { id }),
 * then shows the share URL (`href.shared(id)` on this origin) with a Copy button and an Open link.
 *
 * Props (all optional):
 *   build       Build       Build to save. Default: the current build from useRig.
 *   region      RegionId    Price region stored with it. Default: useRig region.
 *   defaultName string      Pre-filled name. Default: "My build · <date>".
 *   label       string      Button text. Default: 'Save & share'.
 *   variant     ButtonVariant  Kit button look. Default: 'ghost' (use 'mini' for a compact toolbar).
 *   className   string      Extra class for the button.
 *   style       CSSProperties  Extra style for the button.
 *   align       'left' | 'right'  Which edge of the button the popover lines up with. Default: 'right'.
 *   onSaved     (sb: SavedBuild, url: string) => void   Called after a successful save.
 *
 * The button is disabled while the build is empty. Opening focuses the name field and a successful save focuses (and
 * selects) the share link. Escape or a click outside closes the popover and returns focus to the button.
 */

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { toast } from '@/components/shell/motion';
import { Button, Eyebrow, Field, IconButton, LinkButton, Notice, type ButtonVariant } from '@/components/ui';
import { api } from '@/lib/data';
import { dFmt } from '@/lib/format';
import { endpoint, href } from '@/lib/routes';
import { useRig } from '@/lib/store';
import { color } from '@/lib/tokens';
import type { Build, RegionId, SavedBuild } from '@/lib/types';
import { cx } from '@/lib/cx';
import s from './saveShare.module.css';

/** Longest build name the API stores. */
const NAME_MAX = 80;

export interface SaveShareProps {
  build?: Build;
  region?: RegionId;
  defaultName?: string;
  label?: string;
  variant?: ButtonVariant;
  className?: string;
  style?: CSSProperties;
  align?: 'left' | 'right';
  onSaved?: (sb: SavedBuild, url: string) => void;
}

type Phase = { k: 'edit' } | { k: 'saving' } | { k: 'done'; url: string } | { k: 'error'; msg: string };

export function SaveShare({ build: b0, region: r0, defaultName, label = 'Save & share', variant = 'ghost', className, style, align = 'right', onSaved }: SaveShareProps) {
  const storeBuild = useRig((x) => x.build), storeRegion = useRig((x) => x.region);
  const build = b0 || storeBuild, region = r0 || storeRegion;
  const count = Object.values(build).filter(Boolean).length;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [ph, setPh] = useState<Phase>({ k: 'edit' });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popId = useId(), urlId = useId();
  const done = ph.k === 'done';

  const close = () => { setOpen(false); btnRef.current?.focus(); };

  // Escape closes from anywhere while open.
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  const toggle = () => {
    if (open) { close(); return; }
    setName(defaultName || 'My build · ' + dFmt(Date.now()));
    setPh({ k: 'edit' });
    setOpen(true);
  };

  const save = async () => {
    setPh({ k: 'saving' });
    try {
      const sb = await api<SavedBuild>(endpoint.builds, { method: 'POST', json: { name: name.trim() || 'Untitled build', build, region } });
      const url = window.location.origin + href.shared(sb.id);
      setPh({ k: 'done', url });
      onSaved?.(sb, url);
    } catch (e) {
      setPh({ k: 'error', msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const copy = (url: string) => {
    const manual = () => { (document.getElementById(urlId) as HTMLInputElement | null)?.select(); toast('Select the link and copy it'); };
    if (!navigator.clipboard) { manual(); return; }
    navigator.clipboard.writeText(url).then(() => toast('Share link copied'), manual);
  };

  return (
    <div className={s.wrap}>
      <Button ref={btnRef} variant={variant} onClick={toggle} disabled={!count} title={count ? undefined : 'Add parts to save a build'}
        aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? popId : undefined} className={className} style={style}>{label}</Button>
      {open && (
        <>
          <div onClick={close} className={s.scrim} aria-hidden />
          <div id={popId} data-rv="s" role="dialog" aria-label="Save and share this build" className={cx(s.pop, s[align])}>
            <div className={s.head}>
              <Eyebrow c={color.blueSoft}>{done ? 'Build saved' : 'Save & share'}</Eyebrow>
              <IconButton label="Close" onClick={close} />
            </div>
            {!done ? (
              <>
                <span className={s.text}>{'Saves these ' + count + ' parts and gives you a link anyone can open. Prices on the link stay live.'}</span>
                <Field autoFocus label="Name" value={name} maxLength={NAME_MAX} onValue={setName}
                  onKeyDown={(e) => { if (e.key === 'Enter' && ph.k !== 'saving') void save(); }} />
                {ph.k === 'error' && <Notice tone="warn" bare role="alert">{'Could not save: ' + ph.msg}</Notice>}
                <Button onClick={() => void save()} disabled={ph.k === 'saving'}>{ph.k === 'saving' ? 'Saving…' : 'Save and get link'}</Button>
              </>
            ) : (
              <>
                <span className={s.text}>Anyone with this link sees the parts, compatibility and today&apos;s lowest prices, and can open it in their own builder.</span>
                <div className={s.urlRow}>
                  <Field id={urlId} containerClassName={s.url} autoFocus mono readOnly value={ph.url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="ghost" onClick={() => copy(ph.url)}>Copy</Button>
                </div>
                <LinkButton variant="link" href={ph.url} external>Open the shared page</LinkButton>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
