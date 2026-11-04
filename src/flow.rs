//! Jogador e fluxo do tick: posicionamento, subir/descer, morte, vitória e
//! `game_step` — o coração do turno (REGRA DE OURO: mudou estado, sync_stats).

use crate::*;

pub(crate) fn place_player_at_tile(t: u8) {
    unsafe {
        for i in 0..N_MAX {
            if MAP[i] == t {
                PX = i % W();
                PY = i / W();
                return;
            }
        }
        PX = W() / 2;
        PY = H() / 2;
    }
}

pub(crate) fn place_player_at_up() { place_player_at_tile(T_UP); }

// ao SUBIR, o jogador emerge na SAÍDA ('>') do andar de cima — o mesmo buraco
// pelo qual desceu. A entrada ('<') é só o portão do térreo.
pub(crate) fn place_player_at_exit() { place_player_at_tile(T_DOWN); }

pub(crate) fn place_basilisk() {
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
        if !walkable(bx, by) { bx = W() as i32 / 2; by = H() as i32 / 2; }
        BX = bx as usize;
        BY = by as usize;
        BST = B_PATROL;
        BTICK = 0;
        LD = 0;
        RH = 0;
        PLOITER = 0;
        pick_next_room(); // ela começa rondando uma sala DELIBERADAMENTE longe de você
        BODYBUF[0] = 0; // novo andar, serpente inteira: rastro zera
    }
}

pub(crate) fn enter_floor(depth: u8, ev: u32, by_exit: bool) {
    unsafe {
        DEPTH = depth;
        ARRIV = TICK;
        let di = depth as usize - 1;
        if SEEDS[di] == 0 { SEEDS[di] = rnd() | 1; }
        gen_floor(depth, SEEDS[di]);
        clear_player_trail();
        if by_exit { place_player_at_exit(); } else { place_player_at_up(); }
        place_basilisk();
        GRACE = 14;
        push_event(ev);
    }
}

pub(crate) fn descend() { unsafe { enter_floor(DEPTH + 1, EV_DOWN, false); } }
// subir NÃO vence: te pousa no '>' do andar de cima, e você reatravessa o
// andar até o '<' dele. A vitória é pisar no portão '<' do térreo com a coroa.
pub(crate) fn ascend() { unsafe { enter_floor(DEPTH - 1, EV_UP, true); } }

pub(crate) fn death(reason: u8) {
    unsafe {
        if STATE != ST_PLAY { return; }
        STATE = ST_DEAD;
        DEATH_R = reason;
        push_event(EV_DEATH);
        render();
        sync_stats();
    }
}
pub(crate) fn win() {
    unsafe {
        if STATE != ST_PLAY { return; }
        STATE = ST_WIN;
        push_event(EV_WIN);
        render();
        sync_stats();
    }
}

pub(crate) fn game_step(input: u32) {
    unsafe {
        if STATE != ST_PLAY { return; }
        TICK += 1;
        if GRACE > 0 { GRACE -= 1; }
        MOVED = false;
        NOISEL = 0;

        // ---- passada: silencioso (Shift) vs corrida (X/K) vs vàdé normal ----
        let wants_run = input & IN_RUN != 0;
        let can_run = wants_run && STAM >= PANT_AT; // abaixo do limiar: exausta, não corre
        CSNEAK = input & IN_SNEAK != 0 && !can_run;         // correr sobrepõe o silêncio

        let mut dx: i32 = 0;
        let mut dy: i32 = 0;
        let mut act = true;
        if input & 1 != 0 { dy = -1; }
        else if input & 2 != 0 { dy = 1; }
        else if input & 4 != 0 { dx = -1; }
        else if input & 8 != 0 { dx = 1; }
        else { act = false; }

        if act {
            // silencioso: meia cadência — anda a cada 2 ticks, quase mudo
            if CSNEAK {
                SNEAKP += 1;
                if SNEAKP % 2 == 1 { act = false; }
            }
        }

        let mut portaled = false; // desceu/subiu/venceu neste tick?
        if act {
            // corrida: dash de 2 tiles na mesma direção quando o caminho é limpo
            let nsteps = if can_run { 2 } else { 1 };
            for k in 0..nsteps {
                let nx = PX as i32 + dx;
                let ny = PY as i32 + dy;
                if nx < 0 || ny < 0 || (nx as usize) >= W() || (ny as usize) >= H() { break; }
                let nx = nx as usize;
                let ny = ny as usize;
                let ni = idx(nx, ny);
                let t = MAP[ni];
                if t == T_WALL || t == T_PILLAR || t == T_BARS { break; }
                if t == T_DOOR && !door_open(DEPTH as usize, ni) {
                    // a porta consome o passo — e o eco dela denuncia
                    set_door(DEPTH as usize, ni);
                    push_event(EV_DOOR);
                    noise(PX, PY, DOOR_NOISE, true); // porta range: coordenada exata
                    NOISEL = 3;
                    break;
                }
                // o 2º passo do dash é puro chão: sem gatilhos duplos de descer/ganhar
                if k > 0 && t != T_FLOOR && t != T_SHADOW && t != T_RUBBLE && t != T_DOOR { break; }
                PX = nx;
                PY = ny;
                MOVED = true;
                if k == 0 { push_event(EV_STEP); }
                match t {
                    // SEM return cedo: o mapa mudou de andar, mas o tick termina
                    // normal (FOV/render/sync) — senão o bot/JS vê stats velhos
                    // daqui de um tick sob o mapa NOVO (route null fantasma).
                    T_DOWN => { descend(); portaled = true; }
                    T_UP => {
                        if DEPTH > 1 { ascend(); portaled = true; }
                        else if CROWN { win(); portaled = true; }
                        // sem coroa no térreo: o portão não abre (fica no tile)
                    }
                    T_CROWN => {
                        CROWN = true;
                        MAP[ni] = T_FLOOR;
                        push_event(EV_CROWN);
                        CFREEZE = 15;
                    }
                    _ => {}
                }
                if portaled { break; } // dash não atravessa o teleporte
            }
            if portaled { NOISEL = 3; } // escada clamorosa: o eco anuncia o andar novo
        }

        // ---- o ruído que VOCÊ emitiu neste tick ----
        // (após descer/subir: nada — o teleporte não emite passada no andar novo)
        if MOVED && !portaled {
            if can_run {
                STAM = (STAM - RUN_COST).max(0);
                noise(PX, PY, RUN_NOISE, true); // o eco do castelo vazio
                NOISEL = 3;
            } else if CSNEAK {
                noise(PX, PY, SNEAK_NOISE, false);
                NOISEL = 1;
            } else {
                noise(PX, PY, WALK_NOISE, false);
                NOISEL = 2;
            }
        }
        if !can_run {
            STAM = (STAM + STAM_REGEN).min(STAM_MAX);
        }
        // esgotado tentando correr: ofego involuntário alto
        if wants_run && !can_run && TICK % 5 == 0 {
            push_event(EV_PANT);
            noise(PX, PY, PANT_NOISE, false);
            NOISEL = 2;
        }

        if STATE == ST_PLAY {
            note_player_room();
            basilisk_turn();
            if STATE == ST_PLAY { sibilo_tick(); } // a fala dela: o olhar dela pode ter matado no passo acima
        }
        if STATE != ST_PLAY { return; }

        compute_fov();
        body_pass();
        fear_update(); // medo/alucinações/colapso — o medo atrapalha, NUNCA mata
        if STATE == ST_PLAY { render(); }
        sync_stats();
    }
}
