# INSPIRACOES.md — de onde vem a arte do jogo

> Referência das inspirações por trás da arte: o que o jogo pega de onde, e
> onde cada coisa vive no código. O jogo vence — se a arte implementada
> contradizer este documento, a arte vence e o documento muda no MESMO
> commit (mesma regra do ARCHITECTURE para ABI e do LORE para canon).
> Inspiração nova entra aqui no MESMO commit que a arte que ela originou.

---

## 1. o som — a OST

### a música do título (toca no título, nas controles e na escolha de andar)

- **Referência primária declarada**: Cimerion — *Contresort* (2023),
  old-school dungeon synth com motor de **Berlin-School**:
  <https://www.youtube.com/watch?v=4v43-oQseZE>
- **O vocabulário do gênero** (o estudo por trás do arranjo): do lado
  dungeon synth, a tradição dark ambient medieval — drones de longa forma,
  melodias esparsas com muito eco, fita lo-fi; do lado **Berlin-School**, a
  escola do sequencer (Tangerine Dream / Klaus Schulze): um ostinato
  pulsando embaixo de pads que evoluem devagar, e o loop que nunca é igual
  duas vezes por causa do filtro.
- **A peça**: Ré menor, 66 bpm, cinco camadas — tudo em
  `web/game.js`, tema 4 do `setAmbience`:
  1. **o drone das muralhas** — D2+A2+D3, saws desafinadas sob lowpass que
     deriva na frequência (respira no filtro, nunca no volume);
  2. **o pulso de Berlim** — ostinato de colcheias por dentro do Dm, saw com
     lowpass que "plucka" (corte sorteado por nota, tempo humanizado ±12 ms);
  3. **a flauta da torre** — 3 frases esparsas com vibrato miúdo e eco
     comprido; às vezes a torre cala, e nunca repete frase;
  4. **os sinos do salão + o tambor fundo** — parciais inarmônicas raras e
     um golpe grave (62→36 Hz);
  5. **a fita** — chiado baixo, o lo-fi que cola tudo.
- A fileira de dentes da logo é a "grade" da música: a boca ocupa o topo da
  tela e o menu respira no vão de baixo — a criatura canta e respira.

### a música da abertura (toca na cutscene da porta, antes do título)

- **Referência primária declarada**: Cimerion & Oublieth — *Arcanes* (2022,
  Out of Season), o MESMO Cimerion de *Contresort*: um único tecido sonoro
  de dark ambient analógico dedicado a Klaus Schulze e Vangelis, onde as
  peças dos dois projetos alternam sem costura:
  <https://www.youtube.com/watch?v=GooffnSe5D4>
- **A tese**: a abertura é o nascer do dia ANTES do castelo acordar — nada
  pulsa aqui. O ostinato de Berlim é o pulso do castelo VIVO (título); a
  abertura troca o sequencer por pads de longa forma (Schulze) e um coro
  lento de synth (Vangelis). Ré menor igual ao título: quem ouviu os dois
  reconhece o fio — a flauta "ensaia" a primeira frase da trilha do título,
  cochichada, e o maestro faz a passagem no fade.
- **A peça**: Ré menor, sete camadas, tudo em `web/music/track-abertura.js`
  (contrato de trilha `start(ctx, buses, alive)`; registro no `TRACKS` do
  maestro; o glue chama `setMusic('abertura')` no gesto que acorda o som
  dentro da cutscene):
  1. **o grão da pedra** — D1+A1+D2, saws desafinadas sob sine sub, lowpass
     240 Hz derivando (~1 volta/min) — o castelo antes de respirar;
  2. **a caminhada do ladrão** — linha de arco lenta (contrabaixo de synth
     em notas inteiras legato, a cauda de uma nota embala a próxima) que
     anda pela descida andalusa do Ré menor: o chão que preenche os vãos
     entre os acordes, e a mão do texto — o aspirante entrando;
  3. **a corrente do cano** — ruído em bandpass fino derivando + redemoinhos
     (aberturas curtas do filtro, scheduler irregular): o rio parado no breu
     do túnel, não a goteira do esgoto in-game;
  4. **o coro do breu (Vangelis)** — acordes de Dm/Bb/Gm/Am que incham em
     4-6 s e se dissolvem em 5-8 s, um a cada ~11-20 s: o breu responde,
     não cala;
  5. **a flauta que ensaia** — as frases da torre do título em ensaio
     cochichado, visitas encadeadas de 1-2 frases a cada 6-18 s, eco de
     pátio vazio (delay 0.58 s);
  6. **o olho** — F#1/G#1 batendo ~1.9/s inchando e morrendo + golpe fundo
     (52→28 Hz): o par de olhos do fundo do túnel respirando;
  7. **a fita** — o mesmo chiado baixo do título: a mesma fita, o mesmo
     castelo.
- **O fim composto**: a abertura não é loop eterno cortado no fade.
  Faltando ~6.5 s da última cena, o glue avisa o maestro (`musicCoda()`)
  e a trilha executa a CODA ESCRITA: os schedulers soltos se calam, a
  cadência andalusa C2→Bb1→A1→D2 acha a tônica, o coro abre em Dm inteiro,
  a flauta resolve em D5 e o drone exhala (lowpass 240→560 Hz) — tudo se
  dissolvendo ANTES do fade pro título, cujo drone nasce no MESMO D2: a
  tônica passa de mão em mão sem costura. Quem pula (esc/enter na última
  página) não tem coda: quem pula abre mão do amanhecer.

### a música do térreo (toca no castelo, o primeiro andar do jogo)

- **Referência primária declarada**: Trollslottet — *Sorgeberget* (2024,
  Cryo Crypt), faixa **"Nordanvinden"** — dungeon synth / dark ambient
  nórdico de Pär Boström (o mesmo de Kammarheit, Aindulmedir e Cities Last
  Broadcast), <https://www.youtube.com/watch?v=wEdRb27q-Dw&t=196s> (a faixa
  começa nesse ponto). O castelo fora do habitat dela pede exatamente esse
  clima: frio de seversk, minimalismo de teclado, épico contido — o
  descrito pelos ouvintes do álbum como "castelos abandonados, vento
  congelante e uma sombra escura seguindo você".
- **A tese**: o térreo é o lugar do VENTO, então a trilha é o vento
  cantando — SEM PULSO nenhum (o pulso de Berlim é do castelo VIVO, o
  título; aqui nada pulsa, nada dança). Ré menor como o título e a
  abertura: o drone nasce no MESMO D2 e a tônica passa de mão em mão no
  fade da entrada no jogo. E a peça mora DEBAIXO do vento: camadas ~15%
  abaixo do equivalente do título, e nenhuma voz sustentada na faixa do
  assobio da fresta (1,5-2 kHz) — o assobio não divide octava com ela, o
  vento segue dono.
- **A peça**: Ré menor, quatro camadas, tudo em
  `web/music/track-terreo.js` (contrato de trilha `start(ctx, buses,
  alive)`; registro no `TRACKS` do maestro; o glue chama `setMusic('terreo')`
  quando o tema é o castelo):
  1. **o fôlego do portão** — D2+A2+D1, saws desafinadas sob sine sub,
     lowpass 260 Hz derivando (~1 volta/5 min) — a pedra respirando frio;
  2. **o coro do frio** — acordes de longa forma girando pelo lado escuro
     do Dm (Dm C Bb Am Gm), dois coros desafinados por nota, inchaço de
     4,5-7,5 s e dissolução de 6-10 s, um a cada ~17-29 s;
  3. **o canto da fresta** — a MELANCOLIA: frases DESCENDENTES em Dm (a
     tristeza nórdica cai) de flauta de synth com vibrato miúdo e eco
     comprido; às vezes a fresta cala, e nunca repete frase;
  4. **o corno do norte** — a chamada distante (o lur que atravessa o
     frio): duas saws desafinadas sob lowpass, sopro de 1,4 s, a quinta
     que cai e morre na tônica; raríssima, uma a cada ~40-85 s — o épico
     da peça, nunca o dono dela.

### a música da masmorra (toca na Masmorra Assombrada, andares 2-3)

- **Referência primária declarada**: Trollslottet — *Kryptan* (2025,
  Cryo Crypt), faixa **"Som Vore Det Evigt"** — o MESMO Pär Boström da
  trilha do térreo, o álbum seguinte:
  <https://youtu.be/qJraAOi-bD8?t=2440> (a faixa começa nesse ponto). A
  profecia do Kryptan é a tese da peça: *"Deep and silent, the heart
  shall beat"* — a descida à cripta, o fundo e calado, o coração que
  bate: exatamente o que a masmorra pede.
- **A tese**: a masmorra foi a PRISÃO POLÍTICA da era que caiu — o LORE
  já guarda isso: as celas trancadas para sempre têm "os que o tribunal
  recolheu por 'semear o medo'", os que morreram **calados por dentro**,
  os que tinham razão e não ficaram nem com ossos à vista. A música é o
  que eles não puderam dizer: o lugar é ASSOMBRADO e a peça expressa —
  os sussurros voltam em células diferentes e o coro dos mortos canta
  desafinado. O SILÊNCIO PERTURBADOR continua dono do bus (SFX abafados,
  estalo de pedra do glue) — a trilha é perceptível, mas mora DEBAIXO do
  silêncio: atmosfera vazia, lugar morto, nada dança. Ré menor — a
  tônica desce de andar em andar (título → térreo → masmorra, sempre no
  D), uma oitava de fôlego mais fundo a cada descida.
- **A peça**: Ré menor, seis camadas, tudo em
  `web/music/track-masmorra.js` (contrato de trilha `start(ctx, buses,
  alive)`; registro no `TRACKS` do maestro; o glue chama
  `setMusic('masmorra')` quando o tema é a masmorra):
  1. **a pedra funda** — D1+A1+D2 (o "grão da pedra" da abertura, uma
     oitava de fôlego mais fundo que o portão do térreo), saws
     desafinadas sob lowpass 230 Hz derivando — a pedra não canta,
     rumina;
  2. **o coração fundo** — lub-dub longínquo de sine descendo (52→28 Hz),
     o segundo sopro mais fraco, um coração a cada ~8-16 s: o metrônomo
     irregular do terror (a promessa da profecia, batendo);
  3. **os sussurros** — os calados por dentro falando de novo: noise
     branco em bandpass estreito de "boca" (o filtro desliza como
     língua), sussurros de 0.15-0.45 s em PAN aleatório (a voz volta de
     uma cela diferente a cada vez), em grupos de 1-3, um grupo a cada
     ~6-18 s — sem oscilador tonal: sussurro que afina é voz, sussurro
     de filtro é conversa de pedra;
  4. **o coro de baixo** — acordes de longa forma pelo lado mais escuro
     do Dm (Dm Bb Gm Am — SEM C maior nenhuma: aqui não há clareza), uma
     oitava abaixo do coro do frio do térreo, um a cada ~25-42 s;
  5. **o coro dos mortos** — a assombração em nota: dois coros a SEGUNDA
     MENOR de distância (F3/E3, D3/C#3, Bb2/A2) inchando juntos e se
     dissolvendo, uma vez a cada ~40-80 s — quem não tem mais corpo
     afina errado: o batimento áspero da segunda menor é o coro
     desafinado dos sem ossos;
  6. **o lamento da cripta** — frases curtíssimas de duas/três notas
     descendentes no registro grave (a tristeza aqui não cai de cima
     como na fresta do térreo: afunda); cala bastante, mas vem.

### o ambiente por andar (não é música: é o lugar soando — `setAmbience`)

- **Térreo**: o VENTO — corpo grave de ruído + assobio de fresta, puxado por
  rajadas irregulares (subida/descida/espaçamento sorteados: nunca o mesmo
  intervalo duas vezes) — e, por baixo dele, a TRILHA do térreo (seção
  acima, `track-terreo.js`): o vento manda, a música acompanha.
- **Masmorra**: o SILÊNCIO PERTURBADOR — quase nada; um estalo de pedra a
  cada 16-40 s para o ouvido ficar tenso; SFX abafados no bus — e, por
  baixo do silêncio, a TRILHA da cripta (seção acima,
  `track-masmorra.js`): o lugar assombrado da prisão política — o
  coração fundo batendo e os sussurros dos calados por dentro voltando.
- **Canais (esgoto)**: GOTEIRAS — ping agudo com eco de cisterna, gota dupla
  ocasional; o ping **para quando ela está de caça perto** (o silêncio avisa).
- **Bocarra Diabólica**: a morada do TETO ALTO — ping gordo com eco de lago,
  vento fundo com deriva de afinação, dissonância de pares desafinados e a
  RESPIRAÇÃO do acervo (rumor que sobe e desce a cada 8-20 s). Tudo prende
  quando ela caça perto: a caverna guarda o ar.
- Por baixo de tudo, o **hum do castelo**: 55/58,3 Hz batendo devagar.

### as regras de síntese (como AGENTS.md manda)

- **Zero samples**: todo som nasce de oscilador/noise buffer + filtro +
  envelope — nenhum arquivo de áudio no projeto.
- **AudioContext só no primeiro gesto** do usuário (exigência dos
  navegadores); o castelo acorda no primeiro clique/tecla, com retry curto
  do `resume()` (o Chrome às vezes ignora o resume do mesmo task da
  criação).
- **Camadas por scheduler irregular, nunca LFO de amplitude periódico** —
  LFO periódico em ambiente soa como ondas do mar chegando no horário.

## 2. o visual

- **Terminal CRT âmbar** (família `#ffb000` sobre `#050200`): scanlines,
  vinheta e flicker em CSS puro; o CRT **veste a cor do andar** (âmbar rico
  no castelo, âmbar seco na masmorra, verde-lodo nos canais, pedra úmida na
  Bocarra).
- **ASCII de roguelike anos 80**: grid de células; os glifos SÃO as coisas
  (`@` você, `B` a besta, `§` a coroa, `¥` caveira, `¶` corpo, `<`/`>`
  escadas) — a imaginação preenche o que 15 px de monospace não mostram.
- **A serpente fora do monocromo**: o mundo é âmbar e ELA é vermelha
  (`#ff2e00`) — a única coisa colorida do jogo é a que mata. Sombra
  deslocada ("saltando do CRT"), halo e onda de brilho a partir da cabeça.
- **Glitch analógico raro** (vislumbres dela): ~0,25 s de fatias
  horizontais deslocadas + ghost cromático — o sinal "solta"; ao terminar,
  a tela se remonta inteira.
- **A boca do título** (a logo É a criatura): as letras de CASTLE OF e
  BASILISK são os dentes dela (fonte própria 5×6 — a fileira de cima pende
  da gengiva, a de baixo ergue do chão; T e F nascem presas), os dois olhos
  vermelhos piscam nos vãos da fileira de cima (A|S e espaço|O) e o veneno
  pinga na goela.

## 3. o mito

- O **basilisco do folclore europeu**: o rei das serpentes, cujo olhar
  mata. A versão da casa inverte a bula medieval para abrir o jogo: quem
  entra é que carrega o olhar contra si, e ela te acha pelo OUVIDO — então
  **esconda-se e nunca olhe para ela** (um toque mata, um olhar mata).
- O canon completo (cronologia, o Massacre Silencioso, a Descida como
  superstição, as lacunas deliberadas) mora em
  [`worldbuilding/LORE.md`](worldbuilding/LORE.md) — este documento não
  fecha lacuna nenhuma do LORE.
