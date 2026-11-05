// Teste headless: título, cenários de morte, IA e um playthrough completo via BFS.
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../web/wasm/castle_of_basilisk.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const w = instance.exports;
const N_MAX = 88 * 48; // pior caso do grid (Bocarra Diabólica)
let Wd = 56, Hd = 32;    // dims do andar atual (stats[16]/[17])

let gview = null, mview = null, lastViewKey = -1;
function ensureViews() {
  const key = stats[16] | (stats[17] << 8) | (stats[2] << 16);
  if (key === lastViewKey && grid) return;
  lastViewKey = key;
  Wd = stats[16]; Hd = stats[17];
  grid = new Uint8Array(w.memory.buffer, w.pfb_grid_ptr(), Wd * Hd * 2);
  wmap = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), Wd * Hd);
}

w.pfb_init();
const stats = new Uint8Array(w.memory.buffer, w.pfb_stats_ptr(), 32);
let grid = null;
let wmap = null;
ensureViews();

function dump(label) {
  console.log(`\n=== ${label} ===`);
  for (let y = 0; y < Hd; y++) {
    let row = '';
    for (let x = 0; x < Wd; x++) {
      const ch = grid[(y * Wd + x) * 2];
      row += ch === 0xA7 ? '§' : String.fromCharCode(ch);
    }
    console.log('|' + row + '|');
  }
}

let evSeen = {};
function pump() {
  let e;
  while ((e = w.pfb_pop_event()) !== 0) evSeen[e] = (evSeen[e] || 0) + 1;
  ensureViews();
  checkBody();
}

// o corpo ('~', attr 0x0B) ficou visível em tela em algum momento do teste
let bodySeen = false;
function checkBody() {
  if (stats[0] !== 1 || bodySeen) return;
  for (let i = 0; i < Wd * Hd; i++) {
    if ((grid[i * 2 + 1] & 0x7f) === 0x0B) { bodySeen = true; return; }
  }
}

// ---------- 1. título ----------
dump('TITLE');
if (stats[0] !== 0) { console.error('FAIL: title state'); process.exit(1); }

// ---------- 1b. menu do título (navegar, controles, voltar, iniciar) ----------
let menuOk;
{
  const M = { up: 1, down: 2, left: 4, right: 8, ok: 16, back: 64 };
  // cursor > N O GRID: mover para baixo tem que redesenhar (roda render())
  const gt0 = grid[(21 * Wd + 22) * 2] === 0x3E;         // '>' na linha de INICIAR
  w.pfb_menu(M.down);
  const gt1 = grid[(23 * Wd + 21) * 2] === 0x3E          // '>' passou p/ CONTROLES
           && grid[(21 * Wd + 22) * 2] !== 0x3E;         // ... e sumiu de INICIAR
  const navig = stats[14] === 1 && stats[0] === 0;      // cursor em CONTROLES
  w.pfb_menu(M.ok);
  const ctrl = stats[0] === 4;                          // tela de controles
  w.pfb_menu(M.right);
  const mode = stats[15] === 1;                         // modo SETAS
  w.pfb_menu(M.back);
  const back = stats[0] === 0;                          // ESC volta
  w.pfb_menu(M.up);                                     // cursor de volta a INICIAR
  w.pfb_menu(M.ok);                                     // confirmar INICIAR
const startReq = stats[13] === 1 && stats[0] === 0;   // pedido publicado
  w.pfb_new_game(999);
  const consumed = stats[0] === 1 && stats[13] === 0;   // JS semeou e limpou
  menuOk = gt0 && gt1 && navig && ctrl && mode && back && startReq && consumed;
  console.log(menuOk
    ? 'PASS - menu do título (navegar/controles/voltar/iniciar)'
    : 'FAIL - menu do título');
}

// ---------- 2. cenários de morte/alerta ----------
function findCell(pred) {
  for (let y = 1; y < Hd - 1; y++)
    for (let x = 1; x < Wd - 1; x++) {
      const p = w.pfb_debug_probe(x, y);
      if (pred(p, x, y)) return { x, y, p };
    }
  return null;
}

// todas as células que passam no pred (cenários de geometria varrem
// candidatos até um que complete a janela sem despertar o olhar dela)
function findCells(pred) {
  const out = [];
  for (let y = 1; y < Hd - 1; y++)
    for (let x = 1; x < Wd - 1; x++) {
      const p = w.pfb_debug_probe(x, y);
      if (pred(p, x, y)) out.push({ x, y, p });
    }
  return out;
}

// preenchimento BFS de rota a partir de um tile (métrica do jogo: paredes e
// pilares importam) — os cenários de decaída precisam posicionar ELA fora do
// alcance que a patrulha cobre na janela do teste
function bfsFill(from) {
  const m = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), Wd * Hd);
  const D = new Int32Array(Wd * Hd).fill(-1);
  const q = [[from.x, from.y]];
  D[from.y * Wd + from.x] = 0;
  while (q.length) {
    const [x, y] = q.shift();
    const d = D[y * Wd + x];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd) continue;
      const j = ny * Wd + nx;
      if (D[j] !== -1) continue;
      const t = m[j];
      if (t === 35 || t === 48) continue; // parede/pilar
      D[j] = d + 1;
      q.push([nx, ny]);
    }
  }
  return D;
}
function place(x, y) { w.pfb_debug_place(x, y); }

// tríade pilar-piso: coluna com piso claro em ambos os lados. Com
// `pfb_debug_bas_place`, dá geometria DETERMINÍSTICA aos cenários de IA:
// pilar no meio bloqueia o LOS, a rota em volta dele fica curta (ouvido claro
// é raio 5 de ROTA, não chebyshev) e a morte por proximidade fica fora de
// alcance (d<=4 só mata com LOS; d<=2 sem LOS). O palácio do térreo tem
// colunata em todo salão — sempre existe.
function pillarPair() {
  const m = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), Wd * Hd);
  for (let y = 2; y < Hd - 2; y++)
    for (let x = 1; x < Wd - 1; x++) {
      if (m[y * Wd + x] !== 48) continue; // pilar
      const t = (xx, yy) => m[yy * Wd + xx];
      if (t(x, y - 1) === 46 && t(x, y - 2) === 46 && t(x, y + 1) === 46 && t(x, y + 2) === 46)
        return { player: { x, y: y - 2 }, bas: { x, y: y + 1 } };
    }
  return null;
}

// rota 4-dir no mapa cru (portas contam como abertas): é a métrica que o
// jogo usa para AUDIR ruído (paredes e pilares importam, não chebyshev)
function routeDist(from, to) {
  const m = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), Wd * Hd);
  const seen = new Uint8Array(Wd * Hd);
  const q = [[from.x, from.y, 0]];
  seen[from.y * Wd + from.x] = 1;
  while (q.length) {
    const [x, y, d] = q.shift();
    if (x === to.x && y === to.y) return d;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd) continue;
      const j = ny * Wd + nx;
      if (seen[j]) continue;
      const t = m[j];
      if (t === 35 || t === 48) continue; // parede/pilar
      seen[j] = 1;
      q.push([nx, ny, d + 1]);
    }
  }
  return 1 / 0;
}

function scenario(name, fn) {
  w.pfb_new_game(1234567);
  const r = fn();
  console.log(`${r ? 'PASS' : 'FAIL'} - ${name}`);
  return r;
}

// 2a. olhar mútuo → morte (motivo 1) — aquece 15 ticks para passar o GRACE.
// O olhar dela é DIRECIONADO: célula tem que estar dentro do cone (bit3).
const gaze = scenario('gaze mata (O OLHAR TE ENCONTROU)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  // regra real de morte: d<=4 com LOS e (cone OU d<=2 — nas costas colada mata)
  const c = findCell((p) => {
    const d = (p >> 2) & 63;
    return (p & 1) && (p & 2) && d >= 2 && d <= 4 && (d <= 2 || ((p >> 8) & 1));
  });
  if (!c) return false;
  place(c.x, c.y);
  w.pfb_step(0); pump();
  return stats[0] === 2 && stats[1] === 1;
});

// 2b. toque → morte (motivo 2)
const touch = scenario('toque mata (AS ESCAMAS)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const c = findCell((p) => (p & 1) && ((p >> 2) === 1));
  if (!c) return false;
  place(c.x, c.y);
  w.pfb_step(0); pump();
  return stats[0] === 2 && stats[1] === 2;
});

// 2c. ruído → IA investiga. Geometria dona do teste: ela do outro lado de um
// pilar (sem LOS) e o passo escolhido por ROTA <= 4, dentro do ouvido claro
// de raio 5 e fora do horizonte de morte (d<=4 com LOS, d<=2 sem).
const alert = scenario('ruído acorda IA (EV_ALERT -> INVEST)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const pair = pillarPair();
  if (!pair) return false;
  w.pfb_debug_bas_place(pair.bas.x, pair.bas.y);
  place(pair.player.x, pair.player.y);
  const m = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), Wd * Hd);
  const dirs = [[-1, 0, 4], [1, 0, 8], [0, -1, 1], [0, 1, 2]];
  let bit = 0;
  for (const [dx, dy, b] of dirs) {
    const tx = pair.player.x + dx, ty = pair.player.y + dy;
    const t = m[ty * Wd + tx];
    if (t !== 46) continue; // passo em terra clara: raio de ouvido 5
    if (routeDist({ x: tx, y: ty }, pair.bas) <= 4) { bit = b; break; }
  }
  if (!bit) return false;
  const sx = stats[3], sy = stats[4];
  w.pfb_step(bit);
  if (stats[3] === sx && stats[4] === sy) return false; // o passo não afetou
  pump();
  return stats[7] === 1 && !!evSeen[10];
});

// 2d. o rastro: cada passo dela deixa escamas para trás. Dona da geometria:
// ela no salão, jogador longe — 60 ticks de patrulha obrigam a andar de
// verdade (na nova planta o spawn natural pode formar prowl em cima do
// spawn do jogador e paralisá-la).
const trail = scenario('o corpo dela deixa rastro de escamas', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 60; k++) { w.pfb_step(0); pump(); }
  // ela no salão DEPOIS do aquecimento: o aquecimento muda onde a patrulha
  // a deixa — o teste comanda a geometria a partir do estado imóvel
  const pair = pillarPair();
  if (!pair) return false;
  w.pfb_debug_bas_place(pair.bas.x, pair.bas.y);
  const far = findCell((p) => (p & 1) && ((p >> 2) >= 12));
  if (!far) return false;
  place(far.x, far.y);
  for (let k = 0; k < 60; k++) { w.pfb_step(0); pump(); }
  const body = new Uint8Array(w.memory.buffer, w.pfb_debug_body_ptr(), 49);
  const len = body[0];
  if (len < 1 || len > 24) return false;
  const hx = stats[5], hy = stats[6];
  for (let k = 0; k < len; k++) {
    const x = body[1 + k * 2], y = body[2 + k * 2];
    if (x >= Wd || y >= Hd) return false;
  }
  // invariante real: o par MAIS RECENTE (a célula que a cabeça ACABOU de
  // deixar) jamais é a posição atual — o render também pula essa sobreposição
  if (body[1] === hx && body[2] === hy) return false;
  // fim do rastro (último par) tem que ser posição diferente do primeiro (ela andou)
  const fx = body[1], fy = body[2];
  const lx = body[1 + (len - 1) * 2], ly = body[2 + (len - 1) * 2];
  return fx !== lx || fy !== ly;
});

// ---------- 2e. medo: exposição sobe, AUSÊNCIA desce (devagar) ----------
const fear = scenario('medo: sobe com exposição, desce LONGE dela (histerese)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const pair = pillarPair();
  if (!pair) return false;
  w.pfb_debug_bas_place(pair.bas.x, pair.bas.y); // ela no salão: LOS de 6-8 existe
  // tile com LOS dela a 6..8: exposição média (ganho 3/tick). FORA do cone
  // dela: o cenário mede o medo de VER, não de ser visto (o que viraria caça)
  const near = findCell((p) => {
    const d = (p >> 2) & 63;
    return (p & 1) && (p & 2) && d >= 6 && d <= 8 && !((p >> 8) & 1);
  });
  if (!near) return false;
  place(near.x, near.y);
  let f0 = stats[18];
  for (let k = 0; k < 3; k++) { w.pfb_step(0); pump(); if (stats[0] !== 1) return false; }
  const f1 = stats[18];
  if (f1 <= f0) return false; // subiu (com LOS médio)
  // foge para longe (d >= 14, sem relevância de LOS): começa a queda lenta.
  // A ausência que decai não pode ser interrompida pela patrulha cruzando o
  // LOS: recolocamos ELA numa rota >= 20 do esconderijo — a patrulha cobre
  // <= 10 tiles em 60 ticks, e mesmo assim a visão dele alcança só 8.
  const far = findCell((p) => (p & 1) && ((p >> 2) >= 14));
  if (!far) return false;
  place(far.x, far.y);
  const D = bfsFill(far);
  let hide = null;
  for (let i = 0; i < D.length && !hide; i++) if (D[i] >= 20) hide = { x: i % Wd, y: (i / Wd) | 0 };
  if (hide) w.pfb_debug_bas_place(hide.x, hide.y);
  else return false; // sem esconderijo longe o bastante, o cenário falha honestamente
  for (let k = 0; k < 60; k++) { w.pfb_step(0); pump(); if (stats[0] !== 1) return false; }
  const f2 = stats[18];
  return f2 < f1; // caiu — e o ritmo LENTO é o ponto: não zera num tick só
});

// ---------- 2f. alucinações nascem conforme o nível ----------
const haunt = scenario('alucinações: pânico gera fantasmas/falso B em tela', () => {
  w.pfb_new_game(1234567);
  const fptr = w.pfb_debug_fear_ptr();
  const fdv = new DataView(w.memory.buffer, fptr, 20);
  const nGhosts = () => fdv.getUint32(8, true);  // AI_DBG_FEAR[2]
  const fakeBOn = () => fdv.getUint32(12, true); // AI_DBG_FEAR[3]
  let sawGhost = false, sawFake = false;
  for (let k = 0; k < 400 && !(sawGhost && sawFake); k++) {
    // re-injeta: mantém o nível 3 (o trauma sozinho segura só até metade do pico)
    if (k % 25 === 0) w.pfb_debug_fear(80);
    w.pfb_step(0); pump();
    if (stats[0] !== 1) return false;
    w.pfb_debug_fear_ptr(); // atualiza o espelho do fantasma antes de ler
    if (nGhosts() > 0) sawGhost = true;
    if (fakeBOn() > 0) sawFake = true;
  }
  return sawGhost && sawFake;
});

// ---------- 2g. O TOPO NÃO MATA: medo em 100 é teatro, não morte ----------
const collapse = scenario('o medo NUNCA mata: 100 sustenta o caos, sem morte (e decai)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const far = findCell((p) => (p & 1) && ((p >> 2) >= 14)); // sem ela por perto
  if (!far) return false;
  place(far.x, far.y);
  w.pfb_debug_fear(100); // o COLAPSO, forçado
  for (let k = 0; k < 240; k++) { w.pfb_step(0); pump(); if (stats[0] !== 1) return false; }
  // 240 ticks parado longe: do teto (98+) sangrou só até a cicatriz (~50,
  // metade do pico), vivo todo instante — o drama mora na travessia, não na
  // lápide
  return stats[18] <= 100 && stats[18] >= 30 && stats[18] < 100;
});

// ---------- 2g-bis. freio do limiar: a subida final cansa ----------
// Sem o freio, 80 + (+3/tick) chega a 100 (colapso) em 7 ticks: o jogador
// morre atravessando os efeitos em vez de vendo-os. O freio (72+: metade,
// 86+: um quarto) estica a subida para uns 16+ ticks — tempo de o mundo
// inteiro quebrar na tela antes de apagar.
const brake = scenario('freio do limiar: perto do 100, a subida cansa', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const pair = pillarPair();
  if (!pair) return false;
  w.pfb_debug_bas_place(pair.bas.x, pair.bas.y); // LOS 6-8 garantida no salão  // candidatos de exposição média FORA do cone: um que a patrulha não faça
  // cruzar a face dela na janela (o pico de ELA TE VIU não é o medo do freio,
  // é outro sistema — então o cenário varre, com jogo LIMPO a cada candidato)
  const cands = findCells((p) => {
    const d = (p >> 2) & 63;
    return (p & 1) && (p & 2) && d >= 6 && d <= 8 && !((p >> 8) & 1);
  });
  for (const near of cands) {
    w.pfb_new_game(1234567); // estado limpo: a caçada de um candidato não vaza no outro
    for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
    w.pfb_debug_bas_place(pair.bas.x, pair.bas.y);
    place(near.x, near.y);
    w.pfb_debug_fear(80);
    for (let k = 0; k < 10; k++) {
      w.pfb_step(0); pump();
      if (stats[0] !== 1) break; // morreu? candidato inválido, próximo
    }
    if (stats[0] === 1 && stats[18] < 95) return true; // 10 ticks expostos e ainda <95
  }
  return false;
});

// ---------- 2h. trauma: METADE do pico NUNCA decai ----------
// O design diz "o susto fica preso no corpo": depois de um pico 60, o medo
// desce até 30 e PARA — a cicatriz acompanha você até o fim da run (assombrado,
// não condenado: escapar de uma caçada não é sentença de morte).
const trauma = scenario('medo: o pico deixa cicatriz (nunca cai de metade)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const far = findCell((p) => (p & 1) && ((p >> 2) >= 14));
  if (!far) return false;
  place(far.x, far.y);
  w.pfb_debug_fear(60); // um quase-morte: pico 60
  for (let k = 0; k < 200; k++) { w.pfb_step(0); pump(); if (stats[0] !== 1) return false; }
  return stats[18] >= 30; // 200 ticks calmo depois: em 30 — ficou preso
});

// ---------- 2h-bis. o topo só avança pelo que você VÊ ----------
// Susto miúdo (creep: d<=3 sem LOS +2/tick) não empurra o topo: no 90+, nenhum
// sinal sim preço sobe o medo — só a VISÃO dela move a descida final. Parado
// longe, o medo até cai.
const sightOnly = scenario('freio do limiar: susto miudo nao empurra o topo', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const far = findCell((p) => (p & 1) && ((p >> 2) >= 14)); // sem creep, sem visão
  if (!far) return false;
  place(far.x, far.y);
  w.pfb_debug_fear(90);
  for (let k = 0; k < 50; k++) { w.pfb_step(0); pump(); if (stats[0] !== 1) return false; }
  return stats[18] <= 90; // 50 ticks sem vê-la: não subiu um ponto — e decaindo
});

// ---------- 2i. pavor ambiente: o lugar sobe o medo sozinho ----------
// Sem vê-la UMA vez, parado longe: o medo rasteja até o teto da profundidade.
const ambient = scenario('pavor ambiente: longe dela, o medo rasteja sozinho', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const far = findCell((p) => (p & 1) && ((p >> 2) >= 14));
  if (!far) return false;
  place(far.x, far.y);
  const f0 = stats[18];
  for (let k = 0; k < 340; k++) { w.pfb_step(0); pump(); if (stats[0] !== 1) return false; }
  return stats[18] >= 6 && stats[18] > f0; // teto ambiente do térreo, sem exposição
});

// ---------- 2i-bis. tensão no CALMO: sussurro sem evidência nenhuma ----------
// No nível 0 nada visual acontece — mas o sussurro raro chega: a paranoia
// começa ANTES do medo ter corpo. (Determinístico: o tick cruza 1/240.)
const calmWhisper = scenario('calmo: sussurro raro, medo nenhum (paranoia nasce antes)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const far = findCell((p) => (p & 1) && ((p >> 2) >= 14));
  if (!far) return false;
  place(far.x, far.y);
  const w0 = evSeen[18] || 0;
  for (let k = 0; k < 300; k++) { w.pfb_step(0); pump(); if (stats[0] !== 1) return false; }
  return (evSeen[18] || 0) > w0 && stats[18] < 30; // nível calmo, mas o ouvido já mente
});

// ---------- 2j. sibilo próximo: a fala dela nasce no RT (evento 22) ----------
// A decisão (quando sopra, se cala de propósito, períodos por coroa/medo)
// migrou de web/game.js para basilisk.rs — o gate agora VERIFICA os dois
// lados: (a) dentro do raio, EV_SIBILO chega (janela de 24 ticks: 2
// tentativas do período, silêncio proposital de 38%); (b) FORA do raio,
// evento 22 com d > 6 é o gate do raio quebrado. A checagem usa a posição
// PÓS-TURNO (stats logo após o pfb_step): é a mesmíssima que o sibilo_tick
// usou para decidir — ela pode cruzar o raio NO tick (d pré > 6, d pós <= 5),
// e isso é fala legítima; o que é regressão é falar com d pós > 6.
//
// GEOMETRIA COMANDADA, POR DESIGN (ver ARCHITECTURE §3.3): o teleporte
// discreto (não ticka o jogo) só existirá porque ela raramente re-entra no
// raio por passeio natural numa janela curta — a fidelidade da cadência vem
// da distribuição por seed (40 tentativas), não do passeio orgânico.
const sib = scenario('sibilo próximo: fala DENTRO do raio, silêncio FORA (evento 22)', () => {
  let sibOK = false, fora = 0;
  for (let attempt = 1; attempt <= 40 && !sibOK; attempt++) {
    w.pfb_new_game(1000 + attempt * 7919);
    for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); } // aquecimento
    if (stats[0] !== 1) continue;
    // pousa ela (teletransporte discreto, não ticka) em CÉLULA a 3 tiles do jogador
    const px = stats[3], py = stats[4];
    const cheb = (x, y) => Math.max(Math.abs(x - px), Math.abs(y - py));
    let spot = null;
    for (let y = 1; y < Hd - 1 && !spot; y++)
      for (let x = 1; x < Wd - 1 && !spot; x++) {
        if (w.pfb_debug_probe(x, y) & 1 && cheb(x, y) === 3) spot = { x, y };
      }
    if (!spot) continue;
    w.pfb_debug_bas_place(spot.x, spot.y);
    let prev = evSeen[22] || 0, dentro = 0;
    for (let k = 0; k < 24; k++) {
      w.pfb_step(0); pump();
      if (stats[0] !== 1) break;
      const d = Math.max(Math.abs(stats[5] - stats[3]), Math.abs(stats[6] - stats[4]));
      const now = evSeen[22] || 0;
      if (now > prev) {
        if (d > 6) { fora += now - prev; } else { dentro += now - prev; }
        prev = now;
      }
    }
    if (stats[0] === 1 && dentro > 0) sibOK = true;
  }
  return sibOK && fora === 0;
});

// ---------- 2k. diff de render: a máscara nasce no Rust ----------
// O diff byte-a-byte que era do JS (prevGrid) agora é produzido em
// render() (ui.rs): bitmap de células de TELA mudadas + full flag + câmera.
const renderDiff = scenario('diff de render: bitmap nasce no RT, zera no ack', () => {
  w.pfb_new_game(1234567);
  const dp = new Uint8Array(w.memory.buffer, w.pfb_diff_ptr(), 227);
  w.pfb_step(16); pump(); // esperar: o andar vivo (ela ronda, rastro, dica) marca células
  let any = false;
  for (let k = 3; k < 227; k++) if (dp[k]) { any = true; break; }
  w.pfb_diff_ack(); // o "frame" consumiu: flags + bitmap zeram
  const cleared = dp[0] === 0 && dp.every((b, i) => (i >= 3 ? b === 0 : true));
  // a câmera publicada respeita as bordas DO VIEWPORT (o clamp nasceu no RT):
  // camX <= W-56 e camY <= H-32 — atrás disso era bound tautológico
  // (< stats[16] jamais falha dado o clamp); no andar 56x32: só o 0
  const camOk = dp[1] <= stats[16] - 56 && dp[2] <= stats[17] - 32;
  return any && cleared && camOk;
});

// ---------- 2l. contrato do diff: bitmap == byte-a-byte real ----------
// A PINTURA em canvas vive no navegador (não há teste headless dela), mas o
// CONTRATO do glue sim: emulação do "prevGrid" que morreu — a máscara do
// Rust tem que ser EXATAMENTE as células de TELA cujo [ch,attr] mudou desde
// o último consumo, e bit0 tem que significar janela/andar/tela mudou.
// 120 passos por tentativa (movimento, porta, rastro dela, escada);
// teleporte nenhum aqui — o teste come HONESTO o passeio natural.
const diffContract = scenario('contrato do diff: bitmap == byte-a-byte real (120 passos)', () => {
  const VWX = 56, VHX = 32;
  for (let attempt = 1; attempt <= 8; attempt++) {
    w.pfb_new_game(987654 + attempt * 7919);
    ensureViews();
    w.pfb_diff_ack(); // baseline limpo: acompanha só o que vier a partir daqui
    const dp = new Uint8Array(w.memory.buffer, w.pfb_diff_ptr(), 227);
    // snapshot inicial: o viewport JÁ composição pelo new_game (o diff dele
    // tinha que caber no ack acima)
    let snap = null;
    snap = { camX: dp[1], camY: dp[2], w: Wd, h: Hd, depth: stats[2], b: new Uint8Array(VWX * VHX * 2) };
    const read = (sx, x, y, b) => { // copia células [ch,attr] do viewport para o snapshot
      const wi = (b.camY + ((sx / VWX) | 0)) * b.w + b.camX + (sx % VWX);
      b.b[sx * 2] = grid[wi * 2]; b.b[sx * 2 + 1] = grid[wi * 2 + 1];
    };
    for (let sx = 0; sx < VWX * VHX; sx++) read(sx, 0, 0, snap);
    let steps = 0, bad = 0, bits = 0;
    for (let k = 0; k < 120; k++) {
      w.pfb_step([0, 16, 1, 2, 4, 8][k % 6]); pump();
      if (stats[0] !== 1) break;
      ensureViews();
      steps++;
      const full = (dp[0] & 1) !== 0;
      const changedWin = snap.camX !== dp[1] || snap.camY !== dp[2]
        || snap.w !== Wd || snap.h !== Hd || snap.depth !== stats[2];
      // bit0 <=> janela/andar mudou (a telha de estado acompanha DEPTH aqui:
      // STATE sai do jogo = break acima)
      if (full !== changedWin) bad++;
      if (!full) {
        for (let si = 0; si < VWX * VHX; si++) {
          const wi = (dp[2] + ((si / VWX) | 0)) * Wd + dp[1] + (si % VWX);
          const same = grid[wi * 2] === snap.b[si * 2] && grid[wi * 2 + 1] === snap.b[si * 2 + 1];
          const bit = (dp[3 + (si >> 3)] & (1 << (si & 7))) !== 0;
          if (bit) bits++;
          if (bit === same) { bad++; break; }
        }
      }
      // confirma o consumo EXATAMENTE como o glue pintaria: snapshot do frame
      const fresh = { camX: dp[1], camY: dp[2], w: Wd, h: Hd, depth: stats[2], b: new Uint8Array(VWX * VHX * 2) };
      for (let sx = 0; sx < VWX * VHX; sx++) read(sx, 0, 0, fresh);
      snap = fresh;
      w.pfb_diff_ack();
    }
    if (steps >= 60 && bad === 0 && bits > 0) return true;
  }
  return false;
});

// ---------- 3. playthrough com bot v2 ----------
// Bot "surdo" (pior caso: humano tem o coração/áudio como aviso prévio).
// Estratégia: rota BFS que evita a zona de perigo (LOS ≤9 ou dist ≤3),
// replanejamento periódico, esquiva geométrica com eixo travado e
// desvio do tile quando já está parado sobre o alvo.
const pass = (i) => {
  const t = wmap[i];
  return t === 0x2E || t === 0x2C || t === 0x3E || t === 0x3C || t === 0x2B || t === 0xA7 || t === 0x3D || t === 0xA5 || t === 0xB6; // 0x3D = água '=' · 0xA5 = caveira '¥' · 0xB6 = corpo '¶' (bocarra)
};
// portais (>, <, §) são INTERAÇÕES: só pisável se é o alvo do plano —
// senão o bot atravessa um '<' sem querer e sobe de andar
const isStair = (i) => { const t = wmap[i]; return t === 0x3E || t === 0x3C || t === 0xA7; };
function stepOk(i, target) { return !isStair(i) || i === target; }
function findTile(t) { for (let i = 0; i < Wd * Hd; i++) if (wmap[i] === t) return i; return -1; }

let dangerMemo = null;
function danger(x, y) {
  const i = y * Wd + x;
  if (dangerMemo[i] === undefined) {
    const p = w.pfb_debug_probe(x, y);
    dangerMemo[i] = ((p & 2) !== 0 && (p >> 2) <= 9) || (p >> 2) <= 3;
  }
  return dangerMemo[i];
}
function bfsRoute(target, avoid) {
  const start = stats[3] + stats[4] * Wd;
  if (!pass(target)) return null;
  const prev = new Int32Array(Wd * Hd).fill(-1);
  const q = [start]; prev[start] = start;
  let reached = false;
  for (let qh = 0; qh < q.length && !reached; qh++) {
    const c = q[qh];
    if (c === target) { reached = true; break; }
    const cx = c % Wd, cy = (c / Wd) | 0;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd) continue;
      const ni = ny * Wd + nx;
      if (prev[ni] !== -1 || !pass(ni)) continue;
      if (!stepOk(ni, target)) continue; // não atravessar portais por acidente
      if (avoid && danger(nx, ny)) continue;
      prev[ni] = c; q.push(ni);
    }
  }
  if (!reached) return null;
  const cells = [];
  let c = target;
  while (c !== start) { cells.push(c); c = prev[c]; }
  return cells.reverse();
}
function dirBit(d) {
  if (d.dy < 0) return 1;
  if (d.dy > 0) return 2;
  if (d.dx < 0) return 4;
  if (d.dx > 0) return 8;
  return 0;
}
const dirTo = (from, to) => dirBit({ dx: (to % Wd) - (from % Wd), dy: ((to / Wd) | 0) - ((from / Wd) | 0) });

// esquiva geométrica: foge no eixo de afastamento; eixo travado evita zigzag
let fleeAxisWasX = null;
function dodge(target) {
  const bx = stats[5], by = stats[6], px = stats[3], py = stats[4];
  const dxs = px - bx;
  const dys = py - by;
  const sx = dxs === 0 ? 0 : Math.sign(dxs);
  const sy = dys === 0 ? 0 : Math.sign(dys);
  const domX = Math.abs(dxs) >= Math.abs(dys);
  const prefX = fleeAxisWasX === null ? domX : fleeAxisWasX;
  const walk = (dx, dy) => {
    const nx = px + dx, ny = py + dy;
    if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd) return false;
    const ni = ny * Wd + nx;
    return pass(ni) && stepOk(ni, target);
  };
  const opts = [];
  if (sx !== 0) opts.push([sx, 0]);
  if (sy !== 0) opts.push([0, sy]);
  if (sx === 0) { opts.push([1, 0]); opts.push([-1, 0]); } // mesma coluna: lateral
  if (sy === 0) { opts.push([0, 1]); opts.push([0, -1]); } // mesma linha: lateral
  if (prefX) opts.reverse();
  for (const [dx, dy] of opts) {
    if (walk(dx, dy)) {
      fleeAxisWasX = dy === 0;
      return { dx, dy };
    }
  }
  return null; // os dois eixos travados: imóvel
}

wmap = new Uint8Array(w.memory.buffer, wmap.byteOffset, wmap.length); // re-sincroniza

let playthroughOK = false, attempts = 0, deathReasons = {};
// decoração por andar: masmorra (grades '|' e caveiras '¥', poças rasas no d3)
// e BOCARRA (corpos '¶', caveiras '¥' e água '=' do acervo — contadas só a
// partir do andar 6, pois a própria masmorra usa '¥' nas celas)
const dec = { bars: 0, skull: 0, shallow3: 0, sawD3: false, corpse: 0, caveWater: 0, sawCave: false, caveSkull: 0 };
let lastDepth = -1;
while (attempts < 40 && !playthroughOK) {
  attempts++;
  w.pfb_new_game(1000 + attempts * 7919);
  let steps = 0; let won = false;
  let route = null, rIdx = 0, lastTarget = -1, recalcAt = 0;
  fleeAxisWasX = null;
  while (steps < 9000 && stats[0] === 1) {
    ensureViews(); // dims/views do andar atual (pode ter descido/subido no tick anterior)
    if (stats[2] !== lastDepth) {
      lastDepth = stats[2];
      for (let i = 0; i < Wd * Hd; i++) {
        const ch = wmap[i];
        if (ch === 0x7C) dec.bars++;           // grade '|'
        if (ch === 0xA5) dec.skull++;          // caveira '¥'
        if (ch === 0x3D && stats[2] === 3) dec.shallow3++; // poça rasa no andar 3
        if (stats[2] === 3) dec.sawD3 = true;
        if (ch === 0xB6 && stats[2] >= 6) dec.corpse++;   // corpo '¶' do acervo
        if (ch === 0xA5 && stats[2] >= 6) dec.caveSkull++; // caveira '¥' do acervo
        if (ch === 0x3D && stats[2] >= 6) dec.caveWater++; // água úmida da caverna
        if (stats[2] >= 6) dec.sawCave = true;
      }
    }
    steps++;
    let target;
    if (stats[8] === 1) target = findTile(0x3C);       // com coroa: sempre '<'
    else if (stats[2] < 8) target = findTile(0x3E);    // sem coroa: desce (8 andares)
    else target = findTile(0xA7);                      // andar 8: a coroa no acervo
    if (target < 0) break;

    const pos0 = stats[3] + stats[4] * Wd;
    if (target === pos0) {
      // já está sobre o alvo (ex.: emergiu do '<' no térreo): passo fora
      const px = stats[3], py = stats[4];
      let stepped = false;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd) continue;
        if (pass(ny * Wd + nx)) {
          w.pfb_step(dirBit({ dx, dy }));
          stepped = true;
          break;
        }
      }
      if (!stepped) break;
      pump();
      if (stats[0] !== 1) break;
      if (stats[0] === 3) { won = true; break; }
      continue;
    }

    // (re)planeja periodicamente — o basilisco anda
    if (target !== lastTarget || steps >= recalcAt || route === null) {
      dangerMemo = new Array(Wd * Hd);
      route = bfsRoute(target, true) || bfsRoute(target, false);
      rIdx = 0;
      lastTarget = target;
      recalcAt = steps + 6;
    }
    if (route === null || route.length === 0) break;
    const pos = stats[3] + stats[4] * Wd;
    if (pos === route[rIdx]) rIdx++;
    if (rIdx >= route.length) break;
    const nxt = route[rIdx];

    const basDist = w.pfb_debug_probe(stats[3], stats[4]) >> 2;
    const hunted = stats[7] === 2;
    const stepP = w.pfb_debug_probe(nxt % Wd, (nxt / Wd) | 0);
    const stepDanger = (stepP & 2) !== 0 && (stepP >> 2) <= 8;

    let mvBit;
    if ((hunted && basDist <= 9) || stepDanger) {
      const dg = dodge(target);
      mvBit = dg ? dirBit(dg) : dirTo(pos, nxt); // sem saída: segue o plano
    } else {
      mvBit = dirTo(pos, nxt);
    }
    w.pfb_step(mvBit);
    pump();
    if (stats[0] === 2) { deathReasons[stats[1]] = (deathReasons[stats[1]] || 0) + 1; break; }
    if (stats[0] === 3) { won = true; break; }
  }
  if (won) { playthroughOK = true; console.log(`PASS - playthrough (tentativa ${attempts}, ${steps} steps)`); }
}
if (!playthroughOK) console.log(`FAIL - playthrough: ${attempts} tentativas, mortes:`, deathReasons);
dump('FLOOR no fim do playthrough (depth=' + stats[2] + ', state=' + stats[0] + ')');

// ---------- 3b. masmorra decorada: grades, caveiras e poças ----------
// A planta toda passa pelas masmorras no playthrough: a decoração da cela
// (grades '|', caveiras '¥' nas abertas) e as poças rasas do andar fundo
// têm que existir EM TELA pelo menos uma vez na passagem.
const dungeonDecor = playthroughOK && dec.bars > 0 && dec.skull > 0 && dec.sawD3 && dec.shallow3 > 0;
console.log(dungeonDecor
  ? `PASS - masmorra decorada (grades=${dec.bars}, caveiras=${dec.skull}, poças d3=${dec.shallow3})`
  : `FAIL - masmorra decorada (grades=${dec.bars}, caveiras=${dec.skull}, poças d3=${dec.shallow3}, sawD3=${dec.sawD3})`);

// ---------- 3b-bis. bocarra decorada: úmida e cheia do acervo ----------
// A BOCARRA (6-8) tem que entregar o LUGAR: corpos '¶' trazidos pela criatura
// em massa, caveiras em pilha, água '=' da umidade — e a passagem do bot de
// verdade por lá (limiares generosos: a randagem varia por seed, a ESCALA é
// reada — perto de 300 ossos/carne nos três andares somados)
const caveDecor = playthroughOK && dec.sawCave && dec.corpse > 80 && dec.caveSkull > 120 && dec.caveWater > 0;
console.log(caveDecor
  ? `PASS - bocarra decorada (corpos ¶=${dec.corpse}, caveiras do acervo=${dec.caveSkull}, água=${dec.caveWater})`
  : `FAIL - bocarra decorada (corpos ¶=${dec.corpse}, caveiras=${dec.caveSkull}, água=${dec.caveWater}, sawCave=${dec.sawCave})`);

// ---------- 3b-ter. a pista não contada ----------
// A DENSIDADE do acervo cresce rumo à coroa: no andar 8, longe do Ferro
// (d>=25) o chão é mais osso que pedra não; a 10 tiles dela (d<=10) o monte
// domina. A cerca entregue é IMAGEM — a mecânica nenhum a dita (regra das
// pílulas). pfb_debug_floor pula o bot direto a fundo e a planta fala.
const pista = scenario('a pista não contada: o acervo se empilha rumo à coroa', () => {
  w.pfb_new_game(1234567);
  w.pfb_debug_floor(8);
  if (stats[0] !== 1) return false;
  ensureViews();
  let crown = -1;
  for (let i = 0; i < Wd * Hd; i++) if (wmap[i] === 0xA7) { crown = i; break; }
  if (crown < 0) return false;
  const cx = crown % Wd, cy = (crown / Wd) | 0;
  const acervo = (t) => t === 0xA5 || t === 0xB6;
  const chao = (t) => t === 0x2E || acervo(t) || t === 0x3D; // candidatos do piso
  let nearC = 0, nearT = 0, farC = 0, farT = 0;
  for (let i = 0; i < Wd * Hd; i++) {
    if (!chao(wmap[i])) continue;
    const d = Math.abs((i % Wd) - cx) + Math.abs(((i / Wd) | 0) - cy);
    if (d <= 10) { nearT++; if (acervo(wmap[i])) nearC++; }
    else if (d >= 25) { farT++; if (acervo(wmap[i])) farC++; }
  }
  if (nearT < 30 || farT < 60) return false; // janela pequena demais: honesto
  const nearD = nearC / nearT, farD = farC / farT;
  return nearD >= 0.65 && farD <= 0.40 && nearD > farD * 1.8;
});


// ---------- 3a-bis. regressão: a tela de morte nos esgotos ----------
// Bug real: a tela de morte compunha no stride do andar ATUAL (80 colunas no
// esgoto), mas o JS fora de jogo lê o grid como viewport 56x32 — rasgava em
// diagonal. Descer até os Canais e morrer lá tem que reportar dims 56x32.
let deadUi = false;
{
  for (let attempt = 1; attempt <= 40 && !deadUi; attempt++) {
    w.pfb_new_game(7000 + attempt * 7919);
    let steps = 0, onSewer = false;
    while (steps < 9000 && stats[0] === 1) {
      ensureViews();
      steps++;
      dangerMemo = new Array(Wd * Hd).fill(); // memo de perigo expira por andar
      let target;
      if (stats[2] < 4) {
        target = findTile(0x3E); // desce até o esgoto (floor 4)
      } else {
        onSewer = true;
        target = stats[5] + stats[6] * Wd; // e vai DE ENCONTRO a ela: morrer lá
      }
      if (target < 0) break;
      const pos = stats[3] + stats[4] * Wd;
      let mvBit = 0;
      if (target !== pos) {
        const route = onSewer
          ? bfsRoute(target, false)
          : (bfsRoute(target, true) || bfsRoute(target, false));
        if (!route || !route.length) break;
        mvBit = dirTo(pos, route[0]);
      }
      w.pfb_step(mvBit); pump();
      if (stats[0] !== 1) break;
      if (onSewer && stats[2] !== 4) onSewer = false; // subiu de volta
    }
    if (onSewer && stats[0] === 2) {
      const ok = stats[16] === 56 && stats[17] === 32;
      console.log(`  morte no esgoto (tentativa ${attempt}, motivo ${stats[1]}): dims ${stats[16]}x${stats[17]} -> ${ok ? 'OK' : 'QUEBRADO'}`);
      deadUi = ok;
    }
  }
}
console.log(deadUi
  ? 'PASS - morte nos Canais: tela de morte compõe 56x32'
  : 'FAIL - morte nos Canais: tela de morte');

// ---------- 3c. coroa-fantasma: nasce longe, evapora ao chegar perto ----------
// A mentira mais cruel (ideia da sessão de design): uma § a 8-14 tiles que
// some a d<=2. Na bancada ela nunca nascia (0/40 jogos) — o teste trava o
// regresso: nível 2 sustentado tem que produzi-la, e chegar perto a desmascara.
let crownOK = false;
{
  w.pfb_new_game(1234567);
  const fdv = new DataView(w.memory.buffer, w.pfb_debug_fear_ptr(), 20);
  const crownOn = () => { w.pfb_debug_fear_ptr(); return fdv.getUint32(16, true) > 0; };
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  const far = findCell((p) => (p & 1) && ((p >> 2) >= 14));
  if (far) place(far.x, far.y);
  // exploração prévia: o jogador REAL já viu o andar antes de enlouquecer.
  // A coroa-fantasma só nasce em tile LEMBRADO (SEEN) — sem isso o cenário
  // nunca a produz (mapa virgem). Teleportes apenas computam FOV, não tickam.
  for (let y = 2; y < Hd - 2; y += 5) {
    for (let x = 2; x < Wd - 2; x += 7) {
      if (w.pfb_debug_probe(x, y) & 1) place(x, y);
    }
  }
  if (far) place(far.x, far.y); // volta ao ponto de espera
  const vanishC0 = evSeen[21] || 0;
  // nível 2 sustentado (re-injeta; o trauma sozinho segura só até metade)
  let born = false;
  for (let k = 0; k < 900 && !born; k++) {
    if (k % 25 === 0) w.pfb_debug_fear(60);
    w.pfb_step(0); pump();
    if (stats[0] !== 1) break;
    born = crownOn();
  }
  if (born) {
    // acha a § no GRID (andar 1 não tem coroa REAL: só pode ser a mentira)
    ensureViews();
    let pc = -1;
    for (let i = 0; i < Wd * Hd; i++) if (grid[i * 2] === 0xA7) { pc = i; break; }
    if (pc >= 0) {
      // caminha até ela: a d<=2 a coroa-fantasma desmascara (EV_VANISH_C)
      const pos = () => stats[3] + stats[4] * Wd;
      for (let s = 0; s < 240 && stats[0] === 1 && (evSeen[21] || 0) === vanishC0; s++) {
        if (pc === pos()) break;
        dangerMemo = new Array(Wd * Hd);
        const route = bfsRoute(pc, true) || bfsRoute(pc, false);
        if (!route || !route.length) break;
        w.pfb_step(dirTo(pos(), route[0])); pump();
      }
      for (let s = 0; s < 6 && crownOn(); s++) { w.pfb_step(0); pump(); } // fade termina
      crownOK = (evSeen[21] || 0) > vanishC0 && !crownOn();
    }
  }
  console.log(crownOK
    ? 'PASS - coroa-fantasma: nasce longe, evapora ao chegar perto'
    : 'FAIL - coroa-fantasma');
}

// ---------- 3b. vislumbre determinístico do corpo ----------
// O corpo é efêmero em tela; se os cenários/playthrough não o revelaram,
// procura uma célula com LOS a 3..6 da cabeça e coloca o jogador lá.
if (!bodySeen) {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 40; k++) { w.pfb_step(0); pump(); }
  outer:
  for (let x = 1; x < Wd - 1; x++) {
    for (let y = 1; y < Hd - 1; y++) {
      const p = w.pfb_debug_probe(x, y);
      const d = p >> 2;
      if ((p & 2) === 0 || d < 3 || d > 8) continue;
      w.pfb_debug_place(x, y); // render + FOV imediatos
      for (let i = 0; i < Wd * Hd; i++) {
        if ((grid[i * 2 + 1] & 0x7f) === 0x0B) { bodySeen = true; break outer; }
      }
    }
  }
}

// ---------- 4. fuzz bruto anti-trap ----------
let traps = 0;
try {
  for (let t = 0; t < 6000; t++) {
    w.pfb_step([0, 1, 2, 4, 8, 16][(Math.random() * 6) | 0]);
    checkBody();
    if (stats[0] === 2 || stats[0] === 3) w.pfb_new_game(4242 + t);
  }
} catch (err) { traps++; console.error('TRAP fuzz:', err); }
console.log(traps === 0 ? 'PASS - fuzz 6000 ticks sem trap' : 'FAIL - fuzz');

const bodyProof = bodySeen || !!(evSeen[14] || evSeen[15] || evSeen[16]);
console.log(bodyProof
  ? 'PASS - corpo ficou visível em tela em algum momento (vislumbre OK)'
  : 'FAIL - corpo nunca ficou visível em tela');

console.log('\neventos vistos:', evSeen);
const all = [gaze, touch, alert, trail, playthroughOK, dungeonDecor, caveDecor, pista, deadUi, bodyProof, traps === 0, menuOk, fear, haunt, collapse, brake, trauma, sightOnly, ambient, calmWhisper, crownOK, sib, renderDiff, diffContract].every(Boolean);
console.log(all ? 'SMOKE OK' : 'SMOKE FAILED');
process.exit(all ? 0 : 1);
