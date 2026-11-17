// Auditoria JS -> RUST: o glue (web/game.js) vive de apresentação — render por
// diff, WebAudio sintetizada, input, cutscene (contrato do ARCHITECTURE.md §3).
// Mas código de DECISÃO do jogo que nasce no glue é duplicata do RT: apodrece
// em dois lugares e desanda o determinismo do WASM. Esta ferramenta varre o
// game.js, APRESENTA os candidatos com evidência e veredito sugerido, e registra
// a decisão DO MANTENEDOR (scripts/js2rust_decisions.json). Nada é transferido
// às cegas: só o que o mantenedor aprovou, e só por RECEITA VERIFICADA (padrão
// esperado no código; o código mudou por baixo → falha limpa, sem edit surpresa).
//
// uso:
//   node scripts/js2rust.mjs                 relatório (não decide nada)
//   node scripts/js2rust.mjs --decidir       decide candidato a candidato (tty)
//   node scripts/js2rust.mjs --responder id=transferir,id2=manter  registra
//   node scripts/js2rust.mjs --aplicar [id…] executa as transferências aprovadas
//   node scripts/js2rust.mjs --gate          exit 1 se houver candidato sem decisão
//
// decisões: transferir (receita registrada aplica; sem receita, fica anotado
// para migração manual) · manter (mora no JS por design — o registro impede o
// re-scan de reapresentar) · depois (fica na fila, reapresentado).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const F_JOGO = path.join(RAIZ, 'web/game.js');
const F_CONSTS = path.join(RAIZ, 'src/consts.rs');
const F_DECIS = path.join(RAIZ, 'scripts/js2rust_decisions.json');

// ============================================================
// análise estática (zero deps: regex de linha, como o repo manda)
// ============================================================

// funções top-level de game.js + a seção `// ====` em que cada uma mora
function extraiFuncoes(src) {
  const linhas = src.split('\n');
  const fns = [];
  let secao = '';
  for (let i = 0; i < linhas.length; i++) {
    // cabeçalho de seção: barra, título comentado, barra — três linhas seguidas
    if (/^\/\/ =+/.test(linhas[i]) && /^\/\/ (?! =)/.test(linhas[i + 1] || '') && /^\/\/ =+/.test(linhas[i + 2] || '')) {
      secao = (linhas[i + 1] || '').replace(/^\/\/\s*/, '').trim();
    }
    const m = linhas[i].match(/^function ([A-Za-z_$][\w$]*)\s*\(/);
    if (!m) continue;
    let aberto = false, prof = 0, fim = i;
    for (let j = i; j < linhas.length; j++) {
      for (const c of linhas[j]) {
        if (c === '{') { aberto = true; prof++; }
        else if (c === '}') prof--;
      }
      if (aberto && prof <= 0) { fim = j; break; }
    }
    fns.push({ nome: m[1], secao, ini: i + 1, fim: fim + 1, corpo: linhas.slice(i, fim + 1).join('\n') });
  }
  return fns;
}

// evidências de cada função — o que ela toca decide a classe dela
function evidencias(corpo) {
  // limiares de andar: números comparados CONTRA stats[2] ou contra a variável
  // que o carrega (`const d = stats[2]`) — nada de `[<=] [135]` solto, que
  // casava qualquer `x < 5` de render
  const vars = ['stats\\[2\\]'];
  for (const m of corpo.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*stats\[2\]/g)) vars.push(m[1]);
  const limiares = [];
  for (const v of vars) {
    for (const m of corpo.matchAll(new RegExp(v + '\\s*(?:<=|>=|<|>)\\s*(\\d+)', 'g'))) limiares.push(+m[1]);
  }
  return {
    pele: /\bctx\.|\bcanvas\b|\bdocument\.|\bshadow|\bPAL\b|\bwrapEl\b|\bfearv\b|\bstyle\.|\brequestAnimationFrame|\bglitch|CUT_/.test(corpo),
    audio: /\bAC\b|\bmaster\b|\bsfxBus\b|\bnoiseBurst\b|\bblip\(|\bgain\b|setAmbience|droneSwell|\bsched[A-Z]|audioOn/.test(corpo),
    input: /\bheld\b|\brunHeld\b|\bKEYMAP\b|\bMENU_CODES\b|\be\.code\b|\bIN_[A-Z]/.test(corpo),
    estado: /\bstats\[|\bw\.pfb_|\bmapview\[|\bgrid\[|\buirow\b/.test(corpo),
    entropia: /\bMath\.random\b|\bDate\.now\b/.test(corpo),
    limiares,
    escrita: /stats\[\d+\]\s*=(?!=)/.test(corpo),
    pfb: /\bw\.pfb_\w+\(/.test(corpo),
  };
}

// limites de andar que o RT decide em theme() (src/consts.rs) — a régua da
// checagem de duplicata: `if depth <= 1 / else if depth <= 3 / <= 5`
function limiaresDoRT(consts) {
  return new Set([...consts.matchAll(/(?:else )?if depth <= (\d+)/g)].map(m => +m[1]));
}

// ============================================================
// conhecimento: candidatos conhecidos, com veredito e racional
// ============================================================

// funções cuja morada no JS é DECISÃO DE CONTRATO (documentada no ARCHITECTURE):
// aparecem no relatório com veredito MANTER para o registro ficar explícito.
const KB = {
  ambientTheme: {
    id: 'tema-stats', veredito: 'transferir', receita: 'tema-stats',
    porque: 're-deriva os limites de andar (<=1/<=3/<=5) que o RT já decide em theme() (consts.rs) — duplicata de decisão: mudou a régua do tema, mudava em dois lugares (e o esquecimento era silencioso). A receita publica o tema no STATS[21] e o glue passa a ler.',
  },
  startGame: {
    veredito: 'manter',
    porque: 'a semente nasce de Date.now() no JS — entropia do browser, sim, mas DELIBERADA: wasm32-unknown-unknown não tem relógio (nenhum host import, regra da ABI crua) e a semente é O único input externo do mundo; o smoke injeta as próprias sementes por pfb_new_game(seed). Transferir exigiria I/O no RT.',
  },
  menuStep: {
    veredito: 'manter',
    porque: 'a leitura de STATS[13] aqui é o aperto de mão do menu documentado (o RT pede, o JS semeia pfb_new_game) — input glue por contrato, não decisão de jogo.',
  },
  hudW: {
    veredito: 'manter',
    porque: 'largura da placa do HUD (pele desenhada no canvas): a pele consulta o estado do RT para SE VESTIR (stats[8]/[20] — carrega item?) — decisão de jogo nenhuma mora aqui.',
  },
  worldAttr: {
    veredito: 'manter',
    porque: 'leitura da vizinhança do grid para o render da serpente (sombra/halo fora da célula) — leitura de apresentação, decisão nenhuma.',
  },
};

// receitas de transferência: só executam o que o mantenedor aprovou, e cada
// edit confere o padrão esperado ANTES de escrever (código mudou → falha limpa)
const RECEITAS = {
  'tema-stats': {
    titulo: 'tema do andar publicado no STATS[21] (espelho de theme()); ambientTheme() passa a ler',
    edits: () => [
      { arquivo: 'src/ui.rs', busca: '        STATS[20] = (SHARD || CROWN) as u8;',
        troca: `        STATS[20] = (SHARD || CROWN) as u8;
        // [21]: tema do andar (índice de PALETA JS 0..3 = castelo/masmorra/
        // esgoto/Bocarra) — espelho de theme() (consts.rs): os limites de
        // andar são decisão do RT; o glue lê, nunca re-deriva
        STATS[21] = theme(DEPTH) - 1;` },
      { arquivo: 'src/state.rs', busca: `// STATS: 32 bytes — [18] medo (0..100), [19] nível do medo (0..4). Mudança
// ADITIVA: os índices [0..17] seguem idênticos; o JS só re-dimensiona a view.`,
        troca: `// STATS: 32 bytes — [18] medo (0..100), [19] nível do medo (0..4), [21] tema
// (índice de paleta JS 0..3). Mudança ADITIVA: os índices [0..17] seguem
// idênticos; o JS só re-dimensiona a view.` },
      { arquivo: 'web/game.js', busca: `// tema derivado de DEPTH: 0 castelo · 1 masmorra · 2 esgoto · 3 Bocarra (acervo)
function ambientTheme() {
  const d = stats[2];
  return d <= 1 ? 0 : (d <= 3 ? 1 : (d <= 5 ? 2 : 3));
}`,
        troca: `// tema (índice 0..3: castelo · masmorra · esgoto · Bocarra) publicado NO RT
// (STATS[21] espelha theme(), consts.rs): os limites de andar não se re-derivam
// aqui — uma decisão, um lugar
function ambientTheme() {
  return stats[21];
}` },
      { arquivo: 'ARCHITECTURE.md', busca: `  chia: o fragmento sombrio OU a coroa, a mesma matéria; espelho da cerca
  do heart_tick, evento 24)\`.`,
        troca: `  chia: o fragmento sombrio OU a coroa, a mesma matéria; espelho da cerca
  do heart_tick, evento 24)\`,
  \`[21] tema do andar (índice de paleta JS 0..3 — espelho de theme() de
  consts.rs: os limites de andar são decisão do RT; o glue não re-deriva)\`.` },
    ],
  },
};

// ============================================================
// candidatos do scan corrente
// ============================================================

function scanCandidatos() {
  const jogo = readFileSync(F_JOGO, 'utf8');
  const consts = readFileSync(F_CONSTS, 'utf8');
  const rtLimiares = limiaresDoRT(consts);
  const fns = extraiFuncoes(jogo);
  const cands = [];
  const verde = [];   // glue por contrato (apresentação/áudio/input/cutscene)
  const obs = [];     // funções glue com sinais estranhos — olho do mantenedor

  for (const fn of fns) {
    const ev = evidencias(fn.corpo);
    const onde = `web/game.js:${fn.ini}-${fn.fim} (${fn.secao || 'fora de seção'})`;
    const glue = ev.pele || ev.audio || ev.input;
    const kb = KB[fn.nome];

    // violação dura em qualquer lugar: o JS NUNCA escreve o estado do RT
    if (ev.escrita) {
      cands.push({ id: `escrita:${fn.nome}`, titulo: `${fn.nome}() ESCREVE no stats[]`, onde,
        evidencia: ['o glue não escreve o estado do RT — stats é espelho de leitura (contrato do layout)'],
        veredito: 'transferir', porque: 'violação de contrato: a escrita tem que nascer no RT (sync_stats).', receita: null });
      continue;
    }

    const logica = ev.estado && (ev.entropia || ev.limiares.some(n => rtLimiares.has(n)));
    if (glue && !logica) { verde.push(fn); continue; }
    if (glue && logica && !kb) {
      // glue legítimo com sinal estranho: só é OBSERVAÇÃO quando não é pele
      // nem áudio (a entropia ali é agendamento de som e glitch — por design);
      // input com sinal é o caso interessante (tecla decidindo jogo?)
      if (ev.input && !ev.pele && !ev.audio) obs.push({ fn, onde, ev });
      else verde.push(fn);
      continue;
    }
    if (!ev.estado) { verde.push(fn); continue; } // sem contato com o RT: apresentação pura

    // candidato: lógica morando no glue
    if (kb) {
      cands.push({ id: kb.id || fn.nome, titulo: `${fn.nome}()`, onde,
        evidencia: coletaEvidencia(ev, rtLimiares), veredito: kb.veredito, porque: kb.porque, receita: kb.receita || null });
    } else if (ev.entropia) {
      cands.push({ id: `entropia:${fn.nome}`, titulo: `${fn.nome}() decide com entropia do browser`, onde,
        evidencia: coletaEvidencia(ev, rtLimiares), veredito: 'revisar',
        porque: 'Math.random()/Date.now() num código que toca o estado do RT: se decide JOGO, desanda o determinismo do WASM — migrar ou justificar.', receita: null });
    } else if (ev.limiares.some(n => rtLimiares.has(n))) {
      cands.push({ id: `limiares:${fn.nome}`, titulo: `${fn.nome}() re-deriva limiares de andar do RT`, onde,
        evidencia: coletaEvidencia(ev, rtLimiares), veredito: 'revisar',
        porque: 'os mesmos limites que theme() (consts.rs) decide — duplicata candidata.', receita: null });
    } else {
      cands.push({ id: `logica:${fn.nome}`, titulo: `${fn.nome}() — lógica nova no glue (sem ficha)`, onde,
        evidencia: coletaEvidencia(ev, rtLimiares), veredito: 'revisar',
        porque: 'toca o estado do RT sem ser apresentação conhecida: ou mora no RT, ou entra na KB desta ferramenta com o racional.', receita: null });
    }
  }
  return { cands, verde, obs, fns };
}

function coletaEvidencia(ev, rtLimiares) {
  const e = [];
  if (ev.entropia) e.push('entropia do browser (Math.random/Date.now) dentro do código');
  const dup = ev.limiares.filter(n => rtLimiares.has(n));
  if (dup.length) e.push(`limiares de andar ${[...new Set(dup)].join('/')} re-derivados — os mesmos que theme() (consts.rs) decide`);
  if (ev.escrita) e.push('escrita em stats[] (o RT é o dono do estado)');
  if (!e.length) e.push('toca stats[]/pfb_* fora das bordas conhecidas de glue');
  return e;
}

// ============================================================
// decisões (registro do mantenedor)
// ============================================================

function carregaDecisoes() {
  if (!existsSync(F_DECIS)) return { decisoes: {}, aplicados: {} };
  return JSON.parse(readFileSync(F_DECIS, 'utf8'));
}
function salvaDecisoes(d) {
  d.explica = 'registro da auditoria js2rust — a decisão é do mantenedor; transferir sem receita = migração manual anotada';
  writeFileSync(F_DECIS, JSON.stringify(d, null, 2) + '\n');
}

const ALIASES = { t: 'transferir', transferir: 'transferir', m: 'manter', manter: 'manter', d: 'depois', depois: 'depois' };

// ============================================================
// relatório
// ============================================================

function estadoDe(id, decis) {
  if (decis.aplicados[id]) return `APLICADO (${decis.aplicados[id].quando})`;
  const d = decis.decisoes[id];
  if (!d) return 'sem decisão';
  if (d.decisao === 'transferir') return 'decidido TRANSFERIR — por aplicar';
  if (d.decisao === 'manter') return 'decidido MANTER';
  return 'decidido DEPOIS (fica na fila)';
}

function relatorio({ resumo = false } = {}) {
  const { cands, verde, obs } = scanCandidatos();
  const decis = carregaDecisoes();
  const L = [];
  L.push('');
  L.push('AUDITORIA JS → RUST — web/game.js (o glue) · decisão: mantenedor');
  L.push('contrato: decisões do jogo moram no RT (src/*.rs); o JS é apresentação,');
  L.push('áudio sintetizado, input e loop (ARCHITECTURE.md §3 / AGENTS.md §3)');
  L.push('');

  const pend = cands.filter(c => !decis.decisoes[c.id] || decis.decisoes[c.id].decisao === 'depois');
  const aplicados = Object.keys(decis.aplicados || {});
  const ativos = cands.filter(c => !decis.aplicados[c.id]);
  L.push(`■ CANDIDATOS (${ativos.length}, ${pend.length} na fila)`);
  if (aplicados.length) L.push(`  (já transferidos pelo mantenedor: ${aplicados.join(', ')} — fora da fila, registro abaixo)`);
  if (!ativos.length) L.push('  nenhum: o glue está limpo — nada de decisão de jogo morando no JS');
  for (const c of ativos) {
    L.push(`  [${c.id}] ${c.titulo}`);
    L.push(`    onde: ${c.onde}`);
    for (const e of c.evidencia) L.push(`    evidência: ${e}`);
    L.push(`    veredito sugerido: ${c.veredito.toUpperCase()} — ${c.porque}`);
    L.push(`    estado: ${estadoDe(c.id, decis)}`);
    L.push('');
  }

  if (obs.length) {
    L.push('■ OBSERVAÇÕES (glue legítimo com sinal estranho — olho aberto, não é candidato)');
    for (const o of obs) L.push(`  ${o.fn.nome}() ${o.onde} — entropia/estado juntos numa função de apresentação`);
    L.push('');
  }

  const porSecao = new Map();
  for (const fn of verde) porSecao.set(fn.secao, (porSecao.get(fn.secao) || 0) + 1);
  L.push('■ VERDE — glue por contrato (não é candidato: apresentação/áudio/input por design)');
  L.push('  ' + [...porSecao.keys()].map(s => `${s || 'fora de seção'} (${porSecao.get(s)} fn)`).join(' · '));
  L.push('');
  L.push('checagem dura: nenhuma escrita do JS em stats[] encontrada');
  L.push('');
  return { texto: L.join('\n'), pend, cands, decis };
}

// ============================================================
// modos
// ============================================================

const argv = process.argv.slice(2);

if (argv.length === 0) {
  console.log(relatorio().texto);
} else if (argv[0] === '--gate') {
  const { pend } = relatorio();
  if (pend.length) {
    console.error(`GATE: ${pend.length} candidato(s) sem decisão final: ${pend.map(c => c.id).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('GATE: fila de decisão vazia — auditoria toda julgada');
  }
} else if (argv[0] === '--decidir') {
  const { pend, decis } = relatorio();
  (async () => {
    if (!pend.length) { console.log('fila vazia — nada a decidir'); return; }
    // tty: pergunta ao vivo · pipe: consome as linhas na ordem (o readline
    // encerra com o fim do pipe e a fila morria na primeira resposta)
    const linhas = process.stdin.isTTY ? null : readFileSync(0, 'utf8').split('\n');
    let li = 0;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (const c of pend) {
      let r;
      if (linhas) { console.log(perguntaTexto(c)); r = (linhas[li++] || '').trim().toLowerCase(); console.log(`> ${r || '(pulado)'}`); }
      else r = (await rl.question(perguntaTexto(c))).trim().toLowerCase();
      const v = ALIASES[r];
      if (!v) { console.log('  pulado — sem registro'); continue; }
      decis.decisoes[c.id] = { decisao: v, quando: new Date().toISOString().slice(0, 10), porque: 'decisão do mantenedor (--decidir)' };
      salvaDecisoes(decis);
      console.log(`  registrado: ${c.id} = ${v}`);
    }
    rl.close();
  })();
  function perguntaTexto(c) {
    return `\n[${c.id}] ${c.titulo}\n  ${c.onde}\n  ${c.evidencia.join('\n  ')}\n  veredito sugerido: ${c.veredito.toUpperCase()} — ${c.porque}\n  (t) transferir · (m) manter no JS · (d) depois · (enter) pula > `;
  }
} else if (argv[0] === '--responder') {
  const decis = carregaDecisoes();
  const pares = (argv[1] || '').split(',').filter(Boolean);
  for (const par of pares) {
    const [id, val] = par.split('=');
    const v = ALIASES[(val || '').trim().toLowerCase()];
    if (!v) { console.error(`resposta inválida: "${par}" (use transferir/manter/depois)`); process.exitCode = 1; continue; }
    decis.decisoes[id.trim()] = { decisao: v, quando: new Date().toISOString().slice(0, 10), porque: 'decisão do mantenedor (--responder)' };
    console.log(`registrado: ${id} = ${v}`);
  }
  salvaDecisoes(decis);
} else if (argv[0] === '--aplicar') {
  const { cands, decis } = relatorio();
  const alvos = argv.length > 1 ? cands.filter(c => argv.includes(c.id)) : cands;
  let fez = false;
  for (const c of alvos) {
    const d = decis.decisoes[c.id];
    if (!d || d.decisao !== 'transferir') {
      if (argv.length > 1) console.log(`[${c.id}] pulado: sem decisão TRANSFERIR do mantenedor`);
      continue;
    }
    if (decis.aplicados[c.id]) { console.log(`[${c.id}] já aplicado (${decis.aplicados[c.id].quando})`); continue; }
    if (!c.receita || !RECEITAS[c.receita]) {
      console.log(`[${c.id}] decisão TRANSFERIR registrada, mas não há receita mecânica — migração MANUAL anotada no registro`);
      continue;
    }
    try {
      const edits = RECEITAS[c.receita].edits();
      // transação: TODO padrão confere ANTES de qualquer escrita — falha no
      // meio nunca deixa o repo meio-editado
      for (const ed of edits) {
        const txt = readFileSync(path.join(RAIZ, ed.arquivo), 'utf8');
        const n = txt.split(ed.busca).length - 1;
        if (n !== 1) throw new Error(`${ed.arquivo}: padrão esperado não encontrado (ou ambíguo, ${n}x) — o código mudou por baixo; nada foi escrito`);
      }
      const arquivos = [];
      for (const ed of edits) {
        const txt = readFileSync(path.join(RAIZ, ed.arquivo), 'utf8');
        writeFileSync(path.join(RAIZ, ed.arquivo), txt.replace(ed.busca, ed.troca));
        if (!arquivos.includes(ed.arquivo)) arquivos.push(ed.arquivo);
      }
      decis.aplicados[c.id] = { quando: new Date().toISOString().slice(0, 10), arquivos };
      salvaDecisoes(decis);
      fez = true;
      console.log(`[${c.id}] aplicado — ${RECEITAS[c.receita].titulo}`);
      for (const a of arquivos) console.log(`    ${a}`);
    } catch (err) {
      console.error(`[${c.id}] FALHA limpa: ${err.message}`);
      process.exitCode = 1;
      break; // não continua com o repo meio-editado
    }
  }
  if (fez) console.log('\ngate do repo agora: ./build.sh && node scripts/smoke.mjs (mudou Rust → recompila; .wasm entra no MESMO commit)');
} else {
  console.log('uso: node scripts/js2rust.mjs [--decidir | --responder id=decisao,... | --aplicar [id…] | --gate]');
}
