// Castle of Basilisk — glue JS: render diff, WebAudio sintetizado, loop de ticks.
// WASM ABI crua: lemos grid/stats direto da memória exportada.

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
const PAL_BY_THEME = [PAL_CASTLE, PAL_DUNGEON, PAL_SEWER];
let PAL = PAL_CASTLE;
const WATER_ATTR = 13;
const GHOST_ATTR = 14; // 'o': as mentiras do RT (alucinações do medo)
const PULSE_ATTRS = new Set([4, 5, 7]);
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
const prevGrid = new Uint8Array(VW * VH * 2); // diff de render, em células DE TELA
const mapview = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), N_MAX); // tiles do andar

// ---- câmera: mapa do andar atual (stats[16]/[17]) desliza sob a viewport ----
let MWd = VW, MHd = VH;
let camX = 0, camY = 0;
let prevCamX = -1, prevCamY = -1, prevDepth = -1, prevMW = 0, prevMH = 0;
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

// tema derivado de DEPTH: 0 castelo · 1 masmorra · 2 esgoto
function ambientTheme() {
  const d = stats[2];
  return d <= 1 ? 0 : (d <= 3 ? 1 : 2);
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
  PAL = PAL_BY_THEME[th === -1 ? 0 : th]; // o CRT respira a cor do lugar
  needsFull = true;
  // SFX abafados na masmorra: o silêncio sepulcral contrasta qualquer som
  sfxBus.gain.setTargetAtTime(th === 1 ? 0.7 : 1.0, now, 0.5);
  if (th === 0) {
    // ---- TÉRREO: VENTO — rajadas lentas contra os salões altos ----
    const g = AC.createGain();
    g.gain.value = 0;
    const src = AC.createBufferSource();
    const len = Math.floor(AC.sampleRate * 3);
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    src.buffer = buf;
    src.loop = true;
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 430;
    bp.Q.value = 0.8;
    // LFO duplo: bolhas de ar mudando o calibre da fresta
    const lfo = AC.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = AC.createGain();
    lfoG.gain.value = 240;
    lfo.connect(lfoG);
    lfoG.connect(bp.frequency);
    const lfo2 = AC.createOscillator();
    lfo2.frequency.value = 0.13;
    const lfo2G = AC.createGain();
    lfo2G.gain.value = 0.035;
    lfo2.connect(lfo2G);
    lfo2G.connect(g.gain);
    src.connect(bp); bp.connect(g); g.connect(ambGain);
    src.start(); lfo.start(); lfo2.start();
    ambNodes.push(g);
    g.gain.setTargetAtTime(0.05, now, 2.5);
  } else if (th === 1) {
    // ---- MASMORRA: SILÊNCIO PERTURBADOR — quase nada; a cada 16-40s um
    // estalo mínimo de madeira/pedra, só para o ouvido ficar tenso ----
    schedSilence();
  } else if (th === 2) {
    // ---- ESCGOTO: GOTEIRAS — ping agudo com eco de cisterna, irregular
    schedDrips();
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
    case 1: { // passo: intensidade pelo medidor de ruído (stats[10]) + esgoto respinga
      const lvl = stats[10];
      const onWater = mapview[stats[3] + stats[4] * MWd] === 0x3D; // T_WATER sob os pés
      if (lvl === 1) {
        // silencioso: quase nada, um toque de dedo no chão
        if (onWater) blip({ type: 'sine', f0: 640, f1: 260, dur: 0.05, vol: 0.03, out: echoIn });
        else blip({ type: 'square', f0: 460, dur: 0.02, vol: 0.018 });
      } else if (lvl === 3) {
        // corrida: bota batendo + eco a preencher o corredor vazio
        if (onWater) {
          noiseBurst({ dur: 0.12, vol: 0.12, f: 1100, q: 1.1, out: echoIn });
          blip({ type: 'sine', f0: 820, f1: 180, dur: 0.12, vol: 0.1, out: echoIn });
        } else {
          blip({ type: 'square', f0: 520, dur: 0.05, vol: 0.12, out: echoIn });
          blip({ type: 'sine', f0: 120, f1: 70, dur: 0.1, vol: 0.11 });
        }
      } else {
        // andar: clique seco, bem discreto (respingo curto na água)
        if (onWater) {
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
  }
}

// arrastar de escamas sobre pedra: ruído filtrado grave + sub-sine que afunda
function bodyRumble(pan) {
  noiseBurst({ dur: 0.55, vol: 0.11, f: 160, q: 0.8, pan });
  noiseBurst({ dur: 0.3, vol: 0.05, f: 420, q: 1.6, pan, delay: 0.08 });
  blip({ type: 'sine', f0: 65, f1: 40, dur: 0.5, vol: 0.16, pan });
}

// coração: intervalo, tom e pan dependem da proximidade dela
let heartT0 = 0;
function heartbeat(nowMs) {
  if (!AC || stats[0] !== 1) return;
  const dx = stats[5] - stats[3];
  const dy = stats[6] - stats[4];
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const crown = stats[8] === 1;
  // intervalo: pertoooo = arranca; caça com coroa: acelera constante
  let period;
  if (crown) period = 320 + dist * 45;
  else period = 700 + dist * 130; // patrulha longe = lento
  period = Math.max(260, Math.min(1500, period));
  // o MEDO também acelera o peito — e não pergunta se ela está perto:
  // o pavor late sozinha (nível 3+: o coração dispara no vazio)
  const fl = stats[19] || 0;
  if (fl > 0) period = Math.max(175, period - fl * 65);
  if (nowMs - heartT0 < period) return;
  heartT0 = nowMs;
  const closeness = Math.max(0, Math.min(1, 1 - dist / 14));
  const vol = (0.05 + closeness * 0.22) + fl * 0.02;
  const pan = Math.max(-1, Math.min(1, dx / 8));
  const pitch = 55 + closeness * 25; // quanto mais perto, mais grave e alto
  blip({ type: 'sine', f0: pitch * 2, f1: pitch, dur: 0.1, vol, pan });
  blip({ type: 'sine', f0: pitch * 1.6, f1: pitch * 0.8, dur: 0.08, vol: vol * 0.7, delay: 0.13, pan });
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
// 1 UP, 2 DOWN, 4 LEFT, 8 RIGHT, 16 CONFIRMAR, 64 VOLTAR
const MENU_CODES = {
  KeyW: 1, ArrowUp: 1,
  KeyS: 2, ArrowDown: 2,
  KeyA: 4, ArrowLeft: 4,
  KeyD: 8, ArrowRight: 8,
  Enter: 16, Space: 16,
  Escape: 64,
};

function startGame() {
  held.clear();
  runHeld.clear();
  w.pfb_new_game((Date.now() & 0x7fffffff) | 1); // deterministic xorshift32 seed
  heartT0 = 0;
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
  // telas de menu (titulo 0 e controles 4): as teclas vao direto pro WASM
  if (stats[0] === 0 || stats[0] === 4) {
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
let inPlayPrev = false;
let droneUp = false;

function redrawWorldCell(si, wi, nowMs) {
  const x = (si % VW) * CELL_W;
  const y = ((si / VW) | 0) * CELL_H;
  ctx.fillStyle = PAL[15];
  ctx.fillRect(x, y, CELL_W, CELL_H);
  const ch = grid[wi * 2];
  const attr = grid[wi * 2 + 1];
  if (ch !== 0 && ch !== 32) {
    ctx.fillStyle = colorFor(ch, attr, nowMs);
    ctx.fillText(String.fromCharCode(ch), x + 1, y + CELL_H / 2 + 1);
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
  // ---- câmera: segue o jogador, clampada nas bordas do andar ----
  if (inPlay) {
    MWd = stats[16]; MHd = stats[17];
    if (stats[2] !== prevDepth || MWd !== prevMW || MHd !== prevMH) {
      needsFull = true;
      prevDepth = stats[2]; prevMW = MWd; prevMH = MHd;
    }
    camX = clampInt(stats[3] - (VW >> 1), 0, Math.max(0, MWd - VW));
    camY = clampInt(stats[4] - (VH >> 1), 0, Math.max(0, MHd - VH));
    if (camX !== prevCamX || camY !== prevCamY) {
      needsFull = true; // reposicionou a janela: remonta tudo
      prevCamX = camX; prevCamY = camY;
    }
  } else {
    if (inPlayPrev) needsFull = true; // menus/telas: viewport integral 56x32
    MWd = VW; MHd = VH; camX = 0; camY = 0;
    prevCamX = 0; prevCamY = 0;
  }
  inPlayPrev = inPlay;

  if (needsFull) {
    ctx.fillStyle = PAL[15];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    prevGrid.fill(0);
    needsFull = false;
  }
  const serp = new Map(); // si (tela) -> wi (mundo)
  for (let si = 0; si < VW * VH; si++) {
    const wi = (camY + ((si / VW) | 0)) * MWd + camX + (si % VW);
    const ch = grid[wi * 2];
    const attr = grid[wi * 2 + 1];
    if (inPlay && SERPENT_ATTRS.has(attr & 0x7f)) {
      serp.set(si, wi);
      prevGrid[si * 2] = ch;
      prevGrid[si * 2 + 1] = attr;
      continue;
    }
    const pCh = prevGrid[si * 2];
    const pAttr = prevGrid[si * 2 + 1];
    const anim = (PULSE_ATTRS.has(attr & 0x7f)) || (attr & 0x7f) === BLINK_ATTR
      || (attr & 0x7f) === WATER_ATTR || (attr & 0x7f) === GHOST_ATTR;
    const prevAnim = (PULSE_ATTRS.has(pAttr & 0x7f)) || (pAttr & 0x7f) === BLINK_ATTR
      || (pAttr & 0x7f) === WATER_ATTR || (pAttr & 0x7f) === GHOST_ATTR;
    if (ch === pCh && attr === pAttr && !anim && !prevAnim) continue;
    const x = (si % VW) * CELL_W;
    const y = ((si / VW) | 0) * CELL_H;
    // limpa célula
    ctx.fillStyle = PAL[15];
    ctx.fillRect(x, y, CELL_W, CELL_H);
    const c = String.fromCharCode(ch);
    if (ch !== 0 && c !== ' ') {
      ctx.fillStyle = colorFor(ch, attr, nowMs);
      ctx.fillText(c, x + 1, y + CELL_H / 2 + 1);
    }
    prevGrid[si * 2] = ch;
    prevGrid[si * 2 + 1] = attr;
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

  // barra de UI: dica contextual fixa na ÚLTIMA LINHA da tela (segue a câmera)
  if (inPlay) {
    ctx.fillStyle = PAL[15];
    ctx.fillRect(0, (VH - 1) * CELL_H, canvas.width, CELL_H);
    for (let x = 0; x < VW; x++) {
      const ch = uirow[x * 2], a = uirow[x * 2 + 1];
      if (ch !== 0 && ch !== 32) {
        ctx.fillStyle = colorFor(ch, a, nowMs);
        ctx.fillText(String.fromCharCode(ch), x * CELL_W + 1, (VH - 1) * CELL_H + CELL_H / 2 + 1);
      }
    }
  }

  // glitch: fatias deslocadas por alguns frames; ao terminar, remonta a tela
  const gOn = nowMs < glitchUntil;
  if (gOn && Math.random() < 0.7) glitchSlices();
  if (prevGlitchOn && !gOn) { needsFull = true; }
  prevGlitchOn = gOn;
}

// HUD: medidor de som (o "quanto te ouviam agora") + fôlego + MEDO (terceira
// linha: sobe a cada vislumbre, DESCE devagar demais — e piso 4 não existe:
// em 100 você morre antes de ver a barra cheia)
function drawHUD() {
  if (stats[0] !== 1) return;
  const now = performance.now();
  const lvl = stats[10];
  const fear = stats[18] || 0;
  const fl = stats[19] || 0;

  // ---- placa tripla: ruído + fôlego + medo, sobre placa escura com moldura ----
  ctx.fillStyle = 'rgba(5,2,0,0.80)';
  ctx.fillRect(2, 1, 46, 47);
  ctx.strokeStyle = 'rgba(138,95,0,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(2.5, 1.5, 45, 46);

  // ---- medidor de ruído: 3 casas grossas, acende com o nível ----
  const bw = 10, bh = 14, gap = 3, bx = 7, by = 5;
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
}

// ============================================================
// os efeitos do medo na PELE (fora do grid: CSS puro)
// ============================================================
// Não é informação do jogo (o RT nunca mente — alucinação nenhuma vaza lógica):
// é o SEU corpo à beira de quebrar. O mundo treme (duas senoides desafinadas,
// nada de tremor uniforme) e a vinheta vermelha fecha nos pulsos do coração.
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
  // vinheta pulsando como o coração (batida mais rápida no pânico)
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
    safe(() => heartbeat(nowMs), 'coração');
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
