// Teste headless: título, cenários de morte, IA e um playthrough completo via BFS.
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../web/wasm/castle_of_basilisk.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const w = instance.exports;
const W = 56, H = 32;

w.pfb_init();
const stats = new Uint8Array(w.memory.buffer, w.pfb_stats_ptr(), 16);
let grid = new Uint8Array(w.memory.buffer, w.pfb_grid_ptr(), W * H * 2);
let map = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), W * H);

function dump(label) {
  console.log(`\n=== ${label} ===`);
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const ch = grid[(y * W + x) * 2];
      row += ch === 0xA7 ? '§' : String.fromCharCode(ch);
    }
    console.log('|' + row + '|');
  }
}

let evSeen = {};
function pump() {
  let e;
  while ((e = w.pfb_pop_event()) !== 0) evSeen[e] = (evSeen[e] || 0) + 1;
  checkBody();
}

// o corpo ('~', attr 0x0B) ficou visível em tela em algum momento do teste
let bodySeen = false;
function checkBody() {
  if (stats[0] !== 1 || bodySeen) return;
  for (let i = 0; i < W * H; i++) {
    if ((grid[i * 2 + 1] & 0x7f) === 0x0B) { bodySeen = true; return; }
  }
}

// ---------- 1. título ----------
dump('TITLE');
if (stats[0] !== 0) { console.error('FAIL: title state'); process.exit(1); }

// ---------- 2. cenários de morte/alerta ----------
function findCell(pred) {
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const p = w.pfb_debug_probe(x, y);
      if (pred(p, x, y)) return { x, y, p };
    }
  return null;
}
function place(x, y) { w.pfb_debug_place(x, y); }

function scenario(name, fn) {
  w.pfb_new_game(1234567);
  const r = fn();
  console.log(`${r ? 'PASS' : 'FAIL'} - ${name}`);
  return r;
}

// 2a. olhar mútuo → morte (motivo 1) — aquece 15 ticks para passar o GRACE
const gaze = scenario('gaze mata (O OLHAR TE ENCONTROU)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 16; k++) { w.pfb_step(0); pump(); }
  const c = findCell((p) => (p & 1) && (p & 2) && ((p >> 2) <= 5) && ((p >> 2) >= 2));
  if (!c) return false;
  place(c.x, c.y);
  w.pfb_step(0); pump();
  return stats[0] === 2 && stats[1] === 1;
});

// 2b. toque → morte (motivo 2)
const touch = scenario('toque mata (AS ESCAMAS)', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 16; k++) { w.pfb_step(0); pump(); }
  const c = findCell((p) => (p & 1) && ((p >> 2) === 1));
  if (!c) return false;
  place(c.x, c.y);
  w.pfb_step(0); pump();
  return stats[0] === 2 && stats[1] === 2;
});

// 2c. ruído → IA investiga
const alert = scenario('ruído acorda IA (EV_ALERT -> INVEST)', () => {
  w.pfb_new_game(1234567);
  const c = findCell((p) => (p & 1) && !(p & 2) && ((p >> 2) <= 5));
  if (!c) return false;
  place(c.x, c.y);
  // move para uma célula vizinha caminhável (gera STEP -> ruído)
  const dirs = [[0, -1, 1], [0, 1, 2], [-1, 0, 4], [1, 0, 8]];
  let moved = false;
  for (const [dx, dy, bit] of dirs) {
    const nx = c.x + dx, ny = c.y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    if (w.pfb_debug_probe(nx, ny) & 1) { w.pfb_step(bit); moved = true; break; }
  }
  if (!moved) return false;
  pump();
  return stats[7] === 1 && !!evSeen[10];
});

// 2d. o rastro: cada passo dela deixa escamas para trás
const trail = scenario('o corpo dela deixa rastro de escamas', () => {
  w.pfb_new_game(1234567);
  for (let k = 0; k < 60; k++) { w.pfb_step(0); pump(); }
  const body = new Uint8Array(w.memory.buffer, w.pfb_debug_body_ptr(), 49);
  const len = body[0];
  if (len < 1 || len > 24) return false;
  const hx = stats[5], hy = stats[6];
  for (let k = 0; k < len; k++) {
    const x = body[1 + k * 2], y = body[2 + k * 2];
    if (x >= W || y >= H) return false;
    if (x === hx && y === hy) return false; // anel jamais coincide com a cabeça
  }
  // fim do rastro (último par) tem que ser posição diferente do primeiro (ela andou)
  const fx = body[1], fy = body[2];
  const lx = body[1 + (len - 1) * 2], ly = body[2 + (len - 1) * 2];
  return fx !== lx || fy !== ly;
});

// ---------- 3. playthrough com bot v2 ----------
// Bot "surdo" (pior caso: humano tem o coração/áudio como aviso prévio).
// Estratégia: rota BFS que evita a zona de perigo (LOS ≤9 ou dist ≤3),
// replanejamento periódico, esquiva geométrica com eixo travado e
// desvio do tile quando já está parado sobre o alvo.
const pass = (i) => {
  const t = map[i];
  return t === 0x2E || t === 0x2C || t === 0x3E || t === 0x3C || t === 0x2B || t === 0xA7;
};
function findTile(t) { for (let i = 0; i < W * H; i++) if (map[i] === t) return i; return -1; }

let dangerMemo = null;
function danger(x, y) {
  const i = y * W + x;
  if (dangerMemo[i] === undefined) {
    const p = w.pfb_debug_probe(x, y);
    dangerMemo[i] = ((p & 2) !== 0 && (p >> 2) <= 9) || (p >> 2) <= 3;
  }
  return dangerMemo[i];
}
function bfsRoute(target, avoid) {
  const start = stats[3] + stats[4] * W;
  if (!pass(target)) return null;
  const prev = new Int32Array(W * H).fill(-1);
  const q = [start]; prev[start] = start;
  let reached = false;
  for (let qh = 0; qh < q.length && !reached; qh++) {
    const c = q[qh];
    if (c === target) { reached = true; break; }
    const cx = c % W, cy = (c / W) | 0;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (prev[ni] !== -1 || !pass(ni)) continue;
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
const dirTo = (from, to) => dirBit({ dx: (to % W) - (from % W), dy: ((to / W) | 0) - ((from / W) | 0) });

// esquiva geométrica: foge no eixo de afastamento; eixo travado evita zigzag
let fleeAxisWasX = null;
function dodge() {
  const bx = stats[5], by = stats[6], px = stats[3], py = stats[4];
  const dxs = px - bx;
  const dys = py - by;
  const sx = dxs === 0 ? 0 : Math.sign(dxs);
  const sy = dys === 0 ? 0 : Math.sign(dys);
  const domX = Math.abs(dxs) >= Math.abs(dys);
  const prefX = fleeAxisWasX === null ? domX : fleeAxisWasX;
  const walk = (dx, dy) => {
    const nx = px + dx, ny = py + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
    return pass(ny * W + nx);
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

map = new Uint8Array(w.memory.buffer, map.byteOffset, map.length); // re-sincroniza

let playthroughOK = false, attempts = 0, deathReasons = {};
while (attempts < 40 && !playthroughOK) {
  attempts++;
  w.pfb_new_game(1000 + attempts * 7919);
  let steps = 0; let won = false;
  let route = null, rIdx = 0, lastTarget = -1, recalcAt = 0;
  fleeAxisWasX = null;
  while (steps < 9000 && stats[0] === 1) {
    steps++;
    let target;
    if (stats[8] === 1) target = findTile(0x3C);       // com coroa: sempre '<'
    else if (stats[2] < 3) target = findTile(0x3E);    // sem coroa: desce
    else target = findTile(0xA7);                      // andar 3: a coroa
    if (target < 0) break;

    const pos0 = stats[3] + stats[4] * W;
    if (target === pos0) {
      // já está sobre o alvo (ex.: emergiu do '<' no térreo): passo fora
      const px = stats[3], py = stats[4];
      let stepped = false;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (pass(ny * W + nx)) {
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
      dangerMemo = new Array(W * H);
      route = bfsRoute(target, true) || bfsRoute(target, false);
      rIdx = 0;
      lastTarget = target;
      recalcAt = steps + 6;
    }
    if (route === null || route.length === 0) break;
    const pos = stats[3] + stats[4] * W;
    if (pos === route[rIdx]) rIdx++;
    if (rIdx >= route.length) break;
    const nxt = route[rIdx];

    const basDist = w.pfb_debug_probe(stats[3], stats[4]) >> 2;
    const hunted = stats[7] === 2;
    const stepP = w.pfb_debug_probe(nxt % W, (nxt / W) | 0);
    const stepDanger = (stepP & 2) !== 0 && (stepP >> 2) <= 8;

    let mvBit;
    if ((hunted && basDist <= 9) || stepDanger) {
      const dg = dodge();
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

console.log(bodySeen
  ? 'PASS - corpo ficou visível em tela em algum momento (vislumbre OK)'
  : 'FAIL - corpo nunca ficou visível em tela');

console.log('\neventos vistos:', evSeen);
const all = [gaze, touch, alert, trail, playthroughOK, bodySeen, traps === 0].every(Boolean);
console.log(all ? 'SMOKE OK' : 'SMOKE FAILED');
process.exit(all ? 0 : 1);
