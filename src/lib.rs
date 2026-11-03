//! Castle of Basilisk — conceito de survival horror roguelike, compilado para WASM.
//! ABI crua: exports `#[no_mangle]`, JS lê a memória via ponteiros. Zero dependências.

#![allow(static_mut_refs)]
#![allow(clippy::needless_range_loop)]

pub const W0: usize = 56;  // castelo: o mapa de sempre
pub const H0: usize = 32;
pub const W_MAX: usize = 80; // esgotos: a rede imperial, consideravelmente maior
pub const H_MAX: usize = 44;
pub const N_MAX: usize = W_MAX * H_MAX;
pub const FLOORS: usize = 5; // 1 = térreo · 2-3 = masmorras · 4-5 = esgotos

// ---- temas de andar ----
const TH_CASTLE: u8 = 1;
const TH_DUNGEON: u8 = 2;
const TH_SEWER: u8 = 3;

fn theme(depth: u8) -> u8 {
    if depth <= 1 { TH_CASTLE } else if depth <= 3 { TH_DUNGEON } else { TH_SEWER }
}

// o nome do piso, escrito na barra de UI ao chegar: o lugar fala
fn floor_name(depth: u8) -> &'static str {
    match depth {
        1 => "RUINAS DO CASTELO",
        2 => "MASMORRA ASSOMBRADA",
        3 => "MASMORRA ASSOMBRADA",
        4 => "CANAIS ENVENENADOS",
        _ => "CANAIS ENVENENADOS",
    }
}

// ---- dimensões do andar atual (runtime): variam por tema. W()/H() leem. ----
static mut DIMW: usize = W0;
static mut DIMH: usize = H0;

/// largura do mapa atual (nome curto para byte-a-byte: o W de W_MAX não cabe aqui)
#[inline]
#[allow(non_snake_case)]
fn W() -> usize { unsafe { DIMW } }

#[inline]
#[allow(non_snake_case)]
fn H() -> usize { unsafe { DIMH } }

// ---- tiles (bytes) ----
const T_WALL: u8 = b'#';
const T_FLOOR: u8 = b'.';
const T_SHADOW: u8 = b',';
const T_PILLAR: u8 = b'0';
const T_DOOR: u8 = b'+';
const T_DOWN: u8 = b'>';
const T_UP: u8 = b'<';
const T_CROWN: u8 = 0xA7; // '§' latin-1
const T_RUBBLE: u8 = b'%'; // becos de escombro: transitáveis por você, evitados por ela
const T_WATER: u8 = b'=';  // esgoto: canais imperiais — caminháveis, mas o lar dela

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
const A_RUBBLE: u8 = 12; // escombro '%' — cor da paleta 12 em JS
const A_WATER: u8 = 13;  // água '=' — cor da paleta 13 em JS (lodo)
const A_GHOST: u8 = 14;  // fantasma alucinação 'o' — pálido e pulsante em JS
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
pub const EV_PANT: u32 = 17; // fôlego curto: o ofego de quem correrou demais

pub const EV_BODY: u32 = 14; // escamas visíveis (à frente/centro)
pub const EV_BODY_L: u32 = 15; // escamas visíveis à esquerda
pub const EV_BODY_R: u32 = 16; // escamas visíveis à direita

// ---- medo: os eventos que só existem dentro da sua cabeça ----
pub const EV_WHISPER: u32 = 18;  // bafarra da mente: nasceu uma alucinação
pub const EV_WHELP: u32 = 19;    // soluço involuntário: o corpo trai o medo
pub const EV_VANISH: u32 = 20;   // uma alucinação evaporou de perto
pub const EV_VANISH_C: u32 = 21; // a coroa mentiu: a § falsa evaporou

// estados do jogo
pub const ST_TITLE: u8 = 0;
pub const ST_PLAY: u8 = 1;
pub const ST_DEAD: u8 = 2;
pub const ST_WIN: u8 = 3;
pub const ST_CONTROLS: u8 = 4; // tela de controles (menu inicial)

// estados da IA do basilisco
pub const B_PATROL: u8 = 0;
pub const B_INVEST: u8 = 1;
pub const B_HUNT: u8 = 2;

const GAZE_R: i32 = 4; // olhar mútuo a <= 4 tiles = morte
const SIGHT_OPEN: i32 = 8;
const SIGHT_SHADOW_MOVE: i32 = 4;
const SIGHT_SHADOW_STILL: i32 = 2;
const SIGHT_SHADOW_SNEAK: i32 = 3; // passada silenciosa na sombra: quase tão oculta quanto imóvel
const SIGHT_RUB: i32 = 3;         // andando nos escombros: quase nada visível
const SIGHT_RUB_STILL: i32 = 1;   // imóvel no escombro: desaparece
const BODY_MAX: usize = 24; // comprimento do rastro: anéis de escamas

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

// ---- ruído: o eco do castelo vazio ----
const RUN_NOISE: i32 = 15;   // correr: ouvida de quase todo o andar
const WALK_NOISE: i32 = 5;
const SNEAK_NOISE: i32 = 1;
const DOOR_NOISE: i32 = 13;  // abrir porta: barulho forte e exato
const PANT_NOISE: i32 = 8;   // falta de fôlego: rugido involuntário
const DOOR_PENALTY: i32 = 3; // cada porta fechada entre você e ela engole som
const RUB_PENALTY: i32 = 3;  // o escombro também engole
const STAM_MAX: i32 = 100;
const RUN_COST: i32 = 6;     // fôlego por passo corrido
const STAM_REGEN: i32 = 2;   // recuperação por tick sem correr
const PANT_AT: i32 = 25;     // abaixo disso: ofego audível e sem corrida
const RUB_EVIDENCE: i32 = 30; // ticks de prova fresca para ela entrar no escombro
const EAR_COOL: i32 = 42;     // após uma investigação, ela desconcentra (ticks)
const TRAIL_SCENT: i32 = 260; // por quanto tempo uma sala visitada ainda "cheira"
const TRAIL_W_RECENT: i32 = 14; // peso de sala visitada a 20..140 ticks (masmorra)
const TRAIL_W_OLD: i32 = 5;     // peso de sala visitada a 140..260 ticks (masmorra)

// ---- medo e loucura: a besta vive no RT; o medo vive no SEU peito ----
// Exposição (visão mútua) sobe rápido; longe dela desce DEVAGAR — e quanto
// mais alto o nível, mais lenta a queda: o susto fica preso no corpo.
// Dois freios contra o "medo que nunca aparece" (bancada fear_bench: 94% dos
// ticks no nível 0, coroa-fantasma 0/40 jogos): o TRAUMA (metade do pico
// histórico nunca decai — quase-morte deixa cicatriz) e o PAVOR AMBIENTE (o
// castelo respira: sem exposição nenhuma, o medo rasteja até um teto por
// profundidade — no habitat dela você nunca fica são por muito tempo).
const FEAR_MAX: i32 = 100;
const FEAR_CALM_NEED: i32 = 8;     // ticks sem vê-la para começar a se acalmar
const FEAR_GAIN_HUG: i32 = 7;      // d<=3: o hálito dela no seu rosto
const FEAR_GAIN_CLOSE: i32 = 3;    // d<=8: no campo aberto
const FEAR_GAIN_FAR: i32 = 1;      // vislumbre distante (d<=12)
const FEAR_GAIN_CREEP: i32 = 2;    // sem LOS, d<=3: você logo SABE que ela está ali
const FEAR_GAIN_BODY: i32 = 2;     // escamas do rastro visíveis
const FEAR_GAIN_SPOTTED: i32 = 15; // EV_STINGER: ela TE VIU — pico de pânico
const FEAR_WHELP_AT: [i32; 5] = [0, 0, 18, 9, 9]; // soluço involuntário por nível (cadência)
// pavor ambiente por PROFUNDIDADE (1..5; [0] é pad): teto do medo que o lugar
// impõe e ticks entre cada +1 — monótono na run: subir de volta não desaprende
const FEAR_AMB_CAP: [i32; 6] = [0, 6, 12, 18, 24, 30];
const FEAR_AMB_N: [i32; 6] = [0, 44, 38, 32, 26, 22];
// alucinações: chance 1/N ticks por NÍVEL (0..4) de fantasma 'o', e máx em tela
const PH_GHOST_N: [usize; 5] = [1, 70, 35, 20, 12];
const PH_GHOST_MAX: [usize; 5] = [0, 2, 3, 4, 4];
const PH_FAKE_N: [usize; 5] = [1, 1, 55, 35, 25];    // falso `B` (attr 7 — indistinguível)
const PH_CROWN_N: [usize; 5] = [1, 1, 100, 45, 35];  // coroa-fantasma: § onde não existe coroa
const PH_WHISP_N: [i32; 5] = [0, 110, 60, 40, 25];   // bafarra solta: sussurro SEM fantasma nenhum
const PH_FADE_T: i32 = 2;      // ticks de evaporação
const FAKE_B_MIN: i32 = 12;    // o falso B nasce com a real fora do raio de morte — mais perto
                               // que isso e ele denuncia a real por contraste (radar grátis)
const PH_CD_MAX: i32 = 10;     // cooldown entre spawns: não enxameia num tick só

// ---- temperamento por tema: fora do habitat ela é quase adormecida; na
// masmorra, a besta de sempre; nos esgotos (CASA dela), mortífera ----
#[inline]
fn speed_patrol() -> i32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 6, TH_DUNGEON => 4, _ => 3 } }
#[inline]
fn speed_invest() -> i32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 4, TH_DUNGEON => 3, _ => 2 } }
#[inline]
fn speed_hunt() -> i32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 3, TH_DUNGEON => 2, _ => 2 } }
#[inline]
fn ear_cool() -> i32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 60, TH_DUNGEON => EAR_COOL, _ => 30 } }
#[inline]
fn hiss_mod() -> u32 { match theme(unsafe { DEPTH }) { TH_CASTLE => 90, TH_DUNGEON => 47, _ => 23 } }
// peso do rastro do jogador no sorteio de salas: no térreo o passado cheira
// pouco; nos esgotos o cheiro dela é um cão de caça eterno
#[inline]
fn trail_weights() -> (i32, i32) {
    match theme(unsafe { DEPTH }) { TH_CASTLE => (7, 2), TH_DUNGEON => (TRAIL_W_RECENT, TRAIL_W_OLD), _ => (21, 8) }
}
// o olhar dela é mais letal no habitat: a Cloaca engole luz e pessoas
#[inline]
fn gaze_r() -> i32 { if theme(unsafe { DEPTH }) == TH_SEWER { GAZE_R + 1 } else { GAZE_R } }
// bônus de habitat: na água ela anda a CADA TICK — é o meio nativo dela
#[inline]
fn speed_now(base: i32) -> i32 {
    unsafe {
        if tile_at(BX, BY) == T_WATER && base > 1 { base - 1 } else { base }
    }
}

// ================= estado global =================

static mut GRID: [u8; N_MAX * 2] = [0; N_MAX * 2];
// STATS: 32 bytes — [18] medo (0..100), [19] nível do medo (0..4). Mudança
// ADITIVA: os índices [0..17] seguem idênticos; o JS só re-dimensiona a view.
static mut STATS: [u8; 32] = [0; 32];
static mut AUD: [u32; 16] = [0; 16];
static mut AUD_H: usize = 0;
static mut AUD_T: usize = 0;

static mut STATE: u8 = ST_TITLE;
static mut DEATH_R: u8 = 0; // 1 = olhar, 2 = toque, 3 = loucura (medo em FEAR_MAX)
static mut DEPTH: u8 = 1;
static mut CROWN: bool = false;
static mut TICK: i32 = 0;
static mut GRACE: i32 = 0;
static mut ARRIV: i32 = 0; // tick de chegada no andar: o nome do piso anuncia-se

// ---- menu inicial ----
static mut MENU_SEL: u8 = 0; // cursor: 0 = INICIAR, 1 = CONTROLES
static mut SCHEME: u8 = 0;   // modo de teclas: 0 = WASD, 1 = SETAS
static mut START_REQ: u8 = 0; // menu pediu "Iniciar": o JS semeia o novo jogo

static mut SEEDS: [u32; FLOORS] = [0; FLOORS];
static mut MAP: [u8; N_MAX] = [0; N_MAX];
static mut SEEN: [u8; N_MAX * FLOORS] = [0; N_MAX * FLOORS];
static mut VIS: [u8; N_MAX] = [0; N_MAX];
static mut DOORS: [u64; N_MAX * FLOORS / 64] = [0; N_MAX * FLOORS / 64];

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

// ---- novo sistema: passada, fôlego, escombro e patrulha por salas ----
static mut CSNEAK: bool = false; // passada silenciosa VÁLIDA neste tick
static mut SNEAKP: u32 = 0;      // cadência do meio-passo (move a cada 2 ticks)
static mut STAM: i32 = STAM_MAX; // fôlego
static mut NOISEL: u8 = 0;       // nível de ruído emitido neste tick (HUD: 0..3)
static mut RH: i32 = 0;          // prova fresca de escombro (timer): ela pode entrar
static mut ROOMT: usize = 0;     // sala-alvo da patrulha
static mut RTX: usize = 0;       // alvo de sala materializado (tile caminhável)
static mut RTY: usize = 0;
static mut PLOITER: i32 = 0;     // farejando a sala atual
static mut LOX: usize = 0;       // alvo da farejada atual (varre de propósito)
static mut LOY: usize = 0;
static mut EAR_CD: i32 = 0;      // "tempo de escuta": ruídos fracas não a acordam
// rastro de salas do jogador: ela caça ONDE VOCÊ ESTEVE — o passado cheira
static mut PHIST: [i32; 6] = [-1; 6];
static mut PHT: [i32; 6] = [0; 6];
static mut PH_HEAD: usize = 0;

// rastro do corpo: [0] = comprimento; depois pares (x, y), o mais recente primeiro
static mut BODYBUF: [u8; BODY_MAX * 2 + 1] = [0; BODY_MAX * 2 + 1];
static mut EV_CD: i32 = 0; // cooldown do evento "corpo visível"

// ---- medo e loucura ----
static mut FEAR: i32 = 0;     // 0..FEAR_MAX
static mut FEAR_PK: i32 = 0;  // pico histórico do medo — o trauma se mede por ele
static mut AMBF: i32 = 0;     // pavor ambiente acumulado (monótono na run)
static mut AMBT: i32 = 0;     // contador entre +1 de pavor ambiente
static mut CALM: i32 = 0;     // ticks consecutivos sem exposição
static mut DECAYT: i32 = 0;   // acumulador da queda lenta

// ---- alucinações (mentiras do RT: só existem no GRID de render) ----
static mut PH_ON: [bool; 4] = [false; 4]; // fantasmas 'o' — nunca no MAP/SEEN
static mut PH_X: [u8; 4] = [0; 4];
static mut PH_Y: [u8; 4] = [0; 4];
static mut PH_TTL: [i32; 4] = [0; 4];
static mut PH_O: [i32; 4] = [0; 4];       // cadência do passeio (anda 1 tile a cada 3-4)
static mut PH_FADE: [i32; 4] = [0; 4];    // >0: evaporando por N ticks
static mut FB_ON: bool = false;           // falso basilisco — breca paredes, pace de caça
static mut FB_X: usize = 0;
static mut FB_Y: usize = 0;
static mut FB_TTL: i32 = 0;
static mut FB_O: i32 = 0;
static mut FB_FADE: i32 = 0;
static mut PC_ON: bool = false;           // coroa-fantasma: estática, some ao se aproximar
static mut PC_X: usize = 0;
static mut PC_Y: usize = 0;
static mut PC_TTL: i32 = 0;
static mut PC_FADE: i32 = 0;
static mut PH_CD: i32 = 0;                // cooldown entre spawns de alucinação
static mut PANIC_CD: i32 = 0;             // cadência do vislumbre-fantasma no pânico

static mut DMAP: [u16; N_MAX] = [0; N_MAX];
static mut QUEUE: [u16; N_MAX] = [0; N_MAX];

// barra de UI (dica contextual + nome do andar): 1 linha fixa do viewport,
// composta pelo JS sobre a última linha da tela — segue a câmera no esgoto
static mut UIROW: [u8; W0 * 2] = [0; W0 * 2];
static mut R32: u32 = 1;

// [DEBUG] espelho do estado da IA, atualizado a cada tick (leitura pelo smoke)
static mut AI_DBG: [usize; 8] = [0; 8];
static mut AI_DBG_FEAR: [usize; 5] = [0; 5]; // [FEAR, nível, n fantasmas, fake B, coroa falsa]

static mut ROOMS: [i32; 64] = [0; 64]; // x0,y0,x1,y1 × 16
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
fn idx(x: usize, y: usize) -> usize { y * W() + x }

#[inline]
fn tile_at(x: usize, y: usize) -> u8 {
    if x >= W() || y >= H() { T_WALL } else { unsafe { MAP[idx(x, y)] } }
}

#[inline]
fn door_open(depth: usize, i: usize) -> bool {
    let d = (depth - 1) * N_MAX + i;
    unsafe { (DOORS[d / 64] >> (d % 64)) & 1 == 1 }
}
#[inline]
fn set_door(depth: usize, i: usize) {
    let d = (depth - 1) * N_MAX + i;
    unsafe { DOORS[d / 64] |= 1u64 << (d % 64); }
}

fn opaque(x: i32, y: i32) -> bool {
    if x < 0 || y < 0 || x >= W() as i32 || y >= H() as i32 { return true; }
    let t = tile_at(x as usize, y as usize);
    if t == T_WALL || t == T_PILLAR { return true; }
    if t == T_DOOR { return !unsafe { door_open(DEPTH as usize, idx(x as usize, y as usize)) }; }
    false
}

fn walkable(x: i32, y: i32) -> bool {
    if x < 0 || y < 0 || x >= W() as i32 || y >= H() as i32 { return false; }
    let t = tile_at(x as usize, y as usize);
    t != T_WALL && t != T_PILLAR
}

// caminhável PARA ELA: escombros entram na rota só quando há prova fresca
// (ela te viu ENTRAR ali, ou o barulho foi alto o bastante para denunciar).
// Na patrulha ela evita: conhece o castelo, sabe que beco sem saída não tem fuga.
fn bas_walkable(x: i32, y: i32) -> bool {
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
        if x > 0 && x < W() as i32 - 1 && y > 0 && y < H() as i32 - 1 {
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
        if x > 0 && x < W() as i32 - 1 && y > 0 && y < H() as i32 - 1 {
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

// sala que contém o tile (-1 se corredor/livre)
fn room_of(x: i32, y: i32) -> i32 {
    unsafe {
        for r in 0..RN {
            if x >= rget(r, 0) && x <= rget(r, 2) && y >= rget(r, 1) && y <= rget(r, 3) {
                return r as i32;
            }
        }
    }
    -1
}

// alvo caminhável dentro da sala (o centro pode cair em pilar)
fn room_target(r: usize) -> (usize, usize) {
    unsafe {
        if r >= RN { return (W() / 2, H() / 2); }
        let (cx, cy) = rcenter(r);
        if walkable(cx, cy) { return (cx as usize, cy as usize); }
        for _ in 0..24 {
            let w = (rget(r, 2) - rget(r, 0) + 1) as usize;
            let h = (rget(r, 3) - rget(r, 1) + 1) as usize;
            let x = rget(r, 0) + rndn(w) as i32;
            let y = rget(r, 1) + rndn(h) as i32;
            if walkable(x, y) { return (x as usize, y as usize); }
        }
        (cx as usize, cy as usize)
    }
}

// próxima sala da patrulha: ela caça o RASTRO do jogador — sala que você
// visitou recentemente pesa muito no sorteio (o passado cheira), distância
// desempata. Daqui nasce o "entrei e ela acabou de sair". Nunca repete a
// sala que ela acabou de farejar (r == ROOMT é descartado).
fn pick_next_room() {
    unsafe {
        let rn = if RN > 0 { RN } else { 1 };
        let pr = room_of(PX as i32, PY as i32);
        let (rfx, rfy) = if pr >= 0 { rcenter(pr as usize) } else { (PX as i32, PY as i32) };
        let mut best: (i32, usize) = (i32::MIN, 0);
        let mut second: (i32, usize) = (i32::MIN, 0);
        for r in 0..rn {
            if r == ROOMT { continue; }
            if r as i32 == pr { continue; } // a sala onde você está AGORA não é sorteável
            let (cx, cy) = rcenter(r);
            let mut score = (cx - rfx).abs() + (cy - rfy).abs() + (rndn(7) as i32 - 3);
            // o cheiro do seu passado: sala visitada é ímã — mas com maturidade:
            // saiu agora? pouco interesse; foi há um tempo? muito interesse.
            for k in 0..6 {
                if PHIST[k] == r as i32 {
                    let ago = TICK - PHT[k];
                    let (w_recent, w_old) = trail_weights();
                    if ago >= 20 && ago < 140 { score += w_recent; }
                    else if ago >= 140 && ago < TRAIL_SCENT { score += w_old; }
                    break;
                }
            }
            if score > best.0 { second = best; best = (score, r); }
            else if score > second.0 { second = (score, r); }
        }
        ROOMT = if rn > 1 && rnd() % 4 == 0 && second.0 > i32::MIN { second.1 } else { best.1 };
        let (tx, ty) = room_target(ROOMT);
        RTX = tx;
        RTY = ty;
        PLOITER = 0;
    }
}

// o jogador muda de sala: grava no anel do rastro (ela fareja isso)
fn note_player_room() {
    unsafe {
        let r = room_of(PX as i32, PY as i32);
        if r < 0 { return; }
        if PHIST[PH_HEAD] == r && PHIST[PH_HEAD] != -1 { return; } // já é a anotada
        // só avança o anel em MUDANÇA de sala (evita reciclagem no mesmo lugar)
        let prev = if PH_HEAD == 0 { 5 } else { PH_HEAD - 1 };
        if PHIST[prev] == r { return; }
        PHIST[PH_HEAD] = r;
        PHT[PH_HEAD] = TICK;
        PH_HEAD = (PH_HEAD + 1) % 6;
    }
}

fn clear_player_trail() {
    unsafe {
        PHIST = [-1; 6];
        PHT = [0; 6];
        PH_HEAD = 0;
    }
}

// valida: partindo de '<', todas as salas e o objetivo ('>' ou '§') são alcançáveis
fn connectivity_ok(depth: u8) -> bool {
    unsafe {
        let mut up: usize = usize::MAX;
        for i in 0..N_MAX {
            if MAP[i] == T_UP { up = i; break; }
        }
        if up == usize::MAX { return false; }
        let (ux, uy) = (up % W(), up / W());
        bfs(ux, uy); // trata portas fechadas como abertas (abíveis)
        let need: u8 = if depth < FLOORS as u8 { T_DOWN } else { T_CROWN };
        for i in 0..N_MAX {
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

fn floor_dims(depth: u8) -> (usize, usize) {
    // térreo e masmorras: o castelo de sempre. Esgotos: a rede imperial é
    // consideravelmente maior — dois andares inteiros de cloaca para atravessar.
    if depth >= 4 { (W_MAX, H_MAX) } else { (W0, H0) }
}

fn gen_once(depth: u8, seed: u32) {
    unsafe {
        let (fw, fh) = floor_dims(depth);
        DIMW = fw;
        DIMH = fh;
        MAP = [T_WALL; N_MAX];
        RN = 0;
        repick();
        R32 = seed;
    }

    let th = theme(depth);
    // ---- salas: cada tema tem seu caráter ----
    // castle: salões amplos de palácio · dungeon: celas pequenas e endurecidas
    // · sewer: bacias/cisternas grandes numa rede muito maior
    let (w_span, w_base, h_span, h_base, max_rooms, room_gap, door_pct, shadow_n,
         rub_quota, pil_min_w, pil_min_h, extra_loops, attempt_n) = match th {
        TH_CASTLE  => (6, 5, 4, 4, 10, 1, 4, 55, 1, 6, 4, 2, 240),
        TH_DUNGEON => (4, 3, 3, 2, 16, 2, 5, 75, 3, 7, 5, 2, 420),
        _          => (5, 6, 3, 4, 14, 2, 1, 60, 2, 6, 4, 4, 420),
    };
    for _ in 0..attempt_n {
        if unsafe { RN } >= max_rooms { break; }
        let w = (rndn(w_span) + w_base) as i32;
        let h = (rndn(h_span) + h_base) as i32;
        let x0 = (rndn(W() - w as usize - 2) + 1) as i32;
        let y0 = (rndn(H() - h as usize - 2) + 1) as i32;
        let x1 = x0 + w - 1;
        let y1 = y0 + h - 1;
        let mut ok = true;
        let n = unsafe { RN };
        for r in 0..n {
            if x0 <= rget(r, 2) + room_gap && x1 + room_gap >= rget(r, 0) &&
               y0 <= rget(r, 3) + room_gap && y1 + room_gap >= rget(r, 1) { ok = false; break; }
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
            MAP = [T_WALL; N_MAX];
            for y in 6..26 { for x in 8..48 { MAP[idx(x, y)] = T_FLOOR; } }
            set_room(0, 8, 6, 47, 25);
            set_room(1, 14, 10, 41, 21);
            RN = 2;
        }
        rn = 2;
    }

    // ---- corredores: liga cada sala não-conectada à mais próxima conectada ----
    let mut linked: [bool; 16] = [false; 16];
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

    // ---- corredores extras (loops de fuga) — o esgoto precisa de mais, é imenso ----
    for _ in 0..extra_loops {
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
    for y in 1..H() - 1 {
        for x in 1..W() - 1 {
            let i = idx(x, y);
            if tile_at(x, y) != T_FLOOR { continue; }
            let u = tile_at(x, y - 1);
            let d = tile_at(x, y + 1);
            let l = tile_at(x - 1, y);
            let r = tile_at(x + 1, y);
            let pinch_v = u == T_WALL && d == T_WALL && l != T_WALL && r != T_WALL;
            let pinch_h = l == T_WALL && r == T_WALL && u != T_WALL && d != T_WALL;
            if (pinch_v || pinch_h) && rndn(5) < door_pct {
                unsafe { MAP[i] = T_DOOR; }
            }
        }
    }

    // ---- pilares nas salas grandes ----
    for r in 0..rn {
        let (x0, y0, x1, y1) = (rget(r, 0), rget(r, 1), rget(r, 2), rget(r, 3));
        if x1 - x0 >= pil_min_w && y1 - y0 >= pil_min_h {
            for p in [(x0 + 2, y0 + 2), (x1 - 2, y0 + 2), (x0 + 2, y1 - 2), (x1 - 2, y1 - 2)] {
                unsafe {
                    let i = idx(p.0 as usize, p.1 as usize);
                    if MAP[i] == T_FLOOR { MAP[i] = T_PILLAR; }
                }
            }
        }
    }

    // ---- poças de sombra ----
    for _ in 0..shadow_n {
        let x = 1 + rndn(W() - 2);
        let y = 1 + rndn(H() - 2);
        unsafe {
            let i = idx(x, y);
            if MAP[i] == T_FLOOR { MAP[i] = T_SHADOW; }
        }
    }

    // ---- esgoto: canais de água sobre os corredores (o habitat dela) ----
    if th == TH_SEWER {
        seed_water();
    }

    // ---- entrada '<' na sala 0 ----
    let (ex, ey) = rcenter(0);
    unsafe { MAP[idx(ex as usize, ey as usize)] = T_UP; }

    // ---- saída '>' (até o andar 4) ou coroa '§' com altar (andar 5: a Cloaca
    // Maxima profunda, onde o rei morto coroou-se a si mesmo) ----
    let lr = rn - 1;
    let (dx, dy) = rcenter(lr);
    if depth < FLOORS as u8 {
        set_room_t(dx, dy, T_DOWN);
    } else {
        set_room_t(dx, dy, T_CROWN);
        for off in [(-2, 0i32), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2), (-2, 2), (2, -2)] {
            let tx = dx + off.0;
            let ty = dy + off.1;
            if tx > 0 && tx < W() as i32 - 1 && ty > 0 && ty < H() as i32 - 1 {
                unsafe {
                    let i = idx(tx as usize, ty as usize);
                    if MAP[i] == T_FLOOR { MAP[i] = T_PILLAR; }
                }
            }
        }
    }

    // ---- becos de escombro: esconderijos que ela não patrulha (por último:
    // escava só em parede, nunca conecta nem encolhe caminhos) ----
    dig_pockets(depth, rub_quota);
}

// ================= água (habitat do basilisco, só no esgoto) =================

// córregos de '=' viajando pelos corredores: cume-de-onda com momentum.
// Caminho-por-terra: só converte piso de CORREDOR (fora de sala), então rotas
// de BFS/portais não mudam de grafo — é um jogo de chão, não de arquitetura.
fn seed_water() {
    unsafe {
        for _ in 0..12 {
            let mut cx = (1 + rndn(W() - 2)) as i32;
            let mut cy = (1 + rndn(H() - 2)) as i32;
            if room_of(cx, cy) >= 0 { continue; } // começa em CORREDOR
            let mut len = 14 + rndn(40) as i32;
            while len > 0 {
                let i = idx(cx as usize, cy as usize);
                let t = MAP[i];
                if t == T_FLOOR || t == T_SHADOW {
                    MAP[i] = T_WATER;
                    len -= 1;
                }
                let dx: i32 = match rndn(4) { 0 => 1, 1 => -1, _ => 0 };
                let dy: i32 = if dx == 0 { if rndn(2) == 0 { 1 } else { -1 } } else { 0 };
                cx += dx;
                cy += dy;
                if cx < 1 || cy < 1 || cx >= W() as i32 - 1 || cy >= H() as i32 - 1 { break; }
                if room_of(cx, cy) >= 0 && rndn(3) == 0 { break; } // entra pouco na bacia
            }
        }
    }
}

fn set_room_t(x: i32, y: i32, t: u8) {
    unsafe { MAP[idx(x as usize, y as usize)] = t; }
}

// ================= becos de escombro =================

// algo especial (<, >, §, outro escombro) perto demais do ponto (px,py)?
fn near_tile(px: i32, py: i32, lim: i32) -> bool {
    unsafe {
        for i in 0..N_MAX {
            let t = MAP[i];
            if t == T_UP || t == T_DOWN || t == T_CROWN || t == T_RUBBLE {
                let (ix, iy) = ((i % W()) as i32, (i / W()) as i32);
                if (ix - px).abs() + (iy - py).abs() <= lim { return true; }
            }
        }
    }
    false
}

// escava cavas de escombro fora das salas: uma fila reta de 2-4 tiles numa
// parede lateral de corredor. Regra de ouro da validação: cada tile do beco
// só pode vizinhar parede (ou o tile anterior do próprio beco) — becos são
// ONE-WAY por construção, então conectividade e rotas dela não mudam.
// append-only: só converte parede em escombro, nunca apaga chão.
fn dig_pockets(_depth: u8, quota: usize) {
    unsafe {
        let mut placed = 0usize;
        for _ in 0..260 {
            if placed >= quota { break; }
            let x = rndn(W() - 2) as i32 + 1;
            let y = rndn(H() - 2) as i32 + 1;
            let t0 = MAP[idx(x as usize, y as usize)];
            if t0 != T_FLOOR && t0 != T_SHADOW { continue; }        // só corredor
            if room_of(x, y) >= 0 { continue; }                     // fora de sala
            if near_tile(x, y, 6) { continue; }                     // longe de < > § %
            let dirs: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];
            let di = rndn(4);
            for k in 0..4 {
                let (dx, dy) = dirs[(di + k) % 4];
                let len = 2 + rndn(3) as i32; // 2..4 fundo
                // validação: fila reta toda em parede, vizinhância lateral sólida
                let mut ok = true;
                let (mut tx, mut ty) = (x, y);
                let mut cells: [usize; 4] = [0; 4];
                for s in 0..len {
                    tx += dx; ty += dy;
                    if tx < 1 || ty < 1 || tx >= W() as i32 - 1 || ty >= H() as i32 - 1 { ok = false; break; }
                    let i = idx(tx as usize, ty as usize);
                    if MAP[i] != T_WALL { ok = false; break; }
                    // vizinhos além da linha do beco: só parede ou forro do mapa
                    for (nx, ny) in [(tx + 1, ty), (tx - 1, ty), (tx, ty + 1), (tx, ty - 1)] {
                        let is_line = (nx == tx - dx && ny == ty - dy) || (nx == x && ny == y);
                        if is_line { continue; }
                        if nx < 0 || ny < 0 || nx >= W() as i32 || ny >= H() as i32 { continue; }
                        let nt = tile_at(nx as usize, ny as usize);
                        if nt != T_WALL { ok = false; break; }
                    }
                    if !ok { break; }
                    cells[s as usize] = i;
                }
                if !ok { continue; }
                for s in 0..len { MAP[cells[s as usize]] = T_RUBBLE; }
                placed += 1;
                break;
            }
        }
    }
}

// ================= BFS (caça) =================

// BFS com campo de distância, origem em (tx,ty). rubble_ok=false: caminho "de
// ela" evitando escombros; true: terreno do jogador (conectividade/audição).
fn bfs_impl(tx: usize, ty: usize, rubble_ok: bool) {
    unsafe {
        DMAP = [0xFFFF_u16; N_MAX];
        let src_ok = if rubble_ok { walkable(tx as i32, ty as i32) } else { bas_walkable(tx as i32, ty as i32) };
        if !src_ok { return; }
        let start = idx(tx, ty);
        let mut qh = 0usize;
        let mut qt = 1usize;
        DMAP[start] = 0;
        QUEUE[0] = start as u16;
        while qh < qt {
            let c = QUEUE[qh] as usize;
            qh += 1;
            let d = DMAP[c] + 1;
            let cx = c % W();
            let cy = c / W();
            for (nx, ny) in [(cx + 1, cy), (cx.wrapping_sub(1), cy), (cx, cy + 1), (cx, cy.wrapping_sub(1))] {
                if nx >= W() || ny >= H() { continue; }
                let ni = idx(nx, ny);
                if DMAP[ni] <= d { continue; }
                let ok = if rubble_ok { walkable(nx as i32, ny as i32) } else { bas_walkable(nx as i32, ny as i32) };
                if !ok { continue; }
                DMAP[ni] = d;
                if qt < N_MAX { QUEUE[qt] = ni as u16; qt += 1; }
            }
        }
    }
}

fn bfs(tx: usize, ty: usize) { bfs_impl(tx, ty, true); }

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

// ================= medo e loucura =================

// 0 calmo · 1 assombrado · 2 paranoico · 3 pânico · 4 LOUCURA (mata)
#[inline]
fn fear_level() -> u8 {
    let f = unsafe { FEAR };
    if f >= FEAR_MAX { 4 } else if f >= 75 { 3 } else if f >= 55 { 2 } else if f >= 30 { 1 } else { 0 }
}

// troca de andar zera o imaginado: mentiras novas nascem do lugar novo
fn clear_phantoms() {
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
fn phantoms_tick() {
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


fn spawn_ghost(lvl: u8) {
    unsafe {
        let max_g = PH_GHOST_MAX[lvl as usize];
        let mut alive = 0usize;
        for k in 0..4 { if PH_ON[k] { alive += 1; } }
        if alive >= max_g { return; }
        // nível 1-2: nasce ESCONDIDO (sua memória o vê, não o olho); nível 3+
        // pode nascer no seu campo: você já não distingue o vivo do imaginado
        let (min, max): (i32, i32) = if lvl >= 3 { (3, 8) } else { (5, 12) };
        for _ in 0..24 {
            let x = rndn(W());
            let y = rndn(H());
            let d = cheb(x, y, PX, PY);
            if d < min || d > max { continue; }
            if !walkable(x as i32, y as i32) { continue; }
            if !in_player_sight_ok(x, y, lvl) { continue; }
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
fn in_player_sight_ok(x: usize, y: usize, lvl: u8) -> bool {
    unsafe { lvl >= 3 || VIS[idx(x, y)] != 1 }
}

fn spawn_fake_b() {
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

fn spawn_phantom_crown() {
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
fn fear_haunt(lvl: u8) {
    unsafe {
        if lvl == 0 { return; }
        if PH_CD == 0 && rndn(PH_GHOST_N[lvl as usize]) == 0 { spawn_ghost(lvl); }
        if lvl >= 2 {
            if PH_CD == 0 && rndn(PH_FAKE_N[lvl as usize]) == 0 { spawn_fake_b(); }
            if PH_CD == 0 && rndn(PH_CROWN_N[lvl as usize]) == 0 { spawn_phantom_crown(); }
        }
        // bafarra solta: o sussurro chega SEM fantasma nenhum atrás — o áudio
        // mente sozinho (e você nunca sabe qual dos dois está mentindo)
        let wnp = PH_WHISP_N[lvl as usize];
        if wnp > 0 && TICK % wnp == 0 { push_event(EV_WHISPER); }
        if PH_CD > 0 { PH_CD -= 1; }
    }
}

// o coração do sistema: EXPOSIÇÃO sobe, AUSÊNCIA desce (devagar... muito devagar)
fn fear_update() {
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
        // no habitat dela, o medo contamina o dobro: o lugar te ensina a obedecer
        if theme(DEPTH) == TH_SEWER && gain > 0 { gain += gain / 2; }

        if gain > 0 {
            FEAR += gain;
            if FEAR > FEAR_PK { FEAR_PK = FEAR; } // o pico marca o trauma
            CALM = 0;
            DECAYT = 0;
        } else {
            CALM += 1;
            // pavor ambiente: o lugar respira — sem exposição nenhuma, o medo
            // rasteja até o teto da profundidade (monótono: o que o esgoto
            // ensinou, o térreo não desaprende)
            let di = DEPTH.clamp(1, 5) as usize;
            AMBT += 1;
            if AMBF < FEAR_AMB_CAP[di] && AMBT >= FEAR_AMB_N[di] {
                AMBT = 0;
                AMBF += 1;
                if FEAR < AMBF { FEAR = AMBF; }
            }
            if CALM >= FEAR_CALM_NEED {
                // queda: LENTA nos níveis altos — histerese do susto
                let (period, dec): (i32, i32) = match lvl {
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
        if FEAR < 0 { FEAR = 0; }
        // o chão do medo: metade do pico (o trauma) ou o pavor ambiente — o
        // que for maior. O medidor NUNCA desce abaixo dele: quase morreu de
        // medo uma vez, carrega isso até o fim da run
        let floor = (FEAR_PK / 2).max(AMBF);
        if FEAR < floor { FEAR = floor; }
        if FEAR >= FEAR_MAX {
            // LOUCURA: o medo matou sozinho — motivo de morte 3
            if STATE == ST_PLAY { death(3); }
            return;
        }
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

fn sight_range() -> i32 {
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

// cone de visão dela: ~120° no rumo do último passo. Nas costas é quase cega
// (a raspa dos olhos: d <= 2). É o que cria flancos e atravessadas dramáticas.
#[inline]
fn in_cone(px: usize, py: usize) -> bool {
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
fn bas_step_to(tx: usize, ty: usize) { bas_move(tx, ty, false); }
fn bas_step_patrol(tx: usize, ty: usize) { bas_move(tx, ty, true); }

fn bas_move(tx: usize, ty: usize, anti_back: bool) {
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
fn pick_loiter_point() {
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

fn basilisk_turn() {
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
                FEAR = (FEAR + FEAR_GAIN_SPOTTED).min(FEAR_MAX);
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
fn step_out_of_rubble() {
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

// ================= jogador / fluxo =================

// o som nasce em (x,y) com alcance r. Sobrevive a portas fechadas (penalidade
// por porta) e ao escombro; ruído CURTO entrega só a REGIÃO (centro da sala
// mais próxima) — nunca mais um GPS tile-a-tile. Ruído ALTO é coordenada exata.
fn noise(x: usize, y: usize, r: i32, loud: bool) {
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
fn doors_on_line(x0: usize, y0: usize, x1: usize, y1: usize) -> i32 {
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

fn place_player_at_tile(t: u8) {
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

fn enter_floor(depth: u8, ev: u32, by_exit: bool) {
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
                if t == T_WALL || t == T_PILLAR { break; }
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
        }
        if STATE != ST_PLAY { return; }

        compute_fov();
        body_pass();
        fear_update(); // medo/alucinações/loucura — PODE matar (motivo 3)
        if STATE == ST_PLAY { render(); }
        sync_stats();
    }
}

// ================= barra de UI =================

// a dica contextual mora na ÚLTIMA LINHA DA TELA (não do mapa): com a câmera
// do esgoto, a linha de baixo do mapa nem sempre está visível.
#[inline]
fn put_ui(x: usize, ch: u8, a: u8) {
    if x < W0 {
        let i = x * 2;
        unsafe { UIROW[i] = ch; UIROW[i + 1] = a; }
    }
}

// write_center para a barra de UI (mesma regra de glifos). Zera a barra
// inteira antes de escrever: os tiles fora da mensagem são SEMPRE vazio —
// sem isso, sobras de dicas anteriores (run passada ou alerta mais longo)
// ficam fantasiando a barra para sempre ('AUM TOQUE... ESCONDA0').
fn write_ui_center(s: &str, a: u8) {
    unsafe { UIROW.fill(0); }
    let n = s.chars().count();
    let x = if n >= W0 { 0 } else { (W0 - n) / 2 };
    for (k, c) in s.chars().enumerate() {
        let ch = if c == '\u{B7}' { 0xB7 } else if c.is_ascii() { c as u8 } else { b'?' };
        put_ui(x + k, ch, a);
    }
}

// glifo único na barra de UI (nome do andar, sem centralizar) — usado pelo
// anúncio de tema ao entrar num piso
#[allow(dead_code)]
#[inline]
fn put_ui_str(x: usize, s: &str, a: u8) {
    for (k, c) in s.chars().enumerate() {
        let ch = if c == '\u{B7}' { 0xB7 } else if c.is_ascii() { c as u8 } else { b'?' };
        put_ui(x + k, ch, a);
    }
}

// ================= FOV =================

fn compute_fov() {
    unsafe {
        VIS = [0; N_MAX];
        // pânico (nível 3): o mundo ENCOLHE — raio de visão 6 em vez de 8
        let rr: i32 = if fear_level() >= 3 { 6 } else { 8 };
        let y0 = PY.saturating_sub(rr as usize);
        let y1 = (PY + rr as usize).min(H() - 1);
        let x0 = PX.saturating_sub(rr as usize);
        let x1 = (PX + rr as usize).min(W() - 1);
        for y in y0..=y1 {
            for x in x0..=x1 {
                let ddx = x as i32 - PX as i32;
                let ddy = y as i32 - PY as i32;
                let d2 = ddx * ddx + ddy * ddy;
                let r2: i32 = if tile_at(x, y) == T_SHADOW { 16 } else { rr * rr };
                if d2 > r2 { continue; }
                if los(PX, PY, x, y) {
                    let i = idx(x, y);
                    VIS[i] = 1;
                    SEEN[(DEPTH as usize - 1) * N_MAX + i] = 1;
                }
            }
        }
    }
}

// ================= render =================

#[inline]
fn put(x: usize, y: usize, ch: u8, a: u8) {
    if x < W() && y < H() {
        let i = idx(x, y) * 2;
        unsafe { GRID[i] = ch; GRID[i + 1] = a; }
    }
}
#[inline]
fn clear_cell(x: usize, y: usize, a: u8) { put(x, y, b' ', a); }

fn write_str(x: usize, y: usize, s: &str, a: u8) {
    for (k, c) in s.chars().enumerate() {
        // '·' (U+00B7) vira o byte 0xB7 — o JS renderiza fromCharCode(0xB7) = '·'
        let ch = if c == '\u{B7}' { 0xB7 } else if c.is_ascii() { c as u8 } else { b'?' };
        put(x + k, y, ch, a);
    }
}
fn write_center(y: usize, s: &str, a: u8) {
    let n = s.chars().count();
    let x = if n >= W() { 0 } else { (W() - n) / 2 };
    write_str(x, y, s, a);
}

// arte multilinha centralizada: TODAS as linhas no mesmo x — o alinhamento
// interno vem dos espaços à esquerda de cada literal (nunca torto).
fn write_block_center(y0: usize, rows: &[&str], a: u8) {
    let maxlen = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    let x0 = if maxlen >= W() { 0 } else { (W() - maxlen) / 2 };
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
        if chb == b' ' {
            // espaço: avança uma coluna de glifo sem desenhar nada
            cx += 6;
            continue;
        }
        let g = &FONT5[(chb as usize).wrapping_sub(b'A' as usize).min(25)];
        for r in 0..5 {
            for c in 0..5 {
                if g[r].as_bytes()[c] == b'#' { put(cx + c, y + r, b'#', a); }
            }
        }
        cx += 6;
    }
}

// glifos FONT5 centralizados horizontalmente
fn write_big_center(y: usize, s: &str, a: u8) {
    let width = s.chars().count() * 6 - 1; // cada glifo avança 6; o ultimo não usa o espaçador
    if width >= W() { write_big(0, y, s, a); return; }
    write_big((W() - width) / 2, y, s, a);
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
        T_RUBBLE => A_RUBBLE,
        T_WATER => A_WATER,
        _ => A_FLOOR,
    }
}

fn render() {
    unsafe {
        let st = STATE;
        // Telas de UI (título/controles/morte/vitoria) sao compostas SEMPRE no
        // viewport padrao 56x32 — senao morrer num andar largo (esgoto 80x44)
        // rasgava a tela de morte: o JS fora de jogo le o grid como 56 colunas.
        if st != ST_PLAY && (DIMW != W0 || DIMH != H0) {
            DIMW = W0;
            DIMH = H0;
        }
        // fundo
        for y in 0..H() {
            for x in 0..W() {
                let i = idx(x, y);
                if st == ST_PLAY {
                    if SEEN[(DEPTH as usize - 1) * N_MAX + i] == 1 {
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

            // ---- medo: as mentiras do RT (nunca no MAP/SEEN: só no render) ----
            render_phantoms();

            // dica contextual
            let msg: &str = if CROWN {
                "VOCE TEM A COROA. ELA TEM FOME. FUJA PELO '<' NO TERREO"
            } else if tile_at(PX, PY) == T_RUBBLE {
                "ESCOMBROS. ELA NAO PATRULHA AQUI. NAO FAC BARULHO"
            } else if BST == B_HUNT {
                "ELA TE VIU. CORRA. QUEBRE A LINHA DE VISAO"
            } else if BST == B_INVEST {
                "ELA OUVIU ALGO. IMOBILIZA-SE. SE ESCONDA"
            } else if TICK < 90 && DEPTH == 1 {
                "ALGO RONDA O CASTELO. NUNCA OLHE PARA ELE"
            } else {
                "UM TOQUE MATA. UM OLHAR MATA. SE ESCONDA"
            };
            // chegada num andar novo: o NOME do lugar fala por uns ticks;
            // depois a dica contextual toma a barra
            if TICK - ARRIV < 18 {
                write_ui_center(floor_name(DEPTH), A_TITLE);
            } else {
                write_ui_center(msg, if BST == B_HUNT { A_ALERT } else { A_UI });
            }
        } else if st == ST_TITLE {
            render_title();
        } else if st == ST_CONTROLS {
            render_controls();
        } else if st == ST_DEAD {
            render_dead();
        } else {
            render_win();
        }
    }
}

// as alucinações desenham por ÚLTIMO (sobre a memória do mapa). Fantasmas
// vivem no "lembrado": fora do VIS, escurecem como qualquer tile 0x80.
// Falso B desenha só quando VISÍVEL — exatamente como o real se esconde.
fn render_phantoms() {
    unsafe {
        for k in 0..4 {
            if !PH_ON[k] { continue; }
            let (x, y) = (PH_X[k] as usize, PH_Y[k] as usize);
            if tile_at(x, y) == T_WALL || tile_at(x, y) == T_PILLAR { continue; } // parede sólida engole
            let i = idx(x, y);
            let mut a = A_GHOST;
            if VIS[i] != 1 { a |= DIM; }          // na memória: dim
            if PH_FADE[k] > 0 { a |= DIM; }        // evaporando: dim duplo do JS (shade)
            put(x, y, b'o', a);
        }
        if FB_ON && VIS[idx(FB_X, FB_Y)] == 1 {
            let a = if FB_FADE > 0 { A_BAS | DIM } else { A_BAS };
            put(FB_X, FB_Y, b'B', a);
        }
        if PC_ON && SEEN[(DEPTH as usize - 1) * N_MAX + idx(PC_X, PC_Y)] == 1 {
            let i = idx(PC_X, PC_Y);
            let mut a = A_CROWN;
            if VIS[i] != 1 { a |= DIM; }
            if PC_FADE > 0 { a |= DIM; }
            put(PC_X, PC_Y, T_CROWN, a);
        }
    }
}

fn render_title() {
    // moldura
    for x in 0..W() {
        put(x, 0, b'-', A_TITLE);
        put(x, H() - 2, b'-', A_TITLE);
    }
    for y in 0..H() {
        put(0, y, b'|', A_TITLE);
        put(W() - 1, y, b'|', A_TITLE);
    }
    put(0, 0, b'+', A_TITLE);
    put(W() - 1, 0, b'+', A_TITLE);
    put(0, H() - 2, b'+', A_TITLE);
    put(W() - 1, H() - 2, b'+', A_TITLE);

    // título grande no topo
    write_big_center(2, "CASTLE OF", A_TITLE);
    write_big_center(8, "BASILISK", A_BAS);

    write_center(14, "um conceito de survival horror", A_UI);
    write_center(16, "nao existe vida. nao existe ouro. existe a besta.", A_UI);
    write_center(17, "esconda-se. nunca olhe para ela.", A_UI);

    // menu centralizado: a opcao com cursor fica em ambar (A_TITLE).
    // SEM alocacao: format! cresceria a memoria do wasm e desanexava as views do JS.
    unsafe {
        let items = [("INICIAR", 21), ("CONTROLES", 23)];
        for (k, (label, y)) in items.iter().enumerate() {
            let sel = MENU_SEL == k as u8;
            let a = if sel { A_TITLE } else { A_UI };
            let n = label.chars().count();
            let x = (W() - n) / 2;
            write_str(x, *y, label, a);
            if sel {
                write_str(x - 2, *y, "> ", a);
                write_str(x + n + 1, *y, "<", a);
            }
        }
    }

    write_center(27, "W/S ou setas escolhem · ENTER confirma", A_UI);
}

fn render_controls() {
    // moldura (igual ao titulo, em ambar)
    for x in 0..W() {
        put(x, 0, b'-', A_TITLE);
        put(x, H() - 2, b'-', A_TITLE);
    }
    for y in 0..H() {
        put(0, y, b'|', A_TITLE);
        put(W() - 1, y, b'|', A_TITLE);
    }
    put(0, 0, b'+', A_TITLE);
    put(W() - 1, 0, b'+', A_TITLE);
    put(0, H() - 2, b'+', A_TITLE);
    put(W() - 1, H() - 2, b'+', A_TITLE);

    // cabeçalho grande
    write_big_center(1, "CONTROLES", A_TITLE);

    // escolha do esquema de teclas (alternavel com A/D ou esquerda/direita)
    unsafe {
        write_center(8, "ESCOLHA COMO VOCE VAI ANDAR:", A_UI);
        let wasd_on = SCHEME == 0;
        write_str(15, 10, "WASD", if wasd_on { A_TITLE } else { A_UI });
        write_str(31, 10, "SETAS", if wasd_on { A_UI } else { A_TITLE });
        if wasd_on {
            write_str(13, 10, ">", A_TITLE);
            write_str(20, 10, "<", A_TITLE);
        } else {
            write_str(29, 10, ">", A_TITLE);
            write_str(37, 10, "<", A_TITLE);
        }
        write_center(12, "A/D ou esquerda/direita alternam", A_UI);

        // tabela de comandos: coluna fixa — o modo escolhido ganha ambar (A_TITLE)
        cmd_row(15, "mover", "WASD  /  SETAS");
        cmd_row(16, "esperar", "ESPACO");
        cmd_row(17, "calar-se", "SHIFT");
        cmd_row(18, "correr", "X      /      K");
        cmd_row(19, "portais < e >", "andar sobre eles");
        if wasd_on {
            write_str(31, 15, "WASD", A_TITLE);
            write_str(45, 18, "K", A_TITLE);
        } else {
            write_str(40, 15, "SETAS", A_TITLE);
            write_str(31, 18, "X", A_TITLE);
        }
    }

    write_center(22, "os dois esquemas funcionam o tempo", A_UI);
    write_center(23, "todo: o modo so escolhe o atalho", A_UI);
    write_center(24, "de corrida que cabe na sua mao.", A_UI);

    // piscar: JS faz attr 9 tremer
    write_center(28, "ENTER ou ESC - VOLTAR", A_ALERT);
}

// linha da tabela: rotulo, pontilhado ate a coluna 29 e o valor na 31
fn cmd_row(y: usize, label: &str, val: &str) {
    let lx = 11;
    write_str(lx, y, label, A_UI);
    let start = lx + label.chars().count() + 1; // 1 respiro depois do rotulo
    for x in start..30 {
        put(x, y, b'.', A_UI);
    }
    write_str(31, y, val, A_UI);
}



fn render_dead() {
    unsafe {
        // moldura completa da tela
        for x in 0..W() {
            put(x, 0, b'-', A_ALERT);
            put(x, H() - 1, b'-', A_ALERT);
        }
        for y in 0..H() {
            put(0, y, b'|', A_ALERT);
            put(W() - 1, y, b'|', A_ALERT);
        }
        put(0, 0, b'+', A_ALERT);
        put(W() - 1, 0, b'+', A_ALERT);
        put(0, H() - 1, b'+', A_ALERT);
        put(W() - 1, H() - 1, b'+', A_ALERT);

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

        let msg = match DEATH_R {
            1 => "O OLHAR TE ENCONTROU.",
            2 => "AS ESCAMAS TE TOCARAM.",
            _ => "A LOUCURA TE TOMOU.",
        };
        write_center(14, msg, A_ALERT);
        if DEATH_R == 3 {
            write_center(16, "voce correu atras de uma coroa que nunca existiu.", A_UI);
            write_center(17, "o basilisco nem precisou te achar.", A_UI);
        } else {
            write_center(16, "seus ossos guardam o castelo agora.", A_UI);
            write_center(17, "o basilisco volta a rondar, paciente.", A_UI);
        }
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
        STATS[10] = NOISEL;                      // HUD: medidor de som
        STATS[11] = STAM.clamp(0, 100) as u8;    // HUD: fôlego
        STATS[12] = (tile_at(PX, PY) == T_RUBBLE) as u8; // você está nos escombros
        STATS[13] = START_REQ;                   // menu: pedido de "Iniciar"
        STATS[14] = MENU_SEL;                    // menu: cursor da tela inicial
        STATS[15] = SCHEME;                      // menu: modo de teclas (0 WASD, 1 SETAS)
        STATS[16] = W().min(255) as u8;            // largura do mapa atual
        STATS[17] = H().min(255) as u8;            // altura do mapa atual
        STATS[18] = FEAR.clamp(0, 100) as u8;      // HUD: medo (0..100)
        STATS[19] = fear_level();                  // HUD: nível do medo (0..4)
        AI_DBG[0] = ROOMT;
        AI_DBG[1] = RTX;
        AI_DBG[2] = RTY;
        AI_DBG[3] = BST as usize;
        AI_DBG[4] = PLOITER.max(0) as usize;
        AI_DBG[5] = LOITER.max(0) as usize;
        AI_DBG[6] = RH.max(0) as usize;
        AI_DBG[7] = EAR_CD.max(0) as usize;
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
        DEPTH = 1;
        TICK = 0;
        ARRIV = 0;
        DEATH_R = 0;
        START_REQ = 0;
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

/// Input das telas de menu (titulo e controles). Bits:
/// 1 UP, 2 DOWN, 4 LEFT, 8 RIGHT, 16 CONFIRMAR (ENTER/ESPACO), 64 VOLTAR (ESC).
/// "Iniciar" nao pode ser semeado aqui: publica START_REQ (STATS[13]) e
/// o JS chama pfb_new_game com a semente de relogio.
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
            match input {
                IN_LEFT => { SCHEME = 0; render(); }
                IN_RIGHT => { SCHEME = 1; render(); }
                IN_CONFIRM | IN_MENU_BACK => {
                    STATE = ST_TITLE;
                    render();
                }
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

/// [DEBUG] injeta medo (0..100) direto no medidor — os cenários do smoke usam
/// para testar níveis/alucinações/loucura sem esperar exposição orgânica.
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

