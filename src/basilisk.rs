//! A besta: rastro do corpo, movimento (anti-ping-pong), cone de visão,
//! turnos de IA, ruído por rota (portas importam) e escombro.

use crate::*;

// ================= basilisco =================

// grava a posição que a cabeça ACABOU de deixar: o corpo avança com ela
pub(crate) fn body_push(x: u8, y: u8) {
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
pub(crate) fn body_pass() {
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
pub(crate) fn cheb(ax: usize, ay: usize, bx: usize, by: usize) -> i32 {
    let dx = (ax as i32 - bx as i32).abs();
    let dy = (ay as i32 - by as i32).abs();
    if dx > dy { dx } else { dy }
}

// cone de visão dela: ~120° no rumo do último passo. Nas costas é quase cega
// (a raspa dos olhos: d <= 2). É o que cria flancos e atravessadas dramáticas.
#[inline]
pub(crate) fn in_cone(px: usize, py: usize) -> bool {
    let (bx, by) = unsafe { (BX as i32, BY as i32) };
    let dx = px as i32 - bx;
    let dy = py as i32 - by;
    const DIRV: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];
    let (hx, hy) = DIRV[unsafe { LD }];
    if hx == 0 {
        dy * hy >= 0 && dx.abs() <= dy.abs() + 1
    } else {
        dx * hx >= 0 && dy.abs() <= dx.abs() + 1
    }
}

// move o basilisco um passo na direção do alvo; abre portas no caminho.
// Rota de ELA: BFS evitando escombros (entra só na janela de prova fresca).
// anti_back: na patrulha ela NÃO re-entra a célula que acabou de deixar —
// mata o ping-pong de corredor; em beco sem outra saída, o BFS original vence.
pub(crate) fn bas_step_to(tx: usize, ty: usize) { bas_move(tx, ty, false); }
pub(crate) fn bas_step_patrol(tx: usize, ty: usize) { bas_move(tx, ty, true); }

pub(crate) fn bas_move(tx: usize, ty: usize, anti_back: bool) {
    bfs_impl(tx, ty, false);
    unsafe {
        // nota: se ELA está parada dentro do escombro, o DMAP ali é 0xFFFF —
        // ainda assim o vizinho com menor distância (a boca) guia a saída.
        let cx = BX; let cy = BY;
        let mut best: (u16, i32, i32) = (0xFFFF, 0, 0);
        let mut alt: (u16, i32, i32) = (0xFFFF, 0, 0);
        for (nx, ny) in [(cx + 1, cy), (cx.wrapping_sub(1), cy), (cx, cy + 1), (cx, cy.wrapping_sub(1))] {
            if nx >= W() || ny >= H() { continue; }
            let d = DMAP[idx(nx, ny)];
            if d < best.0 {
                alt = best;
                best = (d, nx as i32, ny as i32);
            } else if d < alt.0 {
                alt = (d, nx as i32, ny as i32);
            }
        }
        if best.0 == 0xFFFF { return; }
        // anti-retrocesso: se o melhor passo é a célula anterior e existe
        // alternativa (mesmo mais longa), prefere a alternativa
        if anti_back {
            let (px, py) = (BODYBUF[1] as i32, BODYBUF[2] as i32);
            if alt.0 != 0xFFFF && best.1 == px && best.2 == py {
                best = alt;
            }
        }
        let nx = best.1 as usize;
        let ny = best.2 as usize;
        let ni = idx(nx, ny);
        let t = tile_at(nx, ny);
        if t == T_DOOR && !door_open(DEPTH as usize, ni) {
            // ela arranha a porta fechada — barulho alto
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

// patrulha por salas (pick_next_room + room_target) substituiu o passeio
// random-walk antigo. EV_DOOR_B continua existindo: ela ainda arromba portas
// via bas_step_to no caminho de qualquer rota.

// sorteia o próximo ponto da farejada DENTRO da sala: caminhável e DELIBERADAMENTE
// longe da cabeça (>= 4) — a varredura de verdade, sem micro-passeio aleatório.
// Fallback: recolhe o alvo da sala (raramente: sala pequena demais).
pub(crate) fn pick_loiter_point() {
    unsafe {
        if ROOMT < RN {
            let (x0, y0, x1, y1) = (rget(ROOMT, 0), rget(ROOMT, 1), rget(ROOMT, 2), rget(ROOMT, 3));
            let mut bx = RTX;
            let mut by = RTY;
            for _ in 0..12 {
                let x = (x0 + rndn((x1 - x0 + 1) as usize) as i32) as usize;
                let y = (y0 + rndn((y1 - y0 + 1) as usize) as i32) as usize;
                if !walkable(x as i32, y as i32) { continue; }
                if cheb(x, y, BX, BY) < 4 { continue; }
                bx = x;
                by = y;
                break;
            }
            LOX = bx;
            LOY = by;
        }
    }
}

pub(crate) fn basilisk_turn() {
    unsafe {
        BTICK += 1;
        if RH > 0 { RH -= 1; }
        if EAR_CD > 0 { EAR_CD -= 1; }

        // preso dentro do escombro com a prova escoando? sai pela boca (não
        // pode seguir BFS: a própria rota dela agora bloqueia escombro)
        if tile_at(BX, BY) == T_RUBBLE && !(BST == B_HUNT && RH > 0) {
            step_out_of_rubble();
            return;
        }

        // ---- percepção ----
        // segurar a coroa é um farol — mas imóvel na sombra/escombro, ela só
        // sente o cheiro FRACO e persegue onde você ESTAVA. Esconder salva.
        let ptile = tile_at(PX, PY);
        let hidden = CROWN && (ptile == T_SHADOW || ptile == T_RUBBLE) && !MOVED;
        let d = cheb(BX, BY, PX, PY);
        let sr = sight_range();
        let mut sees = false;
        if CROWN && !hidden {
            // o cheiro da coroa denuncia sua posição real (sem precisar de LOS)
            sees = true;
        } else if hidden {
            sees = false;
        } else if d <= 2 {
            // a raspa dos olhos: colada nela, você é sentida de qualquer jeito
            sees = true;
        } else if d <= sr && los(BX, BY, PX, PY) && in_cone(PX, PY) {
            sees = true;
        }
        if sees {
            if ptile == T_RUBBLE {
                // te viu ENTRAR / ESTAR nos escombros: prova fresca de beco
                RH = RUB_EVIDENCE;
            }
            if BST != B_HUNT {
                push_event(EV_STINGER);
                // ELA TE VIU: pico de pânico imediato — o susto de lock visual
                // (com o freio: a 86+ o spike rende +4 — o terror do lock não
                // é atalho instantâneo para o COLAPSO)
                FEAR += fear_absorb(FEAR_GAIN_SPOTTED);
                if FEAR > FEAR_PK { FEAR_PK = FEAR; } // o pico marca o trauma
                CALM = 0;
            }
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
            // caça: a cada tema insere o próprio toque; com a coroa ela é
            // mais lenta (fôlego e fúria em conflito); na água vai a 1/1
            let h = speed_hunt();
            if CROWN { speed_now(h) + 1 } else { speed_now(h) }
        } else if BST == B_INVEST { speed_now(speed_invest()) } else { speed_now(speed_patrol()) };
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
                        if LOITER <= 0 {
                            // acabou a farejada: vira as costas para uma sala
                            // DELIBERADAMENTE longe de você, e se acalma
                            BST = B_PATROL;
                            PLOITER = 0;
                            EAR_CD = ear_cool();
                            pick_next_room();
                        }
                    } else {
                        bas_step_to(NX, NY);
                    }
                }
                _ => {
                    // patrulha por salas: roteiriza, chega, fareja, e escolhe
                    // a próxima DELIBERADAMENTE longe de você
                    let at_target = BX == RTX && BY == RTY;
                    if at_target || PLOITER > 0 {
                        if PLOITER <= 0 {
                            // farejada LONGA: ela domina a sala por uns bons ticks
                            // (é a sala DELE — corredores são só o caminho FOFO).
                            // Sweep por pontos: prime o ponto longe, caminha nele,
                            // outro, outro — senhorio percorrendo o authDomain.
                            PLOITER = 10 + rndn(14) as i32;
                            pick_loiter_point();
                        } else {
                            PLOITER -= 1;
                            // vai até o ponto da farejada; chegou: varre outro canto
                            if BX != LOX || BY != LOY {
                                bas_step_patrol(LOX, LOY);
                            } else {
                                pick_loiter_point();
                            }
                        }
                        if PLOITER <= 0 {
                            if rnd() % 4 == 0 {
                                // às vezes fica mesma sala (re-materializa alvo)
                                let (tx, ty) = room_target(ROOMT);
                                RTX = tx; RTY = ty;
                            } else {
                                pick_next_room();
                            }
                        }
                        if rnd() % hiss_mod() == 0 { push_event(EV_HISS); }
                    } else if rndn(9) == 0 {
                        // rota impossível (mapa mudou?): troca de sala
                        pick_next_room();
                    } else {
                        bas_step_patrol(RTX, RTY);
                    }
                }
            }
        }

        // ---- morte ----
        let d2 = cheb(BX, BY, PX, PY);
        let have_los = los(BX, BY, PX, PY);
        // olhar mútuo: é o OLHAR DELA que mata — o cone (raspa: colada d<=2).
        // Nas costas dela a distância não interessa: morre quem atravessa a face.
        if d2 <= 1 {
            death(2);
        } else if have_los && d2 <= gaze_r() && GRACE <= 0 && (in_cone(PX, PY) || d2 <= 2) {
            death(1);
        }
    }
}

// única saída de um beco: para o tile vizinho que não é escombro (a boca)
pub(crate) fn step_out_of_rubble() {
    unsafe {
        for (dx, dy) in [(1i32, 0), (-1, 0), (0, 1), (0, -1)] {
            let nx = BX as i32 + dx;
            let ny = BY as i32 + dy;
            if nx >= 0 && ny >= 0 && (nx as usize) < W() && (ny as usize) < H() {
                if walkable(nx, ny) && MAP[idx(nx as usize, ny as usize)] != T_RUBBLE {
                    let (ox, oy) = (BX as u8, BY as u8);
                    BX = nx as usize;
                    BY = ny as usize;
                    body_push(ox, oy);
                    return;
                }
            }
        }
    }
}


// o som nasce em (x,y) com alcance r. Sobrevive a portas fechadas (penalidade
// por porta) e ao escombro; ruído CURTO entrega só a REGIÃO (centro da sala
// mais próxima) — nunca mais um GPS tile-a-tile. Ruído ALTO é coordenada exata.
pub(crate) fn noise(x: usize, y: usize, r: i32, loud: bool) {
    unsafe {
        if BST == B_HUNT { return; }
        // distância de rota (não chebyshev): paredes importam
        bfs_impl(x, y, true);
        let dist = DMAP[idx(BX, BY)] as i32;
        if dist >= 0x7FFF { return; } // inalcançável: não se ouve
        let eff = r - DOOR_PENALTY * doors_on_line(BX, BY, x, y)
            - if tile_at(x, y) == T_RUBBLE { RUB_PENALTY } else { 0 };
        if eff <= 0 || dist > eff { return; } // não chegou até ela
        let strong = loud || eff >= 10;
        // ela está se recompondo de uma farejada recente: passa por cima de
        // passadas fracas — é o que impede "ela colada em você eternamente"
        if EAR_CD > 0 && !strong { return; }
        if strong {
            NX = x;
            NY = y;
        } else {
            // barulho curto: ela só localiza a VIZINHANÇA do som
            let pr = room_of(x as i32, y as i32);
            if pr >= 0 {
                let (cx, cy) = rcenter(pr as usize);
                NX = cx as usize;
                NY = cy as usize;
            } else {
                NX = x;
                NY = y;
            }
        }
        if BST != B_INVEST { push_event(EV_ALERT); }
        BST = B_INVEST;
        LOITER = if strong { 12 } else { 8 };
    }
}

// portas fechadas na linha reta entre a ela e a fonte (max 2): aproximação
// barata de "quantas paredes engolem este som"
pub(crate) fn doors_on_line(x0: usize, y0: usize, x1: usize, y1: usize) -> i32 {
    let (mut x, mut y) = (x0 as i32, y0 as i32);
    let (tx, ty) = (x1 as i32, y1 as i32);
    let dx = (tx - x).abs();
    let dy = (ty - y).abs();
    let sx: i32 = if tx >= x { 1 } else { -1 };
    let sy: i32 = if ty >= y { 1 } else { -1 };
    let mut err = dx - dy;
    let mut n = 0i32;
    let mut guard = 0i32;
    loop {
        guard += 1;
        if guard > 80 { break; }
        if x == tx && y == ty { break; }
        let e2 = 2 * err;
        if e2 > -dy { err -= dy; x += sx; }
        if e2 < dx { err += dx; y += sy; }
        if x == tx && y == ty { break; }
        let t = tile_at(x as usize, y as usize);
        if unsafe { door_open(DEPTH as usize, idx(x as usize, y as usize)) } == false && (t == T_DOOR) {
            n += 1;
        }
        if t == T_WALL || t == T_PILLAR { break; }
        if n >= 2 { break; }
    }
    n
}
