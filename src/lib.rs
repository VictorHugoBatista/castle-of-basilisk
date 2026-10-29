//! Castle of Basilisk — conceito de survival horror roguelike, compilado para WASM.
//! ABI crua: exports `#[no_mangle]`, JS lê a memória via ponteiros. Zero dependências.

#![allow(static_mut_refs)]
#![allow(clippy::needless_range_loop)]

pub const W: usize = 56;
pub const H: usize = 32;
pub const N: usize = W * H;

// ---- tiles (bytes) ----
const T_WALL: u8 = b'#';
const T_FLOOR: u8 = b'.';
const T_SHADOW: u8 = b',';
const T_PILLAR: u8 = b'0';
const T_DOOR: u8 = b'+';
const T_DOWN: u8 = b'>';
const T_UP: u8 = b'<';
const T_CROWN: u8 = 0xA7; // '§' latin-1

// ---- atributos (índice da paleta em JS) ----
const A_FLOOR: u8 = 0;
const A_WALL: u8 = 1;
const A_SHADOW: u8 = 2;
const A_DOOR: u8 = 3;
const A_STAIR: u8 = 4;
const A_CROWN: u8 = 5;
const A_PLAYER: u8 = 6;
const A_BAS: u8 = 7;
const A_BODY: u8 = 11; // corpo do basilisco '~' — vermelho na paleta JS
const A_UI: u8 = 8;
const A_ALERT: u8 = 9;
const A_TITLE: u8 = 10;
const A_VOID: u8 = 15;
const DIM: u8 = 0x80; // lembrado (não visível agora): escurece em JS

// ---- eventos de áudio ----
pub const EV_STEP: u32 = 1;
pub const EV_DOOR: u32 = 2;
pub const EV_DOWN: u32 = 3;
pub const EV_UP: u32 = 4;
pub const EV_STINGER: u32 = 5; // ela te VIU
pub const EV_CROWN: u32 = 6;
pub const EV_DEATH: u32 = 7;
pub const EV_WIN: u32 = 8;
pub const EV_ALERT: u32 = 10; // ela ouviu algo
pub const EV_LOST: u32 = 11; // ela perdeu você
pub const EV_HISS: u32 = 12; // sibilância distante
pub const EV_DOOR_B: u32 = 13; // A BESTA abriu uma porta
pub const EV_BODY: u32 = 14; // escamas visíveis (à frente/centro)
pub const EV_BODY_L: u32 = 15; // escamas visíveis à esquerda
pub const EV_BODY_R: u32 = 16; // escamas visíveis à direita

// estados do jogo
pub const ST_TITLE: u8 = 0;
pub const ST_PLAY: u8 = 1;
pub const ST_DEAD: u8 = 2;
pub const ST_WIN: u8 = 3;

// estados da IA do basilisco
pub const B_PATROL: u8 = 0;
pub const B_INVEST: u8 = 1;
pub const B_HUNT: u8 = 2;

const GAZE_R: i32 = 4; // olhar mútuo a <= 4 tiles = morte
const SIGHT_OPEN: i32 = 8;
const SIGHT_SHADOW_MOVE: i32 = 4;
const SIGHT_SHADOW_STILL: i32 = 2;
const BODY_MAX: usize = 24; // comprimento do rastro: anéis de escamas

// ================= estado global =================

static mut GRID: [u8; N * 2] = [0; N * 2];
static mut STATS: [u8; 16] = [0; 16];
static mut AUD: [u32; 16] = [0; 16];
static mut AUD_H: usize = 0;
static mut AUD_T: usize = 0;

static mut STATE: u8 = ST_TITLE;
static mut DEATH_R: u8 = 0; // 1 = olhar, 2 = toque
static mut DEPTH: u8 = 1;
static mut CROWN: bool = false;
static mut TICK: i32 = 0;
static mut GRACE: i32 = 0;

static mut SEEDS: [u32; 3] = [0; 3];
static mut MAP: [u8; N] = [0; N];
static mut SEEN: [u8; N * 3] = [0; N * 3];
static mut VIS: [u8; N] = [0; N];
static mut DOORS: [u64; 96] = [0; 96];

static mut PX: usize = 0;
static mut PY: usize = 0;
static mut BX: usize = 0;
static mut BY: usize = 0;
static mut BST: u8 = B_PATROL;
static mut BTICK: i32 = 0;
static mut LX: usize = 0; // última posição conhecida do jogador
static mut LY: usize = 0;
static mut NX: usize = 0; // alvo de investigação (ruído)
static mut NY: usize = 0;
static mut LOITER: i32 = 0;
static mut MOVED: bool = false;
static mut LD: usize = 0; // última direção de patrulha
static mut CFREEZE: i32 = 0; // atordoamento do basilisco ao pegar a coroa

// rastro do corpo: [0] = comprimento; depois pares (x, y), o mais recente primeiro
static mut BODYBUF: [u8; BODY_MAX * 2 + 1] = [0; BODY_MAX * 2 + 1];
static mut EV_CD: i32 = 0; // cooldown do evento "corpo visível"

static mut DMAP: [u16; N] = [0; N];
static mut QUEUE: [u16; N] = [0; N];
static mut R32: u32 = 1;

static mut ROOMS: [i32; 48] = [0; 48]; // x0,y0,x1,y1 × 12
static mut RN: usize = 0;

// ================= rng =================

#[inline]
fn rnd() -> u32 {
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
fn rndn(n: usize) -> usize {
    if n == 0 { 0 } else { (rnd() as usize) % n }
}
#[inline]
fn repick() {
    // garante RNG não-degenerado (evita ciclo zero)
    unsafe {
        if R32 == 0 { R32 = 0x9E3779B9; }
    }
}

// ================= helpers =================

#[inline]
fn idx(x: usize, y: usize) -> usize { y * W + x }

#[inline]
fn tile_at(x: usize, y: usize) -> u8 {
    if x >= W || y >= H { T_WALL } else { unsafe { MAP[idx(x, y)] } }
}

#[inline]
fn door_open(depth: usize, i: usize) -> bool {
    let d = (depth - 1) * N + i;
    unsafe { (DOORS[d / 64] >> (d % 64)) & 1 == 1 }
}
#[inline]
fn set_door(depth: usize, i: usize) {
    let d = (depth - 1) * N + i;
    unsafe { DOORS[d / 64] |= 1u64 << (d % 64); }
}

fn opaque(x: i32, y: i32) -> bool {
    if x < 0 || y < 0 || x >= W as i32 || y >= H as i32 { return true; }
    let t = tile_at(x as usize, y as usize);
    if t == T_WALL || t == T_PILLAR { return true; }
    if t == T_DOOR { return !unsafe { door_open(DEPTH as usize, idx(x as usize, y as usize)) }; }
    false
}

fn walkable(x: i32, y: i32) -> bool {
    if x < 0 || y < 0 || x >= W as i32 || y >= H as i32 { return false; }
    let t = tile_at(x as usize, y as usize);
    t != T_WALL && t != T_PILLAR
}

// ================= linha de visão =================

fn los(x0: usize, y0: usize, x1: usize, y1: usize) -> bool {
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

fn push_event(ev: u32) {
    unsafe {
        let next = (AUD_T + 1) % 16;
        if next != AUD_H {
            AUD[AUD_T] = ev;
            AUD_T = next;
        }
    }
}

#[no_mangle]
pub extern "C" fn pfb_pop_event() -> u32 {
    unsafe {
        if AUD_H != AUD_T {
            let e = AUD[AUD_H];
            AUD_H = (AUD_H + 1) % 16;
            e
        } else {
            0
        }
    }
}

// ================= geração procedural =================

fn set_room(r: usize, x0: i32, y0: i32, x1: i32, y1: i32) {
    unsafe {
        ROOMS[r * 4] = x0;
        ROOMS[r * 4 + 1] = y0;
        ROOMS[r * 4 + 2] = x1;
        ROOMS[r * 4 + 3] = y1;
    }
}
#[inline]
fn rget(r: usize, k: usize) -> i32 { unsafe { ROOMS[r * 4 + k] } }

fn carve_h(y: i32, x0: i32, x1: i32) {
    let (a, b) = if x0 <= x1 { (x0, x1) } else { (x1, x0) };
    for x in a..=b {
        if x > 0 && x < W as i32 - 1 && y > 0 && y < H as i32 - 1 {
            let i = idx(x as usize, y as usize);
            unsafe {
                if MAP[i] == T_WALL { MAP[i] = T_FLOOR; }
            }
        }
    }
}
fn carve_v(x: i32, y0: i32, y1: i32) {
    let (a, b) = if y0 <= y1 { (y0, y1) } else { (y1, y0) };
    for y in a..=b {
        if x > 0 && x < W as i32 - 1 && y > 0 && y < H as i32 - 1 {
            let i = idx(x as usize, y as usize);
            unsafe {
                if MAP[i] == T_WALL { MAP[i] = T_FLOOR; }
            }
        }
    }
}

fn rcenter(r: usize) -> (i32, i32) {
    ((rget(r, 0) + rget(r, 2)) / 2, (rget(r, 1) + rget(r, 3)) / 2)
}

// valida: partindo de '<', todas as salas e o objetivo ('>' ou '§') são alcançáveis
fn connectivity_ok(depth: u8) -> bool {
    unsafe {
        let mut up: usize = usize::MAX;
        for i in 0..N {
            if MAP[i] == T_UP { up = i; break; }
        }
        if up == usize::MAX { return false; }
        let (ux, uy) = (up % W, up / W);
        bfs(ux, uy); // trata portas fechadas como abertas (abíveis)
        let need: u8 = if depth < 3 { T_DOWN } else { T_CROWN };
        for i in 0..N {
            if MAP[i] == need && DMAP[i] == 0xFFFF { return false; }
        }
        let rn = RN;
        for r in 0..rn {
            let (cx, cy) = rcenter(r);
            if DMAP[idx(cx as usize, cy as usize)] == 0xFFFF { return false; }
        }
        true
    }
}

fn gen_floor(depth: u8, seed: u32) {
    // regenera até o andar ser um grafo conectado (pilares podem selar corredores)
    let mut s = seed | 1;
    for _ in 0..10 {
        gen_once(depth, s);
        if connectivity_ok(depth) { return; }
        s = s.wrapping_mul(1664525).wrapping_add(1013904223) | 1;
    }
}

fn gen_once(depth: u8, seed: u32) {
    unsafe {
        MAP = [T_WALL; N];
        RN = 0;
        repick();
        R32 = seed;
    }

    // ---- salas ----
    for _ in 0..240 {
        if unsafe { RN } >= 12 { break; }
        let w = (rndn(6) + 5) as i32;  // 5..10
        let h = (rndn(4) + 4) as i32;  // 4..7
        let x0 = (rndn(W - w as usize - 2) + 1) as i32;
        let y0 = (rndn(H - h as usize - 2) + 1) as i32;
        let x1 = x0 + w - 1;
        let y1 = y0 + h - 1;
        let mut ok = true;
        let n = unsafe { RN };
        for r in 0..n {
            if x0 <= rget(r, 2) + 1 && x1 + 1 >= rget(r, 0) &&
               y0 <= rget(r, 3) + 1 && y1 + 1 >= rget(r, 1) { ok = false; break; }
        }
        if !ok { continue; }
        for y in y0..=y1 {
            for x in x0..=x1 {
                unsafe { MAP[idx(x as usize, y as usize)] = T_FLOOR; }
            }
        }
        set_room(n, x0, y0, x1, y1);
        unsafe { RN += 1; }
    }

    let mut rn = unsafe { RN };
    if rn < 2 {
        // fallback: sala única gigante
        unsafe {
            MAP = [T_WALL; N];
            for y in 6..26 { for x in 8..48 { MAP[idx(x, y)] = T_FLOOR; } }
            set_room(0, 8, 6, 47, 25);
            set_room(1, 14, 10, 41, 21);
            RN = 2;
        }
        rn = 2;
    }

    // ---- corredores: liga cada sala não-conectada à mais próxima conectada ----
    let mut linked: [bool; 12] = [false; 12];
    linked[0] = true;
    loop {
        let mut best: (i32, usize, usize) = (i32::MAX, 0, 0);
        for a in 0..rn {
            if linked[a] { continue; }
            for b in 0..rn {
                if !linked[b] { continue; }
                let (ax, ay) = rcenter(a);
                let (bx, by) = rcenter(b);
                let c = (ax - bx).abs() + (ay - by).abs();
                if c < best.0 { best = (c, a, b); }
            }
        }
        if best.0 == i32::MAX { break; }
        let (ax, ay) = rcenter(best.1);
        let (bx, by) = rcenter(best.2);
        if rnd() & 1 == 1 {
            carve_h(ay, ax, bx);
            carve_v(bx, ay, by);
        } else {
            carve_v(ax, ay, by);
            carve_h(by, ax, bx);
        }
        linked[best.1] = true;
    }

    // ---- corredores extras (loops de fuga) ----
    for _ in 0..2 {
        let a = rndn(rn);
        let b = rndn(rn);
        if a == b { continue; }
        let (ax, ay) = rcenter(a);
        let (bx, by) = rcenter(b);
        if rnd() & 1 == 1 {
            carve_h(ay, ax, bx);
            carve_v(bx, ay, by);
        } else {
            carve_v(ax, ay, by);
            carve_h(by, ax, bx);
        }
    }

    // ---- portas nos gargalos de corredor ----
    for y in 1..H - 1 {
        for x in 1..W - 1 {
            let i = idx(x, y);
            if tile_at(x, y) != T_FLOOR { continue; }
            let u = tile_at(x, y - 1);
            let d = tile_at(x, y + 1);
            let l = tile_at(x - 1, y);
            let r = tile_at(x + 1, y);
            let pinch_v = u == T_WALL && d == T_WALL && l != T_WALL && r != T_WALL;
            let pinch_h = l == T_WALL && r == T_WALL && u != T_WALL && d != T_WALL;
            if (pinch_v || pinch_h) && rnd() % 5 < 4 {
                unsafe { MAP[i] = T_DOOR; }
            }
        }
    }

    // ---- pilares nas salas grandes ----
    for r in 0..rn {
        let (x0, y0, x1, y1) = (rget(r, 0), rget(r, 1), rget(r, 2), rget(r, 3));
        if x1 - x0 >= 6 && y1 - y0 >= 4 {
            for p in [(x0 + 2, y0 + 2), (x1 - 2, y0 + 2), (x0 + 2, y1 - 2), (x1 - 2, y1 - 2)] {
                unsafe {
                    let i = idx(p.0 as usize, p.1 as usize);
                    if MAP[i] == T_FLOOR { MAP[i] = T_PILLAR; }
                }
            }
        }
    }

    // ---- poças de sombra ----
    for _ in 0..55 {
        let x = 1 + rndn(W - 2);
        let y = 1 + rndn(H - 2);
        unsafe {
            let i = idx(x, y);
            if MAP[i] == T_FLOOR { MAP[i] = T_SHADOW; }
        }
    }

    // ---- entrada '<' na sala 0 ----
    let (ex, ey) = rcenter(0);
    unsafe { MAP[idx(ex as usize, ey as usize)] = T_UP; }

    // ---- saída '>' (andares 1-2) ou coroa '§' com altar (andar 3) ----
    let lr = rn - 1;
    let (dx, dy) = rcenter(lr);
    if depth < 3 {
        set_room_t(dx, dy, T_DOWN);
    } else {
        set_room_t(dx, dy, T_CROWN);
        for off in [(-2, 0i32), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2), (-2, 2), (2, -2)] {
            let tx = dx + off.0;
            let ty = dy + off.1;
            if tx > 0 && tx < W as i32 - 1 && ty > 0 && ty < H as i32 - 1 {
                unsafe {
                    let i = idx(tx as usize, ty as usize);
                    if MAP[i] == T_FLOOR { MAP[i] = T_PILLAR; }
                }
            }
        }
    }
}

fn set_room_t(x: i32, y: i32, t: u8) {
    unsafe { MAP[idx(x as usize, y as usize)] = t; }
}

// ================= BFS (caça) =================

fn bfs(tx: usize, ty: usize) {
    unsafe {
        DMAP = [0xFFFF_u16; N];
        if !walkable(tx as i32, ty as i32) { return; }
        let start = idx(tx, ty);
        let mut qh = 0usize;
        let mut qt = 1usize;
        DMAP[start] = 0;
        QUEUE[0] = start as u16;
        while qh < qt {
            let c = QUEUE[qh] as usize;
            qh += 1;
            let d = DMAP[c] + 1;
            let cx = c % W;
            let cy = c / W;
            for (nx, ny) in [(cx + 1, cy), (cx.wrapping_sub(1), cy), (cx, cy + 1), (cx, cy.wrapping_sub(1))] {
                if nx >= W || ny >= H { continue; }
                let ni = idx(nx, ny);
                if DMAP[ni] <= d { continue; }
                if !walkable(nx as i32, ny as i32) { continue; }
                DMAP[ni] = d;
                if qt < N { QUEUE[qt] = ni as u16; qt += 1; }
            }
        }
    }
}

// ================= basilisco =================

// grava a posição que a cabeça ACABOU de deixar: o corpo avança com ela
fn body_push(x: u8, y: u8) {
    unsafe {
        let n = if BODYBUF[0] < BODY_MAX as u8 { BODYBUF[0] + 1 } else { BODY_MAX as u8 };
        for k in (1..n as usize).rev() {
            BODYBUF[k * 2 + 1] = BODYBUF[(k - 1) * 2 + 1];
            BODYBUF[k * 2 + 2] = BODYBUF[(k - 1) * 2 + 2];
        }
        BODYBUF[1] = x;
        BODYBUF[2] = y;
        BODYBUF[0] = n;
    }
}

// depois do FOV: conta segmentos visíveis, dispara o vislumbre e publica em STATS[9]
fn body_pass() {
    unsafe {
        let len = BODYBUF[0] as usize;
        let mut vis: u8 = 0;
        let mut best: (i32, i32, i32) = (i32::MAX, 0, 0); // dist, x, y
        for k in 0..len {
            let sx = BODYBUF[k * 2 + 1] as usize;
            let sy = BODYBUF[k * 2 + 2] as usize;
            if VIS[idx(sx, sy)] != 1 { continue; }
            let d = cheb(sx, sy, PX, PY);
            if d > 14 { continue; }
            vis += 1;
            if d < best.0 { best = (d, sx as i32, sy as i32); }
        }
        if EV_CD > 0 { EV_CD -= 1; }
        if vis > 0 && EV_CD == 0 {
            let dx = best.1 - PX as i32;
            let ev = if dx <= -2 { EV_BODY_L } else if dx >= 2 { EV_BODY_R } else { EV_BODY };
            push_event(ev);
            EV_CD = 10;
        }
        STATS[9] = vis;
    }
}

#[inline]
fn cheb(ax: usize, ay: usize, bx: usize, by: usize) -> i32 {
    let dx = (ax as i32 - bx as i32).abs();
    let dy = (ay as i32 - by as i32).abs();
    if dx > dy { dx } else { dy }
}

fn sight_range() -> i32 {
    // o jogador está em sombra e quieto? então quase invisível
    unsafe {
        let shadow = tile_at(PX, PY) == T_SHADOW;
        if GRACE > 0 { 0 } else if shadow {
            if MOVED { SIGHT_SHADOW_MOVE } else { SIGHT_SHADOW_STILL }
        } else { SIGHT_OPEN }
    }
}

// move o basilisco um passo na direção do alvo; abre portas no caminho
fn bas_step_to(tx: usize, ty: usize) {
    bfs(tx, ty);
    unsafe {
        let here = DMAP[idx(BX, BY)];
        if here == 0xFFFF { return; } // alvo inalcançável
        let cx = BX; let cy = BY;
        let mut best: (u16, i32, i32) = (0xFFFF, 0, 0);
        for (nx, ny) in [(cx + 1, cy), (cx.wrapping_sub(1), cy), (cx, cy + 1), (cx, cy.wrapping_sub(1))] {
            if nx >= W || ny >= H { continue; }
            let d = DMAP[idx(nx, ny)];
            if d < best.0 { best = (d, nx as i32, ny as i32); }
        }
        if best.0 == 0xFFFF { return; }
        let nx = best.1 as usize;
        let ny = best.2 as usize;
        let ni = idx(nx, ny);
        let t = tile_at(nx, ny);
        if t == T_DOOR && !door_open(DEPTH as usize, ni) {
            // ela arranha a porta aberta — barulho alto
            set_door(DEPTH as usize, ni);
            push_event(EV_DOOR_B);
            return; // gastou o passo abrindo
        }
        let (ox, oy) = (BX as u8, BY as u8);
        BX = nx;
        BY = ny;
        body_push(ox, oy);
    }
}

fn patrol_step() {
    unsafe {
        let dirs: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];
        // tenta continuar reto, depois direções aleatórias
        for k in 0..4 {
            let d = if k == 0 { LD } else { rndn(4) };
            let nx = BX as i32 + dirs[d].0;
            let ny = BY as i32 + dirs[d].1;
            if walkable(nx, ny) {
                let ni = idx(nx as usize, ny as usize);
                let t = tile_at(nx as usize, ny as usize);
                if t == T_DOOR && !door_open(DEPTH as usize, ni) {
                    if k >= 2 { continue; } // patrulha não insiste em porta fechada
                    set_door(DEPTH as usize, ni);
                    push_event(EV_DOOR_B);
                }
                let (ox, oy) = (BX as u8, BY as u8);
                BX = nx as usize;
                BY = ny as usize;
                LD = d;
                body_push(ox, oy);
                return;
            }
        }
    }
}

fn basilisk_turn() {
    unsafe {
        BTICK += 1;

        // ---- percepção ----
        // segurar a coroa é um farol — mas imóvel na sombra, ela só sente o
        // cheiro FRACO e persegue onde você ESTAVA. Esconder ainda salva.
        let hidden = CROWN && tile_at(PX, PY) == T_SHADOW && !MOVED;
        let d = cheb(BX, BY, PX, PY);
        let sr = sight_range();
        let sees: bool;
        if CROWN && !hidden {
            // o cheiro da coroa denuncia sua posição real (sem precisar de LOS)
            sees = true;
        } else if hidden {
            sees = false;
        } else {
            sees = d <= 1 || (d <= sr && los(BX, BY, PX, PY));
        }
        if sees {
            if BST != B_HUNT { push_event(EV_STINGER); }
            BST = B_HUNT;
            LX = PX;
            LY = PY;
        }

        // ---- decisão + movimento ----
        if CFREEZE > 0 {
            CFREEZE -= 1;
            return; // o grito da coroa roubada: ela foca e recomeça
        }
        let speed = if BST == B_HUNT {
            if CROWN { 3 } else { 2 } // com a coroa: caça a 1/3; ordem: meia-velocidade
        } else if BST == B_INVEST { 2 } else { 4 };
        if BTICK % speed == 0 {
            match BST {
                B_HUNT => {
                    let at_lk = BX == LX && BY == LY;
                    // perde a caça: chegou na última posição conhecida e não sente nada
                    let lost_track = if CROWN {
                        at_lk && hidden
                    } else {
                        at_lk && !sees
                    };
                    if lost_track {
                        BST = B_INVEST;
                        NX = LX;
                        NY = LY;
                        LOITER = if CROWN { 14 } else { 10 };
                        push_event(EV_LOST);
                    } else {
                        bas_step_to(LX, LY);
                    }
                }
                B_INVEST => {
                    if BX == NX && BY == NY {
                        LOITER -= 1;
                        if LOITER <= 0 { BST = B_PATROL; }
                    } else {
                        bas_step_to(NX, NY);
                    }
                }
                _ => {
                    patrol_step();
                    if BST == B_PATROL && rnd() % 37 == 0 {
                        push_event(EV_HISS);
                    }
                }
            }
        }

        // ---- morte ----
        let d2 = cheb(BX, BY, PX, PY);
        let have_los = los(BX, BY, PX, PY);
        if d2 <= 1 {
            death(2);
        } else if have_los && d2 <= GAZE_R && GRACE <= 0 {
            death(1);
        }
    }
}

// ================= jogador / fluxo =================

fn noise(x: usize, y: usize, r: i32) {
    unsafe {
        if CROWN || BST == B_HUNT { return; }
        let d = cheb(BX, BY, x, y);
        if d <= r {
            if BST != B_INVEST { push_event(EV_ALERT); }
            BST = B_INVEST;
            NX = x;
            NY = y;
            LOITER = 8;
        }
    }
}

fn place_player_at_tile(t: u8) {
    unsafe {
        for i in 0..N {
            if MAP[i] == t {
                PX = i % W;
                PY = i / W;
                return;
            }
        }
        PX = W / 2;
        PY = H / 2;
    }
}

fn place_player_at_up() { place_player_at_tile(T_UP); }

// ao SUBIR, o jogador emerge na SAÍDA ('>') do andar de cima — o mesmo buraco
// pelo qual desceu. A entrada ('<') é só o portão do térreo.
fn place_player_at_exit() { place_player_at_tile(T_DOWN); }

fn place_basilisk() {
    unsafe {
        let (ex, ey) = rcenter(0);
        let mut best: (i32, usize) = (-1, 1);
        let rn = if RN > 1 { RN } else { 1 };
        for r in 0..rn {
            if r == 0 { continue; }
            let (cx, cy) = rcenter(r);
            let dd = (cx - ex).abs() + (cy - ey).abs();
            if dd > best.0 { best = (dd, r); }
        }
        let (cx, cy) = rcenter(best.1);
        let (mut bx, mut by) = (cx, cy);
        // se o centro caiu em pilar, procura piso adjacente na sala
        if !walkable(bx, by) {
            'outer: for dy in -2..=2 {
                for dx in -2..=2 {
                    let tx = cx + dx;
                    let ty = cy + dy;
                    if walkable(tx, ty) { bx = tx; by = ty; break 'outer; }
                }
            }
        }
        if !walkable(bx, by) { bx = W as i32 / 2; by = H as i32 / 2; }
        BX = bx as usize;
        BY = by as usize;
        BST = B_PATROL;
        BTICK = 0;
        LD = 0;
        BODYBUF[0] = 0; // novo andar, serpente inteira: rastro zera
    }
}

fn enter_floor(depth: u8, ev: u32, by_exit: bool) {
    unsafe {
        DEPTH = depth;
        let di = depth as usize - 1;
        if SEEDS[di] == 0 { SEEDS[di] = rnd() | 1; }
        gen_floor(depth, SEEDS[di]);
        if by_exit { place_player_at_exit(); } else { place_player_at_up(); }
        place_basilisk();
        GRACE = 14;
        push_event(ev);
    }
}

fn descend() { unsafe { enter_floor(DEPTH + 1, EV_DOWN, false); } }
// subir NÃO vence: te pousa no '>' do andar de cima, e você reatravessa o
// andar até o '<' dele. A vitória é pisar no portão '<' do térreo com a coroa.
fn ascend() { unsafe { enter_floor(DEPTH - 1, EV_UP, true); } }

fn death(reason: u8) {
    unsafe {
        if STATE != ST_PLAY { return; }
        STATE = ST_DEAD;
        DEATH_R = reason;
        push_event(EV_DEATH);
        render();
        sync_stats();
    }
}
fn win() {
    unsafe {
        if STATE != ST_PLAY { return; }
        STATE = ST_WIN;
        push_event(EV_WIN);
        render();
        sync_stats();
    }
}

fn game_step(input: u32) {
    unsafe {
        if STATE != ST_PLAY { return; }
        TICK += 1;
        if GRACE > 0 { GRACE -= 1; }
        MOVED = false;

        let mut dx: i32 = 0;
        let mut dy: i32 = 0;
        let mut act = true;
        if input & 1 != 0 { dy = -1; }
        else if input & 2 != 0 { dy = 1; }
        else if input & 4 != 0 { dx = -1; }
        else if input & 8 != 0 { dx = 1; }
        else { act = false; }

        if act {
            let nx = PX as i32 + dx;
            let ny = PY as i32 + dy;
            if nx >= 0 && ny >= 0 && (nx as usize) < W && (ny as usize) < H {
                let nx = nx as usize;
                let ny = ny as usize;
                let ni = idx(nx, ny);
                let t = MAP[ni];
                if t == T_WALL || t == T_PILLAR {
                    // bloqueado, silêncio
                } else if t == T_DOOR && !door_open(DEPTH as usize, ni) {
                    set_door(DEPTH as usize, ni);
                    push_event(EV_DOOR);
                    noise(PX, PY, 12);
                } else {
                    PX = nx;
                    PY = ny;
                    MOVED = true;
                    push_event(EV_STEP);
                    match t {
                        T_SHADOW => noise(PX, PY, 3),
                        T_DOWN => descend(),
                        T_UP => {
                            if DEPTH > 1 { ascend(); }
                            else if CROWN { win(); return; }
                            // sem coroa no térreo: o portão não abre
                        }
                        T_CROWN => {
                            CROWN = true;
                            MAP[ni] = T_FLOOR;
                            MOVED = true;
                            push_event(EV_CROWN);
                            CFREEZE = 15;
                        }
                        _ => noise(PX, PY, 5),
                    }
                }
            }
        }

        if STATE == ST_PLAY {
            basilisk_turn();
        }
        if STATE != ST_PLAY { return; }

        compute_fov();
        body_pass();
        render();
        sync_stats();
    }
}

// ================= FOV =================

fn compute_fov() {
    unsafe {
        VIS = [0; N];
        let y0 = PY.saturating_sub(8);
        let y1 = (PY + 8).min(H - 1);
        let x0 = PX.saturating_sub(8);
        let x1 = (PX + 8).min(W - 1);
        for y in y0..=y1 {
            for x in x0..=x1 {
                let ddx = x as i32 - PX as i32;
                let ddy = y as i32 - PY as i32;
                let d2 = ddx * ddx + ddy * ddy;
                let r2: i32 = if tile_at(x, y) == T_SHADOW { 16 } else { 49 };
                if d2 > r2 { continue; }
                if los(PX, PY, x, y) {
                    let i = idx(x, y);
                    VIS[i] = 1;
                    SEEN[(DEPTH as usize - 1) * N + i] = 1;
                }
            }
        }
    }
}

// ================= render =================

#[inline]
fn put(x: usize, y: usize, ch: u8, a: u8) {
    if x < W && y < H {
        let i = idx(x, y) * 2;
        unsafe { GRID[i] = ch; GRID[i + 1] = a; }
    }
}
#[inline]
fn clear_cell(x: usize, y: usize, a: u8) { put(x, y, b' ', a); }

fn write_str(x: usize, y: usize, s: &str, a: u8) {
    for (k, c) in s.bytes().enumerate() { put(x + k, y, c, a); }
}
fn write_center(y: usize, s: &str, a: u8) {
    let n = s.len();
    let x = if n >= W { 0 } else { (W - n) / 2 };
    write_str(x, y, s, a);
}

// arte multilinha centralizada: TODAS as linhas no mesmo x — o alinhamento
// interno vem dos espaços à esquerda de cada literal (nunca torto).
fn write_block_center(y0: usize, rows: &[&str], a: u8) {
    let maxlen = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    let x0 = if maxlen >= W { 0 } else { (W - maxlen) / 2 };
    for (k, r) in rows.iter().enumerate() {
        write_str(x0, y0 + k, r, a);
    }
}

const FONT5: [[&str; 5]; 26] = [
    /*A*/ ["#####", "#...#", "#####", "#...#", "#...#"],
    /*B*/ ["####.", "#...#", "####.", "#...#", "####."],
    /*C*/ ["#####", "#....", "#....", "#....", "#####"],
    /*D*/ ["####.", "#...#", "#...#", "#...#", "####."],
    /*E*/ ["#####", "#....", "####.", "#....", "#####"],
    /*F*/ ["#####", "#....", "####.", "#....", "#...."],
    /*G*/ ["#####", "#....", "#..##", "#...#", "#####"],
    /*H*/ ["#...#", "#...#", "#####", "#...#", "#...#"],
    /*I*/ ["#####", "..#..", "..#..", "..#..", "#####"],
    /*J*/ ["..###", "...#.", "...#.", "#..#.", ".##.."],
    /*K*/ ["#..#.", "#.#..", "##...", "#.#..", "#..#."],
    /*L*/ ["#....", "#....", "#....", "#....", "#####"],
    /*M*/ ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    /*N*/ ["#...#", "##..#", "#.#.#", "#..##", "#...#"],
    /*O*/ ["#####", "#...#", "#...#", "#...#", "#####"],
    /*P*/ ["#####", "#...#", "#####", "#....", "#...."],
    /*Q*/ ["#####", "#...#", "#...#", "#..#.", ".##.#"],
    /*R*/ ["#####", "#...#", "####.", "#..#.", "#...#"],
    /*S*/ ["#####", "#....", "#####", "....#", "#####"],
    /*T*/ ["#####", "..#..", "..#..", "..#..", "..#.."],
    /*U*/ ["#...#", "#...#", "#...#", "#...#", "#####"],
    /*V*/ ["#...#", "#...#", "#...#", ".#.#.", "..#.."],
    /*W*/ ["#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    /*X*/ ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
    /*Y*/ ["#...#", ".#.#.", "..#..", "..#..", "..#.."],
    /*Z*/ ["#####", "...#.", "..#..", ".#...", "#####"],
];

fn write_big(x: usize, y: usize, s: &str, a: u8) {
    let mut cx = x;
    for chb in s.bytes() {
        let g = &FONT5[(chb as usize).wrapping_sub(b'A' as usize).min(25)];
        for r in 0..5 {
            for c in 0..5 {
                if g[r].as_bytes()[c] == b'#' { put(cx + c, y + r, b'#', a); }
            }
        }
        cx += 6;
    }
}

fn attr_of(t: u8) -> u8 {
    match t {
        T_FLOOR => A_FLOOR,
        T_WALL => A_WALL,
        T_SHADOW => A_SHADOW,
        T_DOOR => A_DOOR,
        T_DOWN | T_UP => A_STAIR,
        T_CROWN => A_CROWN,
        T_PILLAR => A_WALL,
        _ => A_FLOOR,
    }
}

fn render() {
    unsafe {
        let st = STATE;
        // fundo
        for y in 0..H {
            for x in 0..W {
                let i = idx(x, y);
                if st == ST_PLAY {
                    if SEEN[(DEPTH as usize - 1) * N + i] == 1 {
                        let t = MAP[i];
                        let a = attr_of(t) | if VIS[i] == 1 { 0 } else { DIM };
                        put(x, y, t, a);
                    } else {
                        clear_cell(x, y, A_VOID);
                    }
                } else {
                    clear_cell(x, y, A_VOID);
                }
            }
        }

        if st == ST_PLAY {
            // corpo (rastro de escamas): só o que você CONSEGUE ver dela
            let blen = BODYBUF[0] as usize;
            for k in 0..blen {
                let sx = BODYBUF[k * 2 + 1] as usize;
                let sy = BODYBUF[k * 2 + 2] as usize;
                if sx == BX && sy == BY { continue; }
                let i = idx(sx, sy);
                if VIS[i] == 1 && cheb(sx, sy, PX, PY) <= 14 {
                    put(sx, sy, b'~', A_BODY);
                }
            }
            // cabeça (só o que você CONSEGUE ver)
            let bi = idx(BX, BY);
            if VIS[bi] == 1 {
                let d = cheb(BX, BY, PX, PY);
                if d <= 14 { put(BX, BY, b'B', A_BAS); }
            }
            put(PX, PY, b'@', A_PLAYER);

            // dica contextual
            let msg: &str = if CROWN {
                "VOCE TEM A COROA. ELA TEM FOME. FUJA PELO '<' NO TERREO"
            } else if BST == B_HUNT {
                "ELA TE VIU. CORRA. QUEBRE A LINHA DE VISAO"
            } else if BST == B_INVEST {
                "ELA OUVIU ALGO. IMOBILIZA-SE. SE ESCONDA"
            } else if TICK < 90 && DEPTH == 1 {
                "ALGO RONDA O CASTELO. NUNCA OLHE PARA ELE"
            } else {
                "UM TOQUE MATA. UM OLHAR MATA. SE ESCONDA"
            };
            write_center(H - 1, msg, if BST == B_HUNT { A_ALERT } else { A_UI });
        } else if st == ST_TITLE {
            render_title();
        } else if st == ST_DEAD {
            render_dead();
        } else {
            render_win();
        }
    }
}

fn render_title() {
    // moldura
    for x in 0..W {
        put(x, 0, b'-', A_TITLE);
        put(x, H - 2, b'-', A_TITLE);
    }
    for y in 0..H {
        put(0, y, b'|', A_TITLE);
        put(W - 1, y, b'|', A_TITLE);
    }
    put(0, 0, b'+', A_TITLE);
    put(W - 1, 0, b'+', A_TITLE);
    put(0, H - 2, b'+', A_TITLE);
    put(W - 1, H - 2, b'+', A_TITLE);

    // silhueta do castelo arrasado
    let art: [&str; 4] = [
        "  ##   ###  #.#  ###   ###  #.#  ##      ##  ###  ##   ",
        "  ##   ###  ###  ###   ###  ###  ##   #  ##  ###  ##.  ",
        " ####       ##       ##       ##   ####      #  #..... ",
        " ###  #+####+### ###+#### ###+##+###  ###+#### # ####  ",
    ];
    for (r, s) in art.iter().enumerate() {
        write_str(2, 2 + r as usize, s, A_WALL);
    }
    write_str(2, 6, " um reino comido ate os ossos ", A_UI);

    // título
    write_big(2, 9, "CASTLE OF", A_TITLE);
    write_big(5, 15, "BASILISK", A_BAS);

    write_center(22, "um conceito de survival horror", A_UI);
    write_center(24, "nao existe vida. nao existe ouro. existe a besta.", A_UI);
    write_center(25, "esconda-se. nunca olhe para ela.", A_UI);
    write_center(27, "WASD/setas - mover      ESPACO - esperar", A_UI);

    // piscar: JS faz attr 9 tremer
    write_center(30, "PRESSIONE ENTER", A_ALERT);
}

fn render_dead() {
    unsafe {
        // moldura completa da tela
        for x in 0..W {
            put(x, 0, b'-', A_ALERT);
            put(x, H - 1, b'-', A_ALERT);
        }
        for y in 0..H {
            put(0, y, b'|', A_ALERT);
            put(W - 1, y, b'|', A_ALERT);
        }
        put(0, 0, b'+', A_ALERT);
        put(W - 1, 0, b'+', A_ALERT);
        put(0, H - 1, b'+', A_ALERT);
        put(W - 1, H - 1, b'+', A_ALERT);

        // crânio da besta (todas as linhas com 26 colunas, espelhadas no eixo)
        let skull: [&str; 7] = [
            "         ________         ",
            "       .\"        \".       ",
            "       /          \\       ",
            "       |  o    o  |       ",
            "       |    __    |       ",
            "         \\  vv  /         ",
            "          |||||           ",
        ];
        write_block_center(4, &skull, A_BAS);

        let msg = if DEATH_R == 1 { "O OLHAR TE ENCONTROU." } else { "AS ESCAMAS TE TOCARAM." };
        write_center(14, msg, A_ALERT);
        write_center(16, "seus ossos guardam o castelo agora.", A_UI);
        write_center(17, "o basilisco volta a rondar, paciente.", A_UI);
        write_center(29, "ENTER - TENTAR DE NOVO", A_ALERT);
    }
}

fn render_win() {
    write_center(10, "A COROA E SUA.", A_CROWN);
    write_center(12, "voce escapou do olhar que comeu uma era.", A_UI);
    write_center(14, "o castelo fica orfao de reis.", A_UI);
    write_center(16, "a besta continua, paciente, no escuro.", A_UI);
    write_center(30, "ENTER - OUTRO DESTINO", A_ALERT);
}

fn sync_stats() {
    unsafe {
        STATS[0] = STATE;
        STATS[1] = DEATH_R;
        STATS[2] = DEPTH;
        STATS[3] = PX as u8;
        STATS[4] = PY as u8;
        STATS[5] = BX as u8;
        STATS[6] = BY as u8;
        STATS[7] = BST;
        STATS[8] = CROWN as u8;
    }
}

// ================= exports =================

#[no_mangle]
pub extern "C" fn pfb_grid_ptr() -> u32 { unsafe { GRID.as_ptr() as u32 } }

#[no_mangle]
pub extern "C" fn pfb_stats_ptr() -> u32 { unsafe { STATS.as_ptr() as u32 } }

#[no_mangle]
pub extern "C" fn pfb_state() -> u32 { unsafe { STATE as u32 } }

#[no_mangle]
pub extern "C" fn pfb_new_game(seed: u32) {
    unsafe {
        STATE = ST_PLAY;
        CROWN = false;
        DEPTH = 1;
        TICK = 0;
        DEATH_R = 0;
        DOORS = [0; 96];
        SEEN = [0; N * 3];
        SEEDS = [0; 3];
        AUD_H = 0;
        AUD_T = 0;
        EV_CD = 0;
        R32 = seed | 1;
        let s = rnd();
        SEEDS[0] = s | 1;
        gen_floor(1, SEEDS[0]);
        place_player_at_up();
        place_basilisk();
        GRACE = 14;
        compute_fov();
        body_pass();
        render();
        sync_stats();
    }
}

#[no_mangle]
pub extern "C" fn pfb_step(input: u32) {
    game_step(input);
}

// ---- dev tools (documentados no README; usados pelo smoke test) ----

/// Renderiza a tela de título. Chamar uma vez após instanciar.
#[no_mangle]
pub extern "C" fn pfb_init() {
    unsafe {
        STATE = ST_TITLE;
        render();
        sync_stats();
    }
}

/// [DEBUG] teleporta o jogador para (px, py) no mapa atual.
#[no_mangle]
pub extern "C" fn pfb_debug_place(px: u32, py: u32) {
    unsafe {
        if (px as usize) < W && (py as usize) < H {
            PX = px as usize;
            PY = py as usize;
            MOVED = false;
            compute_fov();
            render();
            sync_stats();
        }
    }
}

/// [DEBUG] ponteiro para o array de tiles do andar atual (N bytes).
#[no_mangle]
pub extern "C" fn pfb_debug_map_ptr() -> u32 { unsafe { MAP.as_ptr() as u32 } }

/// [DEBUG] ponteiro do rastro do corpo: [0] = comprimento; depois pares (x, y),
/// o segmento mais recente (encostado na cabeça) primeiro. Buffer fixo de 49 bytes.
#[no_mangle]
pub extern "C" fn pfb_debug_body_ptr() -> u32 { unsafe { BODYBUF.as_ptr() as u32 } }

/// [DEBUG] probe de célula: bit0 = caminhável, bit1 = LOS do basilisco até lá,
/// bits 2..9 = distância chebyshev (clamp 255).
#[no_mangle]
pub extern "C" fn pfb_debug_probe(px: u32, py: u32) -> u32 {
    unsafe {
        if (px as usize) >= W || (py as usize) >= H { return 0; }
        let x = px as usize;
        let y = py as usize;
        let walk = walkable(x as i32, y as i32) as u32;
        let l = los(BX, BY, x, y) as u32;
        let d = cheb(BX, BY, x, y).max(0).min(63) as u32;
        walk | (l << 1) | (d << 2)
    }
}

/// [DEBUG] entrega a coroa (dispara a caçada eterna).
#[no_mangle]
pub extern "C" fn pfb_debug_give_crown() {
    unsafe {
        CROWN = true;
        push_event(EV_CROWN);
        sync_stats();
    }
}

