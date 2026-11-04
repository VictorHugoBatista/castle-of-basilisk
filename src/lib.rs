//! Castle of Basilisk — conceito de survival horror roguelike, compilado para WASM.
//! ABI crua: exports `#[no_mangle]`, JS lê a memória via ponteiros. Zero dependências.
//!
//! O jogo inteiro vive na memória linear do WASM e um jeito por domínio:
//! consts (balance tunável) · state (layout de memória documentado) · rng ·
//! grid (helpers/LOS/fila de áudio) · gen (geração) · basilisk (IA) ·
//! fear (medo/alucinações) · flow (tick do jogo) · ui (FOV/render) ·
//! exports (ABI pública). Regras de organização: ARCHITECTURE.md.

#![allow(static_mut_refs)]
#![allow(clippy::needless_range_loop)]

mod basilisk;
mod consts;
mod exports;
mod fear;
mod flow;
mod gen;
mod grid;
mod rng;
mod state;
mod ui;

pub(crate) use basilisk::*;
pub(crate) use consts::*;
pub(crate) use fear::*;
pub(crate) use flow::*;
pub(crate) use gen::*;
pub(crate) use grid::*;
pub(crate) use rng::*;
pub(crate) use state::*;
pub(crate) use ui::*;
