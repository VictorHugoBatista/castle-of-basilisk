//! Helpers do grid: índices, tiles, portas, opacidade, caminhabilidade,
//! linha de visão e a fila de eventos de áudio (produtor Rust).

use crate::*;

// ================= helpers =================

#[inline]
pub(crate) fn idx(x: usize, y: usize) -> usize { y * W() + x }

#[inline]
pub(crate) fn tile_at(x: usize, y: usize) -> u8 {
    if x >= W() || y >= H() { T_WALL } else { unsafe { MAP[idx(x, y)] } }
}

#[inline]
pub(crate) fn door_open(depth: usize, i: usize) -> bool {
    let d = (depth - 1) * N_MAX + i;
    unsafe { (DOORS[d / 64] >> (d % 64)) & 1 == 1 }
}
#[inline]
pub(crate) fn set_door(depth: usize, i: usize) {
    let d = (depth - 1) * N_MAX + i;
    unsafe { DOORS[d / 64] |= 1u64 << (d % 64); }
}

pub(crate) fn opaque(x: i32, y: i32) -> bool {
    if x < 0 || y < 0 || x >= W() as i32 || y >= H() as i32 { return true; }
    let t = tile_at(x as usize, y as usize);
    if t == T_WALL || t == T_PILLAR { return true; }
    if t == T_DOOR { return !unsafe { door_open(DEPTH as usize, idx(x as usize, y as usize)) }; }
    false
}

pub(crate) fn walkable(x: i32, y: i32) -> bool {
    if x < 0 || y < 0 || x >= W() as i32 || y >= H() as i32 { return false; }
    let t = tile_at(x as usize, y as usize);
    // grades de cela e funduras de esgoto: como parede para os pés, como ar para a vista
    t != T_WALL && t != T_PILLAR && t != T_BARS && t != T_DEEP
}

// caminhável PARA ELA: escombros entram na rota só quando há prova fresca
// (ela te viu ENTRAR ali, ou o barulho foi alto o bastante para denunciar).
// Na patrulha ela evita: conhece o castelo, sabe que beco sem saída não tem fuga.
pub(crate) fn bas_walkable(x: i32, y: i32) -> bool {
    unsafe {
        if x < 0 || y < 0 || x >= W() as i32 || y >= H() as i32 { return false; }
        if tile_at(x as usize, y as usize) == T_RUBBLE {
            BST == B_HUNT && RH > 0
        } else {
            walkable(x, y)
        }
    }
}

// ================= linha de visão =================

pub(crate) fn los(x0: usize, y0: usize, x1: usize, y1: usize) -> bool {
    let (mut x, mut y) = (x0 as i32, y0 as i32);
    let (tx, ty) = (x1 as i32, y1 as i32);
    let dx = (tx - x).abs();
    let dy = (ty - y).abs();
    let sx: i32 = if tx >= x { 1 } else { -1 };
    let sy: i32 = if ty >= y { 1 } else { -1 };
    let mut err = dx - dy;
    let mut guard = 0i32;
    loop {
        guard += 1;
        if guard > 128 { return false; }
        if x == tx && y == ty { return true; }
        let e2 = 2 * err;
        if e2 > -dy { err -= dy; x += sx; }
        if e2 < dx { err += dx; y += sy; }
        if x == tx && y == ty { return true; }
        if opaque(x, y) { return false; }
    }
}

// ================= áudio: fila de eventos =================

pub(crate) fn push_event(ev: u32) {
    unsafe {
        let next = (AUD_T + 1) % 16;
        if next != AUD_H {
            AUD[AUD_T] = ev;
            AUD_T = next;
        }
    }
}
