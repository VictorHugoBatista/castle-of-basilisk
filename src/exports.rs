//! ABI pública: exports `#[no_mangle] pub extern "C"` + dev tools do smoke.
//! Não quebrar: game.js e o smoke consomem exatamente esta lista.

use crate::*;

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

// ================= exports =================

#[no_mangle]
pub extern "C" fn pfb_grid_ptr() -> u32 { unsafe { GRID.as_ptr() as u32 } }

/// tamanho máximo dos buffers de grid/mapa (W_MAX*H_MAX): o JS dimensiona as views
#[no_mangle]
pub extern "C" fn pfb_max_n() -> u32 { N_MAX as u32 }

/// [ch, attr] por célula da barra de UI fabricada (W0 células): dica contextual
#[no_mangle]
pub extern "C" fn pfb_ui_ptr() -> u32 { unsafe { UIROW.as_ptr() as u32 } }

#[no_mangle]
pub extern "C" fn pfb_stats_ptr() -> u32 { unsafe { STATS.as_ptr() as u32 } }

#[no_mangle]
pub extern "C" fn pfb_state() -> u32 { unsafe { STATE as u32 } }

#[no_mangle]
pub extern "C" fn pfb_new_game(seed: u32) {
    unsafe {
        STATE = ST_PLAY;
        CROWN = false;
        SHARD = false;
        DEPTH = 1;
        TICK = 0;
        ARRIV = 0;
        DEATH_R = 0;
        START_REQ = 0;
        MENU_SEL = 0;
        KONAMI_I = 0;
        KONSEL = 0;
        DOORS = [0; N_MAX * FLOORS / 64];
        SEEN = [0; N_MAX * FLOORS];
        SEEDS = [0; FLOORS];
        AUD_H = 0;
        AUD_T = 0;
        EV_CD = 0;
        R32 = seed | 1;
        CSNEAK = false;
        SNEAKP = 0;
        STAM = STAM_MAX;
        NOISEL = 0;
        ROOMT = 0;
        RTX = 0;
        RTY = 0;
        clear_player_trail();
        EAR_CD = 0;
        RH = 0;
        PLOITER = 0;
        LOITER = 0;
        FEAR = 0;
        FEAR_PK = 0;
        AMBF = 0;
        AMBT = 0;
        CALM = 0;
        DECAYT = 0;
        clear_phantoms();
        SIB_T = -(SIB_MAX_MS / TICK_MS);
        R_SIB = ((seed | 1) ^ 0xA5A5A5A5) | 1; // stream própria do sibilo, derivada da seed
        HEART_T = 0;
        R_HEART = ((seed | 1) ^ 0xB347B347) | 1; // stream própria do pulso, também derivada da seed
        DIFF = [0; 227];
        DIFF_PREV = [0; W0 * H0 * 2];
        DIFF_ST = 0xFF;
        DIFF_DP = 0xFF;
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

/// O diferencial de render nasce no Rust (ui.rs: diff_pass no fim de render()):
/// [0] flags (bit0 = repinte integral — câmera/andar/tela mudaram),
/// [1]=camX [2]=camY (canto da janela corrente), [3..227] bitmap de células de
/// TELA mudadas (56×32, bit si; sticky entre acks). O JS lê após os ticks do
/// frame, pinta o marcado (e os attrs animados, que continuam por lá) e
/// confirma com pfb_diff_ack().
#[no_mangle]
pub extern "C" fn pfb_diff_ptr() -> u32 { unsafe { DIFF.as_ptr() as u32 } }

/// Confirmação do consumo do diff: zera flags + bitmap. O próximo render
/// marca de novo o que mudar.
#[no_mangle]
pub extern "C" fn pfb_diff_ack() {
    unsafe {
        DIFF[0] = 0;
        for k in 3..227 { DIFF[k] = 0; }
    }
}

/// Input das telas de menu (titulo, controles e a ESCOLHA DE ANDAR). Bits:
/// 1 UP, 2 DOWN, 4 LEFT, 8 RIGHT, 16 CONFIRMAR (ENTER/ESPACO), 64 VOLTAR (ESC)
/// + 32 B e 512 A do KONAMI. "Iniciar" nao pode ser semeado aqui: publica
/// START_REQ (STATS[13]) e o JS chama pfb_new_game com a semente de relogio.
#[no_mangle]
pub extern "C" fn pfb_menu(input: u32) {
    unsafe {
        if STATE == ST_TITLE {
            match input {
                IN_UP => { if MENU_SEL > 0 { MENU_SEL -= 1; } render(); }
                IN_DOWN => { if MENU_SEL < 1 { MENU_SEL += 1; } render(); }
                IN_CONFIRM => {
                    if MENU_SEL == 0 {
                        START_REQ = 1;
                    } else {
                        STATE = ST_CONTROLS;
                        render();
                    }
                }
                _ => {}
            }
        } else if STATE == ST_CONTROLS {
            // ---- o KONAMI (↑↑↓↓←→←→B A): o progresso vive em KONAMI_I
            // (zero em pfb_new_game). O passo que AVANCA o código é
            // CONSUMIDO: as setas do código não trocam o esquema de teclas
            // e o B/A não Notam nada — quem não conhece o código digita às
            // cegas. Passo que não casa reseta o rastro e cai no menu
            // normal — com UMA gentileza: o A solto (fora do código)
            // continua alternando o esquema (WASD), como sempre foi
            let step = KONAMI[KONAMI_I.min(KONAMI.len() - 1)];
            if input == step {
                KONAMI_I += 1;
                if KONAMI_I >= KONAMI.len() {
                    KONAMI_I = 0;
                    KONSEL = 0;
                    STATE = ST_SELECT;
                    render();
                    sync_stats();
                    return; // o A final consumido: abre a escolha
                }
                // passo intermediário consumido: sem eco na tela (segredo)
                sync_stats();
                return;
            }
            KONAMI_I = if input == KONAMI[0] { 1 } else { 0 };
            match input {
                IN_LEFT => { SCHEME = 0; }
                IN_RIGHT => { SCHEME = 1; }
                IN_MENU_A => { SCHEME = 0; } // o A solto: "A/D alternam" continua
                IN_CONFIRM | IN_MENU_BACK => { STATE = ST_TITLE; }
                _ => {}
            }
            render();
        } else if STATE == ST_SELECT {
            // escolha de andar: cursor 0..7 (o 8 dá a volta ao 1);
            // CONFIRMAR salta direto para o andar; ESC volta às CONTROLES
            match input {
                IN_UP => { KONSEL = (KONSEL + 7) % 8; render(); }
                IN_DOWN => { KONSEL = (KONSEL + 1) % 8; render(); }
                IN_CONFIRM => {
                    jump_floor(KONSEL + 1);
                }
                IN_MENU_BACK => { STATE = ST_CONTROLS; render(); }
                _ => {}
            }
        }
        sync_stats();
    }
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
        if (px as usize) < W() && (py as usize) < H() {
            PX = px as usize;
            PY = py as usize;
            MOVED = false;
            compute_fov();
            render();
            sync_stats();
        }
    }
}

/// [DEBUG] reposiciona a besta: os cenários do smoke precisam ser donos da
/// geometria (o palácio do térreo mudou o mapa da seed do gate e testes de
/// IA/medo dependem de onde ELA está, não de onde o sorteio nasceu).
#[no_mangle]
pub extern "C" fn pfb_debug_bas_place(px: u32, py: u32) {
    unsafe {
        if (px as usize) < W() && (py as usize) < H() {
            BX = px as usize;
            BY = py as usize;
            body_pass(); // rastro recomeça encostado na cabeça nova
            compute_fov(); // a névoa que atualiza é a sua visão sobre ELA
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

/// [DEBUG] ponteiro para o estado da IA: [ROOMT, RTX, RTY, BST, PLOITER,
/// LOITER, RH, EAR_CD] — usado pelo smoke/trace para depurar a mente da besta.
#[no_mangle]
pub extern "C" fn pfb_debug_ai() -> u32 { unsafe { AI_DBG.as_ptr() as u32 } }

/// [DEBUG] probe de célula: bit0 = caminhável, bit1 = LOS do basilisco até lá,
/// bits 2..7 = distância chebyshev (clamp 63), bit8 = dentro do cone de visão dela
#[no_mangle]
pub extern "C" fn pfb_debug_probe(px: u32, py: u32) -> u32 {
    unsafe {
        if (px as usize) >= W() || (py as usize) >= H() { return 0; }
        let x = px as usize;
        let y = py as usize;
        let walk = walkable(x as i32, y as i32) as u32;
        let l = los(BX, BY, x, y) as u32;
        let d = cheb(BX, BY, x, y).max(0).min(63) as u32;
        let cone = in_cone(x, y) as u32;
        walk | (l << 1) | (d << 2) | (cone << 8)
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

/// [DEBUG] entrega o Fragmento Sombrio (liga o pulso do peito).
#[no_mangle]
pub extern "C" fn pfb_debug_give_shard() {
    unsafe {
        SHARD = true;
        push_event(EV_SHARD);
        HEART_T = 0; // o pulso nasce na mão: bate já
        sync_stats();
    }
}

/// [DEBUG] salto de andar (o smoke/bench examina os andares fundos de frente,
/// sem o bot ter de atravessar os sete primeiros): regenera o piso N (1..FLOORS)
/// com a seed que `pfb_new_game` distribui por andar e repõe o jogador na entrada.
#[no_mangle]
pub extern "C" fn pfb_debug_floor(depth: u32) {
    unsafe {
        if depth < 1 || depth > FLOORS as u32 { return; }
        STATE = ST_PLAY;
        enter_floor(depth as u8, EV_DOWN, false);
        compute_fov();
        body_pass();
        render();
        sync_stats();
    }
}

/// [DEBUG] injeta medo (0..100) direto no medidor — os cenários do smoke usam
/// para testar níveis/alucinações/colapso sem esperar exposição orgânica.
#[no_mangle]
pub extern "C" fn pfb_debug_fear(f: u32) {
    unsafe {
        FEAR = (f as i32).min(FEAR_MAX);
        if FEAR > FEAR_PK { FEAR_PK = FEAR; } // injeção também conta pro trauma
        CALM = 0;
        DECAYT = 0;
        if STATE == ST_PLAY {
            compute_fov();
            render();
        }
        sync_stats();
    }
}

/// [DEBUG] ponteiro do estado do FANTASMA: [0]=FEAR, [1]=nível, [2]=fantasmas
/// ativos, [3]=fake B on, [4]=coroa-fantasma on — inspeção do smoke.
#[no_mangle]
pub extern "C" fn pfb_debug_fear_ptr() -> u32 {
    unsafe {
        AI_DBG_FEAR[0] = FEAR.clamp(0, 100) as usize;
        AI_DBG_FEAR[1] = fear_level() as usize;
        AI_DBG_FEAR[2] = PH_ON.iter().filter(|x| **x).count();
        AI_DBG_FEAR[3] = FB_ON as usize;
        AI_DBG_FEAR[4] = PC_ON as usize;
        AI_DBG_FEAR.as_ptr() as u32
    }
}
