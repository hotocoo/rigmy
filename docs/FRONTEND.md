# RigMY frontend standards

The web app (`web/`) is Next.js 16 + React 19 + TypeScript. These rules are mandatory: **no hardcoding, no low-quality shortcuts**.

## Sources of truth

| Concern | Lives in | Never |
|---|---|---|
| Colours, fonts, radius, shadows, easing, durations | `src/app/globals.css` (CSS variables) mirrored by `src/lib/tokens.ts` (`color`, `tone`, `tint()`, `font`, `type`, `shadow`, `ease`, `dur`, `themeColor`, `fontStylesheet`) | raw `#hex`, `rgba(...)`, named colours, font stacks, cubic-beziers or ms literals in components; snapping a prototype value to a "close" token (add the exact token instead) |
| Text styles | `type.*` in `src/lib/tokens.ts` (incl. every page/section title clamp), rendered with `<Text v="…">`. `style` on Text wins over the type; a module `className` on Text is for layout only | ad-hoc title `font:` shorthands; restyling Text's font from a module class |
| UI primitives | `src/components/ui` (`Button` + `LinkButton` with the full size/variant vocabulary, `IconButton`, `BackLink`, `Chip`, `Toggle`, `Segmented`, `Field` (sizes, `error` wiring), `Notice`, `Stepper`, `StepBar`, `Rows`/`KvRow`, `Panel`, `Text`/`Eyebrow`/`Meta`, `EmptyState`, `Tabs`, `Progress`, `Sparkline`, `Dot`, `Price`); shared domain widgets such as `components/location/LocationBar` | local copies of kit components; resizing or recolouring a kit component from a page stylesheet (parent-scoped selectors, `:is()` specificity bumps, `!important`) — pick or add the kit size/variant instead |
| Routes, nav, wipe labels, API paths | `src/lib/routes.ts` (`ROUTES`, `href.*`, `endpoint.*`) | string literals like `'/part/' + id` or `'/api/…'` |
| Shared helpers | `src/lib/format.ts` (`plural`, `hostOf`, `telHref`, `stockColor`, `openColor`, dates, `LOCALE`), `src/lib/location.ts` (`describeLoc`, `useLocDescription`, `directionsUrl`, postcode rules), `src/lib/content.ts` (`regionById`, `useRegion`), `src/lib/clock.ts` (`useNow`), `src/lib/chart.ts` (chart geometry), `src/lib/cx.ts` | per-folder copies of any of them |
| Domain & reference data (catalog, retailers, regions + centres, presets + `featured`, sale events, guide steps, cable runs, delivery windows, ETA table, couriers) | Rust config (`config/*.json|toml`) → `GET /api/bootstrap` → `useData()`; helpers in `src/lib/content.ts` | TS copies of any of it; matching presets by name |
| Business logic (compatibility, power, plan, offers, ETA ranking, geo, open hours) | Rust (`crates/rigmy-core`) via WASM `useData().engine` | re-deriving it in TS |
| Presentation choreography (home story chapters, studio mood colours) | `src/lib/choreography.ts` | inline magic arrays |
| User state | `src/lib/store.ts` (`useRig`) | localStorage access in components |

## Real data only
Prices, stock, history, stores and orders come from the API. When data is missing, show an honest empty state (`EmptyState`, `Price` with `empty`), never a fabricated number. Counts in copy ("6 shops") are computed from data.

## Quality bar
- Strict TS, no `any`, no unused code, `npm run lint` and `npx tsc --noEmit` clean, `next build` passes.
- Accessibility: semantic elements, `aria-pressed` / `aria-current` / labels on icon buttons, focus-visible outlines (the kit provides them), keyboard reachable, `prefers-reduced-motion` respected.
- Responsive from 360 px up; no horizontal page scroll; layouts use CSS modules + media queries (not JS width checks) where possible.
- Motion uses the shared reveal attributes (`data-rv`, `data-draw`, `data-grow`, `data-count`) and token easings.
- Component files stay focused (< ~250 lines); extract subcomponents instead of growing monoliths.
- Styling: CSS modules per component for layout, hover, focus and media queries; inline `style` only for genuinely dynamic values (computed widths, per-item tone colours). Visually hidden text uses the global `.sr-only` class.
- Intentional literals: `lib/choreography.ts` `MOOD` (hex fed to WebGL), Leaflet control overrides in `StoreMap.module.css` (`!important` is required to beat Leaflet's own stylesheet).
