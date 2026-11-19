// music/track-titulo.js — A MÚSICA DO TÍTULO: dungeon synth à antiga com
// motor de Berlin-School (referência: Cimerion, "Contresort"). Ré menor,
// 66 bpm. Receita extraída do glue (setAmbience, tema 4) sem mudar o corpo:
// o maestro (music/conductor.js) chama start() no arranque e mata tudo no
// fade. Contrato de trilha: start(ctx, buses, alive) → { nodes, timers }.
export const trackTitulo = {
  id: 'titulo',
  start(ctx, buses, alive) {
    const AC = ctx;            // o corpo da receita é o glue nome por nome
    const ambGain = buses.amb; // bus da ambiência (o mesmo de sempre)
    const ambNodes = [];       // nós vivos DESTA execução: o fade do maestro mata todos

    // Camadas, todas por scheduler irregular (nada de LFO de amplitude
    // periódico — a regra do glue vale aqui por inteiro): o drone das
    // muralhas (pad filtrado que deriva devagar na FREQUÊNCIA), o pulso de
    // Berlim (ostinato de colcheias cujo filtro e dedo nunca repetem o mesmo
    // golpe), a flauta da torre (frases esparsas com eco comprido — às vezes
    // ela nem vem), os sinos do salão e o tambor fundo. Cada camada mora num
    // BUS próprio nos ambNodes: o fade da troca de tema mata tudo junto —
    // "iniciar o jogo" fecha a boca do castelo
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const BEAT = 60 / 66;
    const STEP = BEAT / 2; // colcheia do pulso
    // relógio congelado (contexto ainda suspenso): re-agenda curto SEM tocar
    // no relógio — senão duas frases/sinos nascem no MESMO instante quando o
    // contexto finalmente abre (o seqTick não precisa: o seqNext dele cresce
    // sozinho, agendando sempre à frente)
    const aguardaRodando = (rearm) => {
      if (AC.state === 'running') return false;
      setTimeout(rearm, 300);
      return true;
    };

    // drone das muralhas: D2 + A2 + D3 — duas saws desafinadas (batimento
    // lento, o ar "não afina") sob um lowpass que deriva; o corpo respira na
    // frequência, nunca no volume
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.045, AC.currentTime, 2.2); // o castelo acorda devagar
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 380;
    padLp.Q.value = 0.6;
    for (const [f, type, v] of [[73.42, 'sawtooth', 1], [74.2, 'sawtooth', 0.8], [110, 'triangle', 0.7], [146.83, 'sine', 0.4]]) {
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
    padDrift.frequency.value = 0.025;
    const padDriftG = AC.createGain();
    padDriftG.gain.value = 110;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start();
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // o pulso de Berlim: ostinato de colcheias por dentro do Dm (D3 D4 C4 A3
    // F3 G3 A3 C4) — cada nota é uma saw num lowpass que "plucka": o corte é
    // sorteado por nota, o acento cai nos tempos fortes e o tempo humaniza
    // ±12 ms. O loop inteiro é agendado antes de soar; o bus (seqG) garante
    // que notas já agendadas morrem no fade da troca de tema
    const seqG = AC.createGain();
    seqG.gain.value = 0.85;
    seqG.connect(ambGain);
    ambNodes.push(seqG);
    const SEQ = [50, 62, 60, 57, 53, 55, 57, 60];
    let seqNext = AC.currentTime + 0.15;
    const seqTick = () => {
      if (!alive()) return;
      const t0 = Math.max(AC.currentTime + 0.08, seqNext);
      for (let k = 0; k < 8; k++) {
        const t = t0 + k * STEP + (Math.random() - 0.5) * 0.024;
        const o = AC.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mf(SEQ[k]);
        const lp = AC.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 3.2;
        lp.frequency.value = (k % 4 === 0 ? 780 : 420) + Math.random() * 360;
        const g = AC.createGain();
        const v = (k % 4 === 0 ? 0.052 : 0.028) * (0.85 + Math.random() * 0.3);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.014);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        o.connect(lp);
        lp.connect(g);
        g.connect(seqG);
        o.start(t);
        o.stop(t + 0.45);
      }
      seqNext = t0 + 8 * STEP;
      setTimeout(seqTick, (seqNext - AC.currentTime) * 1000 - 80);
    };
    seqTick();

    // a flauta da torre: frases esparsas em ré menor, voz = triângulo + sine
    // de oitava com vibrato miudo, eco comprido (a pedra devolve devagar).
    // Às vezes ela nem vem — a torre cala um bom tempo; e nunca repete a
    // mesma frase duas vezes seguidas
    const leadG = AC.createGain();
    leadG.gain.value = 0.9;
    leadG.connect(ambGain);
    ambNodes.push(leadG);
    const leadDly = AC.createDelay(1.5);
    leadDly.delayTime.value = 0.42;
    const leadFb = AC.createGain();
    leadFb.gain.value = 0.42;
    const leadWet = AC.createGain();
    leadWet.gain.value = 0.55;
    leadDly.connect(leadFb);
    leadFb.connect(leadDly);
    leadDly.connect(leadWet);
    leadWet.connect(leadG);
    ambNodes.push(leadDly, leadFb, leadWet);
    const PHRASES = [
      [[69, 1], [72, 1], [74, 1], [72, 1], [69, 1], [70, 1], [69, 4]],
      [[65, 1], [67, 1], [69, 2], [67, 1], [65, 1], [64, 1], [62, 4]],
      [[62, 1], [65, 1], [69, 2], [67, 1], [65, 1], [64, 1], [58, 1], [62, 4]],
    ];
    let lastPh = -1;
    const leadTick = () => {
      if (!alive()) return;
      if (aguardaRodando(leadTick)) return;
      if (Math.random() < 0.22) {
        setTimeout(leadTick, 6000 + Math.random() * 12000); // a torre cala
        return;
      }
      let pi = Math.floor(Math.random() * PHRASES.length);
      if (pi === lastPh) pi = (pi + 1) % PHRASES.length;
      lastPh = pi;
      let t = AC.currentTime + 0.2;
      for (const [m, b] of PHRASES[pi]) {
        const dur = b * BEAT;
        if (m !== null) {
          const o = AC.createOscillator();
          o.type = 'triangle';
          o.frequency.value = mf(m);
          const o2 = AC.createOscillator();
          o2.type = 'sine';
          o2.frequency.value = mf(m) * 2.002;
          const vib = AC.createOscillator();
          vib.frequency.value = 4.6 + Math.random() * 0.7;
          const vibG = AC.createGain();
          vibG.gain.value = 5.5; // ±5.5 cents: sopro, não sirene
          vib.connect(vibG);
          vibG.connect(o.detune);
          vibG.connect(o2.detune);
          const g = AC.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.05, t + 0.14);
          g.gain.setValueAtTime(0.05, t + dur - 0.1);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
          o.connect(g);
          o2.connect(g);
          g.connect(leadG);
          g.connect(leadDly);
          o.start(t);
          o2.start(t);
          vib.start(t);
          o.stop(t + dur + 0.4);
          o2.stop(t + dur + 0.4);
          vib.stop(t + dur + 0.4);
        }
        t += dur;
      }
      setTimeout(leadTick, (t - AC.currentTime) * 1000 + 2500 + Math.random() * 9000);
    };
    leadTick();

    // os sinos do salão e o tambor fundo: parciais inarmônicas de sino, uma
    // nota por vez, raríssimas; o salão de tronos respira um golpe grave.
    // Bus comum (hallG): o tail morre junto no fade
    const hallG = AC.createGain();
    hallG.gain.value = 1;
    hallG.connect(ambGain);
    ambNodes.push(hallG);
    const bellTick = () => {
      if (!alive()) return;
      if (aguardaRodando(bellTick)) return;
      const f = [587.33, 698.46, 880][Math.floor(Math.random() * 3)];
      const t = AC.currentTime + 0.05;
      for (const [r, v] of [[1, 0.02], [2.76, 0.008], [5.4, 0.004]]) {
        const o = AC.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * r;
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
        o.connect(g);
        g.connect(hallG);
        o.start(t);
        o.stop(t + 3);
      }
      setTimeout(bellTick, 13000 + Math.random() * 17000);
    };
    bellTick();

    const thudTick = () => {
      if (!alive()) return;
      if (aguardaRodando(thudTick)) return;
      const t = AC.currentTime + 0.05;
      const o = AC.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(62, t);
      o.frequency.exponentialRampToValueAtTime(36, t + 0.5);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.055, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g);
      g.connect(hallG);
      o.start(t);
      o.stop(t + 1.2);
      setTimeout(thudTick, 9000 + Math.random() * 13000);
    };
    thudTick();

    // a fita: chiado de fita velha bem baixo — o lo-fi que cola as camadas
    const hissBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 3), AC.sampleRate);
    const hch = hissBuf.getChannelData(0);
    for (let i = 0; i < hch.length; i++) hch[i] = Math.random() * 2 - 1;
    const hiss = AC.createBufferSource();
    hiss.buffer = hissBuf;
    hiss.loop = true;
    const hissHp = AC.createBiquadFilter();
    hissHp.type = 'highpass';
    hissHp.frequency.value = 5200;
    const hissG = AC.createGain();
    hissG.gain.value = 0.004;
    hiss.connect(hissHp);
    hissHp.connect(hissG);
    hissG.connect(ambGain);
    hiss.start();
    ambNodes.push(hiss, hissHp, hissG);

    return { nodes: ambNodes, timers: [] }; // os schedulers se matam pelo alive()
  },
};
