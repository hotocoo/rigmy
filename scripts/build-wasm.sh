#!/usr/bin/env bash
# Build rigmy-core's WASM engine for the Next.js app into web/src/wasm/.
# Requires: rustup target wasm32-unknown-unknown, and wasm-bindgen-cli at the exact version of the
# wasm-bindgen crate in Cargo.lock (the script prints the install command if it is missing).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/web/src/wasm"
cd "$ROOT"

WB_VERSION="$(awk '/^name = "wasm-bindgen"$/{getline; gsub(/version = |"/, ""); print; exit}' Cargo.lock)"
if ! command -v wasm-bindgen >/dev/null 2>&1 || [ "$(wasm-bindgen --version | awk '{print $2}')" != "$WB_VERSION" ]; then
  echo "wasm-bindgen-cli $WB_VERSION is required:" >&2
  echo "  cargo install wasm-bindgen-cli --version $WB_VERSION --locked" >&2
  exit 1
fi

rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
cargo build -p rigmy-wasm --target wasm32-unknown-unknown --profile wasm --locked

rm -rf "$OUT"
mkdir -p "$OUT"
wasm-bindgen \
  --target web \
  --out-dir "$OUT" \
  --out-name rigmy_wasm \
  "$ROOT/target/wasm32-unknown-unknown/wasm/rigmy_wasm.wasm"

# wasm-bindgen drops `?` when a parameter has an explicit TS type; restore the optional ones.
sed -i.bak \
  -e 's/compat(build: Build, region: RegionId)/compat(build: Build, region?: RegionId)/' \
  -e 's/picks: Record<string, string>)/picks?: Record<string, string>)/' \
  "$OUT/rigmy_wasm.d.ts"
rm -f "$OUT/rigmy_wasm.d.ts.bak"
grep -q 'region?: RegionId' "$OUT/rigmy_wasm.d.ts" && grep -q 'picks?: Record' "$OUT/rigmy_wasm.d.ts" \
  || { echo "d.ts post-processing failed" >&2; exit 1; }

# Generated code: keep it out of the web app's ESLint run (the .d.ts files lint clean as-is).
sed -i.bak '1a /* eslint-disable */' "$OUT/rigmy_wasm.js"
sed -i.bak '/^\/\* eslint-disable \*\/$/d' "$OUT/rigmy_wasm.d.ts" "$OUT/rigmy_wasm_bg.wasm.d.ts"
rm -f "$OUT"/*.bak

if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -Os --enable-bulk-memory --enable-nontrapping-float-to-int \
    "$OUT/rigmy_wasm_bg.wasm" -o "$OUT/rigmy_wasm_bg.wasm"
else
  echo "wasm-opt not found; skipping size optimisation" >&2
fi

ls -l "$OUT"
