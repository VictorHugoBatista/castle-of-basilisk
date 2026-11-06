//! Estado global: TODAS as `static mut` em endereços estáveis — o layout daqui
//! é contrato documentado no ARCHITECTURE.md (mudou layout = muda doc no mesmo
//! commit).

use crate::*;

// ================= estado global =================

// ---- dimensões do andar atual (runtime): variam por tema. W()/H() (consts.rs) leem. ----
pub(crate) static mut DIMW: usize = W0;
pub(crate) static mut DIMH: usize = H0;

pub(crate) static mut GRID: [u8; N_MAX * 2] = [0; N_MAX * 2];
// STATS: 32 bytes — [18] medo (0..100), [19] nível do medo (0..4). Mudança
// ADITIVA: os índices [0..17] seguem idênticos; o JS só re-dimensiona a view.
pub(crate) static mut STATS: [u8; 32] = [0; 32];
pub(crate) static mut AUD: [u32; 16] = [0; 16];
pub(crate) static mut AUD_H: usize = 0;
pub(crate) static mut AUD_T: usize = 0;

pub(crate) static mut STATE: u8 = ST_TITLE;
pub(crate) static mut DEATH_R: u8 = 0; // motivos de morte REAL: 1 = olhar, 2 = toque
                            // (o medo nunca mata — veja fear_update)
pub(crate) static mut DEPTH: u8 = 1;
pub(crate) static mut CROWN: bool = false;
pub(crate) static mut SHARD: bool = false; // o Fragmento Sombrio: carrega-o e o SEU peito
                                           // pulsa com a distância dela (a coroa também liga)
pub(crate) static mut TICK: i32 = 0;
pub(crate) static mut GRACE: i32 = 0;
pub(crate) static mut ARRIV: i32 = 0; // tick de chegada no andar: o nome do piso anuncia-se

// ---- menu inicial ----
pub(crate) static mut MENU_SEL: u8 = 0; // cursor: 0 = INICIAR, 1 = CONTROLES
pub(crate) static mut SCHEME: u8 = 0;   // modo de teclas: 0 = WASD, 1 = SETAS
pub(crate) static mut START_REQ: u8 = 0; // menu pediu "Iniciar": o JS semeia o novo jogo

// ---- escolha de andar (o konami das controles, aberta pela RT) ----
pub(crate) static mut KONAMI_I: usize = 0; // progresso do código (0..10; 0 = novo)
pub(crate) static mut KONSEL: u8 = 0; // cursor da tela de escolha (0..7 = andar 1..8)

pub(crate) static mut SEEDS: [u32; FLOORS] = [0; FLOORS];
pub(crate) static mut MAP: [u8; N_MAX] = [0; N_MAX];
pub(crate) static mut SEEN: [u8; N_MAX * FLOORS] = [0; N_MAX * FLOORS];
pub(crate) static mut VIS: [u8; N_MAX] = [0; N_MAX];
pub(crate) static mut DOORS: [u64; N_MAX * FLOORS / 64] = [0; N_MAX * FLOORS / 64];

pub(crate) static mut PX: usize = 0;
pub(crate) static mut PY: usize = 0;
pub(crate) static mut BX: usize = 0;
pub(crate) static mut BY: usize = 0;
pub(crate) static mut BST: u8 = B_PATROL;
pub(crate) static mut BTICK: i32 = 0;
pub(crate) static mut LX: usize = 0; // última posição conhecida do jogador
pub(crate) static mut LY: usize = 0;
pub(crate) static mut NX: usize = 0; // alvo de investigação (ruído)
pub(crate) static mut NY: usize = 0;
pub(crate) static mut LOITER: i32 = 0;
pub(crate) static mut MOVED: bool = false;
pub(crate) static mut LD: usize = 0; // última direção de patrulha
pub(crate) static mut CFREEZE: i32 = 0; // atordoamento do basilisco ao pegar a coroa

// ---- novo sistema: passada, fôlego, escombro e patrulha por salas ----
pub(crate) static mut CSNEAK: bool = false; // passada silenciosa VÁLIDA neste tick
pub(crate) static mut SNEAKP: u32 = 0;      // cadência do meio-passo (move a cada 2 ticks)
pub(crate) static mut STAM: i32 = STAM_MAX; // fôlego
pub(crate) static mut NOISEL: u8 = 0;       // nível de ruído emitido neste tick (HUD: 0..3)
pub(crate) static mut RH: i32 = 0;          // prova fresca de escombro (timer): ela pode entrar
pub(crate) static mut ROOMT: usize = 0;     // sala-alvo da patrulha
pub(crate) static mut RTX: usize = 0;       // alvo de sala materializado (tile caminhável)
pub(crate) static mut RTY: usize = 0;
pub(crate) static mut PLOITER: i32 = 0;     // farejando a sala atual
pub(crate) static mut LOX: usize = 0;       // alvo da farejada atual (varre de propósito)
pub(crate) static mut LOY: usize = 0;
pub(crate) static mut EAR_CD: i32 = 0;      // "tempo de escuta": ruídos fracas não a acordam
// rastro de salas do jogador: ela caça ONDE VOCÊ ESTEVE — o passado cheira
pub(crate) static mut PHIST: [i32; 6] = [-1; 6];
pub(crate) static mut PHT: [i32; 6] = [0; 6];
pub(crate) static mut PH_HEAD: usize = 0;

// rastro do corpo: [0] = comprimento; depois pares (x, y), o mais recente primeiro
pub(crate) static mut BODYBUF: [u8; BODY_MAX * 2 + 1] = [0; BODY_MAX * 2 + 1];
pub(crate) static mut EV_CD: i32 = 0; // cooldown do evento "corpo visível"

// ---- medo e loucura ----
pub(crate) static mut FEAR: i32 = 0;     // 0..FEAR_MAX
pub(crate) static mut FEAR_PK: i32 = 0;  // pico histórico do medo — o trauma se mede por ele
pub(crate) static mut AMBF: i32 = 0;     // pavor ambiente acumulado (monótono na run)
pub(crate) static mut AMBT: i32 = 0;     // contador entre +1 de pavor ambiente
pub(crate) static mut CALM: i32 = 0;     // ticks consecutivos sem exposição
pub(crate) static mut DECAYT: i32 = 0;   // acumulador da queda lenta

// ---- alucinações (mentiras do RT: só existem no GRID de render) ----
pub(crate) static mut PH_ON: [bool; 4] = [false; 4]; // fantasmas 'o' — nunca no MAP/SEEN
pub(crate) static mut PH_X: [u8; 4] = [0; 4];
pub(crate) static mut PH_Y: [u8; 4] = [0; 4];
pub(crate) static mut PH_TTL: [i32; 4] = [0; 4];
pub(crate) static mut PH_O: [i32; 4] = [0; 4];       // cadência do passeio (anda 1 tile a cada 3-4)
pub(crate) static mut PH_FADE: [i32; 4] = [0; 4];    // >0: evaporando por N ticks
pub(crate) static mut FB_ON: bool = false;           // falso basilisco — breca paredes, pace de caça
pub(crate) static mut FB_X: usize = 0;
pub(crate) static mut FB_Y: usize = 0;
pub(crate) static mut FB_TTL: i32 = 0;
pub(crate) static mut FB_O: i32 = 0;
pub(crate) static mut FB_FADE: i32 = 0;
pub(crate) static mut PC_ON: bool = false;           // coroa-fantasma: estática, some ao se aproximar
pub(crate) static mut PC_X: usize = 0;
pub(crate) static mut PC_Y: usize = 0;
pub(crate) static mut PC_TTL: i32 = 0;
pub(crate) static mut PC_FADE: i32 = 0;
pub(crate) static mut PH_CD: i32 = 0;                // cooldown entre spawns de alucinação
pub(crate) static mut PANIC_CD: i32 = 0;             // cadência do vislumbre-fantasma no pânico

pub(crate) static mut DMAP: [u16; N_MAX] = [0; N_MAX];
pub(crate) static mut QUEUE: [u16; N_MAX] = [0; N_MAX];

// barra de UI (dica contextual + nome do andar): 1 linha fixa do viewport,
// composta pelo JS sobre a última linha da tela — segue a câmera no esgoto
pub(crate) static mut UIROW: [u8; W0 * 2] = [0; W0 * 2];
pub(crate) static mut R32: u32 = 1;

// ---- sibilo próximo (produtor: basilisk.rs · consumidor: JS, evento 22) ----
pub(crate) static mut SIB_T: i32 = -(SIB_MAX_MS / TICK_MS); // último sopro (tick); começa no fundo: entrar no raio dispara na hora
pub(crate) static mut R_SIB: u32 = 1;  // xorshift PRÓPRIO do sibilo: a fala dela não desgasta o rng do mundo

// ---- o pulso do fragmento (produtor: fear.rs · consumidor: JS, evento 24) ----
pub(crate) static mut HEART_T: i32 = 0; // ticks até o próximo pulso; 0 = bate já
pub(crate) static mut R_HEART: u32 = 1; // xorshift PRÓPRIO do pulso: o SEU coração também não
                                        // desgasta o rng do mundo (mesma seção do sibilo)

// ---- diff de render: produtor Rust (ui.rs: diff_pass dentro de render()),
// consumidor JS (pfb_diff_ptr/pfb_diff_ack) — a comparação byte-a-byte que
// antes vivia em web/game.js nasceu aqui, ao lado do grid que muda ----
// Layout de DIFF (227 bytes, contrato ABI — mudou layout, muda doc no mesmo
// commit):
//   [0]  flags — bit0 = repinte integral (câmera/andar/tela mudaram);
//   [1]  camX, [2] camY — canto superior esquerdo da janela corrente;
//   [3..227] bitmap: bit si = célula de TELA si mudou [ch,attr] desde o
//          último pfb_diff_ack (OR de todos os renders entre acks; sticky).
pub(crate) static mut DIFF: [u8; 227] = [0; 227];
// cópia do viewport 56×32 (células [ch,attr]) diffrado por último
pub(crate) static mut DIFF_PREV: [u8; W0 * H0 * 2] = [0; W0 * H0 * 2];
// último STATE/DEPTH diffrado (0xFF = nunca: o primeiro render pede full)
pub(crate) static mut DIFF_ST: u8 = 0xFF;
pub(crate) static mut DIFF_DP: u8 = 0xFF;

// [DEBUG] espelho do estado da IA, atualizado a cada tick (leitura pelo smoke)
pub(crate) static mut AI_DBG: [usize; 8] = [0; 8];
pub(crate) static mut AI_DBG_FEAR: [usize; 5] = [0; 5]; // [FEAR, nível, n fantasmas, fake B, coroa falsa]

pub(crate) static mut ROOMS: [i32; 64] = [0; 64]; // x0,y0,x1,y1 × 16
pub(crate) static mut RN: usize = 0;
