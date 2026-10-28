#!/usr/bin/env bash
# Compila o Castle of Basilisk para WASM.
# Contorna os proxies quebrados do rustup usando os binários diretos da toolchain.
set -e
TC="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin"
export PATH="$TC:$PATH"
export RUSTC="$TC/rustc"
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown
mkdir -p web/wasm
cp target/wasm32-unknown-unknown/release/castle_of_basilisk.wasm web/wasm/
echo "OK -> web/wasm/castle_of_basilisk.wasm"
