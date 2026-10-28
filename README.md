# CASTLE OF BASILISK

*Proof of concept* de um roguelike **survival horror** com estética ASCII anos 80,
compilado para **WebAssembly**. Sem itens, sem vida, sem curas: **um toque mata e
um olhar mata**. A única defesa é **se esconder**.

Você é um ladrão. O rei morreu há cem anos e o castelo apodrece, mas o guardião
continua rondando: um **basilisco** cego, gigante, paciente. O objetivo é roubar
**a coroa do rei morto** (andar òssario, andar 3) e **fugir pelo portão** do
térreo — e ela continuará de caça até o fim.

## como rodar

```
./build.sh             # compila Rust -> WASM (precisa do cargo + wasm32-unknown-unknown)
python3 -m http.server -d web 8000
# abra http://localhost:8000
```

Ou abra o `web/index.html` direto no navegador, se o `fetch` local do seu navegador
aceitar (Chrome bloqueia `file://`; use o servidor HTTP).

## controles

| tecla | ação |
|---|---|
| WASD / setas | mover |
| ESPAÇO | esperar (ficar imóvel) |
| ENTER | começar / reiniciar |

## como jogar (e sobreviver)

- **`B` = o basilisco.** Se ele *puder ver você* a até 5 tiles (linha de visão
  aberta, raios de pilar/porta bloqueiam), o olhar mata.
- Se ele **tocar** você, as escamas matam. Não existe vida.
- `,` = **sombra**. Imóvel dentro dela, você é quase invisível (visão 2 tiles).
  Anda na sombra? 4 tiles. No claro? Ele te vê a 8.
- Ele **ouve**: passos no claro (raio 5), na sombra (raio 3), portas abertas
  (raio 12 — cuidado ao se esconder atrás delas).
- Ao pegar a **coroa** (`§` no altar, andar 3), ele **grita** (15 ticks de
  atordoamento — sua chance de arrancar) e entra em caça eterna pelo cheiro.
  Anda em sombra = farol. **Fica imóvel em sombra = você volta a ser só um
  cheiro fraco** — ela procura sua última posição, não a sua.
- Ouça o **coração**: intervalo curto = ela está perto; pan = da direita/esquerda.

## arquitetura

```
src/lib.rs                 todo o jogo, Rust puro, sem crates (ABI WASM crua)
web/index.html             canvas + filtro CRT em CSS puro (scanlines, vinheta, flicker)
web/game.js                glue: rAF + tick de 140ms, render por diff de bytes, WebAudio
web/wasm/*.wasm            binário (~27 KB)
build.sh                   cargo build --release + copy para web/wasm
scripts/smoke.mjs          gate de testes headless (roda o jogo no Node)
scripts/debug6.mjs         bancada do bot playthrough
```

### WASM ABI

Nada de wasm-bindgen: o módulo expõe funções `#[no_mangle] extern "C"`:

- `pfb_init()` — desenha a tela de título
- `pfb_new_game(seed)` — novo jogo
- `pfb_step(input)` — um tick (bits: 1↑ 2↓ 4← 8→ 16 espera)
- `pfb_grid_ptr()` / `pfb_stats_ptr()` — ponteiros para o grid (2 bytes por
  célula: `[char][attr]`) e para o bloco de status
- `pfb_pop_event()` — fila de eventos de áudio
- `pfb_state()` — 0 título, 1 jogando, 2 morto, 3 vitória
- `pfb_debug_*` — ferramentas dos testes (place/map/probe/give_crown)

O WASM nunca aloca: as views JS são criadas uma vez e ficam válidas.

### eventos de áudio (síntese WebAudio, zero samples)

`1` passo · `2` porta · `3/4` escadas · `5` stinger (ELE TE VIU) · `6` coroa ·
`7` morte · `8` vitória · `10` alerta (ele ouviu algo) · `11` alívio (perdeu
seu rastro) · `12` sibilo distante · `13` A BESTA abriu uma porta —
mais o **batimento cardíaco** contínuo (intervalo/volume/pan pela distância)
e o drone ambiente do castelo.

## smoke test (headless)

```
node scripts/smoke.mjs
```

Valida: morte por olhar, morte por toque, IA investigando ruído,
**um playthrough completo por bot BFS** (desce 3 andares, pega a coroa,
escapa — rotas que evitam a zona de gaze, esquiva geométrica) e fuzz de
6000 ticks sem estados impossíveis.

## status do conceito

Escopo *proof of concept*: 3 andares procedurais (salas + corredores + portas +
pilares + sombras), IA em 3 estados (patrulha/invest/caça) com BFS real,
FOV por raio-cast, Um toque mata / Um olhar mata. Para o jogo grande:
mais andares, itens de "ruído falso", basilisco aprendendo padrões de fuga,
salas com rachaduras de teto, e um final que explique porque uma besta
gigante protege um rei morto.
