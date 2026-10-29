# Visao Geral de Arquitetura

Documento vivo: reune TODAS as decisoes arquiteturais do Castle of Basilisk,
racional incluido, para que qualquer dev (ou agente) entenda e contribua no
mesmo dia. Atualize a cada mudanca de contrato (exports, layout de memoria,
regras de jogo). O gameplay em si esta detalhado no README.

## 1. Estrutura do Projeto

```
castle-of-basilisc/
├── src/
│   └── lib.rs              # O JOGO INTEIRO em um arquivo (~1150 linhas, Rust puro)
├── web/
│   ├── index.html          # Canvas 672x576 + filtro CRT 100% CSS
│   ├── game.js             # Glue JS: tick de 140ms, render diff, WebAudio
│   └── wasm/
│       └── castle_of_basilisk.wasm   # Binario compilado (~28 KB), comitado
├── scripts/
│   ├── smoke.mjs           # Gate de testes headless (so merge com "SMOKE OK")
│   └── debug6.mjs          # Bancada do bot playthrough (mede taxa de vitoria)
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
   |  | rAF loop           |  memoria: grid (56x32x2B) | stats (16B)
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
| `pfb_init`      | `() ()`                      | desenha tela de titulo |
| `pfb_new_game`  | `(seed: u32)`                | novo jogo deterministico |
| `pfb_step`      | `(input: u32)`               | um tick (bits: 1 UP, 2 DOWN, 4 LEFT, 8 RIGHT, 16 WAIT) |
| `pfb_state`     | `() u32`                     | 0 titulo, 1 jogo, 2 morte, 3 vitoria |
| `pfb_grid_ptr`  | `() u32`                     | ponteiro do grid de render |
| `pfb_stats_ptr` | `() u32`                     | ponteiro do bloco de stats |
| `pfb_pop_event` | `() u32`                     | consome fila de audio (0 = vazia) |
| `pfb_debug_*`   | place/map/probe/give_crown   | somente para testes headless |

Layout de memoria:
- **Grid**: `56x32` celulas x `[char: u8, attr: u8]`. Char da tabela ASCII;
  coroa = byte `0xA7` ('§' latin-1). Attr = indice da paleta (0..15) OU
  `0x80 | indice` quando o tile e "lembrado" (fog of war) e escurece no render.
- **Stats** (u8[16]): `[0] estado`, `[1] motivo de morte (1 olhar, 2 toque)`,
  `[2] profundidade`, `[3] px`, `[4] py`, `[5] bx`, `[6] by`,
  `[7] estado da IA (0 patrol, 1 invest, 2 hunt)`, `[8] coroa`.
  **REGRA DE OURO**: qualquer funcao que mude estado (morte/vitoria/eventos)
  DEVE chamar `sync_stats()`. (Dois bugs ja nasceram de stats obsoletos.)
- **Eventos**: ring buffer `u32[16]`, produtor (Rust) / consumidor (JS).

RNG: xorshift32 com seed POR ANDAR (`SEEDS[3]`), definida em `pfb_new_game`.
Subir e descer NAO regenera o mapa: o mesmo seed reproduz o mesmo andar.

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
- **Render diff**: `prevGrid` compara `[char,attr]` por celula; celula animada
  (pulso/blink dos attrs) redesenha sempre. Evita redesenho global.
- **CRT em CSS puro** (scanlines `repeating-linear-gradient`, vinheta
  `radial-gradient`, flicker por keyframes): custo ZERO de runtime vs shaders.
- **Paleta monocromatica (familia #ffb000) sobre #050200**, basilisco em
  `#ff8f00` mais quente; coroa e escadas pulsam; attr 9 pisca.
- **`AudioContext` so no primeiro gesto do usuario** (exigencia dos
  navegadores). Drone grave (55/58,3 Hz triangle + lowpass) e o "hum" do castelo.
- **Todos os sons sao sintetizados**: oscillator + gain envelope + StereoPanner.
  Zero samples (binario web leve). Coracao: intervalo/volume/pitch pela
  distancia chebyshev; pan pelo sinal de dx (direita/esquerda).

### 3.3. Testes headless

Nome: `scripts/smoke.mjs` (gate) e `scripts/debug6.mjs` (bancada)

Descricao: rodam o MESMO binario do navegador direto no Node. O smoke valida
regras por cenario e um bot joga do zero ate vencer. Bot: BFS que EVITA a zona
de perigo (LOS<=9 ou dist<=3), replanejamento a cada 6 passos, esquiva
geometrica com eixo travado, desvio do tile quando o alvo esta sob os pes.

Tecnologia e beneficio: o mesmo WASM serve os dois universos — bug de
navegador reproduz no node (e vice-versa), entao o gate e real, nao simulado.

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

Cenarios cobertos: morte por gaze, morte por toque, IA investiga ruido,
playthrough completo por bot (ate 40 sementes), fuzz de 6000 ticks contra
estados impossiveis.

## 9. Consideracoes Futuras / Roadmap

- **Jogo grande** (o objetivo real): mais andares, itens de "ruido falso",
  basilisco que aprende padroes de fuga, salas com rachaduras de teto,
  final que explique por que uma besta protege um rei morto.
- Modularizar `lib.rs` quando o escopo passar de PoC (ver secao 1).
- CI (GitHub Actions) rodando build + smoke a cada push.
- Save em localStorage (ver secao 4).
- `wasm-opt` (binaryen) se o binario crescer; strip ja vem do cargo.

## 10. Identificacao do Projeto

Nome: Castle of Basilisk (diretorio: `castle-of-basilisc` — typo historico,
mantido de proposito; o repo GitHub usa a grafia correta).

Repo: https://github.com/VictorHugoBatista/castle-of-basilisk

Owner: Victor Hugo Batista

Ultima atualizacao: 2026-10-29

## 11. Glossario

- **Gaze**: linha de visao mutua entre basilisco e jogador dentro de GAZE_R
  (4 tiles). Mata instantaneamente. Pilar/porta fechada bloqueia o olhar.
- **GRACE**: 14 ticks de imunidade apos cada troca de andar (evita morte
  injusta ao emergir na escada).
- **CFREEZE**: 15 ticks de atordoamento do basilisco quando a coroa e roubada.
- **ATTR**: segundo byte do grid; indice da paleta JS + flag `0x80` de
  "lembrado" (fog of war).
- **Bot**: jogador automatico headless dos testes. E "surdo" (nao ouve o
  coracao), portanto e o pior caso do gameplay: se o bot vence, humano vence.
- **Sombra** (`,`) — tile que esconde: imovel = visao dela 2 tiles; andando = 4;
  no claro = 8. Com a coroa: andar em sombra = farol; imovel em sombra = o
  basilisco persegue sua ultima posicao conhecida, nao voce.
- **tick**: ciclo de jogo de 140 ms. O basilisco move a cada N ticks
  (patrulha 4, investigacao 2, cacada 2, cacada com coroa 3).
