//! RNG: xorshift32, seed por andar (SEEDS[FLOORS], definida em pfb_new_game).

use crate::*;

// ================= rng =================

#[inline]
pub(crate) fn rnd() -> u32 {
    unsafe {
        let mut x = R32;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        R32 = x;
        x
    }
}
#[inline]
pub(crate) fn rndn(n: usize) -> usize {
    if n == 0 { 0 } else { (rnd() as usize) % n }
}

// stream PRÓPRIA do sibilo (mesmo xorshift32, seed em pfb_new_game): a
// cadência da fala dela NÃO desgasta o rng do mundo — nenhum sorteio do
// jogo muda por ela sibilar (o antigo Math.random() de browser em game.js
// era invisível ao gate; agora é seedável e testável)
#[inline]
pub(crate) fn rsib() -> u32 {
    unsafe {
        let mut x = R_SIB;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        R_SIB = x;
        x
    }
}
pub(crate) fn repick() {
    // garante RNG não-degenerado (evita ciclo zero)
    unsafe {
        if R32 == 0 { R32 = 0x9E3779B9; }
    }
}
