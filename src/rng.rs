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
#[inline]
pub(crate) fn repick() {
    // garante RNG não-degenerado (evita ciclo zero)
    unsafe {
        if R32 == 0 { R32 = 0x9E3779B9; }
    }
}
