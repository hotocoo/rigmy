# rigmy-wasm

Browser build of `rigmy-core` for the Next.js app. Run `../../scripts/build-wasm.sh` to generate
`web/src/wasm/`.

```ts
import init, { Engine } from '@/wasm/rigmy_wasm';

await init({ module_or_path: new URL('../wasm/rigmy_wasm_bg.wasm', import.meta.url) }); // once, client side
const engine = new Engine(JSON.stringify(bootstrap));    // bootstrap = GET /api/bootstrap
const plan = engine.plan(build, 'kv', picks);            // typed via web/src/lib/types.ts
```

Every method returns plain JS objects that match `web/src/lib/types.ts`. See `docs/BACKEND.md`
for the full method table.
