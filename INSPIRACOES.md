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

### o ambiente por andar (não é música: é o lugar soando — `setAmbience`)

- **Térreo**: o VENTO — corpo grave de ruído + assobio de fresta, puxado por
  rajadas irregulares (subida/descida/espaçamento sorteados: nunca o mesmo
  intervalo duas vezes).
- **Masmorra**: o SILÊNCIO PERTURBADOR — quase nada; um estalo de pedra a
  cada 16-40 s para o ouvido ficar tenso; SFX abafados no bus.
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
