// music/track-esgoto.js — A MÚSICA DOS CANAIS (o esgoto imperial): dungeon
// synth AQUÁTICO e ESTRANHO. Referência: Trollslottet — "I Forna Legender"
// (Kryptan, Cryo Crypt, 2025):
// <https://youtu.be/qJraAOi-bD8?t=409> (a faixa começa nesse ponto) — o
// MESMO Pär Boström das trilhas do térreo e da masmorra. A tese: o canal
// é um lugar de LENDA ANTIGA — a água conta o que ali afundou, e o que
// ali afundou não era coisa normal. Daí o estranho: o coro gira pela
// cor de Phrygia (Eb e Cm por dentro do Dm — a segunda menor que não
// pertence ao andar de cima), e a melodia escorrega pra nota (portamento
// líquido: cada plop de nota cai na água em vez de ser atacada).
// ECO, SEM EXAGERO: o canal é grande, mas não é catedral — delay curto
// (0.38 s), feedback contido (0.35), wet moderado (0.4). As GOTEIRAS do
// glue continuam donas do alerta (param quando ELA caça perto): a música
// mora DEBAIXO delas e fora da faixa do ping (1,1-1,8 kHz). Ré menor — a
// tônica desce de andar em andar (título → térreo → masmorra → esgoto,
// sempre no D). Contrato de trilha: start(ctx, buses, alive) → { nodes,
// timers }.
export const trackEsgoto = {
  id: 'esgoto',
  start(ctx, buses, alive) {
    const AC = ctx;            // o corpo da receita é o glue nome por nome
    const ambGain = buses.amb; // bus da ambiência (o mesmo de sempre)
    const ambNodes = [];       // nós vivos DESTA execução: o fade do maestro mata todos

    // Camadas, todas por scheduler irregular (nada de LFO de amplitude
    // periódico — a regra do glue vale aqui por inteiro): a água parada
    // (drone que deriva devagar na FREQUÊNCIA), a lenda (acordes de
    // longa forma pela cor de Phrygia), o plop (algo que cai nos canais,
    // raro) e a lenda contada (a melodia líquida, com eco moderado).
    // Cada camada mora num bus próprio nos ambNodes: o fade da troca de
    // tema mata tudo junto
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // relógio congelado (contexto ainda suspenso): re-agenda curto SEM tocar
    // no relógio — senão duas frases/plops nascem no MESMO instante quando
    // o contexto finalmente abre
    const aguardaRodando = (rearm) => {
      if (AC.state === 'running') return false;
      setTimeout(rearm, 300);
      return true;
    };

    // o eco do canal: DELAY MODERADO — o lugar é grande mas não é
    // catedral. Delay 0.38 s (o gotejar do glue usa o eco do castelo,
    // 0.17 s: as duas águas de eco não se confundem), feedback 0.35,
    // wet 0.4 — a repetição morre rápido, a lenda não fica repetindo
    const eco = AC.createDelay(2);
    eco.delayTime.value = 0.38;
    const ecoFb = AC.createGain();
    ecoFb.gain.value = 0.35;
    const ecoWet = AC.createGain();
    ecoWet.gain.value = 0.4;
    eco.connect(ecoFb);
    ecoFb.connect(eco);
    eco.connect(ecoWet);
    ecoWet.connect(ambGain);
    ambNodes.push(eco, ecoFb, ecoWet);

    // a água parada: D2 + A2 + D1 — o corpo do canal, duas saws
    // desafinadas (o batimento lento, ~0.5 Hz, é o reflexo da água
    // tremendo), sine sub embaixo; lowpass aberto de propósito (a água
    // tem mais brilho que a pedra da masmorra, mas fecha bem antes do
    // ping das goteiras)
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.028, AC.currentTime, 2); // a água parada é a primeira coisa que se ouve
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 380;
    padLp.Q.value = 0.5;
    for (const [f, type, v] of [[73.42, 'sawtooth', 1], [73.9, 'sawtooth', 0.7], [110, 'triangle', 0.5], [36.71, 'sine', 0.4]]) {
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
    padDrift.frequency.value = 0.02;
    const padDriftG = AC.createGain();
    padDriftG.gain.value = 110;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start();
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // a lenda: acordes de longa forma pela COR DE PHRYGIA — Dm, Eb, Cm,
    // Gm: a Eb é a segunda menor que não pertence a nenhum andar de cima
    // (a lenda estranha que a água conta), o coro gira por ela sem
    // resolver. Dois coros desafinados por nota; cada acorde incha em
    // 5-8 s e se dissolve em 6-9 s, um a cada ~20-32 s. Uma parcela
    // miúda do acorde manda para o eco: a lenda repete na água
    const coroG = AC.createGain();
    coroG.gain.value = 0.9;
    coroG.connect(ambGain);
    ambNodes.push(coroG);
    const coroEco = AC.createGain();
    coroEco.gain.value = 0.15; // o eco da lenda é mudo de propósito: só um brilho
    coroG.connect(coroEco);
    coroEco.connect(eco);
    ambNodes.push(coroEco);
    const COROS = [
      [50, 53, 57], // Dm: D3 F3 A3
      [51, 55, 58], // Eb: Eb3 G3 Bb3 — a lenda estranha
      [48, 51, 55], // Cm: C3 Eb3 G3
      [43, 46, 50], // Gm: G2 Bb2 D3
    ];
    let lastCoro = -1;
    const coroTick = () => {
      if (!alive()) return;
      if (aguardaRodando(coroTick)) return;
      let ci = Math.floor(Math.random() * COROS.length);
      if (ci === lastCoro) ci = (ci + 1) % COROS.length;
      lastCoro = ci;
      const t = AC.currentTime + 0.1;
      const sobe = 5 + Math.random() * 3;   // inchaço: 5-8 s
      const desce = 6 + Math.random() * 3;  // dissolução: 6-9 s
      const dur = sobe + desce;
      for (const m of COROS[ci]) {
        for (const cents of [-3.5, 3.5]) {
          const o = AC.createOscillator();
          o.type = 'triangle';
          o.frequency.value = mf(m);
          o.detune.value = cents;
          const g = AC.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.009, t + sobe);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(g);
          g.connect(coroG);
          o.start(t);
          o.stop(t + dur + 0.3);
        }
      }
      setTimeout(coroTick, (dur + 4 + Math.random() * 5) * 1000);
    };
    setTimeout(coroTick, 1200 + Math.random() * 1800); // o primeiro acorde DE CARA

    // o plop: ALGO CAIU NOS CANAIS — um golpe de sine caindo duas oitavas
    // (260→70 Hz) com um respingo de ruído lowpass junto; raro (a cada
    // ~18-40 s) e discreto. O par grave do ping das goteiras: o que cai
    // por cima é água, o que cai aqui embaixo não se sabe
    const plopG = AC.createGain();
    plopG.gain.value = 1;
    plopG.connect(ambGain);
    ambNodes.push(plopG);
    const plopBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 2), AC.sampleRate);
    const pch = plopBuf.getChannelData(0);
    for (let i = 0; i < pch.length; i++) pch[i] = Math.random() * 2 - 1;
    const plopTick = () => {
      if (!alive()) return;
      if (aguardaRodando(plopTick)) return;
      const t = AC.currentTime + 0.05;
      const o = AC.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(260, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.016, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g);
      g.connect(plopG);
      g.connect(eco); // o plop repete na água uma vez e morre
      o.start(t);
      o.stop(t + 0.7);
      const src = AC.createBufferSource();
      src.buffer = plopBuf;
      src.loop = true;
      const lp = AC.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g2 = AC.createGain();
      g2.gain.setValueAtTime(0.0001, t + 0.03);
      g2.gain.linearRampToValueAtTime(0.008, t + 0.06);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      src.connect(lp);
      lp.connect(g2);
      g2.connect(plopG);
      src.start(t);
      src.stop(t + 0.4);
      setTimeout(plopTick, 18000 + Math.random() * 22000);
    };
    setTimeout(plopTick, 8000 + Math.random() * 10000); // o primeiro plop: cedo o bastante para o ouvido perguntar

    // a lenda contada: a MELANCOLIA líquida — frases de 4-6 notas em Dm
    // pintadas de Eb (a segunda menor estranha), voz de triângulo + sine
    // de oitava com vibrato miúdo; cada nota ESCORREGA pra afinada (o
    // portamento líquido: a nota plopá na água em vez de ser atacada) e
    // manda pro eco do canal. Frases curtas, chegam de cara e voltam
    // sempre — quem entra nos canais sai cantando a lenda
    const leadG = AC.createGain();
    leadG.gain.value = 0.9;
    leadG.connect(ambGain);
    ambNodes.push(leadG);
    const FRASES = [
      [[62, 1.2], [63, 1], [65, 1.6], [64, 1.2], [62, 3.2]], // D4 Eb4 F4 E4 D4: a volta pela segunda estranha
      [[57, 1.4], [60, 1], [63, 1.4], [62, 3.4]],            // A3 C4 Eb4 D4: a Eb resolvendo fundo
      [[65, 1.2], [63, 1], [62, 1.4], [58, 1.2], [57, 3.4]], // F4 Eb4 D4 Bb3 A3: a lenda afundando
      [[74, 1.4], [72, 1], [70, 1.4], [69, 3.2]],            // D5 C5 Bb4 A4: a frase alta, rara
    ];
    let lastFr = -1;
    const leadTick = () => {
      if (!alive()) return;
      if (aguardaRodando(leadTick)) return;
      if (Math.random() < 0.15) {
        setTimeout(leadTick, 4000 + Math.random() * 5000); // o canal cala (raro)
        return;
      }
      let fi = Math.floor(Math.random() * FRASES.length);
      if (fi === lastFr) fi = (fi + 1) % FRASES.length;
      lastFr = fi;
      let t = AC.currentTime + 0.2;
      for (const [m, dur] of FRASES[fi]) {
        const f = mf(m);
        const o = AC.createOscillator();
        o.type = 'triangle';
        // o portamento líquido: a nota nasce 8% abaixo e ESCORREGA pra
        // afinada — plopá na água em vez de ser atacada
        o.frequency.setValueAtTime(f * 0.92, t);
        o.frequency.setTargetAtTime(f, t, 0.12);
        const o2 = AC.createOscillator();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(f * 2.002 * 0.92, t);
        o2.frequency.setTargetAtTime(f * 2.002, t, 0.12);
        const vib = AC.createOscillator();
        vib.frequency.value = 4.6 + Math.random() * 0.7;
        const vibG = AC.createGain();
        vibG.gain.value = 5.5; // ±5.5 cents: sopro, não sirene
        vib.connect(vibG);
        vibG.connect(o.detune);
        vibG.connect(o2.detune);
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.04, t + 0.12); // ataque curto: é plim, não sopro
        g.gain.setValueAtTime(0.04, t + dur - 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
        o.connect(g);
        o2.connect(g);
        g.connect(leadG);
        g.connect(eco); // o eco aqui é o pedido: a lenda repete na água
        o.start(t);
        o2.start(t);
        vib.start(t);
        o.stop(t + dur + 0.6);
        o2.stop(t + dur + 0.6);
        vib.stop(t + dur + 0.6);
        t += dur;
      }
      setTimeout(leadTick, (t - AC.currentTime) * 1000 + 1500 + Math.random() * 4500);
    };
    setTimeout(leadTick, 1500 + Math.random() * 1500); // a lenda está lá quando a porta fecha

    return { nodes: ambNodes, timers: [] }; // os schedulers se matam pelo alive()
  },
};
