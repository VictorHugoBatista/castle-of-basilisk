// ============================================================
// cutscene de abertura: DADOS (arte, cores, texto)
// ============================================================
// Módulo DOM-free: game.js consome no browser e
// scripts/cutscene_preview.mjs consome no terminal — a mesma
// arte, as duas lentes. Nada aqui conhece canvas nem WASM.
//
// A cutscene é APRESENTAÇÃO: não passa pelo RT, não toca no
// contrato ABI, não entra no smoke. É o mesmo papel do HUD —
// vive no JS, fora do grid do jogo (decisão no ARCHITECTURE.md).
//
// Estética: ASCII detalhado, âmbar dominante (a cor do título é a
// base) com acentos por attr — o vermelho é sempre "o que ameaça",
// o ouro pulsa, a água ondula, o pálido respira: reuso integral de
// colorFor(). '#' com attr 7 é OLHO — a cutscene roda com
// stats[0]===0, então herda a régua de piscar da tela de título:
// nos canais, os olhos que acendem também piscam de vez em quando.
//
// As artes são strings PLANAS de exatamente 56 colunas (o gabarito
// é conferido por scripts/cutscene_preview.mjs, que aponta linha
// fora). Para mexer na arte: mexa aqui e confira no preview.

export const CUT_W = 56;  // colunas da cena (o viewport inteiro)
export const CUT_H = 28;  // linhas da arte; o resto da tela é faixa de texto

// Paleta própria da cutscene: ambar por base, acentos contados.
// Índices seguem o mesmo layout de PAL (0 piso… 15 vazio) para
// colorFor() funcionar sem saber que está noutra paleta.
export const CUT_PAL = [
  '#0a0600', // 0  piso (fora de uso na arte)
  '#a87000', // 1  parede/pedra
  '#4a3400', // 2  sombra (pontos, ruas, silhuetas)
  '#c98a00', // 3  porta/moldura
  '#ffdd66', // 4  brilho estrutural (telhado, cume, ameia)
  '#ffe08a', // 5  ouro: coroa § e tocha * (pulsa em colorFor)
  '#ffd54d', // 6  o ladrao @
  '#ff2e00', // 7  OLHO vermelho # (pisca: regra da tela de título)
  '#b57b00', // 8  texto da faixa
  '#ff5000', // 9  alerta (fora de uso)
  '#ffb000', // 10 ambar base — a cor dominante da arte
  '#bf1600', // 11 vermelho-escuro (reservado: só olho leva vermelho vivo)
  '#54421c', // 12 escombro % e ossada ¥
  '#2b5d50', // 13 água = (verde-escura: os canais, o rio da beira)
  '#c4b080', // 14 pálido: lamparina o, névoa, centelha, goteira (respira)
  '#050200', // 15 vazio (fundo)
];

// ------------------------------------------------------------------
// texto rolando (uma linha por cena, loop na faixa inferior)
// voz do título/morte/vitória: minuscula, sem acento, sem tabu
// (LORE.md §9.3: nunca Império/Regência/nome do massacre/nomes).
// A referência do meteorito é a frase que fecha a cena 3 — e NUNCA
// vai além dela: o canon inteiro vive no LORE.md §10, de bastidor.
// ------------------------------------------------------------------
export const CUT_TEXT = [
  'ha cem anos um reino morreu dentro desta pedra. o muro cedeu, as salas ' +
  'se calaram, os reis acabaram. mas a pedra guarda um segredo: o castelo ' +
  'nunca ficou tao vazio como dizem.',

  'nas beiras, as lamparas seguem acesas. um povo que jamais desocupou a ' +
  'terra vive ali, apesar do que a agua as vezes traz. um conselho novo ' +
  'sobe — e para dar lei ao reino falta so uma coisa: a coroa que dorme ' +
  'no castelo.',

  'mais uma vez alguem cruza o portao: um ladrao, pago adiantado para ' +
  'reaver o que o reino perdeu. dizem que o ferro da coroa nao veio de ' +
  'mina nenhuma. e eles nem sabem o quanto.',

  'embaixo, os canais levam a agua da pedra para a bacia. e ninguem anda ' +
  'sozinho por aqui. a agua tambem nao.',
];

// ------------------------------------------------------------------
// as cenas: arte, mapa de glifo→attr, cor default e fx
// (os fx vivem no game.js: dissolve / up / down / eyes + sweep)
// ------------------------------------------------------------------
const ART1 = [
  '                          %%%%                          ',
  '                          %%%%                          ',
  '              O:::::::::::    :::::::::::O              ',
  '              :           %%%%           :              ',
  '  ::::::::    :   ·            ·     ·   :    ::::::::  ',
  '  : ·  · :    :                          :    : ·  · :  ',
  '  ::::::::    :                          :    ::::::::  ',
  '     ·        :                          :       ·      ',
  '              :       ::::::::::::       :              ',
  '  ::::::::    :       :  ·  ·  · :       :    ::::::::  ',
  '  : ·  · :    :       :          :       :    : ·  · :  ',
  '  ::::::::    :       :  ·    ·  :       :    ::::::::  ',
  '              :     · :          :  ·    :              ',
  '              :       :    ·     :       :              ',
  '  ::::::::    :       :  ·  ·  · :       :    ::::::::  ',
  '  : ·  · :    :       ::::::::::::       :    : ·  · :  ',
  '  ::::::::    : =====                    :    ::::::::  ',
  '              : =====  ·              ·  :              ',
  '              : =====                    :              ',
  '  ::::::::    : =====                    :    ::::::::  ',
  '  : ·  · :    :  ·                  ·    :    : ·  · :  ',
  '  ::::::::    O::::::::::::++::::::::::::O    ::::::::  ',
  '                           ··                           ',
  '  ::::::::    :::::::::    ·      :::::::::    :::::::::',
  '  : ·  · :    : ·   · :    ·      : ·   · :    : ·   · :',
  '  ::::::::    :::::::::    ·      :::::::::    :::::::::',
  '     ·                     ·                     ·      ',
  '                                                        ',
];

const ART2 = [
  '        ·                     ·                ·        ',
  '                 ·                       ·              ',
  '   ·                      ·                         ·   ',
  '            ·                               ·           ',
  '                                         :       :      ',
  '                                       :::::::::::::    ',
  '     ·              ·              ·               ·    ',
  '       /\\            /\\                                 ',
  '      |o|           |o|                       §         ',
  '      | |           | |                  .---------.    ',
  '               ·          ·      o    ·  :         :    ',
  '               /\\                |       :  o   o  :    ',
  '              |o|           /\\   |       :  ·   ·  :    ',
  '              | |          |o|   |       :  · · ·  :    ',
  '         ·        ·        | |   ·       \'---------\'    ',
  '         /\\                      ·    ·     ·   ·       ',
  '        |o|    ·     /\\  ·                   o          ',
  '        | |         |o|     ·           ·    |          ',
  '                    | |            ·         |          ',
  '          ·                                  ·          ',
  '========================================================',
  '=============·=======================·============·=====',
  '========================================================',
  '========·====================·==============·===========',
  '====================·===============================·===',
  '========================================================',
  '========================================================',
  '::::::::::::::::::::::::::::::::::::::::::::::::::::::::',
];

const ART3 = [
  '       ·                    ·                    ·      ',
  '                ·                       ·               ',
  '   ·                    ·                          ·    ',
  '        ^ ^ ^ ^                         ^ ^ ^ ^         ',
  '        :      :                        :      :        ',
  '        :*     :                        :     *:        ',
  '        :  ·   :                        :   ·  :        ',
  '        :      :                        :      :        ',
  '        :      :^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ ^ :      :        ',
  '        :      ::::·:::::::·:::::::·:::::      :        ',
  '        :      :::::::·::::::::·:::::::::      :        ',
  '        :      :::·::::::::::·::::::::·::      :        ',
  '        :      ::::::·:::::::::::·:::::::      :        ',
  '        :      :::::::::::·:::::::::·::::      :        ',
  '        :      ::::::::*::::::::*::::::::      :        ',
  '        :      ::::::::::.----.::::::::::      :        ',
  '        :      :::::::::/      \\:::::::::      :        ',
  '        :      :::::::::|      |:::::::::      :        ',
  '        :      :::::::::|      |:::::::::      :        ',
  '        :  ·   :::::::::|      |:::::::::   ·  :        ',
  '        :      :::::o:::|      |:::::::::      :        ',
  '        :      :::::::::|      |::o::::::      :        ',
  '        :      :::::::::|  @   |::::·::::      :        ',
  '        ::::::::::::::::        ::::::::::::::::        ',
  '                          ····                          ',
  '                       ·   ·   ·                        ',
  '          %%%     ·                 ·       %%%         ',
  '                           ··                           ',
];

const ART4 = [
  '                                                        ',
  '                                                        ',
  '                                                        ',
  '                                                        ',
  '          ::::::::    ::::::    ::::::::    :::         ',
  '      ::::::::     :::::::    :::::::    :::::::::      ',
  '               `                 `                      ',
  '                      ##          ##                    ',
  '                                                        ',
  '            ##                              ##          ',
  '                                                        ',
  '::::::::::::::::::::::::::::::::::::::::::::::::::::::::',
  ':::::::::::::::::::::::::::|||::::::::::::::::::::::::::',
  ':::::::::::::::::::::::::::|||::::::::::::::::::::::::::',
  '::::::::::::::::::::::::::::::::::::::::::::::::::::::::',
  ':::::::::%::::::::::::::::::::::::::::::¥:::::::::::::::',
  '::::::::::::::::::::::::::::::::::::::::::::::::::::::::',
  '========================================================',
  '==========·======================·================·=====',
  '========================================================',
  '======·=====================================·===========',
  '========================================================',
  '=================·====================·=================',
  '========================================================',
  '========·=====================·==================·======',
  '========================================================',
  '::::::::::::::::::::::::::::::::::::::::::::::::::::::::',
  '::::::::::::%:::::::::::::::::::::::::%:::::::::::::::::',
];

export const CUT_SCENES = [
  { dur: 16000, art: ART1, def: 10,
    map: { ':': 1, '·': 2, '%': 12, '=': 13, '+': 3, 'O': 4, 'o': 14 },
    fx: 'dissolve', sweep: true },

  { dur: 17000, art: ART2, def: 10,
    map: { '=': 13, 'o': 14, '·': 2, ':': 1, '§': 5, '/': 4, '\\': 4,
           '|': 1, '.': 14, '-': 3, "'": 3 },
    fx: 'up' },

  { dur: 17000, art: ART3, def: 10,
    map: { ':': 1, '·': 2, '%': 12, '^': 4, '*': 5, 'o': 14, '@': 6,
           '.': 3, '-': 3, '/': 3, '\\': 3, '|': 1 },
    fx: 'down' },

  { dur: 16000, art: ART4, def: 2,
    map: { '=': 13, ':': 1, '#': 7, '¥': 12, '%': 12, '.': 14, '`': 14,
           '|': 1 },
    fx: 'eyes',
    // cada par de olhos acende no seu tempo (ms, cena-local); o par
    // inteiro acende JUNTO — olho que acende sozinho é bug.
    eyes: [
      [22, 7, 2500], [34, 7, 2500],
      [12, 9, 5800], [44, 9, 5800],
      [18, 16, 9200], [47, 16, 9200],
      [27, 19, 12000], [28, 19, 12000],
    ] },
];
