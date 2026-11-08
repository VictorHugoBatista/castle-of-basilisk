# CASTLE OF BASILISK

*Proof of concept* de um roguelike **survival horror** com estética ASCII anos 80,
compilado para **WebAssembly**. Sem itens, sem vida, sem curas: **um toque mata e
um olhar mata**. A única defesa é **se esconder**.

Você é um ladrão. O rei morreu há cem anos e o castelo apodrece, mas o guardião
continua rondando: um **basilisco** cego, gigante, paciente. Oito andares
separam você do saque: o **térreo do castelo**, a **Masmorra Assombrada**, os
**Canais Envenenados** —
a rede de esgoto imperial, a sala da frente do lar dela — e, por último, a
**Bocarra Diabólica**: o sistema bizarro de cavernas abaixo dos rios, um pouco
maior que os canais, de passagens completamente irregulares, úmida de 30 m de
leito por cima e repleta de **caveiras `¥` e corpos `¶`** trazidos pela
criatura. É a casa da casa: lá embaixo o medo está **sempre no máximo, com todas
as alucinações**, e ela é ainda mais perigosa. Roube **a coroa do rei morto**
(andar 8, no fundo do acervo, dormindo em **cama de corpo**) e **fuja pelo
portão** do térreo trinta metros acima — e ela continuará de caça até o fim.

Cada andar tem seu habitat e seu temperamento para ela: no térreo (fora do
habitat) quase dorme; nas masmorras é a caça paciente de sempre; nos esgotos é
um deus gargarejando nos canais; na Bocarra é o ofício dela a cada tick. E cada
lugar soa: vento no salão, silêncio
perturbador na masmorra, goteiras nas catacumbas molhadas — e na Bocarra o ping
gordo do fundo, com a respiração do acervo.

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
| WASD ou setas | mover |
| ESPAÇO | esperar (ficar imóvel) |
| SHIFT | passada silenciosa (calar-se) |
| X ou K (as duas, sempre) | correr — o eco denuncia você |
| ENTER | confirmar no menu / começar |

Na tela de título: **W/S ou setas** escolhem entre **INICIAR** e **CONTROLES**,
**ENTER** confirma. A tela de CONTROLES lista os comandos e permite escolher
jogar com **WASD** ou com **as setas** (A/D ou ←/→ alternam) — ambos os
esquemas de mover e as duas teclas de correr funcionam sempre: o modo é só
sua preferência guardada.
ESC volta ao menu.

E, nas CONTROLES, o código de sempre — **↑ ↑ ↓ ↓ ← → ← → B A** — abre a
**ESCOLHA DE ANDAR**: as oito fases num menu com cursor; **ENTER** nasce na
entrada do andar escolhido (as regras valem — descer ao acervo crava o medo
na entrada), **ESC** volta. Nada na tela anuncia o código: descoberta de quem
conhece a casa.

## como jogar (e sobreviver)

- **`B` = a cabeça do basilisco.** Se ele *puder ver você* a até 4–6 tiles (linha de
  visão aberta, raios de pilar/porta bloqueiam), o olhar mata — no esgoto, a 5
  (`GAZE_R + 1`); na Bocarra, o acervo dela, a 6 (`+ 2`).
- **`~` = o corpo dela.** Escamas do rastro que a serpente deixa ao andar — ~24 anéis
  que avançam com a cabeça. Ver o corpo é verlumbre, não morte: **o olhar que mata é
  o da cabeça**. Corpo em tela ganha sombra 3D, halo vermelho e um arrasto grave
  panlado (`14/15/16`); quando ela entra no seu campo de visão, o sinal "solta"
  (glitch de fatias por ~0.25 s) e o drone do castelo engorda.
- Se ele **tocar** você, as escamas matam. Não existe vida.
- `,` = **sombra**. Imóvel dentro dela, você é quase invisível (visão 2 tiles).
  Anda na sombra? 4 tiles. No claro? Ele te vê a 8.
- **`=` = água** (esgoto 4-5 e Bocarra 6-8). Caminhável por você — mas é o meio
  nativo dela: **na água ela apressa o passo**. Sob os pés, o passo respinga.
  Nos **canais imperiais** do esgoto, a água corre de cima a baixo (1–2,
  leito de 1 córrego fino
  a 5 de largura, flanqueado por **margens secas de alvenaria** — dá para
  andar na beira sem molhar o pé — e os lados ondulam), muitas vezes
  interrompidas: **desabamentos em montinho irregular** (bordas escalonadas
  linha a linha, cacos de `%` espalhados para fora) fecham margem e leito de
  uma vez, e cavernas secas cortam o rio (o vão da cisterna é a ponte).
  Na **Bocarra**, a água é a umidade do fundo: poças e línguas de `=` no chão
  da caverna — e são o meio dela nativo: o pé molhado acelera a besta.
- **`÷` = fundura**: a galeira inteira afunda nesse trecho (margem e leito) —
  água demais: não se passa, nem para ela. Vê-se através. Contorna pelo alto,
  pelo fundo ou pela caverna-ponte.
- **`|` = grade de cela** (masmorras): bloqueia passagem, MAS a luz passa —
  de através dela você vê o que vem (e ela vê você; o olhar segue valendo).
  Nas masmorras, portas de cela viram grade: "celas trancadas" para sempre.
- **`¥` = caveira** / **`¶` = corpo**: ossos e corpos que a criatura trouxe.
  Celas abertas da masmorra guardam os primeiros; a **Bocarra é o acervo
  INTEIRO** — e o chão conta a descida: nos andares 6-7 o osso ronda o chão
  a um-ro-quatro; no andar 8 a densidade CRESCE rumo à coroa até o monte —
  **a pista não contada** (a cama de corpos ao redor de `§` é a resposta).
  Caminháveis, decorados — e com voz: **cada passo sobre caveira `crack`**
  (o osso cede e rola) e **cada passo sobre corpo é um `mush` molhado e
  nojento** (a carne cede, o grude estopa). CORRER nesse chão é entrega:
  o craque e o mush gritam mais que a bota — coordenada exata para ela.
- Masmorra funda (andar 3): **poças rasas `=`** — mesmo glifo da água, MAS
  rasas: raso não é habitat, e a maré não acelera ela lá.
- Ele **ouve**: passos no claro (raio 5), na sombra (raio 3), portas abertas
  (raio 12 — cuidado ao se esconder atrás delas). Ouvidos por andar: no térreo
  ela demora a acordar; nos esgotos desperta na hora.
- **`§` = a coroa**: brilha FORTE (duas ondas de brilho que tocam perto do
  branco + halo ambar ao redor) — no monte de osso do acervo ela não se
  perde: o `¶` é estático e baixo, a coroa guarda a luz. A
  **coroa-fantasma** das alucinações desenha com o MESMO brilho (mesmo
  attr): a mentira segue o padrão — indistinguível do real, como sempre.
- **`¤` = o fragmento sombrio**: um pedaço bruto de metal antigo, quebrado
  pelo tempo, com uma marca que devia ter desaparecido — e não desaparece.
  **Brilha como a coroa** (o mesmo pulso de luz, o mesmo halo: a matéria é
  a mesma). **Um único fragmento vive no castelo inteiro por run**: ele
  brota UMA vez em algum andar da escada — raro no térreo (1/4), menos
  raro na masmorra (2/5 · 1/2) e, se nada brotou antes, o primeiro canal
  (andar 4) brota o dele SEM FALTA. Toda run sai do portão com o seu um
  em algum lugar de 1-4 — e só um: quem desce sem vê-lo não o encontra
  **repetido** nos andares de baixo; o andar que o brotou o re-draw do
  mesmo lugar a cada retorno (a run é determinística pelo seed). Pisa
  nele para pegar; quem o carrega sente o **próprio coração pulsar com a
  distância DELE até ela** — quanto
  mais forte e rápido o pulso, mais perto ela está (colo: ~0.6 s por
  pulso; e o batimento é **contínuo** — longe, nunca passa de ~1.7 s:
  é um coração descansado que nunca para, o cadenciador do castelo).
  Sem material nenhum, o
  peito fica calado: o pulso não é radar, é uma consequência de carregar
  a matéria errada — **e a coroa, quando sai da água, liga o mesmo
  pulso**.
- Ao pegar a **coroa** (`§` no acervo, andar 8, em cama de corpo), ele **grita**
  (15 ticks de
  atordoamento — sua chance de arrancar) e entra em caça eterna pelo cheiro.
  Anda em sombra = farol. **Fica imóvel em sombra = você volta a ser só um
  cheiro fraco** — ela procura sua última posição, não a sua.
- Ouça o **sibilo** do basilisco: intervalo curto = ela está perto; pan = da
  direita/esquerda. Mas ele **só existe de perto** (raio 6 — longe dela é silêncio
  absoluto, sem radar) e às vezes ela **cala no meio da patrulha**: 1 sopro em ~3
  não sai — o silêncio dela também te avisa. Na caça com coroa, ela nunca cala.
- Ouça o **lugar**: vento lento no térreo; na masmorra quase nada (e qualquer
  som soa abafado); goteiras com eco no esgoto — que param de pingar quando
  ela está de caça perto; na Bocarra, o **ar de teto alto**: vento grave
  constante dentro de um eco de caverna que não acha parede nenhuma, a
  respiração do acervo a cada 8-20 s (que também prende quando ela caça) e
  uma **dissonância miúda e constante** (dois pares de senoides desafinadas,
  o batimento é o desconforto — perceptível, jamais forte). Por cima de
  tudo, **o vento grande**: rajadas irregulares no nível do vento do térreo,
  e cada onda devolve eco de 0.38 s — é o tamanho da caverna falando (o
  rumble e a dissonância continuam audíveis por baixo; ELA caçando, a
  rajada não sai). A paleta da tela
  veste a cor do andar (âmbar de
  castelo / âmbar seco / verde-lodo / pedra-úmida de caverna).

## o medo (o terror que não mata)

Ver a besta deixa marca — e o medo, aqui, **nunca mata**: ele te atrapalha,
desarma e tira tua graça. A morte é trabalho dela (olhar, toque). O medo vive
de você: **sobe rápido com a exposição** (vê-la de perto sobe muito; ela TE VIU
dispara um pico) e **desce devagar longe dela** — quanto mais alto o nível,
mais lenta a queda. As regras que seguram tudo:

- **o trauma fica**: METADE do pico de medo da run **não decai** — uma caçada
  que te levou a 60 te deixa assombrado (30) até o fim, mas sobreviver a ela
  não é sentença: cicatriz, não condenação;
- **o lugar respira**: mesmo sem vê-la, o medo rasteja sozinho até um teto por
  andar — no esgoto, o habitat dela, o teto é 30: você não fica são por muito
  tempo por lá. E a Bocarra CRACA: pisar no acervo (6-8) marca o medidor
  direto em 100 (**colapso** — teatro, não morte) e o medidor não decai mais
  lá embaixo; o pico de 100 vira cicatriz (50 — metade do pico) que acompanha
  a volta toda;
- **o topo só sobe pelo que você VÊ**: perto de 100 cada susto rende menos
  (72+: metade, 86+: um quarto) e os sustos miúdos não empurram nada — o
  sopro atrás da parede e as escamas do rastro alimentam o pavor, os gritos
  e o mundo tremendo, mas só VÊ-LA move o medidor no fim. O medo fica alto
  porque você ousa olhar, não porque ela anda por perto.

| nível | medo | o que acontece |
|---|---|---|
| 0 calmo | 0–29 | nada na tela — mas o sussurro raro chega ("fui eu?") e o corpo às vezes PARECE ter passado por cima de você: não há ninguém |
| 1 assombrado | 30–54 | sussurros; fantasmas `o` (**1 em 4 nasce à luz**: vislumbre no seu campo); **corpo falso** (passos que não existem); falso `B` rarefeito |
| 2 paranoico | 55–74 | tudo de cima **frequentemente**; coroa-fantasma entra; soluço involuntário |
| 3 pânico | 75–99 | visão encolhe (raio 6); o sibilo de perto dispara; glitch sem corpo |
| 4 colapso | 100 | **o teatro do pavor inteiro de uma vez** — FOV raio 6, soluço sem parar, o mundo treme forte e a vinheta fecha; e você continua ALI: **o medo nunca mata** |

As **alucinações** só existem no render — a lógica do jogo jamais as vê:

- **`o` fantasma** (pálido, pulsante): atravessa paredes (a real jamais
  atravessa nada) e **deriva na sua direção** — mas evapora quando chega a
  2 tiles: a aproximação nunca te alcança. Fora da visão, escurece como todo
  tile lembrado.
- **Falso `B`**: attr 7 IDÊNTICO ao real. Mentiras dele: o sibilo não responde,
  jamais gera glitch de escamas, jamais abre porta. Só nasce com a real a mais
  de 12 tiles (nunca funciona como radar).
- **Coroa-fantasma `§`**: attr 5 do real, estática, a 8–14 tiles num corredor
  **que você já viu** — longe o bastante para você ACEITAR IR. Correr até ela
  custa fôlego e ruído r=15: a ilusão te entrega a ela. Evapora a 2 tiles,
  antes de qualquer certeza.

Correr atrás de coroa falsa → ruído alto → ela te encontra → medo sobe: a
espiral fecha sozinha. No HUD, a placa do canto (`ruído / fôlego / medo`) tem
a barra de medo tremendo em nível alto.
A partir do **paranoico**, o próprio mundo treme (duas ondas desafinadas —
nada uniforme, é o corpo respirando errado) e uma **vinheta vermelha** fecha
nos pulsos do pânico — fora do grid, na pele: informação nenhuma, só espanto.

## arquitetura

```
src/lib.rs + src/*.rs       o jogo em módulos por domínio, Rust puro, sem crates (ABI WASM crua)
web/index.html             canvas + filtro CRT em CSS puro (scanlines, vinheta, flicker)
web/game.js                glue: rAF + tick de 140ms, render do bitmap de diff que o WASM produz, WebAudio
web/wasm/*.wasm            binário (~27 KB)
build.sh                   cargo build --release + copy para web/wasm
scripts/smoke.mjs          gate de testes headless (roda o jogo no Node)
scripts/debug6.mjs         bancada do bot playthrough
```

## os cinco andares

| # | lugar | mapa | temperamento dela |
|---|---|---|---|
| 1 | Ruínas do castelo (térreo) | 56×32 | quase adormecida (fora do habitat) |
| 2 | Masmorra Assombrada | 64×36 | a caça paciente de sempre |
| 3 | Masmorra Assombrada | 64×36 | caça paciente + rastro forte |
| 4 | Canais Envenenados | 80×44 | casa dela: veloz, olho a 5, ouvido fino |
| 5 | Canais Envenenados | 80×44 | idem, mesmo destino |
| 6 | Bocarra Diabólica | 88×48 | **acervo**: lenta de nunca dormir, olho a 6, **medo cravado no máximo** |
| 7 | Bocarra Diabólica | 88×48 | idem — os corpos rondam mais o chão |
| 8 | Bocarra Diabólica (coroa) | 88×48 | idem — os corpos se empilham rumo à coroa; a cama (`§`) é o monte |

### WASM ABI

Nada de wasm-bindgen: o módulo expõe funções `#[no_mangle] extern "C"`:

- `pfb_init()` — desenha a tela de título
- `pfb_new_game(seed)` — novo jogo
- `pfb_step(input)` — um tick (bits: 1↑ 2↓ 4← 8→ 16 espera 32 furtivo 64 correr)
- `pfb_menu(input)` — teclado das telas de menu (bits: 1↑ 2↓ 4← 8→
  16 confirmar/ENTER·ESPAÇO 64 voltar/ESC **32 B 512 A** — as letras do
  KONAMI). O rastreio do código **↑↑↓↓←→←→B A** vive na RT, NA tela de
  CONTROLES: os passos certos são consumidos (as setas do código não
  alternam o esquema de teclas) e o final abre a **ESCOLHA DE ANDAR**; o
  **A solto** fora do código segue alternando o esquema (WASD), como
  sempre. "Iniciar" publica `STATS[13]=1`
  e o JS semeia `pfb_new_game`
- `pfb_grid_ptr()` / `pfb_stats_ptr()` — ponteiros para o grid (2 bytes por
  célula: `[char][attr]`) e para o bloco de status
- `pfb_max_n()` — tamanho máximo do grid (88×48, Bocarra): o JS dimensiona as views
- `pfb_ui_ptr()` — barra de UI fabricada (dica contextual / nome do andar)
- `pfb_pop_event()` — fila de eventos de áudio
- `pfb_diff_ptr()` / `pfb_diff_ack()` — diff de render produzido no WASM:
  `[0]` flags (bit0 = repinte integral), `[1]` camX, `[2]` camY,
  `[3..227]` bitmap de células de TELA mudadas; o JS pinta o marcado e
  confirma com o ack
- `pfb_state()` — 0 título, 1 jogando, 2 morto, 3 vitória, 4 controles,
  5 escolha de andar (o konami)
- `pfb_debug_*` — ferramentas dos testes (place/bas_place/map/**dmap**/probe/body_ptr/
  ai/give_crown/**give_shard**/**shard_reset**/fear/fear_ptr/floor)

O WASM nunca aloca: as views JS são criadas uma vez e ficam válidas.

### eventos de áudio (síntese WebAudio, zero samples)

`1` passo · `2` porta · `3/4` escadas · `5` stinger (ELE TE VIU) · `6` coroa ·
`7` morte · `8` vitória · `10` alerta (ele ouviu algo) · `11` alívio (perdeu
seu rastro) · `12` sibilo distante · `13` A BESTA abriu uma porta ·
`14/15/16` escamas do corpo visíveis (centro/esquerda/direita) ·
`18` sussurro da mente (nasceu alucinação) · `19` soluço involuntário do medo ·
`20` alucinação evaporou de perto · `21` a coroa mentiu (falsa § evaporou) ·
`22` sibilo de perto (a DECISÃO de falar nasce no WASM: raio 6, períodos por
coroa/medo e o silêncio proposital de ~1 em 3; volume/pan/brilho pela
proximidade ficam no JS) · `23` o achado (o açoite frio de pegar o `¤`) ·
`24` o pulso do seu coração (DECISÃO no WASM, `heart_tick`: intervalo pela
distância chebyshev até ela — 0.6 s colado e nunca mais devagar que
~1.7 s além da visão (o pulso é contínuo) — só
com o fragmento OU a coroa carregados; o lub-dub, volume e pan são do JS) —
mais o drone ambiente do castelo (engorda enquanto o corpo dela está visível).

## smoke test (headless)

```
node scripts/smoke.mjs
```

Valida: morte por olhar (com CONE de visão dela), morte por toque, IA investigando
ruído, **o KONAMI abrindo a ESCOLHA DE ANDAR (o cursor, o salto, o cravo do
medo ao pousar no 8 e o ESC de volta)**, **o rastro de escamas existindo** (via `pfb_debug_body_ptr`) e **o corpo
ficando visível em tela em algum momento**, **o MEDO subindo com exposição e
caindo LONGE dela, a CICATRIZ do pico (nunca cai de metade), o PAVOR AMBIENTE
rastejando sozinho, o FREIO DO LIMIAR (perto do 100 a subida cansa e susto
miúdo não empurra o topo), alucinações nascendo no pânico (fantasma + falso
`B`), a COROA-FANTASMA nascendo longe e evaporando ao chegar perto,
o **medo NUNCA MATA: 100 sustenta o caos, sem morte (e decai)** — e na descida
para a BOCARRA o medidor CRACA em 100 (colapso permanente enquanto o acervo
te sustenta)**, pico marcado como cicatriz para o resto da run**,
**um playthrough completo por bot BFS**
(desce os 8 andares na ordem, pega a coroa no acervo da Bocarra, escapa pelo
portão —
rotas que evitam a zona de gaze, esquiva geométrica, caminha na água e nos
corpos), **a ESCADA LONGE — a descida `>`/`§` nunca nasce colada na escada
de entrada** (distância de rota desde o `<` respeita o limiar por tema em
varredura de seeds e andares), **a BOCARRA DECORADA — corpos `¶`, caveiras `¥` e água úmida `=`
presentes
em massa nos andares 6-8**, **A PISTA NÃO CONTADA — a densidade do acervo
provada a crescer rumo à coroa (d<=10 vs d>=25, 1.8x), `pfb_debug_floor` de
frente**, **a MORTE NO ESGOTO
— tela de morte compõe 56x32, não o stride 80 do esgoto**,
**o FRAGMENTO SOMBRIO — nascimento por andar na varredura de 24 seeds x 8
andares (raro no térreo ~1/4, coberto e ÚNICO no 4, nunca dos 5 para baixo,
todo `¤` em piso pisável)** e **o PULSO — cadência pela distância (mediana
do intervalo entre batidas: colada ~7-8 ticks, longe 12-13 — contínuo),
o pulso nasce na
mão ao pegar, o peito CALADO sem material nenhum e a coroa sozinha liga o
mesmo pulso**
e fuzz de 6000 ticks sem estados impossíveis.

## status do conceito

Escopo *proof of concept*: 8 andares temáticos e procedurais — térreo do
palácio: grandes salões com colunata interna cercados por corredores e
cômodos pendurados nas paredes deles (portas nos gargalos), masmorras de
celas com grades (a luz atravessa, o corpo não), caveiras nas celas abertas
e poças rasas no andar fundo, esgoto imperial 80×44 com **canais imperiais
verticais** (1–2 rios `=` de cima a baixo, largura e posição à sorte,
interrompidos por desabamentos de pedra, funduras `÷` atravessáveis por
ninguém e cavernas-bacia que cortam o rio a seco) — e a **BOCARRA DIABÓLICA**
88×48, o acervo dela: câmaras nascidas de blob, túneis tortos de random-walk,
umidade em poças de `=`, caveiras `¥` e corpos `¶` em pilha, a coroa no andar 8
em cama de corpo e o medo cravado no teto lá embaixo. O **fragmento sombrio**
(`¤`, o mesmo material) reparte-se nas ruínas e na masmorra — e um sempre
existe no primeiro nível dos canais — quem o carrega (ou carrega a coroa)
sente o coração pulsar com a distância da besta. IA em 3 estados
(patrulha/invest/caça) com BFS real e temperamento por tema, FOV por raycast,
um toque mata / Um olhar mata. Cada tema tem o próprio caráter de geração.
Para o jogo grande: itens de "ruído falso", basilisco aprendendo padrões de
fuga, salas com rachaduras de teto, e um final que explique porque uma besta
gigante protege um rei morto.
