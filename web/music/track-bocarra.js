// music/track-bocarra.js — A MÚSICA DO ACERVO (a Bocarra Diabólica): war
// dungeon synth de TAMBORES NA FRENTE. Referência: Vikorra Doom — "From the
// Realm of Dust and Darkness" (The Ghost from Sheol, Cryo Crypt, 2024):
// <https://youtu.be/wEsuJoBKAvA?t=2020> (dentro do mix Goblin War, onde a
// faixa toca). O álbum é de guerra grimdark (a terra antiga de Sh'goria, o
// clã bárbaro, a vingança da vida passada) — e é ISSO que a bocarra é: o
// acervo é um campo de batalha antigo que a criatura recolheu (corpos ¶ e
// caveiras ¥ trazidos para o acervo), e os tambores de guerra são o dono do
// salão — não atmosfera atrás de atmosfera. ANTI-MASSA (o pedido do dono):
// só TRÊS camadas, cada uma com faixa própria e ganho discreto — os tambores
// mandonam (quase secos: eco de caverna leve só para dar o tamanho do teto),
// o drone mora BEM EMBAIXO (lowpass fechado, nunca encosta nos tambores) e
// o corno vem RARO e CURTO (frases de 2-3 notas, uma a cada ~14-26 s). Se
// cruzarem, o tambor não perde o posto: a batida é transiente, o corno é
// sopro. Nada empilha no meio-forte: quem ouve
// distingue cada peça. Tambores SEM samples (zero samples, regra do glue):
// cada batida é membrana (sine desabando 110→46 Hz) + couro (ruído em
// bandpass) + pulso de couro grave — o mesmo tempero do coração da cripta,
// gigante. Padrão por COMPASSO em scheduler (batida de war drum é pulso —
// mas o scheduler é irregular por dentro: variação de compasso, resto de
// respiro, humanização de ±22 ms e micro-drift de andamento; nada de LFO de
// amplitude periódico, a regra do glue vale). As GOTEIRAS e a RESPIRAÇÃO do
// glue seguem donas do ar (prendem quando ELA caça perto): a música mora
// fora do ping delas (0,24-1,2 kHz de pele é a faixa mais alta dos
// tambores; o corno fica lowpassado a 750 Hz). Ré menor — a tônica desce de
// andar em andar (título → térreo → masmorra → esgoto → bocarra, sempre no
// D), aqui no fundo do poço: D1+A1+D2 com a cor de Phrygia escurecida
// (Eb e Bb por dentro do Dm — a poeira e o breu do Realm of Dust).
// Contrato de trilha: start(ctx, buses, alive) → { nodes, timers }.
export const trackBocarra = {
  id: 'bocarra',
  start(ctx, buses, alive) {
    const AC = ctx;            // o corpo da receita é o glue nome por nome
    const ambGain = buses.amb; // bus da ambiência (o mesmo de sempre)
    const ambNodes = [];       // nós vivos DESTA execução: o fade do maestro mata todos

    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // relógio congelado (contexto ainda suspenso): re-agenda curto SEM tocar
    // no relógio — senão dois compassos/frases nascem no MESMO instante
    // quando o contexto finalmente abre
    const aguardaRodando = (rearm) => {
      if (AC.state === 'running') return false;
      setTimeout(rearm, 300);
      return true;
    };

    // o eco do teto PARA OS TAMBORES: delay curto (0.38 s, o tamanho da
    // caverna que o glue já usa), feedback contido (0.25 — a batida não
    // vira salamandra) e wet BAIXO (0.2): o tambor continua seco o
    // bastante para ser inteligível — o eco é o tamanho do lugar falando
    // atrás da batida, nunca na frente dela
    const ecoTam = AC.createDelay(2);
    ecoTam.delayTime.value = 0.38;
    const ecoTamFb = AC.createGain();
    ecoTamFb.gain.value = 0.25;
    const ecoTamWet = AC.createGain();
    ecoTamWet.gain.value = 0.2;
    ecoTam.connect(ecoTamFb);
    ecoTamFb.connect(ecoTam);
    ecoTam.connect(ecoTamWet);
    ecoTamWet.connect(ambGain);
    ambNodes.push(ecoTam, ecoTamFb, ecoTamWet);

    // ---- OS TAMBORES DE GUERRA (dono do salão): membrana de pele
    // esticada sobre o poço. Cada batida, sem sample nenhum:
    //   membrana — sine que DESABA (110 → 46 Hz em 0.13 s: a pele bate e
    //              o corpo afunda), decaimento gordo de 0.55 s;
    //   couro    — ruído em bandpass 320 Hz (o slap da mão na pele),
    //              morre em 0.09 s;
    //   sombra   — sine 40 Hz curtíssimo embaixo (o peso que o peito
    //              sente, não o ouvido).
    // Pico de ganho ~0.085: DOIS TRÊS vezes qualquer outra camada — é o
    // destaque que o dono pediu. O par grave da dissonância do glue
    // (82/87.3 Hz) mora NO MEIO da membrana de propósito: a batida engole
    // o desconforto, nunca o contrário
    const tamG = AC.createGain();
    tamG.gain.value = 1;
    tamG.connect(ambGain);
    tamG.connect(ecoTam); // cada batida devolve um eco de teto, discreto
    ambNodes.push(tamG);
    // buffer de ruído da pele: um só, todas as batidas leem dele
    const batidaBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 1), AC.sampleRate);
    const bch = batidaBuf.getChannelData(0);
    for (let i = 0; i < bch.length; i++) bch[i] = Math.random() * 2 - 1;
    const batida = (t, v) => {
      const mem = AC.createOscillator();
      mem.type = 'sine';
      mem.frequency.setValueAtTime(110, t);
      mem.frequency.exponentialRampToValueAtTime(46, t + 0.13);
      const memG = AC.createGain();
      memG.gain.setValueAtTime(0.0001, t);
      memG.gain.linearRampToValueAtTime(0.085 * v, t + 0.012);
      memG.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      mem.connect(memG);
      memG.connect(tamG);
      mem.start(t);
      mem.stop(t + 0.65);
      const src = AC.createBufferSource();
      src.buffer = batidaBuf;
      src.loop = true;
      const bp = AC.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 320;
      bp.Q.value = 1.1;
      const couroG = AC.createGain();
      couroG.gain.setValueAtTime(0.0001, t);
      couroG.gain.linearRampToValueAtTime(0.032 * v, t + 0.006);
      couroG.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      src.connect(bp);
      bp.connect(couroG);
      couroG.connect(tamG);
      src.start(t);
      src.stop(t + 0.15);
      const sombra = AC.createOscillator();
      sombra.type = 'sine';
      sombra.frequency.value = 40;
      const sombraG = AC.createGain();
      sombraG.gain.setValueAtTime(0.0001, t);
      sombraG.gain.linearRampToValueAtTime(0.03 * v, t + 0.02);
      sombraG.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      sombra.connect(sombraG);
      sombraG.connect(tamG);
      sombra.start(t);
      sombra.stop(t + 0.4);
    };
    // os compassos: guerra lenta (~50 bpm, batida de 1.2 s) em TRÊS
    // desenhos + respiro. [batida, força]: 1.0 = o golpe que abre o
    // compasso, ~0.35 = o eco da mão
    const COMPASSOS = [
      [[0, 1], [1, 0.35], [2, 0.9], [3, 0.4], [3.5, 0.55]], // a marcha: tam-tam-TAM
      [[0, 1], [1.5, 0.4], [2, 0.8], [3, 0.45]],            // a pressa da vanguarda
      [[0, 0.85], [2, 0.5]],                                // o pulso contido
    ];
    const BATIDA_S = 1.2;   // segunda por batida (~50 bpm)
    let lastCom = -1;
    const tamTick = () => {
      if (!alive()) return;
      if (aguardaRodando(tamTick)) return;
      const restou = Math.random() < 0.12; // o respiro: a guerra espera (raro)
      const dur = 4 * BATIDA_S;
      if (!restou) {
        let ci = Math.floor(Math.random() * COMPASSOS.length);
        if (ci === lastCom) ci = (ci + 1) % COMPASSOS.length;
        lastCom = ci;
        const t0 = AC.currentTime + 0.06;
        for (const [b, v] of COMPASSOS[ci]) {
          const t = t0 + b * BATIDA_S + (Math.random() * 2 - 1) * 0.022; // humanização: mão viva
          batida(t, v * (0.85 + Math.random() * 0.15)); // força nunca igual duas vezes
        }
      }
      setTimeout(tamTick, dur * 1000 + (Math.random() * 2 - 1) * 90); // micro-drift de andamento
    };
    setTimeout(tamTick, 900 + Math.random() * 700); // o primeiro compasso DE CARA: quem entra na bocarra ouve a guerra antes de ver o teto

    // a poeira funda: D1 + A1 + D2 — o chão do Realm of Dust, bem embaixo
    // de tudo (lowpass fechadíssimo a 190 Hz: a poeira não briga com
    // ninguém). Duas saws desafinadas (o batimento lento ~0.4 Hz é o
    // pó suspendendo) sob sine sub; ganho discreto — é chão, não muro
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.026, AC.currentTime, 2.5); // a poeira acorda junto com o primeiro compasso
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 190;
    padLp.Q.value = 0.5;
    for (const [f, type, v] of [[36.71, 'sawtooth', 1], [36.99, 'sawtooth', 0.7], [55, 'triangle', 0.5], [73.42, 'sine', 0.4]]) {
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

    // o corno da guerra antiga: RARO e CURTO — frases de 2-3 notas
    // descendentes pela cor de Phrygia escurecida (Eb e Bb por dentro do
    // Dm), voz de DUAS saws desafinadas em lowpass 750 Hz (metal velho,
    // sem brilho), ataque de sopro lento (0.5 s: o corno incha, não
    // espeta). Uma frase a cada ~14-26 s, SEMPRE curta: é um estandarte
    // passando ao longe, não um solo. Eco de teto miúdo (wet 0.25): o
    // corno toca para o acervo inteiro ouvir
    const cornoG = AC.createGain();
    cornoG.gain.value = 1;
    cornoG.connect(ambGain);
    ambNodes.push(cornoG);
    const cornoEco = AC.createGain();
    cornoEco.gain.value = 0.25;
    cornoG.connect(cornoEco);
    cornoEco.connect(ecoTam);
    ambNodes.push(cornoEco);
    const FRASES = [
      [[62, 2], [58, 1.4], [57, 2.8]], // D4 Bb3 A3: o estandarte descendo
      [[65, 1.6], [63, 1.4], [62, 2.8]], // F4 Eb4 D4: a poeira respondendo
      [[57, 1.8], [55, 1.6], [53, 1.4], [51, 3]], // A3 G3 F3 Eb3: afundando no breu
      [[62, 1.6], [60, 1.4], [57, 2.8]], // D4 C4 A3: a marcha que não volta
    ];
    let lastFr = -1;
    const cornoTick = () => {
      if (!alive()) return;
      if (aguardaRodando(cornoTick)) return;
      if (Math.random() < 0.2) {
        setTimeout(cornoTick, 9000 + Math.random() * 8000); // o corno cala (raro): o tambor fica sozinho
        return;
      }
      let fi = Math.floor(Math.random() * FRASES.length);
      if (fi === lastFr) fi = (fi + 1) % FRASES.length;
      lastFr = fi;
      let t = AC.currentTime + 0.25;
      let fim = t;
      for (const [m, dur] of FRASES[fi]) {
        const f = mf(m);
        for (const cents of [-6, 6]) {
          const o = AC.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = cents;
          const lp = AC.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 750;
          lp.Q.value = 0.6;
          const g = AC.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.016, t + 0.5); // o sopro: o corno incha
          g.gain.setValueAtTime(0.016, t + dur - 0.25);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
          o.connect(lp);
          lp.connect(g);
          g.connect(cornoG);
          o.start(t);
          o.stop(t + dur + 0.5);
        }
        fim = t + dur;
        t += dur;
      }
      setTimeout(cornoTick, (fim - AC.currentTime) * 1000 + 9000 + Math.random() * 12000);
    };
    setTimeout(cornoTick, 4000 + Math.random() * 4000); // o corno vem depois do primeiro compasso: a guerra se apresenta primeiro

    return { nodes: ambNodes, timers: [] }; // os schedulers se matam pelo alive()
  },
};
