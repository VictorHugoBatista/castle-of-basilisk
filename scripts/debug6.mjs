// Bot v2: rotas que evitam o cone de gaze; esquiva com queda rápida p/ fuga.
import { readFileSync } from 'node:fs';
const bytes = readFileSync(new URL('../web/wasm/castle_of_basilisk.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const w = instance.exports;
const W = 56, H = 32;
const stats = new Uint8Array(w.memory.buffer, w.pfb_stats_ptr(), 16);
const map = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), W * H);

const pass = (i) => [0x2E, 0x2C, 0x3E, 0x3C, 0x2B, 0xA7].includes(map[i]);
const findTile = (t) => { for (let i = 0; i < W * H; i++) if (map[i] === t) return i; return -1; };

// zona de perigo: LOS da basilisco <= 9 OU distância <= 3 (junções cegas)
let dangerMemo = null;
function danger(x, y) {
  const i = y * W + x;
  if (dangerMemo[i] === undefined) {
    const p = w.pfb_debug_probe(x, y);
    dangerMemo[i] = ((p & 2) !== 0 && (p >> 2) <= 9) || (p >> 2) <= 3;
  }
  return dangerMemo[i];
}
function dangerToWalkable(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  return pass(y * W + x) && !danger(x, y);
}

function bfsRoute(target, avoid) {
  const start = stats[3] + stats[4] * W;
  if (!pass(target)) return null;
  const prev = new Int32Array(W * H).fill(-1);
  const q = [start];
  prev[start] = start;
  let reached = false;
  for (let qh = 0; qh < q.length && !reached; qh++) {
    const c = q[qh];
    if (c === target) { reached = true; break; }
    const cx = c % W, cy = (c / W) | 0;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (prev[ni] !== -1) continue;
      if (!pass(ni)) continue;
      if (avoid && danger(nx, ny)) continue;
      prev[ni] = c;
      q.push(ni);
    }
  }
  if (!reached) return null;
  const cells = [];
  let c = target;
  while (c !== start) { cells.push(c); c = prev[c]; }
  return cells.reverse();
}

const dirBit = (d) => { if (d.dy < 0) return 1; if (d.dy > 0) return 2; if (d.dx < 0) return 4; if (d.dx > 0) return 8; return 0; };
const dirTo = (from, to) => dirBit({ dx: (to % W) - (from % W), dy: ((to / W) | 0) - ((from / W) | 0) });

// esquiva geométrica: foge no eixo de afastamento; o eixo fica travado até travar a rota
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
  // preferido primeiro, depois o outro eixo
  if (sx !== 0) opts.push([sx, 0]);
  if (sy !== 0) opts.push([0, sy]);
  if (sx === 0) { opts.push([1, 0]); opts.push([-1, 0]); }  // mesma coluna: lateral
  if (sy === 0) { opts.push([0, 1]); opts.push([0, -1]); }  // mesma linha: lateral
  if (prefX) opts.reverse();
  for (const [dx, dy] of opts) {
    if (walk(dx, dy)) {
      fleeAxisWasX = dy === 0;
      return { dx, dy };
    }
  }
  return null; // os dois eixos travados: imóvel
}

let wins = 0, deaths = 0, winsSteps = 0;
let dumped = false;
for (let attempts = 0; attempts < 40; attempts++) {
  const seed = 1000 + attempts * 7919;
  w.pfb_new_game(seed);
  let steps = 0;
  let route = null, rIdx = 0, lastTarget = -1, recalcAt = 0;
  fleeAxisWasX = null;
  const hist = [];
  for (; steps < 14000 && stats[0] === 1; steps++) {
    let target;
    if (stats[8] === 1) target = findTile(0x3C);              // com coroa: sempre '<'
    else if (stats[2] < 3) target = findTile(0x3E);           // sem coroa: desce
    else target = findTile(0xA7);                             // andar 3: coroa
    if (target < 0) break;

    // está parado sobre o alvo (ex.: a porta '<' após descer)? dê um passo fora e volte
    const pos0 = stats[3] + stats[4] * W;
    if (target === pos0) {
      const px = stats[3], py = stats[4];
      let stepped = false;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (pass(ni)) {
          w.pfb_step(dirBit({ dx, dy }));
          stepped = true;
          break;
        }
      }
      if (!stepped) break; // sem vizinho: desistimos (não deve ocorrer)
      if (stats[0] !== 1) break;
      continue;
    }

    // (re)planejamento periódico, pois o basilisco anda
    if (target !== lastTarget || steps >= recalcAt || route === null) {
      dangerMemo = new Array(W * H); // zona de perigo nova a cada planejamento
      route = bfsRoute(target, true) || bfsRoute(target, false);
      rIdx = 0;
      lastTarget = target;
      recalcAt = steps + 6;
      if (route === null) {
        console.log(`BREAK: rota impossível! target=${target} (${target % W},${(target / W) | 0}) ` +
          `ch=${String.fromCharCode(map[target])} pos=(${stats[3]},${stats[4]}) depth=${stats[2]}`);
        break;
      }
    }
    if (route === null) break;
    if (route.length === 0) {
      console.log(`BREAK: rota vazia (target == pos?): target=(${target % W},${(target / W) | 0}) pos=(${stats[3]},${stats[4]}) depth=${stats[2]} crown=${stats[8]}`);
      break;
    }

    const pos = stats[3] + stats[4] * W;
    if (pos === route[rIdx]) rIdx++;
    if (rIdx >= route.length) {
      console.log(`BREAK: fim da rota: pos=(${stats[3]},${stats[4]}) target=(${target % W},${(target / W) | 0}) depth=${stats[2]} crown=${stats[8]}`);
      break;
    }
    const nxt = route[rIdx];

    const basDist = w.pfb_debug_probe(stats[3], stats[4]) >> 2;
    const hunted = stats[7] === 2;
    const stepP = w.pfb_debug_probe(nxt % W, (nxt / W) | 0);
    const stepDanger = (stepP & 2) !== 0 && (stepP >> 2) <= 8;

    let mvBit;
    if ((hunted && basDist <= 9) || stepDanger) {
      const dg = dodge();
      mvBit = dg ? dirBit(dg) : dirTo(pos, nxt); // sem saída: segue plano
    } else {
      mvBit = dirTo(pos, nxt);
    }
    hist.push([stats[2], stats[8], stats[3], stats[4], stats[5], stats[6], stats[7], mvBit]);
    w.pfb_step(mvBit);
    if (stats[0] !== 1) break;
  }
  if (stats[0] === 3) { wins++; winsSteps = Math.max(winsSteps, steps); }
  else if (stats[0] === 2) {
    deaths++;
    if (!dumped) {
      dumped = true;
      console.log(`\n=== morte #1 seed ${seed} reason ${stats[1]} steps ${steps} ===`);
      console.log('[depth,crown,px,py,bx,by,bstate,mvBit]');
      for (const h of hist.slice(-32)) console.log(h.join(','));
    }
  }
  console.log(`attempt ${attempts} seed ${seed}: state=${stats[0]} depth=${stats[2]} crown=${stats[8]} steps=${steps} reason=${stats[1]}`);
}
console.log(`vitórias: ${wins}/40, mortes: ${deaths}, melhor jogo: ${winsSteps} steps`);
process.exit(wins > 0 ? 0 : 1);
