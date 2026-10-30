// Castle of Basilisk — glue JS: render diff, WebAudio sintetizado, loop de ticks.
// WASM ABI crua: lemos grid/stats direto da memória exportada.

const W = 56, H = 32, CELL_W = 12, CELL_H = 18;
const TICK_MS = 140;

// ---- bits de input (mesmos do WASM) ----
const IN_UP = 1, IN_DOWN = 2, IN_LEFT = 4, IN_RIGHT = 8, IN_WAIT = 16;
const IN_SNEAK = 32, IN_RUN = 64;

// ---- paleta (índices de attr do WASM) ----
const PAL = [
  '#6b4400', // 0 piso
  '#a87000', // 1 parede
  '#4a3400', // 2 sombra ,
  '#c98a00', // 3 porta +
  '#ffdd66', // 4 escadas (pulsa)
  '#ffe08a', // 5 coroa § (pulsa)
  '#ffd54d', // 6 jogador @
  '#ff2e00', // 7 basilisco B (cabeça: vermelho quente, halo forte)
  '#b57b00', // 8 UI
  '#ff5000', // 9 alerta (pisca)
  '#ffb000', // 10 título
  '#bf1600', // 11 corpo do basilisco ~ (vermelho sangue, onda + halo no render)
  '#54421c', // 12 escombro % (becos que ela evita)
  '#201500', '#201500',
  '#0a0600', // 15 vazio
];
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

const res = await fetch('./wasm/castle_of_basilisk.wasm');
const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), {});
const w = instance.exports;
w.pfb_init();

const stats = new Uint8Array(w.memory.buffer, w.pfb_stats_ptr(), 16);
const grid = new Uint8Array(w.memory.buffer, w.pfb_grid_ptr(), W * H * 2);
const prevGrid = new Uint8Array(W * H * 2); // para diff de render

// ============================================================
// áudio sintetizado
// ============================================================
let AC = null;
let master = null;
let droneNodes = null;
let echoIn = null; // barramento do eco do castelo vazio

function audioOn() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain();
  master.gain.value = 0.5;
  master.connect(AC.destination);
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
  startDrone();
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
  node.connect(out || master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noiseBurst({ dur = 0.3, vol = 0.15, f = 3000, q = 2, delay = 0, pan = 0 }) {
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
  node.connect(master);
  src.start(t0);
}

// sons por evento (mesmos IDs do WASM)
function playEvent(ev, pan) {
  switch (ev) {
    case 1: { // passo: intensidade pelo medidor de ruído (stats[10])
      const lvl = stats[10];
      if (lvl === 1) {
        // silencioso: quase nada, um toque de dedo no chão
        blip({ type: 'square', f0: 460, dur: 0.02, vol: 0.018 });
      } else if (lvl === 3) {
        // corrida: bota batendo + eco a preencher o corredor vazio
        blip({ type: 'square', f0: 520, dur: 0.05, vol: 0.12, out: echoIn });
        blip({ type: 'sine', f0: 120, f1: 70, dur: 0.1, vol: 0.11 });
      } else {
        // andar: clique seco, bem discreto
        blip({ type: 'square', f0: 700, dur: 0.03, vol: 0.045 });
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
  if (nowMs - heartT0 < period) return;
  heartT0 = nowMs;
  const closeness = Math.max(0, Math.min(1, 1 - dist / 14));
  const vol = 0.05 + closeness * 0.22;
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
// correr = X ou K (K para jogadores de WASD): Ctrl+W fecharia o navegador.
// Shift é passada silenciosa; correr é "você e o eco contra a pedra".
// O modo escolhido na tela de CONTROLES (stats[15]) decide qual delas responde:
// 0 = WASD → K ; 1 = SETAS → X.
const RUNKEYS = () => (stats[15] === 1 ? ['KeyX'] : ['KeyK']);

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
  if (RUNKEYS().includes(e.code)) { held.add(IN_RUN); return; }
});
window.addEventListener('keyup', (e) => {
  const bit = KEYMAP[e.code];
  if (bit !== undefined) { held.delete(bit); return; }
  if (e.code === 'Space') held.delete(IN_WAIT);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') held.delete(IN_SNEAK);
  if (RUNKEYS().includes(e.code)) held.delete(IN_RUN);
  if (e.code === 'KeyX' || e.code === 'KeyK') held.delete(IN_RUN); // trocou de modo
});

function inputBits() {
  let b = 0;
  if (held.has(IN_UP)) b = IN_UP;
  else if (held.has(IN_DOWN)) b = IN_DOWN;
  else if (held.has(IN_LEFT)) b = IN_LEFT;
  else if (held.has(IN_RIGHT)) b = IN_RIGHT;
  else if (held.has(IN_WAIT)) b = IN_WAIT;
  if (held.has(IN_SNEAK)) b |= IN_SNEAK;
  if (held.has(IN_RUN)) b |= IN_RUN;
  return b;
}

// ============================================================
// render: diff de grid byte a byte
// ============================================================
function colorFor(ch, attr, nowMs) {
  const dim = (attr & DIM_FLAG) !== 0;
  const a = attr & 0x7f;
  let col = PAL[a] || PAL[0];
  if (PULSE_ATTRS.has(a)) {
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
let prevSerp = new Set();
let droneUp = false;

function redrawWorldCell(i, nowMs) {
  const x = (i % W) * CELL_W;
  const y = ((i / W) | 0) * CELL_H;
  ctx.fillStyle = PAL[15];
  ctx.fillRect(x, y, CELL_W, CELL_H);
  const ch = grid[i * 2];
  const attr = grid[i * 2 + 1];
  if (ch !== 0 && ch !== 32) {
    ctx.fillStyle = colorFor(ch, attr, nowMs);
    ctx.fillText(String.fromCharCode(ch), x + 1, y + CELL_H / 2 + 1);
  }
}

function drawSerpentCell(i, nowMs) {
  const x = (i % W) * CELL_W;
  const y = ((i / W) | 0) * CELL_H;
  const ch = grid[i * 2];
  const c = String.fromCharCode(ch);
  const isHead = (grid[i * 2 + 1] & 0x7f) === 7;
  const on = nowMs < glitchUntil;

  // fundo limpo sob e ao redor (o halo vaza pra fora da célula)
  ctx.fillStyle = PAL[15];
  ctx.fillRect(x - 4, y - 4, CELL_W + 8, CELL_H + 8);
  const ci = i % W, cj = ((i / W) | 0);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = ci + dx, ny = cj + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const ni = ny * W + nx;
    if (SERPENT_ATTRS.has(grid[ni * 2 + 1] & 0x7f)) continue; // o passada da serpente cuida
    redrawWorldCell(ni, nowMs);
  }

  // cor: cabeça pulsa quente; corpo tem onda de brilho viajando do pescoço pra cauda
  let col;
  if (isHead) {
    col = shade('#ff2e00', 0.8 + 0.35 * Math.sin(nowMs * 0.009));
  } else {
    const dx = ci - stats[5], dy = cj - stats[6];
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
  const wob = isHead ? 0 : Math.sin(nowMs * 0.003 + ci * 0.8) * 1.2;
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
  if (needsFull) {
    ctx.fillStyle = PAL[15];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    prevGrid.fill(0);
    needsFull = false;
  }
  const serp = new Set();
  for (let i = 0; i < W * H; i++) {
    const ch = grid[i * 2];
    const attr = grid[i * 2 + 1];
    if (inPlay && SERPENT_ATTRS.has(attr & 0x7f)) {
      serp.add(i);
      prevGrid[i * 2] = ch;
      prevGrid[i * 2 + 1] = attr;
      continue;
    }
    const pCh = prevGrid[i * 2];
    const pAttr = prevGrid[i * 2 + 1];
    const anim = (PULSE_ATTRS.has(attr & 0x7f)) || (attr & 0x7f) === BLINK_ATTR;
    const prevAnim = (PULSE_ATTRS.has(pAttr & 0x7f)) || (pAttr & 0x7f) === BLINK_ATTR;
    if (ch === pCh && attr === pAttr && !anim && !prevAnim) continue;
    const x = (i % W) * CELL_W;
    const y = ((i / W) | 0) * CELL_H;
    // limpa célula
    ctx.fillStyle = PAL[15];
    ctx.fillRect(x, y, CELL_W, CELL_H);
    const c = String.fromCharCode(ch);
    if (ch !== 0 && c !== ' ') {
      ctx.fillStyle = colorFor(ch, attr, nowMs);
      ctx.fillText(c, x + 1, y + CELL_H / 2 + 1);
    }
    prevGrid[i * 2] = ch;
    prevGrid[i * 2 + 1] = attr;
  }

  // passada da serpente: cada célula desenhada com sombra/halo/onda;
  // células onde ela ESTEVA no frame anterior são limpas e remontadas
  if (serp.size || prevSerp.size) {
    const dirty = new Set([...prevSerp, ...serp]);
    const touched = new Set();
    for (const d of dirty) {
      const cx = d % W, cy = (d / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        touched.add(ny * W + nx);
      }
    }
    for (const c of touched) {
      if (serp.has(c)) continue;
      redrawWorldCell(c, nowMs);
    }
    for (const c of serp) drawSerpentCell(c, nowMs);
  }
  prevSerp = serp;

  // glitch: fatias deslocadas por alguns frames; ao terminar, remonta a tela
  const gOn = nowMs < glitchUntil;
  if (gOn && Math.random() < 0.7) glitchSlices();
  if (prevGlitchOn && !gOn) { needsFull = true; }
  prevGlitchOn = gOn;
}

// HUD: medidor de som (o "quanto te ouviam agora") + fôlego
function drawHUD() {
  if (stats[0] !== 1) return;
  const x0 = 4, y0 = 3;
  const lvl = stats[10];
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = k < lvl
      ? (lvl === 3 ? '#ff5000' : '#c98a00')
      : 'rgba(107,68,0,0.30)';
    ctx.fillRect(x0 + k * 9, y0, 6, 9);
  }
  const stam = stats[11] / 100;
  ctx.fillStyle = 'rgba(60,38,0,0.55)';
  ctx.fillRect(x0, y0 + 13, 30, 4);
  ctx.fillStyle = stats[11] < 25 ? '#ff5000' : '#8a5f00';
  ctx.fillRect(x0, y0 + 13, Math.max(2, Math.round(30 * stam)), 4);
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
      drainEvents();
      if (stats[0] !== 1) break;
    }
    heartbeat(nowMs);
    droneSwell();
  } else {
    acc = 0; // menus: fluxo em tempo real não roda
    droneSwell(); // garante que o droneVolta ao normal fora do jogo
    if (st !== lastState) {
      drainEvents(); // garantir que eventos finais (morte/vitória) soem
    }
  }
  lastState = stats[0];

  render(nowMs);
  drawHUD();
  requestAnimationFrame(frame);
}

function drainEvents() {
  let e;
  const dx = stats[5] - stats[3];
  const dy = stats[6] - stats[4];
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const pan = Math.max(-1, Math.min(1, dx / 8));
  while ((e = w.pfb_pop_event()) !== 0) {
    if (e === 5 || (e >= 14 && e <= 16)) glitchUntil = performance.now() + 280; // vislumbre: o sinal "solta"
    playEvent(e, (e === 12 || e === 13) ? pan : (e >= 10 && dist > 2 ? pan * 0.6 : 0));
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
