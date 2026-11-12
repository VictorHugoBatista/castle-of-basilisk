// ============================================================
// cutscene de abertura: DADOS (arte, cores, texto)
// ============================================================
// Módulo DOM-free: game.js consome no browser e
// scripts/cutscene_preview.mjs consome no terminal — a mesma
// arte, as duas lentes. Nada aqui conhece canvas nem WASM.
//
// A cutscene é APRESENTAÇÃO: não passa pelo RT, não toca no
// contrato ABI, não entra no smoke (decisão no ARCHITECTURE.md).
//
// Estética: pixel-art sombreada na régua do jogo — a CÉLULA é o
// pixel (12×18) e o dithering Bayer faz o degradê (lua com halo,
// silhuetas quase pretas, halos de tocha/lamparina). Os meios-blocos
// são os tons; cada cena casa char→attr no próprio map. Regras da
// casa preservadas: o vermelho é sempre "o que ameaça" (#), o ouro
// pulsa (§ *), a água ondula (░), o pálido respira (o ·) — tudo via
// colorFor(). '#' com attr 7 herda a régua de piscar da tela de
// título: nos canais, os olhos piscam.
//
// O texto vive numa CAIXA DE DIÁLOGO estilo RPG (borda ambar, 3
// linhas datilografadas) que o game.js desenha sobre as rows
// 23..31 — as cenas compõem nos rows 0..21 considerando-a.
//
// As artes são strings PLANAS de exatamente 56 colunas (gabarito
// conferido por scripts/cutscene_preview.mjs). Autoria: as cenas
// nasceram rasterizadas; ajuste fino é direto nas strings.

export const CUT_W = 56;  // colunas da cena (o viewport inteiro)
export const CUT_H = 22;  // linhas de arte; rows 23..31 são a caixa de texto

// Paleta da cutscene: âmbar por base com níveis de brilho pro
// dithering; mesmos índices de attr de PAL para colorFor() agir.
export const CUT_PAL = [
  '#0a0600', // 0  interior da caixa de texto
  '#6b4400', // 1  âmbar fundura: rim light, borda da caixa
  '#191106', // 2  silhueta escura (corpos, pedra à noite)
  '#c98a00', // 3  âmbar claro (reflexo, cratera, halo de tocha)
  '#ffdd66', // 4  brilho (borda da lua, halo curto)
  '#ffe08a', // 5  ouro quente: lua § tocha (pulsa em colorFor)
  '#ffd54d', // 6  o ladrao @
  '#ff2e00', // 7  OLHO vermelho # (pisca: regra da tela de título)
  '#b57b00', // 8  texto da caixa
  '#ff5000', // 9  alerta (reservado)
  '#a87000', // 10 âmbar médio
  '#bf1600', // 11 vermelho fundo (reservado)
  '#2e1e0a', // 12 silhueta média (dither de forma) / escombro ossada
  '#2b5d50', // 13 água (ondula em colorFor)
  '#c4b080', // 14 pálido: estrela lamparina névoa goteira (respira)
  '#050200', // 15 vazio (fundo da tela / céu)
];

// ------------------------------------------------------------------
// texto da caixa de diálogo: UMA página por cena, 3 linhas
// (≤ ~57 colunas). Voz do título/morte/vitória: minuscula, sem
// acento, sem tabu (LORE.md §9.3). A referência do meteorito é a
// frase que fecha a cena 3 — e NUNCA vai além dela: o canon inteiro
// vive no LORE.md §10, de bastidor.
// ------------------------------------------------------------------
export const CUT_TEXT = [
  [
    'ha cem anos um reino morreu dentro desta pedra.',
    'o muro cedeu, as salas se calaram.',
    'mas o castelo nunca ficou tao vazio como dizem.',
  ],
  [
    'nas beiras, as lamparas seguem acesas:',
    'um povo que jamais desocupou a terra vive ali.',
    'ao conselho novo falta so uma coisa: a coroa.',
  ],
  [
    'mais uma vez alguem cruza o portao: um ladrao',
    'pago adiantado para reaver o que o reino perdeu.',
    'o ferro dela nao veio de mina. e eles nem sabem o quanto.',
  ],
  [
    'embaixo, os canais levam a agua da pedra para a bacia.',
    'e ninguem anda sozinho por aqui.',
    'a agua tambem nao.',
  ],
];

// ------------------------------------------------------------------
// as cenas: arte (rows 0..21), mapa char→attr e fx
// (fx vivem no game.js: dissolve / up / down / eyes)
// ------------------------------------------------------------------
const ART1 = [
  '            ▒   ▒                                       ',
  '   ·                             ·              ·       ',
  '              ◆            ·                            ',
  '           ◆●●●◆●◆            ·         ▓ ▓         ·   ',
  '        ◆ ◆●●▓◆●◆●◆ ◆                  ▓                ',
  '          ●●●●●●●◆●     ·            ▒▒▒▒▒              ',
  '     ·    ◆●◆●◆▓▓●◆                        ·            ',
  '           ◆●●▓◆●◆         ▒▒▒             ▒▒▒          ',
  '        ▒   ◆ ◆ ◆   ▒      █o█        ·    █o█          ',
  '  ·                         ▓               █▓▓▓▓       ',
  '                          ▒▒▒▒               ▒▒▒▒  ·    ',
  '                    ▒▒▒▒              % %           ▒▒▒▒',
  '         █▒▒▒       ████▒▒▒▒▒▒▒▒▒▒▒▒▒%    %▒▒▒▒▒▒▒▒▒████',
  '          █o█       ██████████████████    ██████████████',
  '            ▓       ████       ▓  ▒▒▒▒▒%▒▒  ▓       ████',
  '                     █▒   ▒▒▒▒▒   ▒██████▒  ▒▒▒▒▒▒   █  ',
  '   ▒▒▒▒▒             █▒   █████   ▒██████▒  ██████   █  ',
  '   ██▓█              █▒   █████   ▒██████▒  ██████   █  ',
  '   █▓o▓        █     █▒   █████   ▒██████▒  ██████   █  ',
  '     ██▓█    ▒▒▒    ████          ▒██████▒▓         ████',
  '     ▒▒▒▒▒▒▒▓█o█    ████   ▒▒▒▒▒▒▒▒██████▒          ████',
  '      █▓█▓███       █████████▓█▓█▓██████████████████████',
];

const ART2 = [
  '                                                        ',
  '    ·                          ·             ·          ',
  '      ▒          ·                  ·               ·   ',
  '      ●◆●                 ·             ▒▒▒     ▒▒▒     ',
  '    ◆●▓●◆●  ▒      ▓                    ███     ███     ',
  '     ◆●●▓◆       ▒▒▒▒ ·                ▒▒▒▒▒▒▒▒▒▒▒▒▒    ',
  '      ◆●◆                    ·         ███████§█████    ',
  '                                       █████████████    ',
  '                                        ▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ',
  '   ▒···▒▒            ▒···▒▒              ▓███▓██▓████   ',
  '   · o ·             · o ·       · ·     █▓██████████   ',
  '    ···█    ▒···▒▒    ···█      ··o··    █▓██▬▬▬▬█▓██   ',
  '    █  █     ·o·      █  █  ▒· ·▒· ·     ▓███▬▬▬▬████   ',
  '    █  ·     ···█·    █  █ ·· o··     ·  ████▬▬▬▬████   ',
  '███▓████████▓██▓█████████▓██████████▓████▓█·██▓██·███▓██',
  '████▓▓████▓██▓▓██▓████▓██▓██████████▓██████████▓▓███████',
  '░█░░░░░░░█░░░░▬░░░░░░░██░·░░█░░░░░░░░█·░░█░░░·▬░░░░░░░░░',
  '░░░░░▬░·░░░░░░░▬░░░░░░░░·█░░░░▬░░░░░█░░█░·░░░░░▬░░█░░░·█',
  '░░░░░░▬░·░░░░░▬░█░░░░░░▬░░░░░░░▬░░░░░░░░░░·░░·▬░·░░·░█·█',
  '░░░░░▬░░░░█░░█░░░░░░░░░·▬░██░░▬░░░█░░░░░░░░░░░█▬·░░░░░█░',
  '░░░░░░░░░░·░░░░·░░█░░░░░░░░░░█░░░█░░░░░░░░░░█░░░░░░░░░░░',
  '▓▓▓██▓▓█▓▓█▓██▓█▓▓█▓▓███▓█▓▓██▓██▓▓▓██▓████▓▓▓█▓███▓▓██▓',
];

const ART3 = [
  '                            ▒   ◆   ▒                   ',
  '         ·           ·          ●◆●                     ',
  '   ·                          ◆●◆●◆●◆                   ',
  '               ·             ◆●▓▓●●●●◆              ·   ',
  '      █ █ █ █               ◆◆◆●◆●◆●◆◆  ▒ █ █ █ █       ',
  '      ▒▒▒▒▒▒▒    ·            ●◆●▓●▓●     ▒▒▒▒▒▒▒       ',
  '      █▄▄▄ ▄▓                 ◆●◆●◆●  ▒   █▄▄▄ ▄█       ',
  '      █▄▄*▄▄██ █ █ █ █ █ █ █ █ █ █ █ █ █ ██▄▄*▄▄█       ',
  '      █▄ ▄ ▄▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▄ ▄ ▄█       ',
  '      █▓▓█▓███████████▓▓██████████████████████▓█▓       ',
  '      ██████▓████▓████▓▓█▓████▓██████████████▓██▓       ',
  '      █████████████▓▓████▓    ██▓███▓▓██▓█████▓██       ',
  '      ▓▓████▓▓▓████▓█████   █  ▓█████████▓██▓▓█▓█       ',
  '      ███▓█▓█████████████      ███████▓██████▓███       ',
  '      ▓███▓█████▓████████     █████████▓███▓█████       ',
  '      ████████████▓████▓█      ████▓▓████████▓███       ',
  '      ████▓█████o█▓██████  @█  ████████o▓▓██▓████       ',
  '      ████▓███████%█o█%██      ████o▓█%███▓████▓█       ',
  '██▒▒▒▒▒█▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒██',
  '███████▓██▓█████▓██████████████▓██▓█▓██████████▓███▓██▓█',
  '███▓██▓█▓█▓█▓████████████▓█████████████████▓▓█▓█▓▓▓█▓███',
  '█████▓█▓█▓█▓████████▓████████▓▓███████████▓██████▓█▓█▓██',
];

const ART4 = [
  '     █▓█                                        ▓█▓█    ',
  '    █▓███     ████      █████▓███      ██▓█    ██▓███   ',
  '    ▓█▓█▓    █▓█▓█▓█▓  █▓█▓█▓█▓█▓█   █▓█▓█▓    █▓█▓█▓█  ',
  '  █▓█▓█▓███   █▓█▓█▓███████▓█▓█▓█  ████▓███    ██▓█▓███ ',
  ' █▓▒▒▒▒▒▒▒▓█  ▓█▓▓▓█▓█▓  ▒▒▒▒▒▒▒  ▓█▓█▓█▓█▓   ▓▒▒▒▒▒▒▒▓█',
  ' ████▓███▓██  ▒`▒▒▒▒▒█    █▓█▓█  `██▒▒▒▒▒▒▒█  ███▓███▓█ ',
  '              ▓█▓█▓  ##    █▓█▓  ##   ▓█▓█▓█  `█▓       ',
  '              ███                        █              ',
  '▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒',
  '█▓█▓█▓████████████▓███████▒▒▒▒▒█▓▓█████▓██▓███████▓█████',
  '███▓███████##█████████████▒▒▒▒▒█████▓████▓██##██████████',
  '████▓▓███%▓██▓▓██▓████▓███▒▒▒▒▒█████████¥██████%▓███████',
  '██████████▓█████▓██████████████▓████▓███████████▓▓█▓██▓█',
  '░░░░░░█░█░░░░█░░·░░░░░░█░░░░░░░░░░░░░·░░░░░░░░░░░░░░░░░░',
  '░░░░░░░░░░░·░█░·░░░░░·░░█░░░░·░░░░░░░·░░░░░░░░░░░·░░░░░░',
  '░░█·░░░░░░░█░░░░░·##░░░░░█░░░░░░░░░░░░░░░░░░█░░##░░░░░░░',
  '░░░░░░░█░░░░░░░░░░░░░█░░░░░█░░░░░░░·░░░░░░░░░░░░░░░░░░█░',
  '░░░░░░░░░░█··░·█░░░░░█░░░░░##░░░░░░░░░░░░░░░░░░█░░█░░░░░',
  '░█░░█░░░█░░░░░░░░░░░░░░░█░░░█░░░░░·░░░░░░█░░░░░░░░░░░░░░',
  '░·░░░░░░░░█░░░░░·░░░·░░░░░░░░░░░░░░█░░░░░░░░░░░░░░░░░░█░',
  '████▓████▓██▓██▓████▓██▓▓▓█▓▓█▓▓███▓█▓███▓██▓██▓████▓▓█▓',
  '████████████%█████████████████████████%█████████████████',
];

export const CUT_SCENES = [
  { dur: 16000, art: ART1, def: 10,
    map: { '·': 14, 'o': 14, '%': 12, '▒': 1, '█': 2, '▬': 3, '◆': 4, '●': 5, '▄': 10, '▓': 12, '░': 13, '·': 14 },
    fx: 'dissolve' },
  { dur: 15000, art: ART2, def: 10,
    map: { '·': 14, 'o': 14, '§': 5, '▒': 1, '█': 2, '▬': 3, '◆': 4, '●': 5, '▄': 10, '▓': 12, '░': 13, '·': 14 },
    fx: 'up' },
  { dur: 15000, art: ART3, def: 10,
    map: { '·': 14, '*': 5, '@': 6, 'o': 14, '%': 12, '▒': 1, '█': 2, '▄': 3, '◆': 4, '●': 5, '▄': 10, '▓': 12, '░': 13, '·': 14 },
    fx: 'down' },
  { dur: 15000, art: ART4, def: 10,
    map: { '·': 14, '`': 14, '#': 7, '¥': 12, '%': 12, '|': 1, '▒': 1, '█': 2, '▬': 3, '◆': 4, '●': 5, '▄': 10, '▓': 12, '░': 13, '·': 14 },
    fx: 'eyes',
    // cada par de olhos acende no seu tempo (ms, cena-local); o par
    // inteiro acende JUNTO — olho que acende sozinho é bug.
    eyes: [
      [21, 6, 2500],
      [33, 6, 2500],
      [11, 10, 5800],
      [44, 10, 5800],
      [18, 15, 9200],
      [47, 15, 9200],
      [27, 17, 12000],
      [28, 17, 12000],
    ] },
];
