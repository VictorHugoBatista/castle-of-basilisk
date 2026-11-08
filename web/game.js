// Castle of Basilisk — glue JS: render (diff que o RUST produz), WebAudio
// sintetizado, loop de ticks. WASM ABI crua: lemos grid/stats/diff direto da memória exportada.

// viewport fixo da tela (câmera desliza por cima de mapas maiores)
const VW = 56, VH = 32, CELL_W = 12, CELL_H = 18;
const TICK_MS = 140;

// ---- bits de input (mesmos do WASM) ----
const IN_UP = 1, IN_DOWN = 2, IN_LEFT = 4, IN_RIGHT = 8, IN_WAIT = 16;
const IN_SNEAK = 32, IN_RUN = 64;

// ---- paletas por tema (mesmos índices de attr; o tema troca a referência) ----
const PAL_CASTLE = [
  '#6b4400', // 0 piso
  '#a87000', // 1 parede
  '#4a3400', // 2 sombra ,
  '#c98a00', // 3 porta +
  '#ffdd66', // 4 escadas (pulsa)
  '#ffe08a', // 5 coroa § (pulsa)
  '#ffd54d', // 6 jogador @
  '#ff2e00', // 7 basilisco B
  '#b57b00', // 8 UI
  '#ff5000', // 9 alerta
  '#ffb000', // 10 título
  '#bf1600', // 11 corpo do basilisco ~
  '#54421c', // 12 escombro %
  '#201500',
  '#c4b080', // 14 fantasma alucinação 'o' (pálido, ambar lavado)
  '#0a0600', // 15 vazio
];
const PAL_DUNGEON = [
  '#4d4304', '#7d6c10', '#38300a', '#9a8a1a', '#fff6a0', '#ffe08a', '#e8d25a',
  '#ff2e00', '#7a6a20', '#ff5000', '#a08a20', '#bf1600', '#3f3618',
  '#201500', '#b0a890', '#050300', // 14 = fantasma
];
const PAL_SEWER = [
  '#3e5228', // 0 piso (lodo)
  '#5d7a34', // 1 parede (pedra úmida)
  '#263215', // 2 sombra
  '#7d9a44', // 3 porta (raro, de pedra)
  '#cfe088', // 4 escadas
  '#ffe08a', // 5 coroa
  '#c3d667', // 6 jogador
  '#ff2e00', // 7 basilisco
  '#57603a', // 8 UI
  '#ff5000', // 9 alerta
  '#a8b25a', // 10 título
  '#bf1600', // 11 corpo
  '#43502a', // 12 escombro
  '#4a6a3a', // 13 água '=' (waves próprias em colorFor)
  '#8a9a7a', '#030500', // 14 = fantasma (lodo pálido) · 15 vazio
];
const PAL_CAVE = [
  '#3a2f26', // 0 piso (rocha úmida do acervo)
  '#5c4a36', // 1 parede (pedra respirando água)
  '#221b14', // 2 sombra
  '#6f5738', // 3 porta (não existe na Bocarra, mas a paleta é uma)
  '#d8caa0', // 4 escadas
  '#ffe08a', // 5 coroa
  '#cdbf9d', // 6 jogador (pálido acendido do acervo)
  '#ff2e00', // 7 basilisco
  '#4a3d2e', // 8 UI
  '#ff5000', // 9 alerta
  '#8a7a4a', // 10 título
  '#bf1600', // 11 corpo
  '#9a9178', // 12 osso: '¥' caveira e '¶' corpo do acervo
  '#1f3a42', // 13 água '=' (escura e fria — a umidade de 30 m de rio por cima)
  '#b0a890', '#060403', // 14 = fantasma · 15 vazio
];
const PAL_BY_THEME = [PAL_CASTLE, PAL_DUNGEON, PAL_SEWER, PAL_CAVE];
let PAL = PAL_CASTLE;
const WATER_ATTR = 13;
const GHOST_ATTR = 14; // 'o': as mentiras do RT (alucinações do medo)
const PULSE_ATTRS = new Set([4, 5, 7]);
// attrs "vivos": a cor respira no tempo (pulso/blink de attr, onda de lodo,
// fantasma pálido) — repintam TODO frame independente do diff (que compara
// bytes; cor viva não muda byte nenhum)
const ANIM_ATTRS = new Set([4, 5, 7, 9, 13, 14]);
const BLINK_ATTR = 9;
const DIM_FLAG = 0x80;

// ============================================================
// boot
// ============================================================
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
ctx.font = 'bold 15px monospace';
ctx.textBaseline = 'middle';

const res = await fetch('./wasm/castle_of_basilisk.wasm', { cache: 'reload' }); // nunca serve wasm velho após rebuild
const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
const w = instance.exports;
w.pfb_init();

// STATS: 32 bytes — [18] medo (0..100), [19] nível (0..4). O WASM publica o
// bloco; os [0..17] seguem idênticos ao contrato antigo (mudança aditiva).
const stats = new Uint8Array(w.memory.buffer, w.pfb_stats_ptr(), 32);
const N_MAX = w.pfb_max_n();
const grid = new Uint8Array(w.memory.buffer, w.pfb_grid_ptr(), N_MAX * 2);
const uirow = new Uint8Array(w.memory.buffer, w.pfb_ui_ptr(), VW * 2);
// ---- HUD inferior: a placa mora no CANTO INFERIOR ESQUERDO, encostada na
// ÚLTIMA linha (junto do texto). Ela é TODA desenhada dentro do canvas,
// com margem própria — 100% visível, nada corta nem sobrepõe. O TEXTO da
// dica fica no espaço que SOBRA à direita dela na barra de UI: cabe →
// alinhado à esquerda; não cabe → rola em letreiro. A placa é de largura
// DINÂMICA: sem item ela abraça só a coluna dos medidores; com item abre
// pra caber a coluna de quadros (e o SEPARADOR — o vão entre as colunas —
// só existe quando há algo carregado). A largura VIVA sai do hudW(): o
// render do texto e a própria placa leem a MESMA verdade.
const HUD_X = 2, HUD_H = 46, HUD_MARGIN = 2;
const HUD_W_BASE = 46; // placa sem item: ruído/fôlego/medo (margens de 5px)
const HUD_W_ITEM = 72; // com coluna de itens: + vão 10, quadro 16 e folga 5
function hudW() {
  return (stats[8] === 1 || stats[20] === 1) ? HUD_W_ITEM : HUD_W_BASE;
}
const mapview = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), N_MAX); // tiles do andar
// DIFF: o diferencial de render nasce no RUST (diff_pass no fim de render()):
// [0] flags (bit0 = repinte integral), [1] camX, [2] camY, [3..227] bitmap de
// células de TELA mudadas (sticky: os bits somam até o frame chamar
// pfb_diff_ack())
const diffView = new Uint8Array(w.memory.buffer, w.pfb_diff_ptr(), 227);

// ---- câmera: mapa do andar atual (stats[16]/[17]) desliza sob a viewport ----
// camX/camY NÃO se calculam aqui mais: nascem no RT (DIFF[1]/[2], o clamp
// fica lá onde o jogador mora); estas variáveis só leem
let MWd = VW, MHd = VH;
let camX = 0, camY = 0;

// ============================================================
// áudio sintetizado
// ============================================================
let AC = null;
let master = null;
let sfxBus = null; // SFX: a masmorra abafa tudo (o silêncio é ambiente)
let droneNodes = null;
let echoIn = null; // barramento do eco do castelo vazio
let ambGain = null; // bus da trilha ambiente contínua
let ambNodes = [];
let ambTimer = null;
let ambTheme = -1;
// Bocarra: corpo da "respiração do acervo" (os nós persistem só o tema
// vigente — a troca de trilha zera junto com os ambNodes)
let noiseCaveGain = null;
let noiseCaveFilter = null;
let noiseCaveBreath = -1;
let caveGen = 0; // geração do corpo do ar: corrente de timer velha morre nela

function audioOn() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain();
  master.gain.value = 0.5;
  master.connect(AC.destination);
  sfxBus = AC.createGain();
  sfxBus.gain.value = 1.0;
  sfxBus.connect(master);
  // eco do castelo vazio: DelayNode com feedback curto — passos corridos
  // ecoam pelos corredores de pedra vazia
  echoIn = AC.createGain();
  echoIn.gain.value = 0.9;
  const dly = AC.createDelay(0.5);
  dly.delayTime.value = 0.17;
  const fb = AC.createGain();
  fb.gain.value = 0.33;
  const wet = AC.createGain();
  wet.gain.value = 0.55;
  echoIn.connect(dly);
  dly.connect(fb);
  fb.connect(dly);
  dly.connect(wet);
  wet.connect(master);
  ambGain = AC.createGain();
  ambGain.gain.value = 1;
  ambGain.connect(master);
  startDrone();
}

// tema derivado de DEPTH: 0 castelo · 1 masmorra · 2 esgoto · 3 Bocarra (acervo)
function ambientTheme() {
  const d = stats[2];
  return d <= 1 ? 0 : (d <= 3 ? 1 : (d <= 5 ? 2 : 3));
}

// troca de trilha ao mudar de andar: fade das velhas, arranque das novas
function setAmbience(force) {
  if (!AC) return;
  const th = stats[0] === 1 ? ambientTheme() : (stats[0] === 2 || stats[0] === 3 ? -1 : ambTheme);
  if (th === ambTheme && !force) return;
  ambTheme = th;
  if (ambTimer) { clearTimeout(ambTimer); ambTimer = null; }
  const now = AC.currentTime;
  for (const n of ambNodes) {
    try { n.gain.setTargetAtTime(0, now, 0.4); } catch (e) {}
    setTimeout(() => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} }, 1600);
  }
  ambNodes = [];
  noiseCaveGain = null;
  noiseCaveFilter = null;
  noiseCaveBreath = -1; // a respiração re-agenda na PRÓXIMA visita ao acervo
  caveGen++; // nova geração: qualquer corrente de timer da visita velha morre
  PAL = PAL_BY_THEME[th === -1 ? 0 : th]; // o CRT respira a cor do lugar
  needsFull = true;
  // SFX abafados na masmorra: o silêncio sepulcral contrasta qualquer som
  sfxBus.gain.setTargetAtTime(th === 1 ? 0.7 : 1.0, now, 0.5);
  if (th === 0) {
    // ---- TÉRREO: VENTO — corpo grave de ruído + assobio de fresta, puxado
    // por rajadas irregulares (sem LFO de amplitude periódico: aquilo soava
    // como ondas do mar chegando em intervalo constante) ----
    const g = AC.createGain();
    g.gain.value = 0;

    // buffer de ruído branco em loop (contínuo, sem emenda audível)
    const noiseSrc = () => {
      const buf = AC.createBuffer(1, Math.floor(AC.sampleRate * 4), AC.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const s = AC.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };

    // corpo do vento: ar canalizado grave — lowpass duplo em cascata dá a
    // densidade "marrom" do vento real (em vez do whoosh de bandpass)
    const bodyLo = AC.createBiquadFilter();
    bodyLo.type = 'lowpass';
    bodyLo.frequency.value = 300;
    bodyLo.Q.value = 0.4;
    const bodyHi = AC.createBiquadFilter();
    bodyHi.type = 'lowpass';
    bodyHi.frequency.value = 300;
    bodyHi.Q.value = 0.4;
    const body1 = noiseSrc();
    body1.connect(bodyLo); bodyLo.connect(bodyHi); bodyHi.connect(g);

    // assobio da fresta: faixa fina e aguda, volume baixo, deslizando devagar
    const wl = AC.createBiquadFilter();
    wl.type = 'bandpass';
    wl.frequency.value = 1750;
    wl.Q.value = 7;
    const wG = AC.createGain();
    wG.gain.value = 0.008;
    const wh = noiseSrc();
    wh.connect(wl); wl.connect(wG); wG.connect(g);

    // a fresta "muda de calibre": o assobio deriva de afinação devagar
    const drift = AC.createOscillator();
    drift.frequency.value = 0.05;
    const driftG = AC.createGain();
    driftG.gain.value = 240;
    drift.connect(driftG);
    driftG.connect(wl.frequency);
    drift.start();

    // rajadas irregulares: o vento chega em "feixes" imprevisíveis, duração
    // e espaçamento sorteados — nunca o mesmo intervalo duas vezes
    const gust = () => {
      if (ambTheme !== 0 || !AC) return;
      const t = AC.currentTime;
      const rise = 1.2 + Math.random() * 2.2;   // subida: 1.2-3.4 s
      const fall = 2.5 + Math.random() * 3.5;   // descida: 2.5-6.0 s
      const peak = 520 + Math.random() * 420;   // corpo abre (mais alto)
      const rest = 240 + Math.random() * 110;   // corpo fecha (mais grave)
      const gW = 0.013 + Math.random() * 0.016; // assobio cresce na rajada
      for (const f of [bodyLo, bodyHi]) {
        f.frequency.setTargetAtTime(peak, t, rise * 0.45);
        f.frequency.setTargetAtTime(rest, t + rise + 0.5, fall * 0.5);
      }
      wG.gain.setTargetAtTime(gW, t, rise * 0.45);
      wG.gain.setTargetAtTime(0.006, t + rise + 0.5, fall * 0.5);
      ambTimer = setTimeout(gust, (rise + fall) * 1000 * (0.7 + Math.random() * 0.9));
    };

    ambNodes.push(g, drift, body1, wh);
    g.connect(ambGain); // o vento precisa chegar ao master: sem isso ele toca num nó cego e o térreo fica mudo
    gust();
    g.gain.setTargetAtTime(0.06, now, 3);
  } else if (th === 1) {
    // ---- MASMORRA: SILÊNCIO PERTURBADOR — quase nada; a cada 16-40s um
    // estalo mínimo de madeira/pedra, só para o ouvido ficar tenso ----
    schedSilence();
  } else if (th === 2) {
    // ---- ESCGOTO: GOTEIRAS — ping agudo com eco de cisterna, irregular
    schedDrips();
  } else if (th === 3) {
    // ---- BOCARRA: O ACERVO RESPONDENDO — goteira densa e funda (30 m de
    // rio por cima: o ping chega gordo, com eco de lago) + a RESPIRAÇÃO do
    // acervo: um rumor que sobe e desce a cada 8-20 s, sempre em scheduler
    // irregular — nada de LFO de amplitude periódico (regra do glue). Tudo
    // prende quando ELA caça perto: a caverna guarda o ar
    schedCave();
  }
}

// agendador do silêncio da masmorra: é o que NÃO soa que educa o terror
function schedSilence() {
  if (ambTheme !== 1 || !AC) return;
  ambTimer = setTimeout(() => {
    // estalo mínimo, quase inaudível: pedra/lagem tremendo longe
    blip({ type: 'sawtooth', f0: 62 + Math.random() * 26, f1: 40, dur: 0.5, vol: 0.022 });
    noiseBurst({ dur: 0.4, vol: 0.012, f: 200 + Math.random() * 150, q: 2 });
    schedSilence();
  }, 16000 + Math.random() * 24000);
}

// agendador das goteiras do esgoto; o gotejar para quando ELA caça perto
function schedDrips() {
  if (ambTheme !== 2 || !AC) return;
  ambTimer = setTimeout(() => {
    const hunted = stats[0] === 1 && stats[7] === 2;
    if (!hunted) {
      const drop = () => blip({
        type: 'sine',
        f0: 1400 + Math.random() * 400,
        f1: 460,
        dur: 0.06,
        vol: 0.05,
        out: echoIn,
      });
      drop();
      if (Math.random() < 0.35) { // gota dupla escorrendo
        blip({ type: 'sine', f0: 1100, f1: 420, dur: 0.05, vol: 0.04, delay: 0.11, out: echoIn });
      }
    }
    schedDrips();
  }, 320 + Math.random() * 2600);
}

// agendador da BOCARRA: ping gordo e denso (a caverna é úmida, 30 m abaixo
// do leito) + a RESPIRAÇÃO do acervo — rumor grave que sobe e desce a cada
// 8-20 s, sempre em scheduler irregular. Nada de LFO de amplitude periódico
// (a regra de "ondas do mar" da seção 3 do AGENTS.md vale aqui por inteiro).
// Quando ELA caça perto, tudo emudece: a caverna prende a respiração.
function schedCave() {
  if (ambTheme !== 3 || !AC) return;
  ambTimer = setTimeout(() => {
    const hunted = stats[0] === 1 && stats[7] === 2;
    if (!hunted) {
      // ping denso: 1-2 gotas, f0 mais grave que o do esgoto, eco de lago
      blip({
        type: 'sine',
        f0: 900 + Math.random() * 300,
        f1: 240,
        dur: 0.09,
        vol: 0.055,
        out: echoIn,
      });
      if (Math.random() < 0.28) { // gota dupla escorrendo
        blip({ type: 'sine', f0: 760, f1: 210, dur: 0.07, vol: 0.04, delay: 0.14, out: echoIn });
      }
      if (Math.random() < 0.18) { // gota numa caveira: quase estalo
        noiseBurst({ dur: 0.05, vol: 0.02, f: 2200 + Math.random() * 900, q: 3, out: echoIn });
      }
    }
    schedCave();
  }, 240 + Math.random() * 1700);
  // o corpo do ar (vento + eco + dissonância + a respiração): nasce UMA
  // vez por visita; a troca de tema desliga tudo junto das trilhas velhas
  if (!noiseCaveGain) buildCaveAir();
  if (noiseCaveBreath !== ambTheme) {
    noiseCaveBreath = ambTheme;
    const gen = caveGen; // corrente presa à sua geração de corpo
    const breath = () => {
      if (ambTheme !== 3 || !AC) return;
      setTimeout(() => {
        if (ambTheme !== 3 || !AC || gen !== caveGen) return;
        if (!(stats[0] === 1 && stats[7] === 2) && noiseCaveGain) {
          const t = AC.currentTime;
          const f0 = 130 + Math.random() * 70;
          const peak = 0.020 + Math.random() * 0.014;
          noiseCaveFilter.frequency.setTargetAtTime(f0, t, 1.8);
          noiseCaveGain.gain.setTargetAtTime(peak, t, 1.8);          // inala
          noiseCaveGain.gain.setTargetAtTime(0.004, t + 3.4 + Math.random() * 1.6, 2.6); // expira
        }
        breath(); // agenda a próxima — enquanto a Bocarra respirar, soa
      }, 8000 + Math.random() * 12000);
    };
    breath();
  }
}

// o AR DO ACERVO: construído UMA vez por visita ao tema 3 — o TETO ALTO é
// a morada: (a) vento grave constante, sem LFO de ganho (o corpo do ruído
// é fixo; o único movimento é a respiração, que agenda por si), (b) a boca
// de eco de caverna (delay longo, feedback gordo — o som não acha parede
// nenhuma perto) e (c) a DISSONÂNCIA: dois pares de senoides desafinadas
// cujo BATIMENTO é o desconforto — gain fixo e discreto (a dissonância
// vive da frequência, nunca de amplitude pulsante; mesma regra do vento).
// Passa por caveIn: seco leve + wet do eco. Tudo entra em ambNodes, então
// a troca de tema desfaz o corpo inteiro (o agendador re-monta na volta).
function buildCaveAir() {
  // bus local da caverna: seco + o eco de teto alto de volta ao master
  const caveIn = AC.createGain();
  caveIn.gain.value = 1;
  caveIn.connect(ambGain);
  const echo = AC.createDelay(0.7);
  echo.delayTime.value = 0.38;
  const echoFb = AC.createGain();
  echoFb.gain.value = 0.45;
  const echoWet = AC.createGain();
  echoWet.gain.value = 0.5;
  caveIn.connect(echo);
  echo.connect(echoFb);
  echoFb.connect(echo);
  echo.connect(echoWet);
  echoWet.connect(ambGain);
  ambNodes.push(caveIn, echo, echoFb, echoWet);

  // vento do teto: corpo de ruído constante em lowpass bem grave, com
  // deriva lenta de afinação (o vento muda de calibre, como o do térreo)
  const buf = AC.createBuffer(1, Math.floor(AC.sampleRate * 4), AC.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const wind = AC.createBufferSource();
  wind.buffer = buf;
  wind.loop = true;
  const windLo = AC.createBiquadFilter();
  windLo.type = 'lowpass';
  windLo.frequency.value = 120;
  windLo.Q.value = 0.4;
  const windGain = AC.createGain();
  windGain.gain.value = 0.011;
  wind.connect(windLo);
  windLo.connect(windGain);
  windGain.connect(caveIn);
  const drift = AC.createOscillator();
  drift.frequency.value = 0.03;
  const driftG = AC.createGain();
  driftG.gain.value = 45;
  drift.connect(driftG);
  driftG.connect(windLo.frequency);
  wind.start();
  drift.start();
  ambNodes.push(wind, windLo, windGain, drift, driftG);

  // ---- O VENTO GRANDE (o tamanho das cavernas): corpo gustado à RÉGUA DO
  // TÉRREO (ganho constante ~0.05 = o nível do vento da primeira fase) —
  // sempre POR caveIn: cada onda devolve eco de 0.38 s (é o tamanho da
  // boca que ele acha). Highpass embaixo para o rumble e a dissonância
  // NUNCA ficarem embaixo da brisa; rajadas por scheduler sorteado (nada
  // de LFO de ganho periódico) — o corpo abre até 460-740 Hz e o assobio
  // fino cresce; ELA caçando: a rajada não sai (o corpo fica grave, a
  // caverna prende o ar). Tudo morre com a troca de tema (ambNodes)
  const windBig = AC.createBufferSource();
  windBig.buffer = buf; // mesmo serviço de ruído fonte: leitura independente
  windBig.loop = true;
  const bigHp = AC.createBiquadFilter();
  bigHp.type = 'highpass';
  bigHp.frequency.value = 100;
  const bigLo = AC.createBiquadFilter();
  bigLo.type = 'lowpass';
  bigLo.frequency.value = 260;
  bigLo.Q.value = 0.4;
  const bigGain = AC.createGain();
  bigGain.gain.value = 0.05;
  windBig.connect(bigHp);
  bigHp.connect(bigLo);
  bigLo.connect(bigGain);
  bigGain.connect(caveIn);
  // assobio da caverna: faixa média-fina, quase nada — cresce na rajada
  const bigWhistle = AC.createBiquadFilter();
  bigWhistle.type = 'bandpass';
  bigWhistle.frequency.value = 720;
  bigWhistle.Q.value = 6;
  const bigWg = AC.createGain();
  bigWg.gain.value = 0.004;
  windBig.connect(bigWhistle);
  bigWhistle.connect(bigWg);
  bigWg.connect(caveIn);
  // deriva lenta de afinação: o vento muda de calibre sozinho, entre rajadas
  const drift2 = AC.createOscillator();
  drift2.frequency.value = 0.05;
  const drift2G = AC.createGain();
  drift2G.gain.value = 55;
  drift2.connect(drift2G);
  drift2G.connect(bigLo.frequency);
  windBig.start();
  drift2.start();
  ambNodes.push(windBig, bigHp, bigLo, bigGain, bigWhistle, bigWg, drift2, drift2G);
  // rajadas do vento grande: 5-15 s, sobe/desce a sorte — igual ao vento do
  // térreo (subida 1.0-2.8 s, descida 2.0-4.5 s), mas MAIS grave e sempre
  // com o eco do teto por trás. A corrente carrega a GERAÇÃO do corpo: um
  // vai-e-vem rápido de andar não ressuscita corrente velha (sem dobrar keu)
  const gen = caveGen;
  const gustBig = () => {
    if (ambTheme !== 3 || !AC) return;
    setTimeout(() => {
      if (ambTheme !== 3 || !AC || gen !== caveGen) return;
      if (noiseCaveGain === null) return; // corpo morto: remonta na volta
      if (!(stats[0] === 1 && stats[7] === 2)) { // ELA caçando: sem rajada
        const t = AC.currentTime;
        const rise = 1.0 + Math.random() * 1.8;
        const fall = 2.0 + Math.random() * 2.5;
        const peak = 460 + Math.random() * 280;
        bigLo.frequency.setTargetAtTime(peak, t, rise * 0.45);
        bigLo.frequency.setTargetAtTime(260, t + rise + 0.5, fall * 0.5);
        const wG = 0.009 + Math.random() * 0.007;
        bigWg.gain.setTargetAtTime(wG, t, rise * 0.45);
        bigWg.gain.setTargetAtTime(0.004, t + rise + 0.5, fall * 0.5);
      }
      gustBig();
    }, 5000 + Math.random() * 10000);
  };
  gustBig();

  // dissonância: o par grave bate devagar (~5/s — o ar "não afina"), o par
  // agudo bate rápido (~18/s — o chiado que coça o ouvido). Ganhos ínfimos
  for (const [f, v] of [[82, 0.006], [87.3, 0.006], [1740, 0.0022], [1758, 0.0022]]) {
    const o = AC.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const dg = AC.createGain();
    dg.gain.value = v;
    o.connect(dg);
    dg.connect(caveIn);
    o.start();
    ambNodes.push(o, dg);
  }

  // a respiração (que já existia) mora no bus da caverna agora: de lá ela
  // ganha o eco do teto junto com todo o resto do ar
  const buf2 = AC.createBuffer(1, Math.floor(AC.sampleRate * 4), AC.sampleRate);
  const ch2 = buf2.getChannelData(0);
  for (let i = 0; i < ch2.length; i++) ch2[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource();
  src.buffer = buf2;
  src.loop = true;
  noiseCaveFilter = AC.createBiquadFilter();
  noiseCaveFilter.type = 'lowpass';
  noiseCaveFilter.frequency.value = 150;
  noiseCaveGain = AC.createGain();
  noiseCaveGain.gain.value = 0.004;
  src.connect(noiseCaveFilter);
  noiseCaveFilter.connect(noiseCaveGain);
  noiseCaveGain.connect(caveIn);
  src.start();
  ambNodes.push(src);
}

function startDrone() {
  // fundo: duas ondas graves desafinadas + LFO lento — o "húmido" do castelo
  const g = AC.createGain();
  g.gain.value = 0.028;
  const lp = AC.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 240;
  for (const f of [55, 58.3]) {
    const o = AC.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(lp);
    o.start();
  }
  const lfo = AC.createOscillator();
  lfo.frequency.value = 0.09;
  const lfoG = AC.createGain();
  lfoG.gain.value = 0.012;
  lfo.connect(lfoG);
  lfoG.connect(g.gain);
  lfo.start();
  lp.connect(g);
  g.connect(master);
  droneNodes = g;
}

// blip genérico: oscilador + envelope + pan opcional
function blip({ type = 'square', f0 = 600, f1 = null, dur = 0.08, vol = 0.12,
                delay = 0, pan = 0, out = null }) {
  if (!AC) return;
  const t0 = AC.currentTime + delay;
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = g;
  if (pan !== 0 && AC.createStereoPanner) {
    const p = AC.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    node = p;
  }
  o.connect(g);
  node.connect(out || sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noiseBurst({ dur = 0.3, vol = 0.15, f = 3000, q = 2, delay = 0, pan = 0, out = null }) {
  if (!AC) return;
  const t0 = AC.currentTime + delay;
  const len = Math.floor(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource();
  src.buffer = buf;
  const bp = AC.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f;
  bp.Q.value = q;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = g;
  if (pan !== 0 && AC.createStereoPanner) {
    const p = AC.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    node = p;
  }
  src.connect(bp); bp.connect(g);
  node.connect(out || sfxBus);
  src.start(t0);
}

// sons por evento (mesmos IDs do WASM)
function playEvent(ev, pan) {
  switch (ev) {
    case 1: { // passo: intensidade pelo medidor (stats[10]); o chão decide o timbre:
      // água respinga, ossuário do acervo estala (crack), carne do acervo
      // aperta e esborracha (mush molhado), chão seco é o clique de sempre
      const lvl = stats[10];
      const under = mapview[stats[3] + stats[4] * MWd];
      const onWater = under === 0x3D;  // T_WATER sob os pés
      const onBone = under === 0xA5;   // caveira '¥' do acervo
      const onCorpse = under === 0xB6; // corpo '¶' do acervo
      if (lvl === 1) {
        // silencioso: quase nada — um toque de dedo no chão
        if (onBone) blip({ type: 'square', f0: 520, f1: 300, dur: 0.02, vol: 0.014 });
        else if (onCorpse) blip({ type: 'sine', f0: 150, f1: 90, dur: 0.04, vol: 0.02 });
        else if (onWater) blip({ type: 'sine', f0: 640, f1: 260, dur: 0.05, vol: 0.03, out: echoIn });
        else blip({ type: 'square', f0: 460, dur: 0.02, vol: 0.018 });
      } else if (lvl === 3) {
        // corrida: bota batendo + eco a preencher o corredor vazio — e no
        // acervo, o osso FRATURA e a carne ESBORRACHA alto (o ruído
        // mecânico nasce já no WASM: correr nesses tiles entrega você)
        if (onBone) {
          // craque duplo: a costela cede e rola
          blip({ type: 'square', f0: 700, f1: 200, dur: 0.04, vol: 0.13, out: echoIn });
          noiseBurst({ dur: 0.05, vol: 0.11, f: 2800, q: 2.5, out: echoIn });
          noiseBurst({ dur: 0.04, vol: 0.07, f: 2200 + Math.random() * 500, q: 3, delay: 0.07, out: echoIn });
        } else if (onCorpse) {
          // mush molhado: a massa cede, o grude estopa e escorre
          blip({ type: 'sine', f0: 300, f1: 50, dur: 0.12, vol: 0.13, out: echoIn });
          noiseBurst({ dur: 0.12, vol: 0.11, f: 480, q: 0.8, out: echoIn });
          noiseBurst({ dur: 0.08, vol: 0.08, f: 320, q: 0.9, delay: 0.06, out: echoIn });
        } else if (onWater) {
          noiseBurst({ dur: 0.12, vol: 0.12, f: 1100, q: 1.1, out: echoIn });
          blip({ type: 'sine', f0: 820, f1: 180, dur: 0.12, vol: 0.1, out: echoIn });
        } else {
          blip({ type: 'square', f0: 520, dur: 0.05, vol: 0.12, out: echoIn });
          blip({ type: 'sine', f0: 120, f1: 70, dur: 0.1, vol: 0.11 });
        }
      } else {
        // andar: clique seco, bem discreto (respingo curto na água;
        // no acervo, o craque miudo e o grude molhado — sem exagero)
        if (onBone) {
          blip({ type: 'square', f0: 620, f1: 260, dur: 0.03, vol: 0.055, out: echoIn });
          noiseBurst({ dur: 0.03, vol: 0.04, f: 2500 + Math.random() * 500, q: 3 });
        } else if (onCorpse) {
          blip({ type: 'sine', f0: 230, f1: 60, dur: 0.09, vol: 0.07 });
          noiseBurst({ dur: 0.09, vol: 0.055, f: 430, q: 1.0 });
        } else if (onWater) {
          noiseBurst({ dur: 0.06, vol: 0.055, f: 1500, q: 1.4 });
          blip({ type: 'sine', f0: 760, f1: 300, dur: 0.05, vol: 0.055 });
        } else {
          blip({ type: 'square', f0: 700, dur: 0.03, vol: 0.045 });
        }
      }
      break;
    }
    case 2: // você abriu uma porta: rangido de madeira
      blip({ type: 'sawtooth', f0: 190, f1: 110, dur: 0.22, vol: 0.14 });
      noiseBurst({ dur: 0.12, vol: 0.05, f: 900, q: 3 });
      break;
    case 3: // descendo
      blip({ type: 'square', f0: 420, dur: 0.1, vol: 0.12 });
      blip({ type: 'square', f0: 300, dur: 0.1, vol: 0.12, delay: 0.1 });
      blip({ type: 'square', f0: 210, dur: 0.16, vol: 0.12, delay: 0.2 });
      break;
    case 4: // subindo
      blip({ type: 'square', f0: 210, dur: 0.1, vol: 0.12 });
      blip({ type: 'square', f0: 330, dur: 0.1, vol: 0.12, delay: 0.1 });
      blip({ type: 'square', f0: 460, dur: 0.16, vol: 0.12, delay: 0.2 });
      break;
    case 5: // ELA TE VIU: stinger rasgado
      blip({ type: 'sawtooth', f0: 950, f1: 130, dur: 0.4, vol: 0.3 });
      blip({ type: 'sawtooth', f0: 955, f1: 127, dur: 0.4, vol: 0.2, delay: 0.03 });
      noiseBurst({ dur: 0.18, vol: 0.12, f: 2400, q: 1.5 });
      break;
    case 6: // a coroa e sua: sino feio, duplo
      blip({ type: 'sine', f0: 1174, dur: 0.5, vol: 0.16 });
      blip({ type: 'sine', f0: 1760, dur: 0.6, vol: 0.11, delay: 0.07 });
      blip({ type: 'triangle', f0: 175, f1: 160, dur: 0.5, vol: 0.18, delay: 0.05 });
      break;
    case 7: // morte: baque grave + estática
      blip({ type: 'sine', f0: 110, f1: 28, dur: 0.9, vol: 0.45 });
      noiseBurst({ dur: 0.5, vol: 0.2, f: 300, q: 0.7, delay: 0.05 });
      break;
    case 8: // vencer: arpejo de fuga
      [523, 659, 784, 1047].forEach((f, i) =>
        blip({ type: 'square', f0: f, dur: 0.16, vol: 0.13, delay: i * 0.12 }));
      break;
    case 10: // ela ouviu algo: 'toc' surdo longe
      blip({ type: 'square', f0: 180, f1: 120, dur: 0.14, vol: 0.16, pan });
      break;
    case 11: // ela perdeu você: expiração de alívio
      blip({ type: 'triangle', f0: 320, f1: 150, dur: 0.35, vol: 0.09 });
      break;
    case 12: // sibilância distante: chiado filtrado panlado
      noiseBurst({ dur: 0.7, vol: 0.07, f: 3200, q: 4, pan });
      break;
    case 13: // A BESTA rasgou uma porta: madeira crocante
      noiseBurst({ dur: 0.25, vol: 0.14, f: 700, q: 1.2, pan });
      blip({ type: 'sine', f0: 90, f1: 60, dur: 0.2, vol: 0.2, delay: 0.05, pan });
      break;
    case 14: // escamas visíveis: arrasto grave de pedra (centro)
      bodyRumble(0);
      break;
    case 15: // escamas à esquerda
      bodyRumble(-0.8);
      break;
    case 16: // escamas à direita
      bodyRumble(0.8);
      break;
    case 17: // ofego: o fôlego dos esforços inclementes
      noiseBurst({ dur: 0.09, vol: 0.055, f: 480, q: 1.3 });
      noiseBurst({ dur: 0.08, vol: 0.04, f: 640, q: 1.5, delay: 0.13 });
      break;
    case 18: { // EV_WHISPER: bafarra da mente — sussurro sem fonte, pan sorteado
      const ph = (Math.random() - 0.5) * 1.4;
      noiseBurst({ dur: 0.45, vol: 0.055, f: 760 + Math.random() * 240, q: 7, pan: ph });
      blip({ type: 'triangle', f0: 590 + Math.random() * 130, f1: 170, dur: 0.35, vol: 0.035, pan: ph });
      break;
    }
    case 19: { // EV_WHELP: soluço involuntário — o corpo trai o medo
      noiseBurst({ dur: 0.12, vol: 0.05, f: 420, q: 2.2 });
      blip({ type: 'sine', f0: 165, f1: 105, dur: 0.12, vol: 0.05 });
      break;
    }
    case 20: // EV_VANISH: alucinação evaporou de perto — "exalação" invertida
      blip({ type: 'sine', f0: 180, f1: 540, dur: 0.26, vol: 0.075 });
      noiseBurst({ dur: 0.2, vol: 0.03, f: 1600, q: 3, delay: 0.04 });
      break;
    case 21: { // EV_VANISH_C: a coroa mentiu — sino de sobreposição dissonante
      blip({ type: 'sine', f0: 1174, dur: 0.34, vol: 0.1 });
      blip({ type: 'sine', f0: 1108, dur: 0.45, vol: 0.1, delay: 0.02 }); // batimento áspero
      blip({ type: 'sine', f0: 87, f1: 62, dur: 0.4, vol: 0.12, delay: 0.05 });
      break;
    }
    case 22: { // EV_SIBILO: o sopro DE PERTO — decisão no RT (Rust), som aqui
      // o RT já decidiu QUANDO ela sopra e se cala de propósito; daqui
      // nasce só a voz: vol/pan/brilho pela proximidade
      const dx = stats[5] - stats[3];
      const dy = stats[6] - stats[4];
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const closeness = Math.max(0, Math.min(1, 1 - dist / 7));
      const vol = 0.05 + closeness * 0.16;
      const pan = Math.max(-1, Math.min(1, dx / 6));
      const bright = 3400 + closeness * 2200; // perto = "ssssss" mais agudo e rasante
      // o "ssssss" mesmo: dois sopros emendados — prato de ~2.3s que quase encosta
      // no próximo (de perto soa CONTÍNUO; é o gap dela que te esquenta a nuca)
      noiseBurst({ dur: 1.1, vol, f: bright, q: 1.0, pan });
      noiseBurst({ dur: 1.2, vol: vol * 0.85, f: bright * 1.05, q: 1.0, delay: 0.9, pan });
      // a língua no fim do sopro: ponta "sss" rarefeita e aguda, a boca fechando
      noiseBurst({ dur: 0.7, vol: vol * 0.65, f: bright * 1.7, q: 5, delay: 1.6, pan });
      break;
    }
    case 23: // EV_SHARD: o achado — açoite frio do metal antigo, dissonante e curto
      blip({ type: 'sine', f0: 2620, f1: 1540, dur: 0.16, vol: 0.1 });
      noiseBurst({ dur: 0.06, vol: 0.05, f: 4300, q: 6 });
      break;
    case 24: { // EV_HEART: um pulso do SEU coração — intervalo decidido no RT
      // (heart_tick, pela distância até ela); daqui nasce só o lub-dub.
      // CONTÍNUO no RT: nunca mais devagar que ~1.7s (teto de 12 ticks) —
      // o pulso é batida DE FRENTE do vento, o despertador do castelo.
      // O PEITO É O SOM DO SEU CORPO — NÃO PEDE SUBWOOFER: em laptop o
      // 50-74 Hz fisicamente não sai; o batido que OUVIR EM QUALQUER
      // ALTO-FALANTE mora na banda da pele de tambor (~165-380 Hz — acima
      // do rumble, abaixo do silbo). O sub-senoide fica como tranco para
      // quem tem caixa de verdade. Volume piso 0.13, pico 0.36.
      const dx = stats[5] - stats[3];
      const dy = stats[6] - stats[4];
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const closeness = Math.max(0, Math.min(1, 1 - dist / 24));
      const vol = 0.13 + closeness * 0.23;
      const pan = Math.max(-1, Math.min(1, dx / 8));
      const thump = (delay, v) => {
        // a PELE do batido (o que você OUVIR de fato): baque curto de
        // band-noise na banda da pele de tambor — o ataque que nem a
        // rajada grande engole
        noiseBurst({ dur: 0.05, vol: v * 0.55, f: 380 - closeness * 90, q: 1.2, delay, pan });
        // o CORPO do batido: "bomp" em 168 Hz longe (124 colado) com
        // caída até 72 — a massa que carrega o lub-dub acima do drone
        blip({ type: 'square', f0: 168 - closeness * 44, f1: 72, dur: 0.11, vol: v * 0.5, delay, pan });
        // o TRANCO (para caixas com grave): sub-senoide pesando o chão
        blip({ type: 'sine', f0: 74 - closeness * 24, f1: 28, dur: 0.15, vol: v * 0.8, delay, pan });
      };
      thump(0, vol);
      thump(0.11, vol * 0.6);
      break;
    }
  }
}

// arrastar de escamas sobre pedra: ruído filtrado grave + sub-sine que afunda
function bodyRumble(pan) {
  noiseBurst({ dur: 0.55, vol: 0.11, f: 160, q: 0.8, pan });
  noiseBurst({ dur: 0.3, vol: 0.05, f: 420, q: 1.6, pan, delay: 0.08 });
  blip({ type: 'sine', f0: 65, f1: 40, dur: 0.5, vol: 0.16, pan });
}

// ============================================================
// input
// ============================================================
let held = new Set();
let lastDir = 0;

const KEYMAP = {
  ArrowUp: IN_UP, KeyW: IN_UP,
  ArrowDown: IN_DOWN, KeyS: IN_DOWN,
  ArrowLeft: IN_LEFT, KeyA: IN_LEFT,
  ArrowRight: IN_RIGHT, KeyD: IN_RIGHT,
};
// correr = X ou K, SEMPRE — como WASD e setas coexistem: as duas respondem
// em qualquer modo (Ctrl+W fecharia o navegador, por isso não existe W de corrida).
// Shift é passada silenciosa; correr é "você e o eco contra a pedra".
const RUN_CODES = ['KeyX', 'KeyK'];
const runHeld = new Set(); // por tecla: soltar uma não derruba a corrida da outra

// bits de input das telas de menu (mesmos números do WASM):
// 1 UP, 2 DOWN, 4 LEFT, 8 RIGHT, 16 CONFIRMAR, 64 VOLTAR — e as letras do
// KONAMI: B=32 e A=512. O rastreio do código ↑↑↓↓←→←→B A vive na RT
// (pfb_menu consome os passos certos e abre a ESCOLHA DE ANDAR; o A solto
// nas CONTROLES segue alternando o esquema — comportamento RT)
const MENU_CODES = {
  KeyW: 1, ArrowUp: 1,
  KeyS: 2, ArrowDown: 2,
  KeyA: 512, ArrowLeft: 4,
  KeyD: 8, ArrowRight: 8,
  Enter: 16, Space: 16,
  Escape: 64,
  KeyB: 32,
};

function startGame() {
  held.clear();
  runHeld.clear();
  w.pfb_new_game((Date.now() & 0x7fffffff) | 1); // deterministic xorshift32 seed
}

function menuStep(e) {
  const code = MENU_CODES[e.code];
  if (code === undefined) return false;
  w.pfb_menu(code);
  if (stats[13] === 1) startGame(); // menu confirmou "Iniciar"
  forceRedraw();
  e.preventDefault();
  return true;
}

window.addEventListener('keydown', (e) => {
  audioOn();
  if (AC && AC.state === 'suspended') AC.resume();
  // telas de menu (titulo 0, controles 4 e escolha 5): as teclas vao direto pro WASM
  // — nas CONTROLES, o próprio RT rastreia o KONAMI (B/A são bits de menu)
  if (stats[0] === 0 || stats[0] === 4 || stats[0] === 5) {
    if (menuStep(e)) return;
  }
  // morte/vitória: ENTER reinicia (como sempre)
  if ((stats[0] === 2 || stats[0] === 3) && e.code === 'Enter') {
    startGame();
    forceRedraw();
    e.preventDefault();
    return;
  }
  const bit = KEYMAP[e.code];
  if (bit !== undefined) { held.add(bit); lastDir = bit; e.preventDefault(); return; }
  if (e.code === 'Space') { held.add(IN_WAIT); e.preventDefault(); return; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { held.add(IN_SNEAK); return; }
  if (RUN_CODES.includes(e.code)) { runHeld.add(e.code); e.preventDefault(); return; }
});
window.addEventListener('keyup', (e) => {
  const bit = KEYMAP[e.code];
  if (bit !== undefined) { held.delete(bit); return; }
  if (e.code === 'Space') held.delete(IN_WAIT);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') held.delete(IN_SNEAK);
  if (RUN_CODES.includes(e.code)) runHeld.delete(e.code);
});

function inputBits() {
  let b = 0;
  if (held.has(IN_UP)) b = IN_UP;
  else if (held.has(IN_DOWN)) b = IN_DOWN;
  else if (held.has(IN_LEFT)) b = IN_LEFT;
  else if (held.has(IN_RIGHT)) b = IN_RIGHT;
  else if (held.has(IN_WAIT)) b = IN_WAIT;
  if (held.has(IN_SNEAK)) b |= IN_SNEAK;
  if (runHeld.size > 0) b |= IN_RUN; // X e/ou K: um solto, o outro segue correndo
  return b;
}

// ============================================================
// render: diff de grid byte a byte
// ============================================================
function colorFor(ch, attr, nowMs) {
  const dim = (attr & DIM_FLAG) !== 0;
  const a = attr & 0x7f;
  let col = PAL[a] || PAL[0];
  if (a === GHOST_ATTR) {
    // presença do lado de fora do tempo: o brilho quase DESLIGA — nunca
    // fica sólido. Duas senoidas fora de fase: batimento irregular.
    const p = 0.62 + 0.25 * Math.sin(nowMs * 0.0021) + 0.13 * Math.sin(nowMs * 0.011);
    col = shade(col, Math.max(0.35, Math.min(1.0, p)));
  } else if (a === 5) {
    // a COROA e o FRAGMENTO SOMBRIO brilham forte (a MESMA matéria — attr 5
    // por construção): duas ondas fora de fase, pico ~1.4 (o amarelo
    // sangra até perto do branco) e vale MINIMO 0.6 — nunca apaga. No acervo
    // o '¶' osso é estático e baixo (attr 12): é o contraste que salva §
    // da cama de corpos. A coroa-fantasma desenha com o MESMO attr (o RT
    // menti com a mesma criança): a mentira segue o padrão por construção
    const p = 1.0 + 0.25 * Math.sin(nowMs * 0.0055) + 0.15 * Math.sin(nowMs * 0.0131);
    col = shade(col, p);
  } else if (a === WATER_ATTR) {
    // ondulação lenta de lodo: cada célula corrói o brilho no tempo
    const p = 0.78 + 0.22 * Math.sin(nowMs * 0.0028);
    col = shade(col, p);
  } else if (PULSE_ATTRS.has(a)) {
    // brilho respirando
    const p = 0.75 + 0.25 * Math.sin(nowMs * 0.006);
    col = shade(col, p);
  } else if (a === BLINK_ATTR) {
    if (Math.floor(nowMs / 320) % 2 === 1) col = '#3a1000';
  }
  if (dim) col = shade(col, 0.42);
  return col;
}

function shade(hex, k) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${(r * k) | 0},${(g * k) | 0},${(b * k) | 0})`;
}

// ============================================================
// a serpente: sombra 3D, halo, onda no corpo, tremor, glitch
// ============================================================
const SERPENT_ATTRS = new Set([7, 11]);
let glitchUntil = -1e9;
let prevGlitchOn = false;
let prevSerp = new Map();
let droneUp = false;

function redrawWorldCell(si, wi, nowMs) {
  const x = (si % VW) * CELL_W;
  const y = ((si / VW) | 0) * CELL_H;
  ctx.fillStyle = PAL[15];
  ctx.fillRect(x, y, CELL_W, CELL_H);
  const ch = grid[wi * 2];
  const attr = grid[wi * 2 + 1];
  if (ch !== 0 && ch !== 32) {
    // mesmo halo do loop principal: a coroa/fragmento (real ou fantasma)
    // nunca perde o brilho nem quando a serpente passa ao lado (repasse da
    // vizinhança) — e tile LEMBRADO (DIM) não tem halo: a memória não ilumina
    if ((attr & 0x7f) === 5 && (attr & DIM_FLAG) === 0) {
      ctx.shadowColor = 'rgba(255,224,138,0.6)';
      ctx.shadowBlur = 9;
    }
    ctx.fillStyle = colorFor(ch, attr, nowMs);
    ctx.fillText(String.fromCharCode(ch), x + 1, y + CELL_H / 2 + 1);
    ctx.shadowBlur = 0;
  }
}

// attr de uma célula DO MUNDO (a serpente consulta vizinhança fora da telha)
function worldAttr(wx, wy) {
  if (wx < 0 || wy < 0 || wx >= MWd || wy >= MHd) return 0;
  return grid[(wy * MWd + wx) * 2 + 1];
}

function drawSerpentCell(si, wi, nowMs) {
  const x = (si % VW) * CELL_W;
  const y = ((si / VW) | 0) * CELL_H;
  const wx = wi % MWd, wy = (wi / MWd) | 0;
  const ch = grid[wi * 2];
  const c = String.fromCharCode(ch);
  const isHead = (grid[wi * 2 + 1] & 0x7f) === 7;
  const on = nowMs < glitchUntil;

  // fundo limpo sob e ao redor (o halo vaza pra fora da célula)
  ctx.fillStyle = PAL[15];
  ctx.fillRect(x - 4, y - 4, CELL_W + 8, CELL_H + 8);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = wx + dx, ny = wy + dy;
    if (nx < 0 || ny < 0 || nx >= MWd || ny >= MHd) continue;
    if (SERPENT_ATTRS.has(worldAttr(nx, ny))) continue; // o passada da serpente cuida
    const nsi = (ny - camY) * VW + (nx - camX);
    if (nsi < 0 || nsi >= VW * VH) continue;
    redrawWorldCell(nsi, ny * MWd + nx, nowMs);
  }

  // cor: cabeça pulsa quente; corpo tem onda de brilho viajando do pescoço pra cauda
  let col;
  if (isHead) {
    col = shade('#ff2e00', 0.8 + 0.35 * Math.sin(nowMs * 0.009));
  } else {
    const dx = wx - stats[5], dy = wy - stats[6];
    const dist = Math.sqrt(dx * dx + dy * dy);
    const wave = 0.62 + 0.5 * Math.sin(nowMs * 0.005 + dist * 0.55);
    col = shade('#bf1600', Math.min(1.3, wave));
  }

  // sombra deslocada: o peso dela SALTANDO do vidro do CRT
  ctx.fillStyle = 'rgba(20,1,0,0.92)';
  ctx.fillText(c, x + 3, y + CELL_H / 2 + 4);

  // halo vermelho
  ctx.shadowColor = 'rgba(255,26,0,0.9)';
  ctx.shadowBlur = isHead ? (on ? 16 : 11) : (on ? 14 : 8);

  // tremor sub-clínico + ondulação de deslizamento no corpo
  const jx = (Math.random() - 0.5) * (isHead ? 1 : 1.6);
  const wob = isHead ? 0 : Math.sin(nowMs * 0.003 + wx * 0.8) * 1.2;
  ctx.fillStyle = col;
  ctx.fillText(c, x + 1 + jx, y + CELL_H / 2 + 1 + wob);
  ctx.shadowBlur = 0;

  // ghost cromático da cabeça durante o glitch (interferência de sinal)
  if (on && isHead) {
    ctx.fillStyle = 'rgba(0,255,204,0.5)';
    ctx.fillText(c, x - 2, y + CELL_H / 2 + 1);
    ctx.fillStyle = 'rgba(255,0,0,0.45)';
    ctx.fillText(c, x + 4, y + CELL_H / 2 + 1);
  }
}

// fatias horizontais deslocadas: o mundo inteiro "solta" por um instante
function glitchSlices() {
  for (let i = 0; i < 3; i++) {
    const yy = Math.random() * (canvas.height - 26);
    const hh = 6 + Math.random() * 18;
    const dx = (Math.random() - 0.5) * 26;
    ctx.drawImage(canvas, 0, yy, canvas.width, hh, dx, yy, canvas.width, hh);
  }
}

let needsFull = true;
function forceRedraw() { needsFull = true; }

function render(nowMs) {
  const inPlay = stats[0] === 1;
  // ---- câmera + diff: nascem no RT (pfb_diff_ptr). bit0 = remontagem
  // integral (mudou câmera/andar/tela); bitmap = cada célula de TELA cujo
  // [ch,attr] mudou desde o último ack. É o diff byte-a-byte que era do JS.
  MWd = inPlay ? stats[16] : VW;
  MHd = inPlay ? stats[17] : VH;
  camX = inPlay ? diffView[1] : 0;
  camY = inPlay ? diffView[2] : 0;
  if (diffView[0] & 1) needsFull = true;

  const full = needsFull;
  if (full) {
    ctx.fillStyle = PAL[15];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    needsFull = false;
  }
  const serp = new Map(); // si (tela) -> wi (mundo)
  for (let si = 0; si < VW * VH; si++) {
    const wi = (camY + ((si / VW) | 0)) * MWd + camX + (si % VW);
    const ch = grid[wi * 2];
    const attr = grid[wi * 2 + 1];
    if (inPlay && SERPENT_ATTRS.has(attr & 0x7f)) {
      serp.set(si, wi);
      continue;
    }
    // não mudou (bitmap do Rust zero) e não é attr vivo: nada a pintar.
    // Attr vivo repinta todo frame: a cor respira e não anda no bitmap.
    if (!full && !(diffView[3 + (si >> 3)] & (1 << (si & 7))) && !ANIM_ATTRS.has(attr & 0x7f)) continue;
    const x = (si % VW) * CELL_W;
    const y = ((si / VW) | 0) * CELL_H;
    // limpa célula
    ctx.fillStyle = PAL[15];
    ctx.fillRect(x, y, CELL_W, CELL_H);
    const c = String.fromCharCode(ch);
    if (ch !== 0 && c !== ' ') {
      // a COROA e o FRAGMENTO têm halo próprio (attr 5 real OU fantasma: a
      // mentira brilha igual, e o '¤' guarda da coroa a mesma luz) — o osso
      // '¶' ao redor não tem brilho nenhum: § não se perde.
      // tile LEMBRADO (DIM) não tem halo: a névoa escurece e o glow não
      // vaza além da célula (a memória não ilumina)
      if ((attr & 0x7f) === 5 && (attr & DIM_FLAG) === 0) {
        ctx.shadowColor = 'rgba(255,224,138,0.6)';
        ctx.shadowBlur = 9;
      }
      ctx.fillStyle = colorFor(ch, attr, nowMs);
      ctx.fillText(c, x + 1, y + CELL_H / 2 + 1);
      ctx.shadowBlur = 0;
    }
  }

  // passada da serpente: cada célula desenhada com sombra/halo/onda;
  // células onde ela ESTEVA no frame anterior são limpas e remontadas
  if (serp.size || prevSerp.size) {
    const dirty = new Set([...prevSerp.keys(), ...serp.keys()]);
    const touched = new Set();
    for (const si of dirty) {
      const wi = serp.get(si) ?? prevSerp.get(si);
      const wx = wi % MWd, wy = (wi / MWd) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = wx + dx, ny = wy + dy;
        if (nx < 0 || ny < 0 || nx >= MWd || ny >= MHd) continue;
        if (SERPENT_ATTRS.has(worldAttr(nx, ny))) continue;
        const nsi = (ny - camY) * VW + (nx - camX);
        if (nsi < 0 || nsi >= VW * VH) continue;
        touched.add(nsi);
      }
    }
    const scrToWorld = (si) => (camY + ((si / VW) | 0)) * MWd + camX + (si % VW);
    for (const t of touched) {
      if (serp.has(t)) continue;
      redrawWorldCell(t, scrToWorld(t), nowMs);
    }
    for (const [si, wi] of serp) drawSerpentCell(si, wi, nowMs);
  }
  prevSerp = serp;

  // barra de UI: dica contextual na ÚLTIMA LINHA da tela — agora no ESPAÇO
  // QUE SOBRA à direita da placa do HUD inferior. Cabe → alinhado à esquerda
  // (o texto ocupa o restante da linha); não cabe → rola em letreiro
  // contínuo (2 células/s), recomeçando quando o rabo sai da região.
  if (inPlay) {
    const uiY = (VH - 1) * CELL_H;
    const x0 = HUD_X + hudW() + 4, x1 = canvas.width - 4;
    // o chão da região é repintado TODO frame: a rolagem muda a posição dos
    // glifos a cada frame — as células de trás não são "mudadas" no diff do
    // Rust, e sem o fill as letras velhas fantasiam no rastro do letreiro
    ctx.fillStyle = PAL[15];
    ctx.fillRect(x0, uiY, x1 - x0, CELL_H);
    let msg = '';
    const attrs = [];
    // a dica nasce CENTRALIZADA no buffer (write_ui_center): pular os zeros
    // à esquerda antes de ler — quebrar no byte 0 apagava a barra inteira
    let s0 = 0;
    while (s0 < VW && uirow[s0 * 2] === 0) s0++;
    for (let i = s0; i < VW; i++) {
      const ch = uirow[i * 2];
      if (ch === 0) break;
      msg += String.fromCharCode(ch);
      attrs.push(uirow[i * 2 + 1]);
    }
    if (msg) {
      const region = x1 - x0;
      const wpx = msg.length * CELL_W;
      let ox = 0;
      if (wpx > region) {
        // letreiro: desliza para a esquerda até o rabo + respiro de 2 células
        // saírem, e recomeça — mensagem nenhuma é cortada em silêncio
        const span = wpx - region + CELL_W * 2;
        ox = -((nowMs * 0.024) % span);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, uiY, region, CELL_H);
      ctx.clip();
      const bx0 = Math.round(x0 + ox);
      for (let k = 0; k < msg.length; k++) {
        const px = bx0 + k * CELL_W;
        if (px > x1 || px + CELL_W < x0) continue;
        ctx.fillStyle = colorFor(msg.charCodeAt(k), attrs[k], nowMs);
        ctx.fillText(msg[k], px + 1, uiY + CELL_H / 2 + 1);
      }
      ctx.restore();
    }
  }

  // glitch: fatias deslocadas por alguns frames; ao terminar, remonta a tela
  const gOn = nowMs < glitchUntil;
  if (gOn && Math.random() < 0.7) glitchSlices();
  if (prevGlitchOn && !gOn) { needsFull = true; }
  prevGlitchOn = gOn;

  // consumido: o Rust zera flags + bitmap — o próximo render marca de novo
  w.pfb_diff_ack();
}

// HUD: medidor de som (o "quanto te ouviam agora") + fôlego + MEDO (terceira
// régua: sobe a cada vislumbre, DESCE devagar demais — e piso 4 não existe:
// em 100 você morre antes de ver a barra cheia) + slot do ITEM carregado.
// A placa mora no CANTO INFERIOR ESQUERDO, junto da barra de texto, com
// margem própria (2px) — 100% visível dentro do canvas, nada a corta.
function drawHUD() {
  if (stats[0] !== 1) return;
  const now = performance.now();
  const lvl = stats[10];
  const fear = stats[18] || 0;
  const fl = stats[19] || 0;

  // ---- placa tripla + coluna de itens: ancorada no canto inferior esquerdo,
  // largura DINÂMICA (hudW): sem item ela é compacta; com item ela abre ----
  const hx = HUD_X, hy = canvas.height - HUD_H - HUD_MARGIN;
  const pw = hudW();
  ctx.fillStyle = 'rgba(5,2,0,0.80)';
  ctx.fillRect(hx, hy, pw, HUD_H);
  ctx.strokeStyle = 'rgba(138,95,0,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(hx + 0.5, hy + 0.5, pw - 1, HUD_H - 1);

  // ---- medidor de ruído: 3 casas grossas, acende com o nível ----
  const bw = 10, bh = 14, gap = 3, bx = 7, by = hy + 5;
  for (let k = 0; k < 3; k++) {
    const x = bx + k * (bw + gap);
    // moldura da casa (sempre visível: lê-se o envelope mesmo apagado)
    ctx.strokeStyle = 'rgba(138,95,0,0.70)';
    ctx.strokeRect(x + 0.5, by + 0.5, bw - 1, bh - 1);
    if (k < lvl) {
      // cheia: cor por nível — calar (discreto), andar (âmbar), correr (perigo)
      let col = k === 0 ? '#c98a00' : k === 1 ? '#ffb000' : '#ff5000';
      if (lvl === 3) {
        // fúria: piscada rápida — o nível máximo não passa despercebido
        col = shade(col, 0.55 + 0.45 * Math.sin(now * 0.02));
      }
      ctx.fillStyle = col;
      ctx.fillRect(x + 2, by + 2, bw - 4, bh - 4);
    } else {
      ctx.fillStyle = 'rgba(107,68,0,0.18)';
      ctx.fillRect(x + 2, by + 2, bw - 4, bh - 4);
    }
  }

  // ---- fôlego: régua fina sob as casas, mesma largura do medidor ----
  const fx = bx, fy = by + bh + 5, fw = bw * 3 + gap * 2;
  ctx.fillStyle = 'rgba(107,68,0,0.35)';
  ctx.fillRect(fx, fy, fw, 4);
  ctx.fillStyle = stats[11] < 25 ? '#ff5000' : '#8a5f00';
  ctx.fillRect(fx, fy, Math.max(2, Math.round(fw * stats[11] / 100)), 4);

  // ---- medo: régua trêmula — quanto maior o nível, mais a barra VIBRA ----
  const mfy = fy + 11;
  ctx.fillStyle = 'rgba(107,68,0,0.35)';
  ctx.fillRect(fx, mfy, fw, 5);
  if (fear > 0) {
    const FEAR_COL = ['#8a5f00', '#c98a00', '#ff7a00', '#ff2000', '#ff2000'][fl];
    let mcol = FEAR_COL;
    if (fl >= 3) {
      // pânico/colapso: a barra tremula fora de tempo — e desloca ±1px
      mcol = shade(FEAR_COL, 0.6 + 0.4 * Math.sin(now * (fl === 3 ? 0.017 : 0.035)));
    }
    const jx = fl >= 2 ? Math.round((Math.random() - 0.5) * (fl >= 3 ? 3 : 1.2)) : 0;
    const jy = fl >= 3 ? Math.round((Math.random() - 0.5) * 1.4) : 0;
    ctx.fillStyle = mcol;
    ctx.fillRect(fx + jx, mfy + jy, Math.max(2, Math.round(fw * fear / 100)), 5);
  }

  // ---- itens: cada item é um QUADRO individual ----
  // uma coluna, um abaixo do outro, e SÓ do que existe: item pego nasce
  // com moldura e glifo (§ coroa / ¤ fragmento — a mesma matéria, brilho
  // vivo do attr 5); sem item coletado, caixa nenhuma aparece (nada de
  // envelope fantasma). Nome nenhum: o glifo É o nome. O HUD não mente —
  // STATS[8]/[20] são o espelho honesto da cerca do heart_tick.
  const ITW = 16, ITH = 16, IGAP = 3;
  const crownHeld = stats[8] === 1; // 1 = a coroa é SUA
  const held = [];
  if (crownHeld) held.push(0xA7);                     // § coroa
  if (stats[20] === 1 && !crownHeld) held.push(0xA4); // ¤ fragmento (enquanto é ELE)
  for (let i = 0; i < held.length; i++) {
    // coluna depois do VÃO — e o vão só existe SE a coluna existe: placa
    // compacta não reserva espaço de item fantasma
    const ix = hx + 51, iy = hy + 5 + i * (ITH + IGAP);
    ctx.strokeStyle = 'rgba(138,95,0,0.70)';
    ctx.strokeRect(ix + 0.5, iy + 0.5, ITW - 1, ITH - 1);
    ctx.fillStyle = 'rgba(107,68,0,0.18)';
    ctx.fillRect(ix + 2, iy + 2, ITW - 4, ITH - 4);
    ctx.save();
    ctx.textAlign = 'center'; // glifo centrado de verdade (left nasce torto)
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = colorFor(held[i], 5, now);
    ctx.fillText(String.fromCharCode(held[i]), ix + ITW / 2, iy + ITH / 2 + 1);
    ctx.restore();
  }
  ctx.font = 'bold 15px monospace'; // restaura: o render por células conta com ele
}

// ============================================================
// os efeitos do medo na PELE (fora do grid: CSS puro)
// ============================================================
// Não é informação do jogo (o RT nunca mente — alucinação nenhuma vaza lógica):
// é o SEU corpo à beira de quebrar. O mundo treme (duas senoides desafinadas,
// nada de tremor uniforme) e a vinheta vermelha fecha nos pulsos do medo.
const wrapEl = document.getElementById('wrap');
const fearv = document.getElementById('fearv');
const wrapBaseTransform = ''; // sempre limpa: nenhum outro transform usa o wrap
function fearScreen(nowMs) {
  let lvl = 0;
  if (stats[0] === 1) lvl = stats[19] || 0;
  if (lvl < 2) { restoreWrapped(); return; }
  const t = nowMs / 1000;
  // duas frequências irreducíveis: o mundo "respira errado" sob o medo
  const tx = Math.sin(t * 41.0) + Math.sin(t * 23.7) * 0.6;
  const ty = Math.cos(t * 33.3) + Math.sin(t * 19.1) * 0.5;
  const amp = lvl >= 3 ? 2.6 : 1.4;
  wrapEl.style.transform = `translate(${(tx * amp).toFixed(1)}px, ${(ty * amp * 0.7).toFixed(1)}px)`;
  // vinheta pulsando no ritmo do pânico (fecha mais rápido em nível alto)
  const beat = Math.sin(t * (lvl >= 3 ? 5.2 : 3.4));
  const base = lvl >= 3 ? 0.30 : 0.12;
  const wave = lvl >= 3 ? 0.10 : 0.06;
  fearv.style.opacity = (base + wave * beat).toFixed(3);
}
function restoreWrapped() {
  if (wrapEl.style.transform) wrapEl.style.transform = wrapBaseTransform;
  if (fearv.style.opacity !== '0') fearv.style.opacity = '0';
}

// ============================================================
// loop principal
// ============================================================
let acc = 0;
let lastT = performance.now();
let lastState = 0;

function frame(nowMs) {
  const dt = nowMs - lastT;
  lastT = nowMs;
  acc += dt;

  const st = stats[0];
  if (st === 1) {
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      // o tick sempre avança — imóvel também é uma ação (esconderijo)
      w.pfb_step(inputBits());
      safe(drainEvents, 'eventos');
      if (stats[0] !== 1) break;
    }
    safe(() => setAmbience(false), 'ambiente'); // troca de andar => troca de trilha
    safe(droneSwell, 'drone');
  } else {
    acc = 0; // menus: fluxo em tempo real não roda
    safe(droneSwell, 'drone'); // garante que o drone volta ao normal fora do jogo
    if (st !== lastState) {
      safe(drainEvents, 'eventos'); // garantir que eventos finais (morte/vitória) soam
      safe(() => setAmbience(false), 'ambiente'); // morte/vitória: silêncio absoluto
    }
  }
  lastState = stats[0];

  safe(() => render(nowMs), 'render');
  safe(() => fearScreen(nowMs), 'tremor do medo');
  safe(drawHUD, 'HUD');
  requestAnimationFrame(frame); // SEMPRE re-agenda: 1 erro não congela os controles
}

// se algo lançar NESTE frame, o loop sobrevive. Sem try/catch, o rAF morre
// e o input morre junto — o pior bug de UX possível (tela congelada é
// indistinguível de jogo quebrado; foi o bug real do HUD, morto em 1 frame).
function safe(fn, label) {
  try {
    fn();
  } catch (err) {
    if (!safe.silenced.has(label)) {
      safe.silenced.add(label);
      console.warn(`[game] ${label} falhou:`, err);
    }
  }
}
safe.silenced = new Set();

function drainEvents() {
  let e;
  const dx = stats[5] - stats[3];
  const dy = stats[6] - stats[4];
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const pan = Math.max(-1, Math.min(1, dx / 8));
  while ((e = w.pfb_pop_event()) !== 0) {
    if (e === 5 || (e >= 14 && e <= 16)) glitchUntil = performance.now() + 280; // vislumbre: o sinal "solta"
    // eventos 18+ acontecem DENTRO da sua cabeça: sem pan da posição real
    const mental = e >= 18;
    playEvent(e, mental ? 0 : ((e === 12 || e === 13) ? pan : (e >= 10 && dist > 2 ? pan * 0.6 : 0)));
  }
}

// drone do castelo engordando enquanto o corpo dela enche o seu campo de visão
function droneSwell() {
  if (!AC || !droneNodes) return;
  const up = stats[0] === 1 && stats[9] > 0;
  if (up !== droneUp) {
    droneUp = up;
    droneNodes.gain.setTargetAtTime(up ? 0.045 : 0.028, AC.currentTime, 0.25);
  }
}

// redesenha tudo ao carregar
drainEvents();
forceRedraw();
requestAnimationFrame(frame);
