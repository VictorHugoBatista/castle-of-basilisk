// music/track-bocarra.js — A MÚSICA DA BOCARRA DIABÓLICA (o acervo, os
// três andares do fundo): dark ambient DRAMÁTICO com build up. Referência:
// Vikorra Doom — "From the Realm of Dust and Darkness" (Cryo Crypt):
// <https://youtu.be/wEsuJoBKAvA?t=2016> (a faixa começa nesse ponto) —
// Bruce Moallem, o segundo nome do catálogo Cryo Crypt: drones de fundura,
// massas que crescem devagar, o pavor grandioso.
// A tese: os três andares da Bocarra são UM lugar só e ENORME — e o tema 3
// não muda entre eles, então a trilha NÃO recomeça ao descer de nível: a
// peça cresce em MOVIMENTOS (nivel 0..3, um degrau a cada ~55-90 s) e o
// build up atravessa os andares — quem desce chega no pico.
// ANTI-MASSA-DE-RUÍDOS: o glue já tem o ar da caverna (vento grave,
// respiração do acervo, dissonância de pares desafinados, ping gordo) —
// a trilha NÃO adiciona textura de ruído nenhuma: só camadas TONAIS
// graves no mesmo Dm (a tônica desce de andar em andar e aqui ela chega
// ao fundo) + a MARCHA de tambores (padrão de guerra em grade de 0.62 s,
// sine + saturação + estalo de couro: o estalo é o TRANSIENTE do golpe
// dele mesmo, não textura solta) + o CANTO FÚNEBRE (a melodia da
// referência: frases de 4 notas descendentes). Tudo em poucas
// vozes, tudo num eco
// próprio (a caverna é grande DE VERDADE: delay 0.55 s, feedback 0.42,
// wet 0.45 — mais do que o esgoto, menos do que o infinito).
// Quando ELA caça perto (o glue entrega o estado no buses.probe), a
// dramaturgia RECOLHE: nenhum swell novo, nenhum tambor — só o fundo do
// mundo continua, o mesmo silêncio que prende o ar do acervo prende a
// peça. O build espera e recomeça quando ela se afasta.
// Contrato de trilha: start(ctx, buses, alive) → { nodes, timers }.
export const trackBocarra = {
  id: 'bocarra',
  start(ctx, buses, alive) {
    const AC = ctx;            // o corpo da receita é o glue nome por nome
    const ambGain = buses.amb; // bus da ambiência (o mesmo de sempre)
    const ambNodes = [];       // nós vivos DESTA execução: o fade do maestro mata todos

    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // relógio congelado (contexto ainda suspenso): re-agenda curto SEM tocar
    // no relógio — senão duas frases/tambores nascem no MESMO instante
    // quando o contexto finalmente abre
    const aguardaRodando = (rearm) => {
      if (AC.state === 'running') return false;
      setTimeout(rearm, 300);
      return true;
    };
    // o ouvido no estado do jogo: o glue entrega o probe nos buses
    // (initMusic) — ELA caçando perto, a caverna prende o ar e a peça
    // recolhe a dramaturgia
    const cacandoPerto = () => !!(buses.probe && buses.probe().hunted);

    // o eco do fundo: A CAVERNA GRANDE — delay 0.55 s (o esgoto tem 0.38:
    // aqui o som não acha parede perto), feedback 0.42, wet 0.45. Recebe a
    // massa da lenda (parcela) e a voz do acervo (cheia)
    const eco = AC.createDelay(2);
    eco.delayTime.value = 0.55;
    const ecoFb = AC.createGain();
    ecoFb.gain.value = 0.42;
    const ecoWet = AC.createGain();
    ecoWet.gain.value = 0.45;
    eco.connect(ecoFb);
    ecoFb.connect(eco);
    eco.connect(ecoWet);
    ecoWet.connect(ambGain);
    ambNodes.push(eco, ecoFb, ecoWet);

    // o fundo do mundo: D2 + A2 + D3 (com o sub D1 embaixo para o peso) —
    // a tônica chegando ao chão do jogo. O REGISTRO é a lição da revisão:
    // fundura que não se ouve é silêncio — o corpo audível mora no meio
    // (D2/D3), o D1 só sustenta o peso. Lowpass grave que o build VAI
    // ABRINDO a degrau por degrau (260 → 380 Hz: a caverna acorda com a
    // peça)
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.045, AC.currentTime, 2.5);
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 260;
    padLp.Q.value = 0.5;
    for (const [f, type, v] of [[73.42, 'sawtooth', 1], [73.9, 'sawtooth', 0.7], [110, 'triangle', 0.5], [146.83, 'sine', 0.35], [36.71, 'sine', 0.5]]) {
      const o = AC.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = AC.createGain();
      og.gain.value = v;
      o.connect(og);
      og.connect(padLp);
      o.start();
      ambNodes.push(o);
    }
    const padDrift = AC.createOscillator();
    padDrift.frequency.value = 0.012;
    const padDriftG = AC.createGain();
    padDriftG.gain.value = 110;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start();
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // a construção (o build up): nivel 0..3, um degrau a cada ~55-90 s
    // enquanto ela não caça. Cada degrau abre o fundo (+40 Hz no lowpass),
    // densifica a massa da lenda e, do 2 em diante, a MARCHA desfila e o
    // canto fúnebre pressagia. No 3, o canto chega inteiro e a peça chega
    // no pico e SEGURA
    // (a Bocarra inteira desperta). ELA caçando perto: o degrau espera
    let nivel = 0;

    // a massa da lenda: acordes de longa forma pelo lado escuro do Dm
    // (Dm Bb Gm Am) — a MESMA paleta da masmorra, agora UMA OITAVA ACIMA:
    // o fundo tem de SER OUVIDO (a revisão a registrou), e o registro do
    // meio é onde a caixa de som de notebook também fala. Do nivel 1 em
    // diante, com ganho crescendo por degrau; no nivel 0, só o presságio
    // (bem de vez em quando, quase inaudível). Parcela da massa manda pro
    // eco: o fundo repete de longe
    const coroG = AC.createGain();
    coroG.gain.value = 0.9;
    coroG.connect(ambGain);
    ambNodes.push(coroG);
    const coroEco = AC.createGain();
    coroEco.gain.value = 0.3;
    coroG.connect(coroEco);
    coroEco.connect(eco);
    ambNodes.push(coroEco);
    const COROS = [
      [50, 53, 57], // Dm: D3 F3 A3
      [46, 50, 53], // Bb: Bb2 D3 F3
      [43, 46, 50], // Gm: G2 Bb2 D3
      [45, 48, 52], // Am: A2 C3 E3
    ];
    let lastCoro = -1;
    // UM swell da massa: a função é reusada pelo tick e pelo surto do build
    const coroSwell = (extra) => {
      let ci = Math.floor(Math.random() * COROS.length);
      if (ci === lastCoro) ci = (ci + 1) % COROS.length;
      lastCoro = ci;
      const t = AC.currentTime + 0.1;
      const sobe = 5 + Math.random() * 3;
      const desce = 6 + Math.random() * 4;
      const dur = sobe + desce;
      for (const m of COROS[ci]) {
        for (const cents of [-3.5, 3.5]) {
          const o = AC.createOscillator();
          o.type = 'triangle';
          o.frequency.value = mf(m);
          o.detune.value = cents;
          const g = AC.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.012 + nivel * 0.003 + extra, t + sobe);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(g);
          g.connect(coroG);
          o.start(t);
          o.stop(t + dur + 0.3);
        }
      }
      return dur;
    };
    const coroTick = () => {
      if (!alive()) return;
      if (aguardaRodando(coroTick)) return;
      if (cacandoPerto()) {
        setTimeout(coroTick, 8000); // ELA caça: a massa cala, o fundo fica
        return;
      }
      if (nivel === 0) {
        // presságio: no primeiro movimento a massa só respira, raro
        if (Math.random() < 0.3) coroSwell(0);
        setTimeout(coroTick, 24000 + Math.random() * 16000);
        return;
      }
      const dur = coroSwell(0);
      setTimeout(coroTick, (dur + 7 - nivel * 1.5 + Math.random() * 10) * 1000);
    };
    setTimeout(coroTick, 3000 + Math.random() * 4000); // o presságio vem cedo

    // o tambor do fundo: o CORAÇÃO GRANDE DO LUGAR — e AGORA DE GUERRA
    // (a referência pede tambores agressivos): golpe de ataque quase
    // instantâneo, queda de pitch rápida, a PELE respondendo (ressonância
    // curta de couro), estalo de transiente e SATURAÇÃO (WaveShaper:
    // a distorção cola o golpe e dá a agressão sem subi-lo de ganho).
    // Quem decide QUANDO ele toca é a MARCHA logo abaixo
    const drumG = AC.createGain();
    drumG.gain.value = 1;
    const curva = new Float32Array(1024);
    for (let i = 0; i < curva.length; i++) {
      const x = (i / (curva.length - 1)) * 2 - 1;
      curva[i] = Math.tanh(2.6 * x); // a saturação: o golpe "estourando" no couro
    }
    const drumFury = AC.createWaveShaper();
    drumFury.curve = curva;
    drumFury.oversample = '2x';
    drumG.connect(drumFury);
    drumFury.connect(ambGain);
    ambNodes.push(drumG, drumFury);
    const drumBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 2), AC.sampleRate);
    const dch = drumBuf.getChannelData(0);
    for (let i = 0; i < dch.length; i++) dch[i] = Math.random() * 2 - 1;
    const drumHit = (t, v, tune = 1) => {
      // o corpo: queda rápida e funda (o punch). tune 1 = o grave do
      // fundo; tune > 1 = o MESMO couro afinado mais alto (o tom que
      // responde na marcha)
      const o = AC.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90 * tune, t);
      o.frequency.exponentialRampToValueAtTime(38 * tune, t + 0.5);
      const o2 = AC.createOscillator();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(175 * tune, t);
      o2.frequency.exponentialRampToValueAtTime(82 * tune, t + 0.3); // a pele respondendo
      const o3 = AC.createOscillator();
      o3.type = 'sine';
      o3.frequency.setValueAtTime(55 * (1 + (tune - 1) * 0.5), t);
      o3.frequency.exponentialRampToValueAtTime(26 * (1 + (tune - 1) * 0.5), t + 0.9); // o sub que carrega o peso
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.005); // ataque de chicote
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      const g2 = AC.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(v * 0.5, t + 0.005);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); // a pele morre rápido
      const g3 = AC.createGain();
      g3.gain.value = 0.55; // o sub acompanha, mais baixo
      o.connect(g);
      o2.connect(g2);
      o3.connect(g3);
      g3.connect(g);
      // o estalo: o chicote no couro (transiente curto, parte do golpe)
      const src = AC.createBufferSource();
      src.buffer = drumBuf;
      src.loop = true;
      const bp = AC.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 1.2;
      const g4 = AC.createGain();
      g4.gain.setValueAtTime(0.0001, t);
      g4.gain.linearRampToValueAtTime(v * 0.3, t + 0.004);
      g4.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(bp);
      bp.connect(g4);
      g4.connect(g);
      g.connect(drumG);
      o.start(t);
      o2.start(t);
      o3.start(t);
      src.start(t);
      o.stop(t + 1.3);
      o2.stop(t + 0.5);
      o3.stop(t + 1);
      src.stop(t + 0.1);
    };
    // A MARCHA DA GUERRA: o padrão de tambores da referência (martial
    // beats, drum patterns — NÃO golpes soltos). Grade de PASSO 0.62 s,
    // bar de 8 passos: o grave manda nos passos 0 e 4, os toms (o MESMO
    // couro afinado mais alto: tune 1.4-1.5) respondem entre eles. No
    // nivel 2 a coluna desfila UM bar e espera (2-3 bares de silêncio: a
    // marcha se aproximando de longe); no 3 ela NÃO PARA — padrão mais
    // denso, a coluna inteira em passos. É o METRÔNOMO do pavor: quanto
    // mais fundo, mais perto. ELA caça perto: a coluna para no seco
    const PASSO = 0.62;
    const MARCHAS = [
      null,
      null,
      [[1, 1], [0, 0], [0.5, 1.4], [0, 0], [0.75, 1], [0, 0], [0.45, 1.45], [0, 0]], // a coluna de longe
      [[1, 1], [0, 0], [0.55, 1.4], [0.3, 1.5], [0.85, 1], [0, 0], [0.55, 1.4], [0.4, 1.5]], // a coluna inteira
    ];
    const marchaTick = () => {
      if (!alive()) return;
      if (aguardaRodando(marchaTick)) return;
      if (cacandoPerto() || nivel < 2) {
        setTimeout(marchaTick, 8000); // a marcha espera o degrau (e espera ELA se afastar)
        return;
      }
      const bar = MARCHAS[nivel];
      const base = nivel >= 3 ? 0.05 : 0.04;
      const t0 = AC.currentTime + 0.1;
      for (let i = 0; i < bar.length; i++) {
        const [v, tune] = bar[i];
        if (v > 0) drumHit(t0 + i * PASSO, base * v, tune);
      }
      const durBar = bar.length * PASSO;
      if (nivel >= 3) {
        setTimeout(marchaTick, durBar * 1000); // a coluna desfila sem parar
      } else {
        setTimeout(marchaTick, durBar * (2 + Math.random()) * 1000); // um bar de marcha, 2-3 de espera
      }
    };
    setTimeout(marchaTick, 5000);

    // a voz do acervo: O CANTO FÚNEBRE — a melodia da referência (dirge
    // lead: FRASES curtas de contorno descendente, os passos do
    // carcereiro — não nota avulsa segurada). A voz é a de sempre
    // (triângulo + saw desafinada: um coro de uma coisa só, vibrato
    // lento, lowpass 900 — a voz fala no meio, o eco afunda por ele),
    // agora nota por nota: 1.24 s por nota = DOIS passos da marcha, o
    // canto anda junto quando a coluna desfila. Nivel 2: a frase vem
    // rara e baixa (o presságio do canto); no 3, o canto chega inteiro.
    // ELA caça perto: o canto cala
    const vozG = AC.createGain();
    vozG.gain.value = 0.9;
    vozG.connect(ambGain);
    ambNodes.push(vozG);
    const CANTOS = [
      [57, 55, 53, 50], // A3 G3 F3 D3: a descida fúnebre
      [62, 60, 57, 55], // D4 C4 A3 G3
      [50, 53, 57, 58], // D3 F3 A3 Bb3: a pergunta que não resolve
      [65, 62, 57, 53], // F4 D4 A3 F3
    ];
    const NOTA = 1.24; // dois passos da marcha
    let lastCanto = -1;
    const vozNota = (t, m, v) => {
      const f = mf(m);
      const o = AC.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const o2 = AC.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = f * 1.003; // a voz é dupla e desafina
      const lp = AC.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 0.7;
      const vib = AC.createOscillator();
      vib.frequency.value = 3.2 + Math.random() * 0.6; // vibrato lento: a voz balança, não treme
      const vibG = AC.createGain();
      vibG.gain.value = 8;
      vib.connect(vibG);
      vibG.connect(o.detune);
      vibG.connect(o2.detune);
      const dur = NOTA * 0.98;
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.18); // a nota incha do fundo
      g.gain.setValueAtTime(v, t + dur - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      o2.connect(g);
      g.connect(lp);
      lp.connect(vozG);
      lp.connect(eco); // a voz manda o corpo inteiro pro eco: a caverna responde
      o.start(t);
      o2.start(t);
      vib.start(t);
      o.stop(t + dur + 0.2);
      o2.stop(t + dur + 0.2);
      vib.stop(t + dur + 0.2);
    };
    const cantoTick = () => {
      if (!alive()) return;
      if (aguardaRodando(cantoTick)) return;
      if (cacandoPerto() || nivel < 2) {
        setTimeout(cantoTick, 10000);
        return;
      }
      let ci = Math.floor(Math.random() * CANTOS.length);
      if (ci === lastCanto) ci = (ci + 1) % CANTOS.length;
      lastCanto = ci;
      const v = nivel >= 3 ? 0.03 : 0.016;
      const t0 = AC.currentTime + 0.1;
      for (let i = 0; i < CANTOS[ci].length; i++) vozNota(t0 + i * NOTA, CANTOS[ci][i], v);
      const durFrase = CANTOS[ci].length * NOTA;
      setTimeout(cantoTick, (durFrase + (nivel >= 3 ? 6 + Math.random() * 6 : 10 + Math.random() * 10)) * 1000);
    };
    setTimeout(cantoTick, 8000);

    // o maestro do build: UM degrau a cada ~55-90 s (ELA caçando, o degrau
    // espera). Cada degrau: abre o fundo do mundo, e o SURTO anuncia o
    // movimento — a massa da lenda inchando mais forte + um golpe do
    // tambor no mesmo instante
    const arcTick = () => {
      if (!alive()) return;
      if (aguardaRodando(arcTick)) return;
      if (cacandoPerto()) {
        setTimeout(arcTick, 12000); // o drama espera: a caverna prende o ar
        return;
      }
      if (nivel < 3) {
        nivel++;
        padLp.frequency.setTargetAtTime(260 + nivel * 40, AC.currentTime, 8);
        coroSwell(0.006); // o surto: a massa inchando mais forte que o normal
        if (nivel >= 2) drumHit(AC.currentTime + 0.1, 0.055); // o primeiro golpe do novo movimento
      }
      setTimeout(arcTick, nivel < 3 ? 55000 + Math.random() * 35000 : 30000);
    };
    setTimeout(arcTick, 50000 + Math.random() * 20000); // o primeiro degrau vem depois de o fundo assentar

    return { nodes: ambNodes, timers: [] }; // os schedulers se matam pelo alive()
  },
};
