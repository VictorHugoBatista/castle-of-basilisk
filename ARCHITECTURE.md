# Visao Geral de Arquitetura

Documento vivo: reune TODAS as decisoes arquiteturais do Castle of Basilisk,
racional incluido, para que qualquer dev (ou agente) entenda e contribua no
mesmo dia. Atualize a cada mudanca de contrato (exports, layout de memoria,
regras de jogo). O gameplay em si esta detalhado no README.

## 1. Estrutura do Projeto

```
castle-of-basilisc/
├── src/
│   └── lib.rs              # O JOGO INTEIRO em um arquivo (~1900 linhas, Rust puro)
├── web/
│   ├── index.html          # Canvas 672x576 + filtro CRT 100% CSS
│   ├── game.js             # Glue JS: tick de 140ms, camera, render diff, WebAudio
│   └── wasm/
│       └── castle_of_basilisk.wasm   # Binario compilado (~37 KB), comitado
├── scripts/
│   ├── smoke.mjs           # Gate de testes headless (so merge com "SMOKE OK")
│   ├── debug6.mjs          # Bancada do bot playthrough (mede taxa de vitoria)
│   └── fear_bench.mjs      # Bancada do MEDO: telemetria de niveis/alucinacoes
├── build.sh                # cargo build release + copia para web/wasm
├── Cargo.toml              # cdylib, zero dependencias
├── README.md               # Como jogar
├── .gitignore              # target/ e lixo local
└── ARCHITECTURE.md         # Este documento
```

Decisao: **um unico arquivo Rust** (src/lib.rs). Racional: o jogo cabe clinicamente
em um arquivo, evita saltos de contexto e burocracia num proof of concept.
Se crescer, dividir por dominio: `gen.rs`, `basilisk.rs`, `fov.rs`, `exports.rs`.

## 2. Diagrama do Sistema

```
[Usuario]
   v  keyboard (WASD/setas/ESPACO/ENTER)
[game.js] --fetch--> [castle_of_basilisk.wasm] --instantiate--> memoria linear
   ^  ^                    |  exports: pfb_init/new_game/step/pop_event/...
   |  | rAF loop           |  memoria: grid (80x44 MAX x2B, dims por andar) | stats (24B)
   |  +--- tick 140ms ---->|  eventos: ring buffer u32[16]
   |
[CRT CSS]  <--- canvas --- render diff por celula
[WebAudio] <--- eventos -- efeitos sintetizados + coracao por proximidade
```

Nao existe server, banco de dados ou rede. O jogo roda inteiro no navegador;
todo o estado vive na memoria linear do WASM.

## 3. Componentes Nucleo

### 3.1. Nucleo do jogo (WASM)

Nome: `src/lib.rs` -> `castle_of_basilisk.wasm`

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
| `pfb_menu`      | `(input: u32)`               | teclado dos menus (bits: 1 UP, 2 DOWN, 4 LEFT, 8 RIGHT, 16 OK, 64 BACK) |
| `pfb_state`     | `() u32`                     | 0 titulo, 1 jogo, 2 morte, 3 vitoria, 4 controles |
| `pfb_grid_ptr`  | `() u32`                     | ponteiro do grid de render (dims atuais em STATS[16]/[17]) |
| `pfb_max_n`     | `() u32`                     | tamanho MAXIMO do grid (W_MAX*H_MAX = 3520): o JS dimensiona as views |
| `pfb_ui_ptr`    | `() u32`                     | barra de UI fabricada (W0 celulas x [char,attr]): dica contextual / nome do andar |
| `pfb_stats_ptr` | `() u32`                     | ponteiro do bloco de stats |
| `pfb_pop_event` | `() u32`                     | consome fila de audio (0 = vazia) |
| `pfb_debug_*`   | place/map/probe/body_ptr/ai/give_crown/fear/fear_ptr | somente para testes headless |

Layout de memoria:
- **Grid**: buffer maximo `W_MAX x H_MAX` (80x44) celulas x `[char: u8, attr: u8]`,
  dimensoes REAIS do andar atual publicadas em `STATS[16]/[17]` (funcoes `W()`/`H()`
  leem `DIMW/DIMH`: castelo e masmorras 56x32, esgotos 80x44). Char da tabela
  ASCII; coroa = byte `0xA7` ('§' latin-1), agua = `'='` (0x3D). Attr = indice da
  paleta (0..15) OU `0x80 | indice` quando o tile e "lembrado" (fog of war) e
  escurece no render.
- **Stats** (u8[32]): `[0] estado`, `[1] motivo de morte (1 olhar, 2 toque,
  3 loucura)`,
  `[2] profundidade`, `[3] px`, `[4] py`, `[5] bx`, `[6] by`,
  `[7] estado da IA (0 patrol, 1 invest, 2 hunt)`, `[8] coroa`,
  `[9] segmentos do corpo visíveis` (o JS usa para "engordar" o drone),
  `[10] nivel de ruido do tick (0..3, alimenta o HUD)`, `[11] folego (0..100)`,
  `[12] jogador esta em escombro (0/1)`, `[13] pedido de iniciar (menu -> JS
  semeia pfb_new_game e limpa)`, `[14] cursor do menu (0 INICIAR, 1 CONTROLES)`,
  `[15] modo de teclas (0 WASD, 1 SETAS — o J S usa para filtrar a tecla de
  corrida X/K)`, `[16] largura do andar atual`, `[17] altura do andar atual`,
  `[18] medo (0..100)`, `[19] nivel do medo (0..4; 4 = LOUCURA, morte)`.
  **REGRA DE OURO**: qualquer funcao que mude estado (morte/vitoria/eventos)
  DEVE chamar `sync_stats()`. (Dois bugs ja nasceram de stats obsoletos —
  o terceiro: `return` cedo apos descer de andar deixava o bot do smoke
  replanejando com posicao velha sob mapa novo; sincronizar OU seguir o fluxo
  normal do tick.)
- **Eventos**: ring buffer `u32[16]`, produtor (Rust) / consumidor (JS).
  `18` EV_WHISPER (sussurro: nasceu alucinacao) · `19` EV_WHELP (soluco
  involuntario do medo) · `20` EV_VANISH (alucinacao evaporou de perto) ·
  `21` EV_VANISH_C (a coroa-fantasma evaporou).

RNG: xorshift32 com seed POR ANDAR (`SEEDS[FLOORS]`, FLOORS=5), definida em
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
- **Render diff**: `prevGrid` compara `[char,attr]` por celula DE TELA; celula
  animada (pulso/blink dos attrs, agua `=` com onda de lodo) redesenha sempre.
  Evita redesenho global.
- **Camera segue-jogador**: viewport FIXA 56x32 (o canvas de sempre); mapas
  maiores (esgoto 80x44) deslizam sob ela via `camX/camY` clampados nas bordas.
  Mudou andar ou dimensoes => `needsFull` (remontagem integral). A dica
  contextual mora na ULTIMA LINHA DA TELA (UIROW exportada pelo WASM): com a
  camera, a ultima linha do mapa nem sempre esta visivel.
- **Paletas por tema** (`PAL_CASTLE/PAL_DUNGEON/PAL_SEWER`, mesmos indices de
  attr): a troca de andar troca a referencia de paleta + `needsFull` — o CRT
  veste a cor do lugar (ambar rico / ambar seco / verde-lodo).
- **CRT em CSS puro** (scanlines `repeating-linear-gradient`, vinheta
  `radial-gradient`, flicker por keyframes): custo ZERO de runtime vs shaders.
- **Paleta monocromatica (familia #ffb000) sobre #050200**; a EXCECAO e a
  serpente, em vermelho para saltar do monocromo: cabeca `B` `#ff2e00`, corpo
  `~` (attr 11) `#bf1600`; coroa e escadas pulsam; attr 9 pisca.
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
  de caca perto. Passos respingam na agua (`T_WATER` sob os pes).
- **Todos os sons sao sintetizados**: oscillator + gain envelope + StereoPanner.
  Zero samples (binario web leve). Coracao: intervalo/volume/pitch pela
  distancia chebyshev; pan pelo sinal de dx (direita/esquerda).

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

Tecnologia e beneficio: o mesmo WASM serve os dois universos — bug de
navegador reproduz no node (e vice-versa), entao o gate e real, nao simulado.

### 3.4. Sistema de suspense e furtividade

Nome: subsistemas de `src/lib.rs` (IA, ruido, escombro) + HUD/eco em
`web/game.js`.

Descricao: transforma o basilisco de "perseguidor sempre colado" em predadora
de imprevisibilidade: patrulha por salas, caca o seu PASSADO (nao voce), ouve
por rota (paredes importam) e o jogador ganha passada silenciosa, corrida com
folego e esconderijos de escombro.

Pilares (constantes tunaveis no topo de `src/lib.rs`):

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
  ofego involuntario (evento 17 EV_PANT, ruido r=8 a cada 5 ticks).
- **HUD**: medidor de SOM (3 casas grossas em placa escura com moldura,
  stats[10] — calar discreto/andar ambar/correr laranja PISCANDO no nivel
  maximo) e barra de folego (stats[11]) desenhados no canvas (fundo do jogo,
  `drawHUD`).
- **Echo do castelo** (JS): bus `echoIn` (GainNode) -> DelayNode de 170 ms
  com feedback 0.33 e wet 0.55 manda os passos corridos de volta ao master:
  voce OUVE seus proprios passos repetidos nos corredores vazios. O som do
  passo tem 3 intensidades (silencioso/andar/correr) dirigidas pelo medidor
  de ruido (e RESPINGA se os pes estao na agua do esgoto).

### 3.5. Cinco andares tematicos

Nome: `theme()` + geracao parametrizada + temperamento (subsistemas de
`src/lib.rs`)

Racional: o castelo inteiro com IA identica e uma escadaria. Temas dao
geografia e curva de tensao: comeca facil (terreo, fora do habitat dela),
sofre na masmorra, jogo de sobrevivencia pura na cloaca. A coroa desce para
o andar 5 (fundo da cloaca) e a vitoria segue sendo escapar pelo `<` do
terreo.

| # | tema | mapa | geracao | a besta |
|---|------|------|---------|---------|
| 1 | TH_CASTLE (Ruinas do castelo) | 56x32 | saloes amplos + pilares | quase adormecida: patrol 6/invest 4/hunt 3, ouvido 60, sibilo 1/90, rastro 7/2 |
| 2-3 | TH_DUNGEON (Masmorras) | 56x32 | celas apertadas, mais portas/sombra/escombro | a cacadora de sempre: 4/3/2, ouvido 42, sibilo 1/47, rastro 14/5 |
| 4-5 | TH_SEWER (Canais Envenenados) | 80x44 | bacias/cisternas em rede maior, loops de fuga, canais de agua | CASA dela: 3/2/2, ouvido 30, sibilo 1/23, rastro 21/8, GAZE_R+1 |

- **Mapa maior no esgoto** (`floor_dims`): 80x44 vs 56x32; todos os buffers
  em `N_MAX`, dims reais publicadas em `STATS[16]/[17]`, camera no JS.
  **REGRA DE UI**: as telas FORA de jogo (titulo/controles/morte/vitoria)
  sao compostas SEMPRE no viewport padrao 56x32 — `render()` volta `DIMW/DIMH`
  para `W0/H0` quando `STATE != ST_PLAY` (o JS fora de jogo le o grid como
  56 colunas; morrer no esgoto com stride 80 rasgava a tela em diagonal).
  `gen_once` restaura as dims do andar quando ele regenera.
- **Agua** (`seed_water`, so esgoto; tile `'='` / attr 13): rachaduras de
  rio por passeio aleatorio que convertem APENAS piso de CORREDOR (fora de
  sala) — o grafo de BFS/portas nao muda, muda o chao: caminhar na agua
  acelera ELA (`speed_now`: -1 no periodo => 1/1 tick na agua) e respinga o
  passo do jogador.
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

Nome: subsistema de `src/lib.rs` (`fear_update`, `fear_haunt`, `phantoms_tick`,
`render_phantoms`) + HUD/áudio em `web/game.js`.

Descricao: exposição à besta sobe o medo; ausência desce — MAS devagar, e
quanto mais alto o nível, MAIS lenta a queda (histerese do susto). O medo tem
dois CHÕES que ele jamais desce abaixo (regra "o susto fica preso no corpo"):
o TRAUMA (metade do pico histórico da run, `FEAR_PK/2`) e o PAVOR AMBIENTE
(`AMBF`, teto por profundidade). Em 100 de medo, a loucura mata sozinha
(motivo 3, `DEATH_R`).

Pilares (constantes tunáveis no topo de `src/lib.rs`, prefixo `FEAR_`/`PH_`):

- **Exposição**: visao mutua sobe por faixa (d<=3: +7, d<=8: +3, d<=12: +1;
  sem LOS mas d<=3 "halito de costas": +2; escamas visiveis +2; EV_STINGER
  pico +15). No esgoto (habitat) ganho x1.5.
- **Queda**: 8 ticks calado comecam a acalmar; nivel 0: -2/2 ticks · nivel 1:
  -1/2 · nivel 2: -1/3 · nivel 3: -1/5 — desce sempre mais lento do que sobe;
  e para no chão (trauma ou pavor ambiente, o que for maior).
- **Trauma (`FEAR_PK`)**: todo ganho marca o pico; a queda NUNCA leva o medo
  abaixo de metade dele. Uma caçada até 60 deixa o jogador assombrado (30+)
  pelo resto da run — a espiral de terror acumula entre andares.
- **Pavor ambiente (`AMBF`/`AMBT`)**: sem exposição, o medo rasteja +1 a cada
  `FEAR_AMB_N` ticks até o teto `FEAR_AMB_CAP` da profundidade (terreo 6 ·
  masmorras 12/18 · esgoto 24/30). Monótono na run: voltar ao térreo não
  desaprende o que o esgoto ensinou. No habitat dela o teto é 30 = nivel 1
  sozinho: o LUGAR assombra.
- **Niveis** (0..4): 30 assombrado · 55 paranoico · 75 panico · 100 LOUCURA
  (morte). Panico encolhe o FOV para raio 6, soluco involuntario (ruido r=2)
  e glitch-fantasma (EV_BODY sem corpo em tela).
- **Alucinacoes — rendem no GRID de render, NUNCA em MAP/SEEN** (a logica,
  BFS/IA/gaze, jamais as ve; os fantasmas nao bloqueiam nem entregam nada):
  fantasma 'o' (attr 14, A_GHOST: trespassa paredes, evapora a d<=2, fora do
  VIS escurece como tile lembrado; TTL longo e 50% dos passos vem NA DIRECAO
  do jogador — eles assombram VOCE, mas evaporam antes de alcançar), falso 'B'
  (attr 7 do real: o coracao dele nao responde, nao gera glitch de corpo, nasce
  so com a real a >12 tiles), coroa-fantasma (T_CROWN com attr 5 real, estatica,
  a 8..14 tiles em corredor LEMBRADO — spawn exige SEEN==1 e fora do VIS, senao
  o render a desenharia num buraco nunca visto; evapora a d<=2 — a ilusao de
  vitoria custa folego e ruido r=15 se voce correr atras, fechando a espiral
  com a IA dela).
- **Cadencia de spawn** (tabelas PH_*): fantasma 1/70 · 1/35 · 1/20 · 1/12 por
  nivel (max 2/3/4 em tela); falso B 1/55 · 1/35 · 1/25 (NV 2+); coroa
  1/100 · 1/45 · 1/35 (NV 2+, nunca com a coroa na mao); bafarra solta
  (EV_WHISPER sem fantasma) 1/110 · 1/60 · 1/40 · 1/25. PH_CD=10 espaça
  nascimentos; cores no attr 14 da paleta por tema (JS).
- **Bancada de balance** (`scripts/fear_bench.mjs`): 40 jogos do bot surdo do
  debug6 com telemetria do medo (ticks por nivel, pico, alucinacoes nascidas).
  Referência do ajuste "efeito invisível": antes 94% dos ticks no nivel 0,
  3/40 jogos com alucinação e coroa 0/40; depois ~88% no nivel 0, ~20/40 com
  alucinação e 16/40 vitorias INALTERADAS (loucura 10→9).

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
por bot (ATE OS 5 ANDARES: desce, pega a coroa na Cloaca e escapa; os bots
incluem a agua `=` entre os tiles passaveis), fuzz de 6000 ticks contra
estados impossiveis.

## 9. Consideracoes Futuras / Roadmap

- **Jogo grande** (o objetivo real): itens de "ruido falso", basilisco que
  aprende padroes de fuga, salas com rachaduras de teto, final que explique
  por que uma besta protege um rei morto.
- Ajuste fino da trilha ambiente por tema (volume do vento/goteiras, stinger
  proprio ao entrar no esgoto).
- Modularizar `lib.rs` quando o escopo passar de PoC (ver secao 1).
- CI (GitHub Actions) rodando build + smoke a cada push.
- Save em localStorage (ver secao 4).
- `wasm-opt` (binaryen) se o binario crescer; strip ja vem do cargo.

## 10. Identificacao do Projeto

Nome: Castle of Basilisk (diretorio: `castle-of-basilisc` — typo historico,
mantido de proposito; o repo GitHub usa a grafia correta).

Repo: https://github.com/VictorHugoBatista/castle-of-basilisk

Owner: Victor Hugo Batista

Ultima atualizacao: 2026-11-03

## 11. Glossario

- **Gaze**: linha de visao mutua entre basilisco e jogador dentro de
  `gaze_r()`: 4 tiles (5 nos esgotos). Mata instantaneamente. Pilar/porta
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
  coracao), portanto e o pior caso do gameplay: se o bot vence, humano vence.
- **Sombra** (`,`) — tile que esconde: imovel = visao dela 2 tiles; andando = 4;
  no claro = 8. Com a coroa: andar em sombra = farol; imovel em sombra = o
  basilisco persegue sua ultima posicao conhecida, nao voce.
- **Falso `B` / coroa-fantasma / fantasma** (`o`): alucinações do medo (seção
  3.6) — rendem apenas no GRID de render; `pfb_debug_fear(f)` injeta medo e
  `pfb_debug_fear_ptr()` publica o espelho `[FEAR, nivel, n fantasmas, fake B,
  coroa falsa]` para o smoke.
- **EV_18..21**: eventos mentais (sussurro / soluço / evaporou / coroa mentiu).
  O JS não os panlama pela posição real da besta: acontecem dentro da cabeça.
- **tick**: ciclo de jogo de 140 ms. O basilisco move a cada N ticks por
  tema (`speed_patrol/invest/hunt`): castelo 6/4/3, masmorra 4/3/2, esgoto
  3/2/2 — e 1/1 NA AGUA do esgoto (`speed_now`). Com a coroa ela caça 1
  periodo mais lento ainda.
- **Tema** (`theme(depth)`): TH_CASTLE (andar 1), TH_DUNGEON (2-3),
  TH_SEWER (4-5). Dirige geracao de salas, mapa (56x32 vs 80x44), agua e
  TODAS as tabelas de temperamento do basilisco.
- **Agua** (`'='`, 0x3D, attr 13): tile so do esgoto, andavel por ambos —
  mas e o meio nativo dela (1/1 tick) e respinga o passo do jogador.
- **UIROW**: barra de UI fabricada pelo WASM (W0 celulas x [char,attr], via
  `pfb_ui_ptr`): dica contextual e nome do andar, fixa na ULTIMA LINHA DA
  TELA (seguem a camera, nao o mapa).
- **ARRIV**: tick da chegada no andar; os primeiros 18 ticks exibem
  `floor_name` ("MASMORRA ASSOMBRADA", "CANAIS ENVENENADOS") na barra de UI.
