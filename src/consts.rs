//! Constantes: dims, temas, tiles, atributos, eventos de áudio e as
//! tabelas de balance/temperamento (tunáveis no topo do crate).

use crate::*;

pub const W0: usize = 56;  // castelo: o mapa de sempre
pub const H0: usize = 32;
pub const W_BANK: usize = 64; // masmorras: a ala de celas — maior que o palácio,
pub const H_BANK: usize = 36; // menor que a cloaca
pub const W_SEWER: usize = 80; // esgotos: a rede imperial, consideravelmente maior
pub const H_SEWER: usize = 44;
pub const W_MAX: usize = 88; // Bocarra Diabólica: a caverna dela, abaixo dos rios —
pub const H_MAX: usize = 48; // o MAPA MAIOR do jogo (o buffer dimensiona por ela)
pub const N_MAX: usize = W_MAX * H_MAX;
pub const FLOORS: usize = 8; // 1 = térreo · 2-3 = masmorras · 4-5 = esgotos · 6-8 = bocarra

// ---- temas de andar ----
pub(crate) const TH_CASTLE: u8 = 1;
pub(crate) const TH_DUNGEON: u8 = 2;
pub(crate) const TH_SEWER: u8 = 3;
pub(crate) const TH_CAVE: u8 = 4; // Bocarra Diabólica: o ACERVO dela, casa da casa

pub(crate) fn theme(depth: u8) -> u8 {
    if depth <= 1 { TH_CASTLE } else if depth <= 3 { TH_DUNGEON } else if depth <= 5 { TH_SEWER } else { TH_CAVE }
}

// o nome do piso, escrito na barra de UI ao chegar: o lugar fala
pub(crate) fn floor_name(depth: u8) -> &'static str {
    match depth {
        1 => "RUINAS DO CASTELO",
        2 => "MASMORRA ASSOMBRADA",
        3 => "MASMORRA ASSOMBRADA",
        4 => "CANAIS ENVENENADOS",
        5 => "CANAIS ENVENENADOS",
        _ => "BOCARRA DIABOLICA",
    }
}

/// largura do mapa atual (nome curto para byte-a-byte: o W de W_MAX não cabe aqui);
/// DIMW/DIMH moram em state.rs — o lugar de TODA static mut
#[inline]
#[allow(non_snake_case)]
pub(crate) fn W() -> usize { unsafe { DIMW } }

#[inline]
#[allow(non_snake_case)]
pub(crate) fn H() -> usize { unsafe { DIMH } }

// ---- tiles (bytes) ----
pub(crate) const T_WALL: u8 = b'#';
pub(crate) const T_FLOOR: u8 = b'.';
pub(crate) const T_SHADOW: u8 = b',';
pub(crate) const T_PILLAR: u8 = b'0';
pub(crate) const T_DOOR: u8 = b'+';
pub(crate) const T_DOWN: u8 = b'>';
pub(crate) const T_UP: u8 = b'<';
pub(crate) const T_CROWN: u8 = 0xA7; // '§' latin-1
pub(crate) const T_RUBBLE: u8 = b'%'; // becos de escombro: transitáveis por você, evitados por ela
pub(crate) const T_WATER: u8 = b'=';  // esgoto: canais imperiais — caminháveis, mas o lar dela
pub(crate) const T_BARS: u8 = b'|';   // masmorra: grade de cela — bloqueia passagem, a LUZ atravessa
pub(crate) const T_SKULL: u8 = 0xA5;  // masmorra: caveira '¥' restada nas celas abertas (transitável)
pub(crate) const T_CORPSE: u8 = 0xB6; // bocarra: corpo '¶' trazido pela criatura para o acervo (transitável)
pub(crate) const T_SHALLOW: u8 = b'='; // masmorra funda: poça rasa — MESMO glifo da água, mas rasa:
                            // não é o habitat dela, e os pés dela não ganham maré
pub(crate) const T_DEEP: u8 = 0xF7;   // esgoto: '÷' fundura — água demais até para ela: não se passa
pub(crate) const T_SHARD: u8 = 0xA4;  // lat-1 '¤' — o FRAGMENTO SOMBRIO: pedaço bruto de metal
                            // antigo, marcas indecifráveis (pega-se ao pisar — e o attr de coroa:
                            // o MESMO brilho = o MESMO material, por construção)

// ---- atributos (índice da paleta em JS) ----
pub(crate) const A_FLOOR: u8 = 0;
pub(crate) const A_WALL: u8 = 1;
pub(crate) const A_SHADOW: u8 = 2;
pub(crate) const A_DOOR: u8 = 3;
pub(crate) const A_STAIR: u8 = 4;
pub(crate) const A_CROWN: u8 = 5;
pub(crate) const A_PLAYER: u8 = 6;
pub(crate) const A_BAS: u8 = 7;
pub(crate) const A_BODY: u8 = 11; // corpo do basilisco '~' — vermelho na paleta JS
pub(crate) const A_UI: u8 = 8;
pub(crate) const A_ALERT: u8 = 9;
pub(crate) const A_TITLE: u8 = 10;
pub(crate) const A_VOID: u8 = 15;
pub(crate) const A_RUBBLE: u8 = 12; // escombro '%' — cor da paleta 12 em JS
pub(crate) const A_WATER: u8 = 13;  // água '=' — cor da paleta 13 em JS (lodo)
pub(crate) const A_GHOST: u8 = 14;  // fantasma alucinação 'o' — pálido e pulsante em JS
pub(crate) const DIM: u8 = 0x80; // lembrado (não visível agora): escurece em JS

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
pub const EV_PANT: u32 = 17; // fôlego curto: o ofego de quem correrou demais

pub const EV_BODY: u32 = 14; // escamas visíveis (à frente/centro)
pub const EV_BODY_L: u32 = 15; // escamas visíveis à esquerda
pub const EV_BODY_R: u32 = 16; // escamas visíveis à direita

// ---- medo: os eventos que só existem dentro da sua cabeça ----
pub const EV_WHISPER: u32 = 18;  // bafarra da mente: nasceu uma alucinação
pub const EV_WHELP: u32 = 19;    // soluço involuntário: o corpo trai o medo
pub const EV_VANISH: u32 = 20;   // uma alucinação evaporou de perto
pub const EV_VANISH_C: u32 = 21; // a coroa mentiu: a § falsa evaporou

// ---- sibilo próximo: a fala dela DE PERTO ----
// Decisão inteira no RT (basilisk.rs: quando ela sopra, se cala de propósito);
// o SOM é do JS (caso 22 do playEvent: vol/pan/brilho derivam da proximidade).
pub const EV_SIBILO: u32 = 22;

// ---- o Fragmento Sombrio: o achado e o pulso que ele liga no SEU peito ----
pub const EV_SHARD: u32 = 23; // o achado: o açoite frio do metal antigo
pub const EV_HEART: u32 = 24; // um pulso: intervalo decidido no RT pela distância DELE até ela
pub(crate) const SIB_R: i32 = 6; // raio do sopro: acima de 6 tiles nada dela te alcança

// cadência do sopro (migrada de web/game.js para o RT): períodos em MS
// convertidos para ticks (TICK_MS) — o relógio de rAF (~16 ms) virou tick
// de JOGO (140 ms). Deltas honestos: travessia do raio dispara no tick
// seguinte (<= 140 ms de atraso) e o piso de medo (SIB_FLOOR_MS=900) vira
// 6 ticks = 840 ms — imperceptível contra um sopro de ~2.3 s
pub(crate) const SIB_PATROL_MS: i32 = 2400;  // + dist*180: a patrulha respira devagar
pub(crate) const SIB_PATROL_D_MS: i32 = 180;
pub(crate) const SIB_CROWN_MS: i32 = 1500;   // + dist*140: caça com coroa não pára
pub(crate) const SIB_CROWN_D_MS: i32 = 140;
pub(crate) const SIB_MIN_MS: i32 = 1000;     // clamp: sopro nunca mais rápido que 1 s
pub(crate) const SIB_MAX_MS: i32 = 5200;     // nem mais lento que 5.2 s
pub(crate) const SIB_FLOOR_MS: i32 = 900;    // o medo aperta o sopro até este piso (−140 ms/nível)
pub(crate) const SIB_GAP_PCT: u32 = 38;      // ~1 sopro em 3 não sai (fora da caça com coroa)

// cadência do PULSO (o coração de quem carrega o que chia: o fragmento ou
// a coroa — a mesma matéria). Decidida no RT, o relógio é o TICK (140 ms):
// perto (Ela colada) corre até o piso de 600 ms; longe desliza linear até
// quase parar em d >= HEART_FAR_D — 4.5 s é devagar, mas nunca é mudo
pub(crate) const HEART_MIN_T: i32 = 5;   // 600/140 arredondado p/ cima: 5 ticks
pub(crate) const HEART_MAX_T: i32 = 33;  // 4500/140 → 33 ticks
pub(crate) const HEART_FAR_D: i32 = 22;  // d >= 22: o pulso fica no piso (mapa máximo: 88x48)

// duração de um tick na fronteira WASM↔JS: o loop de web/game.js roda a este
// passo fixo — o sibilo nasce em ms no RT e vira ticks aqui
pub(crate) const TICK_MS: i32 = 140;

// estados do jogo
pub const ST_TITLE: u8 = 0;
pub const ST_PLAY: u8 = 1;
pub const ST_DEAD: u8 = 2;
pub const ST_WIN: u8 = 3;
pub const ST_CONTROLS: u8 = 4; // tela de controles (menu inicial)
pub const ST_SELECT: u8 = 5;   // tela de ESCOLHA DE ANDAR (o konami, nas controles)

// estados da IA do basilisco
pub const B_PATROL: u8 = 0;
pub const B_INVEST: u8 = 1;
pub const B_HUNT: u8 = 2;

pub(crate) const GAZE_R: i32 = 4; // olhar mútuo a <= 4 tiles = morte
pub(crate) const SIGHT_OPEN: i32 = 8;
pub(crate) const SIGHT_SHADOW_MOVE: i32 = 4;
pub(crate) const SIGHT_SHADOW_STILL: i32 = 2;
pub(crate) const SIGHT_SHADOW_SNEAK: i32 = 3; // passada silenciosa na sombra: quase tão oculta quanto imóvel
pub(crate) const SIGHT_RUB: i32 = 3;         // andando nos escombros: quase nada visível
pub(crate) const SIGHT_RUB_STILL: i32 = 1;   // imóvel no escombro: desaparece
pub(crate) const BODY_MAX: usize = 24; // comprimento do rastro: anéis de escamas

// ---- bits extras de input (sneak/run) ----
pub const IN_SNEAK: u32 = 32; // Shift: passada de sombra — lenta e muda
pub const IN_RUN: u32 = 64;   // correr: o eco do castelo te denuncia

// ---- bits de input das telas de menu (pfb_menu) ----
// mesmos valores dos bits de jogo: o JS reusa o mesmo codec de teclado.
pub const IN_UP: u32 = 1;
pub const IN_DOWN: u32 = 2;
pub const IN_LEFT: u32 = 4;
pub const IN_RIGHT: u32 = 8;
pub const IN_CONFIRM: u32 = 16; // ENTER/ESPACO: confirmar a opcao
pub const IN_MENU_BACK: u32 = 64; // ESC: voltar para o menu
// letras do KONAMI (↑↑↓↓←→←→B A na tela de CONTROLES abre ST_SELECT): o
// rastreio do código vive na RT (KONAMI_I), então o glue mapeia B/A para
// bits próprios — o A das letras NÃO é o A do esquema (que era o IN_LEFT):
// no menu normal da controls, IN_MENU_A continua alternando o esquema p/ WASD
pub const IN_MENU_B: u32 = 32;
pub const IN_MENU_A: u32 = 512;
pub(crate) const KONAMI: [u32; 10] =
    [IN_UP, IN_UP, IN_DOWN, IN_DOWN, IN_LEFT, IN_RIGHT, IN_LEFT, IN_RIGHT, IN_MENU_B, IN_MENU_A];

// ---- ruído: o eco do castelo vazio ----
pub(crate) const RUN_NOISE: i32 = 15;   // correr: ouvida de quase todo o andar
pub(crate) const WALK_NOISE: i32 = 5;
pub(crate) const SNEAK_NOISE: i32 = 1;
pub(crate) const DOOR_NOISE: i32 = 13;  // abrir porta: barulho forte e exato
pub(crate) const PANT_NOISE: i32 = 8;   // falta de fôlego: rugido involuntário
pub(crate) const DOOR_PENALTY: i32 = 3; // cada porta fechada entre você e ela engole som
pub(crate) const RUB_PENALTY: i32 = 3;  // o escombro também engole
pub(crate) const STAM_MAX: i32 = 100;
pub(crate) const RUN_COST: i32 = 6;     // fôlego por passo corrido
pub(crate) const STAM_REGEN: i32 = 2;   // recuperação por tick sem correr
pub(crate) const PANT_AT: i32 = 25;     // abaixo disso: ofego audível e sem corrida
pub(crate) const RUB_EVIDENCE: i32 = 30; // ticks de prova fresca para ela entrar no escombro
// o acervo DELATA quem corre em cima dele: o craque do osso e o mush molhado
// da carne gritam MAIS que a bota (coordenada exata — loud=true). Só no
// acervo (tiles ¥/¶ da Bocarra); andar/sneak por lá é só cenário.
pub(crate) const BONE_CRACK_NOISE: i32 = 16;
pub(crate) const CORPSE_MUSH_NOISE: i32 = 17;
pub(crate) const EAR_COOL: i32 = 42;     // após uma investigação, ela desconcentra (ticks)
pub(crate) const TRAIL_SCENT: i32 = 260; // por quanto tempo uma sala visitada ainda "cheira"
pub(crate) const TRAIL_W_RECENT: i32 = 14; // peso de sala visitada a 20..140 ticks (masmorra)
pub(crate) const TRAIL_W_OLD: i32 = 5;     // peso de sala visitada a 140..260 ticks (masmorra)

// ---- medo e loucura: a besta vive no RT; o medo vive no SEU peito ----
// Exposição (visão mútua) sobe rápido; longe dela desce DEVAGAR — e quanto
// mais alto o nível, mais lenta a queda: o susto fica preso no corpo.
// Dois freios contra o "medo que nunca aparece" (bancada fear_bench: 94% dos
// ticks no nível 0, coroa-fantasma 0/40 jogos): o TRAUMA (metade do pico
// histórico nunca decai — quase-morte deixa cicatriz, não sentença) e o PAVOR
// AMBIENTE (o castelo respira: sem exposição nenhuma, o medo rasteja até um
// teto por profundidade — no habitat dela você nunca fica são por muito tempo).
pub(crate) const FEAR_MAX: i32 = 100;
pub(crate) const FEAR_CALM_NEED: i32 = 8;     // ticks sem vê-la para começar a se acalmar
// o freio do limiar: o topo da escalada é a DESCIDA dramática — lá em cima o
// corpo para de absorver susto fácil (cada ponto rende menos), então o COLAPSO
// exige exposição LONGA: é o tempo em que o mundo inteiro quebra na tela, com
// você ainda respirando (o pavor atrapalha, jamais mata). No 45→100 do rosto
// dela: de ~8 ticks para ~20.
pub(crate) const FEAR_WORRY_LO: i32 = 72;
pub(crate) const FEAR_WORRY_HI: i32 = 86;
pub(crate) const FEAR_GAIN_HUG: i32 = 7;      // d<=3: o hálito dela no seu rosto
pub(crate) const FEAR_GAIN_CLOSE: i32 = 3;    // d<=8: no campo aberto
pub(crate) const FEAR_GAIN_FAR: i32 = 1;      // vislumbre distante (d<=12)
pub(crate) const FEAR_GAIN_CREEP: i32 = 2;    // sem LOS, d<=3: você logo SABE que ela está ali
pub(crate) const FEAR_GAIN_BODY: i32 = 2;     // escamas do rastro visíveis
pub(crate) const FEAR_GAIN_SPOTTED: i32 = 15; // EV_STINGER: ela TE VIU — pico de pânico
pub(crate) const FEAR_WHELP_AT: [i32; 5] = [0, 30, 18, 9, 9]; // soluço involuntário por nível (cadência)
// pavor ambiente por PROFUNDIDADE (1..8; [0] é pad): teto do medo que o lugar
// impõe e ticks entre cada +1 — monótono na run: subir de volta não desaprende.
// Na BOCARRA o teto fica em METADE (50): o acervo marca (o chão lá embaixo é
// FEAR_MAX, fear.rs — o medo cravado na entrada não decai no fundo), mas NÃO
// envenena a volta: o chão dos andares de cima é o trauma (metade do pico),
// então a escada de volta respira no 50, não em COLAPSO inteiro
pub(crate) const FEAR_AMB_CAP: [i32; 9] = [0, 6, 12, 18, 24, 30, 50, 50, 50];
pub(crate) const FEAR_AMB_N: [i32; 9] = [0, 44, 38, 32, 26, 22, 18, 16, 14];
// alucinações: chance 1/N ticks por NÍVEL (0..4); cadências sobem do calmo
// para a paranoia LENTA mas presente — graça = menos morte, mais pavor
pub(crate) const PH_GHOST_N: [usize; 5] = [1, 30, 18, 12, 14];
pub(crate) const PH_GHOST_MAX: [usize; 5] = [0, 2, 3, 4, 4];
pub(crate) const PH_FAKE_N: [usize; 5] = [1, 120, 25, 18, 13];   // falso `B` (attr 7 — indistinguível)
pub(crate) const PH_CROWN_N: [usize; 5] = [1, 1, 45, 30, 22];    // coroa-fantasma: § onde não existe coroa
pub(crate) const PH_WHISP_N: [i32; 5] = [240, 25, 20, 14, 16];   // bafarra: no CALMO é "foi impressão minha?"
pub(crate) const PH_BODY_N: [i32; 5] = [0, 240, 150, 60, 55];    // passos que não existem: o coração salta
pub(crate) const PH_FADE_T: i32 = 2;      // ticks de evaporação
pub(crate) const FAKE_B_MIN: i32 = 12;    // o falso B nasce com a real fora do raio de morte — mais perto
                               // que isso e ele denuncia a real por contraste (radar grátis)
pub(crate) const PH_CD_MAX: i32 = 10;     // cooldown entre spawns: não enxameia num tick só

// ---- temperamento por tema: fora do habitat ela é quase adormecida; na
// masmorra, a besta de sempre; nos esgotos, mortífera; na BOCARRA (a casa
// da casa) o ofício dela a cada tick: lenta na patrulha que NUNCA dorme,
// e o olhar que raspa o fundo do acervo ----
#[inline]
pub(crate) fn speed_patrol() -> i32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 6, TH_DUNGEON => 4, TH_CAVE => 2, _ => 3 } }
#[inline]
pub(crate) fn speed_invest() -> i32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 4, TH_DUNGEON => 3, TH_CAVE => 2, _ => 2 } }
#[inline]
pub(crate) fn speed_hunt() -> i32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 3, TH_DUNGEON => 2, TH_CAVE => 2, _ => 2 } }
#[inline]
pub(crate) fn ear_cool() -> i32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 60, TH_DUNGEON => EAR_COOL, TH_CAVE => 20, _ => 30 } }
#[inline]
pub(crate) fn hiss_mod() -> u32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 90, TH_DUNGEON => 47, TH_CAVE => 10, _ => 23 } }
// peso do rastro do jogador no sorteio de salas: no térreo o passado cheira
// pouco; na casa dela o cheiro de VOCÊ é a única luz que ela segue
#[inline]
pub(crate) fn trail_weights() -> (i32, i32) {
    match theme(unsafe { DEPTH }) { TH_CASTLE => (7, 2), TH_DUNGEON => (TRAIL_W_RECENT, TRAIL_W_OLD), TH_CAVE => (28, 12), _ => (21, 8) }
}
// o olhar dela é mais letal no habitat: a Cloaca engole luz e pessoas —
// e no acervo, o fundo do fundo, o fundo olha de volta mais longe
#[inline]
pub(crate) fn gaze_r() -> i32 {
    match theme(unsafe { DEPTH }) { TH_SEWER => GAZE_R + 1, TH_CAVE => GAZE_R + 2, _ => GAZE_R }
}
// bônus de habitat: na água ela anda a CADA TICK — é o meio nativo dela
#[inline]
pub(crate) fn speed_now(base: i32) -> i32 {
    unsafe {
        if tile_at(BX, BY) == T_WATER && base > 1 { base - 1 } else { base }
    }
}
