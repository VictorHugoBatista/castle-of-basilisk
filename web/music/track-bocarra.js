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
// ao fundo) + um tambor de sine. Tudo em poucas vozes, tudo num eco
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

    // o fundo do mundo: D1 + A1 + D2 — a tônica chegando ao chão do jogo.
    // Sine sub PESADO (o fundo da Bocarra não rumina como a masmorra: é
    // um peso), lowpass fechadíssimo que o build VAI ABRINDO a degrau por
    // degrau (150 → 255 Hz: a caverna acorda com a peça)
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.03, AC.currentTime, 2.5);
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 150;
    padLp.Q.value = 0.5;
    for (const [f, type, v] of [[36.71, 'sine', 0.9], [36.71, 'sawtooth', 1], [37.05, 'sawtooth', 0.7], [55, 'triangle', 0.5], [73.42, 'sine', 0.35]]) {
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
    padDriftG.gain.value = 60;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start();
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // A CONSTRUÇÃO (o build up): nivel 0..3, um degrau a cada ~55-90 s
    // enquanto ela não caça. Cada degrau abre o fundo (+35 Hz no lowpass),
    // densifica a massa da lenda e, do 2 em diante, solta o tambor do
    // fundo. No 3, a voz do acervo entra e a peça chega no pico e SEGURA
    // (a Bocarra inteira desperta). ELA caçando perto: o degrau espera
    let nivel = 0;

    // a massa da lenda: acordes de longa forma pelo lado escuro do Dm
    // (Dm Bb Gm Am — a mesma paleta da masmorra, agora com PESO: o fundo
    // do mundo responde). Do nivel 1 em diante, com ganho crescendo por
    // degrau; no nivel 0, só o presságio (bem de vez em quando, quase
    // inaudível). Parcela da massa manda pro eco: o fundo repete de longe
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
      [38, 41, 45], // Dm: D2 F2 A2
      [34, 38, 41], // Bb: Bb1 D2 F2
      [31, 34, 38], // Gm: G1 Bb1 D2
      [33, 36, 40], // Am: A1 C2 E2
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
          g.gain.linearRampToValueAtTime(0.008 + nivel * 0.002 + extra, t + sobe);
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

    // o tambor do fundo: o CORAÇÃO GRANDE DO LUGAR — sine caindo (55→26 Hz,
    // 0.9 s de caída), seco e enorme. Só a partir do nivel 2; no 3, o dub
    // volta (a sístole de um coração que acorda). É o METRÔNOMO do pavor:
    // quanto mais fundo, mais perto
    const drumG = AC.createGain();
    drumG.gain.value = 1;
    drumG.connect(ambGain);
    ambNodes.push(drumG);
    const drumHit = (t, v) => {
      const o = AC.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(55, t);
      o.frequency.exponentialRampToValueAtTime(26, t + 0.9);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.connect(g);
      g.connect(drumG);
      o.start(t);
      o.stop(t + 1.6);
    };
    const drumTick = () => {
      if (!alive()) return;
      if (aguardaRodando(drumTick)) return;
      if (cacandoPerto() || nivel < 2) {
        setTimeout(drumTick, 6000); // o tambor espera o degrau (e espera ELA se afastar)
        return;
      }
      const t = AC.currentTime + 0.05;
      drumHit(t, 0.05);
      if (nivel >= 3) drumHit(t + 0.35, 0.03); // no pico: o dub do coração grande
      setTimeout(drumTick, (nivel >= 3 ? 9000 : 14000) + Math.random() * (nivel >= 3 ? 5000 : 8000));
    };
    setTimeout(drumTick, 5000);

    // a voz do acervo: O PICO — um canto de fundura (triângulo + saw abafada,
    // vibrato lento, nota SEGURADA por 6-9 s) subindo do fundo a cada
    // ~26-45 s, no eco grande. Só no nivel 3: a coisa do fundo tem voz
    const vozG = AC.createGain();
    vozG.gain.value = 0.9;
    vozG.connect(ambGain);
    ambNodes.push(vozG);
    const VOZES = [38, 41, 43, 45]; // D2 F2 G2 A2 — o canto não sobe: afunda
    let lastVoz = -1;
    const vozTick = () => {
      if (!alive()) return;
      if (aguardaRodando(vozTick)) return;
      if (cacandoPerto() || nivel < 3) {
        setTimeout(vozTick, 10000);
        return;
      }
      let vi = Math.floor(Math.random() * VOZES.length);
      if (vi === lastVoz) vi = (vi + 1) % VOZES.length;
      lastVoz = vi;
      const t = AC.currentTime + 0.1;
      const dur = 6 + Math.random() * 3;
      const f = mf(VOZES[vi]);
      const o = AC.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const o2 = AC.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.value = f * 1.003; // a voz é dupla e desafina: um coro de uma coisa só
      const lp = AC.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      lp.Q.value = 0.7;
      const vib = AC.createOscillator();
      vib.frequency.value = 3.2 + Math.random() * 0.6; // vibrato lento: a voz balança, não treme
      const vibG = AC.createGain();
      vibG.gain.value = 8;
      vib.connect(vibG);
      vibG.connect(o.detune);
      vibG.connect(o2.detune);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.02, t + 2.5); // a voz INCHA do fundo
      g.gain.setValueAtTime(0.02, t + dur - 1.5);
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
      setTimeout(vozTick, (dur + 20 + Math.random() * 25) * 1000);
    };
    setTimeout(vozTick, 8000);

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
        padLp.frequency.setTargetAtTime(150 + nivel * 35, AC.currentTime, 8);
        coroSwell(0.004); // o surto: a massa inchando mais forte que o normal
        if (nivel >= 2) drumHit(AC.currentTime + 0.1, 0.045); // o primeiro golpe do novo movimento
      }
      setTimeout(arcTick, nivel < 3 ? 55000 + Math.random() * 35000 : 30000);
    };
    setTimeout(arcTick, 50000 + Math.random() * 20000); // o primeiro degrau vem depois de o fundo assentar

    return { nodes: ambNodes, timers: [] }; // os schedulers se matam pelo alive()
  },
};
