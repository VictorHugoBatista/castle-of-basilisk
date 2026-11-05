//! Medo e loucura: exposição/queda, trauma, pavor ambiente e alucinações
//! (mentiras do RT: nascem no GRID de render, NUNCA no MAP/SEEN).

use crate::*;

// ================= medo e loucura =================

// 0 calmo · 1 assombrado · 2 paranoico · 3 pânico · 4 COLAPSO (não mata:
// é o teatro máximo — todo efeito de uma vez, com você ALI)
#[inline]
pub(crate) fn fear_level() -> u8 {
    let f = unsafe { FEAR };
    if f >= FEAR_MAX { 4 } else if f >= 75 { 3 } else if f >= 55 { 2 } else if f >= 30 { 1 } else { 0 }
}

// o freio do limiar: lá em cima TODO susto rende menos (72+: metade, 86+: um
// quarto) — e susto MIUDO (creep de trás da parede, escamas do rastro: < 3)
// não empurra o topo de jeito nenhum. O COLAPSO só avança por aquilo que você
// VÊ: é o que dá margem de fuga de verdade — escapar de perto é escapar, e a
// descida final você assiste em vez de atravessá-la
#[inline]
pub(crate) fn fear_absorb(gain: i32) -> i32 {
    unsafe {
        let damp = if FEAR >= FEAR_WORRY_HI { 4 } else if FEAR >= FEAR_WORRY_LO { 2 } else { 1 };
        if gain < 3 {
            if damp == 1 { return gain; } // em baixo, todo susto conta
            return 0;                     // no topo, só a visão move a descida
        }
        ((gain + damp / 2) / damp).max(1)
    }
}

// troca de andar zera o imaginado: mentiras novas nascem do lugar novo
pub(crate) fn clear_phantoms() {
    unsafe {
        PH_ON = [false; 4];
        PH_FADE = [0; 4];
        FB_ON = false;
        FB_FADE = 0;
        PC_ON = false;
        PC_FADE = 0;
        PH_CD = 0;
        PANIC_CD = 0;
    }
}

// um tick de vida das alucinações: drenagem de TTL, passeio através das
// paredes e EVAPORAÇÃO por proximidade (a mentira não suporta o olhar de perto)
pub(crate) fn phantoms_tick() {
    unsafe {
        // ---- fantasmas 'o': atravessam tudo, pálidos, 1 tile a cada 3-4 ticks ----
        for k in 0..4 {
            if !PH_ON[k] { continue; }
            if PH_FADE[k] > 0 {
                PH_FADE[k] -= 1;
                if PH_FADE[k] == 0 { PH_ON[k] = false; }
                continue;
            }
            PH_TTL[k] -= 1;
            if PH_TTL[k] <= 0 { PH_ON[k] = false; continue; }
            PH_O[k] -= 1;
            if PH_O[k] <= 0 {
                PH_O[k] = 3 + rndn(2) as i32;
                // metade dos passos vêm NA SUA DIREÇÃO: fantasma assombra VOCÊ
                // — e evapora a d<=2, então a aproximação nunca alcança. O
                // dedo-duro (atravessar parede) continua: é o que o denuncia
                let (dx, dy): (i32, i32) = if rndn(2) == 0 {
                    ((PX as i32 - PH_X[k] as i32).signum(), (PY as i32 - PH_Y[k] as i32).signum())
                } else {
                    (rndn(3) as i32 - 1, rndn(3) as i32 - 1)
                };
                let nx = (PH_X[k] as i32 + dx).clamp(0, W() as i32 - 1);
                let ny = (PH_Y[k] as i32 + dy).clamp(0, H() as i32 - 1);
                PH_X[k] = nx as u8;
                PH_Y[k] = ny as u8;
            }
            if cheb(PH_X[k] as usize, PH_Y[k] as usize, PX, PY) <= 2 {
                PH_FADE[k] = PH_FADE_T;
                push_event(EV_VANISH);
            }
        }
        // ---- falso B: pace de caça do tema (o TIMING dele mente como o real) ----
        if FB_ON {
            if FB_FADE > 0 {
                FB_FADE -= 1;
                if FB_FADE == 0 { FB_ON = false; }
            } else {
                FB_TTL -= 1;
                if FB_TTL <= 0 {
                    FB_ON = false;
                } else {
                    FB_O -= 1;
                    if FB_O <= 0 {
                        FB_O = speed_hunt();
                        let nx = (FB_X as i32 + (rndn(3) as i32 - 1)).clamp(0, W() as i32 - 1);
                        let ny = (FB_Y as i32 + (rndn(3) as i32 - 1)).clamp(0, H() as i32 - 1);
                        FB_X = nx as usize;
                        FB_Y = ny as usize;
                    }
                    if cheb(FB_X, FB_Y, PX, PY) <= 2 {
                        FB_FADE = PH_FADE_T;
                        push_event(EV_VANISH);
                    }
                }
            }
        }
        // ---- coroa-fantasma: estática, CWAIT — aproximar é desmascará-la ----
        if PC_ON {
            if PC_FADE > 0 {
                PC_FADE -= 1;
                if PC_FADE == 0 { PC_ON = false; }
            } else {
                PC_TTL -= 1;
                if PC_TTL <= 0 { PC_ON = false; }
                else if cheb(PC_X, PC_Y, PX, PY) <= 2 {
                    PC_FADE = PH_FADE_T;
                    push_event(EV_VANISH_C);
                }
            }
        }
    }
}


pub(crate) fn spawn_ghost(lvl: u8) {
    unsafe {
        let max_g = PH_GHOST_MAX[lvl as usize];
        let mut alive = 0usize;
        for k in 0..4 { if PH_ON[k] { alive += 1; } }
        if alive >= max_g { return; }
        // nível 1-2: nasce ESCONDIDO (sua memória o vê, não o olho); nível 3+
        // pode nascer no seu campo. E 1 em 4 nascimentos é o VISLUMBRE mesmo
        // no baixo grau: entra no seu campo de relance e evapora a d<=2 —
        // você quase tem certeza de que viu. Quase.
        let (min, max): (i32, i32) = if lvl >= 3 { (3, 8) } else { (5, 12) };
        let glimpse = lvl >= 3 || rndn(4) == 0;
        for _ in 0..24 {
            let x = rndn(W());
            let y = rndn(H());
            let d = cheb(x, y, PX, PY);
            if d < min || d > max { continue; }
            if !walkable(x as i32, y as i32) { continue; }
            if !glimpse && !in_player_sight_ok(x, y, lvl) { continue; }
            for k in 0..4 {
                if PH_ON[k] { continue; }
                PH_ON[k] = true;
                PH_X[k] = x as u8;
                PH_Y[k] = y as u8;
                PH_TTL[k] = 14 + rndn(17) as i32; // vida longa: dá tempo de vir te assombrar
                PH_O[k] = 3 + rndn(2) as i32;
                PH_FADE[k] = 0;
                push_event(EV_WHISPER);
                PH_CD = PH_CD_MAX;
                return;
            }
        }
    }
}

// nível 1-2: nasce FORA do seu campo (a memória o vê, não o olho); nível 3+
// pode nascer em tela: você já não distingue o vivo do imaginado
#[inline]
pub(crate) fn in_player_sight_ok(x: usize, y: usize, lvl: u8) -> bool {
    unsafe { lvl >= 3 || VIS[idx(x, y)] != 1 }
}

pub(crate) fn spawn_fake_b() {
    unsafe {
        // a REAL tem que estar longe: falso B perto seria um radar de graça
        if cheb(BX, BY, PX, PY) < FAKE_B_MIN { return; }
        if FB_ON { return; }
        for _ in 0..30 {
            let x = rndn(W());
            let y = rndn(H());
            let d = cheb(x, y, PX, PY);
            if d < 9 || d > 15 { continue; }
            if !walkable(x as i32, y as i32) { continue; }
            FB_ON = true;
            FB_X = x;
            FB_Y = y;
            FB_TTL = 25 + rndn(16) as i32;
            FB_O = speed_hunt();
            FB_FADE = 0;
            return;
        }
    }
}

pub(crate) fn spawn_phantom_crown() {
    unsafe {
        if PC_ON || CROWN { return; } // com a coroa na mão, outra não faz sentido
        for _ in 0..30 {
            let x = rndn(W());
            let y = rndn(H());
            let d = cheb(x, y, PX, PY);
            if d < 8 || d > 14 { continue; } // longe o bastante para VOCÊ ACEITAR IR
            if !walkable(x as i32, y as i32) { continue; }
            // nasce na MEMÓRIA: tile lembrado mas fora do olho atual (senão o
            // render a desenha num buraco negro e ela "não existe")
            if SEEN[(DEPTH as usize - 1) * N_MAX + idx(x, y)] != 1 { continue; }
            if VIS[idx(x, y)] == 1 { continue; }
            PC_ON = true;
            PC_X = x;
            PC_Y = y;
            PC_TTL = 40 + rndn(31) as i32;
            PC_FADE = 0;
            return;
        }
    }
}

// sorteio de novas mentiras por tick: fantasmas (nv 1+), falso B e
// coroa-fantasma (nv 2+). PH_CD espaça os nascimentos (não enxameia).
// No CALMO (nv 0) nada visual — mas o sussurro raro e o corpo falso seguem:
// tensão sem evidência é paranoia nascendo.
pub(crate) fn fear_haunt(lvl: u8) {
    unsafe {
        if lvl >= 1 {
            if PH_CD == 0 && rndn(PH_GHOST_N[lvl as usize]) == 0 { spawn_ghost(lvl); }
            if lvl >= 2 {
                if PH_CD == 0 && rndn(PH_FAKE_N[lvl as usize]) == 0 { spawn_fake_b(); }
                if PH_CD == 0 && rndn(PH_CROWN_N[lvl as usize]) == 0 { spawn_phantom_crown(); }
            }
        }
        // bafarra solta: no nv0 é "foi impressão minha?" — no resto, rumor constante
        let wnp = PH_WHISP_N[lvl as usize];
        if wnp > 0 && TICK % wnp == 0 { push_event(EV_WHISPER); }
        // passos que não existem: arrasto de escamas SEM corpo em tela — o
        // coração salta antes do cérebro (center-pan no JS: lugar nenhum)
        let bnp = PH_BODY_N[lvl as usize];
        if bnp > 0 && TICK % bnp == 0 && rndn(2) == 0 { push_event(EV_BODY); }
        if PH_CD > 0 { PH_CD -= 1; }
    }
}

// o coração do sistema: EXPOSIÇÃO sobe, AUSÊNCIA desce (devagar... muito devagar)
pub(crate) fn fear_update() {
    unsafe {
        if STATE != ST_PLAY { return; }
        phantoms_tick();
        let mut lvl = fear_level();

        // ---- exposição: a visão mútua, o hálito de costas, o corpo ----
        let d = cheb(BX, BY, PX, PY);
        let seen = los(BX, BY, PX, PY);
        let mut gain = 0;
        if seen {
            if d <= 3 { gain = FEAR_GAIN_HUG; }
            else if d <= 8 { gain = FEAR_GAIN_CLOSE; }
            else if d <= 12 { gain = FEAR_GAIN_FAR; }
        } else if d <= 3 {
            gain = FEAR_GAIN_CREEP; // o hálito mesmo de costas
        }
        gain += (STATS[9] > 0) as i32 * FEAR_GAIN_BODY; // pressenti as escamas
        // nos habitats dela (esgoto e acervo), o medo contamina o dobro:
        // nos canais o lugar ensina a obedecer; na BOCARRA, o lugar É ele
        if matches!(theme(DEPTH), TH_SEWER | TH_CAVE) && gain > 0 { gain += gain / 2; }

        if gain > 0 {
            FEAR += fear_absorb(gain);
            if FEAR > FEAR_PK { FEAR_PK = FEAR; } // o pico marca o trauma
            CALM = 0;
            DECAYT = 0;
        } else {
            CALM += 1;
            // pavor ambiente: o lugar respira — sem exposição nenhuma, o medo
            // rasteja até o teto da profundidade (monótono: o que o esgoto
            // ensinou, o térreo não desaprende)
            let di = DEPTH.clamp(1, 8) as usize;
            AMBT += 1;
            if AMBF < FEAR_AMB_CAP[di] && AMBT >= FEAR_AMB_N[di] {
                AMBT = 0;
                AMBF += 1;
                if FEAR < AMBF { FEAR = AMBF; }
            }
            if CALM >= FEAR_CALM_NEED {
                // queda: LENTA nos níveis altos — histerese do susto; do
                // COLAPSO (4) desce mais devagar que tudo, mas DESCE: um
                // susto de verdade não vira o decoro permanente do jogo
                let (period, dec): (i32, i32) = match lvl {
                    4 => (4, 1),
                    3 => (5, 1),
                    2 => (3, 1),
                    1 => (2, 1),
                    _ => (2, 2),
                };
                DECAYT += 1;
                if DECAYT >= period {
                    DECAYT = 0;
                    FEAR -= dec;
                }
            }
        }
        // o chão do medo: um TERÇO do pico (o trauma) ou o pavor ambiente — o
        // que for maior. O medidor NUNCA desce abaixo dele: quase morreu de
        // medo uma vez, termina a run assombrado — cicatriz, não sentença.
        // Na BOCARRA o chão é o TETO: o medo cravado na entrada (flow.rs)
        // nunca decai lá embaixo — a casa dela é COLAPSO permanente
        if FEAR < 0 { FEAR = 0; }
        let floor = if DEPTH >= 6 { FEAR_MAX } else { (FEAR_PK / 3).max(AMBF) };
        if FEAR < floor { FEAR = floor; }
        // o TOPO NÃO MATA — decisão de design: o medo atrapalha, fascina e
        // desarma, mas nunca é a causa da morte (isso é trabalho dela). O
        // COLAPSO (100) é o teatro máximo: FOV 6, soluço sem parar, o mundo
        // tremendo forte e vinheta fechando — com você ainda respirando
        if FEAR > FEAR_MAX { FEAR = FEAR_MAX; }
        lvl = fear_level();

        // ---- soluço involuntário: o corpo trai o medo (r=2: quase inaudível) ----
        let whip = FEAR_WHELP_AT[lvl as usize];
        if whip > 0 && TICK % whip == 0 {
            push_event(EV_WHELP);
            noise(PX, PY, 2, false);
            NOISEL = 1;
        }
        // ---- pânico: vislumbre que não corresponde a nada (glitch + arrasto) ----
        if lvl == 3 {
            if PANIC_CD > 0 { PANIC_CD -= 1; }
            if PANIC_CD == 0 && rndn(60) == 0 {
                push_event(EV_BODY); // o sinal "solta" sem corpo nenhum em tela
                PANIC_CD = 20;
            }
        }
        fear_haunt(lvl);
    }
}

pub(crate) fn sight_range() -> i32 {
    // o jogador está em sombra ou escombro? então quase invisível
    unsafe {
        let t = tile_at(PX, PY);
        if GRACE > 0 {
            0
        } else if t == T_SHADOW {
            if MOVED {
                if CSNEAK { SIGHT_SHADOW_SNEAK } else { SIGHT_SHADOW_MOVE }
            } else { SIGHT_SHADOW_STILL }
        } else if t == T_RUBBLE {
            if MOVED { SIGHT_RUB } else { SIGHT_RUB_STILL }
        } else {
            SIGHT_OPEN
        }
    }
}
