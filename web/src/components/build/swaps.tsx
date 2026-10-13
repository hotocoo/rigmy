"use client";

import { useMemo } from "react";

import type { Data } from "@/lib/data";
import { useRig } from "@/lib/store";
import { fmt } from "@/lib/format";
import type { Build, RegionId } from "@/lib/types";

import { Eyebrow, Text } from "@/components/ui";
import s from "./swaps.module.css";

const MAX_OPTIONS = 4;

/**
 * "Swap or upgrade" suggestions under the parts list: for each filled slot, the other
 * catalogue parts that keep the build free of compatibility errors, with their lowest
 * regional price and the delta against the current part. Clicking one swaps it in.
 * Honest by construction: the engine only lists parts that really fit, and unpriced parts
 * say so instead of guessing.
 */
export function SwapList({ d, build, region }: { d: Data; build: Build; region: RegionId }) {
  const setPart = useRig((x) => x.setPart);
  const swaps = useMemo(() => d.engine.swaps(build, region), [d, build, region]);
  const shown = swaps.filter((x) => x.options.length > 0);
  if (shown.length === 0) return null;
  return (
    <div className={s.wrap} aria-label="Swap or upgrade suggestions">
      <Eyebrow>Swap or upgrade</Eyebrow>
      <ul className={s.list}>
        {shown.map((x) => {
          const cat = d.cat(x.cat);
          const cur = d.byId[x.current];
          const curPrice = d.engine.lowest(x.current, region)?.price ?? null;
          return (
            <li key={x.cat} className={s.slot}>
              <div className={s.slotHead}>
                <Text v="tagLoose">{cat.long}</Text>
                <Text v="label">{cur?.short || cur?.name}</Text>
              </div>
              <div className={s.opts}>
                {x.options.slice(0, MAX_OPTIONS).map((o) => {
                  const p = d.byId[o.id];
                  const delta = o.price != null && curPrice != null ? o.price - curPrice : null;
                  return (
                    <button key={o.id} type="button" className={s.opt} onClick={() => setPart(x.cat, o.id)}>
                      <span className={s.optName}>{p?.short || p?.name}</span>
                      <span className={s.optPrice}>{o.price != null ? fmt(o.price) : "No price yet"}</span>
                      {delta != null && delta !== 0 && (
                        <span className={delta > 0 ? s.up : s.down}>
                          {delta > 0 ? "+" : "−"}
                          {fmt(Math.abs(delta))}
                        </span>
                      )}
                    </button>
                  );
                })}
                {x.options.length > MAX_OPTIONS && (
                  <span className={s.more}>{x.options.length - MAX_OPTIONS} more in the parts list</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
