# Visao Geral de Arquitetura

Documento vivo: reune TODAS as decisoes arquiteturais do Castle of Basilisk,
racional incluido, para que qualquer dev (ou agente) entenda e contribua no
mesmo dia. Atualize a cada mudanca de contrato (exports, layout de memoria,
regras de jogo). O gameplay em si esta detalhado no README.

## 1. Estrutura do Projeto

```
castle-of-basilisc/
├── src/
│   ├── lib.rs              # Glue: declara os módulos e re-exporta o namespace flat
│   ├── consts.rs           # Constantes tunáveis: temas, tiles, attrs, balance
│   ├── state.rs            # Estado global: TODAS as `static mut` (layout documentado)
│   ├── rng.rs              # XORSHIFT32, seed por andar
│   ├── grid.rs             # Helpers de grid, linha de visão, fila de eventos de áudio
│   ├── gen.rs              # Geração procedural dos 8 andares + BFS
│   ├── basilisk.rs         # IA da besta: rastro, cone, turnos, ruído por rota
│   ├── fear.rs             # Medo/loucura e alucinações
│   ├── flow.rs             # Fluxo do tick: jogador, subir/descer, morte, vitória
│   ├── ui.rs               # Barra de UI, FOV e render
│   └── exports.rs          # ABI `#[no_mangle]` pub extern "C" + dev tools do smoke
├── web/
│   ├── index.html          # Canvas 672x576 + filtro CRT 100% CSS
│   ├── cutscene.js         # Dados da abertura: cenas ASCII, paleta, texto rolando
│   ├── game.js             # Glue JS: tick de 140ms, camera, render diff, WebAudio
│   └── wasm/
│       └── castle_of_basilisk.wasm   # Binario compilado (~37 KB), comitado
├── scripts/
│   ├── smoke.mjs           # Gate de testes headless (so merge com "SMOKE OK")
│   ├── debug6.mjs          # Bancada do bot playthrough (mede taxa de vitoria)
│   ├── fear_bench.mjs      # Bancada do MEDO: telemetria de niveis/alucinacoes
│   └── cutscene_preview.mjs # A lente de autoria da cutscene (imprime no terminal)
├── build.sh                # cargo build release + copia para web/wasm
├── Cargo.toml              # cdylib, zero dependencias
├── README.md               # Como jogar
├── .gitignore              # target/ e lixo local
└── ARCHITECTURE.md         # Este documento
```

Decisao: **o Rust vive em modulos por dominio** (src/lib.rs e' o glue que declara
os modulos e re-exporta o namespace flat — o codigo continua achatado como era
so com um arquivo; cada modulo abre com `use crate::*;`). Racional: o arquivo
unico cresceu a ~2900 linhas e toda tunagem de balance virava Ctrl+F em montanha;
os cortes seguem as costuras que ja existiam nas secoes commentadas (estado, rng,
geracao, basilisco, medo, render, exports). Custos de runtime ZERO: com
lto=true + codegen-units=1 o LLVM otimiza atraves dos modulos como se fosse um
arquivo so — o .wasm resultante e identico em comportamento (gate: smoke verde)
e ~76 bytes maiores no total. Nada de crates: a regra de zero dependencias e
zero alocacao se mantem.

## 2. Diagrama do Sistema

```
[Usuario]
   v  keyboard (WASD/setas/ESPACO/ENTER)
[game.js] --fetch--> [castle_of_basilisk.wasm] --instantiate--> memoria linear
   ^  ^                    |  exports: pfb_init/new_game/step/diff/ack/pop_event/...
   |  | rAF loop           |  memoria: grid (88x48 MAX x2B, dims por andar) | stats (32B)
   |  +--- tick 140ms ---->|  eventos: ring buffer u32[16]   · diff: bitmap 224B
   |
[CRT CSS]  <--- canvas --- render diff por celula
[WebAudio] <--- eventos -- efeitos sintetizados + sibilo por proximidade
```

Nao existe server, banco de dados ou rede. O jogo roda inteiro no navegador;
todo o estado vive na memoria linear do WASM.

## 3. Componentes Nucleo

### 3.1. Nucleo do jogo (WASM)

Nome: `src/*.rs` -> `castle_of_basilisk.wasm`

Descricao: gera os andares, roda a IA do basilisco, processa input, calcula
FOV, desenha o grid ASCII e publica eventos de audio. Nada de I/O: sem
alocacao dinamica, sem panico, sem chamadas de sistema.

Tecnologia: Rust 1.99, target `wasm32-unknown-unknown`.

Decisoes-chave:
- **ABI crua** — `#[no_mangle] pub extern "C"`. Nao usa wasm-bindgen/wasm-pack.
  Racional: zero crates = build em segundos, binario de ~28 KB, controle total
  do layout de memoria. As estruturas (grid, stats, eventos) sao `static mut`
  em enderecos estaveis; o JS cria as views `Uint8Array` UMA vez sobre essas
  regioes e as reutiliza para sempre.
- **WASM nunca cresce a memoria** -> as views fixas sao seguras.
- `opt-level = "z"`, `lto = true`, `panic = "abort"`, 1 codegen unit.

Exports (contrato publico — nao quebrar):

| export          | assinatura                   | papel |
|-----------------|------------------------------|-------|
- `pfb_init`      | `() ()`                      | desenha tela de titulo |
| `pfb_new_game`  | `(seed: u32)`                | novo jogo deterministico |
| `pfb_step`      | `(input: u32)`               | um tick (bits: 1 UP, 2 DOWN, 4 LEFT, 8 RIGHT, 16 WAIT, 32 SNEAK, 64 RUN) |
| `pfb_menu`      | `(input: u32)`               | teclado dos menus (bits: 1 UP, 2 DOWN, 4 LEFT, 8 RIGHT, 16 OK, 64 BACK, 32 B, 512 A — o KONAMI ↑↑↓↓←→←→B A é rastreado aqui, NAS CONTROLES: consumido abre ST_SELECT; o A solto alterna o esquema) |
| `pfb_state`     | `() u32`                     | 0 titulo, 1 jogo, 2 morte, 3 vitoria, 4 controles, 5 escolha de andar |
| `pfb_grid_ptr`  | `() u32`                     | ponteiro do grid de render (dims atuais em STATS[16]/[17]) |
| `pfb_max_n`     | `() u32`                     | tamanho MAXIMO do grid (W_MAX*H_MAX = 3520): o JS dimensiona as views |
| `pfb_ui_ptr`    | `() u32`                     | barra de UI fabricada (W0 celulas x [char,attr]): dica contextual / nome do andar |
| `pfb_stats_ptr` | `() u32`                     | ponteiro do bloco de stats |
| `pfb_pop_event` | `() u32`                     | consome fila de audio (0 = vazia) |
| `pfb_diff_ptr`  | `() u32`                     | diff de render (bit0 = repinte integral, [1] camX, [2] camY, [3..227] bitmap de celulas de TELA mudadas) |
| `pfb_diff_ack`  | `()`                         | confirmacao do consumo: zera flags + bitmap |
| `pfb_debug_*`   | place/map/**dmap**/probe/body_ptr/ai/give_crown/give_shard/shard_reset/fear/fear_ptr/floor | somente para testes headless |

Layout de memoria:
- **Grid**: buffer maximo `W_MAX x H_MAX` (88x48) celulas x `[char: u8, attr: u8]`,
  dimensoes REAIS do andar atual publicadas em `STATS[16]/[17]` (funcoes `W()`/`H()`
  leem `DIMW/DIMH`: castelo 56x32, masmorras 64x36, esgotos 80x44, BOCARRA
  (acervo dela) 88x48). Char da tabela ASCII; coroa = byte `0xA7` ('§'
  latin-1), agua = `'='` (0x3D), caveira = `0xA5` ('¥'), corpo do acervo =
  `0xB6` ('¶'), fundura = `0xF7` ('÷'), fragmento sombrio = `0xA4` ('¤',
  pega-se ao pisar). Attr = indice da
  paleta (0..15) OU `0x80 | indice` quando o tile e "lembrado" (fog of war) e
  escurece no render.
- **Stats** (u8[32]): `[0] estado`, `[1] motivo de morte (1 olhar, 2 toque —
  o medo nunca mata)`,
  `[2] profundidade`, `[3] px`, `[4] py`, `[5] bx`, `[6] by`,
  `[7] estado da IA (0 patrol, 1 invest, 2 hunt)`, `[8] coroa`,
  `[9] segmentos do corpo visíveis` (o JS usa para "engordar" o drone),
  `[10] nivel de ruido do tick (0..3, alimenta o HUD)`, `[11] folego (0..100)`,
  `[12] jogador esta em escombro (0/1)`, `[13] pedido de iniciar (menu -> JS
  semeia pfb_new_game e limpa)`, `[14] cursor do menu (0 INICIAR, 1 CONTROLES)`,
  `[15] modo de teclas (0 WASD, 1 SETAS — o J S usa para filtrar a tecla de
  corrida X/K)`, `[16] largura do andar atual`, `[17] altura do andar atual`,
  `[18] medo (0..100)`, `[19] nivel do medo (0..4; 4 = COLAPSO, efeitos
  máximos — e o medo nunca mata)`, `[20] o pulso (0/1 — 1 = carrega o que
  chia: o fragmento sombrio OU a coroa, a mesma matéria; espelho da cerca
  do heart_tick, evento 24)`.
  **REGRA DE OURO**: qualquer funcao que mude estado (morte/vitoria/eventos)
  DEVE chamar `sync_stats()`. (Dois bugs ja nasceram de stats obsoletos —
  o terceiro: `return` cedo apos descer de andar deixava o bot do smoke
  replanejando com posicao velha sob mapa novo; sincronizar OU seguir o fluxo
  normal do tick.)
- **Eventos**: ring buffer `u32[16]`, produtor (Rust) / consumidor (JS).
  `22` EV_SIBILO (o sopro DE PERTO: decisao no RT — basilisk.rs `sibilo_tick()`
  decide quando ela sopra e se cala de proposito; vol/pan/brilho pela
  proximidade ficam no JS, caso 22 do playEvent). `18` EV_WHISPER (sussurro:
  nasceu alucinacao) · `19` EV_WHELP (soluco involuntario do medo) ·
  `20` EV_VANISH (alucinacao evaporou de perto) · `21` EV_VANISH_C (a
  coroa-fantasma evaporou). `23` EV_SHARD (o achado: o acoite frio do metal
  antigo) · `24` EV_HEART (um pulso do SEU coracao: o QUANDO e do RT —
  `heart_tick` em fear.rs pela distancia chebyshev ate ela, piso ~0.6 s
  (4 ticks), teto contínuo ~1.7 s (12 ticks), stream propria `rheart`,
  gate = fragmento OU coroa; o
  lub-dub, volume e pan sao do JS, case 24).

- **Diff de render** (DIFF 227 bytes via `pfb_diff_ptr`): a comparacao
  byte-a-byte `[ch,attr]` do viewport 56x32 nasce no Rust (ui.rs `diff_pass`,
  no fim de `render()`) — o JS pinta so o marcado (+ os attrs animados, que
  repintam todo frame: cor viva nao muda byte nenhum no bitmap) e confirma
  com `pfb_diff_ack()`.

RNG: xorshift32 com seed POR ANDAR (`SEEDS[FLOORS]`, FLOORS=8), definida em
`pfb_new_game`. Subir e descer NAO regenera o mapa: o mesmo seed reproduz o
mesmo andar.

### 3.2. Front-end web

Nome: `web/index.html` + `web/game.js`

Descricao: canvas de 56x32 celulas (12x18 px), loop `requestAnimationFrame`
com acumulador de tick fixo (140 ms), render por diff byte-a-byte, audio
sintetizado disparado pelos eventos do WASM.

Tecnologia: JS puro (ES module), Canvas 2D, WebAudio, CSS.

Deploy: estatico (GitHub Pages / `python3 -m http.server -d web 8000`).

Decisoes:
- **`type="module"` no script** — o boot usa top-level `await` para carregar WASM.
- **Tick por acumulador de passo fixo**: a cada 140 ms roda um `pfb_step` com
  o input atual; ficar sem input TAMBEM gera tick — imovel e uma acao
  (esconder), e o mundo continua vivo quando o jogador para.
- **Diff de render nasce no Rust** (desde a migracao): `diff_pass()` roda no
  fim de `render()` e publica `DIFF` (bit0 = repinte integral; bitmap de
  celulas de TELA mudadas, sticky ate o ack). O JS pergunta `pfb_diff_ptr()`,
  repinta o marcado e os attrs animados (pulso/blink/tosca/agua/fantasma,
  que sao COR NO TEMPO e nao mudam byte), confirma com `pfb_diff_ack()` e
  nunca compara byte nenhum: o `prevGrid` morreu.
- **Camera segue-jogador nasce no RT**: viewport FIXA 56x32 (o canvas de
  sempre); `cam()` clampa `PX/PY` nas bordas do andar e publica `DIFF[1]/[2]`
  — mudou andar/dims/janela => bit0 (repinte integral). Mapas maiores
  (esgoto 80x44) deslizam sob ela. A dica contextual mora na ULTIMA LINHA DA
  TELA (UIROW exportada pelo WASM): com a camera, a ultima linha do mapa nem
  sempre esta visivel.
- **Paletas por tema** (`PAL_CASTLE/PAL_DUNGEON/PAL_SEWER/PAL_CAVE`, mesmos
  indices de
  attr): a troca de andar troca a referencia de paleta + `needsFull` — o CRT
  veste a cor do lugar (ambar rico / ambar seco / verde-lodo / pedra umida de
  caverna).
- **Cutscene de abertura mora INTEIRA no JS** (`web/cutscene.js` = dados;
  engine em `game.js`): apresentação pura, o WASM não sabe que ela existe —
  sem estado novo no RT, sem ABI, sem smoke. Roda ANTES do título
  (`stats[0]===0` o tempo todo; o menu fica por baixo, adormecido).
  **Interação:** ENTER/espaço revelam a página da caixa de diálogo e, na
  tecla seguinte, viram a cena; ESC pula tudo — sempre depois de uma graça
  de 2.5s (o clique de foco da aba e o enter reflexo de "começar" matavam
  a abertura no primeiro segundo; bug real, morto com prova). As cenas são
  pixel-art sombreada 56×22 — a CÉLULA é o pixel (12×18), dithering Bayer
  faz o degradê e meios-blocos (█▓▒░●) são os tons — com paleta própria
  (`CUT_PAL`, mesmos índices de attr) reusando `colorFor()`: coroa pulsa,
  água ondula, pálido respira, olho vermelho pisca DE GRAÇA, porque é a
  mesma régua da tela de título. O texto da lore é a única voz narrativa
  em tela que conta história — e mesmo assim só cheira: a verdade de
  bastidor vive no LORE.md (§10), o tabu em tela (§9.3) vale pra ela.
  Autoria: a mesma arte imprime no terminal (`scripts/cutscene_preview.mjs`),
  browser é a conferência final.
- **CRT em CSS puro** (scanlines `repeating-linear-gradient`, vinheta
  `radial-gradient`, flicker por keyframes): custo ZERO de runtime vs shaders.
- **Paleta monocromatica (familia #ffb000) sobre #050200**; a EXCECAO e a
  serpente, em vermelho para saltar do monocromo: cabeca `B` `#ff2e00`, corpo
  `~` (attr 11) `#bf1600`; escadas pulsam; attr 9 pisca. A COROA (attr 5)
  brilha forte: duas ondas de brilho fora de fase, pico ~1.4 (o amarelo
  beira o branco) com minimo 0.6 (nunca apaga) + HALO ambar no canvas
  (shadowBlur 9) — no acervo ela nao se confunde com o osso '¶' (attr 12,
  estatico e baixo). Tile LEMBRADO (DIM) nao tem halo: a memoria nao
  ilumina. A coroa-fantasma das alucinacoes usa o MESMO attr 5: a mentira
  herda o brilho por construcao (indistinguivel do real).
  - **Serpente em 3 efeitos JS** (baratos: ~25 glyphs/frame, so quando visivel):
    sombra de glyph deslocada (+3px quase-preta = "saltando do CRT"), halo
    `shadowBlur` vermelho e onda de brilho que percorre os anels a partir da
    cabeca (+ tremor sub-clinico de ±1px). O corpo/cabeca entram no grupo
    "repinta todo frame" do diff.
  - **Glitch raro e curto** (eventos 5/14/15/16): ~0.25 s de fatias horizontais
    deslocadas (`drawImage` de si mesmo) + ghost cromatico da cabeca; ao
    terminar, remontagem total (`prevGrid.fill(0)` + `needsFull`).
- **`AudioContext` so no primeiro gesto do usuario** (exigencia dos
  navegadores). Drone grave (55/58,3 Hz triangle + lowpass) e o "hum" do castelo.
- **Ambiente sonoro por tema** (`setAmbience`): troca de andar => fade das
  trilhas velhas + arranque das novas. Terreo: VENTO (noise loop bandpass 430 Hz
  com LFO duplo na frequencia e no volume). Masmorra: SILÊNCIO PERTURBADOR
  (estalo de pedra a cada 16-40 s; SFX abafados a 0.7 no bus `sfxBus` — o
  silencio sepulcral contrasta com qualquer barulho). Esgoto: GOTEIRAS (ping
  agudo com eco de cisterna, gota dupla ocasional), que PARAM quando ela esta
  de caca perto. BOCARRA: a morada do TETO ALTO (bus `buildCaveAir`, uma
  vez por visita; tudo morre com a troca de tema e as correntes de timer
  carregam GERACAO — um vai-e-vem rapido de andar nao ressuscita corpo
  velho) — ping gordo (gota grave
  e densa com eco de lago), vento grave constante com deriva de afinacao
  (lowpass 120 Hz, sem LFO de ganho algum), eco de caverna propria
  (delay 0.38 s, feedback 0.45 — o som nao acha parede nenhuma), a
  RESPIRACAO do acervo (rumor grave a cada 8-20 s em scheduler sorteado,
  swell one-shot) e a DISSONANCIA: dois pares de senoides desafinadas
  (82/87.3 Hz batendo ~5/s e 1740/1758 Hz batendo rapido) em ganho fixo e
  discreto — o desconforto vive do batimento de frequencias, nunca de
  amplitude pulsante (a mesma regra do vento). E o VENTO GRANDE (o tamanho
  das cavernas): corpo gustado ao nivel do vento do TERREO (gain ~0.05,
  highpass 100 para o fundo rum/dissonancia seguirem audiveis), rajadas
  5-15 s que abrem o corpo a 460-740 Hz e crescem o assobio 720 Hz — cada
  onda por caveIn devolve o eco de 0.38 s; ELA cacando, a rajada nao sai.
  Gota/respiracao prendem quando ela
  caça. Passos respingam na agua (`T_WATER` sob os pes); no acervo, passo
  em osso soa CRAQUE (o osso cede e rola) e passo em corpo soa MUSH
  molhado (a carne cede, o grude estopa) — o tile sob os pes decide
  (0xA5/0xB6 via mapview), e correndo o WASM delata em paralelo (r=16/17).
- **Todos os sons sao sintetizados**: oscillator + gain envelope + StereoPanner.
  Zero samples (binario web leve). Coracao (o pulso do fragmento OU da
  coroa, decidido no RT —`heart_tick`, evento 24): intervalo/volume/pitch
  pela distancia chebyshev; pan pelo sinal de dx (direita/esquerda). O
  lub-dub corta o ar de teto alto do fundo por camada: o corpo AUDIVEL
  mora na banda da pele de tambor (acima do rumble, abaixo do silbo) —
  baque curto de band-noise (380 -> 290 Hz, deriva por proximidade) +
  "bomp" de square (168 -> 72 Hz colado); o sub-senoide (74 -> 50 Hz)
  apenas pesa, para quem tem caixa com grave (em laptop os 50-74 Hz
  fisicamente nao saem — por isso o batido mora no MEIO). Volume piso
  0.11 a pico 0.32: o coracao e o som DO seu corpo, nao pesa sobre o
  marketplace do lugar.

### 3.3. Testes headless

Nome: `scripts/smoke.mjs` (gate) e `scripts/debug6.mjs` (bancada de vitoria)
e `scripts/fear_bench.mjs` (bancada do medo)

Descricao: rodam o MESMO binario do navegador direto no Node. O smoke valida
regras por cenario e um bot joga do zero ate vencer. Bot: BFS que EVITA a zona
de perigo (LOS<=9 ou dist<=3), replanejamento a cada 6 passos, esquiva
geometrica com eixo travado, desvio do tile quando o alvo esta sob os pes.
O fear_bench roda o mesmo bot com telemetria por tick do medo (nivel, pico,
alucinacoes nascidas/evaporadas) — e a prova numerica de que um ajuste de
balance torna o medo VISIVEL sem matar o bot (ver secao 3.6).

Nota sobre o cenario do sibilo (evento 22): a GEOMETRIA E COMANDADA por
design — teletransporte discreto dela a 3 tiles (debug_bas_place nao ticka o
jogo) porque ela raramente re-entra no raio de PERTO por passeio natural numa
janela curta. A fidelidade da cadencia (períodos, silencio proposital de 38%)
vem da DISTRIBUICAO por seed (40 tentativas, padrao dos cenarios brake/
playthrough), nao do passeio organico. O lado negativo (fala com d > 6 = gate
do raio quebrado) e checado tick a tick.

Tecnologia e beneficio: o mesmo WASM serve os dois universos — bug de
navegador reproduz no node (e vice-versa), entao o gate e real, nao simulado.

### 3.4. Sistema de suspense e furtividade

Nome: subsistemas de `src/basilisk.rs` (IA, ruido, escombro) + HUD/eco em
`web/game.js`.

Descricao: transforma o basilisco de "perseguidor sempre colado" em predadora
de imprevisibilidade: patrulha por salas, caca o seu PASSADO (nao voce), ouve
por rota (paredes importam) e o jogador ganha passada silenciosa, corrida com
folego e esconderijos de escombro.

Pilares (constantes tunaveis no topo de `src/consts.rs`):

- **Patrulha por salas** (`pick_next_room`): o mapa se divide nos rects de
  sala da geracao; ela rota sala a sala, fareja (PLOITER) e escolhe a
  proxima. O sorteio soma o RASTRO do jogador: `PHIST[6]` e um anel de salas
  visitadas com carimbo de tick; a sala visitada recentemente vale
  `trail_weights()` por TEMA (castelo 7/2 · masmorra 14/5 · esgoto 21/8) —
  sala ha 20..140 ticks usa o peso "recente", ha 140..260 o "velho" (janela
  total: TRAIL_SCENT=260); a sala onde voce esta AGORA nunca e sorteavel.
  Daqui nasce o momento "entrei no quarto e ela acabou de sair": ela caca o
  seu passado, nao o seu presente. E `ear_cool()`: apos investigar, barulhos
  fracos sao ignorados por um tempo (impede a cola eterna passo por passo),
  por tema castelo 60 · masmorra 42 · esgoto 30 — nos esgotos ela acorda na
  hora. A farejada (PLOITER) e um SWEEP por pontos da sala (deliberadamente
  >= 4 tiles da cabeca, `pick_loiter_point`) com anti-retrocesso na patrulha
  (`bas_step_patrol`): mata o ping-pong de corredor.
- **Sibilo de perto** (`sibilo_tick`, basilisk.rs; EV_SIBILO=22): a fala dela
  num raio de 6 tiles (`SIB_R`) e decisao DO RT — periodos por coroa/medo
  (`SIB_PATROL_MS` 2400+d*180 · caça com coroa 1500+d*140 · clamp 1000..5200,
  o medo −140 ms/nivel piso 900). O relógio MIGROU junto: no JS era rAF
  (~16 ms de granularidade, `Math.random()` de browser), agora e o TICK do
  jogo (`ms / TICK_MS`) — deltas honestos da troca: a travessia do raio
  dispara no tick seguinte (atraso maximo <= 140 ms) e o piso de medo de
  900 ms vira 6 ticks = 840 ms; imperceptivel contra um sopro de ~2.3 s.
  E o SILENCIO DE PROPÓSITO: ~1 sopro em 3 nao sai (`SIB_GAP_PCT=38`, fora da
  caça com coroa), sorte no stream propria `rsib()` — a fala dela nao
  desgasta o rng do mundo. Vol/pan/brilho pela proximidade ficam no JS (a
  voz: dois sopros emendados + a "lingua" no fim, caso 22 do playEvent).
- **Cone de visao** (`in_cone`): ~120 graus na direcao do ultimo passo dela.
  O olhar letal e DIRECIONADO: gaze morte exige LOS + cone (raspa: d<=2 mata
  de qualquer modo). Passar ATRAS dela nao mata — premia o flanco e
  atravessadas dramaticas.
- **Ruido por rota** (`noise`): BFS no mapa real dela ATE a fonte (distancia
  de rota, nao chebyshev); cada porta fechada na linha engole -3 (max 2) e
  escombro engole -3. Ruido ALTO (correr r=15, abrir porta r=13, ou
  efeito>=10) entrega coordenada exata; ruido curto entrega so o CENTRO da
  sala mais proxima (regiao). Ruido alto acorda ela sempre; ruido curto
  respeita o EAR_COOL.
- **Escombro** (`'%'`, T_RUBBLE / attr 12 cor `#54421c`): becos-sem-saida de
  2-4 tiles escavados em parede de corredor (`dig_pockets`, 1-3 por andar;
  regra de construcao one-way: vizinhanca lateral de parede, nunca encurta
  rota nem quebra conectividade). Andavel por VOCE; para ELA o BFS barra,
  exceto com prova fresca (RUB_EVIDENCE=30 ticks quando ela TE VE entrar ou
  ouve ruido alto vindo dali). Imovel ali, voce praticamente some
  (SIGHT_RUB_STILL=1).
- **Passada e folego**: SHIFT = sneak (anda a cada 2 ticks, ruido r=1);
  X/K = correr (dash de 2 tiles, ruido r=15, custo RUN_COST=6 por passo) com
  STAM (max 100) regenerando 2/tick; abaixo de PANT_AT=25: sem correr e
  ofego involuntario (evento 17 EV_PANT, ruido r=8 a cada 5 ticks). E o
  ACREVO DELATA: no acervo (tiles '¥'/'¶' da Bocarra), CORRER sobre osso
  emite ruido `BONE_CRACK_NOISE` (r=16) e sobre carne `CORPSE_MUSH_NOISE`
  (r=17), ambos `loud=true` — coordenada exata e alcance um tile alem da
  bota (andar/sneak em osso/carne e SO CENARIO: som no playEvent 1, sem
  noise() nenhum — o bot, que nunca corre, nao muda de jogo).
- **HUD**: no CANTO INFERIOR ESQUERDO, encostado na barra de UI, largura
  DINÂMICA (sem item abraça os medidores; com item abre pra coluna de
  quadros — o vão entre colunas só existe quando há item): medidor de
  SOM (3 casas grossas em placa escura com moldura, stats[10] — calar
  discreto/andar ambar/correr laranja PISCANDO no nivel maximo), barra de
  folego (stats[11]), barra de medo (stats[18], treme em nivel alto) e a
  coluna de quadros individuais dos itens PEGOS (§ coroa / ¤ fragmento,
  STATS[8]/[20]; um abaixo do outro, caixa nenhuma quando não carrega
  nada) —
  desenhados no canvas (fundo do jogo, `drawHUD`), 100% dentro do canvas com
  margem própria. A dica contextual (uirow) mora no ESPAÇO QUE SOBRA da
  última linha à direita da placa: cabe, fica alinhada à esquerda; maior
  que a região, rola em letreiro (SÓ o render: o WASM continua entregando
  a barra inteira centralizada).
- **Echo do castelo** (JS): bus `echoIn` (GainNode) -> DelayNode de 170 ms
  com feedback 0.33 e wet 0.55 manda os passos corridos de volta ao master:
  voce OUVE seus proprios passos repetidos nos corredores vazios. O som do
  passo tem 3 intensidades (silencioso/andar/correr) dirigidas pelo medidor
  de ruido (e RESPINGA se os pes estao na agua do esgoto).

### 3.5. Oito andares tematicos

Nome: `theme()` + geracao parametrizada + temperamento (subsistemas de
`src/consts.rs` e `src/gen.rs`)

Racional: o castelo inteiro com IA identica e uma escadaria. Temas dao
geografia e curva de tensao: comeca facil (terreo, fora do habitat dela),
sofre na masmorra, jogo de sobrevivencia pura na cloaca, e a BOCARRA e o acervo:
a casa da casa — medo cravado e ela mais voraz ainda. A coroa desce para
o andar 8 (cama de corpo, no fundo da Bocarra) e a vitoria segue sendo escapar
pelo `<` do
terreo.

| # | tema | mapa | geracao | a besta |
|---|------|------|---------|---------|
| 1 | TH_CASTLE (Ruinas do castelo) | 56x32 | saloes amplos + pilares | quase adormecida: patrol 6/invest 4/hunt 3, ouvido 60, sibilo 1/90, rastro 7/2 |
| 2-3 | TH_DUNGEON (Masmorras) | 64x36 | ala de celas: 3 galerias de corredor largo empilhadas, celas 2x2 dos lados (trancada/aberta/meia/lacrada), 3-5 corredores de servico sorteados, descida em galeria/coluna sorteadas (a coluna re-rollada ate o campo de distancia desde o '<' dar a conta — ver "escada longe"), pocas rasas no andar 3 | a cacadora de sempre: 4/3/2, ouvido 42, sibilo 1/47, rastro 14/5 |
| 4-5 | TH_SEWER (Canais Envenenados) | 80x44 | 1-2 canais imperiais verticais (teto a fundo, largura/posicao sorteadas) com desabamentos (0-2 pedras por canal) e funduras '÷' (1-2 trechos, nao atravesaveis nem por ela); cavernas-bacia cortando o rio (uma garantida por canal, seca sobre a agua) + bacias/cisternas fora dos leitos | CASA dela: 3/2/2, ouvido 30, sibilo 1/23, rastro 21/8, GAZE_R+1 |
| 6-8 | TH_CAVE (Bocarra Diabolica) | 88x48 | BLOB: 9-12 camaras irregulares (circulo desdentado, centro garantido=piso) ligadas por TUNEIS TORTOS de random-walk (70% passo rumo ao alvo, 30% vaga; emergencia carve reto), pocas/linguas de agua '=' do fundo; o ACERVO tem gradiente: 6-7 ~15% do chao em '¥'/'¶' (nucleos 42-53), e no 8 a densidade por tile CRESCE rumo a sala da coroa (12% longe -> ~58% perto; a cama 7x7 e os nucleos/avrelho fecham os 71-82% medidos perto do Ferro), nucleos 20-31 — a coroa no 8 dorme no MEIO DO MONTE (quadrado 7x7 = 48 tiles de '¶') | A CASA DA CASA: 2/2/2, ouvido 20, sibilo 1/10, rastro 28/12, GAZE_R+2, ganho de medo x1.5, MEDO CRAVADO em 100 na entrada — e não decai lá embaixo |

- **Mapas por tema** (`floor_dims`): castelo 56x32, masmorras 64x36, esgoto
  80x44, BOCARRA 88x48; todos os buffers
  em `N_MAX`, dims reais publicadas em `STATS[16]/[17]`, camera no JS.
  **REGRA DE UI**: as telas FORA de jogo (titulo/controles/morte/vitoria)
  sao compostas SEMPRE no viewport padrao 56x32 — `render()` volta `DIMW/DIMH`
  para `W0/H0` quando `STATE != ST_PLAY` (o JS fora de jogo le o grid como
  56 colunas; morrer no esgoto com stride 80 rasgava a tela em diagonal).
  `gen_once` restaura as dims do andar quando ele regenera.
- **Escada longe** (`lim_descida` + campo desde `'<'`): a descida `>` (ou a
  coroa `§`) NUNCA nasce colada na escada de entrada. Um `bfs` roda desde o
  `<` imediatamente apos o terreno ficar completo, e o LIM por tema (palacio/
  masmorra 16, esgoto 20, Bocarra 22 passos de ROTA) adjudica o lugar: a
  ultima sala mantem preferencia, mas se o campo a julga perto (ou
  inancavel: centro caiu em pilar), migra para a sala mais afastada
  registrada no campo; na masmorra, a coluna da galeria sorteada re-rola
  (12 sorteios no maximo) ate dar a distancia. Soft: sem candidato ao
  limiar, a ultima sala FICA ONDE ESTA (não migra para a melhor) — nunca
  trava a planta nem regenera andar por causa disso. O ACERVO da Bocarra enche DEPOIS da escolha da
  coroa (a ancara do gradiente e a coroa de verdade, migrada ou nao).
  Seeds antigas compram plantas novas (RNG reciclado em lugar diferente);
  gate de regressao no smoke ("escada longe") varre seeds x andares.
- **Fragmento sombrio** (`¤` = 0xA4, attr 5 — o MESMO attr da coroa: o
  MESMO brilho = a MESMA matéria, por construção): o achado da run. **O
  castelo inteiro guarda NO MÁXIMO UM por run** (`SHARD_FLOOR` em
  state.rs: o u8 guarda O ANDAR que o brotou — 0 = nenhum; a semente
  morre só no `pfb_new_game` de um destino novo): após o broto, nenhum
  outro andar o repete — e a semente não olha SEEN: nem visto nem pego,
  a regra é do broto mesmo. O andar de origem o REBROTA idêntico a cada
  regeneração; o rebrote desconsidera a raridade — é o MESMO achado de
  volta — e isso cura o retry da gen_floor, que descartava o mapa de
  uma tentativa já cravada. Nasce no FIM de `gen_once`, na stream
  PRÓPRIA do achado
  (`shard_roll`, seed do andar + sal — nenhum rolagem do mundo desanda; e
  a stream aquece: os 3 primeiros draws são descartados pois o 1º roll do
  xorshift é função LINEAR do seed em GF(2) — seeds vizinhas saíam
  casadas, a varredura contígua do gate mediu ~2x a taxa real),
  com raridade escadinha nos andares 1-4: 1/4 no térreo · 2/5 no 2 · 1/2
  no 3 · COBERTO no 4 (um, e um só — se nada brotou antes: TODES as runs
  do gate saem com o seu um, 48/48); dos 5 para baixo NUNCA (o fundo já
  pulsa por si — a coroa é a matéria toda). Posição em duas caras de
  aleatoriedade: a ZONA é uma grade 3x3 do mapa (uniforme, 1/9 cada — a
  REGIÃO de spawn é sorteada por broto e o tile sai de dentro dela; o
  par de bandas de rota pintava um anel em volta da entrada: 58% à
  esquerda-alta no andar 4, 1% no canto oposto — pós-zona: 9/9 zonas
  vivas no gate, share por zona 7-16%) — e a rota >= 10 do '<' é lida no
  CAMPO FINAL (o gen_once re-corre o bfs depois de dig_pockets: os
  becos abrem atalhos andáveis e o campo da ordem era rascunho — a
  regra é sobre o mapa que fica). O tier limpo proíbe as salas de
  entrada, de descida/coroa e de nascimento DELA (o item não nasce sob
  a boca da guarda); piso seco em rota sempre (`T_FLOOR`; escada
  [zona·limpa, limpa, zona, 10+, 0] de fallback). Prova em gate +
  bancada (480 seeds espalhadas): presença 22.3/39.8/49.8/100%. NINGUÉM
  nasce sobre ele (`spawn_clear` em grid.rs: nem ela (place_basilisk,
  com varredura inteira de último recurso), nem fantasma, nem falso B,
  nem coroa-fantasma — o achado é do ladrão; ela ATRAVESSA o '¤' em jogo
  normalmente e as mentiras
  mentem só de longe). `near_tile` já o conta entre os tiles especiais
  (trava de ordem: dig_pockets roda antes, mas a lista protege).
  Pisar no `¤` pega-o: `SHARD = true` +
  `EV_SHARD` + o pulso `heart_tick` liga (mesmo efeito da coroa).
  `STATS[20]` expõe "carrega o que chia" (fragmento OU coroa).
- **Agua** (tile `'='` / attr 13, e fundura `'÷'`= 0xF7 / attr 13): nos CANAIS
   IMPERIAIS do esgoto sao 1-2 rios verticais de teto a fundo: leito de 1 a 5
  IMPERIAIS do esgoto sao 1-2 rios verticais de teto a fundo: leito de 1 a 5
  de largura com MARGENS SECAS de alvenaria (1-3 de cada lado, pisaveis) e
  lados que meandram devagar (o leito nao e reta de regua); os corredores que
  os cruzam mantem o leito (ponte molhada). O grafo de caminhabilidade nao
  muda — agua e pisavel — mas caminhar nela acelera ELA (`speed_now`: -1 no
  periodo => 1/1 tick na agua) e respinga o passo do jogador. FUNDURAS (`÷`)
  nao sao pisaveis NEM por ela e afundam a GALERIA INTEIRA (margens incluidas:
  a seca nao da a volta); desabamentos (pedra) fecham margem e leito juntos
  em MONTINHO IRREGULAR: cada linha sela o leito que meandrou nela, borda
  escalonada a sorte e cacos de '%' fora do monte, partindo cada rio em
  pedacos que se religam pelas cavernas-cortadoras.
- **Temperamento por tema** (tabelas `speed_patrol/invest/hunt`, `ear_cool`,
  `hiss_mod`, `trail_weights`, `gaze_r`): um lugar = uma besta diferente;
  fora do habitat (terreo) ela e quase decorativa, na casa dela (esgoto)
  mortifera.
- **Nomes de andar** (`floor_name` + `ARRIV`): ao chegar num piso novo, o
  nome ("RUINAS DO CASTELO", "CANAIS ENVENENADOS"...) fala na barra de UI por
  18 ticks; depois a dica contextual toma o lugar.

Contrato de balanceamento: `node scripts/smoke.mjs` e o gate real — o bot
joga com a MESMA IA que o humano enfrenta; qualquer tunagem de constante
re-precisa passar no gate.

### 3.6. Medo e loucura

Nome: subsistema de `src/fear.rs` (`fear_update`, `fear_haunt`, `phantoms_tick`,
`render_phantoms`) + HUD/áudio em `web/game.js`.

Descricao: exposição à besta sobe o medo; ausência desce — MAS devagar, e
quanto mais alto o nível, MAIS lenta a queda (histerese do susto). O medo tem
dois CHÕES que ele jamais desce abaixo (regra "o susto fica preso no corpo"):
o TRAUMA (metade do pico histórico da run, `FEAR_PK/2`) e o PAVOR AMBIENTE
(`AMBF`, teto por profundidade). E o **TOPO NÃO MATA**: em 100 de medo nada
acontece além do proprio teatro do pavor no máximo (`COLAPSO` — decisão de
design: o medo atrapalha e fascina; a morte é trabalho dela, `DEATH_R` 1/2).

Pilares (constantes tunáveis no topo de `src/consts.rs`, prefixo `FEAR_`/`PH_`):

- **Exposição**: visao mutua sobe por faixa (d<=3: +7, d<=8: +3, d<=12: +1;
  sem LOS mas d<=3 "halito de costas": +2; escamas visiveis +2; EV_STINGER
  pico +15). Nos habitats dela (esgoto e BOCARRA) ganho x1.5.
- **Queda**: 8 ticks calado comecam a acalmar; nivel 0: -2/2 ticks · nivel 1:
  -1/2 · nivel 2: -1/3 · nivel 3: -1/5 · nivel 4 (COLAPSO): -1/6, a mais lenta
  de todas — desce sempre mais lento do que sobe; e para no chão (trauma
  ou pavor ambiente, o que for maior).
- **Trauma (`FEAR_PK`)**: todo ganho marca o pico; a queda NUNCA leva o medo
  abaixo de METADE dele. Uma caçada até 60 deixa o jogador assombrado (30)
  para sempre — cicatriz, não sentença — e a espiral de terror acumula entre
  andares.
- **Pavor ambiente (`AMBF`/`AMBT`)**: sem exposição, o medo rasteja +1 a cada
  `FEAR_AMB_N` ticks até o teto `FEAR_AMB_CAP` da profundidade (terreo 6 ·
  masmorras 12/18 · esgoto 24/30 · BOCARRA 50). Monótono na run: voltar ao
  térreo não desaprende o que o fundo ensinou. E a BOCARRA CRACA — pisar no
  acervo (6-8) publica `FEAR = FEAR_MAX` e `FEAR_PK = FEAR_MAX` direto
  (flow.rs `enter_floor`): o nivel 4 nasce na chegada e o chão de queda lá
  embaixo é `FEAR_MAX` (fear.rs — o medidor não decai no fundo do fundo). Ao
  subir de volta, a cicatriz é METADE do pico (50): o teto ambiente do acervo
  fica em 50 de propósito — o horror da descida marca a volta em 50, não
  envenena o resto da run em COLAPSO inteiro. O medo nunca mata.
- **Freio do limiar (`fear_absorb`)**: lá em cima TODO susto rende menos —
  72+: metade, 86+: um quarto; e susto MIUDO (creep sem LOS d<=3, escamas do
  rastro: gain < 3) NÃO empurra o topo de jeito nenhum. O COLAPSO só avança
  por aquilo que o jogador VÊ — chegar a 100 exige vê-la de novo e de novo
  ao longo da run (de ~7 ticks no rosto dela para uns 16+, intercalados por
  andares). Aplicado nos dois caminhos de ganho (exposição e spike do
  EV_STINGER).
- **Niveis** (0..4): 30 assombrado · 55 paranoico · 75 panico · 100 COLAPSO
  (NAO mata — teatro máximo: FOV raio 6, soluco sem parar (ruido r=2),
  glitch-fantasma (EV_BODY sem corpo em tela), tudo tremendo). A decisão
  central: o medo é a DECORAÇÃO do horror; a morte é trabalho dela.
- **Pele (CSS, `fearScreen` em game.js)**: o #wrap inteiro treme (duas
  senoides desafinadas; amp 1.4px nv2, 2.6px nv3) e a vinheta #fearv(vermelho
  radial) fecha pulsando com o batimento (nv2 0.12+-0.06, nv3 0.30+-0.10).
  Fora do grid de propósito: complexidade nenhuma no WASM, efeitos nenhuma na
  logica — e sobrevive ao render incremental (overlay, nao celulas).
- **Alucinacoes — rendem no GRID de render, NUNCA em MAP/SEEN** (a logica,
  BFS/IA/gaze, jamais as ve; os fantasmas nao bloqueiam nem entregam nada):
  fantasma 'o' (attr 14, A_GHOST: trespassa paredes, evapora a d<=2, fora do
  VIS escurece como tile lembrado; TTL longo e 50% dos passos vem NA DIRECAO
  do jogador — eles assombram VOCE, mas evaporam antes de alcançar), falso 'B'
  (attr 7 do real: o sibilo dele nao responde, nao gera glitch de corpo, nasce
  so com a real a >12 tiles), coroa-fantasma (T_CROWN com attr 5 real, estatica,
  a 8..14 tiles em corredor LEMBRADO — spawn exige SEEN==1 e fora do VIS, senao
  o render a desenharia num buraco nunca visto; evapora a d<=2 — a ilusao de
  vitoria custa folego e ruido r=15 se voce correr atras, fechando a espiral
  com a IA dela).
- **Cadencia de spawn** (tabelas PH_*): fantasma 1/30 · 1/18 · 1/12 · 1/9 por
  nivel — paranoia Lenta e presente desde o grau baixo (max 2/3/4 em tela;
  NV1-2: 1 em 4 nascimentos entra A LUZ, o vislumbre no seu campo); falso B
  entra ja no nv1 rarefeito e sobe: 1/120 · 1/25 · 1/18 · 1/13; coroa
  1/45 · 1/30 · 1/22 (NV 2+); bafarra (EV_WHISPER sem fantasma) 1/240 ·
  1/25 · 1/20 · 1/14 · 1/10 — no CALMO ela e o "foi impressao minha?"; corpo
  falso (EV_BODY center-pan: arrasto separado de lugar nenhum) 1/240 ·
  1/150 · 1/60 · 1/40, metade sorteada: passos que nao existem. Tudo isso e
  APRESENTACAO: nenhuma restrutura na IA — o bot segue vencendo igual.
  PH_CD=10 espaça os nascimentos; cores no attr 14 da paleta por tema (JS).
- **Bancada de balance** (`scripts/fear_bench.mjs`): 40 jogos do bot surdo do
  debug6 com telemetria do medo (ticks por nivel, pico, alucinacoes nascidas).
  Evolução do ajuste, 40 jogos SEMPRE com 16/40 vitorias: baseline 94% dos
  ticks no nv0, 3/40 com alucinação, coroa 0/40 → trauma+pavor (19/40
  alucinando) → cadencias+freio do limiar (23/40) → terço do pico + "só a
  visão empurra o topo" (23/40, 102 fantasmas) → paranoia do grau baixo + "o
  TOPO NAO MATA": 33/40 jogos alucinando; nos jogos RESOLVIDOS (36), o medo
  mora em 81% no nivel 0 e teatraliza ~19% do tempo (nv1-4), o COLAPSO
  propriamente dito e 1.0% — decoracao dramática, nunca carcere. As mortes do
  bot sao exclusivamente dela (gaze/toque; o motivo 3 foi removido: o medo
  nunca mata). 4 jogos ficam TRAVADOS no dodge infinito do bot surdo (bancada
  apenas: o contador `travados` os segrega — o jogador humano não os vê).

- **O pulso** (`heart_tick`, fear.rs; EV_HEART=24): o SIÊNCIO é a linha de
  base do castelo — sem artefato (`SHARD || CROWN`), nenhum pulso NUNCA.
  Com o que chia (e a coroa é da mesma matéria, então ela também liga), o
  coração do LADRÃO bate com a distância chebyshev até ela — e é
  CONTÍNUO: período em ticks entre HEART_MIN_T (4 ticks de 140 ms ≈
  0.6 s no colo, a régua do tick acertando o piso de 600 ms de
  intenção) e HEART_MAX_T (12 ticks ≈ 1.7 s em d >= HEART_FAR_D = 22) —
  o teto é um coração descansado: nunca desacelera além disso, o batido
  fica sempre na frente do vento (o teto antigo de 33 ticks/4.5 s
  engolia o pulso nos andares grandes). Sorte miúda (±1 tick) na
  stream própria `rheart`. A DECISÃO é do RT
  (`game_step` a chama depois de `sibilo_tick`); o SOM é do JS (case 24 do
  playEvent: lub-dub sintetizado, volume/pan pela proximidade). Um draw de
  `rnd`/`rndn` aqui moveria TODA a aleatoriedade do mundo a partir do
  pulso — no gate, a bancada fear_bench desandou de 4/40 para 1/40 de
  vitórias até o remédio (a MESMA stream própria do sibilo) entrar.
  `STATS[20] = SHARD || CROWN` é o espelho pro HUD/testes.

## 4. Armazenamento

Nao existe: o jogo nao persiste nada (nem localStorage) — PoC sem save.
No futuro, serializar o estado (grid/stats/seeds) num ArrayBuffer e guardar
em localStorage.

## 5. Integracoes Externas

Nenhuma. Sem rede, sem APIs de terceiros. Audio e fonte (monospace do
sistema) vem do browser.

## 6. Deploy e Infraestrutura

Hosting: estatico. `web/` e auto-contido (o .wasm e comitado — GitHub Pages
serve o jogo sem build). MIME do .wasm: `application/wasm` (Pages entrega).

CI/CD: nenhum ainda. Rodar `node scripts/smoke.mjs` manualmente antes de
todo push ("SMOKE OK" e gate obritorio ate o CI existir).

Build local: `./build.sh`.

**Peculiaridade do ambiente**: os proxies do rustup estao quebrados neste host
(argv[0] vira `orca-linux`); o build.sh aponta `RUSTC` para os binarios diretos
da toolchain (~/.rustup/toolchains/...). Remover o workaround se o host mudar.

## 7. Seguranca

Sem rede, sem auth, sem dados de usuario. A unica entrada externa e o .wasm
carregado do proprio host — use HTTPS em producao (Pages entrega TLS). Inputs
do jogador sao bits de direcao mapeados por constantes; nada de entrada se
transforma em codigo.

## 8. Desenvolvimento e Teste

Setup: rustup stable + target `wasm32-unknown-unknown`; Node >= 20 para os testes.
Build: `./build.sh`. Teste: `node scripts/smoke.mjs` (espera-se `SMOKE OK`).

Cenarios cobertos: morte por gaze (exigindo o CONE de visao dela), morte por
toque, IA investiga ruido, rastro de escamas do corpo, playthrough completo
por bot (ATE OS 8 ANDARES: desce, pega a coroa no acervo e escapa; os bots
incluem a agua `=` e o acervo (`¥`/`¶`) entre os tiles passaveis),
"BOCARRA DECORADA" (massa de corpos/caveiras/agua nos 6-8 presente) e
"A PISTA NAO CONTADA" (`pfb_debug_floor(8)`: a densidade do acervo proxima
da coroa d<=10 vs d>=25 tem que vencer a distante por 1.8x, com >65% de
osso/carne perto e <=40% longe — o gradiente provado em gate),
"ESCADA LONGE" (varredura seeds x andares: a rota '<' -> '>'/§ nunca
abaixo do LIM por tema — a regra da descida distante provada em gate),
"O FRAGMENTO SOMBRIO" (varredura 24 seeds x 8 andares: raridade pelo
contrato — 1/4 no térreo, 2/5 e 1/2 na masmorra, COBERTO e ÚNICO no 4,
ZERO do 5 para baixo; todo '¤' em piso pisável) e
"O PULSO" (o bot pega o '¤' andando até ele; o pulso nasce no tick do
pega; a MEDIANA do intervalo entre batidas colada ~7-8t vs longe
12-13t (contínuo: nunca para);
CALADO sem artefato nenhum; a COROA sozinha liga o mesmo pulso),
fuzz de 6000 ticks contra
estados impossiveis.

## 9. Consideracoes Futuras / Roadmap

- **Jogo grande** (o objetivo real): itens de "ruido falso", basilisco que
  aprende padroes de fuga, salas com rachaduras de teto, final que explique
  por que uma besta protege um rei morto.
- Ajuste fino da trilha ambiente por tema (volume do vento/goteiras, stinger
  proprio ao entrar no esgoto).
- Modularizar `game.js` por dominio (audio/render/input), como ja feito no
  Rust (ver secao 1).
- CI (GitHub Actions) rodando build + smoke a cada push.
- Save em localStorage (ver secao 4).
- `wasm-opt` (binaryen) se o binario crescer; strip ja vem do cargo.

## 10. Identificacao do Projeto

Nome: Castle of Basilisk (diretorio: `castle-of-basilisc` — typo historico,
mantido de proposito; o repo GitHub usa a grafia correta).

Repo: https://github.com/VictorHugoBatista/castle-of-basilisk

Owner: Victor Hugo Batista

Ultima atualizacao: 2026-11-06

## 11. Glossario

- **Gaze**: linha de visao mutua entre basilisco e jogador dentro de
  `gaze_r()`: 4 tiles (5 nos esgotos, 6 na Bocarra). Mata instantaneamente.
  Pilar/porta
  fechada bloqueia o olhar.
- **GRACE**: 14 ticks de imunidade apos cada troca de andar (evita morte
  injusta ao emergir na escada).
- **Rastro do corpo**: ultimas ~24 posicoes da cabeca (`BODYBUF`, via
  `pfb_debug_body_ptr`), atualizadas a cada passo real dela (abrir porta gasta
  turno SEM avancar o corpo — ela esta "enrolada"). Visual/audio apenas:
  encostar no corpo nao mata e nao alerta; tile `~`, attr 11, eventos 14/15/16
  (centro/esquerda/direita do segmento visivel mais proximo, cooldown 10 ticks).
- **CFREEZE**: 15 ticks de atordoamento do basilisco quando a coroa e roubada.
- **ATTR**: segundo byte do grid; indice da paleta JS + flag `0x80` de
  "lembrado" (fog of war).
- **Bot**: jogador automatico headless dos testes. E "surdo" (nao ouve o
  sibilo), portanto e o pior caso do gameplay: se o bot vence, humano vence.
- **Sombra** (`,`) — tile que esconde: imovel = visao dela 2 tiles; andando = 4;
  no claro = 8. Com a coroa: andar em sombra = farol; imovel em sombra = o
  basilisco persegue sua ultima posicao conhecida, nao voce.
- **Falso `B` / coroa-fantasma / fantasma** (`o`): alucinações do medo (seção
  3.6) — rendem apenas no GRID de render; `pfb_debug_fear(f)` injeta medo e
  `pfb_debug_fear_ptr()` publica o espelho `[FEAR, nivel, n fantasmas, fake B,
  coroa falsa]` para o smoke.
- **EV_18..21**: eventos mentais (sussurro / soluço / evaporou / coroa mentiu).
  O JS não os panlama pela posição real da besta: acontecem dentro da cabeça.
- **EV_23/24 e STATS[20]**: borda do FRAGMENTO SOMBRIO — `EV_SHARD` (o
  achado) e `EV_HEART` (o pulso do ladrão pela distância dela; decisão no
  RT, `heart_tick` de fear.rs). **Fragmento sombrio** (`¤`, `T_SHARD`,
  attr 5): o achado da matéria da coroa — como a coroa-fantasma, o
  brilho é herdado por construção; um por run (`SHARD_FLOOR`: o u8 da
  semente guarda o andar que o brotou — os demais ficam vazios, e o
  andar de origem o rebrota idêntico quando regenera;
  `pfb_debug_shard_reset` apaga a semente para a varredura por andar do
  smoke). Raridade: 1/4 · 2/5 · 1/2 · coberto no 4 (se nada brotou
  antes); nunca dos 5 para baixo.
- **EV_22 / DIFF**: borda da migração de glue para RT — `EV_SIBILO` é a
  decisão de fala dela (basilisk.rs; a voz é toda do JS) e `DIFF`
  (`pfb_diff_ptr`) é o bitmap de render diff que o Rust produz e o JS pinta
  (sticky até `pfb_diff_ack`).
- **tick**: ciclo de jogo de 140 ms. O basilisco move a cada N ticks por
  tema (`speed_patrol/invest/hunt`): castelo 6/4/3, masmorra 4/3/2, esgoto
  3/2/2, BOCARRA 2/2/2 — e 1/1 NA AGUA do esgoto e da caverna (`speed_now`).
  Com a coroa ela caça 1
  periodo mais lento ainda.
- **Tema** (`theme(depth)`): TH_CASTLE (andar 1), TH_DUNGEON (2-3),
  TH_SEWER (4-5), TH_CAVE (6-8, a BOCARRA). Dirige geracao de salas, mapa
  (56x32 · 64x36 · 80x44 · 88x48), agua e TODAS as tabelas de temperamento do
  basilisco.
- **Agua** (`'='`, 0x3D, attr 13): tile do esgoto E da BOCARRA, andavel por
  ambos — mas e o meio nativo dela (1/1 tick) e respinga o passo do jogador.
- **Corpo do acervo (`'¶'`, 0xB6, attr 12/osso)**: corpos do acervo (Bocarra) —
  caminhavel, decoracao: ela trouxe; a coroa (andar 8) dorme numa cama deles.
- **Cama de corpo**: ao redor de `§` (andar 8), todo piso a 2 tiles vira `¶`.
- **UIROW**: barra de UI fabricada pelo WASM (W0 celulas x [char,attr], via
  `pfb_ui_ptr`): dica contextual e nome do andar, fixa na ULTIMA LINHA DA
  TELA (seguem a camera, nao o mapa).
- **ESCOLHA DE ANDAR (ST_SELECT, estado 5)**: o konami é rastreado em
  `pfb_menu` (bits 32/512 para as letras; o progresso mora em `KONAMI_I`,
  zero em `pfb_new_game`): passos do código são CONSUMIDOS (as setas dele
  não alternam o esquema; o A solto FORA do código segue alternando p/
  WASD), o final abre o menu — 8
  andares; CONFIRMAR salta por `jump_floor(N)` (o MESMO caminho de
  `pfb_debug_floor`): seeds por andar, GRACE e o CRACO do medo valem
  (pousar no 8 nasce em COLAPSO). Cursor em `KONSEL`, envolve (8 -> 1);
  ESC volta às CONTROLES. A abertura SÓ nas CONTROLES (fora, o rastro não
  anda — e os passos errados resetam no próprio lugar).
- **ARRIV**: tick da chegada no andar; os primeiros 18 ticks exibem
  `floor_name` ("MASMORRA ASSOMBRADA", "CANAIS ENVENENADOS") na barra de UI.
