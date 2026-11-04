// Bancada do medo: mesmo bot do debug6 (surdinho, evita o cone dela), mas
// instrumenta a curva de medo por tick: níveis visitados, pico, alucinações
// nascidas (EV_WHISPER), evaporadas, falso B e coroa-fantasma em tela.
// Uso: node scripts/fear_bench.mjs [n jogos]
import { readFileSync } from 'node:fs';

const bytes = readFileSync(new URL('../web/wasm/castle_of_basilisk.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(bytes, {});
const w = instance.exports;
const N = Number(process.argv[2] || 40);

w.pfb_init();
const stats = new Uint8Array(w.memory.buffer, w.pfb_stats_ptr(), 32);
let W = 56, H = 32;
let map = null;
function ensureViews() {
  const key = stats[16] | (stats[17] << 8) | (stats[2] << 16);
  if (map && key === ensureViews.k) return;
  ensureViews.k = key;
  W = stats[16]; H = stats[17];
  map = new Uint8Array(w.memory.buffer, w.pfb_debug_map_ptr(), W * H);
}
ensureViews();

const pass = (i) => [0x2E, 0x2C, 0x3E, 0x3C, 0x2B, 0xA7, 0x3D, 0xA5].includes(map[i]); // 0x3D = água '=' · 0xA5 = caveira '¥'
const findTile = (t) => { for (let i = 0; i < W * H; i++) if (map[i] === t) return i; return -1; };

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
const dirBit = (d) => { if (d.dy < 0) return 1; if (d.dy > 0) return 2; if (d.dx < 0) return 4; if (d.dx > 0) return 8; return 0; };
const dirTo = (from, to) => dirBit({ dx: (to % W) - (from % W), dy: ((to / W) | 0) - ((from / W) | 0) });
let fleeAxisWasX = null;
function dodge() {
  const bx = stats[5], by = stats[6], px = stats[3], py = stats[4];
  const dxs = px - bx, dys = py - by;
  const sx = dxs === 0 ? 0 : Math.sign(dxs);
  const sy = dys === 0 ? 0 : Math.sign(dys);
  const prefX = fleeAxisWasX === null ? Math.abs(dxs) >= Math.abs(dys) : fleeAxisWasX;
  const walk = (dx, dy) => {
    const nx = px + dx, ny = py + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
    return pass(ny * W + nx);
  };
  const opts = [];
  if (sx !== 0) opts.push([sx, 0]);
  if (sy !== 0) opts.push([0, sy]);
  if (sx === 0) { opts.push([1, 0]); opts.push([-1, 0]); }
  if (sy === 0) { opts.push([0, 1]); opts.push([0, -1]); }
  if (prefX) opts.reverse();
  for (const [dx, dy] of opts) if (walk(dx, dy)) { fleeAxisWasX = dy === 0; return { dx, dy }; }
  return null;
}

const fptr = w.pfb_debug_fear_ptr();
let fdv = null;
function fearMirror() {
  fdv = fdv && fdv.buffer === w.memory.buffer ? fdv : new DataView(w.memory.buffer, fptr, 20);
  w.pfb_debug_fear_ptr(); // publica o espelho fresco
  return {
    fear: fdv.getUint32(0, true),
    lvl: fdv.getUint32(4, true),
    ghosts: fdv.getUint32(8, true),
    fake: fdv.getUint32(12, true),
    crown: fdv.getUint32(16, true),
  };
}

let wins = 0, deaths = 0, deathsBy = {}, stalls = 0;
const agg = { lvlTicks: [0, 0, 0, 0, 0], spawns: 0, vanishes: 0, vanishesC: 0, whelps: 0, fakeTicks: 0, crownTicks: 0 };
let gamesWithHalluc = 0, gamesLvl1 = 0, gamesLvl2 = 0;
const perGame = [];

for (let g = 0; g < N; g++) {
  const seed = 1000 + g * 7919;
  w.pfb_new_game(seed);
  ensureViews();
  let route = null, rIdx = 0, lastTarget = -1, recalcAt = 0;
  fleeAxisWasX = null;
  const lvl = [0, 0, 0, 0, 0];
  let peak = 0, spawned = 0, fakeT = 0, crownT = 0, maxDepth = 0;
  let steps = 0;
  for (; steps < 14000 && stats[0] === 1; steps++) {
    ensureViews();
    let target;
    if (stats[8] === 1) target = findTile(0x3C);
    else if (stats[2] < 5) target = findTile(0x3E);
    else target = findTile(0xA7);
    if (target < 0) break;

    const pos0 = stats[3] + stats[4] * W;
    if (target === pos0) {
      const px = stats[3], py = stats[4];
      let stepped = false;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (pass(ny * W + nx)) { w.pfb_step(dirBit({ dx, dy })); stepped = true; break; }
      }
      if (!stepped) break;
      if (stats[0] !== 1) break;
    } else {
      if (target !== lastTarget || steps >= recalcAt || route === null) {
        dangerMemo = new Array(W * H);
        route = bfsRoute(target, true) || bfsRoute(target, false);
        rIdx = 0; lastTarget = target; recalcAt = steps + 6;
        if (route === null) break;
      }
      if (route.length === 0) break;
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
        if (dg === null) continue; // sem saída: Espera um tick — ela se move (celas são esconderijo legítimo)
        mvBit = dirBit(dg);
      } else mvBit = dirTo(pos, nxt);
      w.pfb_step(mvBit);
      if (stats[0] !== 1) break;
    }

    // ---- telemetria do medo ----
    let e;
    while ((e = w.pfb_pop_event()) !== 0) {
      if (e === 18) { spawned++; agg.spawns++; }
      else if (e === 20) agg.vanishes++;
      else if (e === 21) agg.vanishesC++;
      else if (e === 19) agg.whelps++;
    }
    const m = fearMirror();
    lvl[Math.min(m.lvl, 4)]++;
    if (m.fear > peak) peak = m.fear;
    if (m.fake) { fakeT++; agg.fakeTicks++; }
    if (m.crown) { crownT++; agg.crownTicks++; }
    if (stats[2] > maxDepth) maxDepth = stats[2];
  }
  lvl.forEach((t, i) => agg.lvlTicks[i] += t);
  if (stats[0] === 3) wins++;
  else if (stats[0] === 2) { deaths++; deathsBy[stats[1]] = (deathsBy[stats[1]] || 0) + 1; }
  else stalls++; // tempo esgotado: o bot surdo pode travar no dodge infinito (não é morte)
  if (lvl[1] + lvl[2] + lvl[3] + lvl[4] > 0) gamesLvl1++;
  if (lvl[2] + lvl[3] + lvl[4] > 0) gamesLvl2++;
  if (spawned + fakeT + crownT > 0) gamesWithHalluc++;
  perGame.push({ seed, win: stats[0] === 3, dead: stats[0] === 2, reason: stats[1], steps, peak, lvl, spawned, fakeT, crownT, maxDepth });
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const tot = agg.lvlTicks.reduce((a, b) => a + b, 0) || 1;
console.log(`\n=== bancada do medo: ${N} jogos (bot surdo do debug6) ===`);
console.log(`vitórias: ${wins}/${N}  mortes: ${deaths} (motivos: ${JSON.stringify(deathsBy)})  travados: ${stalls} (bot no dodge infinito — a morte dele continua sendo só dela)`);
console.log(`ticks por nível (bruto, TRAVADOS incluídos): ${agg.lvlTicks.map((t) => (100 * t / tot).toFixed(1) + '%').join(' ')}`);
const resolved = perGame.filter((g) => g.win || g.dead);
const rlv = [0, 1, 2, 3, 4].map((i) => resolved.reduce((a, g) => a + g.lvl[i], 0));
const rtot = rlv.reduce((a, b) => a + b, 0) || 1;
console.log(`jogos RESOLVIDOS (${resolved.length}): ticks por nível: ${rlv.map((t) => (100 * t / rtot).toFixed(1) + '%').join(' ')}`);
console.log(`jogos que alcançaram nv1+ : ${gamesLvl1}/${N}   nv2+ : ${gamesLvl2}/${N}`);
console.log(`jogos com ALUCINAÇÃO vista (fantasma/falso B/coroa): ${gamesWithHalluc}/${N}`);
console.log(`pico de medo: mediana ${med(perGame.map((g) => g.peak))}, máx ${Math.max(...perGame.map((g) => g.peak))}`);
console.log(`fantasmas nascidos: ${agg.spawns}  evaporados: ${agg.vanishes + agg.vanishesC}  soluços: ${agg.whelps}`);
console.log(`ticks com falso B em tela: ${agg.fakeTicks}   com coroa-fantasma: ${agg.crownTicks}`);
console.log('\npor jogo (seed, resultado, steps, pico, ticks nv1+/nv2+/nv3+, aluc):');
for (const g of perGame) {
  const up = g.lvl[1] + g.lvl[2] + g.lvl[3] + g.lvl[4];
  const hi = g.lvl[2] + g.lvl[3] + g.lvl[4];
  console.log(`  ${g.seed} ${g.win ? 'WIN ' : g.dead ? 'D' + g.reason : 'TRAV'} steps=${String(g.steps).padStart(5)} pico=${String(g.peak).padStart(3)} nv1+=${String(up).padStart(5)} nv2+=${String(hi).padStart(5)} nv3+=${String(g.lvl[3]).padStart(4)} aluc=${g.spawned + g.fakeT + g.crownT}`);}
