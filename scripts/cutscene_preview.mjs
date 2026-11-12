// ============================================================
// preview da cutscene no terminal
// ============================================================
// A lente de autoria da cutscene: imprime as cenas exatamente como
// o jogo desenha (mesmos glifos, mesmas cores de CUT_PAL em ANSI
// 24-bit) — mais uma régua de colunas e um relatório de linhas fora
// do gabarito 56. A arte se escreve AQUI primeiro; o browser é a
// conferência final.
//
//   node scripts/cutscene_preview.mjs          # todas as cenas
//   node scripts/cutscene_preview.mjs 3        # só a cena 3 (0-based)
//   node scripts/cutscene_preview.mjs --texto  # só os textos rolando

import { CUT_PAL, CUT_TEXT, CUT_W, CUT_H, CUT_SCENES }
  from '../web/cutscene.js';

function ansi(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function ruler() {
  const tens = '         0         1         2         3         4         5     ';
  const ones = '0123456789012345678901234567890123456789012345678901234567890123';
  return DIM + tens.slice(0, CUT_W) + '\n' + ones.slice(0, CUT_W) + RESET;
}

function printScene(si) {
  const sc = CUT_SCENES[si];
  const pal = CUT_PAL;
  console.log(`\n\x1b[1m=== cena ${si} — ${sc.dur}ms · fx ${sc.fx}` +
    `${sc.sweep ? ' + sweep' : ''} ===${RESET}`);
  console.log(ruler());
  for (let y = 0; y < CUT_H; y++) {
    const line = sc.art[y] || '';
    let out = '';
    for (let x = 0; x < CUT_W; x++) {
      const ch = line[x] ?? ' ';
      const attr = sc.map[ch] ?? sc.def;
      out += (ch === ' ' ? ' ' : ansi(pal[attr & 0x7f]) + ch) + RESET;
    }
    console.log(out + (line.length !== CUT_W
      ? `  ${DIM}<-- ${line.length} cols${RESET}` : ''));
  }
  console.log(`\n${DIM}texto rolando:${RESET}`);
  console.log(DIM + CUT_TEXT[si] + RESET);
  if (sc.eyes) {
    console.log(`${DIM}olhos: ${sc.eyes.map(([x, y, t]) => `(${x},${y}) ${t}ms`).join(' · ')}${RESET}`);
  }
}

const args = process.argv.slice(2);
if (args.includes('--texto')) {
  CUT_TEXT.forEach((t, i) => console.log(`\n[scene ${i}]\n${t}`));
} else {
  const only = args.map(Number).filter(n => !Number.isNaN(n));
  const scenes = only.length ? only : CUT_SCENES.map((_, i) => i);
  for (const si of scenes) printScene(si);
}
